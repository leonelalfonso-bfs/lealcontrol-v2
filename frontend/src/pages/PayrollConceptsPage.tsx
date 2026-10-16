import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { LsdConcept } from "../api/types";

const KIND: Record<LsdConcept["kind"], string> = { Remunerative: "Remunerativo", NonRemunerative: "No remunerativo", Deduction: "Descuento" };

/** Conceptos propios y su concepto ARCA para el Libro de Sueldos Digital (nota 68, S5). */
export function PayrollConceptsPage() {
  const [concepts, setConcepts] = useState<LsdConcept[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { api.listLsdConcepts().then(setConcepts).catch((err) => setError(err.message)); }, []);

  const save = async (code: string, arcaCode: string) => {
    setError(null);
    setMsg(null);
    try {
      const updated = await api.setLsdConcept(code, arcaCode);
      setConcepts((list) => list.map((c) => (c.code === code ? updated : c)));
      setDrafts((d) => { const { [code]: _, ...rest } = d; return rest; });
      setMsg(`✓ ${code} → ${updated.arcaCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  };

  const download = async () => {
    setError(null);
    try {
      await api.downloadLsdConcepts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar.");
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>🏛️ Conceptos ARCA (Libro de Sueldos Digital)</h1>
          <p className="muted">Cada concepto del recibo se asocia a un concepto de ARCA. El sistema propone uno; cambialo si tu estudio usa otro.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn" onClick={() => void download()}>⬇️ Archivo de conceptos</button>
          <Link to="/rrhh/ayuda#lsd" className="btn ghost">💡 Ayuda</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card pad" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: "0.85rem" }}>
          <thead><tr><th>Código</th><th>Concepto</th><th>Tipo</th><th>Concepto ARCA</th><th /></tr></thead>
          <tbody>
            {concepts.map((c) => {
              const value = drafts[c.code] ?? c.arcaCode;
              return (
                <tr key={c.code}>
                  <td style={{ fontFamily: "monospace" }}>{c.code}</td>
                  <td>{c.name}</td>
                  <td>{KIND[c.kind]}</td>
                  <td>
                    <input value={value} maxLength={6} inputMode="numeric" style={{ width: 90, fontFamily: "monospace" }}
                      onChange={(e) => setDrafts({ ...drafts, [c.code]: e.target.value.replace(/\D/g, "") })} />
                    {c.arcaCode !== c.defaultArcaCode && <span className="muted" style={{ fontSize: "0.75rem", marginLeft: 6 }}>propuesto {c.defaultArcaCode}</span>}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {drafts[c.code] !== undefined && drafts[c.code] !== c.arcaCode && (
                      <button type="button" className="btn compact" onClick={() => void save(c.code, value)}>Guardar</button>
                    )}
                    {c.arcaCode !== c.defaultArcaCode && (
                      <button type="button" className="btn ghost compact" onClick={() => void save(c.code, "")}>Volver al propuesto</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
