import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityManagementReview } from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";

const STATUS_LABEL: Record<string, string> = {
  Draft: "Borrador",
  Completed: "Completada",
  Cancelled: "Anulada"
};

type Filter = "all" | "Draft" | "Completed" | "Cancelled";

type SnapshotCounts = {
  complaints?: { total?: number; open?: number; closed?: number };
  nonConformities?: { total?: number; open?: number; byKind?: Record<string, number> };
  audits?: { total?: number; byStatus?: Record<string, number> };
  trainings?: { planned?: number; done?: number };
  authorizations?: { authorized?: number; expiringSoon?: number };
  supplierEvaluations?: { approved?: number; suspended?: number };
  performanceReviews?: { completed?: number };
  indicators?: { active?: number; belowTarget?: string[] };
  generatedAtUtc?: string;
};

function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}

function parseSnapshot(raw: unknown): SnapshotCounts | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as SnapshotCounts;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as SnapshotCounts;
  return null;
}

function SnapshotSummary({ snapshot }: { snapshot: SnapshotCounts | null }) {
  if (!snapshot) {
    return <p style={{ fontSize: 13, color: "#64748b" }}>Sin snapshot de inputs.</p>;
  }

  const kindEntries = snapshot.nonConformities?.byKind
    ? Object.entries(snapshot.nonConformities.byKind)
    : [];
  const auditEntries = snapshot.audits?.byStatus ? Object.entries(snapshot.audits.byStatus) : [];
  const below = snapshot.indicators?.belowTarget ?? [];

  return (
    <dl
      style={{
        margin: 0,
        fontSize: 13,
        color: "#64748b",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "4px 12px"
      }}
    >
      <dt>Quejas</dt>
      <dd style={{ margin: 0 }}>
        total {snapshot.complaints?.total ?? 0} · abiertas {snapshot.complaints?.open ?? 0} · cerradas{" "}
        {snapshot.complaints?.closed ?? 0}
      </dd>
      <dt>NC / R / OP</dt>
      <dd style={{ margin: 0 }}>
        total {snapshot.nonConformities?.total ?? 0} · abiertas {snapshot.nonConformities?.open ?? 0}
        {kindEntries.length > 0
          ? ` · por tipo: ${kindEntries.map(([k, v]) => `${k}=${v}`).join(", ")}`
          : ""}
      </dd>
      <dt>Auditorías</dt>
      <dd style={{ margin: 0 }}>
        total {snapshot.audits?.total ?? 0}
        {auditEntries.length > 0
          ? ` · ${auditEntries.map(([k, v]) => `${statusLabel(k)}=${v}`).join(", ")}`
          : ""}
      </dd>
      <dt>Capacitaciones</dt>
      <dd style={{ margin: 0 }}>
        planificadas {snapshot.trainings?.planned ?? 0} · realizadas {snapshot.trainings?.done ?? 0}
      </dd>
      <dt>Autorizaciones</dt>
      <dd style={{ margin: 0 }}>
        vigentes {snapshot.authorizations?.authorized ?? 0} · por vencer{" "}
        {snapshot.authorizations?.expiringSoon ?? 0}
      </dd>
      <dt>Proveedores</dt>
      <dd style={{ margin: 0 }}>
        aprobados {snapshot.supplierEvaluations?.approved ?? 0} · suspendidos{" "}
        {snapshot.supplierEvaluations?.suspended ?? 0} · desempeños{" "}
        {snapshot.performanceReviews?.completed ?? 0}
      </dd>
      <dt>Indicadores</dt>
      <dd style={{ margin: 0 }}>
        activos {snapshot.indicators?.active ?? 0}
        {below.length > 0 ? ` · bajo meta: ${below.join(", ")}` : ""}
      </dd>
      {snapshot.generatedAtUtc ? (
        <>
          <dt>Generado</dt>
          <dd style={{ margin: 0 }}>{new Date(snapshot.generatedAtUtc).toLocaleString("es-AR")}</dd>
        </>
      ) : null}
    </dl>
  );
}

export function QualityPg08R01Page() {
  const currentYear = new Date().getFullYear();
  const [rows, setRows] = useState<QualityManagementReview[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const [programYear, setProgramYear] = useState(String(currentYear));
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendees, setAttendees] = useState("");
  const [inputsNotes, setInputsNotes] = useState("");
  const [notes, setNotes] = useState("");

  const [editAttendees, setEditAttendees] = useState("");
  const [editInputsNotes, setEditInputsNotes] = useState("");
  const [editDecisions, setEditDecisions] = useState("");
  const [editActions, setEditActions] = useState("");
  const [editFollowUp, setEditFollowUp] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editReviewDate, setEditReviewDate] = useState("");

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const snapshot = useMemo(
    () => parseSnapshot(selected?.inputsSnapshot ?? selected?.inputsSnapshotJson),
    [selected?.id, selected?.inputsSnapshot, selected?.inputsSnapshotJson]
  );

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.programYear));
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [rows, currentYear]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (yearFilter !== "all" && String(r.programYear) !== yearFilter) return false;
      if (filter === "all") return true;
      return r.status === filter;
    });
  }, [rows, filter, yearFilter]);

  const load = () => {
    setLoading(true);
    api
      .listQualityPg08R01()
      .then((res) => {
        setRows(res.rows || []);
        setDraftCount(res.draftCount ?? 0);
        setCompletedCount(res.completedCount ?? 0);
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
    setEditAttendees(selected.attendees || "");
    setEditInputsNotes(selected.inputsNotes || "");
    setEditDecisions(selected.decisions || "");
    setEditActions(selected.actions || "");
    setEditFollowUp(selected.followUp || "");
    setEditNotes(selected.notes || "");
    setEditReviewDate(selected.reviewDate ? selected.reviewDate.slice(0, 10) : "");
  }, [selected?.id]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityManagementReview({
        programYear: Number(programYear) || currentYear,
        reviewDate: reviewDate ? new Date(reviewDate).toISOString() : undefined,
        attendees: attendees.trim() || undefined,
        inputsNotes: inputsNotes.trim() || undefined,
        notes: notes.trim() || undefined
      });
      setMsg(`${created.number} creada (borrador) con inputs del SGC.`);
      setShowForm(false);
      setAttendees("");
      setInputsNotes("");
      setNotes("");
      setSelectedId(created.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body: Parameters<typeof api.updateQualityManagementReview>[1], ok: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.updateQualityManagementReview(selected.id, body);
      setMsg(ok);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRefreshInputs = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.refreshQualityManagementReviewInputs(selected.id);
      setMsg("Inputs regenerados desde el SGC.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onComplete = async () => {
    if (!selected) return;
    if (!editDecisions.trim()) {
      setError("Las decisiones son obligatorias para completar la revisión.");
      return;
    }
    await patch(
      {
        status: "Completed",
        attendees: editAttendees,
        inputsNotes: editInputsNotes,
        decisions: editDecisions,
        actions: editActions,
        followUp: editFollowUp,
        notes: editNotes,
        reviewDate: editReviewDate ? new Date(editReviewDate).toISOString() : undefined
      },
      "Revisión completada."
    );
  };

  const onCancel = async (id: string, number: string) => {
    if (!window.confirm(`¿Anular ${number}?`)) return;
    setBusy(true);
    try {
      await api.cancelQualityManagementReview(id);
      if (selectedId === id) setSelectedId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const editable = selected && selected.status === "Draft";

  const exportExcel = () => {
    const columns: ExcelColumn<QualityManagementReview>[] = [
      { key: "number", header: "Número" },
      { key: "programYear", header: "Año" },
      { key: "reviewDate", header: "Fecha revisión", value: (r) => excelDate(r.reviewDate) },
      { key: "attendees", header: "Participantes" },
      { key: "status", header: "Estado", value: (r) => statusLabel(r.status) },
      { key: "decisions", header: "Decisiones" },
      { key: "actions", header: "Acciones" },
      { key: "followUp", header: "Seguimiento" },
      { key: "notes", header: "Notas" }
    ];
    void exportToExcel(`PG08-R01_revisiones_${yearFilter}_${filter}`, filtered, columns);
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to="/calidad/documentos/PG08-R01" style={{ fontSize: 13 }}>
            ← Plantilla PG08-R01
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>PG08-R01 · Revisión por la dirección</h1>
          <p style={{ marginTop: 6, color: "#64748b", maxWidth: 640 }}>
            Cada revisión se <strong>genera en el sistema</strong> (REV-AAAA-NNNN). Los inputs del año
            (quejas, NC, auditorías, indicadores, personal, proveedores) se arman solos al crear o al
            refrescar.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline" disabled={filtered.length === 0} onClick={exportExcel}>
            Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cerrar alta" : "Nueva revisión"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {msg && <p style={{ color: "#15803d" }}>{msg}</p>}
      <p style={{ fontSize: 13, color: "#64748b" }}>
        Borradores: <strong>{draftCount}</strong> · Completadas: <strong>{completedCount}</strong> · Total:{" "}
        {rows.length}
      </p>

      {showForm && (
        <form className="card pad" onSubmit={(e) => void onCreate(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nueva revisión por la dirección</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label>
              Año programa
              <input type="number" value={programYear} onChange={(e) => setProgramYear(e.target.value)} required />
            </label>
            <label>
              Fecha de revisión
              <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} required />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Participantes
            <textarea value={attendees} onChange={(e) => setAttendees(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas sobre inputs
            <textarea
              value={inputsNotes}
              onChange={(e) => setInputsNotes(e.target.value)}
              rows={2}
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            Generar REV
          </button>
        </form>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="all">Todos los años</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              Año {y}
            </option>
          ))}
        </select>
        {(
          [
            ["all", "Todas"],
            ["Draft", "Borradores"],
            ["Completed", "Completadas"],
            ["Cancelled", "Anuladas"]
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={filter === k ? "btn btn-primary compact" : "btn btn-outline compact"}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.9fr)", gap: 16 }}>
        <div className="card pad">
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p className="muted">Sin revisiones con este filtro.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Año</th>
                    <th>Fecha</th>
                    <th>Participantes</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      style={{
                        cursor: "pointer",
                        background: selectedId === r.id ? "#e0f2fe" : undefined
                      }}
                    >
                      <td>{r.number}</td>
                      <td>{r.programYear}</td>
                      <td>{new Date(r.reviewDate).toLocaleDateString("es-AR")}</td>
                      <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.attendees || "—"}
                      </td>
                      <td>{statusLabel(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card pad">
          {!selected ? (
            <p className="muted">Seleccioná una revisión para ver inputs, decisiones y exportar PDF.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{selected.number}</h3>
              <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                {statusLabel(selected.status)} · Año {selected.programYear}
              </p>
              <p style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link
                  className="btn btn-outline compact"
                  to={`/calidad/registros/revision-direccion/${selected.id}/pdf`}
                >
                  Exportar PDF (planilla + logo)
                </Link>
              </p>

              <h4 style={{ marginBottom: 6, fontSize: 13 }}>Resumen de inputs (auto)</h4>
              <SnapshotSummary snapshot={snapshot} />

              {editable && (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() => void onRefreshInputs()}
                    >
                      Refrescar inputs
                    </button>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onComplete()}>
                      Completar
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => void onCancel(selected.id, selected.number)}
                    >
                      Anular
                    </button>
                  </div>

                  <label style={{ display: "block", marginBottom: 8 }}>
                    Fecha de revisión
                    <input type="date" value={editReviewDate} onChange={(e) => setEditReviewDate(e.target.value)} />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Participantes
                    <textarea
                      value={editAttendees}
                      onChange={(e) => setEditAttendees(e.target.value)}
                      rows={2}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Notas sobre inputs
                    <textarea
                      value={editInputsNotes}
                      onChange={(e) => setEditInputsNotes(e.target.value)}
                      rows={2}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Decisiones
                    <textarea
                      value={editDecisions}
                      onChange={(e) => setEditDecisions(e.target.value)}
                      rows={3}
                      style={{ width: "100%" }}
                      required
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Acciones
                    <textarea
                      value={editActions}
                      onChange={(e) => setEditActions(e.target.value)}
                      rows={2}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Seguimiento
                    <textarea
                      value={editFollowUp}
                      onChange={(e) => setEditFollowUp(e.target.value)}
                      rows={2}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Notas
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={2}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() =>
                      void patch(
                        {
                          attendees: editAttendees,
                          inputsNotes: editInputsNotes,
                          decisions: editDecisions,
                          actions: editActions,
                          followUp: editFollowUp,
                          notes: editNotes,
                          reviewDate: editReviewDate ? new Date(editReviewDate).toISOString() : undefined
                        },
                        "Borrador guardado."
                      )
                    }
                  >
                    Guardar textos
                  </button>
                </>
              )}

              {!editable && (
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 12 }}>
                  <div>
                    <strong>Participantes:</strong> {selected.attendees || "—"}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Decisiones:</strong> {selected.decisions || "—"}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Acciones:</strong> {selected.actions || "—"}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Seguimiento:</strong> {selected.followUp || "—"}
                  </div>
                  {selected.status !== "Cancelled" ? (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      style={{ marginTop: 12 }}
                      onClick={() => void onCancel(selected.id, selected.number)}
                    >
                      Anular
                    </button>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
