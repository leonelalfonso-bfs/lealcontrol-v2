import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityComplaint } from "../../api/types/quality";

const STATUS_LABEL: Record<string, string> = {
  Open: "Registrada",
  UnderValidation: "En validación",
  Invalid: "No procede",
  Investigating: "Investigación",
  PendingCommunication: "Comunicación",
  Closed: "Cerrada",
  Cancelled: "Anulada"
};

function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}

export function QualityPg03R01Page() {
  const [rows, setRows] = useState<QualityComplaint[]>([]);
  const [overdueOpen, setOverdueOpen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [partyName, setPartyName] = useState("");
  const [partyContact, setPartyContact] = useState("");
  const [channel, setChannel] = useState("Email");
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [investigation, setInvestigation] = useState("");
  const [actions, setActions] = useState("");
  const [validationNotes, setValidationNotes] = useState("");

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const load = () => {
    setLoading(true);
    api.listQualityPg03R01()
      .then((res) => {
        setRows(res.rows || []);
        setOverdueOpen(res.overdueOpen ?? 0);
        if (selectedId && !(res.rows || []).some((r) => r.id === selectedId)) setSelectedId(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    setInvestigation(selected.investigation || "");
    setActions(selected.actions || "");
    setValidationNotes(selected.validationNotes || "");
  }, [selected?.id]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!partyName.trim() || !description.trim()) {
      setError("Reclamante y descripción son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      let evidenceFileId: string | undefined;
      if (file) {
        const uploaded = await api.uploadQualityFile(file, "Published");
        evidenceFileId = uploaded.id;
      }
      const created = await api.createQualityComplaint({
        partyName: partyName.trim(),
        partyContact: partyContact.trim() || undefined,
        channel,
        description: description.trim(),
        responsible: responsible.trim() || undefined,
        receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined,
        evidenceFileId,
        notes: notes.trim() || undefined
      });
      setMsg(`Queja ${created.number} generada en el sistema.`);
      setShowForm(false);
      setPartyName("");
      setPartyContact("");
      setDescription("");
      setResponsible("");
      setNotes("");
      setFile(null);
      setSelectedId(created.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body: Parameters<typeof api.updateQualityComplaint>[1], ok: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.updateQualityComplaint(selected.id, body);
      setMsg(ok);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async (id: string, number: string) => {
    if (!window.confirm(`¿Anular la queja ${number}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelQualityComplaint(id);
      if (selectedId === id) setSelectedId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const editable = selected
    && selected.status !== "Closed"
    && selected.status !== "Invalid"
    && selected.status !== "Cancelled";

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to="/calidad/documentos/PG03-R01" style={{ fontSize: 13 }}>← Plantilla PG03-R01</Link>
          <h1 style={{ margin: "8px 0 0" }}>PG03-R01 · Seguimiento de quejas</h1>
          <p style={{ color: "#64748b", marginTop: 6, maxWidth: 720 }}>
            Cada queja se <strong>genera en el sistema</strong> (número QJ-AAAA-NNNN, plazos SLA y workflow).
            El PDF de evidencia es opcional; el registro no es un Word subido.
          </p>
          {overdueOpen > 0 && (
            <p style={{ color: "#b91c1c", fontWeight: 700, marginTop: 8 }}>
              {overdueOpen} queja(s) abierta(s) fuera de plazo
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-outline" to="/calidad/registros">Índice registros</Link>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cerrar alta" : "Nueva queja"}
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
        <form className="card pad" style={{ marginTop: 16 }} onSubmit={(e) => void onCreate(e)}>
          <h3 style={{ marginTop: 0 }}>Alta de queja (instancia operativa)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label>
              Reclamante *
              <input required value={partyName} onChange={(e) => setPartyName(e.target.value)} />
            </label>
            <label>
              Contacto
              <input value={partyContact} onChange={(e) => setPartyContact(e.target.value)} placeholder="email / teléfono" />
            </label>
            <label>
              Canal
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="Email">Email</option>
                <option value="Phone">Teléfono</option>
                <option value="InPerson">Presencial</option>
                <option value="Web">Web</option>
                <option value="Other">Otro</option>
              </select>
            </label>
            <label>
              Fecha de recepción
              <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
            </label>
            <label>
              Responsable
              <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
            </label>
            <label>
              Evidencia (opcional)
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Descripción *
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>
            Notas internas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <div style={{ marginTop: 12, justifyContent: "flex-end", display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Generar queja"}</button>
          </div>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(300px, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
        <div className="card pad">
          <h3 style={{ marginTop: 0 }}>Quejas</h3>
          {loading ? (
            <div className="muted">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="muted">Todavía no hay quejas. Generá la primera desde el sistema.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Reclamante</th>
                    <th>Estado</th>
                    <th>Plazo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      style={{
                        cursor: "pointer",
                        background: selectedId === r.id ? "#ecfeff" : r.isOverdue ? "#fef2f2" : undefined
                      }}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td><strong>{r.number}</strong></td>
                      <td>
                        {r.partyName}
                        <div className="muted" style={{ fontSize: 12 }}>{new Date(r.receivedAt).toLocaleDateString("es-AR")}</div>
                      </td>
                      <td>{statusLabel(r.status)}</td>
                      <td style={{ color: r.isOverdue ? "#b91c1c" : undefined, fontWeight: r.isOverdue ? 700 : undefined }}>
                        {r.currentDueAt ? new Date(r.currentDueAt).toLocaleDateString("es-AR") : "—"}
                        {r.isOverdue ? " · vencido" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card pad">
          {!selected ? (
            <p className="muted">Seleccioná una queja para avanzar el workflow.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{selected.number}</h3>
              <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                {statusLabel(selected.status)} · {selected.channel} · {selected.partyName}
                {selected.isOverdue ? <span style={{ color: "#b91c1c", fontWeight: 700 }}> · Fuera de plazo</span> : null}
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{selected.description}</p>

              {editable && (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {selected.status === "Open" && (
                      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void patch({ status: "UnderValidation" }, "Pasó a validación.")}>
                        Iniciar validación
                      </button>
                    )}
                    {(selected.status === "Open" || selected.status === "UnderValidation") && (
                      <>
                        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void patch({ isValid: true, validationNotes }, "Queja válida → investigación.")}>
                          Validar (procede)
                        </button>
                        <button type="button" className="btn ghost" disabled={busy} onClick={() => void patch({ isValid: false, validationNotes }, "Marcada como no procede.")}>
                          No procede
                        </button>
                      </>
                    )}
                    {selected.status === "Investigating" && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy}
                        onClick={() => void patch({ investigation, actions, status: "PendingCommunication" }, "Listo para comunicar.")}
                      >
                        Fin investigación → comunicar
                      </button>
                    )}
                    {selected.status === "PendingCommunication" && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => void patch({ actions, status: "Closed", communicatedAt: new Date().toISOString() }, "Queja cerrada.")}
                      >
                        Comunicar y cerrar
                      </button>
                    )}
                    <button type="button" className="btn ghost" disabled={busy} onClick={() => void onCancel(selected.id, selected.number)}>
                      Anular
                    </button>
                  </div>

                  <label style={{ display: "block", marginBottom: 8 }}>
                    Notas de validación
                    <textarea value={validationNotes} onChange={(e) => setValidationNotes(e.target.value)} rows={2} style={{ width: "100%" }} disabled={!editable} />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Investigación
                    <textarea value={investigation} onChange={(e) => setInvestigation(e.target.value)} rows={3} style={{ width: "100%" }} disabled={!editable} />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Acciones
                    <textarea value={actions} onChange={(e) => setActions(e.target.value)} rows={3} style={{ width: "100%" }} disabled={!editable} />
                  </label>
                  {(selected.status === "Investigating" || selected.status === "PendingCommunication") && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() => void patch({ investigation, actions, validationNotes }, "Borrador guardado.")}
                    >
                      Guardar textos
                    </button>
                  )}
                </>
              )}

              {!editable && (
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  <div><strong>Validación:</strong> {selected.validationNotes || "—"}</div>
                  <div style={{ marginTop: 8 }}><strong>Investigación:</strong> {selected.investigation || "—"}</div>
                  <div style={{ marginTop: 8 }}><strong>Acciones:</strong> {selected.actions || "—"}</div>
                </div>
              )}

              {selected.evidenceFileId && (
                <p style={{ marginTop: 12 }}>
                  <button type="button" className="btn ghost compact" onClick={() => void api.openQualityFile(selected.evidenceFileId!, "open")}>
                    Ver evidencia
                  </button>
                </p>
              )}

              <div style={{ marginTop: 16, fontSize: 12, color: "#64748b" }}>
                SLA: registro {new Date(selected.registerDueAt).toLocaleDateString("es-AR")} ·
                validación {new Date(selected.validateDueAt).toLocaleDateString("es-AR")} ·
                investigación {new Date(selected.investigateDueAt).toLocaleDateString("es-AR")} ·
                cierre {new Date(selected.closeDueAt).toLocaleDateString("es-AR")}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
