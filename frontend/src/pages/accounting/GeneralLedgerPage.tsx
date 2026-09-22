import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";

export function GeneralLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAccount = searchParams.get("accountCode") || "1.1.01.002";

  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountCode, setSelectedAccountCode] = useState(initialAccount);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [ledgerItem, setLedgerItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listAccounts()
      .then((data) => {
        const imputables = (data || []).filter((a: any) => a.isDirectPosting !== false);
        setAccounts(imputables);
        if (imputables.length > 0 && !selectedAccountCode) {
          setSelectedAccountCode(imputables[0].code);
        }
      })
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
      .then((data: any) => {
        if (Array.isArray(data) && data.length > 0) {
          setLedgerItem(data[0]);
        } else if (data && !Array.isArray(data)) {
          setLedgerItem(data);
        } else {
          setLedgerItem(null);
        }
      })
      .catch((err) => setError(err?.message || "Error al cargar el Libro Mayor."))
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

  const handleExportCsv = () => {
    if (!ledgerItem || !ledgerItem.movements || ledgerItem.movements.length === 0) return;
    const acc = ledgerItem.account || {};
    const headers = "Fecha;Asiento;Concepto;Origen;Centro_Costo;Debe;Haber;Saldo_Acumulado;Detalle";
    const rows = (ledgerItem.movements || []).map((m: any) => {
      const fecha = m.date ? new Date(m.date).toLocaleDateString("es-AR") : "-";
      const conc = (m.concept || "").replace(/"/g, '""');
      const memo = (m.memo || "").replace(/"/g, '""');
      return `"${fecha}";${m.entryNumber || ""};"${conc}";"${m.sourceModule || ""}";"${m.costCenterName || ""}";${m.debit || 0};${m.credit || 0};${m.runningBalance || 0};"${memo}"`;
    });
    const csvContent = "\uFEFF" + [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `LIBRO_MAYOR_${acc.code || selectedAccountCode}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const accountInfo = ledgerItem?.account || accounts.find((a) => a.code === selectedAccountCode) || {};
  const movements = ledgerItem?.movements || [];

  return (
    <div className="pad stack" style={{ gap: 20 }}>
      {/* Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <Link to="/contabilidad" className="btn ghost" style={{ padding: "4px 8px" }}>← Tablero</Link>
            <h2>🔍 Libro Mayor por Cuenta Contable</h2>
          </div>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Detalle cronológico de movimientos, saldos iniciales, débitos, créditos y saldo acumulado.
          </span>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn ghost" onClick={handleExportCsv} disabled={movements.length === 0}>
            📥 Exportar Excel (CSV)
          </button>
          <button type="button" className="btn ghost" onClick={() => window.print()}>
            🖨️ Imprimir / PDF
          </button>
          <Link to="/contabilidad/asientos" className="btn primary">
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

      {/* Filter Card */}
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

      {error && <div className="alert error">⚠️ {error}</div>}

      {/* Stats Summary */}
      {ledgerItem && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Saldo Inicial Anterior</span>
            <span className="stat-val" style={{ color: "#64748b" }}>
              $ {(ledgerItem.initialBalance || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Total Débitos (Debe)</span>
            <span className="stat-val" style={{ color: "#22c55e" }}>
              $ {(ledgerItem.totalDebit || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Total Créditos (Haber)</span>
            <span className="stat-val" style={{ color: "#38bdf8" }}>
              $ {(ledgerItem.totalCredit || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Saldo Final Acumulado</span>
            <span className="stat-val" style={{ color: "#f59e0b", fontWeight: 700 }}>
              $ {(ledgerItem.finalBalance || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Movements Table */}
      <div className="card pad">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3>
            Movimientos de la Cuenta: <code>{accountInfo.code || selectedAccountCode}</code> - {accountInfo.name || ""}
          </h3>
          <span className="badge primary" style={{ fontSize: "0.75rem" }}>
            {accountInfo.accountType || "Asset"}
          </span>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", padding: 30 }} className="muted">Cargando movimientos del mayor...</p>
        ) : movements.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40 }} className="muted">
            <p style={{ fontSize: "1.1rem", marginBottom: 6 }}>No hay movimientos registrados para esta cuenta.</p>
            <span style={{ fontSize: "0.85rem" }}>Probá seleccionando otra cuenta o ampliando el rango de fechas.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Fecha</th>
                  <th style={{ width: 90, textAlign: "center" }}>Asiento Nº</th>
                  <th>Concepto Principal</th>
                  <th style={{ width: 110 }}>Origen</th>
                  <th style={{ width: 140 }}>Centro de Costos</th>
                  <th style={{ width: 120, textAlign: "right" }}>Debe ($)</th>
                  <th style={{ width: 120, textAlign: "right" }}>Haber ($)</th>
                  <th style={{ width: 130, textAlign: "right" }}>Saldo ($)</th>
                </tr>
              </thead>
              <tbody>
                {/* Initial balance row */}
                <tr style={{ background: "rgba(241, 245, 249, 0.6)", fontWeight: 600 }}>
                  <td colSpan={5}>
                    <em>Saldo Inicial Anterior al Rango</em>
                  </td>
                  <td style={{ textAlign: "right" }}>-</td>
                  <td style={{ textAlign: "right" }}>-</td>
                  <td style={{ textAlign: "right", color: "#64748b" }}>
                    $ {(ledgerItem.initialBalance || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>

                {movements.map((m: any, idx: number) => (
                  <tr key={idx}>
                    <td>{m.date ? new Date(m.date).toLocaleDateString("es-AR") : "-"}</td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>
                      <Link to={`/contabilidad/asientos`} style={{ color: "var(--accent)" }}>
                        #{m.entryNumber}
                      </Link>
                    </td>
                    <td>
                      <div>
                        <strong>{m.concept}</strong>
                        {m.memo && m.memo !== m.concept && (
                          <div className="muted" style={{ fontSize: "0.75rem" }}>{m.memo}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge ghost" style={{ fontSize: "0.7rem" }}>
                        {m.sourceModule || "Manual"}
                      </span>
                    </td>
                    <td>{m.costCenterName || "-"}</td>
                    <td style={{ textAlign: "right", color: m.debit > 0 ? "#16a34a" : "inherit", fontWeight: m.debit > 0 ? 600 : 400 }}>
                      {m.debit > 0 ? `$ ${m.debit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td style={{ textAlign: "right", color: m.credit > 0 ? "#0284c7" : "inherit", fontWeight: m.credit > 0 ? 600 : 400 }}>
                      {m.credit > 0 ? `$ ${m.credit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      $ {(m.runningBalance || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
