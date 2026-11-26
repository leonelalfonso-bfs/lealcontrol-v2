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
    <div className="modal-backdrop">
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
              <h2 style={{ margin: 0 }}>
                Informe Crediticio BCRA (Central de Deudores)
              </h2>
            </div>
            <div className="t-small muted" style={{ marginTop: "2px" }}>
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
            <div className="t-center muted" style={{ padding: "40px" }}>
              <div className="t-xl" style={{ marginBottom: "8px" }}>⏳</div>
              <strong>Consultando Central de Deudores del BCRA...</strong>
            </div>
          )}

          {error && (
            <div className="alert t-small">
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
                    <div className="t-strong" style={{ display: "flex", alignItems: "center", gap: "6px", color: badge.text }}>
                      <span>{badge.icon}</span>
                      <span>{badge.label}</span>
                    </div>
                    <span className="t-small t-strong muted">
                      Período BCRA: {report.period}
                    </span>
                  </div>
                  <div className="t-small t-strong">
                    {report.commercialRecommendation}
                  </div>
                </div>
              )}

              {/* General Metrics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
                <div className="box">
                  <div className="t-small muted t-strong t-caps">
                    Situación Crediticia
                  </div>
                  <div className="t-strong" style={{ fontSize: "1.1rem", color: report.worstSituation === 1 ? "var(--lc-ok)" : "var(--lc-danger)", marginTop: "2px" }}>
                    Situación {report.worstSituation}
                  </div>
                  <div className="t-small muted" style={{ marginTop: "2px" }}>
                    {report.situationDescription}
                  </div>
                </div>

                <div className="box">
                  <div className="t-small muted t-strong t-caps">
                    Deuda Bancaria Total
                  </div>
                  <div className="t-strong t-mono" style={{ fontSize: "1.1rem", marginTop: "2px" }}>
                    $ {report.totalDebtPesos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="t-small muted" style={{ marginTop: "2px" }}>
                    En {report.entitiesCount} entidad(es) financiera(s)
                  </div>
                </div>

                <div className="box">
                  <div className="t-small muted t-strong t-caps">
                    Cheques Rechazados
                  </div>
                  <div className="t-strong" style={{ fontSize: "1.1rem", color: report.rejectedChequesCount > 0 ? "var(--lc-danger)" : "var(--lc-ok)", marginTop: "2px" }}>
                    {report.rejectedChequesCount} cheque(s)
                  </div>
                  <div className="t-small muted" style={{ marginTop: "2px" }}>
                    {report.rejectedChequesAmount > 0 ? `$ ${report.rejectedChequesAmount.toLocaleString("es-AR")}` : "Sin cheques sin fondos"}
                  </div>
                </div>
              </div>

              {/* Entities Table */}
              <div style={{ background: "var(--lc-surface)", border: "1px solid var(--lc-line)", borderRadius: "8px", overflow: "hidden" }}>
                <div className="t-strong t-small muted" style={{ background: "var(--lc-surface-2)", padding: "8px 12px" }}>
                  Detalle de Entidades Financieras Registradas:
                </div>
                {report.entities.length === 0 ? (
                  <div className="t-center t-ok t-small" style={{ padding: "16px" }}>
                    ✓ No registra deuda en ninguna entidad bancaria del sistema financiero argentino.
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Entidad Financiera</th>
                        <th className="t-center">Situación</th>
                        <th className="t-right">Monto ($)</th>
                        <th className="t-center">Atraso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.entities.map((ent, idx) => (
                        <tr key={idx}>
                          <td className="t-strong">{ent.entity}</td>
                          <td className="t-center">
                            <span className="alert t-small t-strong">
                              Sit. {ent.situation}
                            </span>
                          </td>
                          <td className="t-right t-mono">
                            $ {(ent.amountThousands * 1000).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="t-center muted">
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
          <div className="t-small muted">
            Fuente: Central de Deudores BCRA (Normativa Ley 25.326 de Protección de Datos Personales)
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            {report && (
              <button
                type="button"
                onClick={handleSaveToCustomer}
                disabled={saving || saveSuccess}
                className="btn"
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
            <button className="t-strong t-small"
              onClick={onClose}
              style={{ background: "var(--lc-ink)", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "6px", cursor: "pointer" }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
