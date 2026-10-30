import { useState } from "react";
import { api, type HrArea } from "../../api/client";

/** Áreas de la empresa (las define cada empresa): agrupan los puestos del organigrama y los manuales. */
export function HrAreasEditor({ areas, onChanged }: { areas: HrArea[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (action: Promise<unknown>) => { setError(null); action.then(onChanged).catch((err) => setError(err.message)); };

  return (
    <div className="card pad stack" style={{ gap: 8 }}>
      <strong>Áreas de la empresa</strong>
      <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>Se usan en los puestos y en los manuales. Renombrar un área actualiza todo lo que la usa; solo se borra si no tiene puestos ni manuales.</p>
      {error && <div className="alert" style={{ marginBottom: 0 }}>{error}</div>}
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {areas.map((a, i) => editing?.id === a.id ? (
          <form key={a.id} className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); run(api.saveHrArea(a.id, { name: editing.name, sortOrder: i })); setEditing(null); }}>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ width: 200 }} autoFocus />
            <button type="submit" className="btn compact">✓</button>
            <button type="button" className="btn ghost compact" onClick={() => setEditing(null)}>✕</button>
          </form>
        ) : (
          <span key={a.id} className="badge" style={{ gap: 6, padding: "4px 10px" }}>
            {a.name} <span className="muted">({a.positions} puestos · {a.manuals} manuales)</span>
            <button type="button" className="btn ghost compact" style={{ padding: "0 4px" }} title="Renombrar" onClick={() => setEditing({ id: a.id, name: a.name })}>✏️</button>
            <button type="button" className="btn ghost compact" style={{ padding: "0 4px" }} title="Borrar" onClick={() => window.confirm(`¿Borrar el área ${a.name}?`) && run(api.deleteHrArea(a.id))}>🗑️</button>
          </span>
        ))}
      </div>
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; run(api.saveHrArea(null, { name, sortOrder: areas.length })); setName(""); }}>
        <input placeholder="Nueva área (ej.: Servicio técnico)" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 300 }} />
        <button type="submit" className="btn compact">＋ Agregar área</button>
      </form>
    </div>
  );
}
