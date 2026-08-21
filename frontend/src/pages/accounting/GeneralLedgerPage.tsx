import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";

export function GeneralLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAccount = searchParams.get("accountCode") || "1.1.01.002"; // Banco Galicia default

  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountCode, setSelectedAccountCode] = useState(initialAccount);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [ledgerData, setLedgerData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listAccounts()
      .then((data) => setAccounts(data.filter((a) => a.isDirectPosting)))
      .catch((err) => console.error(err));
  }, []);

  const loadLedger = (code: string) => {
    if (!code) return;
    setLoading(true);
    setError(null);
    api.getLedger(code, {
      startDate: startDate || undefined,
      endDate: endDate || undefined
    })
      .then((data) => setLedgerData(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (selectedAccountCode) {
      loadLedger(selectedAccountCode);
    }
  }, [selectedAccountCode]);

  const handleAccountChange = (code: string) => {
    setSelectedAccountCode(code);
    setSearchParams({ accountCode: code });
  };

  let runningBalance = 0;

  const handleExportCsv = () => {
    if (!ledgerData || !ledgerData.entries || ledgerData.entries.length === 0) return;
    const headers = "Cuenta_Codigo;Cuenta_Nombre;Fecha;Asiento;Concepto;Debe;Haber;Saldo_Acumulado;Centro_Costo";
    let curBal = 0;
    const rows = ledgerData.entries.map((e: any) => {
      curBal += (Number(e.debit) || 0) - (Number(e.credit) || 0);
      return `"${ledgerData.accountCode}";"${ledgerData.accountName.replace(/"/g, '""')}";${new Date(e.date).toLocaleDateString("es-AR")};${e.entryNumber};"${e.concept.replace(/"/g, '""')}";${e.debit || 0};${e.credit || 0};${curBal};"${e.costCenterCode || ""}"`;
    });
    const csvContent = "\uFEFF" + [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `LIBRO_MAYOR_${ledgerData.accountCode}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>🔍 Libro Mayor por Cuenta Contable</h1>
          <p className="muted">Detalle cronológico de débitos, créditos y saldo acumulado progresivo</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn ghost" onClick={handleExportCsv} disabled={!ledgerData?.entries?.length}>
            📥 Exportar Excel (CSV)
          </button>
          <button type="button" className="btn ghost" onClick={() => window.print()}>
            🖨️ Imprimir / PDF
          </button>
          <Link to="/contabilidad/asientos" className="btn">
            ➕ Nuevo Asiento
          </Link>
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
        <Link to="/contabilidad/mayor" className="tab-btn active">
          🔍 Libro Mayor
        </Link>
        <Link to="/contabilidad/sumas-saldos" className="tab-btn">
          ⚖️ Sumas y Saldos
        </Link>
        <Link to="/contabilidad/conciliacion" className="tab-btn">
          🏦 Conciliación Bancaria
        </Link>
        <Link to="/contabilidad/portal-estudio" className="tab-btn">
          🏢 Cierres & IVA Digital (ARCA)
        </Link>
      </div>

      {/* Account Selector & Filters Bar */}
      <div className="card pad">
        <div className="grid-3" style={{ gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: "13px" }}>
              Seleccionar Cuenta Contable:
            </label>
            <select
              value={selectedAccountCode}
              onChange={(e) => handleAccountChange(e.target.value)}
              style={{ width: "100%" }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.code} - {a.name} ({a.accountType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: "13px" }}>
              Fecha Desde:
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: "13px" }}>
              Fecha Hasta:
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={() => loadLedger(selectedAccountCode)}>
            🔄 Actualizar Mayor
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* Account Summary Stats */}
      {ledgerData && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total Débitos (Debe)</span>
            <span className="stat-val" style={{ color: "#22c55e" }}>
              $ {(ledgerData.totalDebit || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Total Créditos (Haber)</span>
            <span className="stat-val" style={{ color: "#38bdf8" }}>
              $ {(ledgerData.totalCredit || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Saldo Actual ({ledgerData.nature})</span>
            <span className="stat-val" style={{ color: "#facc15" }}>
              $ {(ledgerData.balance || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Movimientos Registrados</span>
            <span className="stat-val">{ledgerData.movementsCount || 0}</span>
          </div>
        </div>
      )}

      {/* Movements Table */}
      <div className="card pad">
        <h3>Movimientos de la Cuenta: <code>{selectedAccountCode}</code></h3>
        {loading ? (
          <p style={{ textAlign: "center", padding: 30 }}>Cargando movimientos del mayor...</p>
        ) : !ledgerData || ledgerData.lines?.length === 0 ? (
          <p className="muted" style={{ textAlign: "center", padding: 30 }}>
            No hay movimientos registrados para esta cuenta en el rango seleccionado.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Centro de Costos</th>
                  <th>Leyenda / Detalle</th>
                  <th style={{ textAlign: "right" }}>Debe ($)</th>
                  <th style={{ textAlign: "right" }}>Haber ($)</th>
                  <th style={{ textAlign: "right" }}>Saldo Progresivo ($)</th>
                </tr>
              </thead>
              <tbody>
                {ledgerData.lines.map((l: any, idx: number) => {
                  const isDebtor = ledgerData.nature === "Deudor";
                  if (isDebtor) {
                    runningBalance += (l.debit - l.credit);
                  } else {
                    runningBalance += (l.credit - l.debit);
                  }

                  return (
                    <tr key={l.id || idx}>
                      <td>{l.costCenterName || l.costCenterCode || "General"}</td>
                      <td>{l.memo || "Movimiento diario"}</td>
                      <td style={{ textAlign: "right", color: l.debit > 0 ? "#22c55e" : "inherit" }}>
                        {l.debit > 0 ? `$ ${l.debit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td style={{ textAlign: "right", color: l.credit > 0 ? "#38bdf8" : "inherit" }}>
                        {l.credit > 0 ? `$ ${l.credit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>
                        $ {runningBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
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
