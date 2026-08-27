import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { CustomerSummary, Invoice } from "../api/types";

type Account = {
  id: string;
  name: string;
  currency: string;
  type: string;
  balance: number;
  isActive: boolean;
};

type PaymentLine = {
  id: string;
  method: "BankTransfer" | "Cash" | "Cheque" | "Retention";
  amount: number;
  currency: string;
  accountId?: string;
  movementId?: string;
  chequeId?: string;
  retentionType?: string;
  retentionCertificate?: string;
  notes?: string;
};

type ImputationRow = {
  invoice: Invoice;
  selected: boolean;
  amountImputed: number;
  pendingBalance: number;
};

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n || 0);

export function CollectionReceiptsWorkspacePage() {
  const [searchParams] = useSearchParams();
  const initialCustomerId = searchParams.get("customerId");

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || "");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [availableCheques, setAvailableCheques] = useState<any[]>([]);
  const [availableMovements, setAvailableMovements] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [selectedReceiptDetail, setSelectedReceiptDetail] = useState<any | null>(null);

  const [receiptDate, setReceiptDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [currency, setCurrency] = useState<string>("ARS");
  const [description, setDescription] = useState<string>("");

  // Imputations (Facturas a imputar)
  const [imputations, setImputations] = useState<ImputationRow[]>([]);

  // Payment Lines (Medios de cobro recibidos)
  const [lines, setLines] = useState<PaymentLine[]>([]);

  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const [custRes, accRes, chqRes, invRes, recRes] = await Promise.all([
        api.listCustomers("", ""),
        api.listFinanceAccounts().catch(() => [] as Account[]),
        api.listReceivedCheques().catch(() => [] as any[]),
        api.listInvoices("", "", "").catch(() => [] as Invoice[]),
        api.listCollectionReceipts().catch(() => [] as any[])
      ]);

      const custs = custRes.items || [];
      setCustomers(custs);
      setAccounts(accRes || []);
      setInvoices(invRes || []);
      setReceipts(recRes || []);

      // Available cheques in portfolio
      setAvailableCheques(
        (chqRes || []).filter(
          (c) => (c.status === 0 || c.status === "Available" || c.status === "En cartera") && !c.collectionReceiptId
        )
      );

      // Initial default line: Bank Transfer with first active bank account
      const firstBank = (accRes || []).find((a) => a.isActive);
      if (firstBank && lines.length === 0) {
        setLines([
          {
            id: Math.random().toString(36).substring(2, 9),
            method: String(firstBank.type) === "Cash" || String(firstBank.type) === "1" ? "Cash" : "BankTransfer",
            amount: 0,
            currency: firstBank.currency || "ARS",
            accountId: firstBank.id,
            notes: ""
          }
        ]);
        void loadMovementsForAccount(firstBank.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos.");
    } finally {
      setLoading(false);
    }
  };

  const loadMovementsForAccount = async (accountId: string) => {
    if (!accountId) return;
    try {
      const movs = await api.listCollectionAvailableMovements(accountId);
      setAvailableMovements(movs || []);
    } catch {
      setAvailableMovements([]);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Update imputations and description when customer changes
  useEffect(() => {
    if (!selectedCustomerId) {
      setImputations([]);
      return;
    }

    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (cust && !description) {
      setDescription(`Cobranza a ${cust.tradeName || cust.legalName}`);
    }

    const custInvoices = invoices.filter(
      (inv) => inv.customerId === selectedCustomerId && inv.status !== "Cancelled"
    );

    // Calculate pending balance for each invoice by deducting previously imputed amounts
    const rows: ImputationRow[] = custInvoices.map((inv) => {
      // Find all past receipts imputed to this invoice
      const pastImputed = receipts
        .filter((r) => r.invoiceId === inv.id || (r.invoicesSummary && r.invoicesSummary.includes(inv.formattedNumber)))
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      const pending = Math.max(0, (inv.total || 0) - pastImputed);

      return {
        invoice: inv,
        selected: false,
        amountImputed: pending,
        pendingBalance: pending
      };
    });

    setImputations(rows);
  }, [selectedCustomerId, invoices, customers, receipts]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  // Totals calculations
  const totalImputed = useMemo(
    () =>
      imputations
        .filter((i) => i.selected)
        .reduce((sum, i) => sum + (Number(i.amountImputed) || 0), 0),
    [imputations]
  );

  const totalCobrado = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
    [lines]
  );

  const difference = totalCobrado - totalImputed;
  const hasOverImputation = totalImputed > totalCobrado + 0.01;

  // Handlers for Imputations
  const toggleSelectInvoice = (idx: number) => {
    setImputations((prev) => {
      const next = [...prev];
      const current = next[idx];
      const newSelected = !current.selected;
      next[idx] = {
        ...current,
        selected: newSelected,
        amountImputed: newSelected ? current.pendingBalance : 0
      };
      return next;
    });
  };

  const handleImputedAmountChange = (idx: number, val: number) => {
    setImputations((prev) => {
      const next = [...prev];
      const clamped = Math.max(0, val);
      next[idx] = {
        ...next[idx],
        amountImputed: clamped,
        selected: clamped > 0
      };
      return next;
    });
  };

  const handleSelectAllInvoices = () => {
    setImputations((prev) =>
      prev.map((r) => ({
        ...r,
        selected: true,
        amountImputed: r.pendingBalance
      }))
    );
  };

  const handleDeselectAllInvoices = () => {
    setImputations((prev) =>
      prev.map((r) => ({
        ...r,
        selected: false,
        amountImputed: 0
      }))
    );
  };

  // Handlers for Payment Lines
  const addLine = (method: PaymentLine["method"]) => {
    const firstAcc = accounts.find((a) => a.isActive);
    const suggestedAmount = Math.max(0, totalImputed - totalCobrado);

    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        method,
        amount: suggestedAmount,
        currency: firstAcc?.currency || currency,
        accountId: method === "BankTransfer" || method === "Cash" ? firstAcc?.id : undefined,
        notes: ""
      }
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<PaymentLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id === id) {
          const updated = { ...l, ...patch };
          if (patch.accountId && (updated.method === "BankTransfer" || updated.method === "Cash")) {
            void loadMovementsForAccount(patch.accountId);
          }
          return updated;
        }
        return l;
      })
    );
  };

  // Submit Handler
  const handleSave = async () => {
    if (!selectedCustomer) {
      setError("Por favor seleccioná un cliente.");
      return;
    }

    if (totalCobrado <= 0) {
      setError("El importe total de los medios de cobro debe ser mayor a cero.");
      return;
    }

    if (hasOverImputation) {
      setError(
        `El total imputado a comprobantes (${money(totalImputed, currency)}) no puede superar el total de cobro recibido (${money(totalCobrado, currency)}). Ajustá los importes imputados.`
      );
      return;
    }

    if (!description.trim()) {
      setError("Por favor indicá una descripción para el recibo.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const selectedImputations = imputations.filter((i) => i.selected && i.amountImputed > 0);

      const payload = {
        customerId: selectedCustomer.id,
        accountId: lines.find((l) => l.accountId)?.accountId || accounts[0]?.id || undefined,
        currency,
        amount: totalCobrado,
        description: description.trim(),
        receiptDateUtc: new Date(`${receiptDate}T12:00:00Z`).toISOString(),
        lines: lines.map((l) => ({
          method: l.method,
          amount: Number(l.amount) || 0,
          currency: l.currency || currency,
          accountId: l.accountId || null,
          movementId: l.movementId || null,
          chequeId: l.chequeId || null,
          retentionType: l.retentionType || null,
          retentionCertificate: l.retentionCertificate || null,
          notes: l.notes || null
        })),
        imputations: selectedImputations.map((i) => ({
          invoiceId: i.invoice.id,
          invoiceNumber: i.invoice.formattedNumber,
          invoiceTotal: i.invoice.total,
          amountImputed: Number(i.amountImputed) || 0
        }))
      };

      const res = await api.createCollectionReceipt(payload);
      setSuccessMsg(`¡Recibo de Cobro ${res.receiptNumber} emitido exitosamente por ${money(totalCobrado, currency)}!`);
      
      // Reset form
      setLines([
        {
          id: Math.random().toString(36).substring(2, 9),
          method: "BankTransfer",
          amount: 0,
          currency,
          accountId: accounts[0]?.id,
          notes: ""
        }
      ]);
      setDescription("");
      await loadData();
    } catch (e: any) {
      setError(e.message || "Error al emitir el recibo de cobro.");
    } finally {
      setSaving(false);
    }
  };

  const openReceiptDetail = async (id: string) => {
    try {
      const detail = await api.getCollectionReceipt(id);
      setSelectedReceiptDetail(detail);
    } catch (e: any) {
      alert("Error al cargar detalle del recibo: " + e.message);
    }
  };

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · COBRANZAS</span>
          <h1>Recibos de Cobro a Clientes</h1>
          <p className="muted">
            Imputación precisa de facturas, medios de cobro multilínea (transferencias, cheques, retenciones, efectivo) y conciliación automática.
          </p>
        </div>
        <div className="toolbar">
          <Link to="/finanzas/cuentas-corrientes" className="btn btn-outline">
            📊 Cuentas Corrientes
          </Link>
          <Link to="/finanzas/cuentas" className="btn btn-outline">
            🏦 Cuentas Financieras
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#f87171", marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {successMsg && (
        <div className="alert" style={{ background: "#dcfce7", color: "#166534", borderColor: "#86efac", marginBottom: 16 }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Main Grid: Form Left, Balance Right */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          {/* STEP 1: CLIENTE Y DATOS GENERALES */}
          <section className="card pad">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: "1.2rem" }}>👤</span>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>1. Cliente y Datos Generales</h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <label>
                Cliente *
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                >
                  <option value="">-- Seleccione un cliente --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradeName || c.legalName} ({c.documentNumber || "Sin CUIT"})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Fecha de Cobro *
                <input
                  type="date"
                  required
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                />
              </label>

              <label>
                Moneda del Recibo *
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                >
                  <option value="ARS">ARS ($ - Pesos Argentinos)</option>
                  <option value="USD">USD (U$S - Dólares Estadounidenses)</option>
                </select>
              </label>

              <label style={{ gridColumn: "1 / -1" }}>
                Concepto / Observaciones *
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Cobro de Facturas mes en curso"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                />
              </label>
            </div>
          </section>

          {/* STEP 2: FACTURAS A IMPUTAR */}
          <section className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "1.2rem" }}>📄</span>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>2. Facturas y Comprobantes a Imputar</h2>
              </div>
              {imputations.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-outline compact" onClick={handleSelectAllInvoices}>
                    Seleccionar Todas
                  </button>
                  <button type="button" className="btn ghost compact" onClick={handleDeselectAllInvoices}>
                    Desmarcar
                  </button>
                </div>
              )}
            </div>

            {!selectedCustomerId ? (
              <p className="muted" style={{ margin: 0, padding: 12, textAlign: "center" }}>
                Seleccioná un cliente para visualizar sus comprobantes pendientes de cobro.
              </p>
            ) : imputations.length === 0 ? (
              <div style={{ background: "rgba(0,0,0,0.02)", padding: 16, borderRadius: 8, textAlign: "center" }}>
                <p className="muted" style={{ margin: 0 }}>
                  El cliente no posee comprobantes pendientes con saldo. Podés emitir el recibo como <strong>Anticipo / Saldo a Favor</strong>.
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40, textAlign: "center" }}>Aplicar</th>
                      <th>Comprobante</th>
                      <th>Fecha</th>
                      <th>Vto.</th>
                      <th style={{ textAlign: "right" }}>Total Factura</th>
                      <th style={{ textAlign: "right" }}>Saldo Pendiente</th>
                      <th style={{ textAlign: "right", width: 160 }}>Monto a Imputar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imputations.map((row, idx) => (
                      <tr key={row.invoice.id} style={{ background: row.selected ? "rgba(13, 148, 136, 0.04)" : "inherit" }}>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => toggleSelectInvoice(idx)}
                            style={{ cursor: "pointer", width: 16, height: 16 }}
                          />
                        </td>
                        <td>
                          <strong>{row.invoice.formattedNumber}</strong>
                          <small className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                            {row.invoice.invoiceType} · Pto Vta {row.invoice.pointOfSale}
                          </small>
                        </td>
                        <td>{new Date(row.invoice.issueDate).toLocaleDateString("es-AR")}</td>
                        <td>{new Date(row.invoice.dueDate).toLocaleDateString("es-AR")}</td>
                        <td style={{ textAlign: "right" }}>{money(row.invoice.total, row.invoice.currency)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: "#0d9488" }}>
                          {money(row.pendingBalance, row.invoice.currency)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.amountImputed}
                              onChange={(e) => handleImputedAmountChange(idx, Number(e.target.value) || 0)}
                              style={{
                                width: 110,
                                textAlign: "right",
                                padding: "4px 8px",
                                borderRadius: 4,
                                border: row.amountImputed > row.pendingBalance ? "1px solid #dc2626" : "1px solid var(--surface-border)",
                                fontWeight: 700
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* STEP 3: MEDIOS DE COBRO */}
          <section className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "1.2rem" }}>💳</span>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>3. Medios de Cobro (Ingreso de Fondos)</h2>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-outline compact" onClick={() => addLine("BankTransfer")}>
                  ＋ Transferencia
                </button>
                <button type="button" className="btn btn-outline compact" onClick={() => addLine("Cash")}>
                  ＋ Efectivo
                </button>
                <button type="button" className="btn btn-outline compact" onClick={() => addLine("Cheque")}>
                  ＋ Cheque
                </button>
                <button type="button" className="btn btn-outline compact" onClick={() => addLine("Retention")}>
                  ＋ Retención
                </button>
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="muted" style={{ textAlign: "center", padding: 14 }}>
                Agregá al menos un medio de cobro (transferencia, efectivo, cheque o retención).
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {lines.map((line, idx) => (
                  <div
                    key={line.id}
                    style={{
                      background: "rgba(0,0,0,0.02)",
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid var(--surface-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                          #{idx + 1} {line.method === "BankTransfer" ? "🏦 Transferencia Bancaria" : line.method === "Cash" ? "💵 Efectivo / Caja" : line.method === "Cheque" ? "🎫 Cheque Recibido" : "📋 Retención Sufrida"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn ghost compact"
                        style={{ color: "#dc2626", padding: "2px 8px" }}
                        onClick={() => removeLine(line.id)}
                      >
                        ✕ Quitar
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, alignItems: "end" }}>
                      {/* Bank or Cash Accounts */}
                      {(line.method === "BankTransfer" || line.method === "Cash") && (
                        <label>
                          Cuenta de Ingreso *
                          <select
                            value={line.accountId || ""}
                            onChange={(e) => updateLine(line.id, { accountId: e.target.value, movementId: undefined })}
                            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                          >
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.currency}) - Saldo: {money(a.balance, a.currency)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Bank Movement link (optional) */}
                      {line.method === "BankTransfer" && (
                        <label>
                          Transferencia Bancaria Acreditada (Opcional)
                          <select
                            value={line.movementId || ""}
                            onChange={(e) => {
                              const movId = e.target.value;
                              const mov = availableMovements.find((m) => m.id === movId);
                              updateLine(line.id, {
                                movementId: movId || undefined,
                                amount: mov ? Number(mov.amount) : line.amount,
                                notes: mov ? `Conciliado con ${mov.description}` : line.notes
                              });
                            }}
                            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                          >
                            <option value="">-- Ingreso directo (sin conciliar previo) --</option>
                            {availableMovements.map((m) => (
                              <option key={m.id} value={m.id}>
                                {new Date(m.operationDateUtc).toLocaleDateString("es-AR")} · {money(m.amount, m.currency)} · {m.description}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Cheques */}
                      {line.method === "Cheque" && (
                        <label>
                          Cheque en Cartera *
                          <select
                            value={line.chequeId || ""}
                            onChange={(e) => {
                              const chId = e.target.value;
                              const ch = availableCheques.find((c) => c.id === chId);
                              updateLine(line.id, {
                                chequeId: chId || undefined,
                                amount: ch ? Number(ch.amount) : line.amount,
                                notes: ch ? `Cheque N° ${ch.checkNumber} (${ch.bankName || "Banco"})` : line.notes
                              });
                            }}
                            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                          >
                            <option value="">-- Seleccioná un cheque disponible --</option>
                            {availableCheques.map((c) => (
                              <option key={c.id} value={c.id}>
                                N° {c.checkNumber} · {money(c.amount, c.currency)} · {c.bankName || "Banco"} · Vto: {c.dueDateUtc ? new Date(c.dueDateUtc).toLocaleDateString("es-AR") : "s/f"}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Retention fields */}
                      {line.method === "Retention" && (
                        <>
                          <label>
                            Tipo de Retención *
                            <select
                              value={line.retentionType || "IIBB"}
                              onChange={(e) => updateLine(line.id, { retentionType: e.target.value })}
                              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                            >
                              <option value="IIBB">Ingresos Brutos (IIBB)</option>
                              <option value="Ganancias">Impuesto a las Ganancias</option>
                              <option value="IVA">Retención de IVA</option>
                              <option value="SUSS">Seguridad Social (SUSS)</option>
                            </select>
                          </label>

                          <label>
                            N° Certificado de Retención
                            <input
                              type="text"
                              value={line.retentionCertificate || ""}
                              onChange={(e) => updateLine(line.id, { retentionCertificate: e.target.value })}
                              placeholder="Ej: 2026-000123"
                              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                            />
                          </label>
                        </>
                      )}

                      {/* Amount */}
                      <label>
                        Importe Cobrado *
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={line.amount}
                          onChange={(e) => updateLine(line.id, { amount: Number(e.target.value) || 0 })}
                          style={{
                            width: "100%",
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--surface-border)",
                            fontWeight: 700,
                            textAlign: "right"
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* SUMMARY / BALANCE SIDEBAR */}
        <aside style={{ position: "sticky", top: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card pad" style={{ borderTop: "4px solid #0d9488" }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "1.05rem" }}>Balance de Cobro</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="muted">Total Medios de Cobro:</span>
                <strong style={{ fontSize: "1.1rem", color: "#065f46" }}>{money(totalCobrado, currency)}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="muted">Total Imputado a Facturas:</span>
                <strong>{money(totalImputed, currency)}</strong>
              </div>

              <div style={{ borderTop: "1px dashed var(--surface-border)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="muted">Diferencia / Excedente:</span>
                <strong style={{ color: hasOverImputation ? "#dc2626" : difference > 0 ? "#0d9488" : "inherit" }}>
                  {money(difference, currency)}
                </strong>
              </div>
            </div>

            {hasOverImputation && (
              <div style={{ marginTop: 14, padding: 10, borderRadius: 6, background: "#fee2e2", color: "#991b1b", fontSize: "0.82rem", lineHeight: 1.4 }}>
                ⚠️ <strong>Cobro insuficiente:</strong> Estás imputando {money(totalImputed, currency)} a facturas, pero los medios de cobro suman solo {money(totalCobrado, currency)}. Ajustá los montos imputados a las facturas.
              </div>
            )}

            {!hasOverImputation && difference > 0.01 && (
              <div style={{ marginTop: 14, padding: 10, borderRadius: 6, background: "#e0f2fe", color: "#0369a1", fontSize: "0.82rem", lineHeight: 1.4 }}>
                ℹ️ <strong>Anticipo:</strong> El cobro supera las facturas imputadas en {money(difference, currency)}. Este monto quedará como saldo a favor del cliente en su cuenta corriente.
              </div>
            )}

            {!hasOverImputation && Math.abs(difference) <= 0.01 && totalCobrado > 0 && (
              <div style={{ marginTop: 14, padding: 10, borderRadius: 6, background: "#dcfce7", color: "#166534", fontSize: "0.82rem" }}>
                ✓ Cobro e imputaciones equilibrados al 100%.
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || loading || totalCobrado <= 0 || hasOverImputation || !selectedCustomerId}
              onClick={() => void handleSave()}
              style={{ width: "100%", justifyContent: "center", marginTop: 18, padding: "12px 16px", fontWeight: 700 }}
            >
              {saving ? "Emitiendo Recibo..." : "🧾 Confirmar Recibo de Cobro"}
            </button>
          </div>
        </aside>
      </div>

      {/* RECENT RECEIPTS TABLE */}
      <section className="card pad" style={{ marginTop: 30 }}>
        <h2 style={{ margin: "0 0 14px 0", fontSize: "1.1rem" }}>Últimos Recibos de Cobro Emitidos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N° Recibo</th>
                <th>Fecha</th>
                <th>Cliente / Detalle</th>
                <th>Comprobantes Imputados</th>
                <th>Líneas</th>
                <th style={{ textAlign: "right" }}>Importe Total</th>
                <th style={{ textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No hay recibos registrados aún.
                  </td>
                </tr>
              ) : (
                receipts.map((r) => {
                  const cust = customers.find((c) => c.id === r.customerId);
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.receiptNumber}</strong>
                      </td>
                      <td>{new Date(r.receiptDateUtc).toLocaleDateString("es-AR")}</td>
                      <td>
                        <strong>{cust?.tradeName || cust?.legalName || "Cliente"}</strong>
                        <small className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                          {r.description}
                        </small>
                      </td>
                      <td>{r.invoicesSummary || (r.invoiceId ? "1 factura" : "Anticipo a cuenta")}</td>
                      <td>{r.linesCount || 1} medio(s)</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#065f46" }}>
                        {money(r.amount, r.currency)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="btn btn-outline compact"
                          onClick={() => void openReceiptDetail(r.id)}
                        >
                          👁️ Ver Detalle
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* RECEIPT DETAIL MODAL */}
      {selectedReceiptDetail && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20
          }}
        >
          <div
            className="card pad"
            style={{
              width: "100%",
              maxWidth: 720,
              maxHeight: "90vh",
              overflowY: "auto",
              backgroundColor: "var(--surface, #ffffff)",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              borderRadius: 8
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--surface-border)", paddingBottom: 12, marginBottom: 16 }}>
              <div>
                <span className="eyebrow">RECIBO OFICIAL DE COBRANZA</span>
                <h2 style={{ margin: 0 }}>{selectedReceiptDetail.receiptNumber}</h2>
                <span className="muted" style={{ fontSize: "0.82rem" }}>
                  Fecha: {new Date(selectedReceiptDetail.receiptDateUtc).toLocaleDateString("es-AR")} · {selectedReceiptDetail.description}
                </span>
              </div>
              <button className="btn btn-outline compact" onClick={() => setSelectedReceiptDetail(null)}>
                ✕ Cerrar
              </button>
            </div>

            {/* Imputations */}
            <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>📄 Comprobantes Imputados</h3>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Comprobante</th>
                    <th style={{ textAlign: "right" }}>Total Factura</th>
                    <th style={{ textAlign: "right" }}>Monto Imputado</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReceiptDetail.imputations || []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">Cobro registrado como anticipo a cuenta corriente.</td>
                    </tr>
                  ) : (
                    selectedReceiptDetail.imputations.map((imp: any) => (
                      <tr key={imp.id}>
                        <td><strong>{imp.invoiceNumber}</strong></td>
                        <td style={{ textAlign: "right" }}>{money(imp.invoiceTotal, selectedReceiptDetail.currency)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "#065f46" }}>{money(imp.amountImputed, selectedReceiptDetail.currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Payment lines */}
            <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>💳 Medios de Cobro</h3>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Medio</th>
                    <th>Detalle / Cuenta / Certificado</th>
                    <th style={{ textAlign: "right" }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReceiptDetail.lines || []).map((l: any) => (
                    <tr key={l.id}>
                      <td><strong>{l.method}</strong></td>
                      <td>{l.retentionCertificate ? `Cert. ${l.retentionCertificate} (${l.retentionType})` : l.notes || "-"}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{money(l.amount, l.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--surface-border)", paddingTop: 12 }}>
              <span className="muted">Total del Recibo:</span>
              <strong style={{ fontSize: "1.25rem", color: "#065f46" }}>
                {money(selectedReceiptDetail.amount, selectedReceiptDetail.currency)}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
