import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityNonConformity } from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";

const KIND_LABEL: Record<string, string> = {
  NonConformity: "NC",
  NonConformingWork: "TNC",
  Risk: "Riesgo",
  Opportunity: "OM"
};

const STATUS_LABEL: Record<string, string> = {
  Open: "Abierta",
  InAnalysis: "En análisis",
  ActionPending: "Acción pendiente",
  EffectivenessCheck: "Verificación eficacia",
  Closed: "Cerrada",
  Cancelled: "Anulada"
};

const OPEN = new Set(["Open", "InAnalysis", "ActionPending", "EffectivenessCheck"]);
const CLOSED = new Set(["Closed", "Cancelled"]);

type Filter = "all" | "open" | "closed" | "overdue" | string;

function kindLabel(k: string) {
  return KIND_LABEL[k] ?? k;
}
function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}

export function QualityPg07R01Page() {
  const [searchParams] = useSearchParams();
  const fromComplaint = searchParams.get("fromComplaint") || undefined;

  const [rows, setRows] = useState<QualityNonConformity[]>([]);
  const [overdueOpen, setOverdueOpen] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(!!fromComplaint);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [kind, setKind] = useState("NonConformity");
  const [description, setDescription] = useState("");
  const [origin, setOrigin] = useState(fromComplaint ? "Complaint" : "Internal");
  const [immediateAction, setImmediateAction] = useState("");
  const [responsible, setResponsible] = useState("");
  const [detectedAt, setDetectedAt] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [probability, setProbability] = useState("3");
  const [impact, setImpact] = useState("3");
  const [controls, setControls] = useState("");
  const [notes, setNotes] = useState("");

  const [rootCauseMethod, setRootCauseMethod] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [effectivenessCheck, setEffectivenessCheck] = useState("");
  const [effectivenessResult, setEffectivenessResult] = useState("Pending");

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "all") return true;
      if (filter === "open") return OPEN.has(r.status);
      if (filter === "closed") return CLOSED.has(r.status);
      if (filter === "overdue") return !!r.isOverdue;
      if (filter.startsWith("kind:")) return r.kind === filter.slice(5);
      return r.status === filter;
    });
  }, [rows, filter]);

  const load = () => {
    setLoading(true);
    api.listQualityPg07R01()
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
    setRootCauseMethod(selected.rootCauseMethod || "");
    setRootCause(selected.rootCause || "");
    setCorrectiveAction(selected.correctiveAction || "");
    setEffectivenessCheck(selected.effectivenessCheck || "");
    setEffectivenessResult(selected.effectivenessResult || "Pending");
    setImmediateAction(selected.immediateAction || "");
    setControls(selected.controls || "");
  }, [selected?.id]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityNonConformity({
        kind,
        description: description.trim(),
        origin,
        immediateAction: immediateAction.trim() || undefined,
        responsible: responsible.trim() || undefined,
        detectedAt: detectedAt ? new Date(detectedAt).toISOString() : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        probability: kind === "Risk" ? Number(probability) : undefined,
        impact: kind === "Risk" ? Number(impact) : undefined,
        controls: kind === "Risk" ? controls.trim() || undefined : undefined,
        sourceComplaintId: fromComplaint,
        notes: notes.trim() || undefined
      });
      setMsg(`${created.number} generado en el sistema.`);
      setShowForm(false);
      setDescription("");
      setImmediateAction("");
      setNotes("");
      setSelectedId(created.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body: Parameters<typeof api.updateQualityNonConformity>[1], ok: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.updateQualityNonConformity(selected.id, body);
      setMsg(ok);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async (id: string, number: string) => {
    if (!window.confirm(`¿Anular ${number}?`)) return;
    setBusy(true);
    try {
      await api.cancelQualityNonConformity(id);
      if (selectedId === id) setSelectedId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const editable = selected && selected.status !== "Closed" && selected.status !== "Cancelled";

  const exportExcel = () => {
    const columns: ExcelColumn<QualityNonConformity>[] = [
      { key: "number", header: "Número" },
      { key: "kind", header: "Tipo", value: (r) => kindLabel(r.kind) },
      { key: "detectedAt", header: "Detectado", value: (r) => excelDate(r.detectedAt) },
      { key: "origin", header: "Origen" },
      { key: "description", header: "Descripción" },
      { key: "status", header: "Estado", value: (r) => statusLabel(r.status) },
      { key: "responsible", header: "Responsable" },
      { key: "dueDate", header: "Vencimiento", value: (r) => (r.effectiveDueAt ? excelDate(r.effectiveDueAt) : "") },
      { key: "isOverdue", header: "Vencido", value: (r) => (r.isOverdue ? "Sí" : "No") },
      { key: "rootCause", header: "Causa raíz" },
      { key: "correctiveAction", header: "Acción correctiva" },
      { key: "level", header: "Nivel riesgo" }
    ];
    void exportToExcel(`PG07-R1_${filter}`, filtered, columns);
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to="/calidad/documentos/PG07-R01" style={{ fontSize: 13 }}>← Plantilla PG07-R1</Link>
          <h1 style={{ margin: "8px 0 0" }}>PG07-R1 · NC, TNC, Riesgos y Oportunidades</h1>
          <p style={{ color: "#64748b", marginTop: 6, maxWidth: 740 }}>
            Cada registro se <strong>genera en el sistema</strong> (NC/TNC/R/OM-AAAA-NNNN). El PDF es la planilla exportable; no se sube el Word como registro.
          </p>
          {overdueOpen > 0 && (
            <p style={{ color: "#b91c1c", fontWeight: 700, marginTop: 8 }}>{overdueOpen} abierto(s) fuera de plazo</p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-outline" to="/calidad/registros">Índice registros</Link>
          <button type="button" className="btn btn-outline" disabled={filtered.length === 0} onClick={exportExcel}>
            Exportar Excel ({filtered.length})
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cerrar alta" : "Nuevo registro"}
          </button>
        </div>
      </div>

      <div className="card pad" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Filtro:</span>
        {(
          [
            ["all", "Todos"],
            ["open", "Abiertos"],
            ["closed", "Cerrados"],
            ["overdue", "Vencidos"],
            ["kind:NonConformity", "Solo NC"],
            ["kind:NonConformingWork", "Solo TNC"],
            ["kind:Risk", "Solo Riesgos"],
            ["kind:Opportunity", "Solo OM"]
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? "btn btn-primary compact" : "btn ghost compact"}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {(error || msg) && (
        <div className="card pad" style={{ marginTop: 12, background: error ? "#fef2f2" : "#f0fdf4", color: error ? "#991b1b" : "#166534" }}>
          {error || msg}
        </div>
      )}

      {showForm && (
        <form className="card pad" style={{ marginTop: 16 }} onSubmit={(e) => void onCreate(e)}>
          <h3 style={{ marginTop: 0 }}>Alta de registro PG07-R1</h3>
          {fromComplaint && <p className="muted" style={{ fontSize: 13 }}>Vinculado a queja {fromComplaint}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <label>
              Tipo *
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="NonConformity">NC — No conformidad</option>
                <option value="NonConformingWork">TNC — Trabajo no conforme</option>
                <option value="Risk">R — Riesgo</option>
                <option value="Opportunity">OM — Oportunidad de mejora</option>
              </select>
            </label>
            <label>
              Origen
              <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="Internal">Interno</option>
                <option value="Complaint">Queja</option>
                <option value="Audit">Auditoría</option>
                <option value="Customer">Cliente</option>
                <option value="Other">Otro</option>
              </select>
            </label>
            <label>
              Detectado
              <input type="date" value={detectedAt} onChange={(e) => setDetectedAt(e.target.value)} />
            </label>
            <label>
              Vencimiento acción
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label>
              Responsable
              <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
            </label>
          </div>
          {kind === "Risk" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 12 }}>
              <label>
                Probabilidad (1-5)
                <input type="number" min={1} max={5} value={probability} onChange={(e) => setProbability(e.target.value)} />
              </label>
              <label>
                Impacto (1-5)
                <input type="number" min={1} max={5} value={impact} onChange={(e) => setImpact(e.target.value)} />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Controles
                <input value={controls} onChange={(e) => setControls(e.target.value)} style={{ width: "100%" }} />
              </label>
            </div>
          )}
          <label style={{ display: "block", marginTop: 12 }}>
            Descripción *
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>
            Acción inmediata
            <textarea value={immediateAction} onChange={(e) => setImmediateAction(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Generar registro"}</button>
          </div>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(300px, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
        <div className="card pad">
          <h3 style={{ marginTop: 0 }}>Registros ({filtered.length})</h3>
          {loading ? (
            <div className="muted">Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="muted">{rows.length === 0 ? "Sin registros aún." : "Ninguno con este filtro."}</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      style={{
                        cursor: "pointer",
                        background: selectedId === r.id ? "#ecfeff" : r.isOverdue ? "#fef2f2" : undefined
                      }}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td><strong>{r.number}</strong></td>
                      <td>{kindLabel(r.kind)}</td>
                      <td>{statusLabel(r.status)}</td>
                      <td style={{ color: r.isOverdue ? "#b91c1c" : undefined, fontWeight: r.isOverdue ? 700 : undefined }}>
                        {r.effectiveDueAt ? new Date(r.effectiveDueAt).toLocaleDateString("es-AR") : "—"}
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
            <p className="muted">Seleccioná un registro para avanzar el seguimiento.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{selected.number} · {kindLabel(selected.kind)}</h3>
              <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                {statusLabel(selected.status)}
                {selected.isOverdue ? <span style={{ color: "#b91c1c", fontWeight: 700 }}> · Vencido</span> : null}
              </p>
              <p style={{ marginBottom: 12 }}>
                <Link className="btn btn-outline compact" to={`/calidad/registros/nc/${selected.id}/pdf`}>
                  Exportar PDF (planilla + logo)
                </Link>
              </p>
              <p style={{ whiteSpace: "pre-wrap" }}>{selected.description}</p>

              {editable && (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {selected.status === "Open" && (
                      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void patch({ status: "InAnalysis" }, "En análisis.")}>
                        Iniciar análisis
                      </button>
                    )}
                    {selected.status === "InAnalysis" && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy}
                        onClick={() => void patch({ status: "ActionPending", rootCauseMethod, rootCause, correctiveAction, immediateAction }, "Acción pendiente.")}
                      >
                        Definir acción
                      </button>
                    )}
                    {selected.status === "ActionPending" && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy}
                        onClick={() => void patch({ status: "EffectivenessCheck", correctiveAction }, "A verificación de eficacia.")}
                      >
                        Verificar eficacia
                      </button>
                    )}
                    {selected.status === "EffectivenessCheck" && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => void patch({
                          status: "Closed",
                          effectivenessCheck,
                          effectivenessResult,
                          closedAt: new Date().toISOString()
                        }, "Registro cerrado.")}
                      >
                        Cerrar
                      </button>
                    )}
                    <button type="button" className="btn ghost" disabled={busy} onClick={() => void onCancel(selected.id, selected.number)}>
                      Anular
                    </button>
                  </div>

                  <label style={{ display: "block", marginBottom: 8 }}>
                    Método causa raíz
                    <input value={rootCauseMethod} onChange={(e) => setRootCauseMethod(e.target.value)} style={{ width: "100%" }} placeholder="5 porqués, Ishikawa…" />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Causa raíz
                    <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} rows={2} style={{ width: "100%" }} />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Acción correctiva / mejora
                    <textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} rows={2} style={{ width: "100%" }} />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Verificación de eficacia
                    <textarea value={effectivenessCheck} onChange={(e) => setEffectivenessCheck(e.target.value)} rows={2} style={{ width: "100%" }} />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Resultado eficacia
                    <select value={effectivenessResult} onChange={(e) => setEffectivenessResult(e.target.value)}>
                      <option value="Pending">Pendiente</option>
                      <option value="Effective">Eficaz</option>
                      <option value="NotEffective">No eficaz</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => void patch({
                      rootCauseMethod, rootCause, correctiveAction, effectivenessCheck, effectivenessResult, immediateAction,
                      controls: selected.kind === "Risk" ? controls : undefined
                    }, "Borrador guardado.")}
                  >
                    Guardar textos
                  </button>
                </>
              )}

              {!editable && (
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  <div><strong>Causa:</strong> {selected.rootCause || "—"}</div>
                  <div style={{ marginTop: 8 }}><strong>Acción:</strong> {selected.correctiveAction || "—"}</div>
                  <div style={{ marginTop: 8 }}><strong>Eficacia:</strong> {selected.effectivenessResult || "—"} · {selected.effectivenessCheck || ""}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
