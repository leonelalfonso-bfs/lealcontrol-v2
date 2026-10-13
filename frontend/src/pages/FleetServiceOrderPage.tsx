import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { ResourceStatus, SalesOrderToCoordinate, ServiceOrder } from "../api/types";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { fromArLocalInput, rangeText, serviceOrderStatusBadge, serviceOrderStatusLabel, toArLocalInput } from "../lib/fleet";

type Form = {
  mode: "customer" | "sales";
  customerId: string;
  customerName: string;
  salesOrderId: string;
  salesOrderLabel: string;
  location: string;
  description: string;
  start: string;
  end: string;
  employeeIds: string[];
  vehicleIds: string[];
};

const fromOrder = (o: ServiceOrder): Form => ({
  mode: o.salesOrderId ? "sales" : "customer",
  customerId: o.customerId ?? "",
  customerName: o.customerName,
  salesOrderId: o.salesOrderId ?? "",
  salesOrderLabel: o.salesOrderId ? `${o.salesOrderNumber} · ${o.customerName}` : "",
  location: o.location ?? "",
  description: o.description,
  start: toArLocalInput(o.start),
  end: toArLocalInput(o.end),
  employeeIds: o.people.map((p) => p.id),
  vehicleIds: o.vehicles.map((v) => v.id)
});

/** Orden de servicio: cliente o pedido, horario, técnicos y unidades (con su disponibilidad), y cierre. */
export function FleetServiceOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [form, setForm] = useState<Form>(() => {
    const day = params.get("day");
    return {
      mode: params.get("salesOrderId") ? "sales" : "customer",
      customerId: "", customerName: params.get("customerName") ?? "",
      salesOrderId: params.get("salesOrderId") ?? "", salesOrderLabel: params.get("salesOrderLabel") ?? "",
      location: "", description: "",
      start: day ? `${day}T08:00` : "", end: day ? `${day}T17:00` : "",
      employeeIds: [], vehicleIds: []
    };
  });
  const [lookup, setLookup] = useState("");
  const debouncedLookup = useDebouncedValue(lookup, 300);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderToCoordinate[]>([]);
  const [availability, setAvailability] = useState<{ people: ResourceStatus[]; vehicles: ResourceStatus[] } | null>(null);
  const [complete, setComplete] = useState<{ workPerformed: string; observations: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const editable = !order || order.status === "Pending" || order.status === "Scheduled" || order.status === "InProgress";

  useEffect(() => {
    if (!id) return;
    api.getServiceOrder(id).then((o) => { setOrder(o); setForm(fromOrder(o)); }).catch((e: Error) => setError(e.message));
  }, [id]);

  // Buscador de cliente o de pedido de venta.
  useEffect(() => {
    if (!editable) return;
    if (form.mode === "customer") {
      if (debouncedLookup.trim().length < 2) { setCustomers([]); return; }
      api.searchServiceOrderCustomers(debouncedLookup.trim()).then(setCustomers).catch(() => setCustomers([]));
    } else {
      api.listSalesOrdersToCoordinate(debouncedLookup.trim()).then(setSalesOrders).catch(() => setSalesOrders([]));
    }
  }, [debouncedLookup, form.mode, editable]);

  // Disponibilidad de personas y unidades para el horario elegido.
  const start = fromArLocalInput(form.start);
  const end = fromArLocalInput(form.end);
  useEffect(() => {
    if (!editable || !start || !end || form.end <= form.start) { setAvailability(null); return; }
    api.getServiceOrderAvailability(start, end, id).then(setAvailability).catch(() => setAvailability(null));
  }, [start, end, id, editable, form.start, form.end]);

  const toggle = (key: "employeeIds" | "vehicleIds", value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));

  const run = async (action: () => Promise<ServiceOrder>, ok: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await action();
      setOrder(saved);
      setForm(fromOrder(saved));
      setMessage(ok);
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const body = {
      description: form.description,
      customerId: form.mode === "customer" && form.customerId ? form.customerId : null,
      customerName: form.mode === "customer" ? form.customerName : undefined,
      salesOrderId: form.mode === "sales" && form.salesOrderId ? form.salesOrderId : null,
      location: form.location,
      start, end,
      employeeIds: form.employeeIds,
      vehicleIds: form.vehicleIds
    };
    const saved = await run(() => (order ? api.updateServiceOrder(order.id, body) : api.createServiceOrder(body)), "Orden guardada.");
    if (saved && !order) navigate(`/flota/ordenes/${saved.id}`, { replace: true });
  };

  const resourceList = (title: string, list: ResourceStatus[] | undefined, key: "employeeIds" | "vehicleIds", empty: ReactNode) => (
    <div className="card pad stack" style={{ gap: 8, border: "1px solid var(--line)", flex: "1 1 320px" }}>
      <strong>{title}</strong>
      {!list ? <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Elegí inicio y fin para ver quién está disponible.</p>
        : list.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>{empty}</p>
        : list.map((r) => {
          const selected = form[key].includes(r.id);
          const blocked = r.blockers.length > 0;
          return (
            <label key={r.id} className="check-label" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, opacity: blocked && !selected ? 0.6 : 1 }}>
              <input type="checkbox" checked={selected} disabled={!editable || (blocked && !selected)} onChange={() => toggle(key, r.id)} style={{ marginTop: 3 }} />
              <span>
                <strong>{r.label}</strong>{r.detail ? <span className="muted"> · {r.detail}</span> : null}
                {r.blockers.map((b) => <div key={b} style={{ color: "var(--danger, #b91c1c)", fontSize: "0.8rem" }}>✕ {b}</div>)}
                {r.warnings.map((w) => <div key={w} style={{ color: "var(--warn, #b45309)", fontSize: "0.8rem" }}>⚠ {w}</div>)}
              </span>
            </label>
          );
        })}
    </div>
  );

  // Asignados que ya no figuran en la lista (por ejemplo, sin fecha): se muestran igual.
  const extra = (key: "employeeIds" | "vehicleIds") =>
    !availability && order ? (key === "employeeIds" ? order.people : order.vehicles).filter((r) => form[key].includes(r.id)) : [];

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA · ORDEN DE SERVICIO</span>
          <h1>{order ? `${order.code} · ${order.customerName}` : "Nueva orden de servicio"}</h1>
          {order && (
            <p className="muted">
              <span className={`badge ${serviceOrderStatusBadge[order.status]}`}>{serviceOrderStatusLabel(order.status)}</span>{" "}
              {rangeText(order.start, order.end)}{order.salesOrderNumber ? ` · pedido ${order.salesOrderNumber}` : ""}{order.createdBy ? ` · cargó ${order.createdBy}` : ""}
            </p>
          )}
        </div>
        <div className="toolbar">
          <Link to="/flota/ordenes" className="btn btn-outline">← Órdenes</Link>
          <Link to="/flota/agenda" className="btn btn-outline">Agenda</Link>
        </div>
      </div>

      {error && <div className="alert" style={{ whiteSpace: "pre-line" }}>{error.replace("No se puede asignar: ", "No se puede asignar:\n").replaceAll(" · ", "\n")}</div>}
      {message && <div className="alert ok">{message}</div>}
      {order && order.problems.length > 0 && (
        <div className="alert">
          <strong>Atención: algo cambió desde que se programó.</strong>
          <ul style={{ margin: "6px 0 0" }}>{order.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <form className="card pad stack" style={{ gap: 14, marginBottom: 20 }} onSubmit={(e) => void save(e)}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={!editable} className={`btn compact ${form.mode === "customer" ? "" : "btn-outline"}`} onClick={() => { setForm({ ...form, mode: "customer" }); setLookup(""); }}>Cliente</button>
          <button type="button" disabled={!editable} className={`btn compact ${form.mode === "sales" ? "" : "btn-outline"}`} onClick={() => { setForm({ ...form, mode: "sales" }); setLookup(""); }}>Desde un pedido de venta</button>
        </div>

        {form.mode === "customer" ? (
          <div className="grid-3">
            <label style={{ gridColumn: "span 2" }}>Cliente *
              <input required disabled={!editable} value={form.customerName}
                onChange={(e) => { setForm({ ...form, customerName: e.target.value, customerId: "" }); setLookup(e.target.value); }}
                placeholder="Escribí para buscar en Clientes (o dejalo como texto)" />
              {customers.length > 0 && !form.customerId && (
                <div className="card" style={{ marginTop: 4, padding: 4 }}>
                  {customers.map((c) => (
                    <button key={c.id} type="button" className="btn btn-outline compact" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 2 }}
                      onClick={() => { setForm({ ...form, customerId: c.id, customerName: c.name }); setCustomers([]); }}>{c.name}</button>
                  ))}
                </div>
              )}
              {form.customerId && <span className="muted" style={{ fontSize: "0.75rem" }}>✓ cliente de la base</span>}
            </label>
          </div>
        ) : (
          <label>Pedido de venta *
            {form.salesOrderId ? (
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <strong>{form.salesOrderLabel || "Pedido elegido"}</strong>
                {editable && <button type="button" className="btn btn-outline compact" onClick={() => setForm({ ...form, salesOrderId: "", salesOrderLabel: "" })}>Cambiar</button>}
              </div>
            ) : (
              <>
                <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Buscar por número o cliente (pedidos confirmados o en preparación)" />
                <div className="card" style={{ marginTop: 4, padding: 4, maxHeight: 220, overflow: "auto" }}>
                  {salesOrders.length === 0 ? <span className="muted" style={{ fontSize: "0.85rem" }}>No hay pedidos abiertos que coincidan.</span> : salesOrders.map((s) => (
                    <button key={s.id} type="button" className="btn btn-outline compact" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 2 }}
                      onClick={() => setForm({ ...form, salesOrderId: s.id, salesOrderLabel: `${s.orderNumber} · ${s.customerName}` })}>
                      {s.orderNumber} · {s.customerName} {s.serviceOrders > 0 && <span className="muted">({s.serviceOrders} orden{s.serviceOrders > 1 ? "es" : ""} ya creada{s.serviceOrders > 1 ? "s" : ""})</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </label>
        )}

        <div className="grid-3">
          <label style={{ gridColumn: "span 2" }}>Qué hay que hacer *
            <textarea required rows={2} maxLength={2000} disabled={!editable} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label>Lugar
            <input maxLength={300} disabled={!editable} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Planta, dirección…" />
          </label>
          <label>Inicio
            <input type="datetime-local" disabled={!editable} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value, end: form.end || e.target.value })} />
          </label>
          <label>Fin
            <input type="datetime-local" disabled={!editable} min={form.start} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </label>
          <div className="row" style={{ alignItems: "flex-end" }}>
            {editable && (form.start || form.end) && (
              <button type="button" className="btn btn-outline compact" onClick={() => setForm({ ...form, start: "", end: "" })}>Dejar sin fecha</button>
            )}
          </div>
        </div>
        {!form.start && <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>Sin fecha, la orden queda "para coordinar" y no se controla la disponibilidad.</p>}

        <div className="row" style={{ gap: 14, flexWrap: "wrap", alignItems: "stretch" }}>
          {resourceList("Técnicos y choferes", availability?.people ?? (extra("employeeIds").length ? extra("employeeIds").map((r) => ({ ...r, blockers: [], warnings: [] })) : undefined), "employeeIds",
            <>No hay personas en la flota. Sumalas en <Link to="/flota/personas">Flota → Personas</Link>.</>)}
          {resourceList("Unidades", availability?.vehicles ?? (extra("vehicleIds").length ? extra("vehicleIds").map((r) => ({ ...r, blockers: [], warnings: [] })) : undefined), "vehicleIds",
            <>No hay unidades cargadas.</>)}
        </div>

        {editable && (
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" disabled={busy}>{busy ? "Guardando…" : order ? "Guardar cambios" : "Crear orden"}</button>
          </div>
        )}
      </form>

      {order && (
        <section className="card pad stack" style={{ gap: 12 }}>
          <h3 style={{ margin: 0 }}>Ejecución</h3>
          {order.status === "Completed" ? (
            <>
              <div><span className="muted">Trabajo realizado</span><p style={{ margin: "4px 0", whiteSpace: "pre-line" }}>{order.workPerformed}</p></div>
              {order.observations && <div><span className="muted">Observaciones</span><p style={{ margin: "4px 0", whiteSpace: "pre-line" }}>{order.observations}</p></div>}
            </>
          ) : order.status === "Cancelled" ? <p className="muted" style={{ margin: 0 }}>Orden cancelada.</p> : complete ? (
            <div className="stack" style={{ gap: 10 }}>
              <label>Trabajo realizado *
                <textarea rows={3} maxLength={4000} value={complete.workPerformed} onChange={(e) => setComplete({ ...complete, workPerformed: e.target.value })} />
              </label>
              <label>Observaciones
                <textarea rows={2} maxLength={2000} value={complete.observations} onChange={(e) => setComplete({ ...complete, observations: e.target.value })} />
              </label>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setComplete(null)}>Cancelar</button>
                <button type="button" className="btn" disabled={busy || !complete.workPerformed.trim()}
                  onClick={() => void run(() => api.completeServiceOrder(order.id, complete), "Orden terminada.").then((r) => r && setComplete(null))}>Terminar orden</button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {order.status === "Scheduled" && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void run(() => api.startServiceOrder(order.id), "Orden en curso.")}>Iniciar</button>}
              {(order.status === "Scheduled" || order.status === "InProgress") && <button type="button" className="btn" onClick={() => setComplete({ workPerformed: "", observations: "" })}>Terminar…</button>}
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => {
                if (!window.confirm(`¿Cancelar ${order.code}? Libera a las personas y unidades asignadas.`)) return;
                void run(() => api.cancelServiceOrder(order.id), "Orden cancelada.");
              }}>Cancelar orden</button>
              {order.status === "Pending" && <span className="muted" style={{ fontSize: "0.85rem", alignSelf: "center" }}>Poné inicio y fin para programarla.</span>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
