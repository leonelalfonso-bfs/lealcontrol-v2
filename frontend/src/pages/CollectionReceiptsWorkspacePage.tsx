import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { CustomerSummary, Invoice } from "../api/types";
type Account = { id: string; name: string; currency: string };
type Movement = {
    id: string;
    operationDateUtc: string;
    amount: number;
    currency: string;
    description: string;
    kind: string;
    reconciliationStatus: number;
};
type Cheque = {
    id: string;
    checkNumber: string;
    amount: number;
    currency: string;
    issuerName?: string;
    bankName?: string;
    dueDateUtc?: string;
    status: string;
    direction: string;
    collectionReceiptId?: string;
};
type Receipt = {
    id: string;
    receiptNumber: string;
    amount: number;
    currency: string;
    receiptDateUtc: string;
    description: string;
};
type PaymentLine = { id: string; method: "Transferencia" | "Cheque" | "Retención" | "Efectivo"; amount: number; currency: string; movementId?: string; chequeId?: string; retentionType?: string; retentionCertificate?: string; detail: string };
const money = (n: number, c = "ARS") =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(
        n,
    );
export function CollectionReceiptsWorkspacePage() {
    const [accounts, setAccounts] = useState<Account[]>([]),
        [customers, setCustomers] = useState<CustomerSummary[]>([]),
        [invoices, setInvoices] = useState<Invoice[]>([]),
        [movements, setMovements] = useState<Movement[]>([]),
        [cheques, setCheques] = useState<Cheque[]>([]),
        [receipts, setReceipts] = useState<Receipt[]>([]),
        [method, setMethod] = useState<"transfer" | "cheque" | "manual">(
            "transfer",
        ),
        [error, setError] = useState<string | null>(null),
        [busy, setBusy] = useState(false),
        [paymentRate, setPaymentRate] = useState(0);
    const [lines, setLines] = useState<PaymentLine[]>([]);
    const [form, setForm] = useState({
        accountId: "",
        customerId: "",
        invoiceId: "",
        movementId: "",
        chequeId: "",
        amount: "",
        invoiceAmount: "",
        currency: "ARS",
        receiptDateUtc: new Date().toISOString().slice(0, 10),
        description: "",
    });
    const loadMovements = async (id: string) => {
        if (!id) return;
        setMovements(
            (await api.listFinanceMovements(id)).filter(
                (m: Movement) =>
                    m.kind === "Credit" && m.reconciliationStatus !== 2,
            ),
        );
    };
    const load = async () => {
        try {
            const [a, c, i, r, ch] = await Promise.all([
                api.listFinanceAccounts(),
                api.listCustomers(""),
                api.listInvoices("", ""),
                api.listCollectionReceipts(),
                api.listReceivedCheques(),
            ]);
            setAccounts(a);
            setCustomers(c.items);
            setInvoices(i);
            setReceipts(r);
            setCheques(
                ch.filter(
                    (x: Cheque) =>
                        x.direction === "Received" &&
                        x.status === "Available" &&
                        !x.collectionReceiptId,
                ),
            );
            const account =
                a.find((x: Account) => x.id === form.accountId) || a[0];
            if (account) {
                setForm((x) => ({
                    ...x,
                    accountId: account.id,
                    currency: account.currency,
                }));
                await loadMovements(account.id);
            }
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "No se pudieron cargar los datos del recibo.",
            );
        }
    };
    useEffect(() => {
        void load();
    }, []);
    useEffect(() => {
        const item = invoices.find((x) => x.id === form.invoiceId);
        if (
            !item ||
            item.currency === form.currency ||
            form.invoiceAmount === String(item.total)
        )
            return;
        const setForeign = (rate: number) => {
            setPaymentRate(rate);
            setForm((x) => ({
                ...x,
                invoiceAmount: String(item.total),
                amount: String(item.total * rate),
            }));
        };
        if (item.currency === "USD" && form.currency === "ARS")
            void api
                .getExchangeRates()
                .then((r) => setForeign(r.usdBilleteSell))
                .catch(() => setForeign(item.exchangeRate));
        else setForeign(item.exchangeRate);
    }, [form.invoiceId, form.currency, form.invoiceAmount, invoices]);
    const customerInvoices = useMemo(
        () => invoices.filter((x) => x.customerId === form.customerId),
        [invoices, form.customerId],
    );
    const invoice = invoices.find((x) => x.id === form.invoiceId);
    const selectedMovement = movements.find((x) => x.id === form.movementId);
    const selectedCheque = cheques.find((x) => x.id === form.chequeId);
    const applied = Number(form.amount) || 0;
    const invoiceApplied = invoice && invoice.currency !== form.currency ? Number(form.invoiceAmount) || 0 : applied;
    const difference = invoice ? invoice.total - invoiceApplied : 0;
    const isForeignInvoice = !!invoice && invoice.currency !== form.currency;
    const suggestedAdjustment = isForeignInvoice ? invoice!.total * (paymentRate - invoice!.exchangeRate) : 0;
    const linesTotal = lines.reduce((total, line) => total + line.amount, 0);
    const addCurrentLine = () => { if (!applied) return setError("Indicá un importe para agregar la línea."); const line: PaymentLine = { id: crypto.randomUUID(), method: method === "transfer" ? "Transferencia" : method === "cheque" ? "Cheque" : "Efectivo", amount: applied, currency: form.currency, movementId: form.movementId || undefined, chequeId: form.chequeId || undefined, detail: form.description || "Cobro" }; if ((line.method === "Transferencia" && !line.movementId) || (line.method === "Cheque" && !line.chequeId)) return setError("Seleccioná el movimiento o cheque antes de agregarlo."); setLines(x => [...x, line]); setForm(x => ({ ...x, movementId: "", chequeId: "", amount: "", description: "" })); };
    const addRetention = () => setLines(x => [...x, { id: crypto.randomUUID(), method: "Retención", amount: 0, currency: form.currency, retentionType: "Retención", retentionCertificate: "", detail: "Retención sufrida" }]);
    const updateLine = (id: string, patch: Partial<PaymentLine>) => setLines(x => x.map(line => line.id === id ? { ...line, ...patch } : line));
    const removeLine = (id: string) => setLines(x => x.filter(line => line.id !== id));
    const selectInvoice = (id: string) => {
        const item = invoices.find((x) => x.id === id);
        setForm((x) => ({
            ...x,
            invoiceId: id,
            amount: item ? String(item.total) : x.amount,
        }));
    };
    const chooseTransfer = (id: string) => {
        const item = movements.find((x) => x.id === id);
        setForm((x) => ({
            ...x,
            movementId: id,
            chequeId: "",
            amount: item ? String(item.amount) : x.amount,
            description: item
                ? `Transferencia recibida · ${item.description}`
                : x.description,
        }));
    };
    const chooseCheque = (id: string) => {
        const item = cheques.find((x) => x.id === id);
        setForm((x) => ({
            ...x,
            chequeId: id,
            movementId: "",
            amount: item ? String(item.amount) : x.amount,
            description: item
                ? `eCheq ${item.checkNumber} · ${item.bankName || "Banco"}`
                : x.description,
        }));
    };
    const save = async () => {
        if (
            !form.accountId ||
            !form.customerId ||
            !form.invoiceId ||
            !applied ||
            !form.description
        ) {
            setError(
                "Completá cliente, comprobante, medio de cobro, importe y descripción.",
            );
            return;
        }
        setBusy(true);
        try {
            await api.createCollectionReceipt({
                accountId: form.accountId,
                customerId: form.customerId,
                invoiceId: form.invoiceId,
                movementId:
                    method === "transfer"
                        ? form.movementId || undefined
                        : undefined,
                chequeId:
                    method === "cheque"
                        ? form.chequeId || undefined
                        : undefined,
                amount: applied,
                currency: form.currency,
                invoiceAmount: isForeignInvoice ? invoiceApplied : undefined,
                invoiceCurrency: invoice?.currency,
                invoiceExchangeRate: isForeignInvoice ? invoice?.exchangeRate : undefined,
                paymentExchangeRate: isForeignInvoice ? paymentRate : undefined,
                suggestedAdjustmentArs: isForeignInvoice ? suggestedAdjustment : undefined,
                suggestedAdjustmentType: suggestedAdjustment > 0 ? "Nota de débito sugerida" : suggestedAdjustment < 0 ? "Nota de crédito sugerida" : undefined,
                receiptDateUtc: new Date(
                    `${form.receiptDateUtc}T00:00:00Z`,
                ).toISOString(),
                description: form.description,
            });
            setForm((x) => ({
                ...x,
                invoiceId: "",
                movementId: "",
                chequeId: "",
                amount: "",
                description: "",
            }));
            await load();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "No se pudo confirmar el recibo.",
            );
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="page-wide">
            <div className="page-head">
                <div>
                    <span className="eyebrow">FINANZAS · COBRANZAS</span>
                    <h1>Registrar recibo de cobro</h1>
                    <p className="muted">
                        Un circuito único: cliente → comprobante pendiente →
                        medio de cobro → conciliación.
                    </p>
                </div>
                <button className="btn btn-outline" onClick={() => void load()}>
                    ↻ Actualizar datos
                </button>
            </div>
            {error && <div className="alert">{error}</div>}
            <div className="grid-3" style={{ alignItems: "start" }}>
                <section className="card pad" style={{ gridColumn: "span 2" }}>
                    <div className="section-kicker">1 · ORIGEN DEL COBRO</div>
                    <div className="grid-3">
                        <label>
                            Fecha
                            <input
                                type="date"
                                value={form.receiptDateUtc}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        receiptDateUtc: e.target.value,
                                    })
                                }
                            />
                        </label>
                        <label style={{ gridColumn: "span 2" }}>
                            Cliente real
                            <select
                                value={form.customerId}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        customerId: e.target.value,
                                        invoiceId: "",
                                    })
                                }
                            >
                                <option value="">Seleccionar cliente</option>
                                {customers
                                    .filter((c) => c.isCustomer)
                                    .map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.tradeName || c.legalName} ·{" "}
                                            {c.documentNumber}
                                        </option>
                                    ))}
                            </select>
                        </label>
                    </div>
                    {form.customerId && (
                        <div
                            className="surface-tint-info"
                            style={{
                                padding: 14,
                                borderRadius: 12,
                                marginTop: 14,
                            }}
                        >
                            <strong>Comprobantes pendientes</strong>
                            <div
                                className="table-wrap"
                                style={{ marginTop: 10 }}
                            >
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Comprobante</th>
                                            <th>Cliente</th>
                                            <th>Total</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customerInvoices.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    className="muted"
                                                >
                                                    No hay facturas pendientes
                                                    para este cliente.
                                                </td>
                                            </tr>
                                        ) : (
                                            customerInvoices.map((i) => (
                                                <tr key={i.id}>
                                                    <td>{i.formattedNumber}</td>
                                                    <td>{i.customerName}</td>
                                                    <td>
                                                        {money(
                                                            i.total,
                                                            i.currency,
                                                        )}
                                                    </td>
                                                    <td>
                                                        <button
                                                            className={
                                                                form.invoiceId ===
                                                                i.id
                                                                    ? "btn btn-sm"
                                                                    : "btn btn-outline btn-sm"
                                                            }
                                                            onClick={() =>
                                                                selectInvoice(
                                                                    i.id,
                                                                )
                                                            }
                                                        >
                                                            {form.invoiceId ===
                                                            i.id
                                                                ? "Seleccionada"
                                                                : "Imputar"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>
                <aside className="card pad">
                    <div className="section-kicker">RESUMEN</div>
                    <h3 style={{ marginTop: 4 }}>Cierre del recibo</h3>
                    <p className="muted">Factura</p>
                    <strong>
                        {invoice ? money(invoice.total, invoice.currency) : "—"}
                    </strong>
                    <p className="muted" style={{ marginTop: 14 }}>Cobrado en {form.currency}</p>
                    <strong>{money(applied, form.currency)}</strong>
                    {isForeignInvoice && <><p className="muted" style={{ marginTop: 14 }}>Imputado a factura en {invoice!.currency}</p><strong>{money(invoiceApplied, invoice!.currency)}</strong><p className="muted" style={{ marginTop: 14 }}>Cotización factura / cobro</p><strong>{money(invoice!.exchangeRate, "ARS")} / {money(paymentRate, "ARS")}</strong>{suggestedAdjustment !== 0 && <div className="surface-tint-info" style={{ padding: 10, borderRadius: 10, marginTop: 14 }}><strong>{suggestedAdjustment > 0 ? "Sugerir Nota de Débito" : "Sugerir Nota de Crédito"}</strong><br /><span className="muted">Variación cambiaria: {money(Math.abs(suggestedAdjustment), "ARS")}. Es opcional; este recibo no genera el comprobante.</span></div>}</>}
                    <p className="muted" style={{ marginTop: 14 }}>
                        Saldo luego del recibo
                    </p>
                    <strong
                        style={{
                            color: difference > 0 ? "#c9872f" : "#4f9d72",
                        }}
                    >
                        {invoice ? money(difference, invoice.currency) : "—"}
                    </strong>
                </aside>
            </div>
            <section className="card pad" style={{ marginTop: 20 }}>
                <div className="section-kicker">2 · FORMA DE COBRO</div>
                <div className="toolbar" style={{ margin: "10px 0 18px" }}>
                    {(
                        [
                            ["transfer", "⇄ Transferencia bancaria"],
                            ["cheque", "✓ Cheque / eCheq"],
                            ["manual", "＋ Efectivo u otro"],
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            className={
                                method === key ? "btn" : "btn btn-outline"
                            }
                            onClick={() => {
                                setMethod(key);
                                setForm((x) => ({
                                    ...x,
                                    movementId: "",
                                    chequeId: "",
                                }));
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="grid-3">
                    {method === "transfer" && (
                        <>
                            <label>
                                Cuenta bancaria
                                <select
                                    value={form.accountId}
                                    onChange={(e) => {
                                        const a = accounts.find(
                                            (x) => x.id === e.target.value,
                                        );
                                        setForm((x) => ({
                                            ...x,
                                            accountId: e.target.value,
                                            currency: a?.currency || x.currency,
                                            movementId: "",
                                        }));
                                        void loadMovements(e.target.value);
                                    }}
                                >
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.name} · {a.currency}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label style={{ gridColumn: "span 2" }}>
                                Transferencia recibida
                                <select
                                    value={form.movementId}
                                    onChange={(e) =>
                                        chooseTransfer(e.target.value)
                                    }
                                >
                                    <option value="">
                                        Seleccionar de cartera bancaria
                                    </option>
                                    {movements.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {new Date(
                                                m.operationDateUtc,
                                            ).toLocaleDateString("es-AR")}{" "}
                                            · {money(m.amount, m.currency)} ·{" "}
                                            {m.description.slice(0, 70)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </>
                    )}
                    {method === "cheque" && (
                        <>
                            <label style={{ gridColumn: "span 2" }}>
                                Cheque / eCheq recibido disponible
                                <select
                                    value={form.chequeId}
                                    onChange={(e) =>
                                        chooseCheque(e.target.value)
                                    }
                                >
                                    <option value="">
                                        Seleccionar de cartera de cheques
                                    </option>
                                    {cheques.map((ch) => (
                                        <option key={ch.id} value={ch.id}>
                                            {ch.checkNumber} ·{" "}
                                            {money(ch.amount, ch.currency)} ·{" "}
                                            {ch.issuerName || "Sin librador"} ·
                                            vence{" "}
                                            {ch.dueDateUtc
                                                ? new Date(
                                                      ch.dueDateUtc,
                                                  ).toLocaleDateString("es-AR")
                                                : "s/f"}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {selectedCheque && (
                                <div
                                    className="surface-tint-success"
                                    style={{ padding: 12, borderRadius: 10 }}
                                >
                                    <strong>
                                        {selectedCheque.bankName ||
                                            "Banco sin identificar"}
                                    </strong>
                                    <br />
                                    <span className="muted">
                                        Cheque {selectedCheque.checkNumber}
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                    {method === "manual" && (
                        <label>
                            Cuenta de ingreso
                            <select
                                value={form.accountId}
                                onChange={(e) => {
                                    const a = accounts.find(
                                        (x) => x.id === e.target.value,
                                    );
                                    setForm((x) => ({
                                        ...x,
                                        accountId: e.target.value,
                                        currency: a?.currency || x.currency,
                                    }));
                                }}
                            >
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name} · {a.currency}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {isForeignInvoice && <><label>Importe imputado ({invoice!.currency})<input type="number" min="0" value={form.invoiceAmount} onChange={(e) => setForm({ ...form, invoiceAmount: e.target.value })} /></label><label>Cotización al cobro (ARS por {invoice!.currency})<input type="number" min="0" step="0.01" value={paymentRate || ""} onChange={(e) => { const rate = Number(e.target.value) || 0; setPaymentRate(rate); setForm({ ...form, amount: String((Number(form.invoiceAmount) || invoice!.total) * rate) }); }} /></label></>}
                    <label>
                        Importe cobrado ({form.currency})
                        <input
                            type="number"
                            min="0"
                            value={form.amount}
                            onChange={(e) =>
                                setForm({ ...form, amount: e.target.value })
                            }
                        />
                    </label>
                    <label>
                        Descripción
                        <input
                            value={form.description}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    description: e.target.value,
                                })
                            }
                            placeholder="Detalle del cobro"
                        />
                    </label>
                </div>
                <div className="toolbar" style={{ marginTop: 14 }}><button type="button" className="btn btn-outline" onClick={addCurrentLine}>＋ Agregar esta línea</button><button type="button" className="btn btn-outline" onClick={addRetention}>＋ Agregar retención</button><strong>Composición: {money(linesTotal, form.currency)}</strong></div>
                {lines.length > 0 && <div className="table-wrap" style={{ marginTop: 14 }}><table><thead><tr><th>Medio</th><th>Detalle</th><th>Importe</th><th></th></tr></thead><tbody>{lines.map(line => <tr key={line.id}><td>{line.method}</td><td>{line.method === "Retención" ? <><input value={line.retentionType || ""} onChange={e => updateLine(line.id, { retentionType: e.target.value })} placeholder="Tipo" /><input value={line.retentionCertificate || ""} onChange={e => updateLine(line.id, { retentionCertificate: e.target.value })} placeholder="Certificado" /></> : line.detail}</td><td><input type="number" min="0" value={line.amount} onChange={e => updateLine(line.id, { amount: Number(e.target.value) || 0 })} /> {line.currency}</td><td><button type="button" className="btn btn-outline btn-sm" onClick={() => removeLine(line.id)}>Quitar</button></td></tr>)}</tbody></table></div>}
                {selectedMovement && (
                    <p className="muted" style={{ marginTop: 12 }}>
                        Se conciliará con la transferencia seleccionada al
                        confirmar.
                    </p>
                )}
            </section>
            <div
                className="toolbar"
                style={{ justifyContent: "space-between", marginTop: 20 }}
            >
                <span className="muted">
                    El movimiento sólo se vincula al confirmar el recibo.
                </span>
                <button
                    className="btn"
                    disabled={busy}
                    onClick={() => void save()}
                >
                    {busy ? "Procesando…" : "Confirmar recibo"}
                </button>
            </div>
            <section className="card pad" style={{ marginTop: 24 }}>
                <h2>Últimos recibos</h2>
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Número</th>
                                <th>Fecha</th>
                                <th>Detalle</th>
                                <th>Importe</th>
                            </tr>
                        </thead>
                        <tbody>
                            {receipts.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="muted">
                                        Todavía no hay recibos registrados.
                                    </td>
                                </tr>
                            ) : (
                                receipts.map((r) => (
                                    <tr key={r.id}>
                                        <td>{r.receiptNumber}</td>
                                        <td>
                                            {new Date(
                                                r.receiptDateUtc,
                                            ).toLocaleDateString("es-AR")}
                                        </td>
                                        <td>{r.description}</td>
                                        <td>{money(r.amount, r.currency)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
