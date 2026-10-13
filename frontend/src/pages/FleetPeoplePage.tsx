import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { FleetMember, PersonExpirationItem } from "../api/types";
import { civilDate, credentialLabel, daysText, rolesText, stateBadge, stateLabel } from "../lib/fleet";

type Available = { id: string; fullName: string; fileNumber: string; documentNumber: string; jobTitle: string };

/** Flota → Personas: choferes, autoelevadoristas y técnicos (empleados de RRHH) con sus credenciales. */
export function FleetPeoplePage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState<FleetMember[]>([]);
  const [problems, setProblems] = useState<PersonExpirationItem[]>([]);
  const [available, setAvailable] = useState<Available[] | null>(null);
  const [form, setForm] = useState({ employeeId: "", isDriver: true, isCargoDriver: false, isForkliftOperator: false, isTechnician: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [list, panel] = await Promise.all([api.listFleetPeople(), api.getFleetPeopleExpirations()]);
    setPeople(list);
    setProblems(panel.items);
  };

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  const openAdd = async () => {
    setError(null);
    try {
      const list = await api.listFleetAvailableEmployees();
      setAvailable(list);
      setForm({ employeeId: list[0]?.id ?? "", isDriver: true, isCargoDriver: false, isForkliftOperator: false, isTechnician: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer los empleados de RRHH.");
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.addFleetPerson(form);
      setAvailable(null);
      navigate(`/flota/personas/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA</span>
          <h1>Personas</h1>
          <p className="muted">Choferes, autoelevadoristas y técnicos (empleados de RRHH) con sus licencias, LINTI, carnets y aptos.</p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" onClick={() => void openAdd()}>+ Agregar persona</button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {available && (
        <form className="card pad stack" style={{ gap: 12, marginBottom: 20 }} onSubmit={add}>
          <h3 style={{ margin: 0 }}>Agregar a la flota</h3>
          {available.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No hay empleados activos de RRHH para agregar. Cargalos en <Link to="/rrhh/empleados">RRHH → Colaboradores</Link>.
            </p>
          ) : (
            <>
              <label>Empleado
                <select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  {available.map((a) => <option key={a.id} value={a.id}>{a.fullName}{a.jobTitle ? ` · ${a.jobTitle}` : ""}{a.fileNumber ? ` · legajo ${a.fileNumber}` : ""}</option>)}
                </select>
              </label>
              <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
                {([
                  ["isDriver", "Chofer"],
                  ["isCargoDriver", "Chofer de cargas (LINTI)"],
                  ["isForkliftOperator", "Autoelevadorista"],
                  ["isTechnician", "Técnico"]
                ] as const).map(([key, label]) => (
                  <label key={key} className="check-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} /> {label}
                  </label>
                ))}
              </div>
            </>
          )}
          <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={() => setAvailable(null)}>Cancelar</button>
            {available.length > 0 && <button className="btn" disabled={busy || !form.employeeId}>Agregar</button>}
          </div>
        </form>
      )}

      {problems.length > 0 && (
        <section className="card pad" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Credenciales para atender</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Persona</th><th>Credencial</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>
                {problems.map((p) => (
                  <tr key={`${p.memberId}-${p.type}-${p.credentialId ?? "falta"}`} style={{ cursor: "pointer" }} onClick={() => navigate(`/flota/personas/${p.memberId}`)}>
                    <td><strong>{p.fullName}</strong></td>
                    <td>{credentialLabel(p.type)}</td>
                    <td>{p.expirationDate ? <>{civilDate(p.expirationDate)} <span className="muted">({daysText(p.daysRemaining)})</span></> : "—"}</td>
                    <td><span className={`badge ${stateBadge[p.state]}`}>{stateLabel[p.state]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card pad">
        {people.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todavía no hay personas en la flota. Agregalas desde los empleados de RRHH con "+ Agregar persona".</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Persona</th><th>Roles</th><th>Credenciales</th></tr></thead>
              <tbody>
                {people.map((p) => {
                  const pending = p.expiredCount + p.missingCount;
                  return (
                    <tr key={p.id} style={{ cursor: "pointer", opacity: p.employeeActive ? 1 : 0.55 }} onClick={() => navigate(`/flota/personas/${p.id}`)}>
                      <td>
                        <strong>{p.fullName}</strong>
                        <div className="muted" style={{ fontSize: "0.78rem" }}>
                          {[p.jobTitle, p.fileNumber && `legajo ${p.fileNumber}`, !p.employeeActive && "no activo en RRHH"].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td>{rolesText(p)}</td>
                      <td>
                        {pending > 0 ? (
                          <span className="badge prio-high">
                            {[p.expiredCount > 0 && `${p.expiredCount} vencida${p.expiredCount > 1 ? "s" : ""}`, p.missingCount > 0 && `${p.missingCount} sin cargar`].filter(Boolean).join(" · ")}
                          </span>
                        ) : p.dueSoonCount > 0 ? <span className="badge warn">{p.dueSoonCount} por vencer</span>
                          : <span className="badge ok">Al día{p.nextExpirationDate ? ` · próximo ${civilDate(p.nextExpirationDate)}` : ""}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
