import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityInternalAudit } from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";

const STATUS_LABEL: Record<string, string> = {
  Planned: "Programada",
  InProgress: "En curso",
  Reported: "Informada",
  Closed: "Cerrada",
  Cancelled: "Anulada"
};

const OPEN = new Set(["Planned", "InProgress", "Reported"]);
const CLOSED = new Set(["Closed", "Cancelled"]);

type Filter = "all" | "open" | "closed" | string;

function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}

export function QualityPg04Page() {
  const currentYear = new Date().getFullYear();
  const [rows, setRows] = useState<QualityInternalAudit[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const [programYear, setProgramYear] = useState(String(currentYear));
  const [plannedDate, setPlannedDate] = useState(new Date().toISOString().slice(0, 10));
  const [scope, setScope] = useState("");
  const [clauses, setClauses] = useState("");
  const [auditor, setAuditor] = useState("");
  const [auditee, setAuditee] = useState("");
  const [objectives, setObjectives] = useState("");
  const [notes, setNotes] = useState("");

  const [findingsSummary, setFindingsSummary] = useState("");
  const [conclusions, setConclusions] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [checklistNotes, setChecklistNotes] = useState("");
  const [executedDate, setExecutedDate] = useState("");

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.programYear));
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [rows, currentYear]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (yearFilter !== "all" && String(r.programYear) !== yearFilter) return false;
      if (filter === "all") return true;
      if (filter === "open") return OPEN.has(r.status);
      if (filter === "closed") return CLOSED.has(r.status);
      return r.status === filter;
    });
  }, [rows, filter, yearFilter]);

  const load = () => {
    setLoading(true);
    api
      .listQualityPg04()
      .then((res) => {
        setRows(res.rows || []);
        setOpenCount(res.openCount ?? 0);
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
    setFindingsSummary(selected.findingsSummary || "");
    setConclusions(selected.conclusions || "");
    setRecommendations(selected.recommendations || "");
    setChecklistNotes(selected.checklistNotes || "");
    setObjectives(selected.objectives || "");
    setClauses(selected.clauses || "");
    setAuditee(selected.auditee || "");
    setExecutedDate(selected.executedDate ? selected.executedDate.slice(0, 10) : "");
  }, [selected?.id]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!scope.trim() || !auditor.trim()) {
      setError("Alcance y auditor son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityInternalAudit({
        programYear: Number(programYear) || currentYear,
        plannedDate: plannedDate ? new Date(plannedDate).toISOString() : undefined,
        scope: scope.trim(),
        clauses: clauses.trim() || undefined,
        auditor: auditor.trim(),
        auditee: auditee.trim() || undefined,
        objectives: objectives.trim() || undefined,
        notes: notes.trim() || undefined
      });
      setMsg(`${created.number} programada en el sistema.`);
      setShowForm(false);
      setScope("");
      setClauses("");
      setAuditor("");
      setAuditee("");
      setObjectives("");
      setNotes("");
      setSelectedId(created.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body: Parameters<typeof api.updateQualityInternalAudit>[1], ok: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.updateQualityInternalAudit(selected.id, body);
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
      await api.cancelQualityInternalAudit(id);
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
    const columns: ExcelColumn<QualityInternalAudit>[] = [
      { key: "number", header: "Número" },
      { key: "programYear", header: "Año programa" },
      { key: "plannedDate", header: "Planificada", value: (r) => excelDate(r.plannedDate) },
      { key: "executedDate", header: "Ejecutada", value: (r) => (r.executedDate ? excelDate(r.executedDate) : "") },
      { key: "scope", header: "Alcance" },
      { key: "clauses", header: "Cláusulas" },
      { key: "auditor", header: "Auditor" },
      { key: "auditee", header: "Auditado" },
      { key: "status", header: "Estado", value: (r) => statusLabel(r.status) },
      { key: "findingsSummary", header: "Hallazgos" },
      { key: "conclusions", header: "Conclusiones" }
    ];
    void exportToExcel(`PG04_auditorias_${yearFilter}_${filter}`, filtered, columns);
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to="/calidad/documentos/PG04-R01" style={{ fontSize: 13 }}>
            ← Plantilla PG04-R01
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>PG04 · Auditorías internas</h1>
          <p style={{ marginTop: 6, color: "#64748b", maxWidth: 640 }}>
            Cada auditoría se <strong>genera en el sistema</strong> (AUD-AAAA-NNNN). El listado filtrado por año es el
            programa (R01); plan, informe y checklist son etapas del mismo registro (R02–R04).
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline" disabled={filtered.length === 0} onClick={exportExcel}>
            Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cerrar alta" : "Nueva auditoría"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {msg && <p style={{ color: "#15803d" }}>{msg}</p>}
      <p style={{ fontSize: 13, color: "#64748b" }}>
        Abiertas / en curso: <strong>{openCount}</strong> · Total: {rows.length}
      </p>

      {showForm && (
        <form className="card pad" onSubmit={(e) => void onCreate(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Programar auditoría</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label>
              Año programa
              <input type="number" value={programYear} onChange={(e) => setProgramYear(e.target.value)} required />
            </label>
            <label>
              Fecha planificada
              <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} required />
            </label>
            <label>
              Auditor
              <input value={auditor} onChange={(e) => setAuditor(e.target.value)} required />
            </label>
            <label>
              Auditado / área
              <input value={auditee} onChange={(e) => setAuditee(e.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Alcance
            <textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={2} style={{ width: "100%" }} required />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Cláusulas ISO/IEC 17025
            <input
              value={clauses}
              onChange={(e) => setClauses(e.target.value)}
              style={{ width: "100%" }}
              placeholder="ej. 8.8, 7.10, 6.4"
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Objetivos / plan (R02)
            <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            Generar AUD
          </button>
        </form>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="all">Todos los años</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              Programa {y}
            </option>
          ))}
        </select>
        {(
          [
            ["all", "Todas"],
            ["open", "Abiertas"],
            ["closed", "Cerradas"],
            ["Planned", "Programadas"],
            ["InProgress", "En curso"],
            ["Reported", "Informadas"]
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
            <p className="muted">Sin auditorías con este filtro.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Año</th>
                    <th>Planificada</th>
                    <th>Alcance</th>
                    <th>Auditor</th>
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
                      <td>{new Date(r.plannedDate).toLocaleDateString("es-AR")}</td>
                      <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.scope}
                      </td>
                      <td>{r.auditor}</td>
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
            <p className="muted">Seleccioná una auditoría para avanzar plan → ejecución → informe.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{selected.number}</h3>
              <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                {statusLabel(selected.status)} · Programa {selected.programYear}
              </p>
              <p style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="btn btn-outline compact" to={`/calidad/registros/auditorias/${selected.id}/pdf`}>
                  Exportar PDF (planilla + logo)
                </Link>
                <Link
                  className="btn btn-outline compact"
                  to={`/calidad/registros/nc?origin=Audit&fromAudit=${selected.id}&desc=${encodeURIComponent(
                    `Hallazgo de auditoría ${selected.number}: `
                  )}`}
                >
                  Crear NC desde hallazgo
                </Link>
              </p>
              <p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{selected.scope}</p>
              {selected.clauses ? (
                <p style={{ fontSize: 13, color: "#475569" }}>
                  <strong>Cláusulas:</strong> {selected.clauses}
                </p>
              ) : null}

              {editable && (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {selected.status === "Planned" && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy}
                        onClick={() => void patch({ status: "InProgress", objectives }, "Auditoría en curso.")}
                      >
                        Iniciar (plan R02)
                      </button>
                    )}
                    {selected.status === "InProgress" && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy}
                        onClick={() =>
                          void patch(
                            {
                              status: "Reported",
                              findingsSummary,
                              checklistNotes,
                              conclusions,
                              recommendations,
                              executedDate: executedDate ? new Date(executedDate).toISOString() : new Date().toISOString()
                            },
                            "Informe registrado."
                          )
                        }
                      >
                        Registrar informe (R03)
                      </button>
                    )}
                    {selected.status === "Reported" && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() =>
                          void patch(
                            {
                              status: "Closed",
                              conclusions,
                              recommendations,
                              checklistNotes
                            },
                            "Auditoría cerrada."
                          )
                        }
                      >
                        Cerrar
                      </button>
                    )}
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
                    Objetivos / plan
                    <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={2} style={{ width: "100%" }} />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Fecha ejecución
                    <input type="date" value={executedDate} onChange={(e) => setExecutedDate(e.target.value)} />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Hallazgos (informe)
                    <textarea
                      value={findingsSummary}
                      onChange={(e) => setFindingsSummary(e.target.value)}
                      rows={3}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Checklist / lista de verificación (R04)
                    <textarea
                      value={checklistNotes}
                      onChange={(e) => setChecklistNotes(e.target.value)}
                      rows={3}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Conclusiones
                    <textarea value={conclusions} onChange={(e) => setConclusions(e.target.value)} rows={2} style={{ width: "100%" }} />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Recomendaciones
                    <textarea
                      value={recommendations}
                      onChange={(e) => setRecommendations(e.target.value)}
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
                          objectives,
                          findingsSummary,
                          conclusions,
                          recommendations,
                          checklistNotes,
                          clauses,
                          auditee,
                          executedDate: executedDate ? new Date(executedDate).toISOString() : undefined
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
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  <div>
                    <strong>Hallazgos:</strong> {selected.findingsSummary || "—"}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Conclusiones:</strong> {selected.conclusions || "—"}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <strong>Checklist:</strong> {selected.checklistNotes || "—"}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
