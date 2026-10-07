import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { Supplier } from "../../api/types";
import type {
  QualityEnabledSupplierRow,
  QualityPg05Summary,
  QualitySupplierEvaluation,
  QualitySupplierCriterion,
  QualitySupplierPerformanceReview
} from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";
import { CustomerPicker } from "../../components/pickers";

type Tab = "r01" | "r02" | "r03";

const TABS: { id: Tab; label: string }[] = [
  { id: "r01", label: "R01 Evaluación inicial" },
  { id: "r02", label: "R02 Habilitados" },
  { id: "r03", label: "R03 Desempeño" }
];

const EVAL_STATUS: Record<string, string> = {
  Draft: "Borrador",
  Approved: "Aprobada",
  Rejected: "Rechazada",
  Suspended: "Suspendida",
  Cancelled: "Anulada"
};

const PERF_STATUS: Record<string, string> = {
  Draft: "Borrador",
  Completed: "Completada",
  Cancelled: "Anulada"
};

function parseTab(v: string | null): Tab {
  if (v === "r02" || v === "r03") return v;
  return "r01";
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

function supplierLabel(s: Supplier) {
  return s.tradeName || s.legalName;
}

const EVAL_CRITERIA = [
  { code: "quality", label: "Calidad del producto/servicio" },
  { code: "timeliness", label: "Cumplimiento de plazos" },
  { code: "documentation", label: "Documentación" },
  { code: "support", label: "Atención y soporte técnico" },
  { code: "price", label: "Precio" },
  { code: "experience", label: "Experiencia del proveedor" }
] as const;
type CriterionAnswers = Record<string, { score: string; observation: string }>;
const criteriaCompleted = (answers: CriterionAnswers) => EVAL_CRITERIA.every(({ code }) =>
  ["1", "2", "3", "4", "5"].includes(answers[code]?.score || ""));
const criteriaTotal = (answers: CriterionAnswers) => EVAL_CRITERIA.reduce((sum, { code }) =>
  sum + Number(answers[code]?.score || 0), 0);
const criteriaPayload = (answers: CriterionAnswers): QualitySupplierCriterion[] => EVAL_CRITERIA.map(({ code, label }) => ({
  code, label, score: Number(answers[code].score), observation: answers[code]?.observation?.trim() || ""
}));
const answersFrom = (criteria: QualitySupplierCriterion[]): CriterionAnswers => Object.fromEntries(
  criteria.map((criterion) => [criterion.code, { score: String(criterion.score), observation: criterion.observation || "" }])
);

function CriteriaTable({ answers, onChange }: { answers: CriterionAnswers; onChange: (answers: CriterionAnswers) => void }) {
  const completed = EVAL_CRITERIA.filter(({ code }) => ["1", "2", "3", "4", "5"].includes(answers[code]?.score || "")).length;
  return <div style={{ marginTop: 12 }}>
    <strong>Criterios de evaluación · puntaje individual de 1 a 5</strong>
    <div className="table-wrap" style={{ marginTop: 8 }}><table className="table"><thead><tr>
      <th>Criterio</th><th>Puntaje (1–5)</th><th>Observaciones</th>
    </tr></thead><tbody>{EVAL_CRITERIA.map(({ code, label }) => <tr key={code}>
      <td>{label}</td><td><select aria-label={`Puntaje: ${label}`} required value={answers[code]?.score || ""}
        onChange={(event) => onChange({ ...answers, [code]: { score: event.target.value, observation: answers[code]?.observation || "" } })}>
        <option value="">Seleccionar</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
      </select></td><td><input aria-label={`Observaciones: ${label}`} value={answers[code]?.observation || ""}
        onChange={(event) => onChange({ ...answers, [code]: { score: answers[code]?.score || "", observation: event.target.value } })}
        maxLength={1000} placeholder="Opcional" /></td>
    </tr>)}</tbody></table></div>
    <p className="muted" style={{ marginBottom: 0 }}>{completed === EVAL_CRITERIA.length
      ? `Puntaje total: ${criteriaTotal(answers)} / 30` : `Evaluados ${completed} de ${EVAL_CRITERIA.length}. Completá todos para guardar.`}</p>
  </div>;
}

export function QualityPg05Page() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [summary, setSummary] = useState<QualityPg05Summary | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [evaluations, setEvaluations] = useState<QualitySupplierEvaluation[]>([]);
  const [enabled, setEnabled] = useState<QualityEnabledSupplierRow[]>([]);
  const [performances, setPerformances] = useState<QualitySupplierPerformanceReview[]>([]);

  // R01 form / detail
  const [eSupplierId, setESupplierId] = useState("");
  const [eScope, setEScope] = useState("");
  const [eEvaluatedAt, setEEvaluatedAt] = useState(new Date().toISOString().slice(0, 10));
  const [newCriteriaAnswers, setNewCriteriaAnswers] = useState<CriterionAnswers>({});
  const [editCriteriaAnswers, setEditCriteriaAnswers] = useState<CriterionAnswers>({});
  const [eStrengths, setEStrengths] = useState("");
  const [eWeaknesses, setEWeaknesses] = useState("");
  const [eApprovedBy, setEApprovedBy] = useState("");
  const [eValidUntil, setEValidUntil] = useState("");
  const [eNotes, setENotes] = useState("");

  // R03 form / detail
  const [pSupplierId, setPSupplierId] = useState("");
  const [pPeriod, setPPeriod] = useState("");
  const [pReviewDate, setPReviewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newPerformanceCriteria, setNewPerformanceCriteria] = useState<CriterionAnswers>({});
  const [editPerformanceCriteria, setEditPerformanceCriteria] = useState<CriterionAnswers>({});
  const [pComments, setPComments] = useState("");
  const [pReviewedBy, setPReviewedBy] = useState("");
  const [pNotes, setPNotes] = useState("");

  const selectedEval = evaluations.find((r) => r.id === selectedId) ?? null;
  const selectedPerf = performances.find((r) => r.id === selectedId) ?? null;

  const supplierById = useMemo(() => {
    const map = new Map<string, Supplier>();
    for (const s of suppliers) map.set(s.id, s);
    return map;
  }, [suppliers]);

  const resolveSupplier = (id: string) => {
    const s = supplierById.get(id);
    if (!s) return { name: "", document: "" };
    return {
      name: supplierLabel(s),
      document: s.documentNumber || undefined
    };
  };

  const setTab = (next: Tab) => {
    setSearchParams({ tab: next });
    setSelectedId(null);
    setShowForm(false);
    setError(null);
    setMsg(null);
  };

  const loadSummaryAndSuppliers = () => {
    Promise.all([api.getQualityPg05Summary(), api.listSuppliers().catch(() => [] as Supplier[])])
      .then(([sum, list]) => {
        setSummary(sum);
        setSuppliers(list || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  const loadTab = () => {
    setLoading(true);
    setError(null);
    const done = () => setLoading(false);
    if (tab === "r01") {
      api
        .listQualityPg05R01()
        .then((res) => {
          setEvaluations(res.rows || []);
          if (selectedId && !(res.rows || []).some((r) => r.id === selectedId)) setSelectedId(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(done);
    } else if (tab === "r02") {
      api
        .listQualityPg05R02()
        .then((res) => {
          setEnabled(res.rows || []);
          setSelectedId(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(done);
    } else {
      api
        .listQualityPg05R03()
        .then((res) => {
          setPerformances(res.rows || []);
          if (selectedId && !(res.rows || []).some((r) => r.id === selectedId)) setSelectedId(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(done);
    }
  };

  useEffect(() => {
    loadSummaryAndSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab === "r01" && selectedEval) {
      setEScope(selectedEval.serviceScope || "");
      setEEvaluatedAt(selectedEval.evaluatedAt ? selectedEval.evaluatedAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setEditCriteriaAnswers(answersFrom(selectedEval.criteria || []));
      setEStrengths(selectedEval.strengths || "");
      setEWeaknesses(selectedEval.weaknesses || "");
      setEApprovedBy(selectedEval.approvedBy || "");
      setEValidUntil(selectedEval.validUntil ? selectedEval.validUntil.slice(0, 10) : "");
      setENotes(selectedEval.notes || "");
    }
  }, [tab, selectedEval?.id]);

  useEffect(() => {
    if (tab === "r03" && selectedPerf) {
      setPPeriod(selectedPerf.period || "");
      setPReviewDate(selectedPerf.reviewDate ? selectedPerf.reviewDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setEditPerformanceCriteria(answersFrom(selectedPerf.criteria || []));
      setPComments(selectedPerf.comments || "");
      setPReviewedBy(selectedPerf.reviewedBy || "");
      setPNotes(selectedPerf.notes || "");
    }
  }, [tab, selectedPerf?.id]);

  const refresh = () => {
    loadSummaryAndSuppliers();
    loadTab();
  };

  const plantillaCode = `PG05-${tab.toUpperCase()}`;

  const onCreateEval = async (e: FormEvent) => {
    e.preventDefault();
    if (!eSupplierId) {
      setError("Seleccioná un proveedor.");
      return;
    }
    const resolved = resolveSupplier(eSupplierId);
    if (!resolved.name) {
      setError("No se encontró el proveedor seleccionado.");
      return;
    }
    if (!criteriaCompleted(newCriteriaAnswers)) {
      setError("Evaluá los seis criterios con puntaje de 1 a 5 antes de guardar.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityPg05R01({
        supplierId: eSupplierId,
        supplierName: resolved.name,
        supplierDocument: resolved.document,
        serviceScope: eScope.trim() || undefined,
        evaluatedAt: eEvaluatedAt ? new Date(eEvaluatedAt).toISOString() : undefined,
        criteria: criteriaPayload(newCriteriaAnswers),
        strengths: eStrengths.trim() || undefined,
        weaknesses: eWeaknesses.trim() || undefined,
        validUntil: eValidUntil ? new Date(eValidUntil).toISOString() : undefined,
        notes: eNotes.trim() || undefined
      });
      setMsg(`${created.number} creada (borrador).`);
      setShowForm(false);
      setESupplierId("");
      setEScope("");
      setNewCriteriaAnswers({});
      setEStrengths("");
      setEWeaknesses("");
      setEValidUntil("");
      setENotes("");
      setSelectedId(created.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCreatePerf = async (e: FormEvent) => {
    e.preventDefault();
    if (!pSupplierId) {
      setError("Seleccioná un proveedor.");
      return;
    }
    const resolved = resolveSupplier(pSupplierId);
    if (!resolved.name) {
      setError("No se encontró el proveedor seleccionado.");
      return;
    }
    if (!criteriaCompleted(newPerformanceCriteria)) {
      setError("Evaluá los seis criterios con puntaje de 1 a 5 antes de guardar.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityPg05R03({
        supplierId: pSupplierId,
        supplierName: resolved.name,
        period: pPeriod.trim() || undefined,
        reviewDate: pReviewDate ? new Date(pReviewDate).toISOString() : undefined,
        criteria: criteriaPayload(newPerformanceCriteria),
        comments: pComments.trim() || undefined,
        reviewedBy: pReviewedBy.trim() || undefined,
        notes: pNotes.trim() || undefined
      });
      setMsg(`${created.number} creada.`);
      setShowForm(false);
      setPSupplierId("");
      setPPeriod("");
      setNewPerformanceCriteria({});
      setPComments("");
      setPReviewedBy("");
      setPNotes("");
      setSelectedId(created.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = () => {
    if (tab === "r01") {
      const columns: ExcelColumn<QualitySupplierEvaluation>[] = [
        { key: "number", header: "Número" },
        { key: "supplierName", header: "Proveedor" },
        { key: "supplierDocument", header: "Documento" },
        { key: "serviceScope", header: "Alcance" },
        { key: "evaluatedAt", header: "Evaluada", value: (r) => excelDate(r.evaluatedAt) },
        { key: "score", header: "Puntaje total" },
        { key: "status", header: "Estado", value: (r) => EVAL_STATUS[r.status] ?? r.status },
        { key: "validUntil", header: "Vigente hasta", value: (r) => (r.validUntil ? excelDate(r.validUntil) : "") },
        { key: "approvedBy", header: "Aprobó" },
        { key: "notes", header: "Notas" }
      ];
      for (const criterion of EVAL_CRITERIA) {
        columns.push({ key: `${criterion.code}-score`, header: `${criterion.label} · puntaje`,
          value: (row) => row.criteria?.find((item) => item.code === criterion.code)?.score ?? "" });
        columns.push({ key: `${criterion.code}-observation`, header: `${criterion.label} · observación`,
          value: (row) => row.criteria?.find((item) => item.code === criterion.code)?.observation ?? "" });
      }
      void exportToExcel("PG05_R01_evaluaciones", evaluations, columns);
    } else if (tab === "r02") {
      const columns: ExcelColumn<QualityEnabledSupplierRow>[] = [
        { key: "supplierName", header: "Proveedor" },
        { key: "supplierDocument", header: "Documento" },
        { key: "evaluationNumber", header: "Evaluación" },
        { key: "score", header: "Puntaje" },
        { key: "approvedAt", header: "Aprobada", value: (r) => (r.approvedAt ? excelDate(r.approvedAt) : "") },
        { key: "validUntil", header: "Vigente hasta", value: (r) => (r.validUntil ? excelDate(r.validUntil) : "") },
        { key: "serviceScope", header: "Alcance" },
        { key: "lastPerformanceScore", header: "Último desempeño" },
        { key: "lastPerformancePeriod", header: "Período" },
        {
          key: "lastPerformanceDate",
          header: "Fecha desempeño",
          value: (r) => (r.lastPerformanceDate ? excelDate(r.lastPerformanceDate) : "")
        }
      ];
      void exportToExcel("PG05_R02_habilitados", enabled, columns);
    } else {
      const columns: ExcelColumn<QualitySupplierPerformanceReview>[] = [
        { key: "number", header: "Número" },
        { key: "supplierName", header: "Proveedor" },
        { key: "period", header: "Período" },
        { key: "reviewDate", header: "Fecha", value: (r) => excelDate(r.reviewDate) },
        { key: "score", header: "Puntaje total" },
        { key: "qualityScore", header: "Calidad histórica" },
        { key: "deliveryScore", header: "Entrega histórica" },
        { key: "serviceScore", header: "Servicio histórico" },
        { key: "status", header: "Estado", value: (r) => PERF_STATUS[r.status] ?? r.status },
        { key: "reviewedBy", header: "Revisó" },
        { key: "comments", header: "Comentarios" }
      ];
      for (const criterion of EVAL_CRITERIA) {
        columns.push({ key: `${criterion.code}-score`, header: `${criterion.label} · puntaje`,
          value: (row) => row.criteria?.find((item) => item.code === criterion.code)?.score ?? "" });
        columns.push({ key: `${criterion.code}-observation`, header: `${criterion.label} · observación`,
          value: (row) => row.criteria?.find((item) => item.code === criterion.code)?.observation ?? "" });
      }
      void exportToExcel("PG05_R03_desempeno", performances, columns);
    }
  };

  const newButtonLabel =
    tab === "r01" ? "Nueva evaluación" : tab === "r03" ? "Nueva revisión" : "Nueva evaluación";

  const listCount = tab === "r01" ? evaluations.length : tab === "r02" ? enabled.length : performances.length;
  const canCreate = tab !== "r02";

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to={`/calidad/documentos/${plantillaCode}`} style={{ fontSize: 13 }}>
            ← Plantilla {plantillaCode}
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>PG05 · Compras (evaluación y desempeño de proveedores)</h1>
          <p style={{ marginTop: 6, color: "#64748b", maxWidth: 680 }}>
            Evaluación inicial, listado de proveedores habilitados y seguimiento de desempeño periódico.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline" disabled={listCount === 0} onClick={exportExcel}>
            Excel
          </button>
          {canCreate && (
            <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cerrar alta" : newButtonLabel}
            </button>
          )}
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {msg && <p style={{ color: "#15803d" }}>{msg}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0", fontSize: 13 }}>
        <span className="card pad" style={{ padding: "6px 10px" }}>
          Evaluaciones borrador: <strong>{summary?.evaluationsDraft ?? 0}</strong>
        </span>
        <span className="card pad" style={{ padding: "6px 10px" }}>
          Evaluaciones aprobadas: <strong>{summary?.evaluationsApproved ?? 0}</strong>
        </span>
        <span className="card pad" style={{ padding: "6px 10px" }}>
          Desempeños borrador: <strong>{summary?.performanceDraft ?? 0}</strong>
        </span>
        <span className="card pad" style={{ padding: "6px 10px" }}>
          Proveedores habilitados: <strong>{summary?.enabledSuppliers ?? 0}</strong>
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "btn btn-primary compact" : "btn btn-outline compact"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {summary?.counts ? ` (${summary.counts[t.id]})` : ""}
          </button>
        ))}
      </div>

      {showForm && tab === "r01" && (
        <form className="card pad" onSubmit={(e) => void onCreateEval(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nueva evaluación inicial (borrador)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label>
              Proveedor
              <CustomerPicker role="supplier" value={eSupplierId} onChange={(id) => setESupplierId(id)} options={suppliers} required />
            </label>
            <label>
              Fecha evaluación
              <input type="date" value={eEvaluatedAt} onChange={(ev) => setEEvaluatedAt(ev.target.value)} required />
            </label>
            <label>
              Vigente hasta
              <input type="date" value={eValidUntil} onChange={(ev) => setEValidUntil(ev.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Alcance
            <input value={eScope} onChange={(ev) => setEScope(ev.target.value)} style={{ width: "100%" }} />
          </label>
          <CriteriaTable answers={newCriteriaAnswers} onChange={setNewCriteriaAnswers} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            <label>
              Fortalezas
              <textarea value={eStrengths} onChange={(ev) => setEStrengths(ev.target.value)} rows={2} style={{ width: "100%" }} />
            </label>
            <label>
              Debilidades
              <textarea value={eWeaknesses} onChange={(ev) => setEWeaknesses(ev.target.value)} rows={2} style={{ width: "100%" }} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas
            <textarea value={eNotes} onChange={(ev) => setENotes(ev.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !criteriaCompleted(newCriteriaAnswers)} style={{ marginTop: 12 }}>
            Guardar evaluación
          </button>
        </form>
      )}

      {showForm && tab === "r03" && (
        <form className="card pad" onSubmit={(e) => void onCreatePerf(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nueva revisión de desempeño</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <label>
              Proveedor
              <CustomerPicker role="supplier" value={pSupplierId} onChange={(id) => setPSupplierId(id)} options={suppliers} required />
            </label>
            <label>
              Período
              <input value={pPeriod} onChange={(ev) => setPPeriod(ev.target.value)} placeholder="2026-Q1…" />
            </label>
            <label>
              Fecha revisión
              <input type="date" value={pReviewDate} onChange={(ev) => setPReviewDate(ev.target.value)} required />
            </label>
            <label>
              Revisado por
              <input value={pReviewedBy} onChange={(ev) => setPReviewedBy(ev.target.value)} />
            </label>
          </div>
          <CriteriaTable answers={newPerformanceCriteria} onChange={setNewPerformanceCriteria} />
          <label style={{ display: "block", marginTop: 12 }}>
            Comentarios
            <textarea value={pComments} onChange={(ev) => setPComments(ev.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas
            <textarea value={pNotes} onChange={(ev) => setPNotes(ev.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !criteriaCompleted(newPerformanceCriteria)} style={{ marginTop: 12 }}>
            Guardar evaluación
          </button>
        </form>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: tab === "r02" ? "1fr" : "minmax(0, 1.2fr) minmax(280px, 0.9fr)",
          gap: 16
        }}
      >
        <div className="card pad">
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : tab === "r01" ? (
            evaluations.length === 0 ? (
              <p className="muted">Sin evaluaciones.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Proveedor</th>
                      <th>Puntaje</th>
                      <th>Estado</th>
                      <th>Vigente hasta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluations.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        style={{
                          cursor: "pointer",
                          background: selectedId === r.id ? "#e0f2fe" : r.isExpired ? "#fef2f2" : undefined
                        }}
                      >
                        <td>{r.number}</td>
                        <td>{r.supplierName}</td>
                        <td>{r.score ?? "—"}</td>
                        <td>
                          {EVAL_STATUS[r.status] ?? r.status}
                          {r.isExpired ? " · vencida" : ""}
                        </td>
                        <td>{fmtDate(r.validUntil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : tab === "r02" ? (
            enabled.length === 0 ? (
              <p className="muted">Sin proveedores habilitados.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Documento</th>
                      <th>Evaluación</th>
                      <th>Puntaje</th>
                      <th>Aprobada</th>
                      <th>Vigente hasta</th>
                      <th>Último desempeño</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enabled.map((r) => (
                      <tr key={`${r.supplierId}-${r.evaluationId}`}>
                        <td>{r.supplierName}</td>
                        <td>{r.supplierDocument || "—"}</td>
                        <td>{r.evaluationNumber}</td>
                        <td>{r.score ?? "—"}</td>
                        <td>{fmtDate(r.approvedAt)}</td>
                        <td>{fmtDate(r.validUntil)}</td>
                        <td>
                          {r.lastPerformanceScore != null
                            ? `${r.lastPerformanceScore}${r.lastPerformancePeriod ? ` · ${r.lastPerformancePeriod}` : ""}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : performances.length === 0 ? (
            <p className="muted">Sin revisiones de desempeño.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Proveedor</th>
                    <th>Período</th>
                    <th>Fecha</th>
                    <th>Puntaje</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {performances.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      style={{ cursor: "pointer", background: selectedId === r.id ? "#e0f2fe" : undefined }}
                    >
                      <td>{r.number}</td>
                      <td>{r.supplierName}</td>
                      <td>{r.period || "—"}</td>
                      <td>{fmtDate(r.reviewDate)}</td>
                      <td>{r.score ?? "—"}</td>
                      <td>{PERF_STATUS[r.status] ?? r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {tab !== "r02" && (
          <div className="card pad">
            {tab === "r01" &&
              (!selectedEval ? (
                <p className="muted">Seleccioná una evaluación.</p>
              ) : (
                <>
                  <h3 style={{ marginTop: 0 }}>{selectedEval.number}</h3>
                  <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                    {EVAL_STATUS[selectedEval.status] ?? selectedEval.status}
                    {selectedEval.isExpired ? " · vencida" : ""} · {selectedEval.supplierName}
                  </p>
                  <p style={{ marginBottom: 12 }}>
                    <Link
                      className="btn btn-outline compact"
                      to={`/calidad/registros/proveedores/${selectedEval.id}/pdf`}
                    >
                      Exportar PDF
                    </Link>
                  </p>
                  {selectedEval.status !== "Cancelled" && (
                    <>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Alcance
                        <input value={eScope} onChange={(ev) => setEScope(ev.target.value)} style={{ width: "100%" }} />
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Fecha evaluación
                        <input type="date" value={eEvaluatedAt} onChange={(ev) => setEEvaluatedAt(ev.target.value)} />
                      </label>
                      <CriteriaTable answers={editCriteriaAnswers} onChange={setEditCriteriaAnswers} />
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Fortalezas
                        <textarea value={eStrengths} onChange={(ev) => setEStrengths(ev.target.value)} rows={2} style={{ width: "100%" }} />
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Debilidades
                        <textarea value={eWeaknesses} onChange={(ev) => setEWeaknesses(ev.target.value)} rows={2} style={{ width: "100%" }} />
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Aprobado por
                        <input value={eApprovedBy} onChange={(ev) => setEApprovedBy(ev.target.value)} style={{ width: "100%" }} />
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Vigente hasta
                        <input type="date" value={eValidUntil} onChange={(ev) => setEValidUntil(ev.target.value)} />
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Notas
                        <textarea value={eNotes} onChange={(ev) => setENotes(ev.target.value)} rows={2} style={{ width: "100%" }} />
                      </label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={busy || !criteriaCompleted(editCriteriaAnswers)}
                          onClick={() =>
                            void (async () => {
                              setBusy(true);
                              setError(null);
                              try {
                                await api.updateQualityPg05R01(selectedEval.id, {
                                  serviceScope: eScope.trim() || undefined,
                                  evaluatedAt: eEvaluatedAt ? new Date(eEvaluatedAt).toISOString() : undefined,
                                  criteria: criteriaPayload(editCriteriaAnswers),
                                  strengths: eStrengths.trim() || undefined,
                                  weaknesses: eWeaknesses.trim() || undefined,
                                  approvedBy: eApprovedBy.trim() || undefined,
                                  validUntil: eValidUntil ? new Date(eValidUntil).toISOString() : undefined,
                                  notes: eNotes.trim() || undefined
                                });
                                setMsg("Borrador guardado.");
                                refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          Guardar
                        </button>
                        {(selectedEval.status === "Draft" || selectedEval.status === "Suspended") && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy || !criteriaCompleted(editCriteriaAnswers)}
                            onClick={() =>
                              void (async () => {
                                setBusy(true);
                                setError(null);
                                setMsg(null);
                                try {
                                  await api.updateQualityPg05R01(selectedEval.id, {
                                    status: "Approved",
                                    criteria: criteriaPayload(editCriteriaAnswers),
                                    approvedBy: eApprovedBy.trim() || undefined,
                                    approvedAt: new Date().toISOString(),
                                    validUntil: eValidUntil ? new Date(eValidUntil).toISOString() : undefined,
                                    notes: eNotes.trim() || undefined
                                  });
                                  setMsg("Evaluación aprobada.");
                                  refresh();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : String(err));
                                } finally {
                                  setBusy(false);
                                }
                              })()
                            }
                          >
                            Aprobar
                          </button>
                        )}
                        {selectedEval.status === "Draft" && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={busy || !criteriaCompleted(editCriteriaAnswers)}
                            onClick={() =>
                              void (async () => {
                                setBusy(true);
                                try {
                                  await api.updateQualityPg05R01(selectedEval.id, { status: "Rejected", criteria: criteriaPayload(editCriteriaAnswers) });
                                  setMsg("Evaluación rechazada.");
                                  refresh();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : String(err));
                                } finally {
                                  setBusy(false);
                                }
                              })()
                            }
                          >
                            Rechazar
                          </button>
                        )}
                        {selectedEval.status === "Approved" && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled={busy}
                            onClick={() =>
                              void (async () => {
                                setBusy(true);
                                try {
                                  await api.updateQualityPg05R01(selectedEval.id, { status: "Suspended" });
                                  setMsg("Evaluación suspendida.");
                                  refresh();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : String(err));
                                } finally {
                                  setBusy(false);
                                }
                              })()
                            }
                          >
                            Suspender
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={busy}
                          onClick={() =>
                            void (async () => {
                              if (!window.confirm(`¿Anular ${selectedEval.number}?`)) return;
                              setBusy(true);
                              try {
                                await api.cancelQualityPg05R01(selectedEval.id);
                                setSelectedId(null);
                                refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          Anular
                        </button>
                      </div>
                      {selectedEval.approvedBy ? (
                        <p style={{ fontSize: 12, color: "#64748b", marginTop: 12 }}>
                          Aprobada por {selectedEval.approvedBy}
                          {selectedEval.approvedAt ? ` · ${fmtDate(selectedEval.approvedAt)}` : ""}
                        </p>
                      ) : null}
                    </>
                  )}
                </>
              ))}

            {tab === "r03" &&
              (!selectedPerf ? (
                <p className="muted">Seleccioná una revisión de desempeño.</p>
              ) : (
                <>
                  <h3 style={{ marginTop: 0 }}>{selectedPerf.number}</h3>
                  <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                    {PERF_STATUS[selectedPerf.status] ?? selectedPerf.status} · {selectedPerf.supplierName}
                    {selectedPerf.period ? ` · ${selectedPerf.period}` : ""}
                  </p>
                  {selectedPerf.status === "Draft" && (
                    <>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Período
                        <input value={pPeriod} onChange={(ev) => setPPeriod(ev.target.value)} style={{ width: "100%" }} />
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Fecha revisión
                        <input type="date" value={pReviewDate} onChange={(ev) => setPReviewDate(ev.target.value)} />
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Revisado por
                        <input value={pReviewedBy} onChange={(ev) => setPReviewedBy(ev.target.value)} style={{ width: "100%" }} />
                      </label>
                      <CriteriaTable answers={editPerformanceCriteria} onChange={setEditPerformanceCriteria} />
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Comentarios
                        <textarea value={pComments} onChange={(ev) => setPComments(ev.target.value)} rows={3} style={{ width: "100%" }} />
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Notas
                        <textarea value={pNotes} onChange={(ev) => setPNotes(ev.target.value)} rows={2} style={{ width: "100%" }} />
                      </label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={busy || !criteriaCompleted(editPerformanceCriteria)}
                          onClick={() =>
                            void (async () => {
                              setBusy(true);
                              try {
                                await api.updateQualityPg05R03(selectedPerf.id, {
                                  period: pPeriod.trim() || undefined,
                                  reviewDate: pReviewDate ? new Date(pReviewDate).toISOString() : undefined,
                                  criteria: criteriaPayload(editPerformanceCriteria),
                                  comments: pComments.trim() || undefined,
                                  reviewedBy: pReviewedBy.trim() || undefined,
                                  notes: pNotes.trim() || undefined
                                });
                                setMsg("Borrador guardado.");
                                refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || !criteriaCompleted(editPerformanceCriteria)}
                          onClick={() =>
                            void (async () => {
                              setBusy(true);
                              try {
                                await api.updateQualityPg05R03(selectedPerf.id, {
                                  status: "Completed",
                                  period: pPeriod.trim() || undefined,
                                  reviewDate: pReviewDate ? new Date(pReviewDate).toISOString() : undefined,
                                  criteria: criteriaPayload(editPerformanceCriteria),
                                  comments: pComments.trim() || undefined,
                                  reviewedBy: pReviewedBy.trim() || undefined
                                });
                                setMsg("Revisión completada.");
                                refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          Completar
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={busy}
                          onClick={() =>
                            void (async () => {
                              if (!window.confirm(`¿Anular ${selectedPerf.number}?`)) return;
                              setBusy(true);
                              try {
                                await api.cancelQualityPg05R03(selectedPerf.id);
                                setSelectedId(null);
                                refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          Anular
                        </button>
                      </div>
                    </>
                  )}
                  {selectedPerf.status !== "Draft" && (
                    <div style={{ fontSize: 13, color: "#64748b" }}>
                      <div>
                        <strong>Revisó:</strong> {selectedPerf.reviewedBy || "—"}
                      </div>
                      {selectedPerf.criteria?.length ? <div style={{ marginTop: 8 }}>
                        <strong>Puntaje total: {selectedPerf.score} / 30</strong>
                        <div className="table-wrap"><table className="table"><thead><tr>
                          <th>Criterio</th><th>Puntaje (1–5)</th><th>Observaciones</th>
                        </tr></thead><tbody>{selectedPerf.criteria.map((criterion) => <tr key={criterion.code}>
                          <td>{criterion.label}</td><td>{criterion.score}</td><td>{criterion.observation || "—"}</td>
                        </tr>)}</tbody></table></div>
                      </div> : <div style={{ marginTop: 8 }}>
                        <strong>Puntajes históricos:</strong> global {selectedPerf.score ?? "—"} / calidad{" "}
                        {selectedPerf.qualityScore ?? "—"} / entrega {selectedPerf.deliveryScore ?? "—"} / servicio{" "}
                        {selectedPerf.serviceScore ?? "—"}
                      </div>}
                      <div style={{ marginTop: 8 }}>
                        <strong>Comentarios:</strong> {selectedPerf.comments || "—"}
                      </div>
                      {selectedPerf.status === "Completed" && (
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={busy}
                          style={{ marginTop: 12 }}
                          onClick={() =>
                            void (async () => {
                              if (!window.confirm(`¿Anular ${selectedPerf.number}?`)) return;
                              setBusy(true);
                              try {
                                await api.cancelQualityPg05R03(selectedPerf.id);
                                setSelectedId(null);
                                refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  )}
                </>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
