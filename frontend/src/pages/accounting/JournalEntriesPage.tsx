import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
    link.setAttribute("download", `LIBRO_DIARIO_CONTABLE_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>📖 Libro Diario de Asientos Contables</h1>
          <p className="muted">Registraciones de partida doble, asientos automáticos y manuales</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn ghost" onClick={handleExportCsv} disabled={entries.length === 0}>
            📥 Exportar Excel (CSV)
          </button>
          <button type="button" className="btn ghost" onClick={() => window.print()}>
            🖨️ Imprimir / PDF
          </button>
          <Link to="/contabilidad/asientos/nuevo" className="btn" style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", fontWeight: 700 }}>
            ➕ Nuevo Asiento Manual
          </Link>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="tab-row">
        <Link to="/contabilidad" className="tab-btn">
          📊 Tablero Ejecutivo & P&L
        </Link>
        <Link to="/contabilidad/modelos" className="tab-btn">
          ⚙️ Asientos Modelos
        </Link>
        <Link to="/contabilidad/plan-cuentas" className="tab-btn">
          🌳 Plan de Cuentas
        </Link>
        <Link to="/contabilidad/asientos" className="tab-btn active">
          📖 Libro Diario ({entries.length})
        </Link>
        <Link to="/contabilidad/mayor" className="tab-btn">
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

      {error && <div className="alert">{error}</div>}

      <div className="card pad">
        {loading ? (
          <p style={{ textAlign: "center", padding: 30 }}>Cargando asientos del libro diario...</p>
        ) : entries.length === 0 ? (
          <p className="muted" style={{ textAlign: "center", padding: 30 }}>
            No hay asientos registrados aún en este período.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--surface-sunken)" }}>
                  <th style={{ width: 40 }}></th>
                  <th style={{ width: 100 }}>Nº Asiento</th>
                  <th style={{ width: 110 }}>Fecha</th>
                  <th>Concepto / Glosa</th>
                  <th style={{ width: 130 }}>Módulo Origen</th>
                  <th style={{ width: 140, textAlign: "right" }}>Total Debe</th>
                  <th style={{ width: 140, textAlign: "right" }}>Total Haber</th>
                  <th style={{ width: 110, textAlign: "center" }}>Balance</th>
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
                        <td style={{ textAlign: "center" }}>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            {isExp ? "▼" : "▶"}
                          </span>
                        </td>
                        <td>
                          <span className="tag primary" style={{ fontWeight: 700 }}>
                            #{String(entry.entryNumber).padStart(6, "0")}
                          </span>
                        </td>
                        <td>{new Date(entry.date).toLocaleDateString("es-AR")}</td>
                        <td>
                          <strong>{entry.concept}</strong>
                          {entry.sourceDocumentNumber && (
                            <div className="muted" style={{ fontSize: "0.8rem" }}>
                              Ref: {entry.sourceDocumentNumber}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="tag" style={{ fontSize: "0.78rem" }}>
                            {entry.sourceModule === "Sales" ? "🛒 Ventas" : entry.sourceModule === "Purchases" ? "📦 Compras" : entry.sourceModule === "Finance" ? "💳 Finanzas" : entry.sourceModule || "Manual"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>
                          $ {entry.totalDebit?.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>
                          $ {entry.totalCredit?.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`badge ${isBalanced ? "ok" : "prio-high"}`}>
                            {isBalanced ? "✓ Cuadrado" : "⚠️ Desbalanceado"}
                          </span>
                        </td>
                      </tr>

                      {isExp && entry.lines && entry.lines.length > 0 && (
                        <tr style={{ background: "rgba(13, 148, 136, 0.03)", borderBottom: "1px solid var(--surface-border)" }}>
                          <td colSpan={8} style={{ padding: "12px 24px 18px 48px" }}>
                            <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 8, color: "#0f766e" }}>
                              Detalle de Renglones Imputados:
                            </div>
                            <table style={{ width: "100%", fontSize: "0.86rem", background: "#fff", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                              <thead>
                                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                                  <th style={{ width: 120 }}>Cuenta</th>
                                  <th>Denominación</th>
                                  <th style={{ width: 160 }}>Centro Costo</th>
                                  <th>Leyenda / Glosa</th>
                                  <th style={{ width: 130, textAlign: "right" }}>Debe ($)</th>
                                  <th style={{ width: 130, textAlign: "right" }}>Haber ($)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.lines.map((l: any, idx: number) => (
                                  <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <td><span style={{ fontWeight: 700 }}>{l.accountCode}</span></td>
                                    <td>{l.accountName}</td>
                                    <td><span className="muted">{l.costCenterCode || "—"}</span></td>
                                    <td><span className="muted">{l.memo || "—"}</span></td>
                                    <td style={{ textAlign: "right", fontWeight: l.debit > 0 ? 700 : 400, color: l.debit > 0 ? "#0369a1" : "inherit" }}>
                                      {l.debit > 0 ? `$ ${l.debit.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                    </td>
                                    <td style={{ textAlign: "right", fontWeight: l.credit > 0 ? 700 : 400, color: l.credit > 0 ? "#047857" : "inherit" }}>
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
