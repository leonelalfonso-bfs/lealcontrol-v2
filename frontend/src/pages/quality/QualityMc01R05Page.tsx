import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityInstitutionalNote } from "../../api/types/quality";

export function QualityMc01R05Page() {
  const [rows, setRows] = useState<QualityInstitutionalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [audience, setAudience] = useState("");
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = () => {
    setLoading(true);
    api.listQualityMc01R05()
      .then((res) => setRows(res.rows || []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError("El asunto es obligatorio.");
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
      await api.createQualityMc01R05({
        subject: subject.trim(),
        body: body.trim() || undefined,
        issuedBy: issuedBy.trim() || undefined,
        audience: audience.trim() || undefined,
        issuedAt: issuedAt ? new Date(issuedAt).toISOString() : undefined,
        fileId,
        notes: notes.trim() || undefined
      });
      setMsg("Nota institucional registrada.");
      setShowForm(false);
      setSubject("");
      setBody("");
      setIssuedBy("");
      setAudience("");
      setNotes("");
      setFile(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async (id: string, label: string) => {
    if (!window.confirm(`¿Anular la nota “${label}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelQualityMc01R05(id);
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
          <Link to="/calidad/documentos/MC01-R05" style={{ fontSize: 13 }}>← Plantilla MC01-R05</Link>
          <h1 style={{ margin: "8px 0 0" }}>MC01-R05 · Nota institucional</h1>
          <p style={{ color: "#64748b", marginTop: 6 }}>
            Comunicaciones formales de la dirección al personal / partes interesadas.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-outline" to="/calidad/registros">Índice registros</Link>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cerrar alta" : "Nueva nota"}
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
          <h3 style={{ marginTop: 0 }}>Alta de nota institucional</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label style={{ gridColumn: "1 / -1" }}>
              Asunto *
              <input required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Tema de la comunicación" />
            </label>
            <label>
              Emitida por
              <input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="Dirección / DT" />
            </label>
            <label>
              Destinatarios
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Todo el personal, área X…" />
            </label>
            <label>
              Fecha
              <input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
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
            Texto / resumen
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} style={{ width: "100%" }} />
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
          <div className="muted">Aún no hay notas institucionales registradas.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Asunto</th>
                  <th>Emitida por</th>
                  <th>Destinatarios</th>
                  <th>Fecha</th>
                  <th>Archivo</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ opacity: r.status === "Cancelled" ? 0.55 : 1 }}>
                    <td>
                      <strong>{r.subject}</strong>
                      {r.body ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{r.body.slice(0, 120)}{r.body.length > 120 ? "…" : ""}</div> : null}
                    </td>
                    <td>{r.issuedBy || "—"}</td>
                    <td>{r.audience || "—"}</td>
                    <td>{r.issuedAt ? new Date(r.issuedAt).toLocaleDateString("es-AR") : "—"}</td>
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
                    <td>{r.status}</td>
                    <td style={{ textAlign: "right" }}>
                      {r.status === "Active" && (
                        <button
                          type="button"
                          className="btn ghost compact"
                          disabled={busy}
                          onClick={() => void onCancel(r.id, r.subject)}
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
