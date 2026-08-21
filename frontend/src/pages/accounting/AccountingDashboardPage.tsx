import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

export function AccountingDashboardPage() {
  const [pnl, setPnl] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [accountsCount, setAccountsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getIncomeStatement(),
      api.listJournalEntries(),
      api.listAccounts()
    ])
      .then(([pnlData, entryList, accts]) => {
        setPnl(pnlData);
        setEntries(entryList.slice(0, 8));
        setAccountsCount(accts.length);
      })
      .catch((err) => console.error("Error loading accounting data", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>🏛️ Contabilidad Integral & Panel Ejecutivo (P&L)</h1>
          <p className="muted">Estado de resultados en tiempo real, libro diario de partida doble y balances</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link to="/contabilidad/asientos" className="btn">
            ➕ Nuevo Asiento Diario
          </Link>
          <Link to="/contabilidad/portal-estudio" className="btn ghost">
            🏢 Portal Estudio Contable
          </Link>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="tab-row">
        <Link to="/contabilidad" className="tab-btn active">
          📊 Tablero Ejecutivo & P&L
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
        <Link to="/contabilidad/portal-estudio" className="tab-btn">
          🏢 Cierres & IVA Digital (ARCA)
        </Link>
      </div>

      {loading ? (
        <div className="card pad" style={{ textAlign: "center", padding: "40px" }}>
          Cargando métricas contables...
        </div>
      ) : (
        <>
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
              <span style={{ fontSize: "24px", fontWeight: 800, color: pnl?.ebitda >= 0 ? "#22c55e" : "#f87171", margin: "2px 0" }}>
                $ {(pnl?.ebitda || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="muted" style={{ fontSize: "12px" }}>Rendimiento antes de intereses e impuestos</span>
            </div>
          </div>

          {/* Quick Access Modules Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <Link
              to="/contabilidad/plan-cuentas"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s", border: "1px solid var(--surface-border)" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>🌳</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "16px" }}>Plan de Cuentas Arbóreo</h3>
              <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                Estructura de 5 niveles adaptada a la normativa argentina con {accountsCount} cuentas configuradas.
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
                Carga ágil tipo Excel con validación estricta de partida doble y centros de costos.
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

            <Link
              to="/contabilidad/sumas-saldos"
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", transition: "transform 0.15s", border: "1px solid var(--surface-border)" }}
            >
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>⚖️</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "16px" }}>Balance de Sumas y Saldos</h3>
              <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
                Balance oficial a 8 columnas con segregación patrimonial y de resultados.
              </p>
            </Link>
          </div>

          {/* Recent Journal Entries */}
          <div className="card pad">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0 }}>Últimos Asientos Registrados en el Libro Diario</h3>
                <p className="muted" style={{ margin: 0, fontSize: "13px" }}>Registraciones automáticas y manuales del período</p>
              </div>
              <Link to="/contabilidad/asientos" className="btn ghost" style={{ fontSize: "13px" }}>
                Ver Libro Diario Completo →
              </Link>
            </div>

            {entries.length === 0 ? (
              <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>
                No hay asientos registrados aún. Creá el primer asiento con el botón superior.
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
    </div>
  );
}
