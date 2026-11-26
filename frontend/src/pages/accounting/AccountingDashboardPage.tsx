import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccountingTabs } from "../../components/accounting/AccountingTabs";
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
          <span className="eyebrow t-accent t-strong t-caps t-small" style={{ letterSpacing: "0.08em" }}>
            Sistema Contable & Panel de Control
          </span>
          <h1 style={{ margin: "2px 0 0" }}>
            🏛️ Tablero Contable & Estado de Resultados
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Estado de resultados en tiempo real, libro diario de partida doble y motor de asientos modelos.
          </p>
        </div>

        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          {/* BOTÓN PRINCIPAL CONTABILIZAR */}
          <button
            type="button"
            className="btn danger"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
            onClick={() => setShowBatchModal(true)}
          >
            <span>🔴 ► CONTABILIZAR</span>
            {(pendingSummary?.totalPendingCount ?? 0) > 0 && (
              <span className="alert t-small"
                style={{ fontWeight: 900 }}
              >
                {pendingSummary?.totalPendingCount}
              </span>
            )}
          </button>

          <Link to="/contabilidad/modelos" className="btn ghost">
            ⚙️ Asientos Modelos
          </Link>

          <Link to="/contabilidad/asientos" className="btn ghost">
            ➕ Asiento Manual
          </Link>
        </div>
      </div>

      <AccountingTabs />

      {loading ? (
        <div className="card pad t-center" style={{ padding: "40px" }}>
          Cargando métricas contables...
        </div>
      ) : (
        <>
          {/* Pending Documents Alert Banner */}
          {(pendingSummary?.totalPendingCount ?? 0) > 0 && (
            <div
              className="card pad"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="t-xl">⚡</span>
                <div>
                  <strong className="t-warn">
                    Hay {pendingSummary?.totalPendingCount} documentos operativos pendientes de contabilizar
                  </strong>
                  <div className="t-small t-warn">
                    Ventas: {pendingSummary?.salesPendingCount || 0} | Compras: {pendingSummary?.purchasesPendingCount || 0} | Finanzas: {pendingSummary?.financePendingCount || 0}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn compact danger"
                onClick={() => setShowBatchModal(true)}
              >
                🔴 Contabilizar Lote Ahora →
              </button>
            </div>
          )}

          {/* Executive P&L Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 20px" }}>
              <span className="muted t-small t-strong">Ingresos Operativos Totales</span>
              <span className="t-strong t-ok" style={{ fontSize: "24px", margin: "2px 0" }}>
                $ {(pnl?.revenues || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="muted t-small">Ventas, servicios y corretaje</span>
            </div>

            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 20px" }}>
              <span className="muted t-small t-strong">Costo de Ventas (CMV)</span>
              <span className="t-strong t-danger" style={{ fontSize: "24px", margin: "2px 0" }}>
                $ {(pnl?.cogs || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="muted t-small">Costo directo de mercaderías e insumos</span>
            </div>

            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 20px" }}>
              <span className="muted t-small t-strong">Margen Bruto Operativo</span>
              <span className="t-strong t-info" style={{ fontSize: "24px", margin: "2px 0" }}>
                $ {(pnl?.grossMargin || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="muted t-small">Margen: <strong>{pnl?.grossMarginPct || 0}%</strong> sobre ventas</span>
            </div>

            <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 20px" }}>
              <span className="muted t-small t-strong">EBITDA / Resultado Operativo</span>
              <span className="t-strong" style={{ fontSize: "24px", color: (pnl?.ebitda || 0) >= 0 ? "var(--lc-ok)" : "var(--lc-danger)", margin: "2px 0" }}>
                $ {(pnl?.ebitda || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="muted t-small">Rendimiento antes de intereses e impuestos</span>
            </div>
          </div>

          {/* Quick Access Modules Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            <Link
              to="/contabilidad/modelos"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>⚙️</div>
              <h3 style={{ margin: "0 0 6px" }}>Asientos Modelos</h3>
              <p className="muted t-small" style={{ margin: 0 }}>
                Configuración de plantillas por comprobante con variables de IVA, retenciones, cuentas y condiciones.
              </p>
            </Link>

            <Link
              to="/contabilidad/plan-cuentas"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>🌳</div>
              <h3 style={{ margin: "0 0 6px" }}>Plan de Cuentas Arbóreo</h3>
              <p className="muted t-small" style={{ margin: 0 }}>
                Estructura jerárquica con {accountsCount} cuentas contables listas para imputación.
              </p>
            </Link>

            <Link
              to="/contabilidad/asientos"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>📖</div>
              <h3 style={{ margin: "0 0 6px" }}>Libro Diario de Asientos</h3>
              <p className="muted t-small" style={{ margin: 0 }}>
                Asientos generados por lote y registros manuales con validación de partida doble.
              </p>
            </Link>

            <Link
              to="/contabilidad/mayor"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔍</div>
              <h3 style={{ margin: "0 0 6px" }}>Libro Mayor Dinámico</h3>
              <p className="muted t-small" style={{ margin: 0 }}>
                Consulta de movimientos y saldos acumulados progresivos de cualquier cuenta contable.
              </p>
            </Link>
          </div>

          {/* Recent Journal Entries */}
          <div className="card pad">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0 }}>Últimos Asientos Registrados en el Libro Diario</h3>
                <p className="muted t-small" style={{ margin: 0 }}>Registraciones automáticas del motor y manuales del período</p>
              </div>
              <Link to="/contabilidad/asientos" className="btn ghost">
                Ver Libro Diario Completo →
              </Link>
            </div>

            {entries.length === 0 ? (
              <p className="muted t-center" style={{ padding: "20px 0" }}>
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
                      <th className="t-right">Total Debe ($)</th>
                      <th className="t-right">Total Haber ($)</th>
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
                            <div className="muted t-small">
                              Doc: {e.sourceDocumentId}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="badge ok">{e.sourceModule}</span>
                        </td>
                        <td className="t-right t-strong">
                          $ {e.totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="t-right t-strong">
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
