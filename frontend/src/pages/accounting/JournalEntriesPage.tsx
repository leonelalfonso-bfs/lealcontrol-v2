import React, { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface EntryLineDraft {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenterId?: string;
  costCenterCode?: string;
  memo?: string;
}

export function JournalEntriesPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New Entry Modal State
  const [showModal, setShowModal] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [concept, setConcept] = useState("");
  const [entryType, setEntryType] = useState("Standard");
  const [lines, setLines] = useState<EntryLineDraft[]>([
    { accountId: "", accountCode: "", accountName: "", debit: 0, credit: 0, memo: "" },
    { accountId: "", accountCode: "", accountName: "", debit: 0, credit: 0, memo: "" }
  ]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.listJournalEntries(),
      api.listAccounts(),
      api.listCostCenters()
    ])
      .then(([entryList, acctList, ccList]) => {
        setEntries(entryList);
        setAccounts(acctList.filter((a) => a.isDirectPosting));
        setCostCenters(ccList);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = totalDebit > 0 && diff < 0.01;

  const handleAccountSelect = (index: number, acctId: string) => {
    const selected = accounts.find((a) => a.id === acctId);
    if (!selected) return;
    const updated = [...lines];
    updated[index].accountId = selected.id;
    updated[index].accountCode = selected.code;
    updated[index].accountName = selected.name;
    setLines(updated);
  };

  const handleLineChange = (index: number, field: keyof EntryLineDraft, val: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: val };
    setLines(updated);
  };

  const addLine = () => {
    setLines([
      ...lines,
      { accountId: "", accountCode: "", accountName: "", debit: 0, credit: 0, memo: "" }
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const openNewEntryModal = () => {
    setConcept("");
    setEntryDate(new Date().toISOString().split("T")[0]);
    setEntryType("Standard");
    setLines([
      { accountId: "", accountCode: "", accountName: "", debit: 0, credit: 0, memo: "" },
      { accountId: "", accountCode: "", accountName: "", debit: 0, credit: 0, memo: "" }
    ]);
    setShowModal(true);
  };

  const handleSaveEntry = async (e: FormEvent) => {
    e.preventDefault();
    if (!isBalanced) {
      setError("El asiento está desbalanceado. Total Debe debe ser igual a Total Haber.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await api.createJournalEntry({
        date: entryDate,
        concept: concept.trim(),
        entryType,
        sourceModule: "Manual",
        lines: lines.map((l) => ({
          accountId: l.accountId,
          accountCode: l.accountCode,
          accountName: l.accountName,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          costCenterId: l.costCenterId || undefined,
          costCenterCode: l.costCenterCode || undefined,
          memo: l.memo?.trim() || undefined,
          exchangeRate: 1
        }))
      });
      setMsg("✓ Asiento contable registrado con éxito en el Libro Diario.");
      setShowModal(false);
      loadData();
    } catch (err: any) {
      setError(err?.message || "Error al registrar asiento.");
    } finally {
      setSaving(false);
    }
  };

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
          <button type="button" className="btn" onClick={openNewEntryModal}>
            ➕ Nuevo Asiento Manual
          </button>
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

      {msg && <div className="alert ok">{msg}</div>}
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
            <table>
              <thead>
                <tr>
                  <th style={{ width: "90px" }}>Nº Asiento</th>
                  <th style={{ width: "110px" }}>Fecha</th>
                  <th>Concepto / Glosa</th>
                  <th>Módulo Origen</th>
                  <th style={{ textAlign: "right" }}>Total Debe ($)</th>
                  <th style={{ textAlign: "right" }}>Total Haber ($)</th>
                  <th style={{ textAlign: "center", width: "100px" }}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const isExpanded = expandedId === e.id;
                  return (
                    <React.Fragment key={e.id}>
                      <tr style={{ background: isExpanded ? "rgba(37, 99, 235, 0.04)" : "transparent" }}>
                        <td>
                          <strong>#{e.entryNumber}</strong>
                        </td>
                        <td>{new Date(e.date).toLocaleDateString("es-AR")}</td>
                        <td>
                          <strong>{e.concept}</strong>
                          {e.sourceDocumentId && (
                            <div className="muted" style={{ fontSize: "11px" }}>
                              Comprobante: {e.sourceDocumentId}
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
                        <td style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ fontSize: "12px", padding: "3px 8px" }}
                            onClick={() => setExpandedId(isExpanded ? null : e.id)}
                          >
                            {isExpanded ? "▲ Ocultar" : "▼ Renglones"}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ background: "rgba(0,0,0,0.02)", padding: "12px 24px" }}>
                            <div style={{ fontWeight: 600, fontSize: "12px", marginBottom: 6, color: "var(--ink-soft)" }}>
                              RENGLONES DEL ASIENTO #{e.entryNumber} (PARTIDA DOBLE):
                            </div>
                            <table style={{ background: "#fff", border: "1px solid var(--line)" }}>
                              <thead>
                                <tr style={{ background: "rgba(0,0,0,0.03)" }}>
                                  <th>Código</th>
                                  <th>Cuenta Contable</th>
                                  <th>Centro de Costo</th>
                                  <th>Leyenda / Detalle</th>
                                  <th style={{ textAlign: "right" }}>Debe ($)</th>
                                  <th style={{ textAlign: "right" }}>Haber ($)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.lines?.map((line: any) => (
                                  <tr key={line.id}>
                                    <td>
                                      <code>{line.accountCode}</code>
                                    </td>
                                    <td>{line.accountName}</td>
                                    <td>{line.costCenterName || "-"}</td>
                                    <td>{line.memo || "-"}</td>
                                    <td style={{ textAlign: "right", fontWeight: line.debit > 0 ? 600 : 400 }}>
                                      {line.debit > 0 ? `$ ${line.debit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                                    </td>
                                    <td style={{ textAlign: "right", fontWeight: line.credit > 0 ? 600 : 400 }}>
                                      {line.credit > 0 ? `$ ${line.credit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
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

      {/* Modal Cargar Nuevo Asiento */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: "850px", width: "100%" }}>
            <h3>➕ Carga de Asiento Diario (Partida Doble)</h3>
            <form onSubmit={handleSaveEntry} className="stack" style={{ marginTop: 14, gap: 14 }}>
              <div className="grid-3" style={{ gap: 12 }}>
                <label>
                  Fecha del Asiento *
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    required
                  />
                </label>

                <label style={{ gridColumn: "span 2" }}>
                  Concepto / Glosa Principal *
                  <input
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    required
                    placeholder="Ej. Devengamiento de alquileres de oficina o ajuste bancario"
                  />
                </label>
              </div>

              {/* Renglones Grilla Contable */}
              <div>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: "13px" }}>Renglones del Asiento:</span>
                  <button type="button" className="btn ghost" style={{ fontSize: "12px", padding: "4px 8px" }} onClick={addLine}>
                    ➕ Agregar Renglón
                  </button>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "260px" }}>Cuenta Contable *</th>
                        <th style={{ width: "140px", textAlign: "right" }}>Debe ($)</th>
                        <th style={{ width: "140px", textAlign: "right" }}>Haber ($)</th>
                        <th style={{ width: "180px" }}>Centro de Costos</th>
                        <th style={{ width: "40px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={idx}>
                          <td>
                            <select
                              value={line.accountId}
                              onChange={(e) => handleAccountSelect(idx, e.target.value)}
                              required
                              style={{ width: "100%", fontSize: "12px" }}
                            >
                              <option value="">-- Seleccionar Cuenta --</option>
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} - {a.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.debit || ""}
                              onChange={(e) => handleLineChange(idx, "debit", parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              style={{ textAlign: "right", width: "100%" }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.credit || ""}
                              onChange={(e) => handleLineChange(idx, "credit", parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              style={{ textAlign: "right", width: "100%" }}
                            />
                          </td>
                          <td>
                            <select
                              value={line.costCenterId || ""}
                              onChange={(e) => {
                                const cc = costCenters.find((c) => c.id === e.target.value);
                                handleLineChange(idx, "costCenterId", e.target.value);
                                handleLineChange(idx, "costCenterCode", cc?.code);
                              }}
                              style={{ width: "100%", fontSize: "12px" }}
                            >
                              <option value="">Sin Centro</option>
                              {costCenters.map((cc) => (
                                <option key={cc.id} value={cc.id}>
                                  {cc.code} - {cc.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {lines.length > 2 && (
                              <button
                                type="button"
                                className="btn ghost"
                                style={{ color: "#ef4444", padding: "4px" }}
                                onClick={() => removeLine(idx)}
                              >
                                🗑️
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Balance Summary Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  background: isBalanced ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: `1px solid ${isBalanced ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, fontSize: "13px" }}>
                    Total Debe: <span style={{ color: "#22c55e" }}>$ {totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </span>
                  <span style={{ margin: "0 12px", color: "var(--ink-soft)" }}>|</span>
                  <span style={{ fontWeight: 600, fontSize: "13px" }}>
                    Total Haber: <span style={{ color: "#38bdf8" }}>$ {totalCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </span>
                </div>

                <div>
                  {isBalanced ? (
                    <span className="badge ok" style={{ fontSize: "12px" }}>✓ Asiento Balanceado (Diferencia $0.00)</span>
                  ) : (
                    <span className="badge prio-high" style={{ fontSize: "12px" }}>
                      ⚠️ Desbalance: $ {diff.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={saving || !isBalanced}>
                  {saving ? "Guardando…" : "💾 Registrar Asiento Contable"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
