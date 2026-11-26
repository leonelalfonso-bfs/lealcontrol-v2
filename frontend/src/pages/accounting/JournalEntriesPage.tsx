import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccountingTabs } from "../../components/accounting/AccountingTabs";
import { api } from "../../api/client";

export function JournalEntriesPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    api.listJournalEntries()
      .then((entryList) => {
        setEntries(entryList || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExportCsv = () => {
    if (entries.length === 0) return;
    const headers = "Asiento;Fecha;Concepto;Origen;Cuenta_Codigo;Cuenta_Nombre;Debe;Haber;Centro_Costo;Memo";
    const rows: string[] = [];
    entries.forEach((e) => {
      if (e.lines && e.lines.length > 0) {
        e.lines.forEach((l: any) => {
          rows.push(`${e.entryNumber};${new Date(e.date).toLocaleDateString("es-AR")};"${e.concept.replace(/"/g, '""')}";${e.sourceModule || "Manual"};${l.accountCode};"${l.accountName.replace(/"/g, '""')}";${l.debit || 0};${l.credit || 0};"${l.costCenterCode || ""}";"${l.memo || ""}"`);
        });
      } else {
        rows.push(`${e.entryNumber};${new Date(e.date).toLocaleDateString("es-AR")};"${e.concept.replace(/"/g, '""')}";${e.sourceModule || "Manual"};;;${e.totalDebit};${e.totalCredit};;`);
      }
    });
    const csvContent = "\uFEFF" + [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `LIBRO_DIARIO_CONTABLE_${todayAr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>📖 Asientos contables</h1>
          <p className="muted">Registraciones de partida doble, asientos automáticos y manuales</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn ghost" onClick={handleExportCsv} disabled={entries.length === 0}>
            📥 Exportar Excel (CSV)
          </button>
          <button type="button" className="btn ghost" onClick={() => window.print()}>
            🖨️ Imprimir / PDF
          </button>
          <Link to="/contabilidad/asientos/nuevo" className="btn">
            ➕ Nuevo Asiento Manual
          </Link>
        </div>
      </div>

      <AccountingTabs />

      {error && <div className="alert">{error}</div>}

      <div className="card pad">
        {loading ? (
          <p className="t-center" style={{ padding: 30 }}>Cargando asientos del libro diario...</p>
        ) : entries.length === 0 ? (
          <p className="muted t-center" style={{ padding: 30 }}>
            No hay asientos registrados aún en este período.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th style={{ width: 100 }}>Nº Asiento</th>
                  <th style={{ width: 110 }}>Fecha</th>
                  <th>Concepto / Glosa</th>
                  <th style={{ width: 130 }}>Módulo Origen</th>
                  <th className="t-right" style={{ width: 140 }}>Total Debe</th>
                  <th className="t-right" style={{ width: 140 }}>Total Haber</th>
                  <th className="t-center" style={{ width: 110 }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isExp = expandedId === entry.id;
                  const isBalanced = Math.abs(entry.totalDebit - entry.totalCredit) < 0.01;

                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        onClick={() => setExpandedId(isExp ? null : entry.id)}
                        style={{
                          cursor: "pointer",
                          background: isExp ? "rgba(13, 148, 136, 0.05)" : "transparent",
                          borderBottom: isExp ? "none" : "1px solid var(--surface-border)"
                        }}
                      >
                        <td className="t-center">
                          <span className="t-small" style={{ color: "var(--text-muted)" }}>
                            {isExp ? "▼" : "▶"}
                          </span>
                        </td>
                        <td>
                          <span className="tag primary t-strong">
                            #{String(entry.entryNumber).padStart(6, "0")}
                          </span>
                        </td>
                        <td>{new Date(entry.date).toLocaleDateString("es-AR")}</td>
                        <td>
                          <strong>{entry.concept}</strong>
                          {entry.sourceDocumentNumber && (
                            <div className="muted t-small">
                              Ref: {entry.sourceDocumentNumber}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="tag t-small">
                            {entry.sourceModule === "Sales" ? "🛒 Ventas" : entry.sourceModule === "Purchases" ? "📦 Compras" : entry.sourceModule === "Finance" ? "💳 Finanzas" : entry.sourceModule || "Manual"}
                          </span>
                        </td>
                        <td className="t-right t-strong">
                          $ {entry.totalDebit?.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="t-right t-strong">
                          $ {entry.totalCredit?.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="t-center">
                          <span className={`badge ${isBalanced ? "ok" : "prio-high"}`}>
                            {isBalanced ? "✓ Cuadrado" : "⚠️ Desbalanceado"}
                          </span>
                        </td>
                      </tr>

                      {isExp && entry.lines && entry.lines.length > 0 && (
                        <tr>
                          <td colSpan={8}>
                            <div className="t-strong t-small t-accent" style={{ marginBottom: 8 }}>
                              Detalle de Renglones Imputados:
                            </div>
                            <table style={{ background: "var(--lc-surface)", borderRadius: 6, border: "1px solid var(--lc-line)" }}>
                              <thead>
                                <tr>
                                  <th style={{ width: 120 }}>Cuenta</th>
                                  <th>Denominación</th>
                                  <th style={{ width: 160 }}>Centro Costo</th>
                                  <th>Leyenda / Glosa</th>
                                  <th className="t-right" style={{ width: 130 }}>Debe ($)</th>
                                  <th className="t-right" style={{ width: 130 }}>Haber ($)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.lines.map((l: any, idx: number) => (
                                  <tr key={idx}>
                                    <td><span className="t-strong">{l.accountCode}</span></td>
                                    <td>{l.accountName}</td>
                                    <td><span className="muted">{l.costCenterCode || "—"}</span></td>
                                    <td><span className="muted">{l.memo || "—"}</span></td>
                                    <td className="t-right" style={{ fontWeight: l.debit > 0 ? 700 : 400, color: l.debit > 0 ? "#0369a1" : "inherit" }}>
                                      {l.debit > 0 ? `$ ${l.debit.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                    </td>
                                    <td className="t-right" style={{ fontWeight: l.credit > 0 ? 700 : 400, color: l.credit > 0 ? "#047857" : "inherit" }}>
                                      {l.credit > 0 ? `$ ${l.credit.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
import React from "react";

import { todayAr } from "../../lib/dates";