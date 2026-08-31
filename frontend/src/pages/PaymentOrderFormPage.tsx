import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { CustomerSummary, PurchaseInvoice } from "../api/types";

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
  method: "BankTransfer" | "Cash" | "ChequeOwn" | "ChequeThirdParty" | "Retention";
  amount: number;
  currency: string;
  accountId?: string;
  bankMovementId?: string;
  chequeId?: string;
  retentionType?: string;
  retentionCertificate?: string;
  notes?: string;
};

type ImputationRow = {
  invoice: PurchaseInvoice;
  selected: boolean;
  amountImputed: number;
};

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);

export function PaymentOrderFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSupplierId = searchParams.get("supplierId");
  const initialMovementId = searchParams.get("movementId");
  const initialAccountId = searchParams.get("accountId");
  const initialAmount = searchParams.get("amount");

  const [suppliers, setSuppliers] = useState<CustomerSummary[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(initialSupplierId || "");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [availableCheques, setAvailableCheques] = useState<any[]>([]);
  const [availableMovements, setAvailableMovements] = useState<any[]>([]);
  const [movementConceptFilter, setMovementConceptFilter] = useState<string>("all");
  const [concepts, setConcepts] = useState<any[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);

  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState<string>("");

  // Imputations
  const [imputations, setImputations] = useState<ImputationRow[]>([]);

  // Payment Lines
  const [lines, setLines] = useState<PaymentLine[]>([]);

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadMovementsForAccount = async (accountId?: string) => {
    try {
      const movs = await api.listPaymentAvailableMovements(accountId || undefined);
      setAvailableMovements(movs || []);
    } catch {
      setAvailableMovements([]);
    }
  };

  const filteredAvailableMovements = useMemo(() => {
    return availableMovements.filter((m) => {
      if (movementConceptFilter === "all") return true;
      if (movementConceptFilter === "unclassified") return !m.conceptId;
      return m.conceptId === movementConceptFilter;
    });
  }, [availableMovements, movementConceptFilter]);

  // Load initial data
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [dirRes, accRes, chqRes, invRes, concRes] = await Promise.all([
          api.listCustomers("", ""),
          api.listFinanceAccounts().catch(() => [] as Account[]),
          api.listReceivedCheques().catch(() => [] as any[]),
          api.listPurchaseInvoices("", "").catch(() => [] as PurchaseInvoice[]),
          api.listFinanceConcepts().catch(() => [] as any[])
        ]);

        const supps = (dirRes.items || []).filter((d) => d.isSupplier);
        setSuppliers(supps);
        setAccounts(accRes || []);
        setAvailableCheques(
          (chqRes || []).filter(
            (c) => c.status === 0 || c.status === "Available" || c.status === "En cartera"
          )
        );
        setPurchaseInvoices(invRes || []);
        setConcepts((concRes || []).filter((c: any) => c.isActive));

                if (initialMovementId) {
          const parsedAmount = initialAmount ? parseFloat(initialAmount) || 0 : 0;
          setLines([
            {
              id: Math.random().toString(36).substring(2, 9),
              method: "BankTransfer",
              amount: parsedAmount,
              currency: "ARS",
              accountId: initialAccountId || undefined,
              bankMovementId: initialMovementId,
              notes: ""
            }
          ]);
          void loadMovementsForAccount(initialAccountId || undefined);
        } else {
          const firstBank = (accRes || []).find((a) => a.isActive);
          if (firstBank) {
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
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar datos maestros.");
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, []);

  // Update imputations when supplier changes
  useEffect(() => {
    if (!selectedSupplierId) {
      setImputations([]);
      return;
    }

    const supplierInvoices = purchaseInvoices.filter(
      (inv) => inv.supplierId === selectedSupplierId
    );

    const rows: ImputationRow[] = supplierInvoices.map((inv) => ({
      invoice: inv,
      selected: false,
      amountImputed: inv.total || 0
    }));

    setImputations(rows);
  }, [selectedSupplierId, purchaseInvoices]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId),
    [suppliers, selectedSupplierId]
  );

  // Totals calculations
  const totalImputed = useMemo(
    () =>
      imputations
        .filter((i) => i.selected)
        .reduce((sum, i) => sum + (Number(i.amountImputed) || 0), 0),
    [imputations]
  );

  const totalPaymentLines = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
    [lines]
  );

  // If user imputed invoices, total OP matches total imputed. Otherwise total OP is total paid.
  const totalOrderAmount = totalImputed > 0 ? totalImputed : totalPaymentLines;
  const difference = totalImputed > 0 ? totalPaymentLines - totalImputed : 0;

  // Handlers for Imputations
  const toggleSelectInvoice = (idx: number) => {
    setImputations((prev) => {
      const next = [...prev];
      const current = next[idx];
      const newSelected = !current.selected;
      next[idx] = {
        ...current,
        selected: newSelected,
        amountImputed: newSelected ? current.invoice.total || 0 : 0
      };
      return next;
    });
  };

  const handleImputedAmountChange = (idx: number, val: number) => {
    setImputations((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        amountImputed: val,
        selected: val > 0
      };
      return next;
    });
  };

  const handleSelectAllInvoices = () => {
    setImputations((prev) =>
      prev.map((r) => ({
        ...r,
        selected: true,
        amountImputed: r.invoice.total || 0
      }))
    );
  };

  // Handlers for Payment Lines
  const addLine = (method: PaymentLine["method"] = "BankTransfer") => {
    const firstAcc = accounts.find((a) => a.isActive);
    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        method,
        amount: Math.max(0, totalImputed - totalPaymentLines),
        currency: firstAcc?.currency || "ARS",
        accountId: firstAcc?.id,
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
    if (!selectedSupplier) {
      setError("Por favor seleccione un proveedor.");
      return;
    }

    if (totalOrderAmount <= 0) {
      setError("El importe total de la orden de pago debe ser mayor a cero.");
      return;
    }

    if (totalImputed > 0 && Math.abs(difference) > 0.01) {
      setError(
        `Los medios de pago (${money(totalPaymentLines)}) no coinciden con el total imputado (${money(totalImputed)}). Diferencia: ${money(difference)}.`
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.tradeName || selectedSupplier.legalName || "Proveedor",
        supplierTaxId: selectedSupplier.documentNumber || "",
        paymentDateUtc: new Date(paymentDate).toISOString(),
        currency: "ARS",
        amount: totalOrderAmount,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          method: l.method,
          amount: Number(l.amount) || 0,
          currency: l.currency || "ARS",
          accountId: l.accountId || null,
          bankMovementId: l.bankMovementId || null,
          chequeId: l.chequeId || null,
          retentionType: l.retentionType || null,
          retentionCertificate: l.retentionCertificate || null,
          notes: l.notes || null
        })),
        imputations: imputations
          .filter((i) => i.selected && Number(i.amountImputed) > 0)
          .map((i) => ({
            purchaseInvoiceId: i.invoice.id,
            invoiceNumber: `${String(i.invoice.pointOfSale).padStart(4, "0")}-${String(i.invoice.invoiceNumber).padStart(8, "0")}`,
            invoiceTotal: i.invoice.total || 0,
            amountImputed: Number(i.amountImputed) || 0
          }))
      };

      const result = await api.createPaymentOrder(payload);
      navigate(`/finanzas/pagos/${result.id}/imprimir`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo emitir la orden de pago.");
      setSaving(false);
    }
  };

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS Â· EMISIÃ“N DE PAGOS</span>
          <h1>Nueva Orden de Pago a Proveedor</h1>
          <p className="muted">
            ImputaciÃ³n de facturas de compra y desglose de medios de pago (transferencias, cheques y retenciones).
          </p>
        </div>
        <div className="toolbar" style={{ gap: 10 }}>
          <Link className="btn btn-outline" to="/finanzas/pagos">
            â† Cancelar / Volver
          </Link>
          <button className="btn" onClick={() => void handleSave()} disabled={saving || loading}>
            {saving ? "Emitiendo..." : "ðŸ’¾ Emitir Orden de Pago"}
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="grid-2" style={{ gap: 20, alignItems: "start" }}>
        {/* Left Column: Supplier & Invoices to Impute */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Supplier Selector Card */}
          <section className="card pad">
            <h2 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>1. Proveedor y Fecha</h2>
            <div className="grid-2">
              <label>
                Proveedor
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  disabled={loading}
                >
                  <option value="">-- Seleccionar proveedor --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.tradeName || s.legalName} {s.documentNumber ? `(${s.documentNumber})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Fecha de EmisiÃ³n / Pago
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </label>

              <label style={{ gridColumn: "span 2" }}>
                Concepto / Observaciones
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej.: CancelaciÃ³n factura mensual de insumos de taller..."
                />
              </label>
            </div>

            {selectedSupplier && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  background: "var(--surface-soft, #f8fafc)",
                  borderRadius: 6,
                  fontSize: "0.84rem",
                  display: "flex",
                  gap: 16,
                  flexWrap: "wrap"
                }}
              >
                <span>
                  <strong>RazÃ³n Social:</strong> {selectedSupplier.legalName || selectedSupplier.tradeName}
                </span>
                <span>
                  <strong>CUIT:</strong> {selectedSupplier.documentNumber || "No informado"}
                </span>
                <span>
                  <strong>CondiciÃ³n IVA:</strong> {selectedSupplier.taxCondition || "Resp. Inscripto"}
                </span>
              </div>
            )}
          </section>

          {/* Pending Invoices Card */}
          <section className="card pad">
            <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>2. Facturas de Compra a Cancelar</h2>
                <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                  Seleccione las facturas que se cancelan total o parcialmente con este pago.
                </p>
              </div>
              {imputations.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleSelectAllInvoices}
                >
                  âœ“ Imputar todas
                </button>
              )}
            </div>

            {!selectedSupplierId ? (
              <p className="muted" style={{ textAlign: "center", padding: 20 }}>
                Seleccione un proveedor para visualizar sus facturas de compra pendientes.
              </p>
            ) : imputations.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20 }}>
                <p className="muted">
                  Este proveedor no tiene facturas de compra cargadas en el sistema.
                </p>
                <small className="muted">
                  PodÃ©s emitir la Orden de Pago como <strong>Pago a Cuenta / Anticipo</strong> cargando los medios de pago a la derecha.
                </small>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>Comprobante</th>
                      <th>Fecha</th>
                      <th style={{ textAlign: "right" }}>Total Factura</th>
                      <th style={{ textAlign: "right", width: 140 }}>Monto a Imputar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imputations.map((row, idx) => (
                      <tr
                        key={row.invoice.id}
                        style={{
                          background: row.selected ? "rgba(16, 185, 129, 0.05)" : undefined
                        }}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => toggleSelectInvoice(idx)}
                          />
                        </td>
                        <td>
                          <strong>
                            Factura {row.invoice.invoiceType || "A"} {String(row.invoice.pointOfSale).padStart(4, "0")}-{String(row.invoice.invoiceNumber).padStart(8, "0")}
                          </strong>
                        </td>
                        <td>{new Date(row.invoice.issueDate).toLocaleDateString("es-AR")}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {money(row.invoice.total || 0)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            style={{ textAlign: "right", padding: "4px 8px" }}
                            value={row.amountImputed}
                            onChange={(e) =>
                              handleImputedAmountChange(idx, parseFloat(e.target.value) || 0)
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={4} style={{ textAlign: "right" }}>
                        Total Facturas Imputadas:
                      </th>
                      <th style={{ textAlign: "right", color: "#059669", fontSize: "1rem" }}>
                        {money(totalImputed)}
                      </th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Payment Methods & Balancing */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Payment Methods Card */}
          <section className="card pad">
            <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>3. Medios de Pago y Valores</h2>
                <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                  Efectivo, transferencias, cheques y certificados de retenciÃ³n.
                </p>
              </div>
              <div className="toolbar" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => addLine("BankTransfer")}
                >
                  + Transferencia
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => addLine("ChequeThirdParty")}
                >
                  + Cheque Cartera
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => addLine("Retention")}
                >
                  + RetenciÃ³n
                </button>
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="muted" style={{ textAlign: "center", padding: 20 }}>
                No ha aÃ±adido medios de pago. Haga clic en los botones superiores para agregar uno.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {lines.map((line) => (
                  <div
                    key={line.id}
                    className="card pad"
                    style={{
                      border: "1px solid var(--border, #e2e8f0)",
                      background: "var(--surface-soft, #f8fafc)",
                      position: "relative"
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: "1rem"
                      }}
                      title="Eliminar este medio de pago"
                    >
                      âœ•
                    </button>

                    <div className="grid-2" style={{ gap: 10 }}>
                      <label>
                        Medio de Pago
                        <select
                          value={line.method}
                          onChange={(e) =>
                            updateLine(line.id, {
                              method: e.target.value as PaymentLine["method"]
                            })
                          }
                        >
                          <option value="BankTransfer">ðŸ¦ Transferencia Bancaria</option>
                          <option value="Cash">ðŸ’µ Efectivo (Caja)</option>
                          <option value="ChequeThirdParty">ðŸ“œ Cheque de Terceros (Endoso)</option>
                          <option value="ChequeOwn">âœï¸ Cheque Propio Emitido</option>
                          <option value="Retention">ðŸ›ï¸ RetenciÃ³n Practicada</option>
                        </select>
                      </label>

                      <label>
                        Importe Abonado
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.amount}
                          onChange={(e) =>
                            updateLine(line.id, { amount: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </label>

                      {(line.method === "BankTransfer" || line.method === "Cash") && (
                        <label style={{ gridColumn: "span 2" }}>
                          Cuenta Financiera de Origen
                          <select
                            value={line.accountId || ""}
                            onChange={(e) => updateLine(line.id, { accountId: e.target.value })}
                          >
                            <option value="">-- Seleccionar cuenta bancaria / caja --</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.currency}) - Saldo: {money(a.balance, a.currency)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {line.method === "ChequeThirdParty" && (
                        <label style={{ gridColumn: "span 2" }}>
                          Seleccionar Cheque de Cartera
                          <select
                            value={line.chequeId || ""}
                            onChange={(e) => {
                              const chq = availableCheques.find((c) => c.id === e.target.value);
                              updateLine(line.id, {
                                chequeId: e.target.value,
                                amount: chq ? chq.amount : line.amount,
                                notes: chq
                                  ? `Cheque NÂ° ${chq.checkNumber} - ${chq.bankName || "Banco"} - Vto: ${new Date(chq.dueDateUtc).toLocaleDateString("es-AR")}`
                                  : ""
                              });
                            }}
                          >
                            <option value="">-- Elegir cheque disponible en cartera --</option>
                            {availableCheques.map((c) => (
                              <option key={c.id} value={c.id}>
                                NÂ° {c.checkNumber} | {c.bankName || "Banco"} | Venc:{" "}
                                {new Date(c.dueDateUtc).toLocaleDateString("es-AR")} |{" "}
                                {money(c.amount, c.currency)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {line.method === "Retention" && (
                        <>
                          <label>
                            Tipo de RetenciÃ³n
                            <select
                              value={line.retentionType || "Ganancias"}
                              onChange={(e) =>
                                updateLine(line.id, { retentionType: e.target.value })
                              }
                            >
                              <option value="Ganancias">Ganancias (RG 830)</option>
                              <option value="IIBB">Ingresos Brutos (IIBB)</option>
                              <option value="IVA">IVA (RG 2854)</option>
                              <option value="SUSS">Seguridad Social (SUSS)</option>
                            </select>
                          </label>

                          <label>
                            NÂ° Certificado RetenciÃ³n
                            <input
                              value={line.retentionCertificate || ""}
                              onChange={(e) =>
                                updateLine(line.id, { retentionCertificate: e.target.value })
                              }
                              placeholder="Ej.: RET-2026-00014"
                            />
                          </label>
                        </>
                      )}

                      <label style={{ gridColumn: "span 2" }}>
                        Referencia / Detalle
                        <input
                          value={line.notes || ""}
                          onChange={(e) => updateLine(line.id, { notes: e.target.value })}
                          placeholder="NÂ° de transferencia, banco o nota..."
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Balance & Summary Card */}
          <section
            className="card pad"
            style={{
              borderTop: "4px solid #3b82f6",
              background: "var(--surface, #ffffff)"
            }}
          >
            <h2 style={{ margin: "0 0 14px 0", fontSize: "1.1rem" }}>4. Resumen de la Orden de Pago</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Total Facturas Imputadas:</span>
                <strong>{money(totalImputed)}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Total Medios de Pago:</span>
                <strong>{money(totalPaymentLines)}</strong>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--border, #e2e8f0)", margin: "4px 0" }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.05rem", fontWeight: 700 }}>Total Orden de Pago:</span>
                <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#059669" }}>
                  {money(totalOrderAmount)}
                </span>
              </div>

              {totalImputed > 0 && (
                <div style={{ marginTop: 8 }}>
                  {Math.abs(difference) <= 0.01 ? (
                    <div
                      className="badge ok"
                      style={{
                        display: "block",
                        textAlign: "center",
                        padding: "8px 12px",
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#065f46",
                        fontWeight: 700,
                        fontSize: "0.88rem"
                      }}
                    >
                      âœ“ Orden Balanceada: ImputaciÃ³n y Medios de Pago coinciden al 100%
                    </div>
                  ) : (
                    <div
                      className="badge warn"
                      style={{
                        display: "block",
                        textAlign: "center",
                        padding: "8px 12px",
                        background: "rgba(239, 68, 68, 0.12)",
                        color: "#991b1b",
                        fontWeight: 700,
                        fontSize: "0.88rem"
                      }}
                    >
                      âš ï¸ Desbalance: {difference > 0 ? "Sobran" : "Faltan"} {money(Math.abs(difference))} en medios de pago
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn"
                style={{ width: "100%", padding: 12, fontSize: "1rem" }}
                disabled={saving || loading || !selectedSupplierId}
                onClick={() => void handleSave()}
              >
                {saving ? "Procesando Orden de Pago..." : "ðŸ’¾ Emitir Orden de Pago"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


