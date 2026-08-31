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
  conceptId?: string;
  retentionType?: string;
  retentionCertificate?: string;
  notes?: string;
};

type ImputationRow = {
  invoice: Invoice;
  selected: boolean;
  isUsd: boolean;
  invoiceTotalOriginal: number;
  invoiceRate: number;
  paymentRate: number;
  pendingBalanceUsd: number;
  pendingBalanceArs: number;
  amountImputedArs: number;
  amountImputedUsd: number;
  differenceExchangeArs: number;
  adjustmentType: string;
};

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n || 0);

export function CollectionReceiptsWorkspacePage() {
  const [searchParams] = useSearchParams();
  const initialCustomerId = searchParams.get("customerId");
  const initialMovementId = searchParams.get("movementId");
  const initialAccountId = searchParams.get("accountId");
  const initialAmount = searchParams.get("amount");

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || "");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [availableCheques, setAvailableCheques] = useState<any[]>([]);
  const [availableMovements, setAvailableMovements] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [selectedReceiptDetail, setSelectedReceiptDetail] = useState<any | null>(null);

  // Filters for available bank movements
  const [movementConceptFilter, setMovementConceptFilter] = useState<string>("all");

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
      const [custRes, accRes, chqRes, invRes, recRes, concRes] = await Promise.all([
        api.listCustomers("", ""),
        api.listFinanceAccounts().catch(() => [] as Account[]),
        api.listReceivedCheques().catch(() => [] as any[]),
        api.listInvoices("", "", "").catch(() => [] as Invoice[]),
        api.listCollectionReceipts().catch(() => [] as any[]),
        api.listFinanceConcepts().catch(() => [] as any[])
      ]);

      const custs = custRes.items || [];
      setCustomers(custs);
      setAccounts(accRes || []);
      setInvoices(invRes || []);
      setReceipts(recRes || []);
      setConcepts((concRes || []).filter((c: any) => c.isActive));

      // Available cheques in portfolio
      setAvailableCheques(
        (chqRes || []).filter(
          (c) => (c.status === 0 || c.status === "Available" || c.status === "En cartera") && !c.collectionReceiptId
        )
      );

            // If movementId was passed from Bancos y Cajas
      if (initialMovementId) {
        const parsedAmount = initialAmount ? parseFloat(initialAmount) || 0 : 0;
        setLines([
          {
            id: Math.random().toString(36).substring(2, 9),
            method: "BankTransfer",
            amount: parsedAmount,
            currency,
            accountId: initialAccountId || undefined,
            movementId: initialMovementId,
            notes: ""
          }
        ]);
        void loadMovementsForAccount(initialAccountId || undefined);
      } else {
        // Initial default line: Bank Transfer with first active bank account
        const firstBank = (accRes || []).find((a) => a.isActive && (a.currency || "ARS") === currency) || (accRes || []).find((a) => a.isActive);
        if (firstBank && lines.length === 0) {
          setLines([
            {
              id: Math.random().toString(36).substring(2, 9),
              method: String(firstBank.type) === "Cash" || String(firstBank.type) === "1" ? "Cash" : "BankTransfer",
              amount: 0,
              currency: firstBank.currency || currency,
              accountId: firstBank.id,
              notes: ""
            }
          ]);
          void loadMovementsForAccount(firstBank.id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos.");
    } finally {
      setLoading(false);
    }
  };

  const loadMovementsForAccount = async (accountId?: string) => {
    try {
      const movs = await api.listCollectionAvailableMovements(accountId || undefined);
      setAvailableMovements(movs || []);
    } catch {
      setAvailableMovements([]);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Update imputations when customer or currency changes
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

    // Calculate pending balances in USD and ARS accurately
    const rows: ImputationRow[] = custInvoices.map((inv) => {
      const isUsd = inv.currency === "USD";
      const invoiceRate = inv.exchangeRate && inv.exchangeRate > 0 ? inv.exchangeRate : 1;

      // Calculate past imputed in USD
      const pastImputedUsd = receipts
        .filter((r) => r.invoiceId === inv.id || (r.invoicesSummary && r.invoicesSummary.includes(inv.formattedNumber)))
        .reduce((sum, r) => {
          if (r.invoiceAmount && r.invoiceCurrency === "USD") return sum + Number(r.invoiceAmount);
          if (r.currency === "USD") return sum + Number(r.amount);
          if (r.paymentExchangeRate && r.paymentExchangeRate > 0) return sum + (Number(r.amount) / Number(r.paymentExchangeRate));
          if (inv.exchangeRate && inv.exchangeRate > 0) return sum + (Number(r.amount) / Number(inv.exchangeRate));
          return sum;
        }, 0);

      // Calculate past imputed in ARS
      const pastImputedArs = receipts
        .filter((r) => r.invoiceId === inv.id || (r.invoicesSummary && r.invoicesSummary.includes(inv.formattedNumber)))
        .reduce((sum, r) => {
          if (r.currency === "USD") return sum + (Number(r.amount) * (r.invoiceExchangeRate || invoiceRate));
          return sum + Number(r.amount);
        }, 0);

      const pendingBalanceUsd = isUsd ? Math.max(0, (inv.total || 0) - pastImputedUsd) : 0;
      const pendingBalanceArs = isUsd ? pendingBalanceUsd * invoiceRate : Math.max(0, (inv.total || 0) - pastImputedArs);

      const paymentRate = invoiceRate; // Default to invoice issuance rate
      const defaultArs = isUsd ? pendingBalanceUsd * paymentRate : pendingBalanceArs;
      const defaultUsd = isUsd ? pendingBalanceUsd : (paymentRate > 0 ? defaultArs / paymentRate : 0);

      return {
        invoice: inv,
        selected: false,
        isUsd,
        invoiceTotalOriginal: inv.total || 0,
        invoiceRate,
        paymentRate,
        pendingBalanceUsd,
        pendingBalanceArs,
        amountImputedArs: defaultArs,
        amountImputedUsd: defaultUsd,
        differenceExchangeArs: 0,
        adjustmentType: "Sin ajuste"
      };
    });

    setImputations(rows);
  }, [selectedCustomerId, invoices, customers, receipts]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  // Filter available movements by concept
  const filteredAvailableMovements = useMemo(() => {
    return availableMovements.filter((m) => {
      if (movementConceptFilter === "all") return true;
      if (movementConceptFilter === "unclassified") return !m.conceptId;
      return m.conceptId === movementConceptFilter || (m.conceptCode && m.conceptCode.includes(movementConceptFilter));
    });
  }, [availableMovements, movementConceptFilter]);

  // Totals calculations in Receipt Currency
  const totalImputed = useMemo(() => {
    return imputations
      .filter((i) => i.selected)
      .reduce((sum, i) => {
        if (currency === "USD") {
          return sum + (Number(i.amountImputedUsd) || 0);
        }
        return sum + (Number(i.amountImputedArs) || 0);
      }, 0);
  }, [imputations, currency]);

  const totalExchangeDifference = useMemo(() => {
    return imputations
      .filter((i) => i.selected && i.isUsd)
      .reduce((sum, i) => sum + (Number(i.differenceExchangeArs) || 0), 0);
  }, [imputations]);

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
      const cur = next[idx];
      const newSelected = !cur.selected;

      const imputedArs = newSelected ? cur.pendingBalanceArs : 0;
      const imputedUsd = newSelected ? cur.pendingBalanceUsd : 0;
      const diffArs = cur.isUsd && newSelected ? imputedUsd * (cur.paymentRate - cur.invoiceRate) : 0;

      next[idx] = {
        ...cur,
        selected: newSelected,
        amountImputedArs: imputedArs,
        amountImputedUsd: imputedUsd,
        differenceExchangeArs: diffArs,
        adjustmentType: diffArs > 0.01 ? "Nota de dÃ©bito sugerida" : diffArs < -0.01 ? "Nota de crÃ©dito sugerida" : "Sin ajuste"
      };
      return next;
    });
  };

  const handlePaymentRateChange = (idx: number, rate: number) => {
    setImputations((prev) => {
      const next = [...prev];
      const cur = next[idx];
      const validRate = Math.max(0.0001, rate);

      // Recompute ARS amount and difference of exchange
      const imputedArs = cur.amountImputedUsd * validRate;
      const diffArs = cur.isUsd ? cur.amountImputedUsd * (validRate - cur.invoiceRate) : 0;

      next[idx] = {
        ...cur,
        paymentRate: validRate,
        amountImputedArs: imputedArs,
        differenceExchangeArs: diffArs,
        adjustmentType: diffArs > 0.01 ? "Nota de dÃ©bito sugerida" : diffArs < -0.01 ? "Nota de crÃ©dito sugerida" : "Sin ajuste"
      };
      return next;
    });
  };

  const handleImputedArsChange = (idx: number, val: number) => {
    setImputations((prev) => {
      const next = [...prev];
      const cur = next[idx];
      const clampedArs = Math.max(0, val);
      const computedUsd = cur.paymentRate > 0 ? clampedArs / cur.paymentRate : 0;
      const diffArs = cur.isUsd ? computedUsd * (cur.paymentRate - cur.invoiceRate) : 0;

      next[idx] = {
        ...cur,
        amountImputedArs: clampedArs,
        amountImputedUsd: computedUsd,
        differenceExchangeArs: diffArs,
        selected: clampedArs > 0,
        adjustmentType: diffArs > 0.01 ? "Nota de dÃ©bito sugerida" : diffArs < -0.01 ? "Nota de crÃ©dito sugerida" : "Sin ajuste"
      };
      return next;
    });
  };

  const handleImputedUsdChange = (idx: number, val: number) => {
    setImputations((prev) => {
      const next = [...prev];
      const cur = next[idx];
      const clampedUsd = Math.max(0, val);
      const computedArs = clampedUsd * cur.paymentRate;
      const diffArs = cur.isUsd ? clampedUsd * (cur.paymentRate - cur.invoiceRate) : 0;

      next[idx] = {
        ...cur,
        amountImputedUsd: clampedUsd,
        amountImputedArs: computedArs,
        differenceExchangeArs: diffArs,
        selected: clampedUsd > 0,
        adjustmentType: diffArs > 0.01 ? "Nota de dÃ©bito sugerida" : diffArs < -0.01 ? "Nota de crÃ©dito sugerida" : "Sin ajuste"
      };
      return next;
    });
  };

  const handleSelectAllInvoices = () => {
    setImputations((prev) =>
      prev.map((r) => {
        const diffArs = r.isUsd ? r.pendingBalanceUsd * (r.paymentRate - r.invoiceRate) : 0;
        return {
          ...r,
          selected: true,
          amountImputedArs: r.isUsd ? r.pendingBalanceUsd * r.paymentRate : r.pendingBalanceArs,
          amountImputedUsd: r.pendingBalanceUsd,
          differenceExchangeArs: diffArs,
          adjustmentType: diffArs > 0.01 ? "Nota de dÃ©bito sugerida" : diffArs < -0.01 ? "Nota de crÃ©dito sugerida" : "Sin ajuste"
        };
      })
    );
  };

  const handleDeselectAllInvoices = () => {
    setImputations((prev) =>
      prev.map((r) => ({
        ...r,
        selected: false,
        amountImputedArs: 0,
        amountImputedUsd: 0,
        differenceExchangeArs: 0,
        adjustmentType: "Sin ajuste"
      }))
    );
  };

  // Handlers for Payment Lines
    const addLine = (method: PaymentLine["method"]) => {
    const matchingAcc = accounts.find((a) => a.isActive && (a.currency || "ARS") === currency) || accounts.find((a) => a.isActive);
    const suggestedAmount = Math.max(0, totalImputed - totalCobrado);
    const defaultConcept = concepts.find((c) => c.code === "COBRO_CLIENTE" || c.code === "COBRO_CLIENTES");
    const targetAccId = method === "BankTransfer" || method === "Cash" ? matchingAcc?.id : undefined;

    setLines((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        method,
        amount: suggestedAmount,
        currency,
        accountId: targetAccId,
        conceptId: defaultConcept?.id,
        notes: ""
      }
    ]);

    if (method === "BankTransfer") {
      void loadMovementsForAccount(targetAccId);
    }
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
      setError("Por favor seleccionÃ¡ un cliente.");
      return;
    }

    if (totalCobrado <= 0) {
      setError("El importe total de los medios de cobro debe ser mayor a cero.");
      return;
    }

    if (hasOverImputation) {
      setError(
        `El total imputado a comprobantes (${money(totalImputed, currency)}) no puede superar el total de cobro recibido (${money(totalCobrado, currency)}). AjustÃ¡ los importes imputados.`
      );
      return;
    }

    if (!description.trim()) {
      setError("Por favor indicÃ¡ una descripciÃ³n para el recibo.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const selectedImputations = imputations.filter((i) => i.selected && (currency === "USD" ? i.amountImputedUsd > 0 : i.amountImputedArs > 0));
      const firstUsdImp = selectedImputations.find((i) => i.isUsd);

      const payload = {
        customerId: selectedCustomer.id,
        accountId: lines.find((l) => l.accountId)?.accountId || accounts[0]?.id || undefined,
        currency,
        amount: totalCobrado,
        description: description.trim(),
        receiptDateUtc: new Date(`${receiptDate}T12:00:00Z`).toISOString(),
        invoiceId: firstUsdImp ? firstUsdImp.invoice.id : undefined,
        invoiceAmount: firstUsdImp ? firstUsdImp.amountImputedUsd : undefined,
        invoiceCurrency: firstUsdImp ? "USD" : undefined,
        invoiceExchangeRate: firstUsdImp ? firstUsdImp.invoiceRate : undefined,
        paymentExchangeRate: firstUsdImp ? firstUsdImp.paymentRate : undefined,
        suggestedAdjustmentArs: totalExchangeDifference !== 0 ? totalExchangeDifference : undefined,
        suggestedAdjustmentType: totalExchangeDifference > 0.01 ? "Nota de dÃ©bito sugerida" : totalExchangeDifference < -0.01 ? "Nota de crÃ©dito sugerida" : undefined,
        lines: lines.map((l) => ({
          method: l.method,
          amount: Number(l.amount) || 0,
          currency: l.currency || currency,
          accountId: l.accountId || null,
          movementId: l.movementId || null,
          chequeId: l.chequeId || null,
          conceptId: l.conceptId || null,
          retentionType: l.retentionType || null,
          retentionCertificate: l.retentionCertificate || null,
          notes: l.notes || null
        })),
        imputations: selectedImputations.map((i) => ({
          invoiceId: i.invoice.id,
          invoiceNumber: i.invoice.formattedNumber,
          invoiceTotal: i.invoice.total,
          amountImputed: currency === "USD" ? Number(i.amountImputedUsd) : Number(i.amountImputedArs)
        }))
      };

      const res = await api.createCollectionReceipt(payload);
      setSuccessMsg(`Â¡Recibo de Cobro ${res.receiptNumber} emitido exitosamente por ${money(totalCobrado, currency)}!`);
      
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
          <span className="eyebrow">FINANZAS Â· COBRANZAS</span>
          <h1>Recibos de Cobro a Clientes</h1>
          <p className="muted">
            Cobro en ARS o USD directo, cÃ¡lculo exacto de tipos de cambio, diferencias de cotizaciÃ³n y conciliaciÃ³n bancaria.
          </p>
        </div>
        <div className="toolbar">
          <Link to="/finanzas/cuentas-corrientes" className="btn btn-outline">
            ðŸ“Š Cuentas Corrientes
          </Link>
          <Link to="/finanzas/cuentas" className="btn btn-outline">
            ðŸ¦ Cuentas Financieras
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#f87171", marginBottom: 16 }}>
          âš ï¸ {error}
        </div>
      )}

      {successMsg && (
        <div className="alert" style={{ background: "#dcfce7", color: "#166534", borderColor: "#86efac", marginBottom: 16 }}>
          âœ“ {successMsg}
        </div>
      )}

      {/* Main Grid: Form Left, Balance Right */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 350px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          
          {/* STEP 1: CLIENTE Y DATOS GENERALES */}
          <section className="card pad">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: "1.2rem" }}>ðŸ‘¤</span>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>1. Cliente y Moneda de Cobro</h2>
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
                Moneda que Paga el Cliente *
                <select
                  value={currency}
                  onChange={(e) => {
                    const newCurr = e.target.value;
                    setCurrency(newCurr);
                    setLines((prev) => prev.map((l) => ({ ...l, currency: newCurr })));
                  }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)", fontWeight: 700 }}
                >
                  <option value="ARS">ARS ($ Pesos Argentinos - Modalidad TC)</option>
                  <option value="USD">USD (U$S DÃ³lares Estadounidenses Directos)</option>
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
                <span style={{ fontSize: "1.2rem" }}>ðŸ“„</span>
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
                SeleccionÃ¡ un cliente para visualizar sus comprobantes pendientes de cobro.
              </p>
            ) : imputations.length === 0 ? (
              <div style={{ background: "rgba(0,0,0,0.02)", padding: 16, borderRadius: 8, textAlign: "center" }}>
                <p className="muted" style={{ margin: 0 }}>
                  El cliente no posee comprobantes pendientes con saldo. PodÃ©s emitir el recibo como <strong>Anticipo / Saldo a Favor</strong>.
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40, textAlign: "center" }}>Aplicar</th>
                      <th>Comprobante</th>
                      <th>Fecha / Vto</th>
                      <th style={{ textAlign: "right" }}>Total Original</th>
                      <th style={{ textAlign: "right" }}>Saldo Pendiente</th>
                      {currency === "ARS" && <th style={{ textAlign: "center", width: 110 }}>TC Cobro</th>}
                      <th style={{ textAlign: "right", width: 160 }}>
                        {currency === "USD" ? "Monto a Imputar (USD)" : "Monto a Imputar (ARS)"}
                      </th>
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
                            {row.invoice.invoiceType} Â· Pto Vta {row.invoice.pointOfSale}
                          </small>
                        </td>
                        <td>
                          <div style={{ fontSize: "0.82rem" }}>
                            {new Date(row.invoice.issueDate).toLocaleDateString("es-AR")}
                            <small className="muted" style={{ display: "block", fontSize: "0.72rem" }}>
                              Vto: {new Date(row.invoice.dueDate).toLocaleDateString("es-AR")}
                            </small>
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <strong>{money(row.invoiceTotalOriginal, row.invoice.currency)}</strong>
                          {row.isUsd && (
                            <small className="muted" style={{ display: "block", fontSize: "0.72rem" }}>
                              TC EmisiÃ³n: ${row.invoiceRate.toLocaleString("es-AR")}
                            </small>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <strong style={{ color: "#0d9488" }}>
                            {row.isUsd ? money(row.pendingBalanceUsd, "USD") : money(row.pendingBalanceArs, "ARS")}
                          </strong>
                          {row.isUsd && currency === "ARS" && (
                            <small className="muted" style={{ display: "block", fontSize: "0.72rem" }}>
                              Equiv: {money(row.pendingBalanceUsd * row.paymentRate, "ARS")}
                            </small>
                          )}
                        </td>

                        {/* TC Cobro input for USD Invoices when paying in ARS */}
                        {currency === "ARS" && (
                          <td style={{ textAlign: "center" }}>
                            {row.isUsd ? (
                              <div>
                                <input
                                  type="number"
                                  min="1"
                                  step="0.01"
                                  value={row.paymentRate}
                                  onChange={(e) => handlePaymentRateChange(idx, Number(e.target.value) || 1)}
                                  style={{ width: 85, textAlign: "right", padding: "3px 6px", borderRadius: 4, border: "1px solid var(--surface-border)", fontWeight: 700 }}
                                />
                                {row.differenceExchangeArs !== 0 && (
                                  <small style={{ display: "block", fontSize: "0.7rem", color: row.differenceExchangeArs > 0 ? "#059669" : "#dc2626", fontWeight: 700 }}>
                                    {row.differenceExchangeArs > 0 ? `+${money(row.differenceExchangeArs)} (ND)` : `${money(row.differenceExchangeArs)} (NC)`}
                                  </small>
                                )}
                              </div>
                            ) : (
                              <span className="muted" style={{ fontSize: "0.8rem" }}>â€”</span>
                            )}
                          </td>
                        )}

                        {/* Amount Input */}
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                            <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>{currency === "USD" ? "U$S" : "$"}</span>
                            {currency === "USD" ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.amountImputedUsd}
                                onChange={(e) => handleImputedUsdChange(idx, Number(e.target.value) || 0)}
                                style={{
                                  width: 105,
                                  textAlign: "right",
                                  padding: "4px 8px",
                                  borderRadius: 4,
                                  border: "1px solid var(--surface-border)",
                                  fontWeight: 700
                                }}
                              />
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.amountImputedArs}
                                onChange={(e) => handleImputedArsChange(idx, Number(e.target.value) || 0)}
                                style={{
                                  width: 115,
                                  textAlign: "right",
                                  padding: "4px 8px",
                                  borderRadius: 4,
                                  border: "1px solid var(--surface-border)",
                                  fontWeight: 700
                                }}
                              />
                            )}
                          </div>
                          {row.isUsd && currency === "ARS" && (
                            <small className="muted" style={{ display: "block", fontSize: "0.72rem", textAlign: "right", marginTop: 2 }}>
                              Cancela: {money(row.amountImputedUsd, "USD")}
                            </small>
                          )}
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
                <span style={{ fontSize: "1.2rem" }}>ðŸ’³</span>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>3. Medios de Cobro (Ingreso de Fondos en {currency})</h2>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-outline compact" onClick={() => addLine("BankTransfer")}>
                  ï¼‹ Transferencia
                </button>
                <button type="button" className="btn btn-outline compact" onClick={() => addLine("Cash")}>
                  ï¼‹ Efectivo
                </button>
                <button type="button" className="btn btn-outline compact" onClick={() => addLine("Cheque")}>
                  ï¼‹ Cheque
                </button>
                <button type="button" className="btn btn-outline compact" onClick={() => addLine("Retention")}>
                  ï¼‹ RetenciÃ³n
                </button>
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="muted" style={{ textAlign: "center", padding: 14 }}>
                AgregÃ¡ al menos un medio de cobro (transferencia, efectivo, cheque o retenciÃ³n).
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {lines.map((line, idx) => (
                  <div
                    key={line.id}
                    style={{
                      background: "rgba(0,0,0,0.02)",
                      padding: 14,
                      borderRadius: 8,
                      border: "1px solid var(--surface-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                          #{idx + 1} {line.method === "BankTransfer" ? "ðŸ¦ Transferencia Bancaria" : line.method === "Cash" ? "ðŸ’µ Efectivo / Caja" : line.method === "Cheque" ? "ðŸŽ« Cheque Recibido" : "ðŸ“‹ RetenciÃ³n Sufrida"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn ghost compact"
                        style={{ color: "#dc2626", padding: "2px 8px" }}
                        onClick={() => removeLine(line.id)}
                      >
                        âœ• Quitar
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "end" }}>
                      {/* Bank or Cash Accounts */}
                      {(line.method === "BankTransfer" || line.method === "Cash") && (
                        <label>
                          Cuenta de Ingreso ({currency}) *
                          <select
                            value={line.accountId || ""}
                            onChange={(e) => updateLine(line.id, { accountId: e.target.value, movementId: undefined })}
                            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                          >
                            {accounts.filter((a) => a.isActive).map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.currency}) - Saldo: {money(a.balance, a.currency)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Concept Selection for Line */}
                      {(line.method === "BankTransfer" || line.method === "Cash") && (
                        <label>
                          Concepto de Cobro
                          <select
                            value={line.conceptId || ""}
                            onChange={(e) => updateLine(line.id, { conceptId: e.target.value || undefined })}
                            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                          >
                            <option value="">-- Cobro a cliente (Predeterminado) --</option>
                            {concepts.map((c) => (
                              <option key={c.id} value={c.id}>
                                ðŸ·ï¸ {c.name} ({c.code})
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Bank Movement link */}
                      {line.method === "BankTransfer" && (
                        <div style={{ gridColumn: "1 / -1", background: "#f8fafc", padding: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f766e" }}>
                              ðŸ¦ Vincular Transferencia Bancaria Acreditada (Extracto Banco)
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>Filtrar Concepto:</span>
                              <select
                                value={movementConceptFilter}
                                onChange={(e) => setMovementConceptFilter(e.target.value)}
                                style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: 4, border: "1px solid #cbd5e1" }}
                              >
                                <option value="all">Ver todas</option>
                                {concepts.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    ðŸ·ï¸ {c.name}
                                  </option>
                                ))}
                                <option value="unclassified">Sin clasificar</option>
                              </select>
                            </div>
                          </div>

                          <select
                            value={line.movementId || ""}
                            onChange={(e) => {
                              const movId = e.target.value;
                              const mov = availableMovements.find((m) => m.id === movId);
                              updateLine(line.id, {
                                movementId: movId || undefined,
                                accountId: mov ? mov.accountId : line.accountId,
                                amount: mov ? Number(mov.amount) : line.amount,
                                notes: mov ? mov.description : line.notes
                              });
                            }}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                          >
                            <option value="">-- Ingreso directo (sin vincular con extracto previo) --</option>
                            {filteredAvailableMovements.map((m) => (
                              <option key={m.id} value={m.id}>
                                {new Date(m.operationDateUtc).toLocaleDateString("es-AR")} Â· {money(m.amount, m.currency)} Â· [{m.conceptName || m.ConceptName || "Sin clasificar"}]{m.accountName ? ` · ${m.accountName}` : ""} Â· {m.description}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Cheques */}
                      {line.method === "Cheque" && (
                        <label style={{ gridColumn: "1 / -1" }}>
                          Cheque en Cartera *
                          <select
                            value={line.chequeId || ""}
                            onChange={(e) => {
                              const chId = e.target.value;
                              const ch = availableCheques.find((c) => c.id === chId);
                              updateLine(line.id, {
                                chequeId: chId || undefined,
                                amount: ch ? Number(ch.amount) : line.amount,
                                notes: ch ? `Cheque NÂ° ${ch.checkNumber} (${ch.bankName || "Banco"} - Librador: ${ch.issuerName || "s/d"})` : line.notes
                              });
                            }}
                            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                          >
                            <option value="">-- SeleccionÃ¡ un cheque disponible --</option>
                            {availableCheques.map((c) => (
                              <option key={c.id} value={c.id}>
                                NÂ° {c.checkNumber} Â· {money(c.amount, c.currency)} Â· {c.bankName || "Banco"} Â· Librador: {c.issuerName || "Sin datos"}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Retention fields */}
                      {line.method === "Retention" && (
                        <>
                          <label>
                            Tipo de RetenciÃ³n *
                            <select
                              value={line.retentionType || "IIBB"}
                              onChange={(e) => updateLine(line.id, { retentionType: e.target.value })}
                              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                            >
                              <option value="IIBB">Ingresos Brutos (IIBB)</option>
                              <option value="Ganancias">Impuesto a las Ganancias</option>
                              <option value="IVA">RetenciÃ³n de IVA</option>
                              <option value="SUSS">Seguridad Social (SUSS)</option>
                            </select>
                          </label>

                          <label>
                            NÂ° Certificado de RetenciÃ³n
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
                        Importe Cobrado ({currency}) *
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
            <h3 style={{ margin: "0 0 14px 0", fontSize: "1.05rem" }}>Balance de Cobro ({currency})</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="muted">Total Medios de Cobro:</span>
                <strong style={{ fontSize: "1.1rem", color: "#065f46" }}>{money(totalCobrado, currency)}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="muted">Total Imputado a Facturas:</span>
                <strong>{money(totalImputed, currency)}</strong>
              </div>

              {totalExchangeDifference !== 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0fdf4", padding: "6px 8px", borderRadius: 6 }}>
                  <span style={{ fontSize: "0.8rem", color: "#166534" }}>Diferencia de Cambio:</span>
                  <strong style={{ color: totalExchangeDifference > 0 ? "#059669" : "#dc2626", fontSize: "0.88rem" }}>
                    {totalExchangeDifference > 0 ? `+${money(totalExchangeDifference)} (ND)` : `${money(totalExchangeDifference)} (NC)`}
                  </strong>
                </div>
              )}

              <div style={{ borderTop: "1px dashed var(--surface-border)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="muted">Diferencia / Excedente:</span>
                <strong style={{ color: hasOverImputation ? "#dc2626" : difference > 0 ? "#0d9488" : "inherit" }}>
                  {money(difference, currency)}
                </strong>
              </div>
            </div>

            {hasOverImputation && (
              <div style={{ marginTop: 14, padding: 10, borderRadius: 6, background: "#fee2e2", color: "#991b1b", fontSize: "0.82rem", lineHeight: 1.4 }}>
                âš ï¸ <strong>Cobro insuficiente:</strong> EstÃ¡s imputando {money(totalImputed, currency)} a facturas, pero los medios de cobro suman solo {money(totalCobrado, currency)}. AjustÃ¡ los montos imputados a las facturas.
              </div>
            )}

            {!hasOverImputation && difference > 0.01 && (
              <div style={{ marginTop: 14, padding: 10, borderRadius: 6, background: "#e0f2fe", color: "#0369a1", fontSize: "0.82rem", lineHeight: 1.4 }}>
                â„¹ï¸ <strong>Anticipo:</strong> El cobro supera las facturas imputadas en {money(difference, currency)}. Este monto quedarÃ¡ como saldo a favor del cliente en su cuenta corriente.
              </div>
            )}

            {!hasOverImputation && Math.abs(difference) <= 0.01 && totalCobrado > 0 && (
              <div style={{ marginTop: 14, padding: 10, borderRadius: 6, background: "#dcfce7", color: "#166534", fontSize: "0.82rem" }}>
                âœ“ Cobro e imputaciones equilibrados al 100%.
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || loading || totalCobrado <= 0 || hasOverImputation || !selectedCustomerId}
              onClick={() => void handleSave()}
              style={{ width: "100%", justifyContent: "center", marginTop: 18, padding: "12px 16px", fontWeight: 700 }}
            >
              {saving ? "Emitiendo Recibo..." : "ðŸ§¾ Confirmar Recibo de Cobro"}
            </button>
          </div>
        </aside>
      </div>

      {/* RECENT RECEIPTS TABLE */}
      <section className="card pad" style={{ marginTop: 30 }}>
        <h2 style={{ margin: "0 0 14px 0", fontSize: "1.1rem" }}>Ãšltimos Recibos de Cobro Emitidos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NÂ° Recibo</th>
                <th>Fecha</th>
                <th>Cliente / Detalle</th>
                <th>Comprobantes Imputados</th>
                <th>Moneda / TC</th>
                <th style={{ textAlign: "right" }}>Importe Total</th>
                <th style={{ textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No hay recibos registrados aÃºn.
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
                      <td>
                        <span style={{ fontWeight: 600 }}>{r.currency}</span>
                        {r.paymentExchangeRate && r.paymentExchangeRate > 1 && (
                          <small className="muted" style={{ display: "block", fontSize: "0.72rem" }}>
                            TC: ${r.paymentExchangeRate.toLocaleString("es-AR")}
                          </small>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#065f46" }}>
                        {money(r.amount, r.currency)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="btn btn-outline compact"
                          onClick={() => void openReceiptDetail(r.id)}
                        >
                          ðŸ‘ï¸ Ver Detalle
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
                  Fecha: {new Date(selectedReceiptDetail.receiptDateUtc).toLocaleDateString("es-AR")} Â· {selectedReceiptDetail.description}
                </span>
              </div>
              <button className="btn btn-outline compact" onClick={() => setSelectedReceiptDetail(null)}>
                âœ• Cerrar
              </button>
            </div>

            {/* Imputations */}
            <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>ðŸ“„ Comprobantes Imputados</h3>
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
            <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>ðŸ’³ Medios de Cobro</h3>
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


