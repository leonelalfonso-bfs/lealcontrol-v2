import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityMethodValidation } from "../../api/types/quality";
import { EQUIPMENT_STATUS, labelOf } from "./qualityLabels";

const RESULT_OPTIONS = [
  { value: "Valid", label: "Válido" },
  { value: "Conditional", label: "Condicional" },
  { value: "NotValid", label: "No válido" }
];

function resultLabel(v: string) {
  return RESULT_OPTIONS.find((o) => o.value === v)?.label || v;
}

export function QualityPg11R01Page() {
  const [rows, setRows] = useState<QualityMethodValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [methodCode, setMethodCode] = useState("IT01");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [validatedBy, setValidatedBy] = useState("");
  const [validatedAt, setValidatedAt] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState("Valid");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = () => {
    setLoading(true);
    api.listQualityPg11R01()
      .then((res) => setRows(res.rows || []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!methodCode.trim() || !title.trim()) {
      setError("Método/IT y título son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      let fileId: string | undefined;
      if (file) {
        const uploaded = await api.uploadQualityFile(file, "Published");
        fileId = uploaded.id;
      }
      await api.createQualityPg11R01({
        methodCode: methodCode.trim(),
        title: title.trim(),
        summary: summary.trim() || undefined,
        validatedBy: validatedBy.trim() || undefined,
        validatedAt: validatedAt ? new Date(validatedAt).toISOString() : undefined,
        result,
        fileId,
        notes: notes.trim() || undefined
      });
      setMsg("Informe de validación registrado.");
      setShowForm(false);
      setTitle("");
      setSummary("");
      setValidatedBy("");
      setNotes("");
      setFile(null);
      setResult("Valid");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async (id: string, label: string) => {
    if (!window.confirm(`¿Anular la validación “${label}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelQualityPg11R01(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to="/calidad/documentos/PG11-R01" style={{ fontSize: 13 }}>← Plantilla PG11-R01</Link>
          <h1 style={{ margin: "8px 0 0" }}>PG11-R01 · Validación del método</h1>
          <p style={{ color: "#64748b", marginTop: 6 }}>
            Informes de validación por método/IT con PDF de evidencia.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-outline" to="/calidad/registros">Índice registros</Link>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cerrar alta" : "Nueva validación"}
          </button>
        </div>
      </div>

      {(error || msg) && (
        <div
          className="card pad"
          style={{ marginTop: 12, background: error ? "#fef2f2" : "#f0fdf4", color: error ? "#991b1b" : "#166534" }}
        >
          {error || msg}
        </div>
      )}

      {showForm && (
        <form className="card pad" style={{ marginTop: 16 }} onSubmit={(e) => void onSubmit(e)}>
          <h3 style={{ marginTop: 0 }}>Alta de informe de validación</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label>
              Método / IT *
              <input required value={methodCode} onChange={(e) => setMethodCode(e.target.value)} placeholder="IT01" />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Título *
              <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Validación IT01 — balanzas alta capacidad" />
            </label>
            <label>
              Validado por
              <input value={validatedBy} onChange={(e) => setValidatedBy(e.target.value)} placeholder="Director Técnico" />
            </label>
            <label>
              Fecha
              <input type="date" value={validatedAt} onChange={(e) => setValidatedAt(e.target.value)} />
            </label>
            <label>
              Resultado
              <select value={result} onChange={(e) => setResult(e.target.value)}>
                {RESULT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label>
              PDF / adjunto
              <input
                type="file"
                accept="application/pdf,.pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Resumen / alcance
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>
            Notas internas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <div style={{ marginTop: 12, justifyContent: "flex-end", display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      )}

      <div className="card pad" style={{ marginTop: 16 }}>
        {loading ? (
          <div className="muted">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="muted">Aún no hay validaciones de método registradas.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Método</th>
                  <th>Título</th>
                  <th>Validado por</th>
                  <th>Fecha</th>
                  <th>Resultado</th>
                  <th>Archivo</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ opacity: r.status === "Cancelled" ? 0.55 : 1 }}>
                    <td><strong>{r.methodCode}</strong></td>
                    <td>
                      {r.title}
                      {r.summary ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{r.summary.slice(0, 120)}{r.summary.length > 120 ? "…" : ""}</div> : null}
                    </td>
                    <td>{r.validatedBy || "—"}</td>
                    <td>{r.validatedAt ? new Date(r.validatedAt).toLocaleDateString("es-AR") : "—"}</td>
                    <td>{resultLabel(r.result)}</td>
                    <td>
                      {r.fileId ? (
                        <button
                          type="button"
                          className="btn ghost compact"
                          onClick={() => void api.openQualityFile(r.fileId!, "open")}
                        >
                          Ver archivo
                        </button>
                      ) : (
                        <span className="muted">Sin archivo</span>
                      )}
                    </td>
                    <td>{labelOf(EQUIPMENT_STATUS, r.status)}</td>
                    <td style={{ textAlign: "right" }}>
                      {r.status === "Active" && (
                        <button
                          type="button"
                          className="btn ghost compact"
                          disabled={busy}
                          onClick={() => void onCancel(r.id, r.title)}
                        >
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
