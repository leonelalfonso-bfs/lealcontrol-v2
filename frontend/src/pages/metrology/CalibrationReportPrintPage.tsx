import { useEffect, useState, type CSSProperties } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import type { CalibrationReport, MetrologyEquipment, MetrologyInstrument, CompanySettings } from "../../api/types";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";
import { labelOf, METROLOGY_OPERATION, METROLOGY_REPORT_STATUS, METROLOGY_VERDICT, INDICATOR_TYPE } from "../quality/qualityLabels";

export function CalibrationReportPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [equipment, setEquipment] = useState<MetrologyEquipment | null>(null);
  const [thermometer, setThermometer] = useState<MetrologyInstrument | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getCalibrationReport(id),
      api.getCompanySettings().catch(() => null)
    ])
      .then(([res, comp]) => {
        setReport(res.report);
        setEquipment(res.equipment || null);
        setThermometer(res.thermometer || null);
        if (comp) setCompany(comp);
      })
      .catch((err) => setError(err?.message || "Error al cargar el informe."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="page-wide muted" style={{ padding: 40, textAlign: "center" }}>Cargando informe metrológico...</div>;
  }

  if (error || !report) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <div className="alert">{error || "No se encontró el informe solicitado."}</div>
        <Link to="/metrologia/informes" className="btn ghost">← Volver al listado</Link>
      </div>
    );
  }

  let repeatabilityData: any = {};
  let eccentricityData: any = {};
  let linearityData: any[] = [];
  let weightsUsed: any[] = [];
  let visualInspectionData: any = {};

  const rawRepJson = (report as any).repeatabilityTestJson || report.repeatabilityDataJson || "{}";
  const rawEccJson = (report as any).eccentricityTestJson || report.eccentricityDataJson || "{}";
  const rawLinJson = (report as any).linearityTestJson || report.linearityDataJson || "[]";
  const rawWeightsJson = report.weightsUsedJson || "[]";
  const rawVisualJson = (report as any).visualInspectionJson || "{}";

  try { repeatabilityData = typeof rawRepJson === "string" ? JSON.parse(rawRepJson) : rawRepJson; } catch {}
  try { eccentricityData = typeof rawEccJson === "string" ? JSON.parse(rawEccJson) : rawEccJson; } catch {}
  try { linearityData = typeof rawLinJson === "string" ? JSON.parse(rawLinJson) : (Array.isArray(rawLinJson) ? rawLinJson : []); } catch {}
  try { weightsUsed = typeof rawWeightsJson === "string" ? JSON.parse(rawWeightsJson) : (Array.isArray(rawWeightsJson) ? rawWeightsJson : []); } catch {}
  try { visualInspectionData = typeof rawVisualJson === "string" ? JSON.parse(rawVisualJson) : rawVisualJson; } catch {}

  const hasDualLoad = repeatabilityData?.hasDualLoad;
  const fidelityLow = repeatabilityData?.lowLoad;
  const fidelityHigh = repeatabilityData?.highLoad;
  const fidelityCurrent = Array.isArray(repeatabilityData?.readings) ? repeatabilityData : null;
  const fidelityHalf = repeatabilityData?.halfOperationalLoad || repeatabilityData?.halfMax;
  const fidelityFull = repeatabilityData?.fullOperationalLoad || repeatabilityData?.fullMax;

  const certNumber = (report as any).certificateNumber || report.reportNumber || "CERT-2026";
  const stdAppliedRaw = String(
    (report as any).standardApplied ||
    (report as any).regulatoryProfile ||
    visualInspectionData?.checklist?.normativeApplied ||
    report.normativeApplied ||
    ""
  );
  const isReport2307 =
    /2307/i.test(stdAppliedRaw) ||
    /REGIMEN_TRANSITORIO/i.test(String((report as any).regulatoryProfile || "")) ||
    /2307/i.test(String((equipment as any)?.applicableStandard || ""));
  const stdApplied = isReport2307
    ? "Resolución SCyNEI Nº 2307/1980 (régimen transitorio)"
    : "Resolución SIyC Nº 25/2025";
  const profileStatus = isReport2307
    ? ((report as any).regulatoryStatus && /transitor/i.test(String((report as any).regulatoryStatus))
        ? (report as any).regulatoryStatus
        : "Régimen transitorio")
    : ((report as any).regulatoryStatus || "Vigente");
  // No mostrar alcance/vencimiento aunque el informe viejo lo tenga guardado.
  const regulatoryNotice = "";
  const opFromChecklist = visualInspectionData?.checklist?.operationLabel;
  const operationLabel =
    opFromChecklist ||
    labelOf(METROLOGY_OPERATION, (report as any).operationType, "Verificación periódica");
  const documentTitle = (report as any).documentTitle || "Informe de ensayo metrológico";
  const supersedesReportId = report.supersedesReportId || (report as any).supersedesReportId || null;
  const amendmentReason = report.amendmentReason || (report as any).amendmentReason || null;
  const reportStatusRaw = (report.reportStatus || report.status || "").toString();
  const reportStatusLabel = labelOf(METROLOGY_REPORT_STATUS, reportStatusRaw, reportStatusRaw || "—");
  const verdictRaw: any = report.result || (report as any).verdict || "Apto";
  const verdictLabelEs = labelOf(METROLOGY_VERDICT, String(verdictRaw), String(verdictRaw || "—"));
  const verdictText = verdictLabelEs.toUpperCase();
  const isApproved = verdictRaw === "Approved" || verdictRaw === "Apto" || verdictLabelEs === "Apto";
  const tempVal = (report as any).temperatureCelsius ?? report.ambientTemperature ?? 20;
  const companyName = company?.legalName || company?.tradeName || "LEAL CONTROL ERP";
  const assayDateLabel = report.calibrationDate
    ? new Date(report.calibrationDate).toLocaleDateString("es-AR")
    : "—";

  const stampPdfChrome = (pdf: any) => {
    const total = pdf.internal.getNumberOfPages();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);

      // Encabezado compacto en páginas 2..N (la 1 ya trae el membrete completo del HTML).
      if (i > 1) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(13, 148, 136);
        pdf.text(companyName, 10, 8);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(70, 70, 70);
        pdf.text(documentTitle, 10, 12);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(13, 148, 136);
        pdf.text(String(certNumber), pageWidth - 10, 8, { align: "right" });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(70, 70, 70);
        pdf.text(`Fecha de ensayo: ${assayDateLabel}`, pageWidth - 10, 12, { align: "right" });

        pdf.setDrawColor(13, 148, 136);
        pdf.setLineWidth(0.35);
        pdf.line(10, 14.5, pageWidth - 10, 14.5);
      }

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Página ${i} de ${total}`, pageWidth / 2, pageHeight - 6, { align: "center" });
    }

    return pdf;
  };

  const buildReportPdf = async () => {
    const el = document.getElementById("metrology-report-sheet");
    if (!el) throw new Error("No se encontró el contenido del informe.");
    const html2pdf = await loadHtml2Pdf();
    const worker = html2pdf()
      .set({
        // Margen superior extra para el encabezado de páginas siguientes.
        margin: [18, 10, 14, 10],
        filename: `${certNumber || "informe-metrologico"}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] }
      })
      .from(el);
    const pdf = await worker.toPdf().get("pdf");
    return stampPdfChrome(pdf);
  };

  const handlePrint = async () => {
    setDownloadingPdf(true);
    try {
      const pdf = await buildReportPdf();
      const blobUrl = pdf.output("bloburl");
      const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!w) {
        // Si el popup está bloqueado, al menos descarga el PDF limpio.
        pdf.save(`${certNumber || "informe-metrologico"}.pdf`);
        return;
      }
      // Esperar a que el visor cargue antes de abrir el diálogo de impresión.
      window.setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch {
          /* el usuario puede imprimir desde el visor */
        }
      }, 600);
    } catch (err) {
      console.error(err);
      // Fallback: impresión del DOM (sin numeración fiable del navegador).
      const prevTitle = document.title;
      document.title = certNumber || "\u00A0";
      const restore = () => {
        document.title = prevTitle;
        window.removeEventListener("afterprint", restore);
      };
      window.addEventListener("afterprint", restore);
      window.print();
      window.setTimeout(restore, 1500);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const pdf = await buildReportPdf();
      pdf.save(`${certNumber || "informe-metrologico"}.pdf`);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const renderPrintFidelityBlock = (blockTitle: string, blockData: any) => {
    if (!blockData) return null;
    const isTruck = blockData.inbound || blockData.outbound;
    const singleDirection = Boolean(repeatabilityData?.singleDirection || visualInspectionData?.repeatability?.singleDirection);
    const activeSense = (repeatabilityData?.activeSense || visualInspectionData?.repeatability?.activeSense || "inbound") as string;

    const renderSingleTable = (subTitle: string, subBlock: any) => {
      if (!subBlock || !subBlock.computedRows) return null;
      const rows = subBlock.computedRows.filter((r: any) => r.hasValue);
      if (rows.length === 0) return null;

      return (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          {subTitle && (
            <div style={{ fontWeight: 700, fontSize: "0.76rem", color: "#334155", marginBottom: 2 }}>
              {subTitle}
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.73rem" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                <th style={{ padding: "3px 4px", width: "35px" }}>N°</th>
                <th style={{ padding: "3px 4px", textAlign: "right" }}>Cero Inicial</th>
                <th style={{ padding: "3px 4px", textAlign: "right" }}>Indicación</th>
                <th style={{ padding: "3px 4px", textAlign: "right" }}>Cero Final</th>
                <th style={{ padding: "3px 4px", textAlign: "right" }}>Desv. Redondeo (ΔL)</th>
                <th style={{ padding: "3px 4px", textAlign: "right" }}>Lect. Corregida</th>
                <th style={{ padding: "3px 4px", textAlign: "right" }}>Error</th>
                <th style={{ padding: "3px 4px", textAlign: "center" }}>EMT</th>
                <th style={{ padding: "3px 4px", textAlign: "center" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.index} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>#{r.index}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{r.initialZero}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right", fontWeight: 700 }}>{r.indication}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{r.finalZero}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right" }}>{r.deltaL}</td>
                  <td style={{ padding: "2px 4px", textAlign: "right", fontFamily: "monospace" }}>
                    {r.corrected !== null ? Number(r.corrected).toFixed(0) : "—"}
                  </td>
                  <td
                    style={{
                      padding: "2px 4px",
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: r.error !== null && Math.abs(r.error) <= (blockData.emt || 20) ? "#047857" : "#dc2626"
                    }}
                  >
                    {r.error !== null ? (r.error >= 0 ? `+${Number(r.error).toFixed(0)}` : Number(r.error).toFixed(0)) : "—"}
                  </td>
                  <td style={{ padding: "2px 4px", textAlign: "center", fontFamily: "monospace" }}>
                    ±{blockData.emt}
                  </td>
                  <td style={{ padding: "2px 4px", textAlign: "center", color: r.ok ? "#047857" : "#dc2626", fontWeight: 700 }}>
                    {r.ok ? "CUMPLE" : "NO CUMPLE"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", background: "#f8fafc", padding: "3px 6px", borderRadius: 4, fontSize: "0.72rem", marginTop: 3 }}>
            <span>Desviación Estándar (s): <strong>{Number(subBlock.stdDev || 0).toFixed(2)} {equipment?.unit || "kg"}</strong></span>
            <span>Diferencia Máxima: <strong>{Number(subBlock.maxDiff || 0).toFixed(0)} {equipment?.unit || "kg"}</strong></span>
            <span style={{ color: subBlock.conform ? "#047857" : "#dc2626", fontWeight: 700 }}>
              Resultado: {subBlock.conform ? "✓ CUMPLE" : "✗ NO CUMPLE"}
            </span>
          </div>
        </div>
      );
    };

    return (
      <div style={{ background: "#fafafa", border: "1px solid #e2e8f0", borderRadius: 6, padding: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 4 }}>
          <strong>{blockTitle} · Carga de Referencia (#1): {blockData.appliedLoad} {equipment?.unit || "kg"}</strong>
          <span style={{ color: blockData.conform ? "#047857" : "#dc2626", fontWeight: 700, fontSize: "0.76rem" }}>
            EMT: ±{blockData.emt} {equipment?.unit || "kg"} · {blockData.conform ? "✓ CONFORME" : "✗ NO CONFORME"}
          </span>
        </div>
        {isTruck ? (
          <>
            {(!singleDirection || activeSense !== "outbound") &&
              renderSingleTable("→ Sentido Entrada (Carga) · 3 pasadas", blockData.inbound)}
            {(!singleDirection || activeSense === "outbound") &&
              renderSingleTable("← Sentido Salida (Descarga) · 3 pasadas", blockData.outbound)}
          </>
        ) : (
          renderSingleTable("5 Repeticiones de Ensayo", blockData.platform)
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px", background: "#fff", color: "#111", minHeight: "100vh" }}>
      {/* Action Bar (No Print) */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #ddd", flexWrap: "wrap", gap: 10 }}>
        <Link to="/metrologia/informes" className="btn ghost compact">
          ← Volver a Informes de Ensayo
        </Link>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => void handlePrint()} className="btn ghost" disabled={downloadingPdf}>
              🖨️ Imprimir
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={downloadingPdf}
              className="btn"
              style={{ background: "#0d9488", color: "#fff" }}
            >
              {downloadingPdf ? "Generando PDF…" : "📥 Descargar PDF"}
            </button>
          </div>
          <small className="muted" style={{ maxWidth: 460, textAlign: "right" }}>
            Imprimir y Descargar PDF usan el mismo archivo: encabezado en todas las páginas, numeración «Página N de X» y cierre «Fin del informe».
          </small>
        </div>
      </div>

      <div id="metrology-report-sheet" className="print-container" style={{ background: "#fff", color: "#111" }}>
      {/* Header Membrete */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0d9488", paddingBottom: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt={company.legalName} style={{ maxHeight: 55, maxWidth: 180, objectFit: "contain" }} />
          ) : (
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0d9488" }}>
              {company?.legalName || "LEAL CONTROL ERP"}
            </div>
          )}
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>{company?.legalName || "LEAL CONTROL ERP S.A."}</div>
            <div style={{ fontSize: "0.78rem", color: "#555" }}>
              {company?.documentNumber ? `CUIT: ${company.documentNumber} • ` : ""}
              {company?.fiscalStreet || "Parque Industrial"} - {company?.fiscalCity || ""}
            </div>
            <div style={{ fontSize: "0.78rem", color: "#555" }}>
              Servicios técnicos y metrológicos
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", fontWeight: 700 }}>
            {documentTitle.toUpperCase()}
          </div>
          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0d9488" }}>
            {certNumber}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#444" }}>
            Fecha de Ensayo: {report.calibrationDate ? new Date(report.calibrationDate).toLocaleDateString("es-AR") : "—"}
          </div>
        </div>
      </div>

      {(supersedesReportId || amendmentReason) && (
        <div style={{ background: "#fff7ed", border: "1px solid #fdba74", padding: "10px 12px", borderRadius: 6, marginBottom: 16, fontSize: "0.84rem", color: "#9a3412" }}>
          <strong>Enmienda PG09 R2</strong>
          {amendmentReason && <> — Motivo: {amendmentReason}</>}
          {supersedesReportId && (
            <div style={{ marginTop: 4 }}>
              Sustituye al informe original:{" "}
              <Link to={`/metrologia/informes/${supersedesReportId}/imprimir`} className="no-print">
                ver informe sustituido
              </Link>
              <span className="print-only" style={{ display: "none" }}>{supersedesReportId}</span>
            </div>
          )}
        </div>
      )}

      {reportStatusRaw.toLowerCase() === "superseded" && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", padding: "10px 12px", borderRadius: 6, marginBottom: 16, fontSize: "0.84rem", color: "#991b1b" }}>
          <strong>Informe sustituido</strong> — este informe fue reemplazado por una enmienda PG09 R2 y no debe usarse como versión vigente.
        </div>
      )}

      {/* Normativa */}
      <div style={{ textAlign: "center", background: "#f4fbf9", padding: "6px 12px", borderRadius: 6, border: "1px solid #ccede5", marginBottom: 16, fontSize: "0.84rem", fontWeight: 600, color: "#06574c" }}>
        Perfil aplicado: {stdApplied} • {profileStatus}
      </div>

      {regulatoryNotice && <div style={{ background: "#fff8e8", border: "1px solid #f2d28a", padding: "8px 10px", borderRadius: 6, marginBottom: 16, fontSize: "0.78rem", color: "#76500b" }}><strong>Alcance del informe:</strong> {regulatoryNotice}</div>}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>MATRIZ DE ENSAYO REGISTRADA</div>
        <div><strong>Operación:</strong> {operationLabel} • <strong>Plan:</strong> {visualInspectionData?.checklist?.testPlanVersion || (report as any).testPlanVersion || "MET-BASE-1"}</div>
        {Array.isArray(visualInspectionData?.checklist?.items) && <ul style={{ margin: "7px 0 0", paddingLeft: 18 }}>{visualInspectionData.checklist.items.map((item: any, index: number) => <li key={`${item.title}-${index}`}>{item.title}</li>)}</ul>}
      </div>

      {/* Sección 1: Datos del Cliente y del Instrumento */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, fontSize: "0.84rem" }}>
          <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>
            🏢 DATOS DEL CLIENTE / PROPIETARIO
          </div>
          <div><strong>Razón Social:</strong> {report.customerName || "—"}</div>
          <div><strong>Ubicación en Planta:</strong> {report.location || "—"}</div>
          <div><strong>Verificador:</strong> {report.performedBy || "—"}</div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, fontSize: "0.84rem" }}>
          <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>
            ⚖️ ESPECIFICACIONES TÉCNICAS & METROLÓGICAS
          </div>
          <div><strong>Código / Identificación:</strong> {report.equipmentCode || (equipment?.code)} — {report.equipmentDescription || (equipment?.description)}</div>
          {equipment && (
            <>
              <div>
                <strong>Receptor / Plataforma:</strong> {equipment.brand} {equipment.model} (S/N: {equipment.serialNumber || "—"})
                {(equipment as any).platformDimensions ? ` • ${(equipment as any).platformDimensions}` : ""}
                {((equipment as any).platformApprovalCode || (equipment as any).platformApprovalNumber) && (
                  <div style={{ color: "#444", fontSize: "0.78rem" }}>
                    ↳ Aprob. Modelo: <strong>{(equipment as any).platformApprovalCode || "—"}</strong>
                    {(equipment as any).platformApprovalNumber ? ` • Disposición: ${(equipment as any).platformApprovalNumber}` : ""}
                    {(equipment as any).platformApprovalDate ? ` (Fecha: ${new Date((equipment as any).platformApprovalDate).toLocaleDateString("es-AR")})` : ""}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 3 }}>
                <strong>Indicador Principal:</strong> {(equipment as any).indicator1Brand || "—"} {(equipment as any).indicator1Model || ""} (S/N: {(equipment as any).indicator1SerialNumber || "—"}) [{labelOf(INDICATOR_TYPE, (equipment as any).indicator1Type, (equipment as any).indicator1Type || "Digital")}]
                {((equipment as any).indicator1ApprovalCode || (equipment as any).indicator1ApprovalNumber) && (
                  <div style={{ color: "#444", fontSize: "0.78rem" }}>
                    ↳ Aprob. Modelo: <strong>{(equipment as any).indicator1ApprovalCode || "—"}</strong>
                    {(equipment as any).indicator1ApprovalNumber ? ` • Disposición: ${(equipment as any).indicator1ApprovalNumber}` : ""}
                    {(equipment as any).indicator1ApprovalDate ? ` (Fecha: ${new Date((equipment as any).indicator1ApprovalDate).toLocaleDateString("es-AR")})` : ""}
                  </div>
                )}
              </div>
              {(equipment as any).hasSecondaryIndicator && (
                <div style={{ marginTop: 3 }}>
                  <strong>Indicador Secundario (Híbrida):</strong> {(equipment as any).indicator2Brand} {(equipment as any).indicator2Model} (S/N: {(equipment as any).indicator2SerialNumber || "—"}) [{(equipment as any).indicator2Type}]
                  {((equipment as any).indicator2ApprovalCode || (equipment as any).indicator2ApprovalNumber) && (
                    <div style={{ color: "#444", fontSize: "0.78rem" }}>
                      ↳ Aprob. Modelo: <strong>{(equipment as any).indicator2ApprovalCode || "—"}</strong>
                      {(equipment as any).indicator2ApprovalNumber ? ` • Disposición: ${(equipment as any).indicator2ApprovalNumber}` : ""}
                      {(equipment as any).indicator2ApprovalDate ? ` (Fecha: ${new Date((equipment as any).indicator2ApprovalDate).toLocaleDateString("es-AR")})` : ""}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #eee" }}>
                <strong>Capacidad Max / Min:</strong> {equipment.maxCapacity?.toLocaleString("es-AR")} {equipment.unit} / {equipment.minCapacity} {equipment.unit} • 
                <strong> Escalón:</strong> e = {equipment.verificationIntervalE} {equipment.unit} (d = {equipment.divisionD} {equipment.unit}) • 
                <strong> Clase:</strong> {equipment.accuracyClass}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Condiciones Ambientales y Trazabilidad */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>
          🛡️ CONDICIONES AMBIENTALES & TRAZABILIDAD METROLÓGICA
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 8 }}>
          <div><strong>Temperatura:</strong> {tempVal} ºC</div>
        </div>
        {thermometer && (
          <div style={{ marginBottom: 8 }}>
            <strong>Termómetro:</strong> {thermometer.code}
            {thermometer.certificateNumber ? ` · Cert. ${thermometer.certificateNumber}` : ""}
            {thermometer.expirationDate
              ? ` · vence ${new Date(thermometer.expirationDate).toLocaleDateString("es-AR")}`
              : ""}
            {thermometer.traceabilityLab ? ` · ${thermometer.traceabilityLab}` : ""}
          </div>
        )}

        {weightsUsed.length > 0 && (
          <div style={{ borderTop: "1px dashed #eee", paddingTop: 6 }}>
            <strong>Patrones Empleados:</strong> {weightsUsed.map(w => `${w.code} (${w.nominalValue} ${w.unit || "kg"} Cl.${w.accuracyClass} Cert.${w.certificateNumber})`).join(" • ")}
          </div>
        )}
      </div>

      {/* Ensayo de Puesta a Cero & Movilidad */}
      {(visualInspectionData?.zeroSetting || visualInspectionData?.mobility) && (
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
          <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 8, color: "#0d9488" }}>
            1. ENSAYO DE PUESTA A CERO (RANGO 4% MAX) & MOVILIDAD (DISCRIMINACIÓN 1.4d)
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: visualInspectionData.zeroSetting && visualInspectionData.mobility ? "1fr 1.25fr" : "1fr", gap: 12 }}>
            {visualInspectionData.zeroSetting && (
              <div style={{ background: "#fafafa", padding: 8, borderRadius: 4 }}>
                <strong style={{ fontSize: "0.8rem", color: "#0f766e" }}>🎯 Puesta a Cero (Res. 2307/80)</strong>
                <div style={{ fontSize: "0.74rem", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                  <div>Límite 4% Max: <strong>{visualInspectionData.zeroSetting.maxAllowedRange?.toLocaleString("es-AR")} {equipment?.unit || "kg"}</strong></div>
                  <div>Puesta a cero en rango ({visualInspectionData.zeroSetting.positiveTestLoad} {equipment?.unit || "kg"}): <strong>{visualInspectionData.zeroSetting.positiveZeroOk ? "✓ Correcto" : "✗ Falló"}</strong></div>
                  <div>Bloqueo fuera de rango ({visualInspectionData.zeroSetting.overLimitTestLoad} {equipment?.unit || "kg"}): <strong>{visualInspectionData.zeroSetting.overLimitBlockedOk ? "✓ Bloqueado" : "✗ Falló"}</strong></div>
                  {(visualInspectionData.zeroSetting.zeroErrorCorrected != null || visualInspectionData.zeroSetting.zeroErrorEmt != null || visualInspectionData.zeroSetting.zeroErrorLimit != null) && (
                    <div>
                      Error a cero E₀:{" "}
                      <strong>
                        {visualInspectionData.zeroSetting.zeroErrorCorrected >= 0
                          ? `+${visualInspectionData.zeroSetting.zeroErrorCorrected}`
                          : visualInspectionData.zeroSetting.zeroErrorCorrected}{" "}
                        {equipment?.unit || "kg"}
                      </strong>{" "}
                      (EMT: ±{visualInspectionData.zeroSetting.zeroErrorEmt ?? visualInspectionData.zeroSetting.zeroErrorLimit})
                    </div>
                  )}
                </div>
                <div style={{ color: visualInspectionData.zeroSetting.conform ? "#0d9488" : "#dc2626", fontWeight: 700, marginTop: 4, fontSize: "0.76rem" }}>
                  Resultado: {visualInspectionData.zeroSetting.conform ? "✓ Conforme" : "✗ No Conforme"}
                </div>
              </div>
            )}

            {visualInspectionData.mobility && (
              <div style={{ background: "#fafafa", padding: 8, borderRadius: 4 }}>
                <strong style={{ fontSize: "0.8rem", color: "#0f766e" }}>🎯 Movilidad / Discriminación (Sobrecarga {visualInspectionData.mobility.overloadValue} {equipment?.unit || "kg"} = 1.4d)</strong>
                <table style={{ width: "100%", marginTop: 4, fontSize: "0.72rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ddd", background: "#f5f5f5" }}>
                      <th style={{ textAlign: "left", padding: "2px 4px" }}>Nivel</th>
                      <th style={{ textAlign: "right", padding: "2px 4px" }}>Carga</th>
                      <th style={{ textAlign: "right", padding: "2px 4px" }}>I₁</th>
                      <th style={{ textAlign: "right", padding: "2px 4px" }}>I₂ (+1.4d)</th>
                      <th style={{ textAlign: "right", padding: "2px 4px" }}>ΔI (≥1d)</th>
                      <th style={{ textAlign: "center", padding: "2px 4px" }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visualInspectionData.mobility.points?.map((mp: any, i: number) => (
                      <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "2px 4px" }}>{mp.loadName}</td>
                        <td style={{ textAlign: "right", padding: "2px 4px" }}>{mp.load}</td>
                        <td style={{ textAlign: "right", padding: "2px 4px" }}>{mp.initialIndication}</td>
                        <td style={{ textAlign: "right", padding: "2px 4px" }}>{mp.finalIndication}</td>
                        <td style={{ textAlign: "right", padding: "2px 4px", fontWeight: 700 }}>+{mp.delta}</td>
                        <td style={{ textAlign: "center", padding: "2px 4px", color: mp.conform ? "#0d9488" : "#dc2626", fontWeight: 700 }}>
                          {mp.conform ? "✓ Apto" : "✗ Fuera"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ color: visualInspectionData.mobility.conform ? "#0d9488" : "#dc2626", fontWeight: 700, marginTop: 4, fontSize: "0.76rem" }}>
                  Resultado: {visualInspectionData.mobility.conform ? "✓ Conforme" : "✗ No Conforme"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ensayo de Repetibilidad / Fidelidad */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 8, color: "#0d9488" }}>
          2. ENSAYO DE {isReport2307 ? "FIDELIDAD" : "REPETIBILIDAD"}
        </div>
        {hasDualLoad ? (
          <div>
            {renderPrintFidelityBlock("🔹 Fidelidad en Baja Carga", fidelityLow)}
            {renderPrintFidelityBlock("🔸 Fidelidad en Alta Carga", fidelityHigh)}
          </div>
        ) : fidelityCurrent ? (
          <div style={{ background: "#fafafa", padding: 8, borderRadius: 4 }}>
            <strong>{fidelityCurrent.instrumentType || "Ensayo de fidelidad"} · carga de referencia: {fidelityCurrent.appliedLoad} {equipment?.unit || "kg"}</strong>
            <div style={{ fontSize: "0.72rem", color: "#666", marginTop: 3 }}>{fidelityCurrent.method}</div>
            <table style={{ width: "100%", marginTop: 7, fontSize: "0.76rem", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Pasada</th>
                  <th style={{ textAlign: "left" }}>Sentido</th>
                  <th style={{ textAlign: "right" }}>Indicación</th>
                </tr>
              </thead>
              <tbody>
                {fidelityCurrent.readings.map((item: any, index: number) => (
                  <tr key={`${item.direction}-${index}`}>
                    <td>{item.pass}</td>
                    <td>{item.direction}</td>
                    <td style={{ textAlign: "right" }}>{item.indication} {equipment?.unit || "kg"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 7 }}>
              Menor: <strong>{fidelityCurrent.minimum}</strong> · Mayor: <strong>{fidelityCurrent.maximum}</strong> · Diferencia: <strong>{fidelityCurrent.range}</strong> {equipment?.unit || "kg"} (EMT: ±{fidelityCurrent.emt})
            </div>
            <div style={{ color: fidelityCurrent.conform ? "#0d9488" : "#dc2626", fontWeight: 700, marginTop: 2 }}>
              Resultado: {fidelityCurrent.conform ? "✓ Conforme" : "✗ No Conforme"}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[{ label: "50 % de carga máxima de uso", data: fidelityHalf }, { label: "100 % de carga máxima de uso", data: fidelityFull }].map(({ label, data }) => data && (
              <div key={label} style={{ background: "#fafafa", padding: 8, borderRadius: 4 }}>
                <strong>{label} ({data.load} {equipment?.unit || "kg"})</strong>
                <div>Lecturas: {data.repetitions?.join(", ")} {equipment?.unit || "kg"}</div>
                <div>Diferencia máxima: <strong>{data.range}</strong> {equipment?.unit || "kg"} (EMT: ±{data.emt})</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ensayo de Excentricidad */}
      {eccentricityData.positions && (
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
          <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 8, color: "#0d9488" }}>
            2. ENSAYO DE EXCENTRICIDAD DE CARGA (Aplicada: {eccentricityData.testLoad} {equipment?.unit || "kg"})
            <span style={{ fontWeight: 400, fontSize: "0.72rem" }}> · teórica: {eccentricityData.calculatedTestLoad ?? eccentricityData.testLoad} · sugerida: {eccentricityData.suggestedTestLoad ?? eccentricityData.testLoad}</span>
          </div>
          {/* Croquis de enumeración de apoyos en certificado impreso */}
          <div style={{ margin: "6px 0 10px", padding: "6px 8px", background: "#f8fafc", borderRadius: 4, border: "1px dashed #cbd5e1" }}>
            <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: 4 }}>Croquis de apoyos · frente / acceso ↑</div>
            {/* Fila superior (enfrente: 2, 4, 6, 8...) */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.ceil(eccentricityData.positions.length / 2)}, 1fr)`, gap: 4 }}>
              {Array.from({ length: Math.ceil(eccentricityData.positions.length / 2) }, (_, i) => 2 * (i + 1))
                .filter((num) => num <= eccentricityData.positions.length)
                .map((num) => (
                  <span key={`top-${num}`} style={{ textAlign: "center", fontSize: "0.72rem", fontWeight: 700, background: "#e2e8f0", padding: "2px 4px", borderRadius: 2 }}>
                    Apoyo {num}
                  </span>
                ))}
            </div>
            <div style={{ height: 12, borderLeft: "1px solid #94a3b8", borderRight: "1px solid #94a3b8", margin: "2px 6px", textAlign: "center", fontSize: "0.62rem", color: "#94a3b8" }}>
              PLATAFORMA
            </div>
            {/* Fila inferior (frente / acceso: 1, 3, 5, 7...) */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.ceil(eccentricityData.positions.length / 2)}, 1fr)`, gap: 4 }}>
              {Array.from({ length: Math.ceil(eccentricityData.positions.length / 2) }, (_, i) => 2 * i + 1)
                .filter((num) => num <= eccentricityData.positions.length)
                .map((num) => (
                  <span key={`bottom-${num}`} style={{ textAlign: "center", fontSize: "0.72rem", fontWeight: 700, background: "#e2e8f0", padding: "2px 4px", borderRadius: 2 }}>
                    Apoyo {num}
                  </span>
                ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 6 }}>
            {eccentricityData.positions.map((p: any) => (
              <div key={p.pos} style={{ background: "#fafafa", padding: 6, borderRadius: 4, textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "#666" }}>{p.label}</div>
                <strong style={{ fontSize: "0.85rem" }}>I {p.indication} {equipment?.unit || "kg"}</strong>
                {p.deltaL !== undefined && <div style={{ fontSize: "0.7rem", color: "#666" }}>ΔL {p.deltaL} · P {Number(p.beforeRounding).toFixed(2)}</div>}
                <div style={{ fontSize: "0.72rem", color: Math.abs(p.error) <= (eccentricityData.emt || 20) ? "#0d9488" : "#dc2626" }}>Err: {p.error >= 0 ? `+${p.error}` : p.error}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", background: "#f5f5f5", padding: "4px 8px", borderRadius: 4, fontSize: "0.78rem" }}>
            <span>Error Máximo: <strong>{eccentricityData.maxError} {equipment?.unit || "kg"}</strong></span>
            <span>EMT Permitido: <strong>±{eccentricityData.emt} {equipment?.unit || "kg"}</strong></span>
            <span style={{ color: eccentricityData.conform ? "#0d9488" : "#dc2626", fontWeight: 700 }}>
              {eccentricityData.conform ? "✓ Conforme" : "✗ No Conforme"}
            </span>
          </div>
        </div>
      )}

      {/* Ensayo de Linealidad — dos tablas para que entren en A4 */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 8, color: "#0d9488" }}>
          3. ENSAYO DE EXACTITUD Y LINEALIDAD (Cargas Crecientes y Decrecientes)
        </div>
        {(() => {
          const hasAuxCol = linearityData.some((x: any) => (x.auxLoad || 0) > 0);
          const unit = equipment?.unit || "kg";
          const th: CSSProperties = {
            padding: "3px 3px",
            fontSize: "0.68rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            background: "#f0fdfa",
            borderBottom: "1px solid #ccc"
          };
          const td: CSSProperties = { padding: "3px 3px", fontSize: "0.72rem", whiteSpace: "nowrap" };

          const renderLinTable = (sense: "asc" | "desc", title: string) => (
            <div style={{ marginBottom: sense === "asc" ? 12 : 0 }}>
              <div style={{ fontWeight: 700, fontSize: "0.78rem", color: "#334155", marginBottom: 4 }}>{title}</div>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: "6%", textAlign: "left" }}>#</th>
                    <th style={{ ...th, width: hasAuxCol ? "14%" : "18%", textAlign: "right" }}>Carga</th>
                    {hasAuxCol && <th style={{ ...th, width: "12%", textAlign: "right" }}>Aux.</th>}
                    <th style={{ ...th, width: "10%", textAlign: "right" }}>EMT</th>
                    <th style={{ ...th, width: "12%", textAlign: "right" }}>Lectura</th>
                    <th style={{ ...th, width: "10%", textAlign: "right" }}>ΔL</th>
                    <th style={{ ...th, width: "14%", textAlign: "right" }}>Corregida</th>
                    <th style={{ ...th, width: "12%", textAlign: "right" }}>Error</th>
                    <th style={{ ...th, width: "12%", textAlign: "center" }}>Cumple</th>
                  </tr>
                </thead>
                <tbody>
                  {linearityData.map((r: any) => {
                    const targetL = r.targetLoad ?? (r.pesas || 0) + (r.auxLoad || 0);
                    const indication = sense === "asc" ? r.ascIndication : r.descIndication;
                    const deltaL = sense === "asc" ? r.ascDeltaL : r.descDeltaL;
                    const corrected = sense === "asc" ? r.ascCorrected : r.descCorrected;
                    const err =
                      sense === "asc"
                        ? (r.ascError !== undefined ? r.ascError : (indication ?? 0) - targetL)
                        : (r.descError !== undefined ? r.descError : (indication ?? 0) - targetL);
                    const ok = Math.abs(err) <= (r.emt ?? 0);

                    return (
                      <tr key={`${sense}-${r.step}`} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ ...td, textAlign: "left" }}>#{r.step}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                          {targetL?.toLocaleString("es-AR")} {unit}
                        </td>
                        {hasAuxCol && (
                          <td style={{ ...td, textAlign: "right" }}>
                            {(r.auxLoad || 0) > 0 ? `${Number(r.auxLoad).toLocaleString("es-AR")}` : "—"}
                          </td>
                        )}
                        <td style={{ ...td, textAlign: "right" }}>±{r.emt}</td>
                        <td style={{ ...td, textAlign: "right" }}>{indication ?? "—"}</td>
                        <td style={{ ...td, textAlign: "right", color: "#64748b" }}>
                          {deltaL !== undefined && deltaL !== 0 && deltaL !== null ? deltaL : "—"}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                          {corrected !== undefined && corrected !== null
                            ? Number(corrected).toLocaleString("es-AR")
                            : indication ?? "—"}
                        </td>
                        <td
                          style={{
                            ...td,
                            textAlign: "right",
                            fontWeight: 700,
                            color: ok ? "#047857" : "#dc2626"
                          }}
                        >
                          {err >= 0 ? `+${err}` : err}
                        </td>
                        <td
                          style={{
                            ...td,
                            textAlign: "center",
                            fontWeight: 700,
                            color: ok ? "#0d9488" : "#dc2626"
                          }}
                        >
                          {ok ? "Sí" : "No"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );

          if (!linearityData.length) {
            return <div className="muted" style={{ fontSize: "0.78rem" }}>Sin puntos de linealidad registrados.</div>;
          }

          return (
            <>
              {renderLinTable("asc", "↗ Cargas crecientes")}
              {renderLinTable("desc", "↘ Cargas decrecientes")}
            </>
          );
        })()}
      </div>

      {/* Control y Registro de Precintos Metrológicos */}
      {((visualInspectionData?.sealsList && visualInspectionData.sealsList.length > 0) || report.sealsPlaced) && (
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
          <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 8, color: "#0d9488" }}>
            🔒 CONTROL Y REGISTRO DE PRECINTOS METROLÓGICOS
          </div>
          {visualInspectionData?.sealsList && visualInspectionData.sealsList.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                  <th style={{ padding: "4px 6px", width: "30%" }}>Ubicación del Precinto</th>
                  <th style={{ padding: "4px 6px", width: "25%" }}>N° de Precinto / Código</th>
                  <th style={{ padding: "4px 6px", width: "25%" }}>Tipo de Precinto</th>
                  <th style={{ padding: "4px 6px", width: "20%" }}>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {visualInspectionData.sealsList.map((s: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "4px 6px", fontWeight: 600 }}>{s.location || "—"}</td>
                    <td style={{ padding: "4px 6px", fontWeight: 700, color: "#0f766e" }}>{s.code || "—"}</td>
                    <td style={{ padding: "4px 6px" }}>{s.type || "Autoadhesivo (a)"}</td>
                    <td style={{ padding: "4px 6px", color: "#64748b" }}>{s.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: "0.78rem" }}>{report.sealsPlaced}</div>
          )}
        </div>
      )}

      {/* Dictamen Final & Firmas */}
      <div style={{ border: "2px solid #0d9488", borderRadius: 8, padding: 14, background: "#f4fbf9", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.85rem", color: "#555" }}>RESULTADO TÉCNICO DEL INFORME:</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: isApproved ? "#06574c" : "#dc2626" }}>
              {verdictText}
            </div>
            {((report as any).finalTemperatureCelsius != null || (report as any).finalTimeLocal) && (
              <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 4 }}>
                {(report as any).finalTemperatureCelsius != null && (
                  <>Temperatura final: <strong>{(report as any).finalTemperatureCelsius} °C</strong></>
                )}
                {(report as any).finalTemperatureCelsius != null && (report as any).finalTimeLocal ? " · " : null}
                {(report as any).finalTimeLocal && (
                  <>Hora final: <strong>{(report as any).finalTimeLocal}</strong></>
                )}
              </div>
            )}
            {report.observations && (
              <div style={{ fontSize: "0.8rem", marginTop: 6, color: "#333" }}>
                <strong>Observaciones:</strong> {report.observations}
              </div>
            )}
            <div style={{ fontSize: "0.78rem", marginTop: 8, color: "#0f766e" }}>
              Estado: <strong>{reportStatusLabel}</strong>
              {(report as any).instructionCode ? <> · Instructivo <strong>{(report as any).instructionCode}</strong></> : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center", borderTop: "1px solid #444", paddingTop: 8, minWidth: 180 }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>{report.performedBy || "Verificador"}</div>
              <div style={{ fontSize: "0.74rem", color: "#666" }}>Elaboró / Verificador</div>
            </div>
            <div style={{ textAlign: "center", borderTop: "1px solid #444", paddingTop: 8, minWidth: 180 }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>{(report as any).approvedBy || "Pendiente DT"}</div>
              <div style={{ fontSize: "0.74rem", color: "#666" }}>Aprobó · Director Técnico</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: "0.72rem", color: "#888", marginBottom: 18 }}>
        Documento técnico emitido mediante el Sistema Modular de Metrología Legal — Leal Control ERP
      </div>

      <div
        style={{
          marginTop: 8,
          padding: "14px 12px",
          borderTop: "2px solid #0d9488",
          textAlign: "center",
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#06574c",
          fontSize: "0.92rem"
        }}
      >
        — Fin del informe —
      </div>
      </div>

      <SgcTraceabilityPanel reportId={report.id} report={report} thermometer={thermometer} />
    </div>
  );
}

function SgcTraceabilityPanel({
  reportId,
  report,
  thermometer
}: {
  reportId: string;
  report: CalibrationReport;
  thermometer: MetrologyInstrument | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getCalibrationReportSgcTraceability>> | null>(null);

  const load = async () => {
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.getCalibrationReportSgcTraceability(reportId));
    } catch (err) {
      // Fallback local si el endpoint aún no está desplegado
      let procedures: Array<{ code?: string; displayCode?: string; title?: string; version?: number }> = [];
      let externals: string[] = [];
      let weights: Array<{ code?: string; certificateNumber?: string }> = [];
      try {
        procedures = JSON.parse((report as any).procedureSnapshotJson || "[]");
      } catch { /* ignore */ }
      try {
        externals = JSON.parse((report as any).externalDocumentCodesJson || "[]");
      } catch { /* ignore */ }
      try {
        weights = JSON.parse(report.weightsUsedJson || "[]");
      } catch { /* ignore */ }
      if (procedures.length || externals.length) {
        setData({
          reportId,
          certificateNumber: (report as any).certificateNumber || report.reportNumber,
          reportStatus: (report as any).reportStatus || report.status,
          instructionCode: (report as any).instructionCode,
          standardApplied: (report as any).standardApplied,
          performedBy: report.performedBy,
          approvedBy: (report as any).approvedBy,
          procedures,
          externalDocumentCodes: externals,
          weightsUsed: weights,
          qualityLinks: {
            tree: "/calidad/documentos",
            instruction: (report as any).instructionCode
              ? `/calidad/documentos/${(report as any).instructionCode}`
              : null,
            procedurePg12: "/calidad/documentos/PG12",
            procedurePg09: "/calidad/documentos/PG09"
          }
        });
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="no-print" style={{ marginBottom: 24, border: "1px dashed #94a3b8", borderRadius: 8, padding: 12 }}>
      <button type="button" className="btn ghost compact" onClick={() => void load()}>
        {open ? "Ocultar trazabilidad SGC" : "Ver trazabilidad SGC"}
      </button>
      {open && (
        <div style={{ marginTop: 12, fontSize: "0.85rem" }}>
          {loading && <div className="muted">Cargando cadena SGC…</div>}
          {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
          {data && (
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <strong>Procedimientos / instructivos (snapshot):</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {(data.procedures || []).map((p, i) => (
                    <li key={`${p.code}-${i}`}>
                      <Link to={`/calidad/documentos/${encodeURIComponent(p.code || "")}`}>
                        {p.displayCode || p.code}
                      </Link>
                      {p.version ? ` v${p.version}` : ""}
                      {p.title ? ` — ${p.title}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Documentos externos:</strong>{" "}
                {(data.externalDocumentCodes || []).length
                  ? data.externalDocumentCodes.join(", ")
                  : "—"}
              </div>
              <div>
                <strong>Termómetro (PG16):</strong>{" "}
                {data.thermometer
                  ? `${data.thermometer.code}${data.thermometer.certificateNumber ? ` · Cert. ${data.thermometer.certificateNumber}` : ""}`
                  : thermometer
                    ? `${thermometer.code}${thermometer.certificateNumber ? ` · Cert. ${thermometer.certificateNumber}` : ""}`
                    : "—"}
                {data.temperatureCelsius != null ? ` · ${data.temperatureCelsius} °C` : ""}
              </div>
              <div>
                <strong>Pesas patrón usadas:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {(data.weightsUsed || []).map((w, i) => (
                    <li key={`${w.code}-${i}`}>
                      {w.code || "—"}
                      {w.certificateNumber ? ` · cert. ${w.certificateNumber}` : ""}
                      {w.nominalValue != null ? ` · ${w.nominalValue} ${w.unit || ""}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Firmas:</strong> Elaboró {data.performedBy || "—"} · Aprobó DT {data.approvedBy || "pendiente"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link to={data.qualityLinks.tree}>Árbol documental</Link>
                {data.qualityLinks.instruction && (
                  <Link to={data.qualityLinks.instruction}>Instructivo {data.instructionCode}</Link>
                )}
                <Link to={data.qualityLinks.procedurePg12}>PG12</Link>
                <Link to={data.qualityLinks.procedurePg09}>PG09</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
