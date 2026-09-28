import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualityPg14CalibrationProgramRow, QualityPg14UnifiedAsset } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";

const SOURCE: Record<string, string> = { StandardWeight: "Pesa", Instrument: "Instrumento", QualityEquipment: "Auxiliar" };
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("es-AR") : "—";
const cell: CSSProperties = { border: "1px solid #cbd5e1", padding: "5px 6px", fontSize: 10, verticalAlign: "top", overflowWrap: "anywhere" };
const head: CSSProperties = { ...cell, background: "#eaf1f8", color: "#173653", fontWeight: 700 };

export function QualityPg14ListPrintPage() {
  const { record = "r04" } = useParams();
  const [params] = useSearchParams();
  const isProgram = record === "r03";
  const source = params.get("source") || "all";
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [rows, setRows] = useState<QualityPg14UnifiedAsset[] | QualityPg14CalibrationProgramRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      isProgram ? api.listQualityPg14R03() : api.listQualityPg14R04(),
      api.getCompanySettings().catch(() => null)
    ]).then(([result, settings]) => {
      setRows(result.rows || []);
      setCompany(settings);
    }).catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [isProgram]);

  const visible = useMemo(() => isProgram || source === "all" ? rows : rows.filter((row) => row.source === source), [rows, source, isProgram]);
  const name = company?.legalName || company?.tradeName || "Empresa";
  const title = isProgram ? "Programa de calibraciones" : "Listado de equipos";
  const code = isProgram ? "PG14-R03" : "PG14-R04";
  const download = async () => {
    const sheet = document.getElementById("pg14-list-sheet");
    if (!sheet) return;
    setDownloading(true);
    setError(null);
    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set({
        margin: [8, 8, 8, 8], filename: `${code}_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy"] }
      }).from(sheet).save();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="workspace-page pad">Cargando registro…</div>;
  return <div style={{ minHeight: "100vh", padding: 18, background: "#e2e8f0" }}>
    <div className="no-print" style={{ maxWidth: "280mm", margin: "0 auto 14px", display: "flex", justifyContent: "space-between", gap: 12 }}>
      <Link className="btn btn-outline" to={`/calidad/registros/equipos?tab=${record}`}>← Volver</Link>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-outline" onClick={() => window.print()}>Imprimir</button>
        <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={downloading || !!error}>{downloading ? "Generando…" : "Descargar PDF"}</button>
      </div>
    </div>
    {error && <p className="no-print" style={{ color: "#b91c1c" }}>{error}</p>}
    <div id="pg14-list-sheet" style={{ boxSizing: "border-box", width: "280mm", margin: "0 auto", padding: "6mm", background: "#fff", color: "#0f172a", fontFamily: "Arial, sans-serif" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <tbody><tr>
          <td style={{ ...cell, width: "22%", textAlign: "center" }}>
            {company?.logoUrl && <img src={company.logoUrl} alt="Logo" crossOrigin="anonymous" style={{ maxHeight: 44, maxWidth: 125, objectFit: "contain" }} />}
            <div style={{ fontWeight: 700, fontSize: 11 }}>{name}</div>
          </td>
          <td style={{ ...cell, textAlign: "center" }}><strong style={{ fontSize: 15 }}>{code} · {title}</strong><div style={{ marginTop: 5 }}>Sistema de Gestión de Calidad · ISO/IEC 17025</div></td>
          <td style={{ ...cell, width: "20%" }}><strong>Fecha:</strong> {date(new Date().toISOString())}<br /><strong>Registros:</strong> {visible.length}<br /><strong>Origen:</strong> {isProgram ? "Pesas e instrumentos" : source === "all" ? "Todos" : SOURCE[source] || source}</td>
        </tr></tbody>
      </table>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead><tr>
          <th style={{ ...head, width: "9%" }}>Origen</th><th style={{ ...head, width: "10%" }}>Código</th>
          <th style={{ ...head, width: "19%" }}>Descripción</th>
          {!isProgram && <><th style={{ ...head, width: "12%" }}>Marca / modelo</th><th style={{ ...head, width: "10%" }}>Serie</th></>}
          <th style={{ ...head, width: isProgram ? "14%" : "10%" }}>Certificado</th>
          <th style={{ ...head, width: "10%" }}>Calibración</th><th style={{ ...head, width: "10%" }}>Vencimiento</th>
          {isProgram && <th style={{ ...head, width: "10%" }}>Días</th>}
          <th style={head}>Estado</th>
        </tr></thead>
        <tbody>{visible.map((row) => {
          const program = isProgram ? row as QualityPg14CalibrationProgramRow : null;
          const status = program?.isExpired ? "Vencido" : program?.isDueSoon ? "Próximo" : row.isExpired ? "Vencido" : row.status;
          return <tr key={`${row.source}-${row.id}`} style={{ breakInside: "avoid" }}>
            <td style={cell}>{SOURCE[row.source] || row.source}</td><td style={cell}>{row.code}</td><td style={cell}>{row.description || "—"}</td>
            {!isProgram && <><td style={cell}>{[row.brandOrManufacturer, row.model].filter(Boolean).join(" · ") || "—"}</td><td style={cell}>{row.serialNumber || "—"}</td></>}
            <td style={cell}>{row.certificateNumber || "—"}</td><td style={cell}>{date(row.calibrationDate)}</td><td style={cell}>{date(row.expirationDate)}</td>
            {isProgram && <td style={cell}>{program?.daysUntilExpiry ?? "—"}</td>}
            <td style={{ ...cell, color: program?.isExpired || row.isExpired ? "#b91c1c" : undefined }}>{status}</td>
          </tr>;
        })}
        {!visible.length && <tr><td style={cell} colSpan={isProgram ? 8 : 9}>Sin registros.</td></tr>}</tbody>
      </table>
      <p style={{ marginTop: 12, color: "#64748b", fontSize: 9 }}>COPIA NO CONTROLADA · Generado desde el SGC · {new Date().toLocaleString("es-AR")}</p>
    </div>
    <style>{`@media print { .no-print { display:none !important } body { background:#fff !important } #pg14-list-sheet { margin:0 !important; padding:0 !important } @page { size:A4 landscape; margin:8mm } thead { display:table-header-group } tr { break-inside:avoid } }`}</style>
  </div>;
}
