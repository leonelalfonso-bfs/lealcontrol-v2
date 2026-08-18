import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { ProductionExecutionEntry, ProductionOrder, Product } from "../api/types";

const states = ["Borrador", "Planificada", "Liberada", "En proceso", "Pausada", "Completada", "Cancelada"];
const movements = ["Consumo", "Devolución", "Merma", "Producción"];

export function ProductionReportsPage() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [entries, setEntries] = useState<ProductionExecutionEntry[]>([]);
  useEffect(() => { void Promise.all([api.listProductionOrders(), api.listProducts("", "Product", "", true)]).then(([o, p]) => { setOrders(o); setProducts(p); }); }, []);
  useEffect(() => { if (orders.length) void Promise.all(orders.map(o => api.listProductionExecutions(o.id))).then(g => setEntries(g.flat())); }, [orders]);
  const totals = useMemo(() => ({ planned: orders.reduce((n, o) => n + o.plannedQuantity, 0), produced: orders.reduce((n, o) => n + o.producedQuantity, 0), scrap: orders.reduce((n, o) => n + o.scrappedQuantity, 0), active: orders.filter(o => o.status === 3).length }), [orders]);
  const name = (id: string) => products.find(p => p.id === id)?.name || id;
  return <div className="production-page page-wide"><div className="page-head"><div><span className="eyebrow">PRODUCCIÓN · REPORTES</span><h1>Reportes de fabricación</h1><p className="muted">Órdenes, avances y movimientos registrados.</p></div><Link className="btn btn-outline" to="/produccion">← Maestro</Link></div><div className="kpi kpi-4"><div className="card"><span className="muted">Órdenes</span><strong>{orders.length}</strong></div><div className="card"><span className="muted">Planificado</span><strong>{totals.planned}</strong></div><div className="card"><span className="muted">Producido</span><strong>{totals.produced}</strong></div><div className="card"><span className="muted">En proceso</span><strong>{totals.active}</strong></div></div><section className="card pad"><h2>Órdenes</h2>{orders.length === 0 ? <p className="muted">No hay órdenes registradas.</p> : <div className="table-wrap"><table><thead><tr><th>Orden</th><th>Producto</th><th>Planificado</th><th>Producido</th><th>Merma</th><th>Estado</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td><Link to={`/produccion/ordenes/${o.id}`}>{o.number}</Link></td><td>{name(o.productId)}</td><td>{o.plannedQuantity} {o.unit}</td><td>{o.producedQuantity} {o.unit}</td><td>{o.scrappedQuantity} {o.unit}</td><td>{states[o.status] || "-"}</td></tr>)}</tbody></table></div>}</section><section className="card pad"><h2>Movimientos de planta</h2>{entries.length === 0 ? <p className="muted">Los movimientos aparecerán al ejecutar una orden.</p> : <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cantidad</th><th>Lote / serie</th></tr></thead><tbody>{entries.slice().sort((a,b) => b.createdAtUtc.localeCompare(a.createdAtUtc)).map(e => <tr key={e.id}><td>{new Date(e.createdAtUtc).toLocaleString()}</td><td>{movements[e.type] || "Movimiento"}</td><td>{name(e.productId)}</td><td>{e.quantity} {e.unit}</td><td>{e.lotNumber || e.serialNumbers || "-"}</td></tr>)}</tbody></table></div>}</section></div>;
}
