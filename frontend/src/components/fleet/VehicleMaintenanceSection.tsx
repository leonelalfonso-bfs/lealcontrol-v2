import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { MaintenancePlan, MaintenancePlanWrite, Vehicle, VehicleMaintenance, VehicleMaintenanceWrite } from "../../api/types";
import { usePermissions } from "../../context/PermissionsContext";
import { todayAr } from "../../lib/dates";
import {
  MAINTENANCE_STATUSES, MAINTENANCE_TYPES, civilDate, intervalText, maintenanceStatusBadge, maintenanceStatusLabel,
  maintenanceTypeLabel, money, num, serviceStateLabel, stateBadge, usesHours, usesKm
} from "../../lib/fleet";

const SUGGESTIONS = ["Aceite y filtros", "Filtro de aire", "Filtro de combustible", "Correa de distribución", "Frenos", "Cubiertas / rotación", "Engrase", "Revisión general"];

type PlanForm = { title: string; intervalKm: string; intervalHours: string; intervalDays: string; alertKm: string; alertHours: string; alertDays: string; lastDoneDate: string; lastDoneKm: string; lastDoneHours: string };
type JobForm = { type: VehicleMaintenanceWrite["type"]; status: VehicleMaintenanceWrite["status"]; title: string; date: string; km: string; hours: string; workshop: string; invoiceReference: string; totalCost: string; description: string; planIds: string[] };

const optNumber = (v: string) => (v.trim() === "" ? null : Number(v));

/** Ficha de la unidad → plan de mantenimiento (próximos services) y trabajos de taller. */
export function VehicleMaintenanceSection({ vehicle, onVehicleChanged }: { vehicle: Vehicle; onVehicleChanged: () => Promise<void> }) {
  const { permissions } = usePermissions();
  const seesCosts = !permissions || permissions.isSuperAdmin || permissions.sensitive.costs;
  const km = usesKm(vehicle.meterType);
  const hours = usesHours(vehicle.meterType);

  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [jobs, setJobs] = useState<VehicleMaintenance[]>([]);
  const [planForm, setPlanForm] = useState<PlanForm | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [jobForm, setJobForm] = useState<JobForm | null>(null);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const [p, j] = await Promise.all([api.listMaintenancePlans(vehicle.id), api.listVehicleMaintenances(vehicle.id)]);
    setPlans(p);
    setJobs(j);
  };

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id]);

  const run = async (action: () => Promise<void>, ok: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
      await onVehicleChanged();
      setMessage(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const newPlan = () => {
    setEditingPlan(null);
    setPlanForm({
      title: "", intervalKm: km ? "10000" : "", intervalHours: !km && hours ? "250" : "", intervalDays: "365",
      alertKm: "1000", alertHours: "25", alertDays: "15", lastDoneDate: todayAr(),
      lastDoneKm: km ? String(vehicle.currentKilometers) : "", lastDoneHours: hours ? String(vehicle.currentEngineHours) : ""
    });
  };

  const editPlan = (p: MaintenancePlan) => {
    setEditingPlan(p.id);
    setPlanForm({
      title: p.title, intervalKm: p.intervalKm?.toString() ?? "", intervalHours: p.intervalHours?.toString() ?? "",
      intervalDays: p.intervalDays?.toString() ?? "", alertKm: String(p.alertKm), alertHours: String(p.alertHours), alertDays: String(p.alertDays),
      // Si ya hay trabajos, el punto de partida no cambia lo que se muestra; se edita igual por si estaba mal.
      lastDoneDate: p.lastDoneDate, lastDoneKm: p.lastDoneKm?.toString() ?? "", lastDoneHours: p.lastDoneHours?.toString() ?? ""
    });
  };

  const savePlan = (event: FormEvent) => {
    event.preventDefault();
    if (!planForm) return;
    const body: MaintenancePlanWrite = {
      title: planForm.title,
      intervalKm: km ? optNumber(planForm.intervalKm) : null,
      intervalHours: hours ? optNumber(planForm.intervalHours) : null,
      intervalDays: optNumber(planForm.intervalDays),
      alertKm: Number(planForm.alertKm || 0), alertHours: Number(planForm.alertHours || 0), alertDays: Number(planForm.alertDays || 0),
      lastDoneDate: planForm.lastDoneDate || undefined,
      lastDoneKm: km ? optNumber(planForm.lastDoneKm) : null,
      lastDoneHours: hours ? optNumber(planForm.lastDoneHours) : null
    };
    void run(async () => {
      if (editingPlan) await api.updateMaintenancePlan(editingPlan, body);
      else await api.createMaintenancePlan(vehicle.id, body);
      setPlanForm(null);
      setEditingPlan(null);
    }, editingPlan ? "Plan actualizado." : "Ítem agregado al plan.");
  };

  const newJob = (planIds: string[] = [], status: JobForm["status"] = "Completed") => {
    setEditingJob(null);
    setJobForm({
      type: "Preventive", status, title: "", date: todayAr(), km: km ? String(vehicle.currentKilometers) : "",
      hours: hours ? String(vehicle.currentEngineHours) : "", workshop: "", invoiceReference: "", totalCost: "", description: "", planIds
    });
  };

  const editJob = (j: VehicleMaintenance, status = j.status) => {
    setEditingJob(j.id);
    setJobForm({
      type: j.type, status, title: j.title, date: status === "Completed" && j.status !== "Completed" && j.date > todayAr() ? todayAr() : j.date,
      km: j.km?.toString() ?? (km && status === "Completed" ? String(vehicle.currentKilometers) : ""),
      hours: j.hours?.toString() ?? (hours && status === "Completed" ? String(vehicle.currentEngineHours) : ""),
      workshop: j.workshop, invoiceReference: j.invoiceReference ?? "", totalCost: j.totalCost ? String(j.totalCost) : "",
      description: j.description, planIds: j.planIds
    });
  };

  const saveJob = (event: FormEvent) => {
    event.preventDefault();
    if (!jobForm) return;
    const body: VehicleMaintenanceWrite = {
      type: jobForm.type, status: jobForm.status, title: jobForm.title, date: jobForm.date,
      km: km ? optNumber(jobForm.km) : null, hours: hours ? optNumber(jobForm.hours) : null,
      workshop: jobForm.workshop, invoiceReference: jobForm.invoiceReference, description: jobForm.description, planIds: jobForm.planIds,
      // Quien no ve costos no los manda: el servidor conserva el que estaba.
      totalCost: seesCosts ? Number(jobForm.totalCost || 0) : 0
    };
    void run(async () => {
      if (editingJob) await api.updateMaintenance(editingJob, body);
      else await api.createMaintenance(vehicle.id, body);
      setJobForm(null);
      setEditingJob(null);
    }, jobForm.status === "InProgress" ? "Trabajo registrado: la unidad quedó en taller." : "Trabajo guardado.");
  };

  const togglePlan = (id: string) =>
    jobForm && setJobForm({ ...jobForm, planIds: jobForm.planIds.includes(id) ? jobForm.planIds.filter((x) => x !== id) : [...jobForm.planIds, id] });

  return (
    <>
      <section className="card pad stack" style={{ gap: 14, marginBottom: 20 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Plan de mantenimiento</h3>
          <button type="button" className="btn compact" onClick={newPlan}>+ Agregar ítem</button>
        </div>
        {error && <div className="alert" style={{ margin: 0 }}>{error}</div>}
        {message && <div className="alert ok" style={{ margin: 0 }}>{message}</div>}

        {planForm && (
          <form className="card pad stack" style={{ gap: 12, border: "1px solid var(--line)" }} onSubmit={savePlan}>
            <strong>{editingPlan ? "Editar ítem del plan" : "Nuevo ítem del plan"}</strong>
            <div className="grid-3">
              <label>Qué se hace *
                <input required list="plan-suggestions" value={planForm.title} maxLength={160} onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })} placeholder="Aceite y filtros" />
                <datalist id="plan-suggestions">{SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
              </label>
              {km && <label>Cada (km)<input type="number" min={1} value={planForm.intervalKm} onChange={(e) => setPlanForm({ ...planForm, intervalKm: e.target.value })} /></label>}
              {hours && <label>Cada (horas)<input type="number" min={1} step="0.5" value={planForm.intervalHours} onChange={(e) => setPlanForm({ ...planForm, intervalHours: e.target.value })} /></label>}
              <label>Cada (días)<input type="number" min={1} max={3650} value={planForm.intervalDays} onChange={(e) => setPlanForm({ ...planForm, intervalDays: e.target.value })} placeholder="365 = una vez por año" /></label>
              <label>Último hecho (fecha)<input type="date" max={todayAr()} value={planForm.lastDoneDate} onChange={(e) => setPlanForm({ ...planForm, lastDoneDate: e.target.value })} /></label>
              {km && <label>Último hecho (km)<input type="number" min={0} value={planForm.lastDoneKm} onChange={(e) => setPlanForm({ ...planForm, lastDoneKm: e.target.value })} /></label>}
              {hours && <label>Último hecho (horas)<input type="number" min={0} step="0.1" value={planForm.lastDoneHours} onChange={(e) => setPlanForm({ ...planForm, lastDoneHours: e.target.value })} /></label>}
              {km && <label>Avisar faltando (km)<input type="number" min={0} value={planForm.alertKm} onChange={(e) => setPlanForm({ ...planForm, alertKm: e.target.value })} /></label>}
              {hours && <label>Avisar faltando (horas)<input type="number" min={0} value={planForm.alertHours} onChange={(e) => setPlanForm({ ...planForm, alertHours: e.target.value })} /></label>}
              <label>Avisar faltando (días)<input type="number" min={0} value={planForm.alertDays} onChange={(e) => setPlanForm({ ...planForm, alertDays: e.target.value })} /></label>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              Vence por lo que llegue primero. El "último hecho" es el punto de partida: cuando registres un trabajo que cumpla este ítem, la cuenta vuelve a empezar desde ahí.
            </p>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => { setPlanForm(null); setEditingPlan(null); }}>Cancelar</button>
              <button className="btn" disabled={busy}>Guardar</button>
            </div>
          </form>
        )}

        {plans.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Sin plan cargado. Agregá los services de esta unidad (aceite, filtros, correa…) con su frecuencia y te avisamos cuando se acerquen.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ítem</th><th>Frecuencia</th><th>Último</th><th>Próximo</th><th>Estado</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.title}</strong></td>
                    <td>{intervalText(p)}</td>
                    <td>
                      {civilDate(p.lastDoneDate)}
                      {p.lastDoneKm != null && <span className="muted"> · {num(p.lastDoneKm)} km</span>}
                      {p.lastDoneHours != null && <span className="muted"> · {num(p.lastDoneHours, 1)} h</span>}
                      {p.lastDoneFromBaseline && <div className="muted" style={{ fontSize: "0.75rem" }}>punto de partida</div>}
                    </td>
                    <td>
                      {[p.nextKm != null && `${num(p.nextKm)} km`, p.nextHours != null && `${num(p.nextHours, 1)} h`, p.nextDate && civilDate(p.nextDate)].filter(Boolean).join(" · ")}
                    </td>
                    <td>
                      <span className={`badge ${stateBadge[p.state]}`}>{serviceStateLabel[p.state]}</span>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>{p.dueText}</div>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="btn btn-outline compact" onClick={() => newJob([p.id])}>Registrar hecho</button>{" "}
                      <button type="button" className="btn btn-outline compact" onClick={() => editPlan(p)}>Editar</button>{" "}
                      <button type="button" className="btn btn-outline compact" onClick={() => {
                        if (!window.confirm(`¿Quitar "${p.title}" del plan? Los trabajos ya cargados quedan en el historial.`)) return;
                        void run(() => api.deleteMaintenancePlan(p.id), "Ítem quitado del plan.");
                      }}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card pad stack" style={{ gap: 14, marginBottom: 20 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Taller</h3>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-outline compact" onClick={() => newJob([], "InProgress")}>Entra al taller</button>
            <button type="button" className="btn compact" onClick={() => newJob()}>+ Registrar trabajo</button>
          </div>
        </div>

        {jobForm && (
          <form className="card pad stack" style={{ gap: 12, border: "1px solid var(--line)" }} onSubmit={saveJob}>
            <strong>{editingJob ? "Editar trabajo" : "Nuevo trabajo"}</strong>
            <div className="grid-3">
              <label>Tipo
                <select value={jobForm.type} onChange={(e) => setJobForm({ ...jobForm, type: e.target.value as JobForm["type"] })}>
                  {MAINTENANCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label>Estado
                <select value={jobForm.status} onChange={(e) => setJobForm({ ...jobForm, status: e.target.value as JobForm["status"] })}>
                  {MAINTENANCE_STATUSES.filter((s) => editingJob || s.value !== "Cancelled").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label>{jobForm.status === "Scheduled" ? "Fecha programada *" : "Fecha *"}
                <input required type="date" max={jobForm.status === "Scheduled" ? undefined : todayAr()} value={jobForm.date} onChange={(e) => setJobForm({ ...jobForm, date: e.target.value })} />
              </label>
              <label style={{ gridColumn: "span 2" }}>Qué se hizo {jobForm.planIds.length === 0 && "*"}
                <input value={jobForm.title} maxLength={160} required={jobForm.planIds.length === 0} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                  placeholder={jobForm.planIds.length ? "Si lo dejás vacío, se usan los ítems del plan" : "Cambio de pastillas de freno"} />
              </label>
              {km && <label>Kilómetros<input type="number" min={0} value={jobForm.km} onChange={(e) => setJobForm({ ...jobForm, km: e.target.value })} /></label>}
              {hours && <label>Horas<input type="number" min={0} step="0.1" value={jobForm.hours} onChange={(e) => setJobForm({ ...jobForm, hours: e.target.value })} /></label>}
              <label>Taller<input value={jobForm.workshop} maxLength={120} onChange={(e) => setJobForm({ ...jobForm, workshop: e.target.value })} placeholder="Taller propio" /></label>
              <label>Comprobante<input value={jobForm.invoiceReference} maxLength={60} onChange={(e) => setJobForm({ ...jobForm, invoiceReference: e.target.value })} placeholder="FC A 0001-00001234" /></label>
              {seesCosts && <label>Costo total ($)<input type="number" min={0} step="0.01" value={jobForm.totalCost} onChange={(e) => setJobForm({ ...jobForm, totalCost: e.target.value })} /></label>}
            </div>
            {plans.length > 0 && (
              <div>
                <span className="muted" style={{ fontSize: "0.85rem" }}>Ítems del plan que cumple este trabajo:</span>
                <div className="row" style={{ gap: 14, flexWrap: "wrap", marginTop: 6 }}>
                  {plans.map((p) => (
                    <label key={p.id} className="check-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <input type="checkbox" checked={jobForm.planIds.includes(p.id)} onChange={() => togglePlan(p.id)} /> {p.title}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label>Detalle
              <textarea rows={2} value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} />
            </label>
            {jobForm.status === "InProgress" && <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>Mientras esté en taller, la unidad figura como no disponible. Cuando termine, tocá "Terminar".</p>}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => { setJobForm(null); setEditingJob(null); }}>Cancelar</button>
              <button className="btn" disabled={busy}>Guardar</button>
            </div>
          </form>
        )}

        {jobs.length === 0 ? <p className="muted" style={{ margin: 0 }}>Todavía no hay trabajos cargados.</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Trabajo</th><th>{km ? "Km" : hours ? "Horas" : "Lectura"}</th><th>Taller</th>
                  {seesCosts && <th style={{ textAlign: "right" }}>Costo</th>}<th>Estado</th><th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} style={j.status === "Cancelled" ? { opacity: 0.55 } : undefined}>
                    <td>{civilDate(j.date)}</td>
                    <td>
                      <strong>{j.title}</strong>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>{maintenanceTypeLabel(j.type)}{j.invoiceReference ? ` · ${j.invoiceReference}` : ""}</div>
                    </td>
                    <td>{[j.km != null && `${num(j.km)} km`, j.hours != null && `${num(j.hours, 1)} h`].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{j.workshop}</td>
                    {seesCosts && <td style={{ textAlign: "right" }}>{money(j.totalCost)}</td>}
                    <td><span className={`badge ${maintenanceStatusBadge[j.status]}`}>{maintenanceStatusLabel(j.status)}</span></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {(j.status === "InProgress" || j.status === "Scheduled") && (
                        <button type="button" className="btn compact" onClick={() => editJob(j, "Completed")}>Terminar</button>
                      )}{" "}
                      <button type="button" className="btn btn-outline compact" onClick={() => editJob(j)}>Editar</button>{" "}
                      <button type="button" className="btn btn-outline compact" onClick={() => {
                        if (!window.confirm(`¿Borrar "${j.title}" del ${civilDate(j.date)}? Usalo solo para cargas equivocadas.`)) return;
                        void run(() => api.deleteMaintenance(j.id), "Trabajo borrado.");
                      }}>Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
