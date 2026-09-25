import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualityExternalDocumentList } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";
import { qualityExternalError } from "./QualityExternalDocumentsPage";
import { labelOf, QUALITY_DOC_STATUS } from "./qualityLabels";

export function QualityExternalDocumentsPrintPage() {
  const [data, setData] = useState<QualityExternalDocumentList | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    Promise.all([api.getQualityDocumentListPg01R02(), api.getCompanySettings()])
      .then(([records, settings]) => { setData(records); setCompany(settings); })
      .catch(err => setError(qualityExternalError(err)));
  }, []);

  const download = async () => {
    if (!sheet.current || !data) return;
    setBusy(true); setError(null);
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(sheet.current.querySelectorAll("img")).map(img => img.decode()));
      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set({
        margin: [10, 10, 10, 10], filename: "PG01-R02_documentos_externos.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".pg01-heading"] }
      }).from(sheet.current).save();
    } catch (err) { setError(`No se pudo generar el PDF: ${qualityExternalError(err)}`); }
    finally { setBusy(false); }
  };
  const cell: CSSProperties = { border: "1px solid #475569", padding: "7px 8px", fontSize: 11, verticalAlign: "top", overflowWrap: "anywhere" };
  const companyName = company?.legalName || company?.tradeName || "Empresa";
  return (
    <div className="workspace-page pad" style={{ background: "#e2e8f0" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <Link className="btn btn-outline" to="/calidad/registros/pg01-r02">← Volver al listado</Link>
        <button className="btn btn-primary" type="button" disabled={!data || busy} onClick={() => void download()}>{busy ? "Generando…" : "Descargar PDF"}</button>
      </div>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {!data && !error && <p>Cargando listado…</p>}
      {data && (
        <div style={{ overflowX: "auto" }}>
          <div ref={sheet} id="pg01-r02-sheet" style={{ width: "277mm", boxSizing: "border-box", padding: "5mm", margin: "0 auto", background: "#fff", color: "#0f172a", fontFamily: "Arial, sans-serif" }}>
            <table className="pg01-heading" style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <tbody><tr>
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
              </tr></tbody>
            </table>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: "12%" }} /><col style={{ width: "27%" }} /><col style={{ width: "17%" }} /><col style={{ width: "21%" }} /><col style={{ width: "12%" }} /><col style={{ width: "11%" }} /></colgroup>
              <thead><tr>{["Código", "Nombre", "Organismo", "URL", "Próxima revisión", "Estado"].map(label => <th key={label} style={{ ...cell, background: "#f1f5f9", textAlign: "left" }}>{label}</th>)}</tr></thead>
              <tbody>
                {data.rows.map(row => <tr key={row.id}>
                  <td style={cell}>{row.codigo}</td><td style={cell}>{row.nombre}</td><td style={cell}>{row.organismo || "—"}</td>
                  <td style={cell}>{row.url || "—"}</td><td style={cell}>{row.proximaRevision ? new Date(row.proximaRevision).toLocaleDateString("es-AR") : "—"}</td>
                  <td style={cell}>{labelOf(QUALITY_DOC_STATUS, row.estado)}</td>
                </tr>)}
                {!data.rows.length && <tr><td colSpan={6} style={cell}>Sin documentos externos registrados.</td></tr>}
              </tbody>
            </table>
            <p style={{ fontSize: 10, marginTop: 16 }}>Total: {data.rows.length} documentos · PG01-R02 · Copia no controlada al descargar.</p>
          </div>
        </div>
      )}
    </div>
  );
}
