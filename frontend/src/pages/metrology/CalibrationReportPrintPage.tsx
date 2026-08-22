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

  const rawRepJson = (report as any).repeatabilityTestJson || report.repeatabilityDataJson || "{}";
  const rawEccJson = (report as any).eccentricityTestJson || report.eccentricityDataJson || "{}";
  const rawLinJson = (report as any).linearityTestJson || report.linearityDataJson || "[]";
  const rawWeightsJson = report.weightsUsedJson || "[]";

  try { repeatabilityData = typeof rawRepJson === "string" ? JSON.parse(rawRepJson) : rawRepJson; } catch {}
  try { eccentricityData = typeof rawEccJson === "string" ? JSON.parse(rawEccJson) : rawEccJson; } catch {}
  try { linearityData = typeof rawLinJson === "string" ? JSON.parse(rawLinJson) : (Array.isArray(rawLinJson) ? rawLinJson : []); } catch {}
  try { weightsUsed = typeof rawWeightsJson === "string" ? JSON.parse(rawWeightsJson) : (Array.isArray(rawWeightsJson) ? rawWeightsJson : []); } catch {}

  const certNumber = (report as any).certificateNumber || report.reportNumber || "CERT-2026";
  const stdApplied = (report as any).standardApplied || report.normativeApplied || "Resolución SIyC Nº 25/2025 (OIML R 76-1)";
  const certType = report.certificateType || (stdApplied.includes("2307") ? "Ensayo Oficial Res. 2307/80" : "Ensayo Oficial Res. 25/2025");
  const verdictRaw: any = report.result || (report as any).verdict || "Apto";
  const verdictText = (verdictRaw === "Approved" || verdictRaw === "Apto") ? "APTO" : (verdictRaw === "Rejected" || verdictRaw === "No Apto") ? "NO APTO" : String(verdictRaw || "").toUpperCase();
  const isApproved = verdictText === "APTO" || verdictText === "APPROVED";
  const expUncertainty = (report as any).expandedUncertaintyK2 ?? report.expandedUncertainty ?? 0;
  const tempVal = (report as any).temperatureCelsius ?? report.ambientTemperature ?? 20;
  const humVal = (report as any).relativeHumidityPercent ?? report.ambientHumidity ?? 50;
  const pressVal = (report as any).atmosphericPressureHpa ?? report.atmosphericPressure ?? 1013;

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
            {certNumber}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#444" }}>
            Fecha de Ensayo: {report.calibrationDate ? new Date(report.calibrationDate).toLocaleDateString("es-AR") : "—"}
          </div>
        </div>
      </div>

      {/* Normativa */}
      <div style={{ textAlign: "center", background: "#f4fbf9", padding: "6px 12px", borderRadius: 6, border: "1px solid #ccede5", marginBottom: 16, fontSize: "0.84rem", fontWeight: 600, color: "#06574c" }}>
        {certType} • Conforme a {stdApplied}
      </div>

      {/* Sección 1: Datos del Cliente y del Instrumento */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, fontSize: "0.84rem" }}>
          <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 6, color: "#0d9488" }}>
            🏢 DATOS DEL CLIENTE / PROPIETARIO
          </div>
          <div><strong>Razón Social:</strong> {report.customerName || "—"}</div>
          <div><strong>Ubicación en Planta:</strong> {report.location || "—"}</div>
          <div><strong>Metrólogo / Técnico:</strong> {report.performedBy || "—"}</div>
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
                <strong>Indicador Principal:</strong> {(equipment as any).indicator1Brand || equipment.brand} {(equipment as any).indicator1Model || equipment.model} (S/N: {(equipment as any).indicator1SerialNumber || equipment.serialNumber || "—"}) [{(equipment as any).indicator1Type || "Digital"}]
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
          🛡️ CONDICIONES AMBIENTALES & TRAZABILIDAD A PATRONES NACIONALES (INTI / SAC)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 8 }}>
          <div><strong>Temperatura:</strong> {tempVal} ºC</div>
          <div><strong>Humedad Relativa:</strong> {humVal} %</div>
          <div><strong>Presión Atmosférica:</strong> {pressVal} hPa</div>
        </div>

        {weightsUsed.length > 0 && (
          <div style={{ borderTop: "1px dashed #eee", paddingTop: 6 }}>
            <strong>Patrones Empleados:</strong> {weightsUsed.map(w => `${w.code} (${w.nominalValue} ${w.unit || "kg"} Cl.${w.accuracyClass} Cert.${w.certificateNumber})`).join(" • ")}
          </div>
        )}
      </div>

      {/* Ensayo de Repetibilidad */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 8, color: "#0d9488" }}>
          1. ENSAYO DE REPETIBILIDAD / FIDELIDAD
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {repeatabilityData.halfMax && (
            <div style={{ background: "#fafafa", padding: 8, borderRadius: 4 }}>
              <strong>Carga ~50% Max ({repeatabilityData.halfMax.load} {equipment?.unit || "kg"})</strong>
              <div>Lecturas: {repeatabilityData.halfMax.repetitions?.join(", ")} {equipment?.unit || "kg"}</div>
              <div>Diferencia máxima (Rango): <strong>{repeatabilityData.halfMax.range} {equipment?.unit || "kg"}</strong> (EMT: ±{repeatabilityData.halfMax.emt} {equipment?.unit || "kg"})</div>
              <div style={{ color: repeatabilityData.halfMax.conform ? "#0d9488" : "#dc2626", fontWeight: 700, marginTop: 2 }}>
                Resultado: {repeatabilityData.halfMax.conform ? "✓ Conforme" : "✗ No Conforme"}
              </div>
            </div>
          )}

          {repeatabilityData.fullMax && (
            <div style={{ background: "#fafafa", padding: 8, borderRadius: 4 }}>
              <strong>Carga ~100% Max ({repeatabilityData.fullMax.load} {equipment?.unit || "kg"})</strong>
              <div>Lecturas: {repeatabilityData.fullMax.repetitions?.join(", ")} {equipment?.unit || "kg"}</div>
              <div>Diferencia máxima (Rango): <strong>{repeatabilityData.fullMax.range} {equipment?.unit || "kg"}</strong> (EMT: ±{repeatabilityData.fullMax.emt} {equipment?.unit || "kg"})</div>
              <div style={{ color: repeatabilityData.fullMax.conform ? "#0d9488" : "#dc2626", fontWeight: 700, marginTop: 2 }}>
                Resultado: {repeatabilityData.fullMax.conform ? "✓ Conforme" : "✗ No Conforme"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ensayo de Excentricidad */}
      {eccentricityData.positions && (
        <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
          <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 8, color: "#0d9488" }}>
            2. ENSAYO DE EXCENTRICIDAD DE CARGA (Carga de ensayo: {eccentricityData.testLoad} {equipment?.unit || "kg"})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 6 }}>
            {eccentricityData.positions.map((p: any) => (
              <div key={p.pos} style={{ background: "#fafafa", padding: 6, borderRadius: 4, textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "#666" }}>{p.label}</div>
                <strong style={{ fontSize: "0.85rem" }}>{p.indication} {equipment?.unit || "kg"}</strong>
                <div style={{ fontSize: "0.72rem", color: Math.abs(p.error) <= (eccentricityData.emt || 20) ? "#0d9488" : "#dc2626" }}>
                  Err: {p.error >= 0 ? `+${p.error}` : p.error}
                </div>
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

      {/* Ensayo de Linealidad */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 700, borderBottom: "1px solid #eee", paddingBottom: 4, marginBottom: 8, color: "#0d9488" }}>
          3. ENSAYO DE EXACTITUD Y LINEALIDAD (Cargas Crecientes y Decrecientes)
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
          <thead>
            <tr style={{ background: "#f0fdfa", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "4px 6px", textAlign: "left" }}>Paso</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Carga Patrón</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>EMT</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Lectura (↗)</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Error (↗)</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Lectura (↘)</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>Error (↘)</th>
              <th style={{ padding: "4px 6px", textAlign: "center" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {linearityData.map((r: any) => (
              <tr key={r.step} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "4px 6px" }}>#{r.step}</td>
                <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700 }}>{r.targetLoad?.toLocaleString("es-AR")} {equipment?.unit || "kg"}</td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>±{r.emt}</td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.ascIndication}</td>
                <td style={{ padding: "4px 6px", textAlign: "right", color: Math.abs(r.ascError) <= r.emt ? "inherit" : "#dc2626" }}>
                  {r.ascError >= 0 ? `+${r.ascError}` : r.ascError}
                </td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.descIndication}</td>
                <td style={{ padding: "4px 6px", textAlign: "right", color: Math.abs(r.descError) <= r.emt ? "inherit" : "#dc2626" }}>
                  {r.descError >= 0 ? `+${r.descError}` : r.descError}
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center", color: r.conform ? "#0d9488" : "#dc2626", fontWeight: 700 }}>
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
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: isApproved ? "#06574c" : "#dc2626" }}>
              {verdictText}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 4 }}>
              Incertidumbre Expandida de Medición: <strong>U = ±{expUncertainty} {equipment?.unit || "kg"}</strong> (k = 2, confianza 95.45%)
            </div>
            {report.observations && (
              <div style={{ fontSize: "0.8rem", marginTop: 6, color: "#333" }}>
                <strong>Observaciones:</strong> {report.observations}
              </div>
            )}
          </div>

          <div style={{ textAlign: "center", borderTop: "1px solid #444", paddingTop: 8, minWidth: 200 }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>{report.performedBy || "Metrólogo Autorizado"}</div>
            <div style={{ fontSize: "0.74rem", color: "#666" }}>Metrólogo / Responsable Técnico</div>
            <div style={{ fontSize: "0.74rem", color: "#666" }}>Laboratorio de Calibración</div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: "0.72rem", color: "#888" }}>
        Documento técnico emitido mediante el Sistema Modular de Metrología Legal & Calidad — Leal Control ERP
      </div>
    </div>
  );
}
