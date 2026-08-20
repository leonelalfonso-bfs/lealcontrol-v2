import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

export function TrialBalancePage() {
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getTrialBalance()
      .then((data) => setBalance(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>⚖️ Balance de Sumas y Saldos (8 Columnas)</h1>
          <p className="muted">Comprobación de sumas, saldos patrimoniales y de resultados</p>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="tab-row">
        <Link to="/contabilidad" className="tab-btn">
          📊 Tablero Ejecutivo & P&L
        </Link>
        <Link to="/contabilidad/plan-cuentas" className="tab-btn">
          🌳 Plan de Cuentas
        </Link>
        <Link to="/contabilidad/asientos" className="tab-btn">
          📖 Libro Diario
        </Link>
        <Link to="/contabilidad/mayor" className="tab-btn">
          🔍 Libro Mayor
        </Link>
        <Link to="/contabilidad/sumas-saldos" className="tab-btn active">
          ⚖️ Sumas y Saldos
        </Link>
        <Link to="/contabilidad/portal-estudio" className="tab-btn">
          🏢 Cierres & IVA Digital (ARCA)
        </Link>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="card pad">
        {loading ? (
          <p style={{ textAlign: "center", padding: 30 }}>Calculando balance de sumas y saldos...</p>
        ) : !balance ? (
          <p className="muted">No se pudieron cargar los datos del balance.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ verticalAlign: "middle" }}>Código</th>
                  <th rowSpan={2} style={{ verticalAlign: "middle" }}>Cuenta</th>
                  <th colSpan={2} style={{ textAlign: "center", background: "rgba(37, 99, 235, 0.08)" }}>1. Sumas</th>
                  <th colSpan={2} style={{ textAlign: "center", background: "rgba(16, 185, 129, 0.08)" }}>2. Saldos</th>
                  <th colSpan={2} style={{ textAlign: "center", background: "rgba(245, 158, 11, 0.08)" }}>3. Patrimoniales</th>
                  <th colSpan={2} style={{ textAlign: "center", background: "rgba(168, 85, 247, 0.08)" }}>4. Resultados</th>
                </tr>
                <tr>
                  <th style={{ textAlign: "right", background: "rgba(37, 99, 235, 0.05)" }}>Debe</th>
                  <th style={{ textAlign: "right", background: "rgba(37, 99, 235, 0.05)" }}>Haber</th>
                  <th style={{ textAlign: "right", background: "rgba(16, 185, 129, 0.05)" }}>Deudor</th>
                  <th style={{ textAlign: "right", background: "rgba(16, 185, 129, 0.05)" }}>Acreedor</th>
                  <th style={{ textAlign: "right", background: "rgba(245, 158, 11, 0.05)" }}>Activo</th>
                  <th style={{ textAlign: "right", background: "rgba(245, 158, 11, 0.05)" }}>Pasivo/PN</th>
                  <th style={{ textAlign: "right", background: "rgba(168, 85, 247, 0.05)" }}>Pérdidas</th>
                  <th style={{ textAlign: "right", background: "rgba(168, 85, 247, 0.05)" }}>Ganancias</th>
                </tr>
              </thead>
              <tbody>
                {balance.rows?.map((r: any, idx: number) => {
                  const isTitle = r.level < 4;
                  return (
                    <tr
                      key={idx}
                      style={{
                        background: r.level === 1 ? "rgba(37, 99, 235, 0.08)" : r.level === 2 ? "rgba(0,0,0,0.02)" : "transparent",
                        fontWeight: isTitle ? 700 : 400
                      }}
                    >
                      <td>
                        <code>{r.code}</code>
                      </td>
                      <td>
                        <div style={{ paddingLeft: (r.level - 1) * 14 }}>{r.name}</div>
                      </td>
                      <td style={{ textAlign: "right" }}>{r.sumDebit > 0 ? `$ ${r.sumDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td style={{ textAlign: "right" }}>{r.sumCredit > 0 ? `$ ${r.sumCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td style={{ textAlign: "right" }}>{r.debitBalance > 0 ? `$ ${r.debitBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td style={{ textAlign: "right" }}>{r.creditBalance > 0 ? `$ ${r.creditBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td style={{ textAlign: "right" }}>{r.assetBalance > 0 ? `$ ${r.assetBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td style={{ textAlign: "right" }}>{r.liabilityEquityBalance > 0 ? `$ ${r.liabilityEquityBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td style={{ textAlign: "right" }}>{r.lossBalance > 0 ? `$ ${r.lossBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td style={{ textAlign: "right" }}>{r.gainBalance > 0 ? `$ ${r.gainBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
