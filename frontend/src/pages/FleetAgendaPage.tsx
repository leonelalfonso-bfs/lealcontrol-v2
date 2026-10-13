import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { FleetAgenda, ServiceOrder } from "../api/types";
import { todayAr } from "../lib/dates";
import { arDay, arTime, civilDate, serviceOrderStatusBadge, serviceOrderStatusLabel } from "../lib/fleet";

const DAY_NAMES = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** Suma días a una fecha civil "aaaa-mm-dd" (sin husos). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Lunes de la semana de una fecha civil. */
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(iso, -weekday);
}

/** Flota → Agenda: la semana con órdenes, vencimientos y taller; órdenes sin fecha y pedidos sin coordinar. */
export function FleetAgendaPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(() => mondayOf(todayAr()));
  const [data, setData] = useState<FleetAgenda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayAr();

  useEffect(() => {
    setError(null);
    api.getFleetAgenda(from, 7).then(setData).catch((e: Error) => setError(e.message));
  }, [from]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const ordersOn = (day: string) =>
    (data?.orders ?? []).filter((o) => o.start && o.end && arDay(o.start) <= day && arDay(o.end) >= day);

  const orderCard = (o: ServiceOrder, day: string) => (
    <button key={o.id} type="button" onClick={() => navigate(`/flota/ordenes/${o.id}`)} className="card"
      style={{ display: "block", width: "100%", textAlign: "left", padding: 8, marginBottom: 6, cursor: "pointer",
        borderLeft: `4px solid ${o.problems.length ? "#dc2626" : o.status === "Completed" ? "#16a34a" : "#0369a1"}` }}>
      <div style={{ fontSize: "0.75rem" }} className="muted">
        {arDay(o.start!) === day ? arTime(o.start) : "…"}–{arDay(o.end!) === day ? arTime(o.end) : "…"} · {o.code}
      </div>
      <strong style={{ fontSize: "0.85rem" }}>{o.customerName}</strong>
      <div style={{ fontSize: "0.75rem" }}>{[...o.people.map((p) => p.label), ...o.vehicles.map((v) => v.label)].join(" · ")}</div>
      {o.status !== "Scheduled" && <span className={`badge ${serviceOrderStatusBadge[o.status]}`} style={{ fontSize: "0.7rem" }}>{serviceOrderStatusLabel(o.status)}</span>}
      {o.problems.length > 0 && <div style={{ color: "#b91c1c", fontSize: "0.72rem" }} title={o.problems.join("\n")}>⚠ {o.problems[0]}</div>}
    </button>
  );

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA</span>
          <h1>Agenda</h1>
          <p className="muted">{civilDate(from)} al {civilDate(addDays(from, 6))}</p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn-outline" onClick={() => setFrom(addDays(from, -7))}>← Semana anterior</button>
          <button type="button" className="btn btn-outline" onClick={() => setFrom(mondayOf(todayAr()))}>Hoy</button>
          <button type="button" className="btn btn-outline" onClick={() => setFrom(addDays(from, 7))}>Semana siguiente →</button>
          <Link to="/flota/ordenes/nueva" className="btn">+ Nueva orden</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(150px, 1fr))", gap: 8, minWidth: 1050 }}>
          {days.map((day, i) => {
            const events = (data?.events ?? []).filter((e) => e.date === day);
            return (
              <div key={day} className="card pad" style={{ padding: 8, minHeight: 220, background: day === today ? "rgba(3, 105, 161, 0.06)" : undefined }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <strong style={{ textTransform: "capitalize" }}>{DAY_NAMES[i]} {civilDate(day).slice(0, 5)}</strong>
                  <Link to={`/flota/ordenes/nueva?day=${day}`} className="btn btn-outline compact" title="Nueva orden este día">+</Link>
                </div>
                {ordersOn(day).map((o) => orderCard(o, day))}
                {events.map((e, k) => (
                  <Link key={k} to={e.link} style={{ display: "block", fontSize: "0.75rem", marginBottom: 4, color: e.kind === "shop" ? "#b45309" : "#b91c1c" }}>
                    {e.kind === "shop" ? "🔧" : "⏰"} {e.title}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section className="card pad" style={{ flex: "1 1 380px" }}>
          <h3 style={{ marginTop: 0 }}>Órdenes sin fecha</h3>
          {!data || data.unscheduled.length === 0 ? <p className="muted" style={{ margin: 0 }}>No hay órdenes pendientes de coordinar.</p> : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {data.unscheduled.map((o) => (
                    <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/flota/ordenes/${o.id}`)}>
                      <td><strong>{o.code}</strong></td>
                      <td>{o.customerName}<div className="muted" style={{ fontSize: "0.75rem" }}>{o.description.slice(0, 60)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card pad" style={{ flex: "1 1 380px" }}>
          <h3 style={{ marginTop: 0 }}>Pedidos de venta sin coordinar</h3>
          {!data || data.toCoordinate.length === 0 ? <p className="muted" style={{ margin: 0 }}>No hay pedidos confirmados sin órdenes de servicio.</p> : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {data.toCoordinate.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.orderNumber}</strong><div className="muted" style={{ fontSize: "0.75rem" }}>{civilDate(s.createdAtUtc)}</div></td>
                      <td>{s.customerName}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link className="btn btn-outline compact"
                          to={`/flota/ordenes/nueva?salesOrderId=${s.id}&salesOrderLabel=${encodeURIComponent(`${s.orderNumber} · ${s.customerName}`)}`}>Crear orden</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
