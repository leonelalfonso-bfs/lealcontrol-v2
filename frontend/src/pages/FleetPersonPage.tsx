import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CredentialType, FleetMember, PersonCredential, PersonCredentialWrite } from "../api/types";
import { FleetAttachment } from "../components/fleet/FleetAttachment";
import { CREDENTIAL_TYPES, civilDate, credentialLabel, daysText, requiredCredentials, rolesText, stateBadge, stateLabel } from "../lib/fleet";

const EMPTY = (type: CredentialType = "DrivingLicense"): PersonCredentialWrite => ({
  type, expirationDate: "", category: "", number: "", issuer: "", issueDate: "", alertDaysBefore: 30
});

/** Ficha de una persona de la flota: roles y credenciales con vencimiento. */
export function FleetPersonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState<FleetMember | null>(null);
  const [credentials, setCredentials] = useState<PersonCredential[]>([]);
  const [history, setHistory] = useState(false);
  const [form, setForm] = useState<PersonCredentialWrite | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (withHistory = history) => {
    if (!id) return;
    const [p, list] = await Promise.all([api.getFleetPerson(id), api.listPersonCredentials(id, withHistory)]);
    setPerson(p);
    setCredentials(list);
  };

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = async (action: () => Promise<void>, ok: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  if (!person) return <div className="workspace-page">{error ? <div className="alert">{error}</div> : <p className="muted">Cargando…</p>}</div>;

  const setRole = (key: "isDriver" | "isCargoDriver" | "isForkliftOperator" | "isTechnician", value: boolean) =>
    void run(() => api.updateFleetPerson(person.id, {
      employeeId: person.employeeId, isDriver: person.isDriver, isCargoDriver: person.isCargoDriver,
      isForkliftOperator: person.isForkliftOperator, isTechnician: person.isTechnician, notes: person.notes ?? undefined, [key]: value
    }), "Roles actualizados.");

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    const body = { ...form, issueDate: form.issueDate || undefined };
    void run(async () => {
      if (editingId) await api.updatePersonCredential(editingId, body);
      else await api.createPersonCredential(person.id, body);
      setForm(null);
      setEditingId(null);
    }, editingId ? "Credencial actualizada." : "Credencial cargada.");
  };

  const activeTypes = new Set(credentials.filter((c) => c.isActive).map((c) => c.type));
  const missing = requiredCredentials(person).filter((t) => !activeTypes.has(t));

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA · PERSONA</span>
          <h1>{person.fullName}</h1>
          <p className="muted">{[person.jobTitle, person.fileNumber && `legajo ${person.fileNumber}`, person.documentNumber && `DNI ${person.documentNumber}`, rolesText(person)].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="toolbar">
          <Link to="/flota/personas" className="btn btn-outline">← Personas</Link>
        </div>
      </div>

      {!person.employeeActive && <div className="alert">Este empleado no está activo en RRHH: no se controlan sus vencimientos.</div>}
      {error && <div className="alert">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <section className="card pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Roles en la flota</h3>
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          {([
            ["isDriver", "Chofer"],
            ["isCargoDriver", "Chofer de cargas (LINTI)"],
            ["isForkliftOperator", "Autoelevadorista"],
            ["isTechnician", "Técnico"]
          ] as const).map(([key, label]) => (
            <label key={key} className="check-label" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={person[key]} disabled={busy} onChange={(e) => setRole(key, e.target.checked)} /> {label}
            </label>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="btn btn-outline compact" disabled={busy} onClick={() => {
            if (!window.confirm(`¿Sacar a ${person.fullName} de la flota? Sus credenciales quedan guardadas por si vuelve.`)) return;
            void api.removeFleetPerson(person.id).then(() => navigate("/flota/personas")).catch((e: Error) => setError(e.message));
          }}>Sacar de la flota</button>
        </div>
      </section>

      <section className="card pad stack" style={{ gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Credenciales</h3>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-outline compact" onClick={() => { const next = !history; setHistory(next); void load(next); }}>
              {history ? "Ocultar historial" : "Ver historial"}
            </button>
            <button type="button" className="btn compact" onClick={() => { setEditingId(null); setForm(EMPTY(missing[0] ?? "DrivingLicense")); }}>+ Cargar credencial</button>
          </div>
        </div>

        {missing.length > 0 && <div className="alert" style={{ margin: 0 }}>Falta cargar: {missing.map(credentialLabel).join(", ")}.</div>}

        {form && (
          <form className="card pad stack" style={{ gap: 12, border: "1px solid var(--line)" }} onSubmit={save}>
            <strong>{editingId ? "Editar credencial" : "Nueva credencial"}</strong>
            <div className="grid-3">
              <label>Tipo *
                <select value={form.type} disabled={!!editingId} onChange={(e) => setForm({ ...form, type: e.target.value as CredentialType })}>
                  {CREDENTIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label>Vence el *
                <input required type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} />
              </label>
              <label>{form.type === "DrivingLicense" ? "Categoría (B1, C, E1…)" : "Detalle"}
                <input value={form.category ?? ""} maxLength={40} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </label>
              <label>Número
                <input value={form.number ?? ""} maxLength={60} onChange={(e) => setForm({ ...form, number: e.target.value })} />
              </label>
              <label>Emisor
                <input value={form.issuer ?? ""} maxLength={120} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="Municipio, CNRT, médico…" />
              </label>
              <label>Avisar con (días)
                <input type="number" min={0} max={365} value={form.alertDaysBefore} onChange={(e) => setForm({ ...form, alertDaysBefore: Number(e.target.value) })} />
              </label>
            </div>
            {!editingId && activeTypes.has(form.type) && form.type !== "Other" && (
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>Es una renovación: la {credentialLabel(form.type).toLowerCase()} vigente pasa al historial.</p>
            )}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={() => { setForm(null); setEditingId(null); }}>Cancelar</button>
              <button className="btn" disabled={busy}>Guardar</button>
            </div>
          </form>
        )}

        {credentials.length === 0 ? <p className="muted" style={{ margin: 0 }}>No hay credenciales cargadas.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Credencial</th><th>Vence</th><th>Estado</th><th>Número</th><th>Archivo</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
              <tbody>
                {credentials.map((c) => (
                  <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.55 }}>
                    <td>{credentialLabel(c.type)}{c.category ? <span className="muted"> · {c.category}</span> : null}</td>
                    <td>{civilDate(c.expirationDate)} {c.isActive && <span className="muted">({daysText(c.daysRemaining)})</span>}</td>
                    <td>{c.isActive ? <span className={`badge ${stateBadge[c.state]}`}>{stateLabel[c.state]}</span> : <span className="badge off">Renovada</span>}</td>
                    <td>{c.number || "—"}</td>
                    <td><FleetAttachment kind="credentials" id={c.id} fileName={c.fileName} onChanged={() => void load()} /></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {c.isActive && c.type !== "Other" && (
                        <button type="button" className="btn btn-outline compact" onClick={() => {
                          setEditingId(null);
                          setForm({ ...EMPTY(c.type), category: c.category ?? "", issuer: c.issuer ?? "", alertDaysBefore: c.alertDaysBefore });
                        }}>Renovar</button>
                      )}{" "}
                      <button type="button" className="btn btn-outline compact" onClick={() => {
                        setEditingId(c.id);
                        setForm({ type: c.type, expirationDate: c.expirationDate, category: c.category ?? "", number: c.number, issuer: c.issuer ?? "",
                          issueDate: c.issueDate ?? "", alertDaysBefore: c.alertDaysBefore });
                      }}>Editar</button>{" "}
                      <button type="button" className="btn btn-outline compact" onClick={() => {
                        if (!window.confirm(`¿Borrar ${credentialLabel(c.type)} con vencimiento ${civilDate(c.expirationDate)}? Usalo solo para cargas equivocadas.`)) return;
                        void run(() => api.deletePersonCredential(c.id), "Credencial borrada.");
                      }}>Borrar</button>
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
