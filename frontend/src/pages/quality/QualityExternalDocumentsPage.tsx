import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityExternalDocumentList, QualityExternalDocumentRow } from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";
import { labelOf, QUALITY_DOC_STATUS } from "./qualityLabels";

export function qualityExternalError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  try {
    const body = JSON.parse(message) as { message?: string; detail?: string; title?: string };
    return body.message || body.detail || body.title || message;
  } catch { return message; }
}

function validatePdf(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("El documento original debe ser PDF.");
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Seleccioná un PDF de hasta 20 MB, no vacío.");
}

export function QualityPg01R02Page() {
  const [data, setData] = useState<QualityExternalDocumentList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<QualityExternalDocumentRow | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [url, setUrl] = useState("");
  const [reviewMonths, setReviewMonths] = useState(12);
  const [original, setOriginal] = useState<File | null>(null);
  const reload = useCallback(async () => setData(await api.getQualityDocumentListPg01R02()), []);

  useEffect(() => { void reload().catch(err => setError(qualityExternalError(err))); }, [reload]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    let createdCode: string | null = null;
    try {
      if (original) validatePdf(original);
      const created = await api.createQualityDocument({
        code: code.trim(), title: name.trim(), type: "External",
        externalSource: source.trim() || undefined, externalUrl: url.trim() || undefined,
        reviewPeriodMonths: reviewMonths, changeSummary: "Alta de documento externo desde PG01-R02"
      });
      createdCode = created.code;
      // Close/reset once created, so a failed upload can be retried from the row without duplicate creation.
      setShowForm(false); setCode(""); setName(""); setSource(""); setUrl(""); setReviewMonths(12); setOriginal(null);
      if (original) await api.uploadQualityExternalOriginal(created.code, original);
      setMessage("Documento agregado en borrador. Podés gestionar su revisión y aprobación desde su ficha.");
    } catch (err) {
      setError(createdCode
        ? `El documento ${createdCode} fue creado, pero no se adjuntó el PDF: ${qualityExternalError(err)}. Reintentá con «Cargar PDF» en su fila.`
        : qualityExternalError(err));
    } finally {
      if (createdCode) await reload().catch(err => setError(`Documento creado. No se pudo actualizar el listado: ${qualityExternalError(err)}`));
      setBusy(false);
    }
  };

  const upload = async (row: QualityExternalDocumentRow, file: File) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      validatePdf(file);
      await api.uploadQualityExternalOriginal(row.code, file);
      setMessage(`PDF original de ${row.codigo} guardado.`);
      await reload();
    } catch (err) { setError(qualityExternalError(err)); }
    finally { setBusy(false); }
  };

  const download = async (row: QualityExternalDocumentRow) => {
    if (!row.originalFileId) return;
    setBusy(true); setError(null);
    try { await api.openQualityFile(row.originalFileId, "download"); }
    catch (err) { setError(qualityExternalError(err)); }
    finally { setBusy(false); }
  };

  const exportExcel = async () => {
    const columns: ExcelColumn<QualityExternalDocumentRow>[] = [
      { key: "codigo", header: "Código" }, { key: "nombre", header: "Nombre" },
      { key: "organismo", header: "Organismo" }, { key: "url", header: "URL" },
      { key: "proximaRevision", header: "Próxima revisión", value: r => r.proximaRevision ? excelDate(r.proximaRevision) : "" },
      { key: "estado", header: "Estado", value: r => labelOf(QUALITY_DOC_STATUS, r.estado) },
      { key: "originalFileName", header: "PDF original" }
    ];
    setBusy(true); setError(null);
    try { await exportToExcel("PG01-R02_documentos_externos", data?.rows ?? [], columns); }
    catch (err) { setError(qualityExternalError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <Link to="/calidad/documentos">← Documentos</Link>
          <h1 style={{ marginTop: 8 }}>PG01-R02 · Lista de documentos externos</h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" disabled={busy || !data} onClick={() => setShowForm(true)}>Nuevo documento</button>
          <Link className="btn btn-outline" to="/calidad/registros/pg01-r02/pdf">Exportar PDF</Link>
          <button type="button" className="btn btn-outline" disabled={busy || !data?.rows.length} onClick={() => void exportExcel()}>Exportar Excel</button>
        </div>
      </div>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {message && <p role="status" style={{ color: "#166534" }}>{message}</p>}
      {showForm && (
        <form className="card pad" onSubmit={event => void create(event)} style={{ marginTop: 12 }}>
          <h2>Nuevo documento externo</h2>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <label>Código<input required maxLength={32} value={code} onChange={e => setCode(e.target.value)} placeholder="Ej. EXT-001" style={{ display: "block", width: "100%" }} /></label>
            <label>Nombre<input required maxLength={240} value={name} onChange={e => setName(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
            <label>Organismo<input maxLength={240} value={source} onChange={e => setSource(e.target.value)} style={{ display: "block", width: "100%" }} /></label>
            <label>URL de referencia<input maxLength={500} type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" style={{ display: "block", width: "100%" }} /></label>
            <label>Revisar cada (meses)<input type="number" min={1} max={120} required value={reviewMonths} onChange={e => setReviewMonths(Number(e.target.value))} style={{ display: "block", width: "100%" }} /></label>
            <label>PDF original (opcional, hasta 20 MB)<input type="file" accept=".pdf,application/pdf" onChange={e => setOriginal(e.target.files?.[0] ?? null)} style={{ display: "block", width: "100%" }} /></label>
          </fieldset>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={busy || !code.trim() || !name.trim()}>{busy ? "Guardando…" : "Guardar documento"}</button>
            <button className="btn btn-outline" type="button" disabled={busy} onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <input ref={uploadInput} type="file" accept=".pdf,application/pdf" hidden onChange={e => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (file && uploadTarget) void upload(uploadTarget, file);
      }} />
      {!data && !error && <p>Cargando documentos…</p>}
      <div className="table-wrap card pad" style={{ marginTop: 12 }}>
        <table className="table">
          <thead><tr><th>Código</th><th>Nombre</th><th>Organismo</th><th>URL</th><th>Próxima revisión</th><th>Estado</th><th>PDF original</th></tr></thead>
          <tbody>
            {data?.rows.map(row => (
              <tr key={row.id}>
                <td><Link to={`/calidad/documentos/${encodeURIComponent(row.code)}`}>{row.codigo}</Link></td>
                <td>{row.nombre}</td><td>{row.organismo || "—"}</td>
                <td>{row.url && /^https?:\/\//i.test(row.url) ? <a href={row.url} target="_blank" rel="noreferrer">Fuente</a> : row.url || "—"}</td>
                <td>{row.proximaRevision ? new Date(row.proximaRevision).toLocaleDateString("es-AR") : "—"}</td>
                <td>{labelOf(QUALITY_DOC_STATUS, row.estado)}</td>
                <td>
                  {row.originalFileId && <button type="button" className="btn btn-outline" disabled={busy} title={row.originalFileName || undefined} onClick={() => void download(row)}>Descargar PDF</button>}
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => {
                    setUploadTarget(row); uploadInput.current?.click();
                  }}>{row.originalFileId ? "Reemplazar PDF" : "Cargar PDF"}</button>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && <tr><td colSpan={7}>Todavía no hay documentos externos. Agregá el primero con «Nuevo documento».</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
