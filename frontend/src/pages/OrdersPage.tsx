import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { label, type CustomerSummary, type Order, type OrderStatus } from "../api/types";
import { ExcelToolbar, excelDate, excelNumber } from "../components/ExcelTools";

const statuses: OrderStatus[] = [
  "Draft",
  "Confirmed",
  "InPreparation",
  "Dispatched",
  "Delivered",
  "Invoiced",
  "Cancelled"
];

function getStatusBadge(status: OrderStatus) {
  switch (status) {
    case "Confirmed":
      return <span className="badge ok">🟢 Confirmado</span>;
    case "InPreparation":
      return <span className="badge warn">🟡 En Preparación</span>;
    case "Dispatched":
      return <span className="badge" style={{ backgroundColor: "#3b82f6", color: "#fff" }}>🚚 Despachado</span>;
    case "Delivered":
      return <span className="badge" style={{ backgroundColor: "#10b981", color: "#fff" }}>✅ Entregado</span>;
    case "Invoiced":
      return <span className="badge" style={{ backgroundColor: "#8b5cf6", color: "#fff" }}>📄 Facturado</span>;
    case "Cancelled":
      return <span className="badge off">🔴 Cancelado</span>;
    case "Draft":
    default:
      return <span className="badge muted">📝 Borrador</span>;
  }
}

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [ordData, custPage] = await Promise.all([
        api.listOrders(search, statusFilter),
        api.listCustomers()
      ]);
      setOrders(ordData);
      setCustomers(custPage.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los pedidos de venta");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, statusFilter]);

  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of customers) map[c.id] = c.legalName;
    return map;
  }, [customers]);

  const kpis = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === "Confirmed" || o.status === "InPreparation").length;
    const delivered = orders.filter((o) => o.status === "Delivered" || o.status === "Invoiced").length;
    const totalArs = orders
      .filter((o) => o.status !== "Cancelled")
      .reduce((sum, o) => {
        let val = o.total;
        if (o.currency === "USD_BILLETE") val *= o.exchangeRateUsdBillete || 1;
        if (o.currency === "USD_DIVISA") val *= o.exchangeRateUsdDivisa || 1;
        return sum + val;
      }, 0);

    return { total, pending, delivered, totalArs };
  }, [orders]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pedidos de Venta</h1>
          <p className="muted">Gestión de órdenes confirmadas, preparación de entrega y remitación</p>
        </div>
        <div className="toolbar"><ExcelToolbar fileName="pedidos-venta" rows={orders} columns={[{ key: "orderNumber", header: "Número" }, { key: "customerId", header: "Cliente", value: row => customerMap[row.customerId] ?? "Cliente registrado" }, { key: "createdAtUtc", header: "Fecha", value: row => excelDate(row.createdAtUtc) }, { key: "status", header: "Estado" }, { key: "currency", header: "Moneda" }, { key: "total", header: "Total", value: row => excelNumber(row.total) }]} /><Link className="btn" to="/pedidos/nuevo">
          + Nuevo Pedido
        </Link></div>
      </div>

      <div className="kpi kpi-4">
        <div className="card">
          <span className="muted">Total Pedidos</span>
          <strong>{kpis.total}</strong>
        </div>
        <div className="card">
          <span className="muted">En Preparación / Pendientes</span>
          <strong style={{ color: "#d97706" }}>{kpis.pending}</strong>
        </div>
        <div className="card">
          <span className="muted">Entregados / Cumplidos</span>
          <strong style={{ color: "#059669" }}>{kpis.delivered}</strong>
        </div>
        <div className="card">
          <span className="muted">Monto Total Acumulado</span>
          <strong>${kpis.totalArs.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</strong>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="card pad toolbar" style={{ marginBottom: 20 }}>
        <input
          type="search"
          placeholder="Buscar por Nro. Pedido, Cotización o Notas…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 220 }}>
          <option value="">Todos los estados</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>

      <section className="card">
        {loading ? (
          <div className="pad muted">Cargando pedidos de venta…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nro. Pedido</th>
                  <th>Cliente</th>
                  <th>Cotización Origen</th>
                  <th>Estado</th>
                  <th>Moneda / Total</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/pedidos/${o.id}`}>
                        <strong>{o.orderNumber}</strong>
                      </Link>
                    </td>
                    <td>{customerMap[o.customerId] ?? "Cliente registrado"}</td>
                    <td>{o.quoteNumber ? <span className="badge muted">📄 {o.quoteNumber}</span> : "—"}</td>
                    <td>{getStatusBadge(o.status)}</td>
                    <td>
                      <strong>
                        {o.currency === "ARS" ? "ARS $" : "USD $"}
                        {o.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </strong>
                    </td>
                    <td>{new Date(o.createdAtUtc).toLocaleDateString("es-AR")}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="btn ghost" to={`/pedidos/${o.id}`} style={{ padding: "4px 10px", fontSize: "0.82rem" }}>
                        Ver Ficha ➔
                      </Link>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 32 }}>
                      No se encontraron pedidos de venta cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
