import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CustomerSummary, ExchangeRates, Invoice, Product, PurchaseOrder, Quote } from "../api/types";
import type { QualityDashboard } from "../api/types/quality";
import type { ReceivedCheque } from "../api/types/finance";
import { moduleHue, resolveAllowedModuleIds } from "../app/moduleRegistry";
import { Icon, type IconName } from "../components/ui/Icon";
import { useAuth } from "../context/AuthContext";
import { withCollections, type ReceiptForImputation } from "../lib/receivables";
import "../styles/instrumento.css";
import "./today.css";

type Range = "month" | "quarter" | "year";
type Receipt = Awaited<ReturnType<typeof api.listCollectionReceipts>>[number];
type MetrologySummary = Awaited<ReturnType<typeof api.getMetrologyDashboard>>;

type Tone = "danger" | "warn" | "info" | "ok";
type AgendaItem = {
  id: string;
  moduleId: string;
  glyph: IconName;
  tone: Tone;
  title: string;
  detail: string;
  amount?: string;
  to: string;
  cta: string;
  /** Mayor = más arriba. Cobranzas vencidas primero, después lo que bloquea facturar, después el resto. */
  priority: number;
};

const RANGES: { id: Range; label: string }[] = [
  { id: "month", label: "Este mes" },
  { id: "quarter", label: "Trimestre" },
  { id: "year", label: "Año" }
];

const DAY_MS = 86_400_000;
const money = (value: number) => `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(value))}`;
const compact = (value: number) =>
  `$ ${new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
const shortDate = (value: string) => value.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function today0() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function periodStart(range: Range, ref = today0()) {
  const start = new Date(ref);
  if (range === "month") start.setDate(1);
  if (range === "quarter") start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  if (range === "year") start.setMonth(0, 1);
  return start;
}

/** Período anterior de igual largo (para la variación). */
function previousWindow(range: Range) {
  const start = periodStart(range);
  const elapsed = Date.now() - start.getTime();
  const prevStart = new Date(start);
  if (range === "month") prevStart.setMonth(prevStart.getMonth() - 1);
  if (range === "quarter") prevStart.setMonth(prevStart.getMonth() - 3);
  if (range === "year") prevStart.setFullYear(prevStart.getFullYear() - 1);
  return { start: prevStart, end: new Date(prevStart.getTime() + elapsed) };
}

function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

function toArs(amount: number, currency: string | null | undefined, rate?: number | null) {
  if (!currency || currency === "ARS") return amount;
  if (currency.startsWith("USD") && rate && rate > 0) return amount * rate;
  return null;
}

function signedInvoiceArs(inv: Invoice) {
  const value = toArs(inv.total, inv.currency, inv.exchangeRate);
  if (value === null) return null;
  return inv.invoiceType.startsWith("NC") ? -Math.abs(value) : value;
}

function sparkPoints(values: number[]) {
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  return values.map((v, i) => `${((i / Math.max(1, values.length - 1)) * 100).toFixed(1)},${(30 - ((v - min) / span) * 26).toFixed(1)}`).join(" ");
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

const DONE_KEY = () => `ins-today-done-${new Date().toISOString().slice(0, 10)}`;
function readDone(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY()) || "[]");
  } catch {
    return [];
  }
}

type Kpi = {
  id: string;
  moduleId: string;
  label: string;
  value: string;
  detail: string;
  delta?: { text: string; tone: Tone } | null;
  series?: number[];
  to: string;
};

/**
 * Inicio: qué necesita atención hoy (agenda ordenada por impacto), cómo viene el período
 * y qué entra a caja en las próximas semanas. Solo usa datos reales de los módulos habilitados.
 */
export function TodayPage() {
  const { user } = useAuth();
  const allowed = useMemo(() => resolveAllowedModuleIds(user?.role || "Comercial", user?.allowedModulesJson), [user?.role, user?.allowedModulesJson]);
  const can = useCallback((moduleId: string) => allowed.includes(moduleId), [allowed]);

  const [range, setRange] = useState<Range>("month");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [cheques, setCheques] = useState<ReceivedCheque[]>([]);
  const [quality, setQuality] = useState<QualityDashboard | null>(null);
  const [metrology, setMetrology] = useState<MetrologySummary | null>(null);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [done, setDone] = useState<string[]>(readDone);

  const refresh = useCallback(async () => {
    setLoading(true);
    const sources: Array<{ name: string; enabled: boolean; run: () => Promise<unknown>; apply: (value: unknown) => void }> = [
      { name: "facturas", enabled: can("ventas"), run: () => api.listInvoices(), apply: (v) => setInvoices(v as Invoice[]) },
      { name: "cobranzas", enabled: can("ventas") || can("finanzas"), run: () => api.listCollectionReceipts(), apply: (v) => setReceipts(v as Receipt[]) },
      { name: "presupuestos", enabled: can("ventas"), run: () => api.listQuotes(), apply: (v) => setQuotes(v as Quote[]) },
      { name: "clientes", enabled: can("ventas"), run: () => api.listAllCustomers(), apply: (v) => setCustomers(v as CustomerSummary[]) },
      { name: "productos", enabled: can("inventario"), run: () => api.listProducts(), apply: (v) => setProducts(v as Product[]) },
      { name: "compras", enabled: can("compras"), run: () => api.listPurchaseOrders(), apply: (v) => setPurchaseOrders(v as PurchaseOrder[]) },
      { name: "cheques", enabled: can("finanzas"), run: () => api.listReceivedCheques(), apply: (v) => setCheques(v as ReceivedCheque[]) },
      { name: "calidad", enabled: can("calidad"), run: () => api.getQualityDashboard(), apply: (v) => setQuality(v as QualityDashboard) },
      { name: "metrología", enabled: can("metrologia"), run: () => api.getMetrologyDashboard(), apply: (v) => setMetrology(v as MetrologySummary) },
      { name: "cotizaciones", enabled: true, run: () => api.getExchangeRates(), apply: (v) => setRates(v as ExchangeRates) }
    ];
    const active = sources.filter((s) => s.enabled);
    const results = await Promise.allSettled(active.map((s) => s.run()));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") active[index].apply(result.value);
    });
    setFailures(active.filter((_, index) => results[index].status === "rejected").map((s) => s.name));
    setUpdatedAt(new Date());
    setLoading(false);
  }, [can]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const customerName = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((c) => map.set(c.id, c.tradeName?.trim() || c.legalName));
    return map;
  }, [customers]);

  const authorized = useMemo(
    () => invoices.filter((inv) => inv.status === "Authorized" && inv.invoiceType !== "Proforma"),
    [invoices]
  );
  const receivables = useMemo(
    () => withCollections(authorized.filter((inv) => !inv.invoiceType.startsWith("NC")), receipts as unknown as ReceiptForImputation[]),
    [authorized, receipts]
  );
  const validReceipts = useMemo(
    () => receipts.filter((r) => !["voided", "cancelled", "anulado"].includes((r.status || "").toLowerCase())),
    [receipts]
  );

  // ---------- Indicadores del período ----------
  const kpis = useMemo<Kpi[]>(() => {
    const start = periodStart(range);
    const now = new Date();
    const prev = previousWindow(range);
    const inWindow = (value: string | null | undefined, from: Date, to: Date) => {
      const d = parseDate(value);
      return !!d && d >= from && d <= to;
    };
    const buckets = 8;
    const span = Math.max(1, now.getTime() - start.getTime());
    const bucketOf = (value: string) => Math.min(buckets - 1, Math.max(0, Math.floor(((parseDate(value)?.getTime() ?? 0) - start.getTime()) / span * buckets)));

    let billed = 0;
    let billedPrev = 0;
    const billedSeries = new Array(buckets).fill(0);
    authorized.forEach((inv) => {
      const value = signedInvoiceArs(inv);
      if (value === null) return;
      if (inWindow(inv.issueDate, start, now)) {
        billed += value;
        billedSeries[bucketOf(inv.issueDate)] += value;
      } else if (inWindow(inv.issueDate, prev.start, prev.end)) billedPrev += value;
    });

    let collected = 0;
    let collectedPrev = 0;
    const collectedSeries = new Array(buckets).fill(0);
    validReceipts.forEach((r) => {
      const value = toArs(r.amount, r.currency);
      if (value === null) return;
      if (inWindow(r.receiptDateUtc, start, now)) {
        collected += value;
        collectedSeries[bucketOf(r.receiptDateUtc)] += value;
      } else if (inWindow(r.receiptDateUtc, prev.start, prev.end)) collectedPrev += value;
    });

    const delta = (current: number, previous: number): Kpi["delta"] => {
      if (previous <= 0) return current > 0 ? { text: "nuevo", tone: "ok" } : null;
      const pct = ((current - previous) / previous) * 100;
      return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%`, tone: pct >= 0 ? "ok" : "warn" };
    };

    const overdue = receivables.filter((inv) => !inv.isPaid && inv.daysOverdue > 0);
    const overdueTotal = overdue.reduce((sum, inv) => sum + (toArs(inv.saldoPendiente, inv.currency, inv.exchangeRate) ?? 0), 0);
    const oldest = overdue.reduce((max, inv) => Math.max(max, inv.daysOverdue), 0);
    const overdueCustomers = new Set(overdue.map((inv) => inv.customerId)).size;

    const openQuotes = quotes.filter((q) => ["Draft", "Sent", "Accepted"].includes(q.status));
    const openQuotesTotal = openQuotes.reduce((sum, q) => {
      const rate = q.currency === "USD_BILLETE" ? q.exchangeRateUsdBillete : q.currency === "USD_DIVISA" ? q.exchangeRateUsdDivisa : 1;
      return sum + (toArs(q.total, q.currency === "ARS" ? "ARS" : "USD", rate) ?? 0);
    }, 0);

    const periodLabel = range === "month" ? "el mes pasado" : range === "quarter" ? "el trimestre anterior" : "el año anterior";
    const list: Kpi[] = [];
    if (can("ventas")) {
      list.push({
        id: "billed",
        moduleId: "ventas",
        label: "Facturado",
        value: compact(billed),
        detail: `${authorized.filter((inv) => inWindow(inv.issueDate, start, now)).length} comprobantes · vs. ${periodLabel}`,
        delta: delta(billed, billedPrev),
        series: billedSeries,
        to: "/facturas"
      });
      list.push({
        id: "collected",
        moduleId: "finanzas",
        label: "Cobrado",
        value: compact(collected),
        detail: `${validReceipts.filter((r) => inWindow(r.receiptDateUtc, start, now)).length} recibos · vs. ${periodLabel}`,
        delta: delta(collected, collectedPrev),
        series: collectedSeries,
        to: "/finanzas/cobranzas"
      });
      list.push({
        id: "overdue",
        moduleId: "finanzas",
        label: "Vencido a cobrar",
        value: compact(overdueTotal),
        detail: overdue.length ? `${overdueCustomers} ${overdueCustomers === 1 ? "cliente" : "clientes"} · la más antigua, ${oldest} días` : "Nada vencido. Bien ahí.",
        delta: overdue.length ? { text: `${overdue.length} fact.`, tone: "danger" } : { text: "al día", tone: "ok" },
        to: "/finanzas/cuenta-corriente"
      });
      list.push({
        id: "pipeline",
        moduleId: "crm",
        label: "Presupuestos abiertos",
        value: compact(openQuotesTotal),
        detail: `${openQuotes.length} en curso (borrador, enviados o aceptados)`,
        to: "/presupuestos"
      });
    }
    return list;
  }, [range, authorized, validReceipts, receivables, quotes, can]);

  // ---------- Agenda ----------
  const agenda = useMemo<AgendaItem[]>(() => {
    const items: AgendaItem[] = [];
    const t0 = today0().getTime();

    // Cobranzas vencidas: una tarea por cliente, con su saldo total y la factura más atrasada.
    const byCustomer = new Map<string, typeof receivables>();
    receivables
      .filter((inv) => !inv.isPaid && inv.daysOverdue > 0)
      .forEach((inv) => byCustomer.set(inv.customerId, [...(byCustomer.get(inv.customerId) ?? []), inv]));
    byCustomer.forEach((list, customerId) => {
      const worst = list.reduce((a, b) => (b.daysOverdue > a.daysOverdue ? b : a));
      const total = list.reduce((sum, inv) => sum + (toArs(inv.saldoPendiente, inv.currency, inv.exchangeRate) ?? 0), 0);
      items.push({
        id: `cob-${customerId}`,
        moduleId: "finanzas",
        glyph: "wallet",
        tone: worst.daysOverdue > 30 ? "danger" : "warn",
        title: `Cobrar a ${worst.customerName || customerName.get(customerId) || "cliente"}`,
        detail: `${worst.formattedNumber} vencida hace ${worst.daysOverdue} ${worst.daysOverdue === 1 ? "día" : "días"}${list.length > 1 ? ` · ${list.length} facturas impagas` : ""}`,
        amount: money(total),
        to: `/clientes/${customerId}`,
        cta: "Ver cuenta",
        priority: 1000 + Math.min(worst.daysOverdue, 365) + Math.log10(Math.max(total, 1)) * 10
      });
    });

    // Borradores de factura: bloquean cobrar.
    const drafts = invoices.filter((inv) => inv.status === "Draft");
    if (drafts.length) {
      const total = drafts.reduce((sum, inv) => sum + (signedInvoiceArs(inv) ?? 0), 0);
      items.push({
        id: "arca-drafts",
        moduleId: "ventas",
        glyph: "receipt",
        tone: "info",
        title: drafts.length === 1 ? `Autorizar la factura de ${drafts[0].customerName}` : `Autorizar ${drafts.length} facturas en borrador`,
        detail: "Sin CAE no se pueden cobrar ni enviar al cliente",
        amount: money(total),
        to: "/facturas",
        cta: "Revisar",
        priority: 900 + drafts.length
      });
    }

    // Cheques recibidos en cartera que ya se pueden depositar (vencen en 2 días o menos).
    cheques
      .filter((c) => (c.direction || "").toLowerCase() === "received" && c.status === "Available")
      .forEach((c) => {
        const due = parseDate(c.dueDateUtc)?.getTime();
        if (due === undefined || due > t0 + 2 * DAY_MS) return;
        const days = Math.round((due - t0) / DAY_MS);
        items.push({
          id: `chq-${c.id}`,
          moduleId: "finanzas",
          glyph: "wallet",
          tone: days < -20 ? "danger" : "warn",
          title: `Depositar cheque ${c.checkNumber}${c.issuerName ? ` de ${c.issuerName}` : ""}`,
          detail: days < 0 ? `Vence a cobrar desde hace ${-days} días${c.bankName ? ` · ${c.bankName}` : ""}` : days === 0 ? "Se puede depositar hoy" : `Se puede depositar en ${days} días`,
          amount: c.currency === "ARS" ? money(c.amount) : `${c.currency} ${c.amount}`,
          to: "/finanzas/echeqs",
          cta: "Ir a cartera",
          priority: 850 - days
        });
      });

    // Presupuestos enviados que vencen en 3 días o vencieron hace poco: momento de llamar.
    quotes
      .filter((q) => q.status === "Sent")
      .forEach((q) => {
        // Días calendario: se compara la fecha de vencimiento contra hoy, sin la hora.
        const created = parseDate(q.createdAtUtc?.slice(0, 10))?.getTime();
        if (created === undefined) return;
        const expires = created + (q.validDays || 15) * DAY_MS;
        const days = Math.round((expires - t0) / DAY_MS);
        if (days > 3 || days < -7) return;
        const rate = q.currency === "USD_BILLETE" ? q.exchangeRateUsdBillete : q.currency === "USD_DIVISA" ? q.exchangeRateUsdDivisa : 1;
        items.push({
          id: `quote-${q.id}`,
          moduleId: "crm",
          glyph: "target",
          tone: days < 0 ? "warn" : "info",
          title: `Seguir presupuesto ${q.quoteNumber}${customerName.get(q.customerId) ? ` · ${customerName.get(q.customerId)}` : ""}`,
          detail: days < 0 ? `Venció hace ${-days} ${days === -1 ? "día" : "días"}: ofrecé renovarlo` : days === 0 ? "Vence hoy" : `Vence en ${days} ${days === 1 ? "día" : "días"}`,
          amount: money(toArs(q.total, q.currency === "ARS" ? "ARS" : "USD", rate) ?? q.total),
          to: `/presupuestos/${q.id}/imprimir`,
          cta: "Abrir",
          priority: 700 + (3 - days)
        });
      });

    // Órdenes de compra con entrega atrasada.
    purchaseOrders
      .filter((po) => ["Sent", "PartiallyReceived"].includes(po.status))
      .forEach((po) => {
        const expected = parseDate(po.expectedDeliveryDate)?.getTime();
        if (expected === undefined || expected >= t0) return;
        const days = Math.round((t0 - expected) / DAY_MS);
        items.push({
          id: `po-${po.id}`,
          moduleId: "compras",
          glyph: "cart",
          tone: days > 7 ? "danger" : "warn",
          title: `Reclamar entrega a ${po.supplierName}`,
          detail: `${po.orderNumber} debía llegar hace ${days} ${days === 1 ? "día" : "días"}${po.status === "PartiallyReceived" ? " · recibida en parte" : ""}`,
          to: `/compras/ordenes/${po.id}/imprimir`,
          cta: "Ver orden",
          priority: 600 + Math.min(days, 60)
        });
      });

    // Stock bajo mínimo: una sola tarea.
    const critical = products.filter((p) => p.trackStock && (p.stock < 0 || (p.minStock > 0 && p.stock <= p.minStock)));
    if (critical.length) {
      items.push({
        id: "stock",
        moduleId: "inventario",
        glyph: "package",
        tone: critical.some((p) => p.stock <= 0) ? "danger" : "warn",
        title: critical.length === 1 ? `Reponer ${critical[0].name}` : `Reponer ${critical.length} artículos`,
        detail: critical.slice(0, 3).map((p) => `${p.code || p.name}: ${p.stock}/${p.minStock}`).join(" · "),
        to: "/inventario",
        cta: "Ver stock",
        priority: 500 + critical.length
      });
    }

    // Metrología: equipos de clientes y pesas patrón con calibración vencida.
    if (metrology) {
      if (metrology.equipments.expired > 0) {
        items.push({
          id: "metro-equipments",
          moduleId: "metrologia",
          glyph: "scale",
          tone: "warn",
          title: `${metrology.equipments.expired} ${metrology.equipments.expired === 1 ? "equipo" : "equipos"} con calibración vencida`,
          detail: "Oportunidad de servicio: contactá a los clientes para programar el ensayo",
          to: "/metrologia/equipos",
          cta: "Programar",
          priority: 550 + metrology.equipments.expired
        });
      }
      if (metrology.weights.expired > 0) {
        items.push({
          id: "metro-weights",
          moduleId: "metrologia",
          glyph: "scale",
          tone: "danger",
          title: `${metrology.weights.expired} ${metrology.weights.expired === 1 ? "pesa patrón vencida" : "pesas patrón vencidas"}`,
          detail: "No se pueden usar en ensayos hasta recalibrarlas",
          to: "/metrologia/patrones",
          cta: "Ver patrones",
          priority: 800
        });
      }
    }

    // Calidad ISO/IEC 17025.
    if (quality) {
      const q = quality;
      const push = (id: string, count: number | undefined, title: (n: number) => string, detail: string, to: string, priority: number, tone: Tone) => {
        if (!count) return;
        items.push({ id, moduleId: "calidad", glyph: "shield", tone, title: title(count), detail, to, cta: "Abrir", priority: priority + count });
      };
      push("q-review", q.overdueReview, (n) => `${n} ${n === 1 ? "documento ISO con revisión vencida" : "documentos ISO con revisión vencida"}`, q.alerts?.documentsReview?.slice(0, 2).map((d) => d.displayCode || d.code).join(" · ") || "Revisá y aprobá la nueva versión", "/calidad/documentos", 520, "warn");
      push("q-complaints", q.overdueComplaints, (n) => `${n} ${n === 1 ? "queja fuera de plazo" : "quejas fuera de plazo"}`, q.alerts?.complaints?.slice(0, 2).map((c) => `${c.number} · ${c.partyName}`).join(" · ") || "Respondé al cliente", "/calidad/registros", 650, "danger");
      push("q-nc", q.openNonConformities, (n) => `${n} ${n === 1 ? "no conformidad abierta" : "no conformidades abiertas"}`, "Seguimiento de acciones correctivas", "/calidad/registros", 480, "info");
      push("q-cal", q.calibrationsOverdue, (n) => `${n} ${n === 1 ? "equipo del laboratorio sin calibrar" : "equipos del laboratorio sin calibrar"}`, "Calibración vencida en el programa de equipos", "/calidad/registros/equipos", 620, "danger");
      push("q-auth", q.authorizationsExpiring, (n) => `${n} ${n === 1 ? "autorización de personal por vencer" : "autorizaciones de personal por vencer"}`, "Renová antes de la próxima auditoría", "/calidad/registros/personal", 450, "info");
    }

    return items.sort((a, b) => b.priority - a.priority);
  }, [receivables, invoices, cheques, quotes, purchaseOrders, products, metrology, quality, customerName]);

  const pending = agenda.filter((item) => !done.includes(item.id));
  const finished = agenda.filter((item) => done.includes(item.id));

  const toggleDone = (id: string) => {
    setDone((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(DONE_KEY(), JSON.stringify(next));
      } catch {
        // Sin almacenamiento: se pierde al recargar, nada más.
      }
      return next;
    });
  };

  // ---------- Por cobrar en las próximas 4 semanas ----------
  const forecast = useMemo(() => {
    const t0 = today0().getTime();
    const weeks = Array.from({ length: 4 }, (_, i) => ({
      label: i === 0 ? "Esta semana" : `Semana ${i + 1}`,
      from: new Date(t0 + i * 7 * DAY_MS),
      invoices: 0,
      cheques: 0
    }));
    let overdue = 0;
    receivables.forEach((inv) => {
      if (inv.isPaid) return;
      const value = toArs(inv.saldoPendiente, inv.currency, inv.exchangeRate) ?? 0;
      const due = parseDate(inv.dueDate)?.getTime() ?? t0;
      if (due < t0) {
        overdue += value;
        return;
      }
      const week = Math.floor((due - t0) / (7 * DAY_MS));
      if (week < 4) weeks[week].invoices += value;
    });
    cheques
      .filter((c) => (c.direction || "").toLowerCase() === "received" && c.status === "Available")
      .forEach((c) => {
        const due = parseDate(c.dueDateUtc)?.getTime();
        if (due === undefined) return;
        const week = Math.max(0, Math.floor((due - t0) / (7 * DAY_MS)));
        if (week < 4) weeks[week].cheques += toArs(c.amount, c.currency) ?? 0;
      });
    const total = weeks.reduce((sum, w) => sum + w.invoices + w.cheques, 0);
    const max = Math.max(1, ...weeks.map((w) => w.invoices + w.cheques));
    return { weeks, total, max, overdue };
  }, [receivables, cheques]);

  const recentInvoices = useMemo(
    () => [...authorized].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 5),
    [authorized]
  );

  const now = new Date();
  const dateLine = `${new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(now)} · semana ${isoWeek(now)}`;
  const firstName = (user?.fullName || "").split(" ")[0];

  if (loading && !updatedAt) {
    return (
      <div className="today" aria-busy="true">
        <div className="today-skeleton today-skeleton--title" />
        <div className="today-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="today-skeleton today-skeleton--card" />)}</div>
        <div className="today-skeleton today-skeleton--panel" />
      </div>
    );
  }

  return (
    <div className="today">
      <header className="today-head">
        <div className="today-head__text">
          <span className="today-eyebrow">{dateLine}</span>
          <h1>
            {greeting()}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p>
            {pending.length === 0 ? (
              agenda.length ? "Terminaste todo lo de hoy. Buen trabajo." : "No hay nada urgente hoy."
            ) : (
              <>
                Hay <strong>{pending.length} {pending.length === 1 ? "cosa" : "cosas"}</strong> que necesitan tu atención hoy.
              </>
            )}
          </p>
        </div>
        <div className="today-head__tools">
          <div className="today-segmented" role="group" aria-label="Período de los indicadores">
            {RANGES.map((r) => (
              <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" className="today-refresh" onClick={() => void refresh()} disabled={loading} aria-label="Actualizar datos" title={updatedAt ? `Actualizado ${updatedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : undefined}>
            <Icon name="clock" size={16} />
            <span>{loading ? "Actualizando…" : updatedAt ? updatedAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
          </button>
        </div>
      </header>

      {failures.length > 0 && (
        <div className="today-notice" role="status">
          No se pudieron actualizar: {failures.join(", ")}. Lo demás está al día.
        </div>
      )}

      {kpis.length > 0 && (
        <section className="today-kpis" aria-label="Indicadores del período">
          {kpis.map((k) => (
            <Link key={k.id} to={k.to} className="today-kpi" style={{ "--mod": moduleHue(k.moduleId) } as CSSProperties}>
              <span className="today-kpi__top">
                <span className="today-kpi__label">{k.label}</span>
                {k.delta && <span className={`today-pill today-pill--${k.delta.tone}`}>{k.delta.text}</span>}
              </span>
              <span className="today-kpi__value">{k.value}</span>
              {k.series ? (
                <svg className="today-kpi__spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points={`0,32 ${sparkPoints(k.series)} 100,32`} className="today-kpi__area" />
                  <polyline points={sparkPoints(k.series)} className="today-kpi__line" vectorEffect="non-scaling-stroke" />
                </svg>
              ) : (
                <span className="today-kpi__spacer" />
              )}
              <span className="today-kpi__detail">{k.detail}</span>
            </Link>
          ))}
        </section>
      )}

      <div className="today-grid">
        <section className="today-panel today-agenda" aria-labelledby="today-agenda-title">
          <div className="today-panel__head">
            <div>
              <h2 id="today-agenda-title">Tu agenda</h2>
              <p>Ordenada por impacto en la caja y por vencimiento</p>
            </div>
            {agenda.length > 0 && (
              <span className="today-counter">
                {finished.length}/{agenda.length} hechas
              </span>
            )}
          </div>
          {agenda.length === 0 ? (
            <div className="today-empty">
              <Icon name="check" size={28} />
              <strong>Todo al día</strong>
              <span>No hay cobranzas vencidas, borradores ni vencimientos próximos.</span>
            </div>
          ) : (
            <ul className="today-agenda__list">
              {[...pending, ...finished].map((item) => {
                const isDone = done.includes(item.id);
                return (
                  <li key={item.id} className={`today-task${isDone ? " today-task--done" : ""}`} style={{ "--mod": moduleHue(item.moduleId) } as CSSProperties}>
                    <button
                      type="button"
                      className="today-task__check"
                      aria-pressed={isDone}
                      aria-label={isDone ? `Marcar como pendiente: ${item.title}` : `Marcar como hecha: ${item.title}`}
                      onClick={() => toggleDone(item.id)}
                    >
                      <Icon name="check" size={13} strokeWidth={3} />
                    </button>
                    <span className={`today-task__tile today-task__tile--${item.tone}`}>
                      <Icon name={item.glyph} size={17} />
                    </span>
                    <span className="today-task__body">
                      <span className="today-task__title">{item.title}</span>
                      <span className="today-task__detail">{item.detail}</span>
                    </span>
                    {item.amount && <span className="today-task__amount">{item.amount}</span>}
                    <Link to={item.to} className="today-task__cta">
                      {item.cta}
                      <Icon name="arrowRight" size={14} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="today-side">
          {can("ventas") && (
            <section className="today-panel" aria-labelledby="today-forecast-title">
              <div className="today-panel__head">
                <div>
                  <h2 id="today-forecast-title">Por cobrar · 4 semanas</h2>
                  <p>Facturas por vencer y cheques en cartera</p>
                </div>
                <span className="today-forecast__total">{compact(forecast.total)}</span>
              </div>
              <div className="today-forecast" role="img" aria-label={`Cobranzas esperadas por semana, total ${money(forecast.total)}`}>
                {forecast.weeks.map((w) => {
                  const inv = (w.invoices / forecast.max) * 100;
                  const chq = (w.cheques / forecast.max) * 100;
                  return (
                    <div key={w.label} className="today-forecast__col" title={`${w.label}: facturas ${money(w.invoices)} · cheques ${money(w.cheques)}`}>
                      <span className="today-forecast__amount">{w.invoices + w.cheques > 0 ? compact(w.invoices + w.cheques) : "—"}</span>
                      <div className="today-forecast__bar">
                        <i className="today-forecast__seg today-forecast__seg--cheques" style={{ height: `${chq}%` }} />
                        <i className="today-forecast__seg today-forecast__seg--invoices" style={{ height: `${inv}%` }} />
                      </div>
                      <span className="today-forecast__label">{w.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="today-legend">
                <span><i className="today-legend__dot today-legend__dot--invoices" />Facturas</span>
                <span><i className="today-legend__dot today-legend__dot--cheques" />Cheques</span>
                {forecast.overdue > 0 && (
                  <Link to="/finanzas/cuenta-corriente" className="today-legend__overdue">+ {compact(forecast.overdue)} ya vencido</Link>
                )}
              </div>
            </section>
          )}

          {can("ventas") && (
            <section className="today-panel" aria-labelledby="today-recent-title">
              <div className="today-panel__head">
                <div>
                  <h2 id="today-recent-title">Últimas facturas</h2>
                  <p>Autorizadas en ARCA</p>
                </div>
                <Link to="/facturas" className="today-link">Ver todas</Link>
              </div>
              {recentInvoices.length === 0 ? (
                <div className="today-empty today-empty--small">Todavía no hay facturas autorizadas.</div>
              ) : (
                <ul className="today-recent">
                  {recentInvoices.map((inv) => (
                    <li key={inv.id}>
                      <Link to={`/facturas/${inv.id}/imprimir`}>
                        <span className="today-recent__body">
                          <span className="today-recent__number">{inv.formattedNumber || inv.invoiceNumber}</span>
                          <span className="today-recent__customer">{inv.customerName}</span>
                        </span>
                        <span className="today-recent__date">{shortDate(inv.issueDate)}</span>
                        <span className="today-recent__total">
                          {inv.currency === "ARS" ? "$" : inv.currency} {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(inv.total)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {rates && (
            <div className="today-rates">
              <span>Dólar BNA venta</span>
              <span>
                billete <strong>{money(rates.usdBillete.venta)}</strong>
              </span>
              <span>
                divisa <strong>{money(rates.usdDivisa.venta)}</strong>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
