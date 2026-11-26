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
        return { bg: "var(--lc-ok-bg)", border: "var(--lc-ok)", text: "var(--lc-ok)", label: "Calificación A (Excelente)", icon: "🟢" };
      case "B":
        return { bg: "#fefce8", border: "var(--lc-warn)", text: "#854d0e", label: "Calificación B (Precaución)", icon: "🟡" };
      case "C":
        return { bg: "var(--lc-warn-bg)", border: "#f97316", text: "#9a3412", label: "Calificación C (Riesgo Alto)", icon: "🟠" };
      default:
        return { bg: "var(--lc-danger-bg)", border: "var(--lc-danger)", text: "var(--lc-danger)", label: "Calificación D (Crítico / No Apto)", icon: "🔴" };
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
        background: "var(--lc-surface)",
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
          background: "linear-gradient(135deg, var(--lc-ink) 0%, var(--lc-ink) 100%)",
          color: "#fff",
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
            <div style={{ fontSize: "0.78rem", color: "var(--lc-ink-3)", marginTop: "2px" }}>
              Consulta oficial del Banco Central de la República Argentina para CUIT {cuit}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#fff",
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
            <div style={{ padding: "40px", textAlign: "center", color: "var(--lc-ink-3)" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>⏳</div>
              <strong>Consultando Central de Deudores del BCRA...</strong>
            </div>
          )}

          {error && (
            <div style={{ background: "var(--lc-danger-bg)", border: "1px solid var(--lc-danger)", color: "var(--lc-danger)", padding: "12px 16px", borderRadius: "8px", fontSize: "0.85rem" }}>
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
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--lc-ink-3)" }}>
                      Período BCRA: {report.period}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--lc-ink)", fontWeight: 600 }}>
                    {report.commercialRecommendation}
                  </div>
                </div>
              )}

              {/* General Metrics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
                <div style={{ background: "var(--lc-surface-2)", padding: "12px", borderRadius: "8px", border: "1px solid var(--lc-line)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--lc-ink-3)", fontWeight: 700, textTransform: "uppercase" }}>
                    Situación Crediticia
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: report.worstSituation === 1 ? "var(--lc-ok)" : "var(--lc-danger)", marginTop: "2px" }}>
                    Situación {report.worstSituation}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--lc-ink-2)", marginTop: "2px" }}>
                    {report.situationDescription}
                  </div>
                </div>

                <div style={{ background: "var(--lc-surface-2)", padding: "12px", borderRadius: "8px", border: "1px solid var(--lc-line)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--lc-ink-3)", fontWeight: 700, textTransform: "uppercase" }}>
                    Deuda Bancaria Total
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--lc-ink)", marginTop: "2px", fontFamily: "monospace" }}>
                    $ {report.totalDebtPesos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--lc-ink-3)", marginTop: "2px" }}>
                    En {report.entitiesCount} entidad(es) financiera(s)
                  </div>
                </div>

                <div style={{ background: "var(--lc-surface-2)", padding: "12px", borderRadius: "8px", border: "1px solid var(--lc-line)" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--lc-ink-3)", fontWeight: 700, textTransform: "uppercase" }}>
                    Cheques Rechazados
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: report.rejectedChequesCount > 0 ? "var(--lc-danger)" : "var(--lc-ok)", marginTop: "2px" }}>
                    {report.rejectedChequesCount} cheque(s)
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--lc-ink-3)", marginTop: "2px" }}>
                    {report.rejectedChequesAmount > 0 ? `$ ${report.rejectedChequesAmount.toLocaleString("es-AR")}` : "Sin cheques sin fondos"}
                  </div>
                </div>
              </div>

              {/* Entities Table */}
              <div style={{ background: "var(--lc-surface)", border: "1px solid var(--lc-line)", borderRadius: "8px", overflow: "hidden" }}>
                <div style={{ background: "var(--lc-surface-2)", padding: "8px 12px", fontWeight: 700, fontSize: "0.8rem", color: "var(--lc-ink-2)" }}>
                  Detalle de Entidades Financieras Registradas:
                </div>
                {report.entities.length === 0 ? (
                  <div style={{ padding: "16px", textAlign: "center", color: "var(--lc-ok)", fontSize: "0.85rem" }}>
                    ✓ No registra deuda en ninguna entidad bancaria del sistema financiero argentino.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "var(--lc-surface-2)", borderBottom: "1px solid var(--lc-line)", textAlign: "left", color: "var(--lc-ink-3)" }}>
                        <th style={{ padding: "6px 10px" }}>Entidad Financiera</th>
                        <th style={{ padding: "6px 10px", textAlign: "center" }}>Situación</th>
                        <th style={{ padding: "6px 10px", textAlign: "right" }}>Monto ($)</th>
                        <th style={{ padding: "6px 10px", textAlign: "center" }}>Atraso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.entities.map((ent, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--lc-surface-2)" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 600, color: "var(--lc-ink)" }}>{ent.entity}</td>
                          <td style={{ padding: "6px 10px", textAlign: "center" }}>
                            <span style={{
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              background: ent.situation === 1 ? "var(--lc-ok-bg)" : "var(--lc-danger-bg)",
                              color: ent.situation === 1 ? "var(--lc-ok)" : "var(--lc-danger)"
                            }}>
                              Sit. {ent.situation}
                            </span>
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace" }}>
                            $ {(ent.amountThousands * 1000).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--lc-ink-3)" }}>
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
        <div style={{ padding: "12px 20px", background: "var(--lc-surface-2)", borderTop: "1px solid var(--lc-line)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--lc-ink-3)" }}>
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
                  color: "#fff",
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
              style={{ background: "var(--lc-ink)", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
