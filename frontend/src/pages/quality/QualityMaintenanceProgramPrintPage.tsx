import { useEffect, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualityMaintenancePlanItem } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";

const months = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const cell: CSSProperties = { border: "1px solid #cbd5e1", padding: "5px 4px", fontSize: 10, overflowWrap: "anywhere", verticalAlign: "top" };
export function QualityMaintenanceProgramPrintPage() {
  const [params] = useSearchParams();
  const year = Number(params.get("year")) || new Date().getFullYear();
  const [rows, setRows] = useState<QualityMaintenancePlanItem[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    Promise.all([api.listQualityPg14R06(), api.getCompanySettings().catch(() => null)])
      .then(([list, settings]) => { setRows(list.rows.filter((row) => row.programYear === year && row.status !== "Cancelled")); setCompany(settings); })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [year]);
  const name = company?.legalName || company?.tradeName || "Empresa";
  const download = async () => {
    const sheet = document.getElementById("pg14-r06-program");
    if (!sheet) return;
    setDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set({ margin: [8, 8, 8, 8], filename: `PG14-R06_programa_${year}.pdf`, image: { type: "jpeg", quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false }, jsPDF: { unit: "mm", format: "a4", orientation: "landscape" }, pagebreak: { mode: ["css", "legacy"] } }).from(sheet).save();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setDownloading(false); }
  };
  if (loading) return <div className="workspace-page pad">Cargando programa…</div>;
  return <div style={{ minHeight: "100vh", padding: 18, background: "#e2e8f0" }}>
    <div className="no-print" style={{ maxWidth: "280mm", margin: "0 auto 14px", display: "flex", justifyContent: "space-between" }}>
      <Link className="btn btn-outline" to="/calidad/registros/equipos?tab=r06">← Volver</Link>
      <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-outline" onClick={() => window.print()}>Imprimir</button><button type="button" className="btn btn-primary" disabled={downloading} onClick={() => void download()}>{downloading ? "Generando…" : "Descargar PDF"}</button></div>
    </div>
    {error && <p className="no-print" style={{ color: "#b91c1c" }}>{error}</p>}
    <div id="pg14-r06-program" style={{ boxSizing: "border-box", width: "280mm", margin: "0 auto", padding: "6mm", background: "#fff", fontFamily: "Arial, sans-serif", color: "#0f172a" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}><tbody><tr>
        <td style={{ ...cell, width: "22%", textAlign: "center" }}>{company?.logoUrl && <img src={company.logoUrl} alt="Logo" crossOrigin="anonymous" style={{ maxHeight: 44, maxWidth: 125, objectFit: "contain" }} />}<div style={{ fontWeight: 700 }}>{name}</div></td>
        <td style={{ ...cell, textAlign: "center" }}><strong style={{ fontSize: 15 }}>PG14-R06 · Programa de mantenimiento preventivo {year}</strong><div>Sistema de Gestión de Calidad · ISO/IEC 17025</div></td>
        <td style={{ ...cell, width: "18%" }}>P = planificado<br />D = realizado<br />Filas: {rows.length}</td>
      </tr></tbody></table>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}><thead><tr><th style={{ ...cell, width: "10%" }}>Equipo</th><th style={{ ...cell, width: "16%" }}>Descripción</th><th style={{ ...cell, width: "20%" }}>Actividad</th>{months.map((m, index) => <th key={index} style={{ ...cell, textAlign: "center", width: "3%" }}>{m}</th>)}<th style={cell}>Observaciones</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} style={{ breakInside: "avoid" }}><td style={cell}>{row.equipmentCode}</td><td style={cell}>{row.equipmentDescription}</td><td style={cell}>{row.activity}</td>{months.map((_, index) => <td key={index} style={{ ...cell, textAlign: "center", fontWeight: 700, color: row.months?.[index] === "D" ? "#166534" : "#b45309" }}>{row.months?.[index] === "-" ? "" : row.months?.[index]}</td>)}<td style={cell}>{row.notes || ""}</td></tr>)}
        {!rows.length && <tr><td style={cell} colSpan={16}>Sin actividades para {year}.</td></tr>}</tbody>
      </table>
      <p style={{ color: "#64748b", fontSize: 9, marginTop: 12 }}>COPIA NO CONTROLADA · Generado desde el SGC · {new Date().toLocaleString("es-AR")}</p>
    </div>
    <style>{`@media print { .no-print { display:none !important } #pg14-r06-program { margin:0 !important; padding:0 !important } @page { size:A4 landscape; margin:8mm } thead { display:table-header-group } tr { break-inside:avoid } }`}</style>
  </div>;
}
