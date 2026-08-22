import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { UnpostedDocumentsSummary } from "../../api/types";
import { BatchPostingModal } from "./BatchPostingModal";

export function AccountingDashboardPage() {
  const [pnl, setPnl] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [accountsCount, setAccountsCount] = useState(0);
  const [pendingSummary, setPendingSummary] = useState<UnpostedDocumentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBatchModal, setShowBatchModal] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.getIncomeStatement().catch(() => null),
      api.listJournalEntries().catch(() => []),
      api.listAccounts().catch(() => []),
      api.getUnpostedDocumentsSummary().catch(() => null)
    ])
      .then(([pnlData, entryList, accts, unposted]) => {
        setPnl(pnlData);
        setEntries((entryList || []).slice(0, 8));
        setAccountsCount((accts || []).length);
        setPendingSummary(unposted);
      })
      .catch((err) => console.error("Error loading accounting data", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="stack" style={{ gap: 24 }}>
      {/* Page Header with Action Buttons */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Sistema Contable & Panel de Control
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            🏛️ Tablero Contable & Estado de Resultados
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Estado de resultados en tiempo real, libro diario de partida doble y motor de asientos modelos.
          </p>
        </div>

        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          {/* BOTÓN PRINCIPAL CONTABILIZAR */}
          <button
            type="button"
            className="btn"
            style={{
              background: "#dc2626",
              color: "#fff",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 4px 6px -1px rgba(220, 38, 38, 0.3)"
            }}
            onClick={() => setShowBatchModal(true)}
          >
            <span>🔴 ► CONTABILIZAR</span>
            {(pendingSummary?.totalPendingCount ?? 0) > 0 && (
              <span
                style={{
                  background: "#fff",
                  color: "#dc2626",
                  padding: "2px 7px",
                  borderRadius: 10,
                  fontSize: "0.76rem",
                  fontWeight: 900
                }}
              >
                {pendingSummary?.totalPendingCount}
              </span>
            )}
          </button>

          <Link to="/contabilidad/modelos" className="btn ghost" style={{ fontWeight: 600 }}>
            ⚙️ Asientos Modelos
          </Link>

          <Link to="/contabilidad/asientos" className="btn ghost">
            ➕ Asiento Manual
          </Link>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="tab-row" style={{ display: "flex", gap: 8, overflowX: "auto", borderBottom: "1px solid var(--surface-border)", paddingBottom: 6 }}>
        <Link to="/contabilidad" className="tab-btn active">
          📊 Tablero & P&L
        </Link>
        <Link to="/contabilidad/modelos" className="tab-btn">
          ⚙️ Asientos Modelos
        </Link>
        <Link to="/contabilidad/plan-cuentas" className="tab-btn">
          🌳 Plan de Cuentas ({accountsCount})
        </Link>
        <Link to="/contabilidad/asientos" className="tab-btn">
          📖 Libro Diario
        </Link>
        <Link to="/contabilidad/mayor" className="tab-btn">
          🔍 Libro Mayor
        </Link>
        <Link to="/contabilidad/sumas-saldos" className="tab-btn">
          ⚖️ Sumas y Saldos (8 Col.)
        </Link>
        <Link to="/contabilidad/conciliacion" className="tab-btn">
          🏦 Conciliación Bancaria
        </Link>
        <Link to="/contabilidad/portal-estudio" className="tab-btn">
          🏢 Cierres & IVA Digital
        </Link>
      </div>

      {loading ? (
        <div className="card pad" style={{ textAlign: "center", padding: "40px" }}>
          Cargando métricas contables...
        </div>
      ) : (
        <>
          {/* Pending Documents Alert Banner */}
          {(pendingSummary?.totalPendingCount ?? 0) > 0 && (
            <div
              className="card pad"
              style={{
                background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
                border: "1px solid #fde68a",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: "1.6rem" }}>⚡</span>
                <div>
                  <strong style={{ color: "#92400e", fontSize: "0.95rem" }}>
                    Hay {pendingSummary?.totalPendingCount} documentos operativos pendientes de contabilizar
                  </strong>
                  <div style={{ fontSize: "0.82rem", color: "#b45309" }}>
                    Ventas: {pendingSummary?.salesPendingCount || 0} | Compras: {pendingSummary?.purchasesPendingCount || 0} | Finanzas: {pendingSummary?.financePendingCount || 0}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn compact"
                style={{ background: "#dc2626", color: "#fff", fontWeight: 700 }}
                onClick={() => setShowBatchModal(true)}
              >
                🔴 Contabilizar Lote Ahora →
              </button>
            </div>
          )}

          {/* Executive P&L Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 20px" }}>
              <span className="muted" style={{ fontSize: "13px", fontWeight: 600 }}>Ingresos Operativos Totales</span>
              <span style={{ fontSize: "24px", fontWeight: 800, color: "#22c55e", margin: "2px 0" }}>
                $ {(pnl?.revenues || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="muted" style={{ fontSize: "12px" }}>Ventas, servicios y corretaje</span>
            </div>

            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 20px" }}>
              <span className="muted" style={{ fontSize: "13px", fontWeight: 600 }}>Costo de Ventas (CMV)</span>
              <span style={{ fontSize: "24px", fontWeight: 800, color: "#f87171", margin: "2px 0" }}>
                $ {(pnl?.cogs || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="muted" style={{ fontSize: "12px" }}>Costo directo de mercaderías e insumos</span>
            </div>

            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 20px" }}>
              <span className="muted" style={{ fontSize: "13px", fontWeight: 600 }}>Margen Bruto Operativo</span>
              <span style={{ fontSize: "24px", fontWeight: 800, color: "#38bdf8", margin: "2px 0" }}>
                $ {(pnl?.grossMargin || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="muted" style={{ fontSize: "12px" }}>Margen: <strong>{pnl?.grossMarginPct || 0}%</strong> sobre ventas</span>
            </div>

            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 20px" }}>
              <span className="muted" style={{ fontSize: "13px", fontWeight: 600 }}>EBITDA / Resultado Operativo</span>
              <span style={{ fontSize: "24px", fontWeight: 800, color: (pnl?.ebitda || 0) >= 0 ? "#22c55e" : "#f87171", margin: "2px 0" }}>
                $ {(pnl?.ebitda || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="muted" style={{ fontSize: "12px" }}>Rendimiento antes de intereses e impuestos</span>
            </div>
          </div>

          {/* Quick Access Modules Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            <Link
              to="/contabilidad/modelos"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s", border: "1px solid #0d9488" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>⚙️</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "16px", color: "#0f766e" }}>Asientos Modelos</h3>
              <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                Configuración de plantillas por comprobante con variables de IVA, retenciones, cuentas y condiciones.
              </p>
            </Link>

            <Link
              to="/contabilidad/plan-cuentas"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s", border: "1px solid var(--surface-border)" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>🌳</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "16px" }}>Plan de Cuentas Arbóreo</h3>
              <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                Estructura jerárquica con {accountsCount} cuentas contables listas para imputación.
              </p>
            </Link>

            <Link
              to="/contabilidad/asientos"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s", border: "1px solid var(--surface-border)" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>📖</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "16px" }}>Libro Diario de Asientos</h3>
              <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                Asientos generados por lote y registros manuales con validación de partida doble.
              </p>
            </Link>

            <Link
              to="/contabilidad/mayor"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s", border: "1px solid var(--surface-border)" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔍</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "16px" }}>Libro Mayor Dinámico</h3>
              <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                Consulta de movimientos y saldos acumulados progresivos de cualquier cuenta contable.
              </p>
            </Link>
          </div>

          {/* Recent Journal Entries */}
          <div className="card pad">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0 }}>Últimos Asientos Registrados en el Libro Diario</h3>
                <p className="muted" style={{ margin: 0, fontSize: "13px" }}>Registraciones automáticas del motor y manuales del período</p>
              </div>
              <Link to="/contabilidad/asientos" className="btn ghost" style={{ fontSize: "13px" }}>
                Ver Libro Diario Completo →
              </Link>
            </div>

            {entries.length === 0 ? (
              <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>
                No hay asientos registrados aún. Usá el botón <strong>🔴 ► CONTABILIZAR</strong> para procesar comprobantes de gestión.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nº Asiento</th>
                      <th>Fecha</th>
                      <th>Concepto / Glosa</th>
                      <th>Origen</th>
                      <th style={{ textAlign: "right" }}>Total Debe ($)</th>
                      <th style={{ textAlign: "right" }}>Total Haber ($)</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <strong>#{e.entryNumber}</strong>
                        </td>
                        <td>{new Date(e.date).toLocaleDateString("es-AR")}</td>
                        <td>
                          <strong>{e.concept}</strong>
                          {e.sourceDocumentId && (
                            <div className="muted" style={{ fontSize: "11px" }}>
                              Doc: {e.sourceDocumentId}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="badge ok">{e.sourceModule}</span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          $ {e.totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          $ {e.totalCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <span className="badge ok">✓ Registrado</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Batch Posting Wizard Modal */}
      <BatchPostingModal
        isOpen={showBatchModal}
        onClose={() => {
          setShowBatchModal(false);
          loadData();
        }}
      />
    </div>
  );
}
