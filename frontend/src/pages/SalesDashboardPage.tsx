import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CustomerSummary, Invoice, Order, Quote } from "../api/types";

const ORDER_STATUS_LABEL: Record<string, string> = {
  Draft: "Borrador",
  Confirmed: "Confirmado",
  InPreparation: "En preparación",
  Dispatched: "Despachado",
  Delivered: "Entregado",
  Invoiced: "Facturado",
  Cancelled: "Cancelado"
};

const ORDER_STATUS_TONE: Record<string, string> = {
  Draft: "info",
  Confirmed: "ok",
  InPreparation: "warn",
  Dispatched: "info",
  Delivered: "warn"
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  Draft: "Borrador",
  PendingArca: "Pendiente ARCA",
  Rejected: "Rechazada ARCA",
  Authorized: "Autorizada",
  Voided: "Anulada",
  Cancelled: "Cancelada"
};

function currencyLabel(currency?: string | null) {
  if (!currency || currency === "ARS") return "$";
  if (currency.startsWith("USD")) return "USD";
  return currency;
}

function formatAmount(amount?: number | null, currency?: string | null) {
  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) return null;
  return `${currencyLabel(currency)} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysBetween(fromIso: string, nowMs: number) {
  const ms = Date.parse(fromIso);
  if (Number.isNaN(ms)) return 0;
  return Math.floor((nowMs - ms) / 86_400_000);
}

function quoteExpiryDays(q: Quote, nowMs: number) {
  const base = q.revisionDateUtc || q.updatedAtUtc || q.createdAtUtc;
  const baseMs = Date.parse(base);
  if (Number.isNaN(baseMs)) return null;
  const expiryMs = baseMs + (q.validDays || 15) * 86_400_000;
  return Math.ceil((expiryMs - nowMs) / 86_400_000);
}

export function SalesDashboardPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.listQuotes(),
      api.listOrders(),
      api.listInvoices(),
      api.listAllCustomers("").catch(() => [] as CustomerSummary[])
    ])
      .then(([q, o, inv, custs]) => {
        if (cancelled) return;
        setQuotes(q || []);
        setOrders(o || []);
        setInvoices(inv || []);
        setCustomers(new Map((custs || []).map((c) => [c.id, c.tradeName || c.legalName])));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo cargar el tablero de Ventas.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nowMs = Date.now();
  const customerName = (customerId: string) => customers.get(customerId) || "Cliente";

  // 1. Presupuestos aceptados listos para generar pedido de venta
  const readyToOrderQuotes = useMemo(
    () =>
      quotes
        .filter((q) => q.status === "Accepted")
        .sort((a, b) => Date.parse(a.updatedAtUtc) - Date.parse(b.updatedAtUtc)),
    [quotes]
  );

  // 2. Presupuestos que requieren atención: vencidos, por vencer (<= 3 días), borradores sin enviar, enviados sin respuesta (>= 5 días)
  const quotesNeedingAttention = useMemo(() => {
    type Item = {
      quote: Quote;
      priority: number;
      badge: string;
      tone: string;
      reason: string;
    };
    const list: Item[] = [];
    for (const q of quotes) {
      if (q.status === "Draft") {
        const age = Math.max(0, daysBetween(q.updatedAtUtc || q.createdAtUtc, nowMs));
        list.push({
          quote: q,
          priority: 2,
          badge: "Borrador",
          tone: "info",
          reason: age === 0 ? "Armado hoy, sin enviar" : `Sin enviar hace ${age} día${age === 1 ? "" : "s"}`
        });
        continue;
      }
      if (q.status === "Sent") {
        const daysLeft = quoteExpiryDays(q, nowMs);
        if (daysLeft !== null && daysLeft < 0) {
          list.push({
            quote: q,
            priority: 0,
            badge: "Vencido",
            tone: "danger",
            reason: `Venció hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) === 1 ? "" : "s"}`
          });
        } else if (daysLeft !== null && daysLeft <= 3) {
          list.push({
            quote: q,
            priority: 1,
            badge: daysLeft === 0 ? "Vence hoy" : `Vence en ${daysLeft}d`,
            tone: "warn",
            reason: "Conviene hacer seguimiento antes de que venza"
          });
        } else {
          const sentDays = daysBetween(q.revisionDateUtc || q.updatedAtUtc || q.createdAtUtc, nowMs);
          if (sentDays >= 5) {
            list.push({
              quote: q,
              priority: 3,
              badge: `Sin respuesta (${sentDays}d)`,
              tone: "warn",
              reason: `Enviado hace ${sentDays} días sin confirmación`
            });
          }
        }
      }
    }
    return list.sort((a, b) => a.priority - b.priority || Date.parse(a.quote.updatedAtUtc) - Date.parse(b.quote.updatedAtUtc));
  }, [quotes, nowMs]);

  // 3. Pedidos en curso (todavía no facturados ni cancelados)
  const activeOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status !== "Invoiced" && o.status !== "Cancelled")
        .sort((a, b) => Date.parse(a.createdAtUtc) - Date.parse(b.createdAtUtc)),
    [orders]
  );

  // 4. Facturas en borrador o pendientes / rechazadas por ARCA
  const pendingInvoices = useMemo(
    () =>
      invoices
        .filter((i) => i.status !== "Authorized" && i.status !== "Voided" && i.status !== "Cancelled")
        .sort((a, b) => Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc)),
    [invoices]
  );

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">VENTAS · CENTRO DE CONTROL</span>
          <h1>Ventas</h1>
          <p className="muted">Confirmaciones listas para pedir, presupuestos en seguimiento, pedidos en curso y facturación pendiente.</p>
        </div>
        <div className="toolbar">
          <Link className="btn btn-outline" to="/presupuestos/nuevo">+ Presupuesto</Link>
          <Link className="btn btn-outline" to="/pedidos/nuevo">+ Pedido</Link>
          <Link className="btn" to="/facturas/nueva">+ Factura</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="kpi kpi-4">
        <Link className="card" to="/presupuestos" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="muted">Confirmados para pedir</span>
          <strong>{loading ? "…" : readyToOrderQuotes.length}</strong>
        </Link>
        <Link className="card" to="/presupuestos" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="muted">Presupuestos a seguir</span>
          <strong>{loading ? "…" : quotesNeedingAttention.length}</strong>
        </Link>
        <Link className="card" to="/pedidos" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="muted">Pedidos en curso</span>
          <strong>{loading ? "…" : activeOrders.length}</strong>
        </Link>
        <Link className="card" to="/facturas" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="muted">Facturas sin autorizar</span>
          <strong>{loading ? "…" : pendingInvoices.length}</strong>
        </Link>
      </div>

      {readyToOrderQuotes.length > 0 && (
        <section className="card pad" style={{ marginBottom: 18 }}>
          <div className="section-head">
            <div>
              <h2>Listos para generar pedido de venta ({readyToOrderQuotes.length})</h2>
              <p className="muted">Presupuestos aceptados por el cliente que todavía no tienen pedido generado.</p>
            </div>
            <Link className="btn btn-outline compact" to="/presupuestos">Ver presupuestos →</Link>
          </div>
          {readyToOrderQuotes.slice(0, 8).map((q) => {
            const amount = formatAmount(q.total, q.currency);
            return (
              <Link
                className="production-setup-row"
                key={q.id}
                to={`/presupuestos?convertQuoteId=${q.id}`}
              >
                <span>
                  <strong>{q.quoteNumber} (Rev. {q.revision})</strong> · {customerName(q.customerId)}
                  <small>{amount ? `${amount} · ` : ""}Aceptado — clic para generar el pedido</small>
                </span>
                <span className="badge ok">→ Generar pedido</span>
              </Link>
            );
          })}
        </section>
      )}

      <div className="split">
        <section className="card pad">
          <div className="section-head">
            <div>
              <h2>Presupuestos que requieren atención</h2>
              <p className="muted">Vencidos, por vencer, borradores sin enviar y enviados sin respuesta.</p>
            </div>
            <Link className="btn btn-outline compact" to="/presupuestos">Todos →</Link>
          </div>
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : quotesNeedingAttention.length === 0 ? (
            <p className="muted">No hay presupuestos pendientes de seguimiento. ¡Al día!</p>
          ) : (
            quotesNeedingAttention.slice(0, 10).map(({ quote: q, badge, tone, reason }) => {
              const amount = formatAmount(q.total, q.currency);
              return (
                <Link className="production-setup-row" key={q.id} to={`/presupuestos/${q.id}/editar`}>
                  <span>
                    <strong>{q.quoteNumber} (Rev. {q.revision})</strong> · {customerName(q.customerId)}
                    <small>{reason}{amount ? ` · ${amount}` : ""}</small>
                  </span>
                  <span className={`badge ${tone}`}>{badge}</span>
                </Link>
              );
            })
          )}
        </section>

        <section className="card pad">
          <div className="section-head">
            <div>
              <h2>Pedidos en curso y facturación</h2>
              <p className="muted">Pedidos pendientes de entrega/factura y comprobantes sin autorizar en ARCA.</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Link className="btn btn-outline compact" to="/pedidos">Pedidos →</Link>
              <Link className="btn btn-outline compact" to="/facturas">Facturas →</Link>
            </div>
          </div>

          {loading ? (
            <p className="muted">Cargando…</p>
          ) : activeOrders.length === 0 && pendingInvoices.length === 0 ? (
            <p className="muted">No hay pedidos ni facturas pendientes.</p>
          ) : (
            <>
              {pendingInvoices.slice(0, 5).map((inv) => {
                const amount = formatAmount(inv.total, inv.currency);
                return (
                  <Link className="production-setup-row" key={inv.id} to={`/facturas/${inv.id}/imprimir`}>
                    <span>
                      <strong>{inv.formattedNumber || `Factura ${inv.invoiceType}`}</strong> · {inv.customerName}
                      <small>Facturación ARCA{amount ? ` · ${amount}` : ""}</small>
                    </span>
                    <span className={`badge ${inv.status === "Rejected" ? "danger" : "warn"}`}>
                      {INVOICE_STATUS_LABEL[inv.status] || inv.status}
                    </span>
                  </Link>
                );
              })}
              {activeOrders.slice(0, 8).map((o) => {
                const amount = formatAmount(o.total, o.currency);
                const age = Math.max(0, daysBetween(o.createdAtUtc, nowMs));
                return (
                  <Link className="production-setup-row" key={o.id} to={`/pedidos/${o.id}`}>
                    <span>
                      <strong>{o.orderNumber}</strong> · {customerName(o.customerId)}
                      <small>
                        {o.quoteNumber ? `Desde ${o.quoteNumber} · ` : ""}
                        {age === 0 ? "Creado hoy" : `Hace ${age} día${age === 1 ? "" : "s"}`}
                        {amount ? ` · ${amount}` : ""}
                      </small>
                    </span>
                    <span className={`badge ${ORDER_STATUS_TONE[o.status] || ""}`}>
                      {ORDER_STATUS_LABEL[o.status] || o.status}
                    </span>
                  </Link>
                );
              })}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
