import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualityIndicator, QualityIndicatorValue } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";
import { trimBlankPdfPages } from "../../utils/trimBlankPdfPages";

const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const cell: CSSProperties = { border: "1px solid #64748b", padding: "5px 6px", fontSize: 10, verticalAlign: "top", overflowWrap: "anywhere" };
const show = (value?: string | number | null) => value == null || value === "" ? "—" : String(value);
const number = (value: number, unit?: string) => `${value}${unit ? ` ${unit}` : ""}`;

function yearValues(indicator: QualityIndicator, year: string) {
  return (indicator.values ?? []).filter(v => v.period.slice(0, 4) === year);
}

function lastValue(values: QualityIndicatorValue[]) {
  return [...values].sort((a, b) => b.period.localeCompare(a.period) || b.recordedAtUtc.localeCompare(a.recordedAtUtc))[0];
}

function cumulative(values: QualityIndicatorValue[], latest?: QualityIndicatorValue) {
  if (!latest) return null;
  if (!/^\d{4}-\d{2}$/.test(latest.period)) return latest.value;
  return values.filter(v => /^\d{4}-\d{2}$/.test(v.period) && v.period <= latest.period).reduce((sum, v) => sum + v.value, 0);
}

function meets(indicator: QualityIndicator, value: number | null) {
  if (value == null || indicator.targetValue == null) return null;
  if (indicator.direction === "LowerIsBetter") return value <= indicator.targetValue;
  if (indicator.direction === "Exact") return value === indicator.targetValue;
  return value >= indicator.targetValue;
}

export function QualityMc01R03PrintPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.listQualityMc01R03>> | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([api.listQualityMc01R03(), api.getCompanySettings()])
      .then(([records, settings]) => { setData(records); setCompany(settings); })
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const years = useMemo(() => {
    const available = new Set([String(new Date().getFullYear())]);
    data?.rows.forEach(row => row.values?.forEach(v => available.add(v.period.slice(0, 4))));
    return [...available].filter(y => /^\d{4}$/.test(y)).sort().reverse();
  }, [data]);
  const companyName = company?.legalName || company?.tradeName || "Empresa";

  const download = async () => {
    if (!sheet.current || !data) return;
    setBusy(true); setError(null);
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(sheet.current.querySelectorAll("img")).map(img => img.decode()));
      const html2pdf = await loadHtml2Pdf();
      const worker = html2pdf().set({
        margin: [10, 10, 10, 10], filename: `MC01-R03_seguimiento_${year}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".mc01-heading", ".mc01-indicator"] }
      }).from(sheet.current).toCanvas();
      const canvas: HTMLCanvasElement = await worker.get("canvas");
      const pageSize: { inner: { ratio: number } } = await worker.get("pageSize");
      await worker.set({ canvas: trimBlankPdfPages(canvas, Math.floor(canvas.width * pageSize.inner.ratio)) }).toPdf().save();
    } catch (err) {
      setError(`No se pudo generar el PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(false); }
  };

  return <div className="workspace-page pad" style={{ background: "#e2e8f0" }}>
    <div className="no-print" style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
      <Link className="btn btn-outline" to="/calidad/registros/mc01-r03">← Volver a indicadores</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label htmlFor="mc01-year">Año</label>
        <select id="mc01-year" value={year} onChange={e => setYear(e.target.value)}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
        <button type="button" className="btn btn-primary" disabled={!data || busy} onClick={() => void download()}>{busy ? "Generando…" : "Descargar PDF"}</button>
      </div>
    </div>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    {!data && !error && <p>Cargando seguimiento…</p>}
    {data && <div style={{ overflowX: "auto" }}><div ref={sheet} style={{ width: "277mm", boxSizing: "border-box", padding: "5mm", margin: "0 auto", background: "white", color: "#0f172a", fontFamily: "Arial, sans-serif" }}>
      <table className="mc01-heading" style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}><tbody><tr>
        <td style={{ ...cell, width: "23%", textAlign: "center", verticalAlign: "middle" }}>
          {company?.logoUrl && <img src={company.logoUrl} alt={companyName} crossOrigin="anonymous" style={{ display: "block", margin: "0 auto 5px", maxWidth: 145, maxHeight: 55, objectFit: "contain" }} />}
          <strong>{companyName}</strong>{company?.documentNumber && <div>CUIT {company.documentNumber}</div>}
        </td>
        <td style={{ ...cell, textAlign: "center", verticalAlign: "middle" }}><div>SISTEMA DE GESTIÓN DE CALIDAD · ISO/IEC 17025</div><h1 style={{ fontSize: 18, margin: "9px 0" }}>{data.title}</h1><div>Seguimiento anual {year}</div></td>
        <td style={{ ...cell, width: "21%" }}><div><strong>Código:</strong> {data.code}</div><div><strong>Versión:</strong> {data.recordVersion ?? "—"}</div><div><strong>Emisión:</strong> {new Date(data.generatedAtUtc).toLocaleDateString("es-AR")}</div></td>
      </tr></tbody></table>
      {data.rows.map((row, index) => {
        const values = yearValues(row, year);
        const latest = lastValue(values);
        const total = cumulative(values, latest);
        const status = meets(row, total);
        const monthly = new Map(values.filter(v => /^\d{4}-\d{2}$/.test(v.period)).map(v => [v.period, v]));
        const other = values.filter(v => !/^\d{4}-\d{2}$/.test(v.period));
        return <section className="mc01-indicator" key={row.id} style={{ marginBottom: 13, breakInside: "avoid", pageBreakInside: "avoid" }}>
          <div style={{ background: "#e8f0f2", padding: "7px 9px", fontSize: 12, fontWeight: 700, border: "1px solid #64748b" }}>{index + 1}. {row.name} {row.status === "Inactive" && <span style={{ fontWeight: 400 }}>(inactivo)</span>}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}><tbody>
            <tr><td style={{ ...cell, width: "50%" }}><strong>Objetivo:</strong> {show(row.objective)}</td><td style={cell}><strong>Indicador / fórmula:</strong> {show(row.formula)}</td></tr>
            <tr><td style={cell}><strong>Meta:</strong> {row.targetValue == null ? "—" : number(row.targetValue, row.targetUnit)} · <strong>Responsable:</strong> {show(row.responsible)}</td><td style={cell}><strong>Acciones:</strong> {show(row.actions)}</td></tr>
          </tbody></table>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: 5 }}><thead><tr>{months.map(m => <th key={m} style={{ ...cell, textAlign: "center", background: "#f1f5f9" }}>{m}</th>)}</tr></thead><tbody>
            <tr>{months.map((m, i) => {
              const v = monthly.get(`${year}-${String(i + 1).padStart(2, "0")}`);
              return <td key={m} style={{ ...cell, textAlign: "center" }}>{v ? <><strong>{number(v.value, row.targetUnit)}</strong><div style={{ color: "#475569" }}>Reg. {new Date(v.recordedAtUtc).toLocaleDateString("es-AR")}</div></> : "—"}</td>;
            })}</tr>
          </tbody></table>
          {other.length > 0 && <div style={{ fontSize: 10, marginTop: 4 }}><strong>Otros períodos:</strong> {other.map(v => `${v.period}: ${number(v.value, row.targetUnit)}`).join(" · ")}</div>}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 5 }}><tbody><tr>
            <td style={cell}><strong>Esperado:</strong> {row.targetValue == null ? "—" : number(row.targetValue, row.targetUnit)}</td>
            <td style={cell}><strong>Acumulado:</strong> {total == null ? "—" : number(total, row.targetUnit)}</td>
            <td style={cell}><strong>Último período:</strong> {show(latest?.period)}</td>
            <td style={{ ...cell, fontWeight: 700, color: status == null ? "#475569" : status ? "#166534" : "#991b1b" }}>{status == null ? "Sin evaluación" : status ? "Cumple" : "No cumple"}</td>
          </tr></tbody></table>
          <div style={{ ...cell, borderTop: 0 }}><strong>Seguimiento / análisis:</strong> {show(row.followUp || row.notes)}
            {values.some(v => v.notes) && <div style={{ marginTop: 4 }}><strong>Observaciones por período:</strong> {values.filter(v => v.notes).sort((a, b) => a.period.localeCompare(b.period)).map(v => <div key={v.id}>{v.period}: {v.notes}</div>)}</div>}
          </div>
        </section>;
      })}
      {!data.rows.length && <p style={{ fontSize: 12 }}>Sin indicadores registrados.</p>}
      <p style={{ fontSize: 10, marginTop: 12 }}>Total: {data.rows.length} indicadores · MC01-R03 · Copia no controlada al descargar.</p>
    </div></div>}
  </div>;
}
