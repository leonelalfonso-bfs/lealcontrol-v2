import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { AgreementInput, AgreementSummary } from "../api/types";

const EMPTY: AgreementInput = { code: "", name: "", union: "", hourDivisor: 200, zones: "", notes: "" };

/** Convenios colectivos de la empresa (nota 68, S2). */
export function AgreementsPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<AgreementSummary[]>([]);
  const [form, setForm] = useState<AgreementInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listAgreements().then(setList).catch((err) => setError(err.message));
  useEffect(() => { void load(); }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    void run(async () => {
      const created = await api.createAgreement(form);
      navigate(`/rrhh/convenios/${created.id}`);
    });
  };

  const hasUecara = list.some((a) => a.code === "660/13");

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>📜 Convenios colectivos</h1>
          <p className="muted">Categorías, escalas por mes, adicionales y aportes sindicales de cada convenio.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {!hasUecara && (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(async () => {
              const created = await api.installUecara();
              navigate(`/rrhh/convenios/${created.id}`);
            })}>Cargar UECARA (CCT 660/13)</button>
          )}
          <button type="button" className="btn" onClick={() => setForm({ ...EMPTY })}>➕ Nuevo convenio</button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {form && (
        <form className="card pad stack" style={{ gap: 12 }} onSubmit={create}>
          <h3 style={{ margin: 0 }}>Nuevo convenio</h3>
          <div className="grid-3">
            <label>Número (CCT)<input value={form.code} placeholder="130/75" onChange={(e) => setForm({ ...form, code: e.target.value })} required /></label>
            <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Sindicato<input value={form.union} onChange={(e) => setForm({ ...form, union: e.target.value })} /></label>
            <label>Divisor de la hora<input type="number" min={1} max={400} value={form.hourDivisor} onChange={(e) => setForm({ ...form, hourDivisor: Number(e.target.value) })} /></label>
            <label>Zonas (separadas por coma)<input value={form.zones} placeholder="Vacío si no tiene zonas" onChange={(e) => setForm({ ...form, zones: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button type="submit" className="btn" disabled={busy}>Crear</button>
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card pad">
        {list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todavía no hay convenios. Cargá UECARA o creá el de tu actividad.</p>
        ) : (
          <table style={{ fontSize: "0.85rem" }}>
            <thead><tr><th>Convenio</th><th>Sindicato</th><th>Zonas</th><th style={{ textAlign: "right" }}>Colaboradores</th><th /></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.code}</strong> — {a.name}</td>
                  <td>{a.union || "—"}</td>
                  <td>{a.zones || "—"}</td>
                  <td style={{ textAlign: "right" }}>{a.employees}</td>
                  <td style={{ textAlign: "right" }}><Link to={`/rrhh/convenios/${a.id}`} className="btn ghost compact">Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
