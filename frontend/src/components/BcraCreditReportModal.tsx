import React, { useEffect, useState } from "react";
import { bcraApi, type BcraCreditReport } from "../api/bcraApi";
import { api } from "../api/client";

interface Props {
  isOpen: boolean;
  cuit: string;
  customerId?: string;
  customerName?: string;
  onClose: () => void;
  onSavedToCustomer?: () => void;
  onApplyReport?: (report: BcraCreditReport) => void;
}

export function BcraCreditReportModal({ isOpen, cuit, customerId, customerName, onClose, onSavedToCustomer, onApplyReport }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BcraCreditReport | null>(null);

  useEffect(() => {
    if (isOpen && cuit) {
      setSaveSuccess(false);
      loadReport(cuit);
    } else {
      setReport(null);
      setError(null);
      setSaveSuccess(false);
    }
  }, [isOpen, cuit]);

  const handleSaveToCustomer = async () => {
    if (!report) return;
    try {
      setSaving(true);
      if (customerId) {
        await api.updateCustomerBcra(customerId, {
          creditRating: report.creditRating,
          worstSituation: report.worstSituation,
          totalDebt: report.totalDebtPesos,
          rejectedChequesCount: report.rejectedChequesCount,
          recommendation: report.commercialRecommendation
        });
      }
      if (onApplyReport) {
        onApplyReport(report);
      }
      setSaveSuccess(true);
      if (onSavedToCustomer) onSavedToCustomer();
    } catch (err: any) {
      alert("Error al guardar calificación: " + (err?.message || "Error desconocido"));
    } finally {
      setSaving(false);
    }
  };

  const loadReport = async (targetCuit: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await bcraApi.getReport(targetCuit);
      setReport(data);
    } catch (err: any) {
      setError(err?.message || "Error al consultar la Central de Deudores del BCRA.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getRatingBadge = (rating: string) => {
    switch (rating) {
      case "A":
        return { bg: "#ecfdf5", border: "#10b981", text: "#047857", label: "Calificación A (Excelente)", icon: "🟢" };
      case "B":
        return { bg: "#fefce8", border: "#eab308", text: "#854d0e", label: "Calificación B (Precaución)", icon: "🟡" };
      case "C":
        return { bg: "#fff7ed", border: "#f97316", text: "#9a3412", label: "Calificación C (Riesgo Alto)", icon: "🟠" };
      default:
        return { bg: "#fef2f2", border: "#ef4444", text: "#991b1b", label: "Calificación D (Crítico / No Apto)", icon: "🔴" };
    }
  };

  const badge = report ? getRatingBadge(report.creditRating) : null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.65)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "20px"
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: "12px",
        width: "100%",
        maxWidth: "750px",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.2rem" }}>🏛️</span>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                Informe Crediticio BCRA (Central de Deudores)
              </h2>
            </div>
            <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "2px" }}>
              Consulta oficial del Banco Central de la República Argentina para CUIT {cuit}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#ffffff",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: "1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>⏳</div>
              <strong>Consultando Central de Deudores del BCRA...</strong>
            </div>
          )}

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "0.85rem" }}>
              ⚠️ {error}
            </div>
          )}

          {report && !loading && (
            <div>
              {/* Rating & Recommendation Card */}
              {badge && (
                <div style={{
                  background: badge.bg,
                  border: `1.5px solid ${badge.border}`,
                  borderRadius: "8px",
                  padding: "14px 16px",
                  marginBottom: "16px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 800, fontSize: "1rem", color: badge.text }}>
                      <span>{badge.icon}</span>
                      <span>{badge.label}</span>
                    </div>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b" }}>
                      Período BCRA: {report.period}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#1e293b", fontWeight: 600 }}>
                    {report.commercialRecommendation}
                  </div>
                </div>
              )}

              {/* General Metrics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
                <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                    Situación Crediticia
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: report.worstSituation === 1 ? "#047857" : "#b91c1c", marginTop: "2px" }}>
                    Situación {report.worstSituation}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: "2px" }}>
                    {report.situationDescription}
                  </div>
                </div>

                <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                    Deuda Bancaria Total
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", marginTop: "2px", fontFamily: "monospace" }}>
                    $ {report.totalDebtPesos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                    En {report.entitiesCount} entidad(es) financiera(s)
                  </div>
                </div>

                <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                    Cheques Rechazados
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: report.rejectedChequesCount > 0 ? "#b91c1c" : "#047857", marginTop: "2px" }}>
                    {report.rejectedChequesCount} cheque(s)
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                    {report.rejectedChequesAmount > 0 ? `$ ${report.rejectedChequesAmount.toLocaleString("es-AR")}` : "Sin cheques sin fondos"}
                  </div>
                </div>
              </div>

              {/* Entities Table */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                <div style={{ background: "#f1f5f9", padding: "8px 12px", fontWeight: 700, fontSize: "0.8rem", color: "#334155" }}>
                  Detalle de Entidades Financieras Registradas:
                </div>
                {report.entities.length === 0 ? (
                  <div style={{ padding: "16px", textAlign: "center", color: "#047857", fontSize: "0.85rem" }}>
                    ✓ No registra deuda en ninguna entidad bancaria del sistema financiero argentino.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                        <th style={{ padding: "6px 10px" }}>Entidad Financiera</th>
                        <th style={{ padding: "6px 10px", textAlign: "center" }}>Situación</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Monto ($)</th>
                        <th style={{ padding: "6px 10px", textAlign: "center" }}>Atraso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.entities.map((ent, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 600, color: "#1e293b" }}>{ent.entity}</td>
                          <td style={{ padding: "6px 10px", textAlign: "center" }}>
                            <span style={{
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              background: ent.situation === 1 ? "#ecfdf5" : "#fef2f2",
                              color: ent.situation === 1 ? "#047857" : "#b91c1c"
                            }}>
                              Sit. {ent.situation}
                            </span>
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace" }}>
                            $ {(ent.amountThousands * 1000).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center", color: "#64748b" }}>
                            {ent.daysOverdue > 0 ? `${ent.daysOverdue} días` : "Al día"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
            Fuente: Central de Deudores BCRA (Normativa Ley 25.326 de Protección de Datos Personales)
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            {report && (
              <button
                type="button"
                onClick={handleSaveToCustomer}
                disabled={saving || saveSuccess}
                className="btn"
                style={{
                  background: saveSuccess ? "#059669" : "linear-gradient(135deg, #0d9488, #0f766e)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  padding: "8px 16px"
                }}
              >
                {saving
                  ? "Guardando..."
                  : saveSuccess
                  ? "✓ Calificación Guardada / Aplicada"
                  : customerId
                  ? "💾 Guardar en Ficha del Cliente"
                  : "✓ Aplicar Calificación al Formulario"}
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: "#0f172a", color: "#ffffff", border: "none", padding: "8px 18px", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
