import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { ExchangeRates, Invoice, Order, Product, PurchaseOrder, Quote } from "../api/types";
import "./executiveDashboardV2.css";

type Range = "today" | "week" | "month" | "quarter" | "year";
type Collection = Awaited<ReturnType<typeof api.listCollectionReceipts>>[number];
type WidgetId = "revenue" | "pipeline" | "catalog" | "stock" | "invoices" | "actions";

const WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "revenue", label: "Facturación y cobranzas" },
  { id: "pipeline", label: "Embudo comercial" },
  { id: "catalog", label: "Composición del catálogo" },
  { id: "stock", label: "Alertas de stock" },
  { id: "invoices", label: "Últimos comprobantes" },
  { id: "actions", label: "Accesos rápidos" }
];

const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Hoy" }, { id: "week", label: "7 días" },
  { id: "month", label: "Mes" }, { id: "quarter", label: "Trimestre" }, { id: "year", label: "Año" }
];

const money = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value);
const compactMoney = (value: number) => new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const day = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
const amountArs = (amount: number, currency: string, rate?: number) => {
  if (currency === "ARS" || !currency) return amount;
  if (currency.startsWith("USD") && rate && rate > 0) return amount * rate;
  return null;
};

function parseDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
}

function startFor(range: Range) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (range === "week") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(1);
  if (range === "quarter") start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  if (range === "year") start.setMonth(0, 1);
  return start;
}

function inPeriod(value: string | null | undefined, start: Date) {
  if (!value) return false;
  const date = parseDate(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= new Date();
}

function Kpi({ label, value, detail, tone, to }: { label: string; value: string; detail: string; tone: string; to: string }) {
  return <Link className={`ed-kpi ed-kpi--${tone}`} to={to}>
    <span className="ed-kpi__label">{label}</span><strong>{value}</strong><small>{detail}</small><span className="ed-kpi__arrow" aria-hidden="true">↗</span>
  </Link>;
}

export function ExecutiveDashboardV2() {
  const [range, setRange] = useState<Range>("month");
  const [visible, setVisible] = useState<WidgetId[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("leal_executive_dashboard_v2") || "null");
      if (Array.isArray(saved)) return WIDGETS.map((w) => w.id).filter((id) => saved.includes(id));
      const previous = JSON.parse(localStorage.getItem("leal_executive_dashboard_config") || "null");
      if (Array.isArray(previous)) {
        const oldIds: Record<WidgetId, string> = { revenue: "chart_revenue", pipeline: "kpi_billing", catalog: "chart_types", stock: "table_critical_stock", invoices: "table_recent_invoices", actions: "widget_quick_actions" };
        return WIDGETS.map((w) => w.id).filter((id) => previous.find((item: { id: string; visible: boolean }) => item.id === oldIds[id])?.visible !== false);
      }
    } catch { /* browser storage can be unavailable */ }
    return WIDGETS.map((w) => w.id);
  });
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  async function refresh() {
    setLoading(true);
    const sources = [
      { name: "facturas", request: api.listInvoices() },
      { name: "cobranzas", request: api.listCollectionReceipts() },
      { name: "presupuestos", request: api.listQuotes() },
      { name: "pedidos", request: api.listOrders() },
      { name: "productos", request: api.listProducts() },
      { name: "compras", request: api.listPurchaseOrders() },
      { name: "cotizaciones", request: api.getExchangeRates() }
    ];
    const results = await Promise.allSettled(sources.map((source) => source.request));
    const [invoiceResult, collectionResult, quoteResult, orderResult, productResult, purchaseResult, rateResult] = results;
    setFailures(sources.filter((_, index) => results[index].status === "rejected").map((source) => source.name));
    if (invoiceResult.status === "fulfilled") setInvoices(invoiceResult.value as Invoice[]);
    if (collectionResult.status === "fulfilled") setCollections(collectionResult.value as Collection[]);
    if (quoteResult.status === "fulfilled") setQuotes(quoteResult.value as Quote[]);
    if (orderResult.status === "fulfilled") setOrders(orderResult.value as Order[]);
    if (productResult.status === "fulfilled") setProducts(productResult.value as Product[]);
    if (purchaseResult.status === "fulfilled") setPurchaseOrders(purchaseResult.value as PurchaseOrder[]);
    if (rateResult.status === "fulfilled") setRates(rateResult.value as ExchangeRates);
    setLastUpdated(new Date());
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  function toggle(id: WidgetId) {
    const next = visible.includes(id) ? visible.filter((item) => item !== id) : [...visible, id];
    setVisible(next);
    try { localStorage.setItem("leal_executive_dashboard_v2", JSON.stringify(next)); } catch { /* ignore */ }
  }

  const start = useMemo(() => startFor(range), [range, lastUpdated]);
  const periodInvoices = useMemo(() => invoices.filter((inv) => inv.status === "Authorized" && inv.invoiceType !== "Proforma" && inPeriod(inv.issueDate, start)), [invoices, start]);
  const periodCollections = useMemo(() => collections.filter((receipt) => !["voided", "cancelled", "anulado"].includes(receipt.status.toLowerCase()) && inPeriod(receipt.receiptDateUtc, start)), [collections, start]);
  const periodQuotes = useMemo(() => quotes.filter((quote) => inPeriod(quote.createdAtUtc, start)), [quotes, start]);
  const periodOrders = useMemo(() => orders.filter((order) => inPeriod(order.createdAtUtc, start)), [orders, start]);
  const periodPurchases = useMemo(() => purchaseOrders.filter((order) => inPeriod(order.issueDate, start)), [purchaseOrders, start]);
  const critical = useMemo(() => products.filter((p) => p.trackStock && (p.stock < 0 || (p.minStock > 0 && p.stock <= p.minStock))).sort((a, b) => (a.stock - a.minStock) - (b.stock - b.minStock)), [products]);

  const figures = useMemo(() => {
    let billed = 0; let collected = 0; let excluded = 0;
    periodInvoices.forEach((inv) => {
      const converted = amountArs(inv.total, inv.currency, inv.exchangeRate);
      if (converted === null) { excluded++; return; }
      billed += inv.invoiceType.startsWith("NC") ? -Math.abs(converted) : converted;
    });
    periodCollections.forEach((receipt) => {
      const converted = amountArs(receipt.amount, receipt.currency);
      if (converted === null) { excluded++; return; }
      collected += converted;
    });
    return { billed, collected, excluded };
  }, [periodInvoices, periodCollections]);

  const buckets = useMemo(() => {
    const now = new Date();
    const span = Math.max(1, now.getTime() - start.getTime() + 1);
    const result = Array.from({ length: 6 }, (_, index) => {
      const timestamp = start.getTime() + span * (index + 0.5) / 6;
      const date = new Date(timestamp);
      return { label: range === "today" ? `${date.getHours().toString().padStart(2, "0")} h` : new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(date), billed: 0, collected: 0 };
    });
    function indexFor(value: string) {
      return Math.max(0, Math.min(5, Math.floor((parseDate(value).getTime() - start.getTime()) / span * 6)));
    }
    periodInvoices.forEach((inv) => {
      const value = amountArs(inv.total, inv.currency, inv.exchangeRate);
      if (value !== null) result[indexFor(inv.issueDate)].billed += inv.invoiceType.startsWith("NC") ? -Math.abs(value) : value;
    });
    periodCollections.forEach((receipt) => {
      const value = amountArs(receipt.amount, receipt.currency);
      if (value !== null) result[indexFor(receipt.receiptDateUtc)].collected += value;
    });
    return result;
  }, [periodInvoices, periodCollections, range, start]);

  const chartMax = Math.max(1, ...buckets.flatMap((item) => [Math.abs(item.billed), Math.abs(item.collected)]));
  const pipeline = [
    { label: "Presupuestos", value: periodQuotes.length, color: "blue", to: "/presupuestos" },
    { label: "Pedidos", value: periodOrders.length, color: "violet", to: "/pedidos" },
    { label: "Facturas autorizadas", value: periodInvoices.length, color: "teal", to: "/facturas" }
  ];
  const maxPipeline = Math.max(1, ...pipeline.map((item) => item.value));
  const catalog = [
    { label: "Productos", value: products.filter((p) => !["Service", "SparePart", "Kit"].includes(p.type)).length, color: "blue" },
    { label: "Servicios", value: products.filter((p) => p.type === "Service").length, color: "teal" },
    { label: "Repuestos", value: products.filter((p) => p.type === "SparePart").length, color: "amber" },
    { label: "Kits", value: products.filter((p) => p.type === "Kit").length, color: "violet" }
  ];
  const catalogTotal = products.length;
  const openOrders = periodOrders.filter((order) => !["Delivered", "Invoiced", "Cancelled"].includes(order.status)).length;
  const pendingPurchases = periodPurchases.filter((order) => !["Received", "Cancelled"].includes(order.status)).length;
  const recentInvoices = [...periodInvoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 5);

  if (loading && !lastUpdated) return <main className="workspace-page page-wide executive-dashboard"><div className="ed-loading" role="status">Cargando indicadores y movimientos…</div></main>;

  return <main className="workspace-page page-wide executive-dashboard">
    <div className="ed-hero">
      <div><span className="ed-eyebrow">PANEL EJECUTIVO</span><h1>Tu negocio, de un vistazo</h1><p>Ventas y cobros del período; stock y catálogo en su estado actual.</p></div>
      <div className="ed-hero__meta"><span>{lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "Cargando datos"}</span><button type="button" className="ed-refresh" onClick={() => void refresh()} disabled={loading}>{loading ? "Actualizando…" : "↻ Actualizar"}</button></div>
    </div>

    <div className="ed-toolbar"><div className="ed-period" role="group" aria-label="Período del tablero">{RANGES.map((item) => <button key={item.id} type="button" aria-pressed={range === item.id} className={range === item.id ? "active" : ""} onClick={() => setRange(item.id)}>{item.label}</button>)}</div><button type="button" className="ed-customize" onClick={() => setShowSettings(true)}>⚙ Personalizar</button></div>
    {failures.length > 0 && <div className="ed-warning" role="status">No se pudieron actualizar: {failures.join(", ")}. Esas secciones pueden mostrar datos anteriores; probá «Actualizar».</div>}
    {figures.excluded > 0 && <div className="ed-note" role="status">Los importes muestran ARS. Se excluyeron {figures.excluded} movimientos en otra moneda sin tipo de cambio registrado.</div>}

    <section className="ed-kpis" aria-label="Indicadores principales">
      <Kpi label="Facturación autorizada" value={`$ ${compactMoney(figures.billed)}`} detail={`${periodInvoices.length} comprobantes del período`} tone="blue" to="/facturas" />
      <Kpi label="Cobranzas registradas" value={`$ ${compactMoney(figures.collected)}`} detail={`${periodCollections.length} recibos del período`} tone="teal" to="/finanzas/cobranzas" />
      <Kpi label="Pedidos abiertos" value={String(openOrders)} detail="Creados en el período, aún en curso" tone="violet" to="/pedidos" />
      <Kpi label="Stock para revisar" value={String(critical.length)} detail="Artículos bajo el mínimo configurado" tone="amber" to="/inventario" />
    </section>

    <div className="ed-layout">
      {visible.includes("revenue") && <section className="ed-panel ed-panel--wide"><div className="ed-panel__head"><div><span className="ed-eyebrow">EVOLUCIÓN</span><h2>Facturación y cobranzas</h2><p>Importes reales en pesos, agrupados dentro del período.</p></div><div className="ed-legend"><span><i className="blue" />Facturado</span><span><i className="teal" />Cobrado</span></div></div>
        {buckets.every((bucket) => bucket.billed === 0 && bucket.collected === 0) ? <div className="ed-empty">Todavía no hay facturas autorizadas ni cobranzas en este período.</div> : <div className="ed-chart" role="img" aria-label="Gráfico de facturación y cobranzas por intervalo">{buckets.map((bucket, index) => <div className="ed-chart__group" key={index}><div className="ed-chart__bars"><div className={`ed-chart__bar ${bucket.billed < 0 ? "ed-chart__bar--negative" : "ed-chart__bar--blue"}`} style={{ height: `${bucket.billed === 0 ? 0 : Math.max(2, Math.abs(bucket.billed) / chartMax * 100)}%` }} title={`Facturado ${bucket.label}: $ ${money(bucket.billed)}`} /><div className="ed-chart__bar ed-chart__bar--teal" style={{ height: `${bucket.collected === 0 ? 0 : Math.max(2, Math.abs(bucket.collected) / chartMax * 100)}%` }} title={`Cobrado ${bucket.label}: $ ${money(bucket.collected)}`} /></div><span>{bucket.label}</span></div>)}</div>}
        <div className="ed-chart__summary"><span>Facturado <strong>$ {money(figures.billed)}</strong></span><span>Cobrado <strong>$ {money(figures.collected)}</strong></span></div>
      </section>}

      {visible.includes("pipeline") && <section className="ed-panel"><div className="ed-panel__head"><div><span className="ed-eyebrow">COMERCIAL</span><h2>Flujo de actividad</h2><p>Registros creados durante el período.</p></div></div><div className="ed-funnel">{pipeline.map((item) => <Link key={item.label} to={item.to} className="ed-funnel__row"><span>{item.label}</span><strong>{item.value}</strong><div className="ed-funnel__track"><i className={item.color} style={{ width: `${item.value ? Math.max(8, item.value / maxPipeline * 100) : 0}%` }} /></div></Link>)}</div><p className="ed-panel__hint">Los pasos no representan una conversión directa entre los mismos registros.</p></section>}

      {visible.includes("catalog") && <section className="ed-panel"><div className="ed-panel__head"><div><span className="ed-eyebrow">CATÁLOGO</span><h2>Composición de la oferta</h2><p>{catalogTotal} artículos y servicios registrados.</p></div></div>{catalogTotal === 0 ? <div className="ed-empty">El catálogo todavía está vacío.</div> : <><div className="ed-mix" role="img" aria-label="Distribución de productos por tipo">{catalog.map((item) => <i key={item.label} className={item.color} style={{ width: `${item.value / catalogTotal * 100}%` }} />)}</div><div className="ed-mix__legend">{catalog.map((item) => <div key={item.label}><i className={item.color} /><span>{item.label}</span><strong>{item.value}</strong></div>)}</div></>}</section>}

      {visible.includes("stock") && <section className="ed-panel"><div className="ed-panel__head"><div><span className="ed-eyebrow">ATENCIÓN</span><h2>Stock para reponer</h2><p>{critical.length ? "Artículos que alcanzaron su mínimo." : "Sin alertas con mínimo configurado."}</p></div><Link to="/inventario">Ver inventario →</Link></div>{critical.length === 0 ? <div className="ed-empty">No hay artículos por debajo del mínimo configurado.</div> : <div className="ed-alerts">{critical.slice(0, 5).map((product) => <div key={product.id}><span className="ed-alerts__dot" /><div><strong>{product.name}</strong><small>{product.code || "Sin código"}</small></div><span>{product.stock} / {product.minStock} {product.baseUnit}</span></div>)}</div>}</section>}

      {visible.includes("invoices") && <section className="ed-panel"><div className="ed-panel__head"><div><span className="ed-eyebrow">MOVIMIENTO</span><h2>Últimos comprobantes</h2><p>Facturas autorizadas del período.</p></div><Link to="/facturas">Ver todas →</Link></div>{recentInvoices.length === 0 ? <div className="ed-empty">No hay comprobantes autorizados en este período.</div> : <div className="ed-invoices">{recentInvoices.map((invoice) => <Link to={`/facturas/${invoice.id}/imprimir`} key={invoice.id}><div><strong>{invoice.formattedNumber || invoice.invoiceNumber}</strong><small>{invoice.customerName || "Cliente"}</small></div><span>{day(invoice.issueDate)}</span><b>{invoice.currency === "ARS" ? "$" : invoice.currency} {money(invoice.total)}</b></Link>)}</div>}</section>}

      {visible.includes("actions") && <section className="ed-panel ed-panel--actions"><div className="ed-panel__head"><div><span className="ed-eyebrow">OPERACIÓN</span><h2>Continuar trabajando</h2><p>{pendingPurchases} órdenes de compra pendientes en el período.</p></div></div><div className="ed-actions"><Link to="/presupuestos/nuevo">+ Nuevo presupuesto</Link><Link to="/facturas/nueva">+ Nueva factura</Link><Link to="/remitos/nuevo">+ Nuevo remito</Link><Link to="/compras/ordenes/nueva">+ Orden de compra</Link></div></section>}
    </div>

    {rates && <div className="ed-rates"><span>Cotizaciones de referencia</span><strong>USD billete venta $ {money(rates.usdBillete.venta)}</strong><strong>USD divisa venta $ {money(rates.usdDivisa.venta)}</strong><small>{rates.fetchedAtUtc ? `Actualizadas ${day(rates.fetchedAtUtc)}` : ""}</small></div>}

    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><div className="modal-card pad ed-settings" role="dialog" aria-modal="true" aria-label="Personalizar tablero" onClick={(event) => event.stopPropagation()}><div className="ed-panel__head"><h2>Personalizar tablero</h2><button type="button" onClick={() => setShowSettings(false)} aria-label="Cerrar">×</button></div><p>Elegí qué secciones querés ver. Se guarda en este navegador.</p>{WIDGETS.map((widget) => <label key={widget.id}><input type="checkbox" checked={visible.includes(widget.id)} onChange={() => toggle(widget.id)} />{widget.label}</label>)}<button type="button" className="btn" onClick={() => setShowSettings(false)}>Listo</button></div></div>}
  </main>;
}
