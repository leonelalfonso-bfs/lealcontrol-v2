#!/usr/bin/env python3
"""Quality seed C1: input/ → LibreOffice PDF → API /api/v1/quality."""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
INPUT_DIR = ROOT / "input"
OUTPUT_DIR = ROOT / "output"
CONVERTIBLE = {".doc", ".docx", ".xls", ".xlsx", ".odt", ".ods", ".rtf"}


def env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name, default)
    return value.strip() if value else default


def normalize_code(code: str) -> str:
    return "".join(ch for ch in code.strip().upper() if not ch.isspace()).replace("_", "-")


def find_input_file(file_name: str) -> Path | None:
    direct = INPUT_DIR / file_name
    if direct.is_file():
        return direct
    matches = list(INPUT_DIR.rglob(file_name))
    return matches[0] if matches else None


def list_input_files() -> set[str]:
    if not INPUT_DIR.exists():
        return set()
    return {p.name for p in INPUT_DIR.rglob("*") if p.is_file()}


def soffice_bin() -> str | None:
    for candidate in ("soffice", "libreoffice"):
        path = shutil.which(candidate)
        if path:
            return path
    return None


def convert_to_pdf(source: Path) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_pdf = OUTPUT_DIR / f"{source.stem}.pdf"
    if out_pdf.is_file() and out_pdf.stat().st_mtime >= source.stat().st_mtime:
        return out_pdf

    binary = soffice_bin()
    if not binary:
        raise RuntimeError(
            "LibreOffice no encontrado (soffice/libreoffice). Instalar o colocar el PDF en output/."
        )

    cmd = [
        binary,
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        str(OUTPUT_DIR),
        str(source),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not out_pdf.is_file():
        raise RuntimeError(
            f"Conversión falló para {source.name}: rc={proc.returncode}\n{proc.stderr or proc.stdout}"
        )
    return out_pdf


class ApiClient:
    def __init__(self, base: str, token: str, tenant: str) -> None:
        self.base = base.rstrip("/")
        self.token = token
        self.tenant = tenant

    def _headers(self, content_type: str | None = "application/json") -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Tenant-Id": self.tenant,
        }
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def request_json(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        allow_404: bool = False,
    ) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            headers=self._headers(),
            method=method,
        )
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            if allow_404 and exc.code == 404:
                return None
            raise RuntimeError(f"{method} {path} → {exc.code}: {text}") from exc

    def upload_file(self, path: Path, role: str) -> dict[str, Any]:
        boundary = f"----QualitySeed{os.getpid()}{int(datetime.now(tz=timezone.utc).timestamp())}"
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        file_bytes = path.read_bytes()
        body = bytearray()
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'.encode()
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
        body.extend(file_bytes)
        body.extend(b"\r\n")
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(b'Content-Disposition: form-data; name="role"\r\n\r\n')
        body.extend(role.encode())
        body.extend(b"\r\n")
        body.extend(f"--{boundary}--\r\n".encode())

        req = urllib.request.Request(
            f"{self.base}/api/v1/quality/files",
            data=bytes(body),
            headers=self._headers(f"multipart/form-data; boundary={boundary}"),
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"POST /files → {exc.code}: {text}") from exc


def build_extra_discrepancies(
    mapping_files: list[dict[str, Any]],
    input_names: set[str],
    catalog_codes: set[str] | None,
) -> list[str]:
    lines: list[str] = []
    mapped_names = {item.get("fileName") for item in mapping_files if item.get("fileName")}
    mapped_codes = {
        normalize_code(item["code"])
        for item in mapping_files
        if item.get("code") and not item.get("generated")
    }

    orphans = sorted(n for n in input_names if n not in mapped_names and not n.startswith("."))
    for name in orphans:
        lines.append(f"- HUÉRFANO en input/ (sin entrada mapping): `{name}`")

    if catalog_codes is not None:
        for code in sorted(catalog_codes - mapped_codes):
            lines.append(f"- CATÁLOGO sin mapping: `{code}`")

    return lines


def write_report(path: Path, lines: list[str], summary: dict[str, int]) -> None:
    now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    parts = [
        "# Discrepancias quality-seed",
        "",
        f"Generado: {now}",
        "",
        "## Resumen",
        "",
        f"- Entradas mapping: {summary['mapped']}",
        f"- Listos para subir: {summary['ready']}",
        f"- Missing (Drive): {summary['missing']}",
        f"- Generated (skip): {summary['generated']}",
        f"- Sin archivo local: {summary['no_file']}",
        f"- Subidos OK: {summary['uploaded']}",
        f"- Omitidos (ya tenían PDF): {summary['skipped']}",
        f"- Errores: {summary['errors']}",
        "",
        "## Detalle",
        "",
    ]
    if lines:
        parts.extend(lines)
    else:
        parts.append("- (sin discrepancias)")
    parts.append("")
    path.write_text("\n".join(parts), encoding="utf-8")


def process_item(
    client: ApiClient,
    item: dict[str, Any],
    signatures: dict[str, Any],
    *,
    approve: bool,
) -> str:
    code = normalize_code(item["code"])
    version = int(item.get("version") or 1)
    file_name = item["fileName"]
    source_path = find_input_file(file_name)
    if source_path is None:
        raise FileNotFoundError(file_name)

    detail = client.request_json("GET", f"/api/v1/quality/documents/{code}", allow_404=True)
    if detail is None:
        raise RuntimeError(f"Documento {code} no existe en el catálogo (correr dashboard/tree primero).")

    versions = detail.get("versions") or []
    ver = next((v for v in versions if int(v.get("version", 0)) == version), None)
    if ver is None:
        raise RuntimeError(f"Versión {version} de {code} no existe.")

    if ver.get("publishedFileId"):
        return "skipped"

    ext = source_path.suffix.lower()
    if ext == ".pdf":
        pdf_path = source_path
        source_upload = None
    else:
        source_upload = source_path
        if ext in CONVERTIBLE:
            pdf_path = convert_to_pdf(source_path)
        else:
            raise RuntimeError(f"Extensión no convertible a PDF: {ext} ({source_path.name})")

    if source_upload is not None:
        source_meta = client.upload_file(source_upload, "Source")
        client.request_json(
            "POST",
            f"/api/v1/quality/documents/{code}/versions/{version}/attach",
            {"fileId": source_meta["id"], "role": "Source"},
        )

    published_meta = client.upload_file(pdf_path, "Published")
    client.request_json(
        "POST",
        f"/api/v1/quality/documents/{code}/versions/{version}/attach",
        {"fileId": published_meta["id"], "role": "Published"},
    )

    signed_at = signatures.get("signedAt") or "2026-07-10T00:00:00Z"
    client.request_json(
        "PATCH",
        f"/api/v1/quality/documents/{code}/versions/{version}",
        {
            "elaboratedBy": signatures.get("elaboratedBy") or "Laura Delissi",
            "elaboratedAt": signed_at,
            "reviewedBy": signatures.get("reviewedBy") or "Leonel Alfonso",
            "reviewedAt": signed_at,
            "changeSummary": "Origen — carga inicial SGC INMELA (quality-seed)",
        },
    )

    if approve:
        try:
            client.request_json(
                "POST",
                f"/api/v1/quality/documents/{code}/versions/{version}/approve",
                {
                    "approvedBy": signatures.get("approvedBy") or "Javier Coppini",
                    "approvedAt": signed_at,
                    "reviewedBy": signatures.get("reviewedBy") or "Leonel Alfonso",
                },
            )
        except RuntimeError as exc:
            # Puede fallar si el token no es DT; el PDF ya quedó adjunto.
            print(f"  ! approve {code} v{version}: {exc}", file=sys.stderr)

    return "uploaded"


def main() -> int:
    parser = argparse.ArgumentParser(description="Quality seed (input/ → PDF → API)")
    parser.add_argument("--dry-run", action="store_true", help="Solo mapping y discrepancias")
    parser.add_argument("--mapping", default=str(ROOT / "mapping.json"))
    parser.add_argument("--approve", action="store_true", help="Intentar approve (requiere DT)")
    parser.add_argument("--codes", default="", help="Filtrar códigos separados por coma")
    args = parser.parse_args()

    mapping = json.loads(Path(args.mapping).read_text(encoding="utf-8"))
    files: list[dict[str, Any]] = mapping.get("files") or []
    signatures = mapping.get("defaultSignatures") or {}
    code_filter = {normalize_code(c) for c in args.codes.split(",") if c.strip()}

    input_names = list_input_files()
    summary = {
        "mapped": len(files),
        "ready": 0,
        "missing": 0,
        "generated": 0,
        "no_file": 0,
        "uploaded": 0,
        "skipped": 0,
        "errors": 0,
    }
    discrepancy_lines: list[str] = []

    catalog_codes: set[str] | None = None
    client: ApiClient | None = None
    if not args.dry_run:
        api = env("QUALITY_SEED_API")
        token = env("QUALITY_SEED_TOKEN")
        tenant = env("QUALITY_SEED_TENANT")
        if not api or not token or not tenant:
            print(
                "Faltan QUALITY_SEED_API / QUALITY_SEED_TOKEN / QUALITY_SEED_TENANT",
                file=sys.stderr,
            )
            return 2
        client = ApiClient(api, token, tenant)
        # Fuerza seed de catálogo
        client.request_json("GET", "/api/v1/quality/dashboard")
        tree = client.request_json("GET", "/api/v1/quality/documents/tree") or []

        def walk(nodes: list[Any], acc: set[str]) -> None:
            for node in nodes:
                if isinstance(node, dict):
                    if node.get("code"):
                        acc.add(normalize_code(node["code"]))
                    children = node.get("children") or []
                    if isinstance(children, list):
                        walk(children, acc)

        catalog_codes = set()
        walk(tree if isinstance(tree, list) else [], catalog_codes)

    for item in files:
        code = normalize_code(item.get("code") or "")
        if code_filter and code not in code_filter:
            continue
        if item.get("generated"):
            summary["generated"] += 1
            continue
        if item.get("missing"):
            summary["missing"] += 1
            discrepancy_lines.append(
                f"- MISSING Drive: `{code}` ← `{item.get('fileName')}`"
            )
            continue

        name = item.get("fileName") or ""
        local = find_input_file(name)
        if local is None:
            summary["no_file"] += 1
            discrepancy_lines.append(f"- SIN ARCHIVO en input/: `{code}` ← `{name}`")
            continue

        summary["ready"] += 1
        print(f"  · {code} v{item.get('version', 1)} ← {local.relative_to(ROOT)}")

        if args.dry_run or client is None:
            continue

        try:
            result = process_item(client, item, signatures, approve=args.approve)
            if result == "skipped":
                summary["skipped"] += 1
                print(f"    skip (ya tiene PDF)")
            else:
                summary["uploaded"] += 1
                print(f"    ok")
        except Exception as exc:  # noqa: BLE001 — reporte por ítem
            summary["errors"] += 1
            msg = f"- ERROR `{code}`: {exc}"
            discrepancy_lines.append(msg)
            print(f"    ERROR: {exc}", file=sys.stderr)

    discrepancy_lines.extend(
        build_extra_discrepancies(files, input_names, catalog_codes)
    )
    discrepancy_lines = list(dict.fromkeys(discrepancy_lines))

    report_path = ROOT / "discrepancies-report.md"
    write_report(report_path, discrepancy_lines, summary)
    print(f"\nmapping: {summary['mapped']} | ready: {summary['ready']} | missing: {summary['missing']}")
    print(f"reporte: {report_path}")
    if args.dry_run:
        print("dry-run: no se subió nada.")
    return 0 if summary["errors"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
