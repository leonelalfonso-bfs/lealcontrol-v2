import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { VacationRow } from "../api/types";

const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
// Las vacaciones de un año se gozan de octubre a abril: hasta septiembre, lo pendiente es del año anterior.
const defaultYear = () => {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
};

/** Vacaciones: días que corresponden por antigüedad, tramos tomados y saldo (nota 68, S4). */
export function VacationsPage() {
  const [year, setYear] = useState(defaultYear());
  const [rows, setRows] = useState<VacationRow[]>([]);
  const [form, setForm] = useState({ employeeId: "", startDate: "", days: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.listVacations(year).then(setRows).catch((err) => setError(err.message));
  useEffect(() => { void load(); }, [year]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api.createVacation({ employeeId: form.employeeId, year, startDate: form.startDate, days: Number(form.days), notes: form.notes || undefined });
      setMsg(["✓ Vacaciones registradas.", ...res.warnings.map((w) => `⚠️ ${w}`)].join(" "));
      setForm({ ...form, startDate: "", days: "", notes: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron registrar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("¿Borrar este tramo de vacaciones?")) return;
    setError(null);
    try {
      await api.deleteVacation(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  };

  const selected = rows.find((r) => r.employeeId === form.employeeId);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>🏖️ Vacaciones</h1>
          <p className="muted">Días por antigüedad (art. 150 LCT), tramos tomados y saldo. Se pagan en la liquidación del mes en que empiezan.</p>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <label className="row" style={{ gap: 6, alignItems: "center" }}>Vacaciones
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[0, 1, 2, 3].map((d) => defaultYear() + 1 - d).map((y) => <option key={y} value={y}>{y} (oct. {y} – abr. {y + 1})</option>)}
            </select>
          </label>
          <Link to="/rrhh/ayuda#vacaciones" className="btn ghost">💡 Ayuda</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <form className="card pad row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }} onSubmit={save}>
        <label style={{ minWidth: 220 }}>Colaborador
          <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
            <option value="">Elegí…</option>
            {rows.filter((r) => r.remaining > 0).map((r) => <option key={r.employeeId} value={r.employeeId}>{r.employeeName} (quedan {r.remaining})</option>)}
          </select>
        </label>
        <label style={{ maxWidth: 180 }}>Desde<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></label>
        <label style={{ maxWidth: 120 }}>Días corridos<input type="number" min={1} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} required /></label>
        <label style={{ minWidth: 200 }}>Nota<input value={form.notes} placeholder="Acuerdo, fecha de notificación…" onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button type="submit" className="btn" disabled={busy}>Registrar</button>
        {selected && <span className="muted" style={{ fontSize: "0.8rem", flexBasis: "100%" }}>{selected.detail}</span>}
      </form>

      <div className="card pad" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No hay colaboradores con vacaciones de {year}.</p>
        ) : (
          <table style={{ fontSize: "0.85rem" }}>
            <thead>
              <tr><th>Colaborador</th><th style={{ textAlign: "right" }}>Corresponden</th><th style={{ textAlign: "right" }}>Tomados</th><th style={{ textAlign: "right" }}>Quedan</th><th>Tramos</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td>{r.employeeName}<div className="muted" style={{ fontSize: "0.72rem" }}>{r.detail}</div></td>
                  <td style={{ textAlign: "right" }}>{r.entitled}</td>
                  <td style={{ textAlign: "right" }}>{r.taken}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{r.remaining}</td>
                  <td>
                    {r.leaves.length === 0 ? <span className="muted">—</span> : r.leaves.map((l) => (
                      <div key={l.id} className="row" style={{ gap: 8, alignItems: "center" }}>
                        <span>{day(l.startDate)} al {day(l.endDate)} ({l.days} días){l.notes && <span className="muted"> · {l.notes}</span>}</span>
                        <button type="button" className="btn ghost compact" onClick={() => void remove(l.id)}>Borrar</button>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
