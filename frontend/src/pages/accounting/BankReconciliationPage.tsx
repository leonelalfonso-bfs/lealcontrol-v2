import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface BankStatementLine {
  id: string;
  transactionDate: string;
  description: string;
  referenceNumber?: string;
  debit: number;
  credit: number;
  balance: number;
  isReconciled: boolean;
  matchedJournalEntryId?: string;
  matchType?: string;
  matchNotes?: string;
}

interface BankStatement {
  id: string;
  bankName: string;
  accountNumber?: string;
  currency: string;
  periodStartDate: string;
  periodEndDate: string;
  initialBalance: number;
  finalBalance: number;
  status: string;
  totalLines: number;
  reconciledLines: number;
  lines?: BankStatementLine[];
}

export function BankReconciliationPage() {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [postingFeeLineId, setPostingFeeLineId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Upload Form State
  const [uploadBankName, setUploadBankName] = useState("Banco Galicia C/C");
  const [uploadAccNumber, setUploadAccNumber] = useState("007-123456/7");
  const [rawCsvText, setRawCsvText] = useState("");
  const [initialBal, setInitialBal] = useState<number>(0);
  const [finalBal, setFinalBal] = useState<number>(0);

  useEffect(() => {
    loadStatements();
  }, []);

  const loadStatements = async () => {
    try {
      setLoading(true);
      const data = await api.listBankStatements();
      setStatements(data);
      if (data.length > 0) {
        loadStatementDetails(data[0].id);
      } else {
        setSelectedStatement(null);
      }
    } catch (err: any) {
      console.error("Error al cargar extractos bancarios:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadStatementDetails = async (id: string) => {
    try {
      const details = await api.getBankStatement(id);
      setSelectedStatement(details);
    } catch (err: any) {
      console.error("Error al cargar detalle de extracto:", err);
    }
  };

  const handleRunSmartMatch = async () => {
    if (!selectedStatement) return;
    try {
      setMatching(true);
      setFeedback(null);
      const res = await api.autoMatchBankStatement(selectedStatement.id);
      setFeedback(`✓ ${res.message}`);
      await loadStatementDetails(selectedStatement.id);
      const updatedList = await api.listBankStatements();
      setStatements(updatedList);
    } catch (err: any) {
      setFeedback(`❌ Error al ejecutar Smart Match: ${err?.message || "Error inesperado"}`);
    } finally {
      setMatching(false);
    }
  };

  const handleQuickPostFee = async (lineId: string, feeType: "BankFee" | "TaxLey25413") => {
    try {
      setPostingFeeLineId(lineId);
      await api.quickPostBankFee(lineId, feeType);
      setFeedback("✓ Asiento contable de gasto bancario registrado y conciliado.");
      if (selectedStatement) {
        await loadStatementDetails(selectedStatement.id);
      }
    } catch (err: any) {
      setFeedback(`❌ Error al imputar gasto: ${err?.message || "Error"}`);
    } finally {
      setPostingFeeLineId(null);
    }
  };

  const handleCreateSampleStatement = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const sampleLines = [
        { transactionDate: `${today}T10:00:00Z`, description: "TRANSFERENCIA RECIBIDA CLIENTE SAN LORENZO S.A.", referenceNumber: "TRF-889123", debit: 0, credit: 150000, balance: 150000 },
        { transactionDate: `${today}T11:30:00Z`, description: "PAGO A PROVEEDORES YPF DIRECTO CHEQUE #440129", referenceNumber: "CHQ-440129", debit: 45000, credit: 0, balance: 105000 },
        { transactionDate: `${today}T14:15:00Z`, description: "IMPUESTO LEY 25.413 DEB. BANCARIO", referenceNumber: "IMP-0012", debit: 900, credit: 0, balance: 104100 },
        { transactionDate: `${today}T15:00:00Z`, description: "MANTENIMIENTO DE CUENTA CORRIENTE & COMISIONES", referenceNumber: "COM-883", debit: 3500, credit: 0, balance: 100600 },
        { transactionDate: `${today}T16:20:00Z`, description: "COBRANZA PSP MERCADOPAGO LIQUIDACION DIARIA", referenceNumber: "MP-99410", debit: 0, credit: 89000, balance: 189600 }
      ];

      await api.uploadBankStatement({
        bankName: "Banco Galicia C/C",
        accountNumber: "007-449120/4",
        currency: "ARS",
        initialBalance: 0,
        finalBalance: 189600,
        lines: sampleLines
      });

      setShowUploadModal(false);
      await loadStatements();
      setFeedback("✓ Extracto de prueba importado con éxito.");
    } catch (err: any) {
      setFeedback(`❌ Error: ${err?.message || "Error al importar"}`);
    }
  };

  const handleProcessCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawCsvText.trim()) return;

    try {
      const lines = rawCsvText.trim().split("\n");
      const parsedLines = [];

      for (let i = 0; i < lines.length; i++) {
        const row = lines[i].split(/[;,\t]/);
        if (row.length >= 3) {
          const dateStr = row[0].trim() || new Date().toISOString();
          const desc = row[1].trim();
          const val1 = parseFloat(row[2].trim().replace("$", "").replace(",", ".")) || 0;
          const val2 = row.length >= 4 ? parseFloat(row[3].trim().replace("$", "").replace(",", ".")) || 0 : 0;

          const debit = val1 < 0 ? Math.abs(val1) : (row.length >= 4 && val1 > 0 ? val1 : 0);
          const credit = val1 > 0 && row.length < 4 ? val1 : (row.length >= 4 ? val2 : 0);

          parsedLines.push({
            transactionDate: dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00Z`,
            description: desc || `Movimiento bancario #${i + 1}`,
            referenceNumber: row[4] ? row[4].trim() : undefined,
            debit: debit,
            credit: credit,
            balance: 0
          });
        }
      }

      if (parsedLines.length === 0) {
        setFeedback("❌ No se pudieron parsear renglones válidos. Utilizá el formato Fecha;Concepto;Débito;Crédito");
        return;
      }

      await api.uploadBankStatement({
        bankName: uploadBankName,
        accountNumber: uploadAccNumber,
        currency: "ARS",
        initialBalance: initialBal,
        finalBalance: finalBal,
        lines: parsedLines
      });

      setShowUploadModal(false);
      setRawCsvText("");
      await loadStatements();
      setFeedback("✓ Extracto bancario cargado e importado con éxito.");
    } catch (err: any) {
      setFeedback(`❌ Error al subir extracto: ${err?.message || "Error"}`);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Header */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2>🏦 Conciliación Bancaria & Smart Match</h2>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
            Cruce inteligente de extractos bancarios contra asientos contables y cheques en tiempo real
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost" onClick={() => setShowUploadModal(true)}>
            📥 Importar Extracto (Excel / CSV)
          </button>
          {selectedStatement && (
            <button className="btn" onClick={handleRunSmartMatch} disabled={matching}>
              {matching ? "Cruzando movimientos…" : "⚡ Ejecutar Smart Match"}
            </button>
          )}
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
        <Link to="/contabilidad/sumas-saldos" className="tab-btn">
          ⚖️ Sumas y Saldos (8 Col.)
        </Link>
        <Link to="/contabilidad/conciliacion" className="tab-btn active">
          🏦 Conciliación Bancaria
        </Link>
        <Link to="/contabilidad/portal-estudio" className="tab-btn">
          🏢 Cierres & IVA Digital
        </Link>
      </div>

      {feedback && (
        <div className="card pad" style={{ background: feedback.startsWith("✓") ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>{feedback}</span>
        </div>
      )}

      {loading ? (
        <div className="card pad" style={{ textAlign: "center", padding: 40 }}>
          Cargando conciliaciones bancarias...
        </div>
      ) : statements.length === 0 ? (
        <div className="card pad" style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: "40px", marginBottom: 12 }}>🏦</div>
          <h3>No hay extractos bancarios cargados</h3>
          <p className="muted" style={{ maxWidth: 500, margin: "8px auto 20px" }}>
            Podés importar tu archivo de extracto bancario en formato Excel / CSV o cargar un extracto modelo de demostración.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <button className="btn" onClick={() => setShowUploadModal(true)}>
              📥 Importar Archivo
            </button>
            <button className="btn ghost" onClick={handleCreateSampleStatement}>
              ✨ Cargar Extracto Modelo de Demostración
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
          {/* Statement Selector Column */}
          <div className="stack" style={{ gap: 12 }}>
            <div className="card pad" style={{ padding: "14px 16px" }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Extractos Cargados</span>
                <span className="badge ok">{statements.length}</span>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {statements.map((s) => {
                  const isSelected = selectedStatement?.id === s.id;
                  const pct = s.totalLines > 0 ? Math.round((s.reconciledLines / s.totalLines) * 100) : 0;
                  return (
                    <div
                      key={s.id}
                      onClick={() => loadStatementDetails(s.id)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: isSelected ? "2px solid var(--accent)" : "1px solid var(--line)",
                        background: isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{s.bankName}</div>
                      <div className="muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>
                        {s.accountNumber ? `Cta: ${s.accountNumber}` : ""}
                      </div>
                      <div className="row" style={{ justifyContent: "space-between", marginTop: 8, fontSize: "0.75rem" }}>
                        <span className="muted">{new Date(s.periodEndDate).toLocaleDateString("es-AR")}</span>
                        <span className={pct === 100 ? "badge ok" : "badge warning"}>
                          {s.reconciledLines}/{s.totalLines} ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Statement Details & Smart Match Table */}
          {selectedStatement && (
            <div className="stack" style={{ gap: 16 }}>
              {/* Top Summary Card */}
              <div className="card pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
                <div>
                  <span className="muted" style={{ fontSize: "11px", fontWeight: 600 }}>BANCO / ENTIDAD</span>
                  <div style={{ fontWeight: 700, fontSize: "16px", marginTop: 2 }}>{selectedStatement.bankName}</div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: "11px", fontWeight: 600 }}>PERÍODO</span>
                  <div style={{ fontWeight: 600, fontSize: "14px", marginTop: 2 }}>
                    {new Date(selectedStatement.periodStartDate).toLocaleDateString("es-AR")} al {new Date(selectedStatement.periodEndDate).toLocaleDateString("es-AR")}
                  </div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: "11px", fontWeight: 600 }}>SALDO EXTRACTO</span>
                  <div style={{ fontWeight: 800, fontSize: "18px", color: "#38bdf8", marginTop: 2 }}>
                    $ {selectedStatement.finalBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <span className="muted" style={{ fontSize: "11px", fontWeight: 600 }}>AVANCE CONCILIACIÓN</span>
                  <div style={{ fontWeight: 700, fontSize: "14px", marginTop: 2 }}>
                    {selectedStatement.reconciledLines} de {selectedStatement.totalLines} ({Math.round((selectedStatement.reconciledLines / (selectedStatement.totalLines || 1)) * 100)}%)
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="card pad" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Movimientos del Extracto Bancario</span>
                  <button className="btn ghost" style={{ fontSize: "12px", padding: "4px 10px" }} onClick={handleRunSmartMatch} disabled={matching}>
                    ⚡ Smart Match
                  </button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ width: "100%", margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Concepto / Descripción del Banco</th>
                        <th>Referencia</th>
                        <th style={{ textAlign: "right" }}>Débito (Salida)</th>
                        <th style={{ textAlign: "right" }}>Crédito (Entrada)</th>
                        <th>Estado Smart Match</th>
                        <th style={{ textAlign: "center" }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStatement.lines && selectedStatement.lines.length > 0 ? (
                        selectedStatement.lines.map((l) => (
                          <tr key={l.id} style={{ background: l.isReconciled ? "rgba(34, 197, 94, 0.03)" : "transparent" }}>
                            <td style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                              {new Date(l.transactionDate).toLocaleDateString("es-AR")}
                            </td>
                            <td style={{ fontWeight: 500, fontSize: "0.85rem" }}>{l.description}</td>
                            <td className="muted" style={{ fontSize: "0.8rem" }}>{l.referenceNumber || "—"}</td>
                            <td style={{ textAlign: "right", color: l.debit > 0 ? "#f87171" : "var(--ink-soft)", fontWeight: l.debit > 0 ? 600 : 400 }}>
                              {l.debit > 0 ? `$ ${l.debit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td style={{ textAlign: "right", color: l.credit > 0 ? "#22c55e" : "var(--ink-soft)", fontWeight: l.credit > 0 ? 600 : 400 }}>
                              {l.credit > 0 ? `$ ${l.credit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td>
                              {l.isReconciled ? (
                                <span className="badge ok" title={l.matchNotes || ""}>
                                  ✓ Conciliado ({l.matchType || "OK"})
                                </span>
                              ) : (
                                <span className="badge warning">
                                  ⏳ Pendiente de Match
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                              {!l.isReconciled && l.debit > 0 && (
                                <div className="row" style={{ justifyContent: "center", gap: 6 }}>
                                  <button
                                    className="btn ghost"
                                    style={{ fontSize: "11px", padding: "4px 8px" }}
                                    disabled={postingFeeLineId === l.id}
                                    onClick={() => handleQuickPostFee(l.id, "BankFee")}
                                    title="Registrar e imputar a Comisiones Bancarias (5.3.01)"
                                  >
                                    + Comisión
                                  </button>
                                  <button
                                    className="btn ghost"
                                    style={{ fontSize: "11px", padding: "4px 8px" }}
                                    disabled={postingFeeLineId === l.id}
                                    onClick={() => handleQuickPostFee(l.id, "TaxLey25413")}
                                    title="Registrar e imputar a Imp. Déb/Créd Ley 25.413 (5.3.02)"
                                  >
                                    + Ley 25.413
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: 30 }} className="muted">
                            No hay movimientos en este extracto.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="modal-card" style={{ maxWidth: 650 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>📥 Importar Extracto Bancario</h3>
              <button className="btn ghost" onClick={() => setShowUploadModal(false)}>✕</button>
            </div>

            <form onSubmit={handleProcessCsvUpload} className="stack" style={{ marginTop: 14, gap: 14 }}>
              <div className="grid-2" style={{ gap: 12 }}>
                <label>
                  Banco / Entidad
                  <input
                    value={uploadBankName}
                    onChange={(e) => setUploadBankName(e.target.value)}
                    required
                    placeholder="Ej. Banco Galicia C/C"
                  />
                </label>
                <label>
                  Número de Cuenta
                  <input
                    value={uploadAccNumber}
                    onChange={(e) => setUploadAccNumber(e.target.value)}
                    placeholder="007-449120/4"
                  />
                </label>
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                <label>
                  Saldo Inicial ($)
                  <input
                    type="number"
                    step="0.01"
                    value={initialBal}
                    onChange={(e) => setInitialBal(parseFloat(e.target.value) || 0)}
                  />
                </label>
                <label>
                  Saldo Final ($)
                  <input
                    type="number"
                    step="0.01"
                    value={finalBal}
                    onChange={(e) => setFinalBal(parseFloat(e.target.value) || 0)}
                  />
                </label>
              </div>

              <label>
                Pegar Renglones del Extracto (CSV / Texto separado por punto y coma o tabulación)
                <textarea
                  rows={6}
                  value={rawCsvText}
                  onChange={(e) => setRawCsvText(e.target.value)}
                  placeholder={"2026-08-20;Cobranza Transferencia Cliente San Lorenzo;0;150000;TRF-889123\n2026-08-20;Pago Cheque Proveedor YPF Directo;45000;0;CHQ-440129\n2026-08-20;Comisión Mantenimiento Cuenta Corriente;3500;0;COM-883"}
                  style={{ fontFamily: "monospace", fontSize: "12px" }}
                />
                <span className="muted" style={{ fontSize: "11px", marginTop: 4, display: "block" }}>
                  Formato: Fecha ; Concepto ; Débito ; Crédito ; Referencia (o podés cargar el extracto de demostración).
                </span>
              </label>

              <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
                <button type="button" className="btn ghost" onClick={handleCreateSampleStatement}>
                  ✨ Cargar Extracto Modelo de Demostración
                </button>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn ghost" onClick={() => setShowUploadModal(false)}>
                    Cancelar
                  </button>
                  <button className="btn" type="submit" disabled={!rawCsvText.trim()}>
                    Importar y Procesar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
