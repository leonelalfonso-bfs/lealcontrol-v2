import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { exportToExcel, type ExcelColumn } from "../components/ExcelTools";
import type { CustomerSummary, Invoice, PurchaseInvoice } from "../api/types";
import { SearchField } from "../components/ui/SearchField";
import { matchesSearch, parseSearch } from "../lib/search";
import { withCollections, type ReceiptForImputation } from "../lib/receivables";
import { documentLabel } from "../lib/documents";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { EmailComposer } from "../components/EmailComposer";
import type { CompanySettings } from "../api/types";
import "./collections.css";

import { todayAr } from "../lib/dates";
type TabMode = "customers" | "suppliers" | "dual";

/** NC = reduce deuda; ND = aumenta; factura normal = aumenta. */
function isCreditNoteType(invoiceType?: string | null) {
  return /^NC/i.test(String(invoiceType || ""));
}
function isDebitNoteType(invoiceType?: string | null) {
  return /^ND/i.test(String(invoiceType || ""));
}
/** Signo para saldos: factura/ND = +, NC = − */
function signedDocTotal(invoiceType: string | undefined | null, total: number) {
  return isCreditNoteType(invoiceType) ? -Math.abs(total || 0) : Math.abs(total || 0);
}

type Receipt = {
  id: string;
  customerId?: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  invoiceId?: string;
  invoiceAmount?: number;
  invoiceCurrency?: string;
  invoiceExchangeRate?: number;
  paymentExchangeRate?: number;
  suggestedAdjustmentArs?: number;
  suggestedAdjustmentType?: string;
  receiptDateUtc: string;
  createdAtUtc?: string;
  description?: string;
  invoicesSummary?: string;
  status?: string;
  voidReason?: string | null;
  voidedAtUtc?: string | null;
  imputations?: Array<{
    id: string;
    invoiceId: string;
    amount: number;
    amountUsd?: number | null;
    invoiceExchangeRate?: number | null;
    paymentExchangeRate?: number | null;
    exchangeDifferenceArs?: number | null;
  }>;
};

/** Resumen de cuenta corriente calculado por el servidor. */
type AccountSummary = {
  entityId: string;
  salesDocuments: number;
  billedSalesArs: number;
  billedSalesUsd: number;
  collectedSalesArs: number;
  collectedSalesUsd: number;
  receivableBalance: number;
  receivableBalanceUsd: number;
  pendingDifferencesArs: number;
  purchaseDocuments: number;
  billedPurchasesArs: number;
  billedPurchasesUsd: number;
  paidPurchasesArs: number;
  paidPurchasesUsd: number;
  payableBalance: number;
  payableBalanceUsd: number;
  netBalance: number;
};

/** Diferencia de cambio de un cobro todavía sin su ND/NC emitida. */
type PendingDifference = {
  imputationId: string;
  invoiceId: string;
  receiptNumber: string;
  date: string;
  amountUsd: number;
  invoiceRate: number;
  paymentRate: number;
  differenceArs: number;
};

type PaymentOrder = {
  id: string;
  supplierId?: string | null;
  orderNumber: string;
  amount: number;
  currency?: string;
  exchangeRate?: number;
  paymentDateUtc: string;
  notes?: string;
  status?: string;
  voidReason?: string | null;
  voidedAtUtc?: string | null;
};

type LedgerItem = {
  date: string;
  type: string;
  number: string;
  description: string;
  originalAmount?: string;
  debit: number;
  credit: number;
  balance: number;
  /** Lo que queda pendiente de ese comprobante (facturas de venta). */
  documentBalance?: string;
  source: "sale" | "purchase" | "collection" | "payment" | "adjustment" | "void";
  muted?: boolean;
  pending?: PendingDifference;
};

// Fechas guardadas a medianoche UTC: se muestra el día calendario, sin correrlo por zona horaria.
const civilDate = (value?: string | null) => {
  const [y, m, d] = (value ?? "").slice(0, 10).split("-");
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : "—";
};

const isActiveDoc = (status?: string | null) =>
  (status || "").toLowerCase() !== "voided";

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n || 0);

export function CurrentAccountsPage() {
  const [tab, setTab] = useState<TabMode>("customers");
  const [entities, setEntities] = useState<CustomerSummary[]>([]);
  const [query, setQuery] = useState("");
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected entity for Ledger (Mayor de Cuenta Corriente)
  // La cuenta abierta vive en la URL (?cuenta=id): Atrás vuelve al listado y el link se comparte.
  const [searchParams, setSearchParams] = useSearchParams();
  const ledgerEntity = entities.find((e) => e.id === searchParams.get("cuenta")) ?? null;
  const setLedgerEntity = (entity: CustomerSummary | null) =>
    setSearchParams(entity ? { cuenta: entity.id } : {});
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sendVia, setSendVia] = useState<"email" | "reminder" | null>(null);
  const [draftingReminder, setDraftingReminder] = useState(false);
  const [reminderDraft, setReminderDraft] = useState<{ to?: string; subject: string; body: string } | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  useEffect(() => {
    void api.getCompanySettings().then(setCompany).catch(() => setCompany(null));
  }, []);

  // Los saldos y movimientos los calcula el servidor (única fuente de verdad).
  const [summaries, setSummaries] = useState<Map<string, AccountSummary>>(new Map());
  const [ledger, setLedger] = useState<{ summary: AccountSummary; movements: LedgerItem[] } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, sums] = await Promise.all([
        api.listAllCustomers(""), // todo el directorio (clientes, proveedores y ambos), sin corte en 50
        api.listCurrentAccounts()
      ]);
      setEntities(cRes || []);
      setSummaries(new Map((sums || []).map((x) => [x.entityId, x])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la información financiera.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!ledgerEntity) {
      setLedger(null);
      setReminderDraft(null);
      setReminderError(null);
      return;
    }
    let cancelled = false;
    api.getCurrentAccount(ledgerEntity.id)
      .then((r) => !cancelled && setLedger(r as { summary: AccountSummary; movements: LedgerItem[] }))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "No se pudo cargar la cuenta."));
    return () => { cancelled = true; };
  }, [ledgerEntity?.id]);

  const openCollectionReminder = async (customerId: string) => {
    setDraftingReminder(true);
    setReminderError(null);
    try {
      const res = await api.generateCollectionReminderDraft(customerId);
      if (res.ok && res.body) {
        setReminderDraft({
          to: res.to ?? undefined,
          subject: res.subject || "Recordatorio de facturas vencidas",
          body: res.body
        });
        setSendVia("reminder");
      } else {
        setReminderError(res.error || "No se pudo armar el borrador de recordatorio.");
      }
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : "No se pudo armar el borrador de recordatorio.");
    } finally {
      setDraftingReminder(false);
    }
  };

  useEffect(() => {
    if (!ledgerEntity || !ledgerEntity.isCustomer) return;
    if (searchParams.get("recordatorio") !== "1") return;
    const next = new URLSearchParams(searchParams);
    next.delete("recordatorio");
    setSearchParams(next, { replace: true });
    void openCollectionReminder(ledgerEntity.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerEntity?.id, searchParams]);

  const accountRows = useMemo(() => entities.map((entity) => {
    const x = summaries.get(entity.id);
    return {
      entity,
      isCust: entity.isCustomer,
      isSupp: entity.isSupplier,
      isDual: entity.isCustomer && entity.isSupplier,
      custInvoicesCount: x?.salesDocuments ?? 0,
      billedSalesArs: x?.billedSalesArs ?? 0,
      billedSalesUsd: x?.billedSalesUsd ?? 0,
      collectedSalesArs: x?.collectedSalesArs ?? 0,
      collectedSalesUsd: x?.collectedSalesUsd ?? 0,
      receivableBalance: x?.receivableBalance ?? 0,
      receivableBalanceUsd: x?.receivableBalanceUsd ?? 0,
      pendingDifferencesArs: x?.pendingDifferencesArs ?? 0,
      suppInvoicesCount: x?.purchaseDocuments ?? 0,
      billedPurchasesArs: x?.billedPurchasesArs ?? 0,
      billedPurchasesUsd: x?.billedPurchasesUsd ?? 0,
      paidPurchasesArs: x?.paidPurchasesArs ?? 0,
      paidPurchasesUsd: x?.paidPurchasesUsd ?? 0,
      payableBalance: x?.payableBalance ?? 0,
      payableBalanceUsd: x?.payableBalanceUsd ?? 0,
      netBalance: x?.netBalance ?? 0
    };
  }), [entities, summaries]);

  // Filtered rows depending on active tab
  const filteredRows = useMemo(() => {
    const tokens = parseSearch(query);

    return accountRows.filter((row) => {
      const nameMatch = matchesSearch(tokens, row.entity.tradeName, row.entity.legalName, row.entity.documentNumber);

      if (!nameMatch) return false;

      if (tab === "customers") {
        if (!row.isCust) return false;
        if (onlyWithBalance && Math.abs(row.receivableBalance) <= 0.01 && row.receivableBalanceUsd <= 0.01) return false;
        return true;
      }

      if (tab === "suppliers") {
        if (!row.isSupp) return false;
        if (onlyWithBalance && Math.abs(row.payableBalance) <= 0.01 && row.payableBalanceUsd <= 0.01) return false;
        return true;
      }

      if (tab === "dual") {
        if (!row.isDual) return false;
        if (onlyWithBalance && Math.abs(row.netBalance) <= 0.01) return false;
        return true;
      }

      return true;
    });
  }, [accountRows, tab, query, onlyWithBalance]);

  // Global KPI totals
  const totalReceivablesArs = useMemo(
    () => accountRows.filter((r) => r.isCust).reduce((s, r) => s + r.receivableBalance, 0),
    [accountRows]
  );
  const totalReceivablesUsd = useMemo(
    () => accountRows.filter((r) => r.isCust).reduce((s, r) => s + r.receivableBalanceUsd, 0),
    [accountRows]
  );
  const totalPayablesArs = useMemo(
    () => accountRows.filter((r) => r.isSupp).reduce((s, r) => s + r.payableBalance, 0),
    [accountRows]
  );
  const totalPayablesUsd = useMemo(
    () => accountRows.filter((r) => r.isSupp).reduce((s, r) => s + r.payableBalanceUsd, 0),
    [accountRows]
  );

  const netGlobalBalance = totalReceivablesArs - totalPayablesArs;
  const dualCount = useMemo(() => accountRows.filter((r) => r.isDual).length, [accountRows]);

  // Generate Chronological Ledger for selected entity
  const ledgerHistory: LedgerItem[] = ledger?.movements ?? [];

  const handleExportAccountsExcel = () => {
    const columns: ExcelColumn<any>[] = [
      { key: "tradeName", header: "Razón Social / Fantasía", value: (r) => r.entity.tradeName || r.entity.legalName },
      { key: "cuit", header: "CUIT", value: (r) => r.entity.documentNumber || "" },
      { key: "saldoArs", header: "Saldo Pendiente ARS", value: (r) => tab === "customers" ? r.receivableBalance : tab === "suppliers" ? r.payableBalance : r.netBalance },
      { key: "saldoUsd", header: "Saldo Pendiente USD", value: (r) => tab === "customers" ? r.receivableBalanceUsd : tab === "suppliers" ? r.payableBalanceUsd : 0 }
    ];
    void exportToExcel(`cuentas-corrientes-${tab}`, filteredRows, columns);
  };

  if (ledgerEntity) {
    const row = accountRows.find((r) => r.entity.id === ledgerEntity.id);
    const pending = ledgerHistory.filter((item) => item.pending);
    const pendingTotal = ledger?.summary.pendingDifferencesArs ?? 0;
    const finalBalance = ledgerHistory.length ? ledgerHistory[ledgerHistory.length - 1].balance : 0;
    const name = ledgerEntity.tradeName || ledgerEntity.legalName;
    const roles = [ledgerEntity.isCustomer && "Cliente", ledgerEntity.isSupplier && "Proveedor"].filter(Boolean).join(" y ");
    const today = new Date().toLocaleDateString("es-AR");
    const companyAddress = [company?.fiscalStreet, company?.fiscalCity, company?.fiscalProvince].filter(Boolean).join(", ");

    const downloadPdf = async () => {
      const element = document.getElementById("account-statement-sheet");
      if (!element) return;
      setDownloadingPdf(true);
      try {
        const html2pdf = await loadHtml2Pdf();
        await html2pdf().set({
          margin: [8, 8, 10, 8] as [number, number, number, number],
          filename: `Estado_de_cuenta_${name.replace(/[^\w]+/g, "_")}_${todayAr()}.pdf`,
          image: { type: "jpeg" as const, quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
          pagebreak: { mode: ["css", "legacy"], avoid: "tr" }
        }).from(element).save();
      } finally {
        setDownloadingPdf(false);
      }
    };

    return (
      <div className="page-wide" style={{ paddingBottom: 60 }}>
        <div className="card pad">
          <div className="toolbar" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--lc-line, var(--lc-line))", paddingBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <div>
              <span className="eyebrow">CUENTA CORRIENTE</span>
              <h2 style={{ margin: 0 }}>{name}</h2>
              <p className="muted" style={{ margin: "2px 0 0 0" }}>
                CUIT: {ledgerEntity.documentNumber || "Sin CUIT"} · {roles}
              </p>
            </div>
            <div className="toolbar" style={{ gap: 8 }}>
              <button className="btn btn-outline compact" onClick={() => setLedgerEntity(null)}>← Volver al listado</button>
              <button className="btn btn-outline compact" disabled={downloadingPdf} onClick={() => void downloadPdf()}>
                {downloadingPdf ? "Generando…" : "Descargar PDF"}
              </button>
              <button className="btn btn-outline compact" onClick={() => setSendVia("email")}>✉ Email</button>
              {ledgerEntity.isCustomer && ((row?.receivableBalance ?? 0) > 0.01 || (row?.receivableBalanceUsd ?? 0) > 0.01) && (
                <button
                  className="btn btn-outline compact"
                  disabled={draftingReminder}
                  onClick={() => void openCollectionReminder(ledgerEntity.id)}
                  title="Armar un borrador de recordatorio con las facturas vencidas de este cliente (nunca se envía solo)"
                >
                  {draftingReminder ? "Armando borrador…" : "✨ Recordatorio de cobro"}
                </button>
              )}
              {ledgerEntity.isCustomer && (
                <Link className="btn compact" to={`/finanzas/cobranzas?customerId=${ledgerEntity.id}`}>Registrar cobro</Link>
              )}
              {ledgerEntity.isSupplier && (
                <Link className="btn compact" to={`/finanzas/pagos/nueva?supplierId=${ledgerEntity.id}`}>Emitir orden de pago</Link>
              )}
            </div>
          </div>

          {row && (
            <div className="grid-3" style={{ marginTop: 16 }}>
              <div className="card pad" style={{ margin: 0 }}>
                <span className="muted">Saldo de la cuenta (pesos)</span>
                <strong style={{ display: "block", fontSize: "1.4rem" }}>{money(finalBalance)}</strong>
                <span className="muted">{finalBalance > 0.01 ? (ledgerEntity.isCustomer ? "A cobrar" : "A favor") : finalBalance < -0.01 ? "A pagar / saldo a favor del cliente" : "Al día"}</span>
              </div>
              {ledgerEntity.isCustomer && row.receivableBalanceUsd > 0.01 && (
                <div className="card pad" style={{ margin: 0 }}>
                  <span className="muted">Facturas en dólares pendientes</span>
                  <strong style={{ display: "block", fontSize: "1.4rem" }}>{money(row.receivableBalanceUsd, "USD")}</strong>
                  <span className="muted">Se cobran en pesos al TC pactado del día de pago</span>
                </div>
              )}
              {Math.abs(pendingTotal) >= 0.01 && (
                <div className="card pad" style={{ margin: 0 }}>
                  <span className="muted">Diferencias de cambio a documentar</span>
                  <strong style={{ display: "block", fontSize: "1.4rem" }}>{money(pendingTotal)}</strong>
                  <span className="muted">{pending.length} pendiente(s): emití la ND/NC desde cada movimiento</span>
                </div>
              )}
            </div>
          )}

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>Número</th>
                  <th>Descripción</th>
                  <th className="t-right">Debe</th>
                  <th className="t-right">Haber</th>
                  <th className="t-right">Saldo de la cuenta</th>
                  <th className="t-right">Pendiente del comprobante</th>
                </tr>
              </thead>
              <tbody>
                {ledgerHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted t-center">
                      Todavía no hay movimientos en esta cuenta.
                    </td>
                  </tr>
                ) : ledgerHistory.map((item, idx) => (
                  <tr key={idx} style={item.muted ? { opacity: 0.65 } : undefined}>
                    <td>{civilDate(item.date)}</td>
                    <td><strong>{item.type}</strong></td>
                    <td><code style={item.muted ? { textDecoration: "line-through" } : undefined}>{item.number}</code></td>
                    <td>
                      {item.description}
                      {item.originalAmount && (
                        <span className="t-info t-small t-strong" style={{ display: "block" }}>
                          Original: {item.originalAmount}
                        </span>
                      )}
                      {item.pending && (
                        <Link className="btn compact" style={{ marginTop: 6, display: "inline-block" }}
                          to={`/facturas/nueva?nota=${item.pending.differenceArs > 0 ? "ND" : "NC"}&origen=${item.pending.invoiceId}&dif=${item.pending.imputationId}`}>
                          Emitir {item.pending.differenceArs > 0 ? "ND" : "NC"} por diferencia de cambio
                        </Link>
                      )}
                    </td>
                    <td className="t-right">{item.debit > 0 ? money(item.debit) : "—"}</td>
                    <td className="t-right">{item.credit > 0 ? money(item.credit) : "—"}</td>
                    <td className="t-right t-strong" style={{ color: item.balance > 0.01 ? "var(--lc-danger)" : item.balance < -0.01 ? "var(--lc-ok)" : "inherit" }}>
                      {money(item.balance)}
                    </td>
                    <td className="t-right" style={{ color: item.documentBalance === "Cancelado" ? "#047857" : "inherit" }}>
                      {item.documentBalance ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {reminderError && (
          <div className="alert" style={{ marginTop: 12 }}>
            {reminderError}
          </div>
        )}

        {sendVia && (() => {
          const fileName = `Estado_de_cuenta_${name.replace(/[^\w]+/g, "_")}_${todayAr()}.pdf`;
          const sender = company?.tradeName || company?.legalName || "";
          const balanceText = `$ ${finalBalance.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const documentPdf = { elementId: "account-statement-sheet", fileName };
          const isReminder = sendVia === "reminder" && reminderDraft !== null;
          return (
            <EmailComposer
              context={{
                entityType: "AccountStatement",
                entityId: ledgerEntity.id,
                to: isReminder ? (reminderDraft.to ?? ledgerEntity.email ?? undefined) : (ledgerEntity.email ?? undefined),
                subject: isReminder ? reminderDraft.subject : `Estado de cuenta al ${today} - ${sender}`,
                body: isReminder
                  ? reminderDraft.body
                  : `Estimado cliente,\n\nAdjuntamos el estado de cuenta al ${today}. Saldo: ${balanceText}.\n\nSaludos cordiales,\n${sender}`,
                documentPdf
              }}
              onClose={() => {
                setSendVia(null);
                setReminderDraft(null);
              }}
            />
          );
        })()}

        {/* Hoja del estado de cuenta para el PDF (fuera de pantalla). */}
        <div style={{ position: "absolute", left: -10000, top: 0 }} aria-hidden="true">
          <div id="account-statement-sheet" style={{ width: "190mm", padding: "6mm", background: "var(--lc-surface)", fontFamily: "Helvetica, Arial, sans-serif", fontSize: "10px" }}>
            <table style={{ borderBottom: "2px solid var(--lc-accent)", paddingBottom: 8, marginBottom: 10 }}>
              <tbody>
                <tr>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {company?.logoUrl && <img src={company.logoUrl} alt="" crossOrigin="anonymous" style={{ maxHeight: 48, maxWidth: 140, objectFit: "contain" }} />}
                      <div>
                        <div className="t-strong t-accent">{company?.legalName || ""}</div>
                        {company?.tradeName && <div className="t-strong">{company.tradeName}</div>}
                      </div>
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {company?.documentNumber && <>CUIT {company.documentNumber} · </>}
                      {companyAddress}
                      {company?.email && <> · {company.email}</>}
                    </div>
                  </td>
                  <td className="t-right">
                    <div className="t-strong">ESTADO DE CUENTA CORRIENTE</div>
                    <div>Emitido el {today}</div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="box" style={{ marginBottom: 10 }}>
              <strong className="t-small">{ledgerEntity.legalName}</strong>
              {ledgerEntity.tradeName && ledgerEntity.tradeName !== ledgerEntity.legalName && <> ({ledgerEntity.tradeName})</>}
              <div>CUIT: {ledgerEntity.documentNumber || "—"} · {roles}</div>
            </div>
            <table>
              <thead>
                <tr>
                  {["Fecha", "Comprobante", "Número", "Debe", "Haber", "Saldo"].map((h, i) => (
                    <th key={h} style={{ textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerHistory.filter((item) => !item.pending).map((item, idx) => (
                  <tr key={idx} style={{ color: item.muted ? "#94a3b8" : undefined }}>
                    <td>{civilDate(item.date)}</td>
                    <td>{item.type}{item.originalAmount ? ` · ${item.originalAmount}` : ""}</td>
                    <td className="t-mono">{item.number}</td>
                    <td className="t-right">{item.debit > 0 ? money(item.debit) : ""}</td>
                    <td className="t-right">{item.credit > 0 ? money(item.credit) : ""}</td>
                    <td className="t-right t-strong">{money(item.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="t-right t-strong t-small" style={{ marginTop: 10 }}>
              Saldo al {today}: {money(ledgerHistory.filter((item) => !item.pending).reduce(
                (_, item) => item.balance, 0))}
            </div>
            {ledgerEntity.isCustomer && row && row.receivableBalanceUsd > 0.01 && (
              <div className="t-right muted" style={{ marginTop: 4 }}>
                Incluye facturas en dólares por {money(row.receivableBalanceUsd, "USD")}, valuadas a la cotización de emisión.
                Se cancelan en pesos a la cotización pactada del día de pago.
              </div>
            )}
            <div className="muted t-center" style={{ marginTop: 18, fontSize: 8.5 }}>
              Estado de cuenta informativo emitido por {company?.legalName || "la empresa"}. Ante cualquier diferencia, por favor comunicarse.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Encabezado */}
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS & TESORERÍA</span>
          <h1>Cuentas Corrientes</h1>
          <p className="muted">
            Gestión integral de saldos a cobrar, deudas a proveedores y posición bi-monetaria (ARS / USD).
          </p>
        </div>
        <div className="toolbar">
          <Link className="btn btn-outline" to="/finanzas/cobranzas">
            💵 Recibos de Cobro
          </Link>
          <Link className="btn btn-outline" to="/finanzas/pagos/nueva">
            💳 Órdenes de Pago
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPIs Globales */}
      <div className="kpi kpi-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <span className="muted">Total a Cobrar Clientes (ARS)</span>
          <strong className="t-ok" style={{ fontSize: "1.4rem" }}>{money(totalReceivablesArs)}</strong>
          {totalReceivablesUsd > 0.01 && (
            <small className="t-info t-strong" style={{ display: "block", marginTop: 2 }}>
              + {money(totalReceivablesUsd, "USD")}
            </small>
          )}
        </div>
        <div className="card">
          <span className="muted">Total a Pagar Proveedores (ARS)</span>
          <strong className="t-danger" style={{ fontSize: "1.4rem" }}>{money(totalPayablesArs)}</strong>
          {totalPayablesUsd > 0.01 && (
            <small className="t-info t-strong" style={{ display: "block", marginTop: 2 }}>
              + {money(totalPayablesUsd, "USD")}
            </small>
          )}
        </div>
        <div className="card">
          <span className="muted">Posición Neta ARS</span>
          <strong
            style={{
              fontSize: "1.4rem",
              color: netGlobalBalance >= 0 ? "var(--lc-ok)" : "var(--lc-danger)"
            }}
          >
            {netGlobalBalance >= 0 ? `+${money(netGlobalBalance)}` : money(netGlobalBalance)}
          </strong>
          <small className="muted t-small" style={{ display: "block", marginTop: 2 }}>
            {netGlobalBalance >= 0 ? "Superávit a favor" : "Déficit / Deuda neta"}
          </small>
        </div>
        <div className="card">
          <span className="muted">Cuentas Mixtas (Dual)</span>
          <strong style={{ fontSize: "1.4rem" }}>{dualCount}</strong>
          <small className="muted t-small" style={{ display: "block", marginTop: 2 }}>
            Clientes que son proveedores
          </small>
        </div>
      </div>

      {/* Pestañas de Navegación */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`tab-btn ${tab === "customers" ? "active" : ""}`}
          onClick={() => setTab("customers")}
        >
          👤 Clientes (A Cobrar)
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "suppliers" ? "active" : ""}`}
          onClick={() => setTab("suppliers")}
        >
          🏢 Proveedores (A Pagar)
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "dual" ? "active" : ""}`}
          onClick={() => setTab("dual")}
        >
          🔄 Cuentas Mixtas (Compensación)
        </button>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <section className="card pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flex: "1 1 300px" }}>
            <SearchField
              value={query}
              onChange={setQuery}
              resultCount={filteredRows.length}
              placeholder="Buscar por razón social, nombre de fantasía o CUIT"
              style={{ width: "100%", maxWidth: 520 }}
            />
            <label style={{ alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={onlyWithBalance}
                onChange={(e) => setOnlyWithBalance(e.target.checked)}
              />
              Solo cuentas con saldo pendiente
            </label>
          </div>

          <div className="toolbar" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline compact"
              onClick={handleExportAccountsExcel}
              disabled={filteredRows.length === 0}
            >
              📥 Descargar Excel
            </button>
          </div>
        </div>
      </section>

      {/* Tabla Principal */}
      <section className="card pad">
        {loading ? (
          <div style={{ padding: 30 }} className="muted t-center">
            Cargando cuentas corrientes y saldos...
          </div>
        ) : tab === "customers" ? (
          /* TABLA CLIENTES */
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente / Razón Social</th>
                  <th>CUIT</th>
                  <th className="t-right">Facturado (ARS)</th>
                  <th className="t-right">Cobrado (ARS)</th>
                  <th className="t-right">Saldo Pendiente</th>
                  <th className="t-center">Estado</th>
                  <th className="t-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted t-center">
                      No se encontraron clientes con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.entity.id} className="row-link" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setLedgerEntity(row.entity); }}>
                      <td>
                        <strong>{row.entity.tradeName || row.entity.legalName}</strong>
                        <small className="muted t-small" style={{ display: "block" }}>
                          {row.entity.legalName}
                        </small>
                      </td>
                      <td>
                        <code>{row.entity.documentNumber || "Sin CUIT"}</code>
                      </td>
                      <td className="t-right">
                        {money(row.billedSalesArs)}
                        {row.billedSalesUsd > 0.01 && (
                          <small className="muted t-small t-info" style={{ display: "block" }}>
                            ({money(row.billedSalesUsd, "USD")})
                          </small>
                        )}
                      </td>
                      <td className="t-right">
                        {money(row.collectedSalesArs)}
                      </td>
                      <td className="t-right">
                        <strong
                          style={{ color: row.receivableBalance > 0.01 || row.receivableBalanceUsd > 0.01 ? "var(--lc-danger)" : "var(--lc-ok)" }}
                        >
                          {money(row.receivableBalance)}
                        </strong>
                        {row.receivableBalanceUsd > 0.01 && (
                          <span className="t-info t-small t-strong"
                            style={{ display: "inline-block", marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "var(--lc-info-bg)" }}
                          >
                            {money(row.receivableBalanceUsd, "USD")}
                          </span>
                        )}
                      </td>
                      <td className="t-center">
                        {row.receivableBalance > 0.01 || row.receivableBalanceUsd > 0.01 ? (
                          <span className="badge t-danger" style={{ background: "rgba(239, 68, 68, 0.15)" }}>
                            🔴 Con Saldo Deudor
                          </span>
                        ) : (
                          <span className="badge ok t-ok" style={{ background: "rgba(16, 185, 129, 0.15)" }}>
                            🟢 Al Día
                          </span>
                        )}
                      </td>
                      <td className="t-center">
                        <div className="toolbar" style={{ justifyContent: "center", gap: 6 }}>
                          <button
                            className="btn btn-outline compact"
                            onClick={() => setLedgerEntity(row.entity)}
                            title="Ver la cuenta corriente con sus movimientos"
                          >
                            Ver cuenta
                          </button>
                          <Link
                            className="btn compact"
                            to={`/finanzas/cobranzas?customerId=${row.entity.id}`}
                            title="Registrar cobro"
                          >
                            💵 Cobrar
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : tab === "suppliers" ? (
          /* TABLA PROVEEDORES */
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proveedor / Razón Social</th>
                  <th>CUIT</th>
                  <th className="t-right">Facturado (ARS)</th>
                  <th className="t-right">Pagado (ARS)</th>
                  <th className="t-right">Saldo a Pagar</th>
                  <th className="t-center">Estado</th>
                  <th className="t-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted t-center">
                      No se encontraron proveedores con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.entity.id} className="row-link" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setLedgerEntity(row.entity); }}>
                      <td>
                        <strong>{row.entity.tradeName || row.entity.legalName}</strong>
                        <small className="muted t-small" style={{ display: "block" }}>
                          {row.entity.legalName}
                        </small>
                      </td>
                      <td>
                        <code>{row.entity.documentNumber || "Sin CUIT"}</code>
                      </td>
                      <td className="t-right">
                        {money(row.billedPurchasesArs)}
                        {row.billedPurchasesUsd > 0.01 && (
                          <small className="muted t-small t-info" style={{ display: "block" }}>
                            ({money(row.billedPurchasesUsd, "USD")})
                          </small>
                        )}
                      </td>
                      <td className="t-right">
                        {money(row.paidPurchasesArs)}
                      </td>
                      <td className="t-right">
                        <strong
                          style={{ color: row.payableBalance > 0.01 || row.payableBalanceUsd > 0.01 ? "var(--lc-danger)" : "var(--lc-ok)" }}
                        >
                          {money(row.payableBalance)}
                        </strong>
                        {row.payableBalanceUsd > 0.01 && (
                          <span className="t-info t-small t-strong"
                            style={{ display: "inline-block", marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "var(--lc-info-bg)" }}
                          >
                            {money(row.payableBalanceUsd, "USD")}
                          </span>
                        )}
                      </td>
                      <td className="t-center">
                        {row.payableBalance > 0.01 || row.payableBalanceUsd > 0.01 ? (
                          <span className="badge t-danger" style={{ background: "rgba(239, 68, 68, 0.15)" }}>
                            🔴 Pendiente de Pago
                          </span>
                        ) : (
                          <span className="badge ok t-ok" style={{ background: "rgba(16, 185, 129, 0.15)" }}>
                            🟢 Saldado
                          </span>
                        )}
                      </td>
                      <td className="t-center">
                        <div className="toolbar" style={{ justifyContent: "center", gap: 6 }}>
                          <button
                            className="btn btn-outline compact"
                            onClick={() => setLedgerEntity(row.entity)}
                            title="Ver la cuenta corriente con sus movimientos"
                          >
                            Ver cuenta
                          </button>
                          <Link
                            className="btn compact"
                            to={`/finanzas/pagos/nueva?supplierId=${row.entity.id}`}
                            title="Emitir orden de pago"
                          >
                            💳 Pagar
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* TABLA DUAL */
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entidad Mixta (Cliente / Proveedor)</th>
                  <th>CUIT</th>
                  <th className="t-right">Crédito (A Cobrar)</th>
                  <th className="t-right">Débito (A Pagar)</th>
                  <th className="t-right">Posición Neta</th>
                  <th className="t-center">Situación</th>
                  <th className="t-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted t-center">
                      No se encontraron entidades mixtas con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const net = row.netBalance;
                    return (
                      <tr key={row.entity.id} className="row-link" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setLedgerEntity(row.entity); }}>
                        <td>
                          <strong>{row.entity.tradeName || row.entity.legalName}</strong>
                          <small className="muted t-small" style={{ display: "block" }}>
                            {row.entity.legalName}
                          </small>
                        </td>
                        <td>
                          <code>{row.entity.documentNumber || "Sin CUIT"}</code>
                        </td>
                        <td className="t-right t-ok t-strong">
                          {money(row.receivableBalance)}
                        </td>
                        <td className="t-right t-danger t-strong">
                          {money(row.payableBalance)}
                        </td>
                        <td className="t-right">
                          <strong
                            style={{ color: net > 0.01 ? "var(--lc-ok)" : net < -0.01 ? "var(--lc-danger)" : "var(--lc-ink-3)" }}
                          >
                            {net > 0 ? `+${money(net)}` : money(net)}
                          </strong>
                        </td>
                        <td className="t-center">
                          {net > 0.01 ? (
                            <span className="badge ok t-ok" style={{ background: "rgba(16, 185, 129, 0.15)" }}>
                              🟢 A cobrar neto
                            </span>
                          ) : net < -0.01 ? (
                            <span className="badge t-danger" style={{ background: "rgba(239, 68, 68, 0.15)" }}>
                              🔴 A pagar neto
                            </span>
                          ) : (
                            <span className="badge">⚖️ Saldada / Equilibrada</span>
                          )}
                        </td>
                        <td className="t-center">
                          <div className="toolbar" style={{ justifyContent: "center", gap: 6 }}>
                            <button
                              className="btn btn-outline compact"
                              onClick={() => setLedgerEntity(row.entity)}
                              title="Ver la cuenta corriente con sus movimientos"
                            >
                              Ver cuenta
                            </button>
                            <Link
                              className="btn btn-outline compact"
                              to={`/finanzas/cobranzas?customerId=${row.entity.id}`}
                              title="Cobrar"
                            >
                              💵 Cobrar
                            </Link>
                            <Link
                              className="btn compact"
                              to={`/finanzas/pagos/nueva?supplierId=${row.entity.id}`}
                              title="Pagar"
                            >
                              💳 Pagar
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
