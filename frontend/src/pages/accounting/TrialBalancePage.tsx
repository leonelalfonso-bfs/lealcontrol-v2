import React, { useEffect, useState } from "react";
import { AccountingTabs } from "../../components/accounting/AccountingTabs";
import { api } from "../../api/client";

import { todayAr } from "../../lib/dates";
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

  const handleExportCsv = () => {
    if (!balance || !balance.rows || balance.rows.length === 0) return;
    const headers = "Codigo;Cuenta;Nivel;Sumas_Debe;Sumas_Haber;Saldos_Deudor;Saldos_Acreedor;Patrimonial_Activo;Patrimonial_PasivoPN;Resultados_Perdida;Resultados_Ganancia";
    const rows = balance.rows.map((r: any) =>
      `"${r.code}";"${r.name.replace(/"/g, '""')}";${r.level};${r.sumDebit || 0};${r.sumCredit || 0};${r.debitBalance || 0};${r.creditBalance || 0};${r.assetBalance || 0};${r.liabilityEquityBalance || 0};${r.lossBalance || 0};${r.gainBalance || 0}`
    );
    const csvContent = "\uFEFF" + [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `BALANCE_SUMAS_Y_SALDOS_8_COLUMNAS_${todayAr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>⚖️ Balance de Sumas y Saldos (8 Columnas)</h1>
          <p className="muted">Comprobación de sumas, saldos patrimoniales y de resultados oficial</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn ghost" onClick={handleExportCsv} disabled={!balance?.rows?.length}>
            📥 Exportar Excel (8 Columnas)
          </button>
          <button type="button" className="btn ghost" onClick={() => window.print()}>
            🖨️ Imprimir / PDF Oficial
          </button>
        </div>
      </div>

      <AccountingTabs />

      {error && <div className="alert">{error}</div>}

      <div className="card pad">
        {loading ? (
          <p className="t-center" style={{ padding: 30 }}>Calculando balance de sumas y saldos...</p>
        ) : !balance ? (
          <p className="muted">No se pudieron cargar los datos del balance.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th rowSpan={2}>Código</th>
                  <th rowSpan={2}>Cuenta</th>
                  <th className="t-center" colSpan={2} style={{ background: "rgba(37, 99, 235, 0.08)" }}>1. Sumas</th>
                  <th className="t-center" colSpan={2} style={{ background: "rgba(16, 185, 129, 0.08)" }}>2. Saldos</th>
                  <th className="t-center" colSpan={2} style={{ background: "rgba(245, 158, 11, 0.08)" }}>3. Patrimoniales</th>
                  <th className="t-center" colSpan={2} style={{ background: "rgba(168, 85, 247, 0.08)" }}>4. Resultados</th>
                </tr>
                <tr>
                  <th className="t-right" style={{ background: "rgba(37, 99, 235, 0.05)" }}>Debe</th>
                  <th className="t-right" style={{ background: "rgba(37, 99, 235, 0.05)" }}>Haber</th>
                  <th className="t-right" style={{ background: "rgba(16, 185, 129, 0.05)" }}>Deudor</th>
                  <th className="t-right" style={{ background: "rgba(16, 185, 129, 0.05)" }}>Acreedor</th>
                  <th className="t-right" style={{ background: "rgba(245, 158, 11, 0.05)" }}>Activo</th>
                  <th className="t-right" style={{ background: "rgba(245, 158, 11, 0.05)" }}>Pasivo/PN</th>
                  <th className="t-right" style={{ background: "rgba(168, 85, 247, 0.05)" }}>Pérdidas</th>
                  <th className="t-right" style={{ background: "rgba(168, 85, 247, 0.05)" }}>Ganancias</th>
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
                      <td className="t-right">{r.sumDebit > 0 ? `$ ${r.sumDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="t-right">{r.sumCredit > 0 ? `$ ${r.sumCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="t-right">{r.debitBalance > 0 ? `$ ${r.debitBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="t-right">{r.creditBalance > 0 ? `$ ${r.creditBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="t-right">{r.assetBalance > 0 ? `$ ${r.assetBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="t-right">{r.liabilityEquityBalance > 0 ? `$ ${r.liabilityEquityBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="t-right">{r.lossBalance > 0 ? `$ ${r.lossBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
                      <td className="t-right">{r.gainBalance > 0 ? `$ ${r.gainBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}</td>
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
