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
import { WhatsAppComposer } from "../components/WhatsAppComposer";
import type { CompanySettings } from "../api/types";
import "./collections.css";

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
  const [sendVia, setSendVia] = useState<"email" | "whatsapp" | null>(null);
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
      return;
    }
    let cancelled = false;
    api.getCurrentAccount(ledgerEntity.id)
      .then((r) => !cancelled && setLedger(r as { summary: AccountSummary; movements: LedgerItem[] }))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "No se pudo cargar la cuenta."));
    return () => { cancelled = true; };
  }, [ledgerEntity?.id]);

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
          filename: `Estado_de_cuenta_${name.replace(/[^\w]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`,
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
          <div className="toolbar" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--border, #e2e8f0)", paddingBottom: 12, flexWrap: "wrap", gap: 10 }}>
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
              <button className="btn btn-outline compact" onClick={() => setSendVia("whatsapp")}>💬 WhatsApp</button>
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
                  <th style={{ textAlign: "right" }}>Debe</th>
                  <th style={{ textAlign: "right" }}>Haber</th>
                  <th style={{ textAlign: "right" }}>Saldo de la cuenta</th>
                  <th style={{ textAlign: "right" }}>Pendiente del comprobante</th>
                </tr>
              </thead>
              <tbody>
                {ledgerHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
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
                        <span style={{ display: "block", color: "#2563eb", fontSize: "0.75rem", fontWeight: 700 }}>
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
                    <td style={{ textAlign: "right" }}>{item.debit > 0 ? money(item.debit) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{item.credit > 0 ? money(item.credit) : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: item.balance > 0.01 ? "#b91c1c" : item.balance < -0.01 ? "#047857" : "inherit" }}>
                      {money(item.balance)}
                    </td>
                    <td style={{ textAlign: "right", color: item.documentBalance === "Cancelado" ? "#047857" : "inherit" }}>
                      {item.documentBalance ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {sendVia && (() => {
          const fileName = `Estado_de_cuenta_${name.replace(/[^\w]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
          const sender = company?.tradeName || company?.legalName || "";
          const balanceText = `$ ${finalBalance.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const documentPdf = { elementId: "account-statement-sheet", fileName };
          return sendVia === "email" ? (
            <EmailComposer
              context={{
                entityType: "AccountStatement",
                entityId: ledgerEntity.id,
                to: ledgerEntity.email ?? undefined,
                subject: `Estado de cuenta al ${today} - ${sender}`,
                body: `Estimado cliente,\n\nAdjuntamos el estado de cuenta al ${today}. Saldo: ${balanceText}.\n\nSaludos cordiales,\n${sender}`,
                documentPdf
              }}
              onClose={() => setSendVia(null)}
            />
          ) : (
            <WhatsAppComposer
              context={{
                entityType: "AccountStatement",
                entityId: ledgerEntity.id,
                phone: ledgerEntity.phone,
                body: `Hola, te enviamos el estado de cuenta al ${today}. Saldo: ${balanceText}.\n\nSaludos, ${sender}`,
                documentPdf
              }}
              onClose={() => setSendVia(null)}
            />
          );
        })()}

        {/* Hoja del estado de cuenta para el PDF (fuera de pantalla). */}
        <div style={{ position: "absolute", left: -10000, top: 0 }} aria-hidden="true">
          <div id="account-statement-sheet" style={{ width: "190mm", padding: "6mm", background: "#fff", color: "#1e293b", fontFamily: "Helvetica, Arial, sans-serif", fontSize: "10px" }}>
            <table style={{ width: "100%", borderBottom: "2px solid #0f766e", paddingBottom: 8, marginBottom: 10 }}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: "top" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {company?.logoUrl && <img src={company.logoUrl} alt="" crossOrigin="anonymous" style={{ maxHeight: 48, maxWidth: 140, objectFit: "contain" }} />}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f766e" }}>{company?.legalName || ""}</div>
                        {company?.tradeName && <div style={{ fontWeight: 600 }}>{company.tradeName}</div>}
                      </div>
                    </div>
                    <div style={{ marginTop: 4, color: "#475569" }}>
                      {company?.documentNumber && <>CUIT {company.documentNumber} · </>}
                      {companyAddress}
                      {company?.email && <> · {company.email}</>}
                    </div>
                  </td>
                  <td style={{ textAlign: "right", verticalAlign: "top" }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>ESTADO DE CUENTA CORRIENTE</div>
                    <div>Emitido el {today}</div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4, padding: "6px 8px", marginBottom: 10 }}>
              <strong style={{ fontSize: 12 }}>{ledgerEntity.legalName}</strong>
              {ledgerEntity.tradeName && ledgerEntity.tradeName !== ledgerEntity.legalName && <> ({ledgerEntity.tradeName})</>}
              <div>CUIT: {ledgerEntity.documentNumber || "—"} · {roles}</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0f766e", color: "#fff" }}>
                  {["Fecha", "Comprobante", "Número", "Debe", "Haber", "Saldo"].map((h, i) => (
                    <th key={h} style={{ padding: "4px 6px", textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerHistory.filter((item) => !item.pending).map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0", color: item.muted ? "#94a3b8" : undefined }}>
                    <td style={{ padding: "3px 6px" }}>{civilDate(item.date)}</td>
                    <td style={{ padding: "3px 6px" }}>{item.type}{item.originalAmount ? ` · ${item.originalAmount}` : ""}</td>
                    <td style={{ padding: "3px 6px", fontFamily: "monospace" }}>{item.number}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right" }}>{item.debit > 0 ? money(item.debit) : ""}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right" }}>{item.credit > 0 ? money(item.credit) : ""}</td>
                    <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700 }}>{money(item.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, textAlign: "right", fontSize: 13, fontWeight: 700 }}>
              Saldo al {today}: {money(ledgerHistory.filter((item) => !item.pending).reduce(
                (_, item) => item.balance, 0))}
            </div>
            {ledgerEntity.isCustomer && row && row.receivableBalanceUsd > 0.01 && (
              <div style={{ marginTop: 4, textAlign: "right", color: "#475569" }}>
                Incluye facturas en dólares por {money(row.receivableBalanceUsd, "USD")}, valuadas a la cotización de emisión.
                Se cancelan en pesos a la cotización pactada del día de pago.
              </div>
            )}
            <div style={{ marginTop: 18, color: "#94a3b8", fontSize: 8.5, textAlign: "center" }}>
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
        <div className="alert" style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#f87171", marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPIs Globales */}
      <div className="kpi kpi-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <span className="muted">Total a Cobrar Clientes (ARS)</span>
          <strong style={{ fontSize: "1.4rem", color: "#059669" }}>{money(totalReceivablesArs)}</strong>
          {totalReceivablesUsd > 0.01 && (
            <small style={{ display: "block", color: "#2563eb", fontWeight: 700, marginTop: 2 }}>
              + {money(totalReceivablesUsd, "USD")}
            </small>
          )}
        </div>
        <div className="card">
          <span className="muted">Total a Pagar Proveedores (ARS)</span>
          <strong style={{ fontSize: "1.4rem", color: "#dc2626" }}>{money(totalPayablesArs)}</strong>
          {totalPayablesUsd > 0.01 && (
            <small style={{ display: "block", color: "#2563eb", fontWeight: 700, marginTop: 2 }}>
              + {money(totalPayablesUsd, "USD")}
            </small>
          )}
        </div>
        <div className="card">
          <span className="muted">Posición Neta ARS</span>
          <strong
            style={{
              fontSize: "1.4rem",
              color: netGlobalBalance >= 0 ? "#059669" : "#dc2626"
            }}
          >
            {netGlobalBalance >= 0 ? `+${money(netGlobalBalance)}` : money(netGlobalBalance)}
          </strong>
          <small className="muted" style={{ display: "block", marginTop: 2, fontSize: "0.75rem" }}>
            {netGlobalBalance >= 0 ? "Superávit a favor" : "Déficit / Deuda neta"}
          </small>
        </div>
        <div className="card">
          <span className="muted">Cuentas Mixtas (Dual)</span>
          <strong style={{ fontSize: "1.4rem" }}>{dualCount}</strong>
          <small className="muted" style={{ display: "block", marginTop: 2, fontSize: "0.75rem" }}>
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
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer", whiteSpace: "nowrap" }}>
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
          <div style={{ textAlign: "center", padding: 30 }} className="muted">
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
                  <th style={{ textAlign: "right" }}>Facturado (ARS)</th>
                  <th style={{ textAlign: "right" }}>Cobrado (ARS)</th>
                  <th style={{ textAlign: "right" }}>Saldo Pendiente</th>
                  <th style={{ textAlign: "center" }}>Estado</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No se encontraron clientes con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.entity.id} className="row-link" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setLedgerEntity(row.entity); }}>
                      <td>
                        <strong>{row.entity.tradeName || row.entity.legalName}</strong>
                        <small className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                          {row.entity.legalName}
                        </small>
                      </td>
                      <td>
                        <code>{row.entity.documentNumber || "Sin CUIT"}</code>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {money(row.billedSalesArs)}
                        {row.billedSalesUsd > 0.01 && (
                          <small className="muted" style={{ display: "block", fontSize: "0.72rem", color: "#2563eb" }}>
                            ({money(row.billedSalesUsd, "USD")})
                          </small>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {money(row.collectedSalesArs)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong
                          style={{
                            fontSize: "0.95rem",
                            color: row.receivableBalance > 0.01 || row.receivableBalanceUsd > 0.01 ? "#dc2626" : "#059669"
                          }}
                        >
                          {money(row.receivableBalance)}
                        </strong>
                        {row.receivableBalanceUsd > 0.01 && (
                          <span
                            style={{
                              display: "inline-block",
                              marginLeft: 6,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "#dbeafe",
                              color: "#1e40af",
                              fontSize: "0.75rem",
                              fontWeight: 700
                            }}
                          >
                            {money(row.receivableBalanceUsd, "USD")}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {row.receivableBalance > 0.01 || row.receivableBalanceUsd > 0.01 ? (
                          <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#991b1b" }}>
                            🔴 Con Saldo Deudor
                          </span>
                        ) : (
                          <span className="badge ok" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#065f46" }}>
                            🟢 Al Día
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
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
                  <th style={{ textAlign: "right" }}>Facturado (ARS)</th>
                  <th style={{ textAlign: "right" }}>Pagado (ARS)</th>
                  <th style={{ textAlign: "right" }}>Saldo a Pagar</th>
                  <th style={{ textAlign: "center" }}>Estado</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No se encontraron proveedores con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.entity.id} className="row-link" onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setLedgerEntity(row.entity); }}>
                      <td>
                        <strong>{row.entity.tradeName || row.entity.legalName}</strong>
                        <small className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                          {row.entity.legalName}
                        </small>
                      </td>
                      <td>
                        <code>{row.entity.documentNumber || "Sin CUIT"}</code>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {money(row.billedPurchasesArs)}
                        {row.billedPurchasesUsd > 0.01 && (
                          <small className="muted" style={{ display: "block", fontSize: "0.72rem", color: "#2563eb" }}>
                            ({money(row.billedPurchasesUsd, "USD")})
                          </small>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {money(row.paidPurchasesArs)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong
                          style={{
                            fontSize: "0.95rem",
                            color: row.payableBalance > 0.01 || row.payableBalanceUsd > 0.01 ? "#dc2626" : "#059669"
                          }}
                        >
                          {money(row.payableBalance)}
                        </strong>
                        {row.payableBalanceUsd > 0.01 && (
                          <span
                            style={{
                              display: "inline-block",
                              marginLeft: 6,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "#dbeafe",
                              color: "#1e40af",
                              fontSize: "0.75rem",
                              fontWeight: 700
                            }}
                          >
                            {money(row.payableBalanceUsd, "USD")}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {row.payableBalance > 0.01 || row.payableBalanceUsd > 0.01 ? (
                          <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#991b1b" }}>
                            🔴 Pendiente de Pago
                          </span>
                        ) : (
                          <span className="badge ok" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#065f46" }}>
                            🟢 Saldado
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
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
                  <th style={{ textAlign: "right" }}>Crédito (A Cobrar)</th>
                  <th style={{ textAlign: "right" }}>Débito (A Pagar)</th>
                  <th style={{ textAlign: "right" }}>Posición Neta</th>
                  <th style={{ textAlign: "center" }}>Situación</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
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
                          <small className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                            {row.entity.legalName}
                          </small>
                        </td>
                        <td>
                          <code>{row.entity.documentNumber || "Sin CUIT"}</code>
                        </td>
                        <td style={{ textAlign: "right", color: "#059669", fontWeight: 600 }}>
                          {money(row.receivableBalance)}
                        </td>
                        <td style={{ textAlign: "right", color: "#dc2626", fontWeight: 600 }}>
                          {money(row.payableBalance)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <strong
                            style={{
                              fontSize: "1rem",
                              color: net > 0.01 ? "#059669" : net < -0.01 ? "#dc2626" : "#64748b"
                            }}
                          >
                            {net > 0 ? `+${money(net)}` : money(net)}
                          </strong>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {net > 0.01 ? (
                            <span className="badge ok" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#065f46" }}>
                              🟢 A cobrar neto
                            </span>
                          ) : net < -0.01 ? (
                            <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#991b1b" }}>
                              🔴 A pagar neto
                            </span>
                          ) : (
                            <span className="badge">⚖️ Saldada / Equilibrada</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
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
