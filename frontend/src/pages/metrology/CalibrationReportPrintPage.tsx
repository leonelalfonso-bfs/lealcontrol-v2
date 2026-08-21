import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import type { CalibrationReport, MetrologyEquipment, CompanySettings } from "../../api/types";

export function CalibrationReportPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [equipment, setEquipment] = useState<MetrologyEquipment | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getCalibrationReport(id),
      api.getCompanySettings().catch(() => null)
    ])
      .then(([res, comp]) => {
        setReport(res.report);
        setEquipment(res.equipment || null);
        if (comp) setCompany(comp);
      })
      .catch((err) => setError(err?.message || "Error al cargar certificado."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="page-wide muted" style={{ padding: 40, textAlign: "center" }}>Cargando certificado metrológico...</div>;
  }

  if (error || !report) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <div className="alert">{error || "No se encontró el certificado solicitado."}</div>
        <Link to="/metrologia/informes" className="btn ghost">← Volver al listado</Link>
      </div>
    );
  }

  let repeatabilityData: any = {};
  let eccentricityData: any = {};
  let linearityData: any[] = [];
  let weightsUsed: any[] = [];

  try { repeatabilityData = JSON.parse(report.repeatabilityDataJson || "{}"); } catch {}
  try { eccentricityData = JSON.parse(report.eccentricityDataJson || "{}"); } catch {}
  try { linearityData = JSON.parse(report.linearityDataJson || "[]"); } catch {}
  try { weightsUsed = JSON.parse(report.weightsUsedJson || "[]"); } catch {}

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px", background: "#fff", color: "#111", minHeight: "100vh" }}>
      {/* Action Bar (No Print) */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #ddd" }}>
        <Link to="/metrologia/informes" className="btn ghost compact">
          ← Volver a Certificados
        </Link>
        <button type="button" onClick={handlePrint} className="btn" style={{ background: "#0d9488", color: "#fff" }}>
          🖨️ Imprimir / Guardar como PDF
        </button>
      </div>

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
              Laboratorio de Metrología & Servicios Técnicos Autorizados
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", fontWeight: 700 }}>
            CERTIFICADO DE CALIBRACIÓN
          </div>
          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0d9488" }}>
            {report.reportNumber}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#444" }}>
            Fecha de Ensayo: {new Date(report.calibrationDate).toLocaleDateString("es-AR")}
          </div>
        </div>
      </div>

      {/* Normativa */}
      <div style={{ textAlign: "center", background: "#f4fbf9", padding: "6px 12px", borderRadius: 6, border: "1px solid #ccede5", marginBottom: 16, fontSize: "0.84rem", fontWeight: 600, color: "#06574c" }}>
        {report.certificateType} • Conforme a {report.normativeApplied}
      </div>

      {/* Sección 1: Datos del Cliente y del Instrumento */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, fontSize: "0.84rem" }}>
          <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>
            🏢 DATOS DEL CLIENTE / PROPIETARIO
          </div>
          <div><strong>Razón Social:</strong> {report.customerName || "—"}</div>
          <div><strong>Ubicación en Planta:</strong> {report.location || "—"}</div>
          <div><strong>Metrólogo / Técnico:</strong> {report.performedBy}</div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, fontSize: "0.84rem" }}>
          <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>
            ⚖️ ESPECIFICACIONES TÉCNICAS & METROLÓGICAS
          </div>
          <div><strong>Código / Identificación:</strong> {report.equipmentCode} — {report.equipmentDescription}</div>
          {equipment && (
            <>
              <div>
                <strong>Receptor / Plataforma:</strong> {equipment.brand} {equipment.model} (S/N: {equipment.serialNumber || "—"})
                {(equipment as any).platformDimensions ? ` • ${(equipment as any).platformDimensions}` : ""}
                {(equipment as any).platformApprovalNumber && (
                  <div style={{ color: "#444", fontSize: "0.78rem" }}>
                    ↳ Disp. Aprobación Plataforma: <strong>{(equipment as any).platformApprovalNumber}</strong>
                    {(equipment as any).platformApprovalDate ? ` (Fecha: ${new Date((equipment as any).platformApprovalDate).toLocaleDateString("es-AR")})` : ""}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 3 }}>
                <strong>Indicador Principal:</strong> {(equipment as any).indicator1Brand || equipment.brand} {(equipment as any).indicator1Model || equipment.model} (S/N: {(equipment as any).indicator1SerialNumber || equipment.serialNumber || "—"}) [{(equipment as any).indicator1Type || "Digital"}]
                {(equipment as any).indicator1ApprovalNumber && (
                  <div style={{ color: "#444", fontSize: "0.78rem" }}>
                    ↳ Disp. Aprobación Indicador: <strong>{(equipment as any).indicator1ApprovalNumber}</strong>
                    {(equipment as any).indicator1ApprovalDate ? ` (Fecha: ${new Date((equipment as any).indicator1ApprovalDate).toLocaleDateString("es-AR")})` : ""}
                  </div>
                )}
              </div>
              {(equipment as any).hasSecondaryIndicator && (
                <div style={{ marginTop: 3 }}>
                  <strong>Indicador Secundario (Híbrida):</strong> {(equipment as any).indicator2Brand} {(equipment as any).indicator2Model} (S/N: {(equipment as any).indicator2SerialNumber || "—"}) [{(equipment as any).indicator2Type}]
                  {(equipment as any).indicator2ApprovalNumber && (
                    <div style={{ color: "#444", fontSize: "0.78rem" }}>
                      ↳ Disp. Aprobación Ind. 2: <strong>{(equipment as any).indicator2ApprovalNumber}</strong>
                      {(equipment as any).indicator2ApprovalDate ? ` (Fecha: ${new Date((equipment as any).indicator2ApprovalDate).toLocaleDateString("es-AR")})` : ""}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #eee" }}>
                <strong>Capacidad Max / Min:</strong> {equipment.maxCapacity.toLocaleString("es-AR")} {equipment.unit} / {equipment.minCapacity} {equipment.unit} • 
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
          🛡️ CONDICIONES AMBIENTALES & TRAZABILIDAD A PATRONES NACIONALES (INTI / SAC)
        </div>
        <div style={{ display: "flex", gap: 20, marginBottom: 6 }}>
          <span><strong>Temperatura:</strong> {report.ambientTemperature} ºC</span>
          <span><strong>Humedad Relativa:</strong> {report.ambientHumidity} %</span>
          <span><strong>Presión:</strong> {report.atmosphericPressure} hPa</span>
        </div>

        {weightsUsed && weightsUsed.length > 0 && (
          <table style={{ width: "100%", fontSize: "0.78rem", borderCollapse: "collapse", marginTop: 4 }}>
            <thead>
              <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #ddd", textAlign: "left" }}>
                <th style={{ padding: "4px 6px" }}>Pesa / Juego</th>
                <th style={{ padding: "4px 6px" }}>Valor Nominal</th>
                <th style={{ padding: "4px 6px" }}>Clase</th>
                <th style={{ padding: "4px 6px" }}>Nº Certificado INTI/SAC</th>
              </tr>
            </thead>
            <tbody>
              {weightsUsed.map((w: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "4px 6px" }}>{w.code}</td>
                  <td style={{ padding: "4px 6px" }}>{w.nominalValue} {w.unit}</td>
                  <td style={{ padding: "4px 6px" }}>Clase {w.accuracyClass}</td>
                  <td style={{ padding: "4px 6px" }}>{w.certificateNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Ensayo 1: Repetibilidad */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 14, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>
          1. ENSAYO DE REPETIBILIDAD / FIDELIDAD
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <strong>Carga ~50% Max ({repeatabilityData?.halfMax?.load || "—"} {equipment?.unit})</strong>
            <div>Repeticiones: {(repeatabilityData?.halfMax?.repetitions || []).join(" - ")} {equipment?.unit}</div>
            <div>Error de Rango: <strong>{repeatabilityData?.halfMax?.range || 0} {equipment?.unit}</strong> (EMT = ±{repeatabilityData?.halfMax?.emt || "—"})</div>
            <div>Resultado: <strong style={{ color: repeatabilityData?.halfMax?.conform ? "#0d9488" : "#dc2626" }}>{repeatabilityData?.halfMax?.conform ? "✓ Conforme" : "✗ No Conforme"}</strong></div>
          </div>
          <div>
            <strong>Carga ~100% Max ({repeatabilityData?.fullMax?.load || "—"} {equipment?.unit})</strong>
            <div>Repeticiones: {(repeatabilityData?.fullMax?.repetitions || []).join(" - ")} {equipment?.unit}</div>
            <div>Error de Rango: <strong>{repeatabilityData?.fullMax?.range || 0} {equipment?.unit}</strong> (EMT = ±{repeatabilityData?.fullMax?.emt || "—"})</div>
            <div>Resultado: <strong style={{ color: repeatabilityData?.fullMax?.conform ? "#0d9488" : "#dc2626" }}>{repeatabilityData?.fullMax?.conform ? "✓ Conforme" : "✗ No Conforme"}</strong></div>
          </div>
        </div>
      </div>

      {/* Ensayo 2: Excentricidad */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 14, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>
          2. ENSAYO DE EXCENTRICIDAD DE CARGA (Carga de Ensayo: {eccentricityData?.testLoad || "—"} {equipment?.unit})
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
          {(eccentricityData?.positions || []).map((p: any) => (
            <div key={p.pos} style={{ background: "#f8f9fa", padding: "4px 8px", borderRadius: 4, border: "1px solid #eee" }}>
              <span>{p.label}: <strong>{p.indication}</strong> (Error: {p.error >= 0 ? `+${p.error}` : p.error})</span>
            </div>
          ))}
        </div>
        <div>
          Error Máximo de Excentricidad: <strong>{eccentricityData?.maxError || 0} {equipment?.unit}</strong> (EMT = ±{eccentricityData?.emt || "—"}) • <strong style={{ color: eccentricityData?.conform ? "#0d9488" : "#dc2626" }}>{eccentricityData?.conform ? "✓ Conforme" : "✗ No Conforme"}</strong>
        </div>
      </div>

      {/* Ensayo 3: Exactitud / Linealidad */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>
          3. ENSAYO DE EXACTITUD Y LINEALIDAD (Cargas Crecientes y Decrecientes)
        </div>
        <table style={{ width: "100%", fontSize: "0.78rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8f9fa", borderBottom: "1px solid #ddd", textAlign: "left" }}>
              <th style={{ padding: "4px 6px" }}>Paso</th>
              <th style={{ padding: "4px 6px" }}>Carga Nominal</th>
              <th style={{ padding: "4px 6px" }}>EMT</th>
              <th style={{ padding: "4px 6px" }}>Ind. Creciente</th>
              <th style={{ padding: "4px 6px" }}>Error Creciente</th>
              <th style={{ padding: "4px 6px" }}>Ind. Decreciente</th>
              <th style={{ padding: "4px 6px" }}>Error Decreciente</th>
              <th style={{ padding: "4px 6px" }}>Dictamen</th>
            </tr>
          </thead>
          <tbody>
            {linearityData.map((r: any) => (
              <tr key={r.step} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "4px 6px" }}>#{r.step}</td>
                <td style={{ padding: "4px 6px" }}><strong>{r.targetLoad} {equipment?.unit}</strong></td>
                <td style={{ padding: "4px 6px" }}>±{r.emt} {equipment?.unit}</td>
                <td style={{ padding: "4px 6px" }}>{r.ascIndication}</td>
                <td style={{ padding: "4px 6px" }}>{r.ascError >= 0 ? `+${r.ascError}` : r.ascError}</td>
                <td style={{ padding: "4px 6px" }}>{r.descIndication}</td>
                <td style={{ padding: "4px 6px" }}>{r.descError >= 0 ? `+${r.descError}` : r.descError}</td>
                <td style={{ padding: "4px 6px", color: r.conform ? "#0d9488" : "#dc2626", fontWeight: 700 }}>
                  {r.conform ? "✓ Apto" : "✗ Fuera"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dictamen Final & Firmas */}
      <div style={{ border: "2px solid #0d9488", borderRadius: 8, padding: 14, background: "#f4fbf9", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "0.85rem", color: "#555" }}>DICTAMEN METROLÓGICO FINAL:</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: report.result === "Apto" ? "#06574c" : "#dc2626" }}>
              {report.result.toUpperCase()}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 4 }}>
              Incertidumbre Expandida de Medición: <strong>U = ±{report.expandedUncertainty} {equipment?.unit || "kg"}</strong> (k = 2, confianza 95.45%)
            </div>
            {report.observations && (
              <div style={{ fontSize: "0.8rem", marginTop: 6, color: "#333" }}>
                <strong>Observaciones:</strong> {report.observations}
              </div>
            )}
          </div>

          <div style={{ textAlign: "center", borderTop: "1px solid #444", paddingTop: 8, minWidth: 200 }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>{report.performedBy}</div>
            <div style={{ fontSize: "0.74rem", color: "#666" }}>Metrólogo / Responsable Técnico</div>
            <div style={{ fontSize: "0.74rem", color: "#666" }}>Laboratorio de Calibración</div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: "0.72rem", color: "#888" }}>
        Este certificado documenta la trazabilidad a los patrones nacionales del INTI según el Sistema Internacional de Unidades (SI). Prohibida su reproducción parcial sin autorización.
      </div>
    </div>
  );
}
