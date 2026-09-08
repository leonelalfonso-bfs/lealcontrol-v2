import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { Supplier } from "../../api/types";
import type {
  QualityEnabledSupplierRow,
  QualityPg05Summary,
  QualitySupplierEvaluation,
  QualitySupplierPerformanceReview
} from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";

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
  const [eScore, setEScore] = useState("");
  const [eCriteria, setECriteria] = useState("");
  const [eStrengths, setEStrengths] = useState("");
  const [eWeaknesses, setEWeaknesses] = useState("");
  const [eApprovedBy, setEApprovedBy] = useState("");
  const [eValidUntil, setEValidUntil] = useState("");
  const [eNotes, setENotes] = useState("");

  // R03 form / detail
  const [pSupplierId, setPSupplierId] = useState("");
  const [pPeriod, setPPeriod] = useState("");
  const [pReviewDate, setPReviewDate] = useState(new Date().toISOString().slice(0, 10));
  const [pScore, setPScore] = useState("");
  const [pQuality, setPQuality] = useState("");
  const [pDelivery, setPDelivery] = useState("");
  const [pService, setPService] = useState("");
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
      setEScore(selectedEval.score != null ? String(selectedEval.score) : "");
      setECriteria(selectedEval.criteriaNotes || "");
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
      setPScore(selectedPerf.score != null ? String(selectedPerf.score) : "");
      setPQuality(selectedPerf.qualityScore != null ? String(selectedPerf.qualityScore) : "");
      setPDelivery(selectedPerf.deliveryScore != null ? String(selectedPerf.deliveryScore) : "");
      setPService(selectedPerf.serviceScore != null ? String(selectedPerf.serviceScore) : "");
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
        score: eScore !== "" ? Number(eScore) : undefined,
        criteriaNotes: eCriteria.trim() || undefined,
        strengths: eStrengths.trim() || undefined,
        weaknesses: eWeaknesses.trim() || undefined,
        validUntil: eValidUntil ? new Date(eValidUntil).toISOString() : undefined,
        notes: eNotes.trim() || undefined
      });
      setMsg(`${created.number} creada (borrador).`);
      setShowForm(false);
      setESupplierId("");
      setEScope("");
      setEScore("");
      setECriteria("");
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
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityPg05R03({
        supplierId: pSupplierId,
        supplierName: resolved.name,
        period: pPeriod.trim() || undefined,
        reviewDate: pReviewDate ? new Date(pReviewDate).toISOString() : undefined,
        score: pScore !== "" ? Number(pScore) : undefined,
        qualityScore: pQuality !== "" ? Number(pQuality) : undefined,
        deliveryScore: pDelivery !== "" ? Number(pDelivery) : undefined,
        serviceScore: pService !== "" ? Number(pService) : undefined,
        comments: pComments.trim() || undefined,
        reviewedBy: pReviewedBy.trim() || undefined,
        notes: pNotes.trim() || undefined
      });
      setMsg(`${created.number} creada.`);
      setShowForm(false);
      setPSupplierId("");
      setPPeriod("");
      setPScore("");
      setPQuality("");
      setPDelivery("");
      setPService("");
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
        { key: "score", header: "Puntaje" },
        { key: "status", header: "Estado", value: (r) => EVAL_STATUS[r.status] ?? r.status },
        { key: "validUntil", header: "Vigente hasta", value: (r) => (r.validUntil ? excelDate(r.validUntil) : "") },
        { key: "approvedBy", header: "Aprobó" },
        { key: "notes", header: "Notas" }
      ];
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
        { key: "score", header: "Puntaje" },
        { key: "qualityScore", header: "Calidad" },
        { key: "deliveryScore", header: "Entrega" },
        { key: "serviceScore", header: "Servicio" },
        { key: "status", header: "Estado", value: (r) => PERF_STATUS[r.status] ?? r.status },
        { key: "reviewedBy", header: "Revisó" },
        { key: "comments", header: "Comentarios" }
      ];
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
              <select value={eSupplierId} onChange={(ev) => setESupplierId(ev.target.value)} required>
                <option value="">— Seleccionar —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {supplierLabel(s)}
                    {s.documentNumber ? ` · ${s.documentNumber}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha evaluación
              <input type="date" value={eEvaluatedAt} onChange={(ev) => setEEvaluatedAt(ev.target.value)} required />
            </label>
            <label>
              Puntaje (0–100)
              <input type="number" min={0} max={100} step={0.1} value={eScore} onChange={(ev) => setEScore(ev.target.value)} />
            </label>
            <label>
              Vigente hasta
              <input type="date" value={eValidUntil} onChange={(ev) => setEValidUntil(ev.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Alcance del servicio
            <input value={eScope} onChange={(ev) => setEScope(ev.target.value)} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Criterios / notas de evaluación
            <textarea value={eCriteria} onChange={(ev) => setECriteria(ev.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
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
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            Crear borrador
          </button>
        </form>
      )}

      {showForm && tab === "r03" && (
        <form className="card pad" onSubmit={(e) => void onCreatePerf(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nueva revisión de desempeño</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <label>
              Proveedor
              <select value={pSupplierId} onChange={(ev) => setPSupplierId(ev.target.value)} required>
                <option value="">— Seleccionar —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {supplierLabel(s)}
                    {s.documentNumber ? ` · ${s.documentNumber}` : ""}
                  </option>
                ))}
              </select>
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
            <label>
              Puntaje global
              <input type="number" min={0} max={100} step={0.1} value={pScore} onChange={(ev) => setPScore(ev.target.value)} />
            </label>
            <label>
              Calidad
              <input type="number" min={0} max={100} step={0.1} value={pQuality} onChange={(ev) => setPQuality(ev.target.value)} />
            </label>
            <label>
              Entrega
              <input type="number" min={0} max={100} step={0.1} value={pDelivery} onChange={(ev) => setPDelivery(ev.target.value)} />
            </label>
            <label>
              Servicio
              <input type="number" min={0} max={100} step={0.1} value={pService} onChange={(ev) => setPService(ev.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Comentarios
            <textarea value={pComments} onChange={(ev) => setPComments(ev.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas
            <textarea value={pNotes} onChange={(ev) => setPNotes(ev.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            Crear
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
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Puntaje (0–100)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={eScore}
                          onChange={(ev) => setEScore(ev.target.value)}
                        />
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Criterios
                        <textarea value={eCriteria} onChange={(ev) => setECriteria(ev.target.value)} rows={2} style={{ width: "100%" }} />
                      </label>
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
                          disabled={busy}
                          onClick={() =>
                            void (async () => {
                              setBusy(true);
                              setError(null);
                              try {
                                await api.updateQualityPg05R01(selectedEval.id, {
                                  serviceScope: eScope.trim() || undefined,
                                  evaluatedAt: eEvaluatedAt ? new Date(eEvaluatedAt).toISOString() : undefined,
                                  score: eScore !== "" ? Number(eScore) : undefined,
                                  criteriaNotes: eCriteria.trim() || undefined,
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
                            disabled={busy}
                            onClick={() =>
                              void (async () => {
                                setBusy(true);
                                setError(null);
                                setMsg(null);
                                try {
                                  await api.updateQualityPg05R01(selectedEval.id, {
                                    status: "Approved",
                                    score: eScore !== "" ? Number(eScore) : undefined,
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
                            disabled={busy}
                            onClick={() =>
                              void (async () => {
                                setBusy(true);
                                try {
                                  await api.updateQualityPg05R01(selectedEval.id, { status: "Rejected" });
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
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        <label>
                          Global
                          <input type="number" min={0} max={100} step={0.1} value={pScore} onChange={(ev) => setPScore(ev.target.value)} />
                        </label>
                        <label>
                          Calidad
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={pQuality}
                            onChange={(ev) => setPQuality(ev.target.value)}
                          />
                        </label>
                        <label>
                          Entrega
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={pDelivery}
                            onChange={(ev) => setPDelivery(ev.target.value)}
                          />
                        </label>
                        <label>
                          Servicio
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={pService}
                            onChange={(ev) => setPService(ev.target.value)}
                          />
                        </label>
                      </div>
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
                          disabled={busy}
                          onClick={() =>
                            void (async () => {
                              setBusy(true);
                              try {
                                await api.updateQualityPg05R03(selectedPerf.id, {
                                  period: pPeriod.trim() || undefined,
                                  reviewDate: pReviewDate ? new Date(pReviewDate).toISOString() : undefined,
                                  score: pScore !== "" ? Number(pScore) : undefined,
                                  qualityScore: pQuality !== "" ? Number(pQuality) : undefined,
                                  deliveryScore: pDelivery !== "" ? Number(pDelivery) : undefined,
                                  serviceScore: pService !== "" ? Number(pService) : undefined,
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
                          disabled={busy}
                          onClick={() =>
                            void (async () => {
                              setBusy(true);
                              try {
                                await api.updateQualityPg05R03(selectedPerf.id, {
                                  status: "Completed",
                                  period: pPeriod.trim() || undefined,
                                  reviewDate: pReviewDate ? new Date(pReviewDate).toISOString() : undefined,
                                  score: pScore !== "" ? Number(pScore) : undefined,
                                  qualityScore: pQuality !== "" ? Number(pQuality) : undefined,
                                  deliveryScore: pDelivery !== "" ? Number(pDelivery) : undefined,
                                  serviceScore: pService !== "" ? Number(pService) : undefined,
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
                      <div style={{ marginTop: 8 }}>
                        <strong>Puntajes:</strong> global {selectedPerf.score ?? "—"} / calidad{" "}
                        {selectedPerf.qualityScore ?? "—"} / entrega {selectedPerf.deliveryScore ?? "—"} / servicio{" "}
                        {selectedPerf.serviceScore ?? "—"}
                      </div>
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
