import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { FleetMember, Vehicle, VehicleFuelLog } from "../api/types";
import { usePermissions } from "../context/PermissionsContext";
import { todayAr } from "../lib/dates";
import { civilDate, money, num, usesHours, usesKm } from "../lib/fleet";

const monthStart = () => `${todayAr().slice(0, 8)}01`;

type FuelForm = { vehicleId: string; date: string; km: string; hours: string; liters: string; pricePerLiter: string; totalCost: string; employeeId: string; station: string; paymentMethod: string; notes: string };

/** Flota → Combustible: cargas con el chofer, consumo (km/l o l/h) y resumen por unidad. */
export function FleetFuelLogsPage() {
  const { permissions } = usePermissions();
  const seesCosts = !permissions || permissions.isSuperAdmin || permissions.sensitive.costs;
  const [logs, setLogs] = useState<VehicleFuelLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [people, setPeople] = useState<FleetMember[]>([]);
  const [filter, setFilter] = useState({ vehicleId: "", from: monthStart(), to: todayAr() });
  const [form, setForm] = useState<FuelForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadLogs = async (f = filter) => setLogs(await api.listFuelLogs({ vehicleId: f.vehicleId || undefined, from: f.from, to: f.to }));

  useEffect(() => {
    Promise.all([api.listVehicles(), api.listFleetPeople().catch(() => [] as FleetMember[]), loadLogs()])
      .then(([v, p]) => {
        setVehicles(v);
        setPeople(p.filter((m) => m.employeeActive));
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fuelable = vehicles.filter((v) => v.status !== "Sold");
  const selected = form ? vehicles.find((v) => v.id === form.vehicleId) : undefined;
  const drivers = people.filter((p) => p.isDriver || p.isCargoDriver || p.isForkliftOperator);

  const applyFilter = (next: typeof filter) => {
    setFilter(next);
    loadLogs(next).catch((e: Error) => setError(e.message));
  };

  const openForm = () => {
    const v = fuelable.find((x) => x.id === filter.vehicleId) ?? fuelable[0];
    setMessage(null);
    setForm({
      vehicleId: v?.id ?? "", date: todayAr(), km: "", hours: "", liters: "", pricePerLiter: "", totalCost: "",
      employeeId: "", station: "", paymentMethod: "", notes: ""
    });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.createFuelLog({
        vehicleId: form.vehicleId, date: form.date, liters: Number(form.liters),
        km: usesKm(selected.meterType) && form.km !== "" ? Number(form.km) : null,
        hours: usesHours(selected.meterType) && form.hours !== "" ? Number(form.hours) : null,
        pricePerLiter: form.pricePerLiter !== "" ? Number(form.pricePerLiter) : null,
        totalCost: form.totalCost !== "" ? Number(form.totalCost) : null,
        employeeId: form.employeeId || null, station: form.station, paymentMethod: form.paymentMethod, notes: form.notes
      });
      setForm(null);
      setMessage(result.kmPerLiter != null ? `Carga registrada: ${num(result.kmPerLiter, 2)} km/l desde la carga anterior.`
        : result.litersPerHour != null ? `Carga registrada: ${num(result.litersPerHour, 2)} l/h desde la carga anterior.`
        : "Carga registrada. El consumo se calcula a partir de la próxima carga.");
      await loadLogs();
      setVehicles(await api.listVehicles());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (log: VehicleFuelLog) => {
    if (!window.confirm(`¿Borrar la carga de ${num(log.liters, 2)} l de ${log.vehicleLabel} del ${civilDate(log.date)}? Usalo solo para cargas equivocadas.`)) return;
    try {
      await api.deleteFuelLog(log.id);
      await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    }
  };

  const summary = useMemo(() => {
    const byVehicle = new Map<string, { label: string; liters: number; cost: number; kmpl: number[]; lph: number[] }>();
    for (const l of logs) {
      const row = byVehicle.get(l.vehicleId) ?? { label: l.vehicleLabel, liters: 0, cost: 0, kmpl: [], lph: [] };
      row.liters += l.liters;
      row.cost += l.totalCost ?? 0;
      if (l.kmPerLiter != null) row.kmpl.push(l.kmPerLiter);
      if (l.litersPerHour != null) row.lph.push(l.litersPerHour);
      byVehicle.set(l.vehicleId, row);
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return [...byVehicle.values()].map((r) => ({ ...r, kmpl: avg(r.kmpl), lph: avg(r.lph) })).sort((a, b) => b.liters - a.liters);
  }, [logs]);

  const estimatedTotal = form && form.totalCost === "" && form.liters !== "" && form.pricePerLiter !== ""
    ? Number(form.liters) * Number(form.pricePerLiter) : null;

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA</span>
          <h1>Combustible</h1>
          <p className="muted">Cada carga con los km u horas del tablero: así se calcula el consumo y se actualiza el uso de la unidad.</p>
        </div>
        <div className="toolbar">
          {seesCosts && <Link to="/flota/costos" className="btn btn-outline">Costos por unidad</Link>}
          <button type="button" className="btn" onClick={openForm} disabled={fuelable.length === 0}>+ Registrar carga</button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      {form && (
        <form className="card pad stack" style={{ gap: 12, marginBottom: 20 }} onSubmit={(e) => void save(e)}>
          <h3 style={{ margin: 0 }}>Nueva carga</h3>
          <div className="grid-3">
            <label>Unidad *
              <select required value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value, km: "", hours: "" })}>
                {fuelable.map((v) => <option key={v.id} value={v.id}>{v.label} · {v.brand} {v.model}</option>)}
              </select>
            </label>
            <label>Fecha *
              <input required type="date" max={todayAr()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label>Quién cargó
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">—</option>
                {drivers.map((p) => <option key={p.employeeId} value={p.employeeId}>{p.fullName}</option>)}
              </select>
            </label>
            {selected && usesKm(selected.meterType) && (
              <label>Km del tablero *
                <input required type="number" min={0} value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} placeholder={`actual: ${num(selected.currentKilometers)}`} />
              </label>
            )}
            {selected && usesHours(selected.meterType) && (
              <label>Horas del horómetro {!usesKm(selected.meterType) && "*"}
                <input required={!usesKm(selected.meterType)} type="number" min={0} step="0.1" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder={`actual: ${num(selected.currentEngineHours, 1)}`} />
              </label>
            )}
            <label>Litros *
              <input required type="number" min={0.01} step="0.01" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} />
            </label>
            <label>Precio por litro ($)
              <input type="number" min={0} step="0.01" value={form.pricePerLiter} onChange={(e) => setForm({ ...form, pricePerLiter: e.target.value })} />
            </label>
            <label>Total del ticket ($)
              <input type="number" min={0} step="0.01" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })}
                placeholder={estimatedTotal != null ? money(estimatedTotal) : "o cargá el total"} />
            </label>
            <label>Estación
              <input value={form.station} maxLength={80} onChange={(e) => setForm({ ...form, station: e.target.value })} placeholder="YPF Ruta 9 km 120" />
            </label>
            <label>Medio de pago
              <input value={form.paymentMethod} maxLength={80} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} placeholder="YPF en Ruta, tarjeta, efectivo…" />
            </label>
            <label>Notas
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          {drivers.length === 0 && <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>Para elegir quién cargó, sumá a los choferes en <Link to="/flota/personas">Flota → Personas</Link>.</p>}
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancelar</button>
            <button className="btn" disabled={busy}>{busy ? "Guardando…" : "Guardar carga"}</button>
          </div>
        </form>
      )}

      <section className="card pad" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ width: 220 }}>Unidad
            <select value={filter.vehicleId} onChange={(e) => applyFilter({ ...filter, vehicleId: e.target.value })}>
              <option value="">Todas</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <label style={{ width: 170 }}>Desde<input type="date" value={filter.from} onChange={(e) => applyFilter({ ...filter, from: e.target.value })} /></label>
          <label style={{ width: 170 }}>Hasta<input type="date" value={filter.to} onChange={(e) => applyFilter({ ...filter, to: e.target.value })} /></label>
        </div>
      </section>

      {summary.length > 0 && (
        <section className="card pad" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Resumen del período</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Unidad</th><th style={{ textAlign: "right" }}>Litros</th>{seesCosts && <th style={{ textAlign: "right" }}>Gasto</th>}<th style={{ textAlign: "right" }}>Consumo promedio</th></tr></thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.label}>
                    <td><strong>{r.label}</strong></td>
                    <td style={{ textAlign: "right" }}>{num(r.liters, 2)}</td>
                    {seesCosts && <td style={{ textAlign: "right" }}>{money(r.cost)}</td>}
                    <td style={{ textAlign: "right" }}>{r.kmpl != null ? `${num(r.kmpl, 2)} km/l` : r.lph != null ? `${num(r.lph, 2)} l/h` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card pad">
        {logs.length === 0 ? <p className="muted" style={{ margin: 0 }}>No hay cargas en el período.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Unidad</th><th>Quién</th><th>Lectura</th><th style={{ textAlign: "right" }}>Litros</th>
                  {seesCosts && <th style={{ textAlign: "right" }}>$/l</th>}{seesCosts && <th style={{ textAlign: "right" }}>Total</th>}
                  <th style={{ textAlign: "right" }}>Consumo</th><th>Estación</th><th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{civilDate(l.date)}</td>
                    <td><strong>{l.vehicleLabel}</strong></td>
                    <td>{l.personName ?? "—"}</td>
                    <td>{[l.km != null && `${num(l.km)} km`, l.hours != null && `${num(l.hours, 1)} h`].filter(Boolean).join(" · ") || "—"}</td>
                    <td style={{ textAlign: "right" }}>{num(l.liters, 2)}</td>
                    {seesCosts && <td style={{ textAlign: "right" }}>{money(l.pricePerLiter)}</td>}
                    {seesCosts && <td style={{ textAlign: "right" }}>{money(l.totalCost)}</td>}
                    <td style={{ textAlign: "right" }}>{l.kmPerLiter != null ? `${num(l.kmPerLiter, 2)} km/l` : l.litersPerHour != null ? `${num(l.litersPerHour, 2)} l/h` : "—"}</td>
                    <td className="muted">{[l.station, l.paymentMethod].filter(Boolean).join(" · ") || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn btn-outline compact" onClick={() => void remove(l)}>Borrar</button>
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
