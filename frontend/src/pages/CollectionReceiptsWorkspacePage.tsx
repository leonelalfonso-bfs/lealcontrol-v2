import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { CustomerSummary, Invoice } from "../api/types";
import { QuickCreateChequeModal } from "../components/QuickCreateChequeModal";
import { CustomerPicker } from "../components/pickers";
import { withCollections, type ReceiptForImputation } from "../lib/receivables";
import { documentLabel } from "../lib/documents";
import "./collections.css";
import { todayAr } from "../lib/dates";

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

type BnaQuote = { date: string; buy: number; sell: number } | null;
type BnaPair = { previous: BnaQuote; current: BnaQuote };
type RateType = "Divisa" | "Billete";

/** Una factura con saldo, tal como se puede cancelar en este cobro. */
type OpenInvoice = {
  invoice: Invoice;
  isUsd: boolean;
  invoiceRate: number;
  pendingUsd: number;
  pendingArs: number;
};

const METHODS: Record<PaymentLine["method"], { label: string; icon: string }> = {
  BankTransfer: { label: "Transferencia", icon: "🏦" },
  Cash: { label: "Efectivo", icon: "💵" },
  Cheque: { label: "Cheque", icon: "🎫" },
  Retention: { label: "Retención", icon: "📋" }
};

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n || 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const shortDate = (iso?: string | null) => {
  const [y, m, d] = (iso ?? "").slice(0, 10).split("-");
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : "—";
};
const newId = () => Math.random().toString(36).substring(2, 9);

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
  const [createChequeLineId, setCreateChequeLineId] = useState<string | null>(null);
  const [movementConceptFilter, setMovementConceptFilter] = useState<string>("");
  const [movementAccountFilter, setMovementAccountFilter] = useState<string>("");
  const [loadingMovements, setLoadingMovements] = useState(false);

  const [receiptDate, setReceiptDate] = useState<string>(todayAr());
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [description, setDescription] = useState<string>("");
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});

  // Aplicación a facturas: automática (a lo más viejo) hasta que el usuario toca algo.
  const [autoApply, setAutoApply] = useState(true);
  const [manualApplied, setManualApplied] = useState<Record<string, number>>({});
  // Cotización de cobro por factura en USD (pactada: BNA del día hábil anterior).
  const [bnaRates, setBnaRates] = useState<Partial<Record<RateType, BnaPair>>>({});
  const [rateOverride, setRateOverride] = useState<Record<string, number>>({});
  const [rateTypeOverride, setRateTypeOverride] = useState<Record<string, RateType>>({});
  const [rateEditor, setRateEditor] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const defaultConceptId = useMemo(() => {
    const c = concepts.find((x: any) => x.code === "COBRO_CLIENTE" || x.code === "COBRO_CLIENTES")
      || concepts.find((x: any) => x.direction === "Income");
    return c?.id as string | undefined;
  }, [concepts]);

  const loadAvailableMovements = async (accountId?: string, conceptId?: string) => {
    setLoadingMovements(true);
    try {
      const movs = await api.listCollectionAvailableMovements(accountId?.trim() || undefined, conceptId?.trim() || undefined);
      setAvailableMovements(Array.isArray(movs) ? movs : []);
    } catch {
      setAvailableMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [custRes, accRes, chqRes, invRes, recRes, concRes] = await Promise.all([
        api.listAllCustomers(""),
        api.listFinanceAccounts().catch(() => [] as Account[]),
        api.listReceivedCheques().catch(() => [] as any[]),
        api.listInvoices("", "", "").catch(() => [] as Invoice[]),
        api.listCollectionReceipts().catch(() => [] as any[]),
        api.listFinanceConcepts().catch(() => [] as any[])
      ]);
      setCustomers(custRes || []);
      setAccounts(accRes || []);
      setInvoices(invRes || []);
      setReceipts(recRes || []);
      const activeConcepts = (concRes || []).filter((c: any) => c.isActive);
      setConcepts(activeConcepts);
      const cobro = activeConcepts.find((c: any) => c.code === "COBRO_CLIENTE")
        || activeConcepts.find((c: any) => c.direction === "Income");
      if (cobro?.id) setMovementConceptFilter(cobro.id);
      setAvailableCheques((chqRes || []).filter(
        (c: any) => (c.status === 0 || c.status === "Available" || c.status === "En cartera") && !c.collectionReceiptId));

      // Viniendo de un movimiento del banco, el cobro arranca con esa transferencia vinculada.
      if (initialMovementId) {
        setLines([{
          id: newId(), method: "BankTransfer", amount: initialAmount ? parseFloat(initialAmount) || 0 : 0,
          currency: "ARS", accountId: initialAccountId || undefined, movementId: initialMovementId,
          conceptId: cobro?.id, notes: ""
        }]);
        setOpenDetails({});
        if (initialAccountId) setMovementAccountFilter(initialAccountId);
        void loadAvailableMovements(initialAccountId || "", cobro?.id);
      } else {
        void loadAvailableMovements("", cobro?.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  // Al cambiar de cliente o de moneda la aplicación vuelve a ser automática.
  useEffect(() => {
    setAutoApply(true);
    setManualApplied({});
    setRateOverride({});
    setRateTypeOverride({});
    setRateEditor(null);
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (cust) setDescription(`Cobranza a ${cust.tradeName || cust.legalName}`);
  }, [selectedCustomerId, currency]);

  useEffect(() => {
    let cancelled = false;
    Promise.all((["Divisa", "Billete"] as const).map(async (type) => {
      const r = await api.getBnaRate(type === "Divisa" ? "divisa" : "billete", receiptDate).catch(() => null);
      return [type, { previous: r?.previous ?? null, current: r?.current ?? null }] as const;
    })).then((pairs) => {
      if (!cancelled) setBnaRates(Object.fromEntries(pairs) as Record<RateType, BnaPair>);
    });
    return () => { cancelled = true; };
  }, [receiptDate]);

  // Facturas con saldo del cliente, de la más vieja (vencimiento) a la más nueva.
  const openInvoices = useMemo<OpenInvoice[]>(() => {
    if (!selectedCustomerId) return [];
    const balances = withCollections(invoices, receipts as ReceiptForImputation[]);
    return balances
      .filter((inv) => inv.customerId === selectedCustomerId &&
        !["Cancelled", "Rejected"].includes(inv.status) && inv.invoiceType !== "Proforma" &&
        !inv.invoiceType.startsWith("NC") && inv.saldoPendiente > 0.01)
      .sort((a, b) => (a.dueDate || a.issueDate).localeCompare(b.dueDate || b.issueDate))
      .map((inv) => {
        const isUsd = inv.currency === "USD";
        return {
          invoice: inv,
          isUsd,
          invoiceRate: inv.exchangeRate && inv.exchangeRate > 0 ? inv.exchangeRate : 1,
          pendingUsd: isUsd ? inv.saldoPendiente : 0,
          pendingArs: isUsd ? 0 : inv.saldoPendiente
        };
      });
  }, [selectedCustomerId, invoices, receipts]);

  const rateTypeOf = (row: OpenInvoice): RateType =>
    rateTypeOverride[row.invoice.id] ?? (row.invoice.exchangeRateType === "Billete" ? "Billete" : "Divisa");
  const paymentRateOf = (row: OpenInvoice) =>
    rateOverride[row.invoice.id] ?? bnaRates[rateTypeOf(row)]?.previous?.sell ?? row.invoiceRate;
  // Cobrando en dólares solo se cancelan facturas en dólares (y viceversa en pesos, cualquiera).
  const canApply = (row: OpenInvoice) => currency === "ARS" || row.isUsd;
  const maxApply = (row: OpenInvoice) => !canApply(row) ? 0
    : currency === "USD" ? row.pendingUsd
    : row.isUsd ? round2(row.pendingUsd * paymentRateOf(row)) : row.pendingArs;

  const totalReceived = useMemo(() => round2(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)), [lines]);

  const applied = useMemo(() => {
    const result: Record<string, number> = {};
    if (!autoApply) {
      for (const row of openInvoices) result[row.invoice.id] = Math.min(manualApplied[row.invoice.id] ?? 0, maxApply(row));
      return result;
    }
    let remaining = totalReceived;
    for (const row of openInvoices) {
      const amount = round2(Math.max(0, Math.min(remaining, maxApply(row))));
      result[row.invoice.id] = amount;
      remaining = round2(remaining - amount);
    }
    return result;
  }, [autoApply, manualApplied, openInvoices, totalReceived, currency, bnaRates, rateOverride, rateTypeOverride]);

  const totalApplied = round2(Object.values(applied).reduce((s, n) => s + n, 0));
  const onAccount = round2(totalReceived - totalApplied);

  const differences = openInvoices
    .filter((row) => row.isUsd && currency === "ARS" && (applied[row.invoice.id] ?? 0) > 0)
    .map((row) => {
      const rate = paymentRateOf(row);
      const usd = round2((applied[row.invoice.id] ?? 0) / rate);
      return { row, usd, rate, diff: round2(usd * (rate - row.invoiceRate)) };
    });
  const totalDifference = round2(differences.reduce((s, d) => s + d.diff, 0));

  const setManual = (id: string, amount: number) => {
    setManualApplied(autoApply ? { ...applied, [id]: amount } : { ...manualApplied, [id]: amount });
    setAutoApply(false);
  };

  const incomeConcepts = useMemo(
    () => concepts.filter((c) => c.usableIn === "Receipt" && (c.direction === "Income" || c.direction === "Both")),
    [concepts]
  );
  const filteredAvailableMovements = useMemo(() => (movementAccountFilter
    ? availableMovements.filter((m) => String(m.accountId || "") === movementAccountFilter)
    : availableMovements), [availableMovements, movementAccountFilter]);

  const addLine = (method: PaymentLine["method"]) => {
    const account = accounts.find((a) => a.isActive && (a.currency || "ARS") === currency) || accounts.find((a) => a.isActive);
    // Si ya hay facturas marcadas, el importe sugerido es lo que falta cubrir.
    const suggested = autoApply ? 0 : Math.max(0, round2(totalApplied - totalReceived));
    const id = newId();
    setLines((prev) => [...prev, {
      id, method, amount: suggested, currency,
      accountId: method === "BankTransfer" || method === "Cash" ? account?.id : undefined,
      conceptId: defaultConceptId, retentionType: method === "Retention" ? "IIBB" : undefined, notes: ""
    }]);
    if (method === "Retention") setOpenDetails((d) => ({ ...d, [id]: true }));
  };
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));
  const updateLine = (id: string, patch: Partial<PaymentLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // Por qué no se puede confirmar todavía, en palabras.
  const blocker = !selectedCustomer ? "Elegí el cliente que pagó."
    : lines.length === 0 ? "Agregá cómo pagó: transferencia, efectivo, cheque o retención."
    : totalReceived <= 0 ? "Indicá el importe recibido."
    : totalApplied > totalReceived + 0.01 ? `Las facturas marcadas superan lo recibido en ${money(totalApplied - totalReceived, currency)}.`
    : lines.some((l) => l.method === "Cheque" && !l.chequeId) ? "Elegí el cheque recibido (o crealo)."
    : lines.some((l) => (l.method === "BankTransfer" || l.method === "Cash") && !l.accountId) ? "Elegí la cuenta donde ingresó el dinero."
    : null;

  const handleSave = async () => {
    if (blocker || !selectedCustomer) {
      setError(blocker);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const imputations = openInvoices
        .filter((row) => (applied[row.invoice.id] ?? 0) > 0)
        .map((row) => {
          const amount = applied[row.invoice.id];
          const base = {
            invoiceId: row.invoice.id,
            invoiceNumber: row.invoice.formattedNumber,
            invoiceTotal: row.invoice.total,
            amountImputed: amount
          };
          if (!(row.isUsd && currency === "ARS")) return base;
          const rate = paymentRateOf(row);
          return { ...base, amountUsd: round2(amount / rate), invoiceExchangeRate: row.invoiceRate, paymentExchangeRate: rate };
        });
      const firstUsd = imputations.find((i) => "amountUsd" in i) as (typeof imputations[number] & { amountUsd?: number; invoiceExchangeRate?: number; paymentExchangeRate?: number }) | undefined;
      const res = await api.createCollectionReceipt({
        customerId: selectedCustomer.id,
        accountId: lines.find((l) => l.accountId)?.accountId || accounts[0]?.id || undefined,
        currency,
        amount: totalReceived,
        description: description.trim() || `Cobranza a ${selectedCustomer.tradeName || selectedCustomer.legalName}`,
        receiptDateUtc: new Date(`${receiptDate}T12:00:00Z`).toISOString(),
        invoiceId: firstUsd?.invoiceId,
        invoiceAmount: firstUsd?.amountUsd,
        invoiceCurrency: firstUsd ? "USD" : undefined,
        invoiceExchangeRate: firstUsd?.invoiceExchangeRate,
        paymentExchangeRate: firstUsd?.paymentExchangeRate,
        lines: lines.map((l) => ({
          method: l.method,
          amount: Number(l.amount) || 0,
          currency,
          accountId: l.accountId || null,
          movementId: l.movementId || null,
          chequeId: l.chequeId || null,
          conceptId: l.conceptId || defaultConceptId || null,
          retentionType: l.retentionType || null,
          retentionCertificate: l.retentionCertificate || null,
          notes: l.notes || null
        })) as any,
        imputations
      });
      setSuccessMsg(`Recibo ${res.receiptNumber} registrado por ${money(totalReceived, currency)}.` +
        (Math.abs(totalDifference) >= 0.01
          ? ` La diferencia de cambio (${money(Math.abs(totalDifference))}) queda en la cuenta corriente para emitir su ${totalDifference > 0 ? "ND" : "NC"}.`
          : ""));
      setLines([]);
      setOpenDetails({});
      setAutoApply(true);
      setManualApplied({});
      setRateOverride({});
      await loadData();
    } catch (e: any) {
      setError(e.message || "Error al registrar el cobro.");
    } finally {
      setSaving(false);
    }
  };

  const openReceiptDetail = async (id: string) => {
    try {
      setSelectedReceiptDetail(await api.getCollectionReceipt(id));
    } catch (e: any) {
      alert("Error al cargar detalle del recibo: " + e.message);
    }
  };

  const markedTotal = round2(openInvoices.reduce((s, row) => s + (applied[row.invoice.id] ?? 0), 0));

  return (
    <div className="page-wide cobro" style={{ paddingBottom: 60 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · COBRANZAS</span>
          <h1>Registrar cobro</h1>
          <p className="muted">Quién pagó, cómo pagó y qué cancela. El sistema aplica el pago a lo más viejo; podés cambiarlo.</p>
        </div>
        <div className="toolbar">
          <Link to="/finanzas/cuentas-corrientes" className="btn btn-outline">Cuentas corrientes</Link>
        </div>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}
      {successMsg && <div className="alert cobro-ok" role="status">✓ {successMsg}</div>}

      <div className="cobro-grid">
        <div className="cobro-steps">
          {/* 1. Quién pagó */}
          <section className="card pad cobro-step">
            <h2><span className="cobro-num">1</span> ¿Quién pagó?</h2>
            <div className="cobro-row">
              <label className="cobro-grow">
                Cliente
                <CustomerPicker value={selectedCustomerId} onChange={(id) => setSelectedCustomerId(id)} options={customers} />
              </label>
              <label>
                Fecha
                <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
              </label>
              <div className="cobro-field">
                <span>Pagó en</span>
                <div className="cobro-segment" role="group" aria-label="Moneda del cobro">
                  {(["ARS", "USD"] as const).map((c) => (
                    <button key={c} type="button" className={currency === c ? "on" : ""}
                      onClick={() => {
                        setCurrency(c);
                        setLines((prev) => prev.map((l) => ({ ...l, currency: c })));
                      }}>
                      {c === "ARS" ? "Pesos" : "Dólares"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 2. Cómo pagó */}
          <section className="card pad cobro-step">
            <h2><span className="cobro-num">2</span> ¿Cómo pagó?</h2>
            {lines.map((line) => {
              const meta = METHODS[line.method];
              const detailsOpen = openDetails[line.id] ?? false;
              return (
                <div key={line.id} className="cobro-line">
                  <div className="cobro-line-main">
                    <strong className="cobro-line-kind">{meta.icon} {meta.label}</strong>
                    {(line.method === "BankTransfer" || line.method === "Cash") && (
                      <select aria-label="Cuenta de ingreso" value={line.accountId || ""}
                        onChange={(e) => updateLine(line.id, { accountId: e.target.value, movementId: undefined })}>
                        {accounts.filter((a) => a.isActive).map((a) => (
                          <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                        ))}
                      </select>
                    )}
                    {line.method === "Cheque" && (
                      <select aria-label="Cheque recibido" value={line.chequeId || ""}
                        onChange={(e) => {
                          const ch = availableCheques.find((c) => c.id === e.target.value);
                          updateLine(line.id, {
                            chequeId: e.target.value || undefined,
                            amount: ch ? Number(ch.amount) : line.amount,
                            notes: ch ? `Cheque N° ${ch.checkNumber} (${ch.bankName || "Banco"} - Librador: ${ch.issuerName || "s/d"})` : line.notes
                          });
                        }}>
                        <option value="">Elegí el cheque…</option>
                        {availableCheques.map((c) => (
                          <option key={c.id} value={c.id}>N° {c.checkNumber} · {money(c.amount, c.currency)} · {c.bankName || "Banco"}</option>
                        ))}
                      </select>
                    )}
                    {line.method === "Retention" && (
                      <select aria-label="Tipo de retención" value={line.retentionType || "IIBB"}
                        onChange={(e) => updateLine(line.id, { retentionType: e.target.value })}>
                        <option value="IIBB">Ingresos Brutos</option>
                        <option value="Ganancias">Ganancias</option>
                        <option value="IVA">IVA</option>
                        <option value="SUSS">SUSS</option>
                      </select>
                    )}
                    <div className="cobro-amount">
                      <span>{currency === "USD" ? "US$" : "$"}</span>
                      <input type="number" min="0" step="0.01" aria-label="Importe" value={line.amount || ""}
                        placeholder="0,00" onChange={(e) => updateLine(line.id, { amount: Number(e.target.value) || 0 })} />
                    </div>
                    <button type="button" className="btn ghost compact" aria-expanded={detailsOpen}
                      onClick={() => setOpenDetails((d) => ({ ...d, [line.id]: !detailsOpen }))}>
                      {detailsOpen ? "Ocultar" : "Detalles"}
                    </button>
                    <button type="button" className="btn ghost compact cobro-remove" aria-label="Quitar" onClick={() => removeLine(line.id)}>✕</button>
                  </div>

                  {detailsOpen && (
                    <div className="cobro-line-details">
                      {(line.method === "BankTransfer" || line.method === "Cash") && (
                        <label>
                          Cartera (concepto)
                          <select value={line.conceptId || defaultConceptId || ""} onChange={(e) => {
                            updateLine(line.id, { conceptId: e.target.value || undefined, movementId: undefined });
                            if (e.target.value) setMovementConceptFilter(e.target.value);
                          }}>
                            {incomeConcepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </label>
                      )}
                      {line.method === "BankTransfer" && (
                        <label className="cobro-grow">
                          Vincular con el movimiento del banco (opcional)
                          <select value={line.movementId || ""} onChange={(e) => {
                            const mov = filteredAvailableMovements.find((m) => m.id === e.target.value);
                            updateLine(line.id, {
                              movementId: e.target.value || undefined,
                              accountId: mov?.accountId || line.accountId,
                              amount: mov ? Number(mov.amount) : line.amount,
                              notes: mov ? mov.description : line.notes,
                              conceptId: mov?.conceptId || line.conceptId
                            });
                          }}>
                            <option value="">
                              {loadingMovements ? "Cargando movimientos…"
                                : filteredAvailableMovements.length === 0 ? "No hay acreditaciones pendientes de vincular"
                                : "Sin vincular"}
                            </option>
                            {filteredAvailableMovements.map((m) => (
                              <option key={m.id} value={m.id}>
                                {shortDate(m.operationDateUtc)} · {money(m.amount, m.currency)} · {m.accountName ? `${m.accountName} · ` : ""}{m.description}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {line.method === "Cheque" && (
                        <button type="button" className="btn btn-outline compact" onClick={() => setCreateChequeLineId(line.id)}>
                          + Cargar un cheque nuevo
                        </button>
                      )}
                      {line.method === "Retention" && (
                        <label>
                          N° de certificado
                          <input type="text" value={line.retentionCertificate || ""} placeholder="Ej: 2026-000123"
                            onChange={(e) => updateLine(line.id, { retentionCertificate: e.target.value })} />
                        </label>
                      )}
                      <label className="cobro-grow">
                        Nota
                        <input type="text" value={line.notes || ""} onChange={(e) => updateLine(line.id, { notes: e.target.value })} />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="cobro-add">
              {lines.length === 0 && <span className="muted">Agregá cómo te pagaron:</span>}
              {(Object.keys(METHODS) as PaymentLine["method"][]).map((m) => (
                <button key={m} type="button" className="btn btn-outline compact" onClick={() => addLine(m)}>
                  + {METHODS[m].label}
                </button>
              ))}
            </div>
          </section>

          {/* 3. Qué cancela */}
          <section className="card pad cobro-step">
            <div className="cobro-step-head">
              <h2><span className="cobro-num">3</span> ¿Qué cancela?</h2>
              {selectedCustomer && openInvoices.length > 0 && (
                autoApply
                  ? <span className="muted">Aplicado automáticamente a lo más viejo</span>
                  : <button type="button" className="btn ghost compact" onClick={() => { setAutoApply(true); setManualApplied({}); }}>
                      Volver a aplicar automáticamente
                    </button>
              )}
            </div>
            {!selectedCustomer ? (
              <p className="muted">Elegí el cliente para ver sus facturas pendientes.</p>
            ) : openInvoices.length === 0 ? (
              <p className="muted">{loading ? "Cargando…" : "Este cliente no tiene facturas pendientes. Lo que cobres queda a cuenta."}</p>
            ) : (
              <ul className="cobro-invoices">
                {openInvoices.map((row) => {
                  const id = row.invoice.id;
                  const amount = applied[id] ?? 0;
                  const max = maxApply(row);
                  const enabled = canApply(row);
                  const rateType = rateTypeOf(row);
                  const rate = paymentRateOf(row);
                  const pair = bnaRates[rateType];
                  const diff = differences.find((d) => d.row.invoice.id === id);
                  const overdue = row.invoice.dueDate && row.invoice.dueDate.slice(0, 10) < receiptDate;
                  return (
                    <li key={id} className={`cobro-invoice${amount > 0 ? " on" : ""}${enabled ? "" : " off"}`}>
                      <div className="cobro-invoice-main">
                        <input type="checkbox" aria-label={`Aplicar a ${row.invoice.formattedNumber}`} disabled={!enabled}
                          checked={amount > 0} onChange={(e) => setManual(id, e.target.checked ? max : 0)} />
                        <div className="cobro-invoice-doc">
                          <strong>{documentLabel(row.invoice.invoiceType)} {row.invoice.formattedNumber}</strong>
                          <span className="muted">
                            Emitida {shortDate(row.invoice.issueDate)} · {overdue ? <span className="cobro-overdue">vencida {shortDate(row.invoice.dueDate)}</span> : <>vence {shortDate(row.invoice.dueDate)}</>}
                          </span>
                        </div>
                        <div className="cobro-invoice-balance">
                          <span className="muted">Saldo</span>
                          <strong>{row.isUsd ? money(row.pendingUsd, "USD") : money(row.pendingArs)}</strong>
                        </div>
                        <div className="cobro-amount">
                          <span>{currency === "USD" ? "US$" : "$"}</span>
                          <input type="number" min="0" step="0.01" aria-label="Importe a aplicar" disabled={!enabled}
                            value={amount || ""} placeholder="0,00"
                            onChange={(e) => setManual(id, Math.min(max, Math.max(0, Number(e.target.value) || 0)))} />
                        </div>
                      </div>
                      {!enabled && (
                        <p className="cobro-note muted">Es una factura en pesos: para cancelarla registrá el cobro en pesos.</p>
                      )}
                      {row.isUsd && currency === "ARS" && (
                        <div className="cobro-note">
                          <span>
                            {amount > 0 ? `Cancela ${money(diff?.usd ?? 0, "USD")} · ` : ""}
                            TC {rateType.toLowerCase()} BNA{pair?.previous && rate === pair.previous.sell ? ` ${shortDate(pair.previous.date)} (pactado)` : ""}: <strong>$ {rate.toLocaleString("es-AR")}</strong>
                          </span>
                          <button type="button" className="btn ghost compact" onClick={() => setRateEditor(rateEditor === id ? null : id)}>
                            {rateEditor === id ? "Listo" : "Cambiar"}
                          </button>
                          {rateEditor === id && (
                            <div className="cobro-rate-editor">
                              <div className="cobro-segment" role="group" aria-label="Dólar pactado">
                                {(["Divisa", "Billete"] as const).map((t) => (
                                  <button key={t} type="button" className={rateType === t ? "on" : ""}
                                    onClick={() => {
                                      setRateTypeOverride((o) => ({ ...o, [id]: t }));
                                      setRateOverride(({ [id]: _drop, ...rest }) => rest);
                                    }}>
                                    {t}
                                  </button>
                                ))}
                              </div>
                              {[pair?.previous && { q: pair.previous, label: "Día anterior" }, pair?.current && { q: pair.current, label: "Hoy" }]
                                .filter(Boolean).map((opt) => {
                                  const { q, label } = opt as { q: NonNullable<BnaQuote>; label: string };
                                  return (
                                    <button key={label} type="button" className={`btn compact ${rate === q.sell ? "" : "btn-outline"}`}
                                      onClick={() => setRateOverride((o) => ({ ...o, [id]: q.sell }))}>
                                      {label} {shortDate(q.date)}: $ {q.sell.toLocaleString("es-AR")}
                                    </button>
                                  );
                                })}
                              <label className="cobro-inline">
                                Otro
                                <input type="number" min="1" step="0.01" value={rateOverride[id] ?? ""} placeholder={String(rate)}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setRateOverride((o) => ({ ...o, [id]: v > 0 ? v : rate }));
                                  }} />
                              </label>
                            </div>
                          )}
                          {diff && Math.abs(diff.diff) >= 0.01 && (
                            <p className={diff.diff > 0 ? "cobro-diff up" : "cobro-diff down"}>
                              {diff.diff > 0
                                ? `El dólar subió desde la factura (TC $ ${row.invoiceRate.toLocaleString("es-AR")}): corresponde una nota de débito por ${money(diff.diff)}.`
                                : `El dólar bajó desde la factura (TC $ ${row.invoiceRate.toLocaleString("es-AR")}): corresponde una nota de crédito por ${money(-diff.diff)}.`}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!autoApply && markedTotal > totalReceived + 0.01 && (
              <button type="button" className="btn btn-outline compact" style={{ marginTop: 10 }}
                onClick={() => {
                  const missing = round2(markedTotal - totalReceived);
                  if (lines.length === 0) {
                    const account = accounts.find((acc) => acc.isActive && (acc.currency || "ARS") === currency) || accounts.find((acc) => acc.isActive);
                    setLines([{ id: newId(), method: "BankTransfer", amount: missing, currency, accountId: account?.id, conceptId: defaultConceptId, notes: "" }]);
                  } else {
                    setLines((prev) => prev.map((l, i) => (i === prev.length - 1 ? { ...l, amount: round2((Number(l.amount) || 0) + missing) } : l)));
                  }
                }}>
                Usar {money(markedTotal, currency)} como importe recibido
              </button>
            )}
          </section>

          <label className="cobro-notes">
            Observaciones del recibo
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Cobranza a…" />
          </label>
        </div>

        <aside className="cobro-summary">
          <div className="card pad">
            <h3>Resumen</h3>
            <dl>
              <div><dt>Recibido</dt><dd>{money(totalReceived, currency)}</dd></div>
              <div><dt>Aplicado a facturas</dt><dd>{money(totalApplied, currency)}</dd></div>
              {onAccount > 0.01 && (
                <div className="cobro-info"><dt>Queda a cuenta</dt><dd>{money(onAccount, currency)}</dd></div>
              )}
              {Math.abs(totalDifference) >= 0.01 && (
                <div className="cobro-info">
                  <dt>Diferencia de cambio</dt>
                  <dd>{totalDifference > 0 ? "ND " : "NC "}{money(Math.abs(totalDifference))}</dd>
                </div>
              )}
            </dl>
            {onAccount > 0.01 && (
              <p className="muted cobro-hint">Lo que queda a cuenta se guarda como saldo a favor del cliente y se aplica en un próximo cobro.</p>
            )}
            {Math.abs(totalDifference) >= 0.01 && (
              <p className="muted cobro-hint">La nota por diferencia de cambio se emite desde la cuenta corriente del cliente.</p>
            )}
            <button type="button" className="btn cobro-confirm" disabled={Boolean(blocker) || saving} onClick={() => void handleSave()}>
              {saving ? "Registrando…" : "Confirmar cobro"}
            </button>
            {blocker && <p className="cobro-blocker">{blocker}</p>}
          </div>
        </aside>
      </div>

      {/* RECENT RECEIPTS TABLE */}
      <section className="card pad" style={{ marginTop: 30 }}>
        <h2 style={{ margin: "0 0 14px 0", fontSize: "1.1rem" }}>Últimos recibos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N° Recibo</th>
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
                      <td>{shortDate(r.receiptDateUtc)}</td>
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
              <strong>Total cobrado</strong>
              <strong style={{ fontSize: "1.2rem" }}>
                {money(selectedReceiptDetail.amount, selectedReceiptDetail.currency)}
              </strong>
            </div>
            {selectedReceiptDetail.status !== "Voided" && (
              <div className="toolbar" style={{ marginTop: 16, justifyContent: "flex-end" }}>
                <button
                  className="btn btn-outline"
                  style={{ color: "#dc2626", borderColor: "#dc2626" }}
                  onClick={async () => {
                    const reason = window.prompt("Motivo de anulación del recibo:");
                    if (!reason?.trim()) return;
                    try {
                      await api.voidCollectionReceipt(selectedReceiptDetail.id, reason.trim());
                      setSelectedReceiptDetail(null);
                      await loadData();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "No se pudo anular el recibo.");
                    }
                  }}
                >
                  Anular recibo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <QuickCreateChequeModal
        open={!!createChequeLineId}
        direction="Received"
        defaultAmount={
          createChequeLineId
            ? lines.find((l) => l.id === createChequeLineId)?.amount
            : undefined
        }
        defaultCurrency={currency}
        onClose={() => setCreateChequeLineId(null)}
        onCreated={(ch) => {
          setAvailableCheques((prev) =>
            prev.some((c) => c.id === ch.id) ? prev : [ch, ...prev]
          );
          if (createChequeLineId) {
            updateLine(createChequeLineId, {
              chequeId: ch.id,
              amount: Number(ch.amount),
              notes: `Cheque N° ${ch.checkNumber} (${ch.bankName || "Banco"} - Librador: ${ch.issuerName || "s/d"})`
            });
          }
          setCreateChequeLineId(null);
        }}
      />
    </div>
  );
}
