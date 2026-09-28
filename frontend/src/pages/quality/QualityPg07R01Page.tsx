import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityComplaint, QualityCorrectiveAction, QualityNonConformity, QualityRating } from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";
import { QualityAuditHistory } from "./QualityAuditHistory";
import { usePresentationMode } from "../../context/PresentationModeContext";

const KIND_LABEL: Record<string, string> = {
  NonConformity: "No conformidad",
  NonConformingWork: "Trabajo no conforme",
  Risk: "Riesgo",
  Opportunity: "Oportunidad de mejora"
};
const STATUS_LABEL: Record<string, string> = {
  Open: "Abierta", InAnalysis: "En análisis", ActionPending: "Acciones pendientes",
  EffectivenessCheck: "Verificar eficacia", Closed: "Cerrada", Cancelled: "Anulada"
};
const OPEN = new Set(["Open", "InAnalysis", "ActionPending", "EffectivenessCheck"]);
const CLOSED = new Set(["Closed", "Cancelled"]);

type ActionDraft = { action: string; responsible: string; implementationDate: string };
type EvaluationDraft = { result: "Pending" | "Effective" | "NotEffective"; check: string };

const dateInput = (value?: string | null) => value?.slice(0, 10) ?? "";
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("es-AR") : "—";
const utcDate = (value: string) => new Date(`${value}T12:00:00Z`).toISOString();

function previewRating(kind: string, probability: number, impact: number): QualityRating | null {
  if (kind !== "Risk" && kind !== "Opportunity") return null;
  if (![probability, impact].every((v) => Number.isInteger(v) && v >= 1 && v <= 5)) return null;
  const level = probability * impact;
  const opportunity = kind === "Opportunity";
  if (level <= 2) return {
    level, valuation: opportunity ? "No aprovechable" : "Aceptable",
    criterion: opportunity ? "No amerita realizar acciones para mejorar la actividad" : "No requiere acciones",
    requiresAction: false, allowsDecision: false
  };
  if (level <= 8) return {
    level, valuation: opportunity ? "Poco aprovechable" : "Apreciable",
    criterion: opportunity ? "Analizar si amerita acciones para mejorar la actividad" : "Analizar si amerita acciones",
    requiresAction: false, allowsDecision: true
  };
  if (level <= 12) return {
    level, valuation: opportunity ? "Aprovechable" : "Crítico",
    criterion: opportunity ? "Tomar acciones para mejorar la actividad" : "Tomar acciones",
    requiresAction: true, allowsDecision: false
  };
  return {
    level, valuation: opportunity ? "Altamente aprovechable" : "Muy grave",
    criterion: opportunity ? "Tomar acciones de forma inmediata para mejorar la actividad" : "No aceptar, tomar acciones de forma inmediata",
    requiresAction: true, allowsDecision: false
  };
}

function actionStatus(action: QualityCorrectiveAction) {
  if (action.effectivenessResult === "Effective") return "Eficaz";
  if (action.effectivenessResult === "NotEffective") return "No eficaz · reemplazada";
  if (!action.action || !action.implementationDate) return "Completar nueva acción";
  return action.implementationDate.slice(0, 10) <= new Date().toISOString().slice(0, 10)
    ? "Lista para verificar" : "Pendiente de implementación";
}

export function QualityPg07R01Page() {
  const { active: presentation } = usePresentationMode();
  const [searchParams] = useSearchParams();
  const fromComplaint = searchParams.get("fromComplaint") || undefined;
  const fromAudit = searchParams.get("fromAudit") || undefined;
  const selectedParam = searchParams.get("selected") || undefined;
  const [complaint, setComplaint] = useState<QualityComplaint | null>(null);

  const [rows, setRows] = useState<QualityNonConformity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(!!fromComplaint || !!fromAudit);
  const [selectedId, setSelectedId] = useState<string | null>(selectedParam || null);
  const [filter, setFilter] = useState("all");
  const [ratingStep, setRatingStep] = useState(false);

  const [kind, setKind] = useState("NonConformity");
  const [description, setDescription] = useState(searchParams.get("desc") || "");
  const [origin, setOrigin] = useState(searchParams.get("origin") || (fromComplaint ? "Complaint" : fromAudit ? "Audit" : "Internal"));
  const [detectedAt, setDetectedAt] = useState(new Date().toISOString().slice(0, 10));
  const [responsible, setResponsible] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [controls, setControls] = useState("");
  const [notes, setNotes] = useState(fromAudit ? `Origen auditoría ${fromAudit}` : "");
  const [probability, setProbability] = useState("3");
  const [impact, setImpact] = useState("3");
  const [treatmentDecision, setTreatmentDecision] = useState("");
  const [treatmentRationale, setTreatmentRationale] = useState("");

  const [showActionForm, setShowActionForm] = useState(false);
  const [cause, setCause] = useState("");
  const [newAction, setNewAction] = useState("");
  const [actionResponsible, setActionResponsible] = useState("");
  const [implementationDate, setImplementationDate] = useState("");
  const [actionDrafts, setActionDrafts] = useState<Record<string, ActionDraft>>({});
  const [evaluationDrafts, setEvaluationDrafts] = useState<Record<string, EvaluationDraft>>({});

  const selected = rows.find((row) => row.id === selectedId) || null;
  const rating = previewRating(kind, Number(probability), Number(impact));
  const isMatrixKind = kind === "Risk" || kind === "Opportunity";
  const selectedIsMatrix = selected?.kind === "Risk" || selected?.kind === "Opportunity";
  const editable = !presentation && selected && !CLOSED.has(selected.status);

  const filtered = useMemo(() => rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "open") return OPEN.has(row.status);
    if (filter === "closed") return CLOSED.has(row.status);
    if (filter === "overdue") return !!row.isOverdue;
    if (filter.startsWith("kind:")) return row.kind === filter.slice(5);
    return row.status === filter;
  }), [rows, filter]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.listQualityPg07R01();
      setRows(response.rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!fromComplaint) return;
    void api.getQualityComplaint(fromComplaint)
      .then((source) => {
        setComplaint(source);
        setKind("NonConformity");
        setOrigin("Complaint");
        setDescription(source.description);
        setDetectedAt(dateInput(source.receivedAt));
        setResponsible(source.responsible || "");
        setNotes(`Queja ${source.number} · ${source.partyName} · ${source.channel} · ${source.partyContact || "sin contacto"}`);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [fromComplaint]);

  useEffect(() => {
    if (!selected?.sourceComplaintId) return;
    void api.getQualityComplaint(selected.sourceComplaintId).then(setComplaint).catch(() => setComplaint(null));
  }, [selected?.sourceComplaintId]);

  useEffect(() => {
    if (!selected) return;
    setActionDrafts(Object.fromEntries(selected.actions.map((a) => [a.id, {
      action: a.action, responsible: a.responsible, implementationDate: dateInput(a.implementationDate)
    }])));
    setEvaluationDrafts(Object.fromEntries(selected.actions.map((a) => [a.id, {
      result: "Pending" as const, check: ""
    }])));
  }, [selected?.id, selected?.updatedAtUtc]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (isMatrixKind && !ratingStep) {
      if (!description.trim()) { setError("Cargá la descripción antes de valorar."); return; }
      setError(null);
      setRatingStep(true);
      return;
    }
    if (!description.trim() || (isMatrixKind && !rating)) {
      setError("Completá la descripción y una valoración válida.");
      return;
    }
    if (rating?.allowsDecision && !treatmentDecision) {
      setError("Elegí si esta valoración amerita acciones.");
      return;
    }
    if (rating?.allowsDecision && treatmentDecision === "NoAction" && !treatmentRationale.trim()) {
      setError("Fundamentá la decisión de no tomar acciones.");
      return;
    }
    setBusy(true); setError(null); setMessage(null);
    try {
      const created = await api.createQualityNonConformity({
        kind, description: description.trim(), origin,
        detectedAt: detectedAt ? utcDate(detectedAt) : undefined,
        immediateAction: immediateAction.trim() || undefined,
        responsible: responsible.trim() || undefined,
        probability: isMatrixKind ? Number(probability) : undefined,
        impact: isMatrixKind ? Number(impact) : undefined,
        controls: isMatrixKind ? controls.trim() || undefined : undefined,
        sourceComplaintId: fromComplaint,
        notes: notes.trim() || undefined,
        treatmentDecision: rating?.allowsDecision ? treatmentDecision : undefined,
        treatmentRationale: rating?.allowsDecision ? treatmentRationale.trim() : undefined
      });
      setRows((current) => [created, ...current]);
      setSelectedId(created.id);
      setShowForm(false);
      setRatingStep(false);
      setMessage(`${created.number} creado. ${created.status === "Closed" ? "La valoración no requiere acciones; quedó cerrado." : "Continuá con el seguimiento."}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const mutate = async (operation: () => Promise<QualityNonConformity>, success: string) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const updated = await operation();
      setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
      setMessage(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally { setBusy(false); }
  };

  const addAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const saved = await mutate(() => api.addQualityPg07Action(selected.id, {
      cause: selectedIsMatrix ? "" : cause.trim(),
      action: newAction.trim(),
      responsible: actionResponsible.trim() || undefined,
      implementationDate: utcDate(implementationDate)
    }), "Acción agregada.");
    if (saved) {
      setCause(""); setNewAction(""); setActionResponsible(""); setImplementationDate(""); setShowActionForm(false);
    }
  };

  const saveAction = (action: QualityCorrectiveAction) => {
    if (!selected) return;
    const draft = actionDrafts[action.id];
    if (!draft?.action.trim() || !draft.implementationDate) {
      setError("Cargá la acción y su fecha de implementación.");
      return;
    }
    void mutate(() => api.updateQualityPg07Action(selected.id, action.id, {
      action: draft.action.trim(), responsible: draft.responsible.trim(), implementationDate: utcDate(draft.implementationDate)
    }), "Plan de acción guardado.");
  };

  const evaluate = (action: QualityCorrectiveAction) => {
    if (!selected) return;
    const draft = evaluationDrafts[action.id] || { result: "Pending", check: "" };
    void mutate(() => api.evaluateQualityPg07Action(selected.id, action.id, {
      result: draft.result, check: draft.check.trim()
    }), draft.result === "Effective" ? "Acción eficaz registrada." :
      draft.result === "NotEffective" ? "Acción cerrada como no eficaz. Se abrió una acción sucesora." :
      "La verificación sigue pendiente.");
  };

  const cancel = async () => {
    if (!selected || !window.confirm(`¿Anular ${selected.number}?`)) return;
    await mutate(() => api.cancelQualityNonConformity(selected.id), "Registro anulado.");
  };

  const exportExcel = () => {
    const columns: ExcelColumn<QualityNonConformity>[] = [
      { key: "number", header: "Número" },
      { key: "kind", header: "Tipo", value: (row) => KIND_LABEL[row.kind] || row.kind },
      { key: "detectedAt", header: "Detectado", value: (row) => excelDate(row.detectedAt) },
      { key: "origin", header: "Origen" },
      { key: "description", header: "Descripción" },
      { key: "status", header: "Estado", value: (row) => STATUS_LABEL[row.status] || row.status },
      { key: "responsible", header: "Responsable" },
      { key: "effectiveDueAt", header: "Próxima implementación", value: (row) => row.effectiveDueAt ? excelDate(row.effectiveDueAt) : "" },
      { key: "level", header: "Nivel" },
      { key: "rootCause", header: "Causas", value: (row) => row.actions.map((a) => a.cause).filter(Boolean).join("; ") },
      { key: "correctiveAction", header: "Acciones", value: (row) => row.actions.map((a) => a.action).filter(Boolean).join("; ") }
    ];
    void exportToExcel(`PG07-R1_${filter}`, filtered, columns);
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link to="/calidad/documentos/PG07-R01" style={{ fontSize: 13 }}>← Procedimiento PG07</Link>
          <h1 style={{ margin: "8px 0 0" }}>PG07-R1 · NC, TNC, Riesgos y Oportunidades</h1>
          <p className="muted">NC y TNC comparten el seguimiento por causas. Riesgos y oportunidades siguen su propia matriz de valoración.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Link className="btn btn-outline" to="/calidad/registros">Índice registros</Link>
          <button type="button" className="btn btn-outline" disabled={!filtered.length} onClick={exportExcel}>Exportar Excel ({filtered.length})</button>
          <button type="button" className="btn btn-primary" disabled={busy || presentation} onClick={() => { setShowForm((open) => !open); setRatingStep(false); }}>
            {showForm ? "Cerrar alta" : "Nuevo registro"}
          </button>
        </div>
      </div>

      <div className="card pad" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong>Filtro:</strong>
        {([["all", "Todos"], ["open", "Abiertos"], ["closed", "Cerrados"], ["overdue", "Implementación vencida"],
          ["kind:NonConformity", "NC"], ["kind:NonConformingWork", "TNC"], ["kind:Risk", "Riesgos"], ["kind:Opportunity", "OM"]] as const)
          .map(([value, label]) => <button type="button" key={value}
            className={filter === value ? "btn btn-primary compact" : "btn ghost compact"}
            onClick={() => setFilter(value)}>{label}</button>)}
      </div>

      {(error || message) && <div className="card pad" style={{ marginTop: 12, background: error ? "#fef2f2" : "#f0fdf4", color: error ? "#991b1b" : "#166534" }}>{error || message}</div>}

      {showForm && <form className="card pad" style={{ marginTop: 16 }} onSubmit={(event) => void onCreate(event)}>
        <h2 style={{ marginTop: 0 }}>{ratingStep ? "Valoración y criterio" : "Identificación y acciones"}</h2>
        {!ratingStep ? <>
          {complaint && fromComplaint && <div className="card pad" style={{ marginBottom: 14, background: "#eff6ff" }}>
            <strong>Datos de la queja {complaint.number}</strong>
            <div>{complaint.partyName} · {complaint.partyContact || "Sin contacto"} · {complaint.channel} · {dateLabel(complaint.receivedAt)}</div>
            <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{complaint.description}</p>
          </div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            <label>Tipo *
              <select value={kind} disabled={!!fromComplaint} onChange={(event) => { setKind(event.target.value); setRatingStep(false); }}>
                <option value="NonConformity">No conformidad</option>
                <option value="NonConformingWork">Trabajo no conforme</option>
                <option value="Risk">Riesgo</option>
                <option value="Opportunity">Oportunidad de mejora</option>
              </select>
            </label>
            <label>Origen
              <select value={origin} disabled={!!fromComplaint} onChange={(event) => setOrigin(event.target.value)}>
                <option value="Internal">Interno</option><option value="Complaint">Queja</option>
                <option value="Audit">Auditoría</option><option value="Customer">Cliente</option><option value="Other">Otro</option>
              </select>
            </label>
            <label>Fecha de detección <input type="date" value={detectedAt} onChange={(event) => setDetectedAt(event.target.value)} /></label>
            <label>Responsable <input value={responsible} onChange={(event) => setResponsible(event.target.value)} /></label>
          </div>
          <label style={{ marginTop: 12 }}>Descripción *
            <textarea required value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
          <label style={{ marginTop: 12 }}>{isMatrixKind ? "Acciones propuestas / controles" : "Corrección inmediata"}
            <textarea value={isMatrixKind ? controls : immediateAction}
              onChange={(event) => isMatrixKind ? setControls(event.target.value) : setImmediateAction(event.target.value)} rows={2} />
          </label>
          {!isMatrixKind && <p className="muted" style={{ fontSize: 13 }}>Luego podrás agregar una causa y acción correctiva por cada situación detectada, con su fecha de implementación.</p>}
        </> : <>
          <p>{description}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <label>Probabilidad (1–5)<input type="number" min={1} max={5} required value={probability} onChange={(event) => setProbability(event.target.value)} /></label>
            <label>{kind === "Opportunity" ? "Impacto / beneficio" : "Impacto"} (1–5)
              <input type="number" min={1} max={5} required value={impact} onChange={(event) => setImpact(event.target.value)} /></label>
          </div>
          {rating && <div className="card pad" style={{ marginTop: 14, background: rating.level <= 2 ? "#f0fdf4" : rating.level >= 15 ? "#fef2f2" : "#fffbeb" }}>
            <strong>Nivel {rating.level} · {rating.valuation}</strong>
            <p style={{ marginBottom: 0 }}>Criterio: {rating.criterion}</p>
          </div>}
          {rating?.allowsDecision && <>
            <label style={{ marginTop: 12 }}>Decisión de tratamiento *
              <select value={treatmentDecision} onChange={(event) => setTreatmentDecision(event.target.value)}>
                <option value="">Seleccionar</option><option value="Treat">Tomar acciones</option>
                <option value="NoAction">No amerita acciones y cerrar</option>
              </select>
            </label>
            {treatmentDecision === "NoAction" && <label style={{ marginTop: 12 }}>Fundamento *
              <textarea required value={treatmentRationale} onChange={(event) => setTreatmentRationale(event.target.value)} rows={2} /></label>}
          </>}
          {rating?.requiresAction && <p>Esta valoración exige acciones. Al generar el registro podrás cargarlas con responsable y fecha de implementación.</p>}
          {rating && rating.level <= 2 && <p>Según el criterio aprobado, no requiere acciones y se cerrará al guardar.</p>}
        </>}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {ratingStep && <button type="button" className="btn ghost" onClick={() => setRatingStep(false)}>Volver</button>}
          <button type="button" className="btn ghost" onClick={() => { setShowForm(false); setRatingStep(false); }}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : isMatrixKind && !ratingStep ? "Continuar a valoración" : "Generar registro"}</button>
        </div>
      </form>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 16, marginTop: 16, alignItems: "start" }}>
        <section className="card pad">
          <h2 style={{ marginTop: 0 }}>Registros ({filtered.length})</h2>
          {loading ? <p>Cargando…</p> : !filtered.length ? <p className="muted">No hay registros con este filtro.</p> :
            <div className="table-wrap"><table className="table"><thead><tr>
              <th>Nº</th><th>Tipo</th><th>Estado</th><th>Próxima implementación</th>
            </tr></thead><tbody>{filtered.map((row) => <tr key={row.id} onClick={() => setSelectedId(row.id)}
              style={{ cursor: "pointer", background: selectedId === row.id ? "#ecfeff" : row.isOverdue ? "#fef2f2" : undefined }}>
              <td><strong>{row.number}</strong></td><td>{KIND_LABEL[row.kind] || row.kind}</td>
              <td>{STATUS_LABEL[row.status] || row.status}</td>
              <td>{dateLabel(row.effectiveDueAt)}</td>
            </tr>)}</tbody></table></div>}
        </section>
        <section className="card pad">
          {!selected ? <p className="muted">Seleccioná un registro para ver el seguimiento.</p> : <>
            <h2 style={{ marginTop: 0 }}>{selected.number} · {KIND_LABEL[selected.kind] || selected.kind}</h2>
            <p className="muted">{STATUS_LABEL[selected.status] || selected.status}{selected.isOverdue ? " · implementación vencida" : ""}</p>
            <Link className="btn btn-outline compact" to={`/calidad/registros/nc/${selected.id}/pdf`}>Exportar PDF</Link>
            {selected.sourceComplaintId && complaint?.id === selected.sourceComplaintId && <div className="card pad" style={{ marginTop: 14, background: "#eff6ff" }}>
              <strong>Queja origen: {complaint.number}</strong>
              <div>{complaint.partyName} · {complaint.partyContact || "Sin contacto"} · {complaint.channel} · {dateLabel(complaint.receivedAt)}</div>
              <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{complaint.description}</p>
            </div>}
            <h3>Descripción</h3><p style={{ whiteSpace: "pre-wrap" }}>{selected.description}</p>
            {selected.immediateAction && <p><strong>Corrección inmediata:</strong> {selected.immediateAction}</p>}
            {selectedIsMatrix && selected.rating && <div className="card pad" style={{ marginTop: 12, background: selected.rating.level <= 2 ? "#f0fdf4" : "#fffbeb" }}>
              <strong>Probabilidad {selected.probability} × {selected.kind === "Opportunity" ? "beneficio" : "impacto"} {selected.impact} = {selected.rating.level}</strong>
              <p>{selected.rating.valuation} · {selected.rating.criterion}</p>
              {selected.controls && <p>Acciones propuestas: {selected.controls}</p>}
              {selected.treatmentRationale && <p>Fundamento: {selected.treatmentRationale}</p>}
            </div>}
            {selectedIsMatrix && editable && selected.rating?.allowsDecision && !selected.treatmentDecision && <div style={{ marginTop: 12 }}>
              <p>Definí si esta valoración amerita acciones.</p>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void mutate(
                () => api.updateQualityNonConformity(selected.id, { treatmentDecision: "Treat" }), "Tratamiento iniciado.")}>Tomar acciones</button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => {
                const rationale = window.prompt("Fundamento para cerrar sin acciones:");
                if (rationale?.trim()) void mutate(() => api.updateQualityNonConformity(selected.id, {
                  treatmentDecision: "NoAction", treatmentRationale: rationale.trim()
                }), "Registro cerrado según el criterio.");
              }}>No amerita acciones</button>
            </div>}

            <h3 style={{ marginBottom: 6 }}>Causas y acciones ({selected.actions.length})</h3>
            {selected.actions.length === 0 && <p className="muted">Aún no hay acciones registradas.</p>}
            {selected.actions.map((action, index) => {
              const draft = actionDrafts[action.id] || { action: action.action, responsible: action.responsible, implementationDate: dateInput(action.implementationDate) };
              const evaluation = evaluationDrafts[action.id] || { result: "Pending" as const, check: "" };
              const canEvaluate = !!action.implementationDate && !!action.action &&
                dateInput(action.implementationDate) <= new Date().toISOString().slice(0, 10);
              return <article key={action.id} className="card pad" style={{ marginTop: 10, background: "#f8fafc" }}>
                <strong>{action.replacesActionId ? "Acción sucesora" : `Causa / acción ${index + 1}`}</strong>
                <span style={{ marginLeft: 8, color: action.effectivenessResult === "NotEffective" ? "#b91c1c" : "#475569" }}>{actionStatus(action)}</span>
                {!selectedIsMatrix && <p><strong>Causa:</strong> {action.cause || "—"}</p>}
                {editable && action.effectivenessResult === "Pending" ? <>
                  <label style={{ marginTop: 8 }}>Acción correctiva / tratamiento
                    <textarea value={draft.action} rows={2} onChange={(event) => setActionDrafts((current) => ({
                      ...current, [action.id]: { ...draft, action: event.target.value }
                    }))} /></label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 }}>
                    <label>Responsable<input value={draft.responsible} onChange={(event) => setActionDrafts((current) => ({
                      ...current, [action.id]: { ...draft, responsible: event.target.value }
                    }))} /></label>
                    <label>Fecha de implementación<input type="date" value={draft.implementationDate} onChange={(event) => setActionDrafts((current) => ({
                      ...current, [action.id]: { ...draft, implementationDate: event.target.value }
                    }))} /></label>
                  </div>
                  <button type="button" className="btn btn-outline compact" style={{ marginTop: 8 }} disabled={busy} onClick={() => saveAction(action)}>Guardar acción</button>
                  {canEvaluate && <div style={{ marginTop: 14, borderTop: "1px solid #cbd5e1", paddingTop: 12 }}>
                    <strong>Verificación de eficacia</strong>
                    <label style={{ marginTop: 8 }}>Resultado
                      <select value={evaluation.result} onChange={(event) => setEvaluationDrafts((current) => ({
                        ...current, [action.id]: { ...evaluation, result: event.target.value as EvaluationDraft["result"] }
                      }))}>
                        <option value="Pending">Pendiente</option><option value="Effective">Eficaz</option>
                        <option value="NotEffective">No eficaz</option>
                      </select></label>
                    <label style={{ marginTop: 8 }}>Evidencia / comentario
                      <textarea value={evaluation.check} rows={2} onChange={(event) => setEvaluationDrafts((current) => ({
                        ...current, [action.id]: { ...evaluation, check: event.target.value }
                      }))} /></label>
                    <button type="button" className="btn btn-primary compact" disabled={busy} onClick={() => evaluate(action)}>Registrar evaluación</button>
                  </div>}
                  {!canEvaluate && action.implementationDate && <p className="muted" style={{ fontSize: 13 }}>La verificación se habilita al llegar la fecha de implementación.</p>}
                </> : <>
                  <p>{action.action || "—"} · {action.responsible || "Sin responsable"} · implementación {dateLabel(action.implementationDate)}</p>
                  {action.effectivenessCheck && <p><strong>Verificación:</strong> {action.effectivenessCheck} · {dateLabel(action.evaluatedAtUtc)}</p>}
                </>}
              </article>;
            })}
            {editable && <>
              <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => setShowActionForm((open) => !open)}>
                {selectedIsMatrix ? "Agregar acción" : "＋ Agregar otra causa y acción"}
              </button>
              {showActionForm && <form className="card pad" style={{ marginTop: 12 }} onSubmit={(event) => void addAction(event)}>
                {!selectedIsMatrix && <label>Causa raíz *<textarea required value={cause} onChange={(event) => setCause(event.target.value)} rows={2} /></label>}
                <label style={{ marginTop: 8 }}>Acción *<textarea required value={newAction} onChange={(event) => setNewAction(event.target.value)} rows={2} /></label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 8 }}>
                  <label>Responsable<input value={actionResponsible} onChange={(event) => setActionResponsible(event.target.value)} /></label>
                  <label>Fecha de implementación *<input type="date" required value={implementationDate} onChange={(event) => setImplementationDate(event.target.value)} /></label>
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 10 }}>Guardar causa y acción</button>
              </form>}
              <button type="button" className="btn ghost" style={{ marginTop: 12, marginLeft: 8 }} disabled={busy} onClick={() => void cancel()}>Anular registro</button>
            </>}
            {selected.status === "Closed" && selected.actions.length > 0 && <p style={{ color: "#166534", fontWeight: 700 }}>Todas las causas tienen una acción final eficaz. Registro cerrado.</p>}
            <QualityAuditHistory entityType="NonConformity" entityId={selected.id} />
          </>}
        </section>
      </div>
    </div>
  );
}
