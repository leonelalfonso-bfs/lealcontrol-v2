import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { CustomerSummary, PurchaseInvoice } from "../api/types";
import { QuickCreateChequeModal } from "../components/QuickCreateChequeModal";
import { Modal } from "../components/ui/Modal";

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
  conceptId?: string;
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

const METHOD_LABELS: Record<PaymentLine["method"], string> = {
  BankTransfer: "Transferencia",
  Cash: "Efectivo",
  ChequeThirdParty: "Cheque cartera",
  ChequeOwn: "Cheque propio",
  Retention: "Retención"
};

const newLineId = () => Math.random().toString(36).substring(2, 9);

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
  const [ownCheques, setOwnCheques] = useState<any[]>([]);
  const [availableMovements, setAvailableMovements] = useState<any[]>([]);
  const [movementConceptFilter, setMovementConceptFilter] = useState<string>("");
  const [movementAccountFilter, setMovementAccountFilter] = useState<string>("");
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [createChequeLineId, setCreateChequeLineId] = useState<string | null>(null);
  const [createChequeDirection, setCreateChequeDirection] = useState<"Received" | "Issued">("Received");
  const [lineEditorOpen, setLineEditorOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [draftLine, setDraftLine] = useState<PaymentLine | null>(null);
  const [lineEditorError, setLineEditorError] = useState<string | null>(null);

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

  const loadAvailableMovements = async (accountId?: string, conceptId?: string) => {
    setLoadingMovements(true);
    try {
      const account = accountId && accountId.trim() ? accountId : undefined;
      const concept = conceptId && conceptId.trim() ? conceptId : undefined;
      const movs = await api.listPaymentAvailableMovements(account, concept);
      setAvailableMovements(Array.isArray(movs) ? movs : []);
    } catch {
      setAvailableMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  const expenseConcepts = useMemo(
    () => concepts.filter((c) => c.usableIn === "PaymentOrder" && (c.direction === "Expense" || c.direction === "Both")),
    [concepts]
  );

  const filteredAvailableMovements = useMemo(() => {
    if (!movementAccountFilter) return availableMovements;
    return availableMovements.filter((m) => String(m.accountId || "") === movementAccountFilter);
  }, [availableMovements, movementAccountFilter]);

  useEffect(() => {
    if (!movementConceptFilter) return;
    void loadAvailableMovements(movementAccountFilter || "", movementConceptFilter);
  }, [movementConceptFilter, movementAccountFilter]);

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
        const allCheques = chqRes || [];
        setAvailableCheques(
          allCheques.filter(
            (c) =>
              (c.status === 0 || c.status === "Available" || c.status === "En cartera") &&
              (c.direction == null || c.direction === "Received")
          )
        );
        setOwnCheques(
          allCheques.filter(
            (c) =>
              c.direction === "Issued" &&
              (c.status === "Issued" || c.status === "Available" || c.status === "Emitido")
          )
        );
        setPurchaseInvoices(invRes || []);
        const activeConcepts = (concRes || []).filter((c: any) => c.isActive);
        setConcepts(activeConcepts);
        const defaultPago = activeConcepts.find((c: any) => c.code === "PAGO_PROVEEDOR")
          || activeConcepts.find((c: any) => c.direction === "Expense");
        const defaultConceptId = defaultPago?.id || "";
        if (defaultConceptId) {
          setMovementConceptFilter(defaultConceptId);
        }

        // Initial default line: Bank Transfer with first active bank account or from query params
        if (initialMovementId) {
          const parsedAmount = initialAmount ? parseFloat(initialAmount) || 0 : 0;
          setLines([
            {
              id: newLineId(),
              method: "BankTransfer",
              amount: parsedAmount,
              currency: "ARS",
              accountId: initialAccountId || undefined,
              bankMovementId: initialMovementId,
              conceptId: defaultConceptId || undefined,
              notes: ""
            }
          ]);
          if (initialAccountId) setMovementAccountFilter(initialAccountId);
          void loadAvailableMovements(initialAccountId || "", defaultConceptId);
        } else {
          setLines([]);
          if (defaultConceptId) {
            void loadAvailableMovements("", defaultConceptId);
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
  const patchDraft = (patch: Partial<PaymentLine>) => {
    setDraftLine((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      if (patch.conceptId && updated.method === "BankTransfer") {
        setMovementConceptFilter(patch.conceptId);
      }
      return updated;
    });
  };

  const closeLineEditor = () => {
    setLineEditorOpen(false);
    setEditingLineId(null);
    setDraftLine(null);
    setLineEditorError(null);
  };

  const openLineEditor = (method: PaymentLine["method"], existing?: PaymentLine) => {
    const firstAcc = accounts.find((a) => a.isActive);
    const defaultConcept = concepts.find((c) => c.code === "PAGO_PROVEEDOR") || expenseConcepts[0];
    setLineEditorError(null);
    if (existing) {
      setEditingLineId(existing.id);
      setDraftLine({ ...existing });
      if (existing.method === "BankTransfer") {
        void loadAvailableMovements(
          existing.accountId || movementAccountFilter || "",
          existing.conceptId || movementConceptFilter || defaultConcept?.id || ""
        );
      }
    } else {
      const remaining = Math.max(0, totalImputed - totalPaymentLines);
      setEditingLineId(null);
      setDraftLine({
        id: newLineId(),
        method,
        amount: remaining,
        currency: firstAcc?.currency || "ARS",
        accountId: firstAcc?.id,
        conceptId: defaultConcept?.id,
        retentionType: method === "Retention" ? "Ganancias" : undefined,
        notes: ""
      });
      if (method === "BankTransfer") {
        void loadAvailableMovements(
          movementAccountFilter || "",
          movementConceptFilter || defaultConcept?.id || ""
        );
      }
    }
    setLineEditorOpen(true);
  };

  const saveLineEditor = () => {
    if (!draftLine) return;
    if (!(Number(draftLine.amount) > 0)) {
      setLineEditorError("Indicá un importe mayor a cero.");
      return;
    }
    if (
      (draftLine.method === "ChequeThirdParty" || draftLine.method === "ChequeOwn") &&
      !draftLine.chequeId
    ) {
      setLineEditorError("Seleccioná o creá un cheque.");
      return;
    }
    if (draftLine.method === "BankTransfer" && draftLine.bankMovementId && !(draftLine.conceptId || movementConceptFilter)) {
      setLineEditorError("Elegí la cartera (concepto) para la transferencia vinculada.");
      return;
    }

    const toSave: PaymentLine = {
      ...draftLine,
      amount: Number(draftLine.amount) || 0,
      conceptId: draftLine.conceptId || movementConceptFilter || undefined
    };

    if (editingLineId) {
      setLines((prev) => prev.map((l) => (l.id === editingLineId ? { ...toSave, id: editingLineId } : l)));
    } else {
      setLines((prev) => [...prev, toSave]);
    }
    closeLineEditor();
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<PaymentLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id === id) {
          const updated = { ...l, ...patch };
          if (patch.conceptId && updated.method === "BankTransfer") {
            setMovementConceptFilter(patch.conceptId);
          }
          return updated;
        }
        return l;
      })
    );
  };

  const lineDetail = (line: PaymentLine) => {
    if (line.method === "Retention") {
      return [line.retentionType, line.retentionCertificate].filter(Boolean).join(" · ") || "Sin certificado";
    }
    if (line.method === "ChequeThirdParty" || line.method === "ChequeOwn") {
      return line.notes || "Cheque seleccionado";
    }
    const account = accounts.find((a) => a.id === line.accountId);
    const parts = [account?.name, line.notes].filter(Boolean);
    return parts.join(" · ") || "Sin detalle";
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

    const bankLineMissingWallet = lines.some(
      (l) =>
        l.method === "BankTransfer" &&
        l.bankMovementId &&
        !(l.conceptId || movementConceptFilter)
    );
    if (bankLineMissingWallet) {
      setError("Elegí la cartera (concepto) para cada transferencia bancaria vinculada.");
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
          conceptId: l.conceptId || movementConceptFilter || null,
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
          <span className="eyebrow">FINANZAS · EMISIÓN DE PAGOS</span>
          <h1>Nueva Orden de Pago a Proveedor</h1>
          <p className="muted">
            Imputación de facturas de compra y desglose de medios de pago (transferencias, cheques y retenciones).
          </p>
        </div>
        <div className="toolbar" style={{ gap: 10 }}>
          <Link className="btn btn-outline" to="/finanzas/pagos">
            ← Cancelar / Volver
          </Link>
          <button className="btn" onClick={() => void handleSave()} disabled={saving || loading}>
            {saving ? "Emitiendo..." : "💾 Emitir Orden de Pago"}
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
                Fecha de Emisión / Pago
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
                  placeholder="Ej.: Cancelación factura mensual de insumos de taller..."
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
                  <strong>Razón Social:</strong> {selectedSupplier.legalName || selectedSupplier.tradeName}
                </span>
                <span>
                  <strong>CUIT:</strong> {selectedSupplier.documentNumber || "No informado"}
                </span>
                <span>
                  <strong>Condición IVA:</strong> {selectedSupplier.taxCondition || "Resp. Inscripto"}
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
                  ✓ Imputar todas
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
                  Podés emitir la Orden de Pago como <strong>Pago a Cuenta / Anticipo</strong> cargando los medios de pago a la derecha.
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
            <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>3. Medios de Pago y Valores</h2>
                <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                  Lista de lo cargado. Cada medio se edita en el mismo modal.
                </p>
              </div>
              <div className="toolbar" style={{ gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => openLineEditor("BankTransfer")}>
                  + Transferencia
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => openLineEditor("Cash")}>
                  + Efectivo
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => openLineEditor("ChequeThirdParty")}>
                  + Cheque Cartera
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => openLineEditor("ChequeOwn")}>
                  + Cheque Propio
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => openLineEditor("Retention")}>
                  + Retención
                </button>
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="muted" style={{ textAlign: "center", padding: 20 }}>
                Todavía no hay medios de pago. Usá los botones de arriba para agregar el primero.
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Medio</th>
                      <th>Detalle</th>
                      <th style={{ textAlign: "right" }}>Importe</th>
                      <th style={{ width: 120 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <strong>{METHOD_LABELS[line.method]}</strong>
                        </td>
                        <td style={{ fontSize: "0.86rem" }}>{lineDetail(line)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{money(line.amount, line.currency)}</td>
                        <td>
                          <div className="toolbar" style={{ gap: 4, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => openLineEditor(line.method, line)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn ghost btn-sm"
                              style={{ color: "#ef4444" }}
                              onClick={() => removeLine(line.id)}
                              title="Eliminar"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2} style={{ textAlign: "right" }}>
                        Total medios:
                      </th>
                      <th style={{ textAlign: "right", color: "#059669" }}>{money(totalPaymentLines)}</th>
                      <th />
                    </tr>
                  </tfoot>
                </table>
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
                      ✓ Orden Balanceada: Imputación y Medios de Pago coinciden al 100%
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
                      ⚠️ Desbalance: {difference > 0 ? "Sobran" : "Faltan"} {money(Math.abs(difference))} en medios de pago
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
                {saving ? "Procesando Orden de Pago..." : "💾 Emitir Orden de Pago"}
              </button>
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={lineEditorOpen && !!draftLine}
        onClose={closeLineEditor}
        title={editingLineId ? "Editar medio de pago" : "Agregar medio de pago"}
        contentStyle={{ maxWidth: 720, width: "100%" }}
        footer={(
          <>
            <button type="button" className="btn ghost" onClick={closeLineEditor}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={saveLineEditor}>
              {editingLineId ? "Guardar cambios" : "Agregar a la lista"}
            </button>
          </>
        )}
      >
        {draftLine && (
          <div className="grid-2" style={{ gap: 10 }}>
            {lineEditorError && (
              <div className="alert" style={{ gridColumn: "span 2" }}>
                {lineEditorError}
              </div>
            )}

            <label>
              Medio de Pago
              <select
                value={draftLine.method}
                onChange={(e) => {
                  const method = e.target.value as PaymentLine["method"];
                  patchDraft({
                    method,
                    bankMovementId: undefined,
                    chequeId: undefined,
                    retentionType: method === "Retention" ? draftLine.retentionType || "Ganancias" : undefined
                  });
                  if (method === "BankTransfer") {
                    void loadAvailableMovements(
                      draftLine.accountId || movementAccountFilter || "",
                      draftLine.conceptId || movementConceptFilter || ""
                    );
                  }
                }}
              >
                <option value="BankTransfer">Transferencia Bancaria</option>
                <option value="Cash">Efectivo (Caja)</option>
                <option value="ChequeThirdParty">Cheque de Terceros (Endoso)</option>
                <option value="ChequeOwn">Cheque Propio Emitido</option>
                <option value="Retention">Retención Practicada</option>
              </select>
            </label>

            <label>
              Importe Abonado
              <input
                type="number"
                step="0.01"
                min="0"
                value={draftLine.amount}
                onChange={(e) => patchDraft({ amount: parseFloat(e.target.value) || 0 })}
              />
            </label>

            {(draftLine.method === "BankTransfer" || draftLine.method === "Cash") && (
              <label style={{ gridColumn: "span 2" }}>
                Concepto de Pago (cartera) *
                <select
                  required
                  value={draftLine.conceptId || movementConceptFilter || ""}
                  onChange={(e) => {
                    const conceptId = e.target.value || undefined;
                    patchDraft({ conceptId, bankMovementId: undefined });
                    if (conceptId) setMovementConceptFilter(conceptId);
                  }}
                >
                  <option value="" disabled>
                    Elegí una cartera de egreso
                  </option>
                  {expenseConcepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {(draftLine.method === "BankTransfer" || draftLine.method === "Cash") && (
              <label style={{ gridColumn: "span 2" }}>
                Cuenta Financiera de Origen
                <select
                  value={draftLine.accountId || ""}
                  onChange={(e) =>
                    patchDraft({ accountId: e.target.value || undefined, bankMovementId: undefined })
                  }
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

            {draftLine.method === "BankTransfer" && (
              <div
                style={{
                  gridColumn: "span 2",
                  background: "#f8fafc",
                  padding: 12,
                  borderRadius: 6,
                  border: "1px solid #e2e8f0"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                    flexWrap: "wrap",
                    gap: 8
                  }}
                >
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f766e" }}>
                    Vincular transferencia del extracto (opcional)
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <label style={{ fontSize: "0.75rem", color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                      Cartera
                      <select
                        value={movementConceptFilter}
                        onChange={(e) => {
                          const conceptId = e.target.value;
                          setMovementConceptFilter(conceptId);
                          patchDraft({ bankMovementId: undefined, conceptId: conceptId || undefined });
                        }}
                        style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: 4, border: "1px solid #cbd5e1" }}
                      >
                        {expenseConcepts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ fontSize: "0.75rem", color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                      Cuenta
                      <select
                        value={movementAccountFilter}
                        onChange={(e) => {
                          setMovementAccountFilter(e.target.value);
                          patchDraft({
                            bankMovementId: undefined,
                            accountId: e.target.value || draftLine.accountId
                          });
                        }}
                        style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: 4, border: "1px solid #cbd5e1" }}
                      >
                        <option value="">Todas las cuentas</option>
                        {accounts
                          .filter((a) => a.isActive)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                </div>

                <select
                  value={draftLine.bankMovementId || ""}
                  onChange={(e) => {
                    const movId = e.target.value;
                    const mov = filteredAvailableMovements.find((m) => m.id === movId);
                    patchDraft({
                      bankMovementId: movId || undefined,
                      accountId: mov?.accountId || draftLine.accountId,
                      amount: mov ? Number(mov.amount) : draftLine.amount,
                      notes: mov ? mov.description : draftLine.notes,
                      conceptId: mov?.conceptId || draftLine.conceptId || movementConceptFilter || undefined
                    });
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem"
                  }}
                >
                  <option value="">
                    {loadingMovements
                      ? "Cargando movimientos…"
                      : filteredAvailableMovements.length === 0
                        ? "-- Sin movimientos confirmados disponibles --"
                        : `-- Elegí entre ${filteredAvailableMovements.length} movimiento(s) --`}
                  </option>
                  {filteredAvailableMovements.map((m) => (
                    <option key={m.id} value={m.id}>
                      {new Date(m.operationDateUtc).toLocaleDateString("es-AR")} · {money(m.amount, m.currency)} · [
                      {m.conceptName || m.ConceptName || "Sin clasificar"}]
                      {m.accountName ? ` · ${m.accountName}` : ""} · {m.description}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {draftLine.method === "ChequeThirdParty" && (
              <div style={{ gridColumn: "span 2" }}>
                <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
                  <label style={{ margin: 0, flex: 1 }}>
                    Seleccionar Cheque de Cartera
                    <select
                      value={draftLine.chequeId || ""}
                      onChange={(e) => {
                        const chq = availableCheques.find((c) => c.id === e.target.value);
                        patchDraft({
                          chequeId: e.target.value || undefined,
                          amount: chq ? chq.amount : draftLine.amount,
                          notes: chq
                            ? `Cheque N° ${chq.checkNumber} - ${chq.bankName || "Banco"} - Vto: ${chq.dueDateUtc ? new Date(chq.dueDateUtc).toLocaleDateString("es-AR") : "s/d"}`
                            : ""
                        });
                      }}
                    >
                      <option value="">-- Elegir cheque disponible en cartera --</option>
                      {availableCheques.map((c) => (
                        <option key={c.id} value={c.id}>
                          N° {c.checkNumber} | {c.bankName || "Banco"} | Venc:{" "}
                          {c.dueDateUtc ? new Date(c.dueDateUtc).toLocaleDateString("es-AR") : "s/d"} |{" "}
                          {money(c.amount, c.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline compact"
                    style={{ alignSelf: "flex-end" }}
                    onClick={() => {
                      setCreateChequeDirection("Received");
                      setCreateChequeLineId(draftLine.id);
                    }}
                  >
                    + Nuevo cheque
                  </button>
                </div>
              </div>
            )}

            {draftLine.method === "ChequeOwn" && (
              <div style={{ gridColumn: "span 2" }}>
                <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
                  <label style={{ margin: 0, flex: 1 }}>
                    Cheque propio emitido (cartera)
                    <select
                      value={draftLine.chequeId || ""}
                      onChange={(e) => {
                        const chq = ownCheques.find((c) => c.id === e.target.value);
                        patchDraft({
                          chequeId: e.target.value || undefined,
                          amount: chq ? chq.amount : draftLine.amount,
                          notes: chq
                            ? `Cheque propio N° ${chq.checkNumber} - ${chq.bankName || "Banco"} - Vto: ${chq.dueDateUtc ? new Date(chq.dueDateUtc).toLocaleDateString("es-AR") : "s/d"}`
                            : draftLine.notes
                        });
                      }}
                    >
                      <option value="">-- Elegir cheque emitido o crear uno nuevo --</option>
                      {ownCheques.map((c) => (
                        <option key={c.id} value={c.id}>
                          N° {c.checkNumber} | {c.bankName || "Banco"} | Venc:{" "}
                          {c.dueDateUtc ? new Date(c.dueDateUtc).toLocaleDateString("es-AR") : "s/d"} |{" "}
                          {money(c.amount, c.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline compact"
                    style={{ alignSelf: "flex-end" }}
                    onClick={() => {
                      setCreateChequeDirection("Issued");
                      setCreateChequeLineId(draftLine.id);
                    }}
                  >
                    + Nuevo cheque
                  </button>
                </div>
              </div>
            )}

            {draftLine.method === "Retention" && (
              <>
                <label>
                  Tipo de Retención
                  <select
                    value={draftLine.retentionType || "Ganancias"}
                    onChange={(e) => patchDraft({ retentionType: e.target.value })}
                  >
                    <option value="Ganancias">Ganancias (RG 830)</option>
                    <option value="IIBB">Ingresos Brutos (IIBB)</option>
                    <option value="IVA">IVA (RG 2854)</option>
                    <option value="SUSS">Seguridad Social (SUSS)</option>
                  </select>
                </label>
                <label>
                  N° Certificado Retención
                  <input
                    value={draftLine.retentionCertificate || ""}
                    onChange={(e) => patchDraft({ retentionCertificate: e.target.value })}
                    placeholder="Ej.: RET-2026-00014"
                  />
                </label>
              </>
            )}

            <label style={{ gridColumn: "span 2" }}>
              Referencia / Detalle
              <input
                value={draftLine.notes || ""}
                onChange={(e) => patchDraft({ notes: e.target.value })}
                placeholder="N° de transferencia, banco o nota..."
              />
            </label>
          </div>
        )}
      </Modal>

      <QuickCreateChequeModal
        open={!!createChequeLineId}
        direction={createChequeDirection}
        defaultAmount={
          createChequeLineId && draftLine && draftLine.id === createChequeLineId
            ? draftLine.amount
            : createChequeLineId
              ? lines.find((l) => l.id === createChequeLineId)?.amount
              : undefined
        }
        defaultCurrency="ARS"
        onClose={() => setCreateChequeLineId(null)}
        onCreated={(ch) => {
          if (createChequeDirection === "Issued") {
            setOwnCheques((prev) => (prev.some((c) => c.id === ch.id) ? prev : [ch, ...prev]));
          } else {
            setAvailableCheques((prev) => (prev.some((c) => c.id === ch.id) ? prev : [ch, ...prev]));
          }
          const chequePatch = {
            chequeId: ch.id,
            amount: Number(ch.amount),
            notes:
              createChequeDirection === "Issued"
                ? `Cheque propio N° ${ch.checkNumber} - ${ch.bankName || "Banco"} - Vto: ${ch.dueDateUtc ? new Date(ch.dueDateUtc).toLocaleDateString("es-AR") : "s/d"}`
                : `Cheque N° ${ch.checkNumber} - ${ch.bankName || "Banco"} - Vto: ${ch.dueDateUtc ? new Date(ch.dueDateUtc).toLocaleDateString("es-AR") : "s/d"}`
          };
          if (draftLine && createChequeLineId === draftLine.id) {
            patchDraft(chequePatch);
          } else if (createChequeLineId) {
            updateLine(createChequeLineId, chequePatch);
          }
          setCreateChequeLineId(null);
        }}
      />
    </div>
  );
}
