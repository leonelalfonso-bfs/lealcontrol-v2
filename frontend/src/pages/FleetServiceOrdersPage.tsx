import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ServiceOrder } from "../api/types";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { rangeText, serviceOrderStatusBadge, serviceOrderStatusLabel } from "../lib/fleet";

const FILTERS = [
  { value: "open", label: "Abiertas" },
  { value: "Pending", label: "Sin fecha" },
  { value: "Scheduled", label: "Programadas" },
  { value: "InProgress", label: "En curso" },
  { value: "Completed", label: "Terminadas" },
  { value: "", label: "Todas" }
];

/** Flota → Órdenes de servicio: trabajos en el cliente con técnicos y unidades. */
export function FleetServiceOrdersPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [orders, setOrders] = useState<ServiceOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listServiceOrders({ status, search: debounced.trim() || undefined }).then(setOrders).catch((e: Error) => setError(e.message));
  }, [status, debounced]);

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA</span>
          <h1>Órdenes de servicio</h1>
          <p className="muted">Cada trabajo en el cliente con fecha, técnicos y unidades. No deja asignar a nadie ni nada vencido, en taller u ocupado.</p>
        </div>
        <div className="toolbar">
          <Link to="/flota/agenda" className="btn btn-outline">Agenda</Link>
          <Link to="/flota/ordenes/nueva" className="btn">+ Nueva orden</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <section className="card pad" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "1 1 260px" }}>Buscar
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Número, cliente, pedido o trabajo" />
          </label>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button key={f.value} type="button" className={`btn compact ${status === f.value ? "" : "btn-outline"}`} onClick={() => setStatus(f.value)}>{f.label}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="card pad">
        {!orders ? <p className="muted" style={{ margin: 0 }}>Cargando…</p> : orders.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No hay órdenes. Creá una con "+ Nueva orden" o desde un pedido sin coordinar en la Agenda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Orden</th><th>Cliente</th><th>Cuándo</th><th>Técnicos y unidades</th><th>Estado</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/flota/ordenes/${o.id}`)}>
                    <td>
                      <strong>{o.code}</strong>
                      {o.salesOrderNumber && <div className="muted" style={{ fontSize: "0.75rem" }}>pedido {o.salesOrderNumber}</div>}
                    </td>
                    <td>
                      {o.customerName}
                      <div className="muted" style={{ fontSize: "0.75rem" }}>{o.description.length > 70 ? `${o.description.slice(0, 70)}…` : o.description}</div>
                    </td>
                    <td>{rangeText(o.start, o.end)}</td>
                    <td>
                      {[...o.people.map((p) => p.label), ...o.vehicles.map((v) => v.label)].join(" · ") || <span className="muted">—</span>}
                    </td>
                    <td>
                      <span className={`badge ${serviceOrderStatusBadge[o.status]}`}>{serviceOrderStatusLabel(o.status)}</span>
                      {o.problems.length > 0 && <div><span className="badge prio-high" title={o.problems.join("\n")}>⚠ {o.problems.length} problema{o.problems.length > 1 ? "s" : ""}</span></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
