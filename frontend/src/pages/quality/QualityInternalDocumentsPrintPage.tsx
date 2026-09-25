import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";
import { trimBlankPdfPages } from "../../utils/trimBlankPdfPages";
import { labelOf, QUALITY_DOC_STATUS, QUALITY_DOC_TYPE } from "./qualityLabels";

type DocumentList = Awaited<ReturnType<typeof api.getQualityDocumentListPg01R01>>;
const cell: CSSProperties = { border: "1px solid #475569", padding: "7px 8px", fontSize: 11, verticalAlign: "top", overflowWrap: "anywhere" };
const value = (item: unknown) => item == null || item === "" ? "—" : String(item);
const date = (item: unknown) => item ? new Date(String(item)).toLocaleDateString("es-AR") : "—";

export function QualityInternalDocumentsPrintPage() {
  const [data, setData] = useState<DocumentList | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([api.getQualityDocumentListPg01R01(), api.getCompanySettings()])
      .then(([records, settings]) => { setData(records); setCompany(settings); })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const download = async () => {
    if (!sheet.current || !data) return;
    setBusy(true); setError(null);
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(sheet.current.querySelectorAll("img")).map(img => img.decode()));
      const html2pdf = await loadHtml2Pdf();
      const worker = html2pdf().set({
        margin: [10, 10, 10, 10], filename: "PG01-R01_documentos_internos.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".pg01-heading"] }
      }).from(sheet.current).toCanvas();
      const canvas: HTMLCanvasElement = await worker.get("canvas");
      const pageSize: { inner: { ratio: number } } = await worker.get("pageSize");
      await worker.set({ canvas: trimBlankPdfPages(canvas, Math.floor(canvas.width * pageSize.inner.ratio)) }).toPdf().save();
    } catch (err) {
      setError(`No se pudo generar el PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(false); }
  };

  const companyName = company?.legalName || company?.tradeName || "Empresa";
  return <div className="workspace-page pad" style={{ background: "#e2e8f0" }}>
    <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
      <Link className="btn btn-outline" to="/calidad/registros/pg01-r01">← Volver al listado</Link>
      <button className="btn btn-primary" type="button" disabled={!data || busy} onClick={() => void download()}>{busy ? "Generando…" : "Descargar PDF"}</button>
    </div>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    {!data && !error && <p>Cargando listado…</p>}
    {data && <div style={{ overflowX: "auto" }}>
      <div ref={sheet} id="pg01-r01-sheet" style={{ width: "277mm", boxSizing: "border-box", padding: "5mm", margin: "0 auto", background: "#fff", color: "#0f172a", fontFamily: "Arial, sans-serif" }}>
        <table className="pg01-heading" style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}><tbody><tr>
          <td style={{ ...cell, width: "25%", textAlign: "center", verticalAlign: "middle" }}>
            {company?.logoUrl && <img src={company.logoUrl} alt={companyName} crossOrigin="anonymous" style={{ display: "block", margin: "0 auto 5px", maxWidth: 150, maxHeight: 60, objectFit: "contain" }} />}
            <strong>{companyName}</strong>
            {company?.documentNumber && <div>CUIT {company.documentNumber}</div>}
          </td>
          <td style={{ ...cell, textAlign: "center", verticalAlign: "middle" }}>
            <div>SISTEMA DE GESTIÓN DE CALIDAD · ISO/IEC 17025</div>
            <h1 style={{ fontSize: 18, margin: "10px 0" }}>{data.title}</h1>
          </td>
          <td style={{ ...cell, width: "22%" }}>
            <div><strong>Código:</strong> {data.code}</div>
            <div><strong>Versión:</strong> {data.recordVersion ?? "—"}</div>
            <div><strong>Emisión:</strong> {new Date(data.generatedAtUtc).toLocaleDateString("es-AR")}</div>
          </td>
        </tr></tbody></table>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup><col style={{ width: "11%" }} /><col style={{ width: "26%" }} /><col style={{ width: "14%" }} /><col style={{ width: "10%" }} /><col style={{ width: "13%" }} /><col style={{ width: "15%" }} /><col style={{ width: "11%" }} /></colgroup>
          <thead><tr>{["Código", "Nombre", "Tipo", "Versión", "Aprobación", "Próxima revisión", "Estado"].map(label => <th key={label} style={{ ...cell, background: "#f1f5f9", textAlign: "left" }}>{label}</th>)}</tr></thead>
          <tbody>
            {data.rows.map((row, index) => <tr key={`${value(row.codigo)}-${index}`}>
              <td style={cell}>{value(row.codigo)}</td><td style={cell}>{value(row.nombre)}</td>
              <td style={cell}>{labelOf(QUALITY_DOC_TYPE, String(row.tipo ?? ""))}</td>
              <td style={cell}>{value(row.versionActual)}</td><td style={cell}>{date(row.fechaAprobacion)}</td>
              <td style={cell}>{date(row.fechaRevision)}</td><td style={cell}>{labelOf(QUALITY_DOC_STATUS, String(row.estado ?? ""))}</td>
            </tr>)}
            {!data.rows.length && <tr><td colSpan={7} style={cell}>Sin documentos internos registrados.</td></tr>}
          </tbody>
        </table>
        <p style={{ fontSize: 10, marginTop: 16 }}>Total: {data.rows.length} documentos · PG01-R01 · Copia no controlada al descargar.</p>
      </div>
    </div>}
  </div>;
}
