import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityDocumentDetail } from "../../api/types/quality";

function parseApiError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const msg = err.message;
  try {
    const parsed = JSON.parse(msg) as { message?: string; title?: string; detail?: string };
    return parsed.detail || parsed.message || parsed.title || msg;
  } catch {
    return msg;
  }
}

export function QualityDocumentDetailPage() {
  const { code = "" } = useParams();
  const [data, setData] = useState<QualityDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [targetVersion, setTargetVersion] = useState<number | null>(null);
  const [changeSummary, setChangeSummary] = useState("");
  const [reviewedBy, setReviewedBy] = useState("Leonel Alfonso");

  const reload = useCallback(() => {
    if (!code) return;
    setLoading(true);
    api.getQualityDocument(code)
      .then((detail) => {
        setData(detail);
        const current = detail.versions.find((v) => v.id === detail.document.currentVersionId)
          ?? detail.versions[detail.versions.length - 1];
        if (current) setTargetVersion(current.version);
      })
      .catch((err) => setError(parseApiError(err)))
      .finally(() => setLoading(false));
  }, [code]);

  useEffect(() => {
    reload();
  }, [reload]);

  const selected = data?.versions.find((v) => v.version === targetVersion)
    ?? data?.versions.find((v) => v.id === data.document.currentVersionId)
    ?? data?.versions[0];

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    setActionMsg(null);
    try {
      await fn();
      setActionMsg(label);
      reload();
    } catch (err) {
      setActionError(parseApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (fileId: string, mode: "open" | "download", okMsg: string) => {
    setBusy(true);
    setActionError(null);
    setActionMsg(null);
    try {
      await api.openQualityFile(fileId, mode);
      setActionMsg(okMsg);
    } catch (err) {
      setActionError(parseApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File | null, role: "Published" | "Source") => {
    if (!file || !code || !selected) return;
    if (role === "Published" && !file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setActionError("El archivo publicado debe ser PDF.");
      return;
    }
    await run(`Archivo ${role} adjunto a v${selected.version}.`, async () => {
      const uploaded = await api.uploadQualityFile(file, role);
      await api.attachQualityFile(code, selected.version, { fileId: uploaded.id, role });
    });
  };

  const onApprove = async () => {
    if (!code || !selected) return;
    await run(`Versión v${selected.version} aprobada.`, async () => {
      await api.approveQualityVersion(code, selected.version, {
        reviewedBy: reviewedBy.trim() || undefined
      });
    });
  };

  const onNewVersion = async () => {
    if (!code) return;
    await run("Nueva versión creada en borrador.", async () => {
      const created = await api.createQualityVersion(code, {
        changeSummary: changeSummary.trim() || "Nueva versión",
        elaboratedBy: ""
      });
      setTargetVersion(created.version);
      setChangeSummary("");
    });
  };

  if (loading && !data) return <div className="workspace-page pad">Cargando {code}…</div>;
  if (error) return <div className="workspace-page pad" style={{ color: "#b91c1c" }}>{error}</div>;
  if (!data) return null;

  const d = data.document;
  const published = data.versions.find((v) => v.id === d.currentVersionId);

  return (
    <div className="workspace-page pad">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Link to="/calidad/documentos" style={{ fontSize: 13 }}>← Árbol documental</Link>
          <h1 style={{ margin: "8px 0 0" }}>{d.displayCode} · {d.title}</h1>
          <p style={{ color: "#64748b", marginTop: 6 }}>
            {d.type} · {d.status}
            {d.recordKind ? ` · ${d.recordKind}` : ""}
            {d.iso17025Clauses ? ` · ISO ${d.iso17025Clauses}` : ""}
          </p>
          {d.code === "MC01-R01" && (
            <p style={{ marginTop: 8 }}>
              <Link className="btn btn-outline" to="/calidad/registros/mc01-r01">
                Abrir registro de instancias firmadas
              </Link>
            </p>
          )}
        </div>
        {published?.publishedFileId && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void openFile(published.publishedFileId!, "open", "PDF abierto.")}
          >
            Descargar PDF (copia no controlada)
          </button>
        )}
      </div>

      {(actionMsg || actionError) && (
        <div
          className="card pad"
          style={{
            marginTop: 12,
            background: actionError ? "#fef2f2" : "#f0fdf4",
            color: actionError ? "#991b1b" : "#166534"
          }}
        >
          {actionError || actionMsg}
        </div>
      )}

      <div className="card pad" style={{ marginTop: 16 }}>
        <h3>Gestión de versión</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginTop: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            Versión
            <select
              value={selected?.version ?? ""}
              onChange={(e) => setTargetVersion(Number(e.target.value))}
              disabled={busy}
            >
              {data.versions.map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version} · {v.status}{v.publishedFileId ? " · PDF" : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            PDF publicado
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy || !selected}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onUpload(file, "Published");
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            Fuente (.docx / .xlsx)
            <input
              type="file"
              accept=".doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={busy || !selected}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onUpload(file, "Source");
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            Revisor (aprobación)
            <input
              value={reviewedBy}
              onChange={(e) => setReviewedBy(e.target.value)}
              disabled={busy}
              placeholder="Nombre del revisor"
            />
          </label>

          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !selected || (!selected.publishedFileId && d.type !== "External")}
            onClick={() => void onApprove()}
            title={!selected?.publishedFileId ? "Requiere PDF publicado" : "Requiere Director Técnico"}
          >
            Aprobar v{selected?.version ?? "—"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginTop: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, flex: 1, minWidth: 220 }}>
            Resumen de cambio (nueva versión)
            <input
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              disabled={busy}
              placeholder="Ej. Actualización por Res. 25/2025"
            />
          </label>
          <button type="button" className="btn" disabled={busy} onClick={() => void onNewVersion()}>
            Nueva versión (borrador)
          </button>
        </div>

        {selected && (
          <p style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>
            Seleccionada: v{selected.version} · {selected.status}
            {selected.publishedFileId ? " · tiene PDF" : " · sin PDF"}
            {selected.sourceFileId ? " · tiene fuente" : ""}
            {" · "}Elaboró {selected.elaboratedBy || "—"} / Revisó {selected.reviewedBy || "—"}
          </p>
        )}
      </div>

      <div className="card pad" style={{ marginTop: 16 }}>
        <h3>Versiones</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Versión</th>
                <th>Estado</th>
                <th>Elaboró</th>
                <th>Revisó</th>
                <th>Aprobó</th>
                <th>Vigencia</th>
                <th>PDF</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.id}>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: "2px 8px" }}
                      onClick={() => setTargetVersion(v.version)}
                    >
                      v{v.version}
                    </button>
                  </td>
                  <td>{v.status}</td>
                  <td>{v.elaboratedBy || "—"}{v.elaboratedAt ? ` (${new Date(v.elaboratedAt).toLocaleDateString("es-AR")})` : ""}</td>
                  <td>{v.reviewedBy || "—"}</td>
                  <td>{v.approvedBy || "—"}</td>
                  <td>{v.effectiveFrom ? new Date(v.effectiveFrom).toLocaleDateString("es-AR") : "—"}</td>
                  <td>
                    {v.publishedFileId ? (
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: "2px 8px" }}
                        disabled={busy}
                        onClick={() => void openFile(v.publishedFileId!, "open", "PDF abierto.")}
                      >
                        PDF
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>Sin publicar</span>
                    )}
                  </td>
                  <td>
                    {v.sourceFileId ? (
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: "2px 8px" }}
                        disabled={busy}
                        onClick={() => void openFile(v.sourceFileId!, "download", "Fuente descargada.")}
                      >
                        Fuente
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.children.length > 0 && (
        <div className="card pad" style={{ marginTop: 16 }}>
          <h3>Registros asociados</h3>
          <ul>
            {data.children.map((c) => (
              <li key={c.id}>
                <Link to={`/calidad/documentos/${encodeURIComponent(c.code)}`}>
                  {c.displayCode} — {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
