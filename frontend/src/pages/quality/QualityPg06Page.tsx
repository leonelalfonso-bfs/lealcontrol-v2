import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { TenantUser } from "../../api/types";
import type {
  QualityCompetenceReview,
  QualityPersonnelAuthorization,
  QualityPg06Summary,
  QualityRoleAssignment,
  QualityTrainingPlanItem
} from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";

type Tab = "r01" | "r02" | "r03" | "r04";

const TABS: { id: Tab; label: string }[] = [
  { id: "r01", label: "R01 Capacitaciones" },
  { id: "r02", label: "R02 Autorizaciones" },
  { id: "r03", label: "R03 Competencias" },
  { id: "r04", label: "R04 Roles" }
];

const TRAINING_STATUS: Record<string, string> = {
  Planned: "Planificada",
  Done: "Realizada",
  Cancelled: "Anulada"
};

const AUTH_STATUS: Record<string, string> = {
  Draft: "Borrador",
  Authorized: "Autorizada",
  Suspended: "Suspendida",
  Cancelled: "Anulada"
};

const COMP_STATUS: Record<string, string> = {
  Draft: "Borrador",
  Completed: "Completada",
  Cancelled: "Anulada"
};

const ROLE_STATUS: Record<string, string> = {
  Active: "Activa",
  Ended: "Finalizada",
  Cancelled: "Anulada"
};

function parseTab(v: string | null): Tab {
  if (v === "r01" || v === "r03" || v === "r04") return v;
  return "r02";
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

export function QualityPg06Page() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const currentYear = new Date().getFullYear();
  const [summary, setSummary] = useState<QualityPg06Summary | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [trainings, setTrainings] = useState<QualityTrainingPlanItem[]>([]);
  const [auths, setAuths] = useState<QualityPersonnelAuthorization[]>([]);
  const [comps, setComps] = useState<QualityCompetenceReview[]>([]);
  const [roles, setRoles] = useState<QualityRoleAssignment[]>([]);

  // R01 form / detail
  const [tYear, setTYear] = useState(String(currentYear));
  const [tTopic, setTTopic] = useState("");
  const [tRoles, setTRoles] = useState("");
  const [tPlanned, setTPlanned] = useState(new Date().toISOString().slice(0, 10));
  const [tNotes, setTNotes] = useState("");
  const [tEff, setTEff] = useState("");
  const [tDoneDate, setTDoneDate] = useState(new Date().toISOString().slice(0, 10));

  // R02 form / detail
  const [aUserId, setAUserId] = useState("");
  const [aMethodCode, setAMethodCode] = useState("");
  const [aMethodTitle, setAMethodTitle] = useState("");
  const [aEvidence, setAEvidence] = useState("");
  const [aSupervised, setASupervised] = useState("");
  const [aValidUntil, setAValidUntil] = useState("");
  const [aNotes, setANotes] = useState("");

  // R03 form / detail
  const [cUserId, setCUserId] = useState("");
  const [cYear, setCYear] = useState(String(currentYear));
  const [cEvaluator, setCEvaluator] = useState("");
  const [cTech, setCTech] = useState("3");
  const [cPers, setCPers] = useState("3");
  const [cConclusions, setCConclusions] = useState("");
  const [cNotes, setCNotes] = useState("");

  // R04 form / detail
  const [rRole, setRRole] = useState("");
  const [rUserId, setRUserId] = useState("");
  const [rSubId, setRSubId] = useState("");
  const [rSince, setRSince] = useState(new Date().toISOString().slice(0, 10));
  const [rNotes, setRNotes] = useState("");

  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);
  const userName = (id: string) => activeUsers.find((u) => u.id === id)?.fullName || "";

  const selectedTraining = trainings.find((r) => r.id === selectedId) ?? null;
  const selectedAuth = auths.find((r) => r.id === selectedId) ?? null;
  const selectedComp = comps.find((r) => r.id === selectedId) ?? null;
  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;

  const setTab = (next: Tab) => {
    setSearchParams({ tab: next });
    setSelectedId(null);
    setShowForm(false);
    setError(null);
    setMsg(null);
  };

  const loadSummaryAndUsers = () => {
    Promise.all([api.getQualityPg06Summary(), api.listTenantUsers().catch(() => [] as TenantUser[])])
      .then(([sum, list]) => {
        setSummary(sum);
        setUsers(list || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  const loadTab = () => {
    setLoading(true);
    setError(null);
    const done = () => setLoading(false);
    if (tab === "r01") {
      api
        .listQualityPg06R01()
        .then((res) => {
          setTrainings(res.rows || []);
          if (selectedId && !(res.rows || []).some((r) => r.id === selectedId)) setSelectedId(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(done);
    } else if (tab === "r02") {
      api
        .listQualityPg06R02()
        .then((res) => {
          setAuths(res.rows || []);
          if (selectedId && !(res.rows || []).some((r) => r.id === selectedId)) setSelectedId(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(done);
    } else if (tab === "r03") {
      api
        .listQualityPg06R03()
        .then((res) => {
          setComps(res.rows || []);
          if (selectedId && !(res.rows || []).some((r) => r.id === selectedId)) setSelectedId(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(done);
    } else {
      api
        .listQualityPg06R04()
        .then((res) => {
          setRoles(res.rows || []);
          if (selectedId && !(res.rows || []).some((r) => r.id === selectedId)) setSelectedId(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(done);
    }
  };

  useEffect(() => {
    loadSummaryAndUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab === "r01" && selectedTraining) {
      setTEff(selectedTraining.effectivenessCheck || "");
      setTDoneDate(selectedTraining.doneDate ? selectedTraining.doneDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setTNotes(selectedTraining.notes || "");
    }
  }, [tab, selectedTraining?.id]);

  useEffect(() => {
    if (tab === "r02" && selectedAuth) {
      setAMethodCode(selectedAuth.methodDocumentCode || "");
      setAMethodTitle(selectedAuth.methodTitle || "");
      setAEvidence(selectedAuth.trainingEvidence || "");
      setASupervised(selectedAuth.supervisedBy || "");
      setAValidUntil(selectedAuth.validUntil ? selectedAuth.validUntil.slice(0, 10) : "");
      setANotes(selectedAuth.notes || "");
    }
  }, [tab, selectedAuth?.id]);

  useEffect(() => {
    if (tab === "r03" && selectedComp) {
      setCEvaluator(selectedComp.evaluator || "");
      setCTech(String(selectedComp.technicalScore ?? 3));
      setCPers(String(selectedComp.personalScore ?? 3));
      setCConclusions(selectedComp.conclusions || "");
      setCNotes(selectedComp.notes || "");
    }
  }, [tab, selectedComp?.id]);

  const refresh = () => {
    loadSummaryAndUsers();
    loadTab();
  };

  const plantillaCode = `PG06-${tab.toUpperCase()}`;

  const onCreateTraining = async (e: FormEvent) => {
    e.preventDefault();
    if (!tTopic.trim()) {
      setError("El tema es obligatorio.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityTraining({
        programYear: Number(tYear) || currentYear,
        topic: tTopic.trim(),
        targetRoles: tRoles.trim() || undefined,
        plannedDate: tPlanned ? new Date(tPlanned).toISOString() : undefined,
        notes: tNotes.trim() || undefined
      });
      setMsg(`${created.number} planificada.`);
      setShowForm(false);
      setTTopic("");
      setTRoles("");
      setTNotes("");
      setSelectedId(created.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCreateAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!aUserId || !aMethodCode.trim()) {
      setError("Persona y código de método/IT son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityPersonnelAuthorization({
        userId: aUserId,
        personName: userName(aUserId),
        methodDocumentCode: aMethodCode.trim(),
        methodTitle: aMethodTitle.trim() || undefined,
        trainingEvidence: aEvidence.trim() || undefined,
        supervisedBy: aSupervised.trim() || undefined,
        validUntil: aValidUntil ? new Date(aValidUntil).toISOString() : undefined,
        notes: aNotes.trim() || undefined
      });
      setMsg(`${created.number} creada (borrador).`);
      setShowForm(false);
      setAUserId("");
      setAMethodCode("");
      setAMethodTitle("");
      setAEvidence("");
      setASupervised("");
      setAValidUntil("");
      setANotes("");
      setSelectedId(created.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCreateComp = async (e: FormEvent) => {
    e.preventDefault();
    if (!cUserId) {
      setError("Seleccioná una persona.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityCompetenceReview({
        userId: cUserId,
        personName: userName(cUserId),
        reviewYear: Number(cYear) || currentYear,
        evaluator: cEvaluator.trim() || undefined,
        technicalScore: Number(cTech) || undefined,
        personalScore: Number(cPers) || undefined,
        conclusions: cConclusions.trim() || undefined,
        notes: cNotes.trim() || undefined
      });
      setMsg(`${created.number} creada.`);
      setShowForm(false);
      setCUserId("");
      setCEvaluator("");
      setCConclusions("");
      setCNotes("");
      setSelectedId(created.id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCreateRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!rRole.trim() || !rUserId) {
      setError("Rol y titular son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityRoleAssignment({
        role: rRole.trim(),
        userId: rUserId,
        personName: userName(rUserId),
        substituteUserId: rSubId || undefined,
        substituteName: rSubId ? userName(rSubId) : undefined,
        since: rSince ? new Date(rSince).toISOString() : undefined,
        notes: rNotes.trim() || undefined
      });
      setMsg(`${created.number} asignada.`);
      setShowForm(false);
      setRRole("");
      setRUserId("");
      setRSubId("");
      setRNotes("");
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
      const columns: ExcelColumn<QualityTrainingPlanItem>[] = [
        { key: "number", header: "Número" },
        { key: "programYear", header: "Año" },
        { key: "topic", header: "Tema" },
        { key: "targetRoles", header: "Roles destino" },
        { key: "plannedDate", header: "Planificada", value: (r) => excelDate(r.plannedDate) },
        { key: "doneDate", header: "Realizada", value: (r) => (r.doneDate ? excelDate(r.doneDate) : "") },
        { key: "status", header: "Estado", value: (r) => TRAINING_STATUS[r.status] ?? r.status },
        { key: "effectivenessCheck", header: "Eficacia" },
        { key: "notes", header: "Notas" }
      ];
      void exportToExcel("PG06_R01_capacitaciones", trainings, columns);
    } else if (tab === "r02") {
      const columns: ExcelColumn<QualityPersonnelAuthorization>[] = [
        { key: "number", header: "Número" },
        { key: "personName", header: "Persona" },
        { key: "methodDocumentCode", header: "Método/IT" },
        { key: "methodTitle", header: "Título" },
        { key: "status", header: "Estado", value: (r) => AUTH_STATUS[r.status] ?? r.status },
        { key: "validUntil", header: "Vigente hasta", value: (r) => (r.validUntil ? excelDate(r.validUntil) : "") },
        { key: "authorizedByName", header: "Autorizó DT" },
        { key: "supervisedBy", header: "Supervisó" },
        { key: "notes", header: "Notas" }
      ];
      void exportToExcel("PG06_R02_autorizaciones", auths, columns);
    } else if (tab === "r03") {
      const columns: ExcelColumn<QualityCompetenceReview>[] = [
        { key: "number", header: "Número" },
        { key: "personName", header: "Persona" },
        { key: "reviewYear", header: "Año" },
        { key: "evaluator", header: "Evaluador" },
        { key: "technicalScore", header: "Técnica" },
        { key: "personalScore", header: "Personal" },
        { key: "status", header: "Estado", value: (r) => COMP_STATUS[r.status] ?? r.status },
        { key: "conclusions", header: "Conclusiones" }
      ];
      void exportToExcel("PG06_R03_competencias", comps, columns);
    } else {
      const columns: ExcelColumn<QualityRoleAssignment>[] = [
        { key: "number", header: "Número" },
        { key: "role", header: "Rol" },
        { key: "personName", header: "Titular" },
        { key: "substituteName", header: "Reemplazo" },
        { key: "since", header: "Desde", value: (r) => excelDate(r.since) },
        { key: "until", header: "Hasta", value: (r) => (r.until ? excelDate(r.until) : "") },
        { key: "status", header: "Estado", value: (r) => ROLE_STATUS[r.status] ?? r.status }
      ];
      void exportToExcel("PG06_R04_roles", roles, columns);
    }
  };

  const newButtonLabel =
    tab === "r01"
      ? "Nueva capacitación"
      : tab === "r02"
        ? "Nueva autorización"
        : tab === "r03"
          ? "Nueva evaluación"
          : "Nueva asignación";

  const listCount =
    tab === "r01" ? trainings.length : tab === "r02" ? auths.length : tab === "r03" ? comps.length : roles.length;

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to={`/calidad/documentos/${plantillaCode}`} style={{ fontSize: 13 }}>
            ← Plantilla {plantillaCode}
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>PG06 · Personal (capacitaciones, autorizaciones, competencias y roles)</h1>
          <p style={{ marginTop: 6, color: "#64748b", maxWidth: 680 }}>
            Registros estructurados del procedimiento de personal. La pestaña R02 (autorizaciones por método) requiere firma del
            Director Técnico.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline" disabled={listCount === 0} onClick={exportExcel}>
            Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cerrar alta" : newButtonLabel}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {msg && <p style={{ color: "#15803d" }}>{msg}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0", fontSize: 13 }}>
        <span className="card pad" style={{ padding: "6px 10px" }}>
          Capacitaciones abiertas: <strong>{summary?.trainingOpen ?? 0}</strong>
        </span>
        <span className="card pad" style={{ padding: "6px 10px" }}>
          Autorizaciones por vencer: <strong>{summary?.authorizationsExpiringSoon ?? 0}</strong>
        </span>
        <span className="card pad" style={{ padding: "6px 10px" }}>
          Competencias borrador: <strong>{summary?.competenceDraft ?? 0}</strong>
        </span>
        <span className="card pad" style={{ padding: "6px 10px" }}>
          Roles activos: <strong>{summary?.roleActive ?? 0}</strong>
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
        <form className="card pad" onSubmit={(e) => void onCreateTraining(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Planificar capacitación</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label>
              Año
              <input type="number" value={tYear} onChange={(e) => setTYear(e.target.value)} required />
            </label>
            <label>
              Fecha planificada
              <input type="date" value={tPlanned} onChange={(e) => setTPlanned(e.target.value)} required />
            </label>
            <label>
              Roles destino
              <input value={tRoles} onChange={(e) => setTRoles(e.target.value)} placeholder="Analistas, DT…" />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Tema
            <input value={tTopic} onChange={(e) => setTTopic(e.target.value)} style={{ width: "100%" }} required />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas
            <textarea value={tNotes} onChange={(e) => setTNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            Generar
          </button>
        </form>
      )}

      {showForm && tab === "r02" && (
        <form className="card pad" onSubmit={(e) => void onCreateAuth(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nueva autorización (borrador)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label>
              Persona
              <select value={aUserId} onChange={(e) => setAUserId(e.target.value)} required>
                <option value="">— Seleccionar —</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Código método / IT
              <input value={aMethodCode} onChange={(e) => setAMethodCode(e.target.value)} required />
            </label>
            <label>
              Título método
              <input value={aMethodTitle} onChange={(e) => setAMethodTitle(e.target.value)} />
            </label>
            <label>
              Supervisado por
              <input value={aSupervised} onChange={(e) => setASupervised(e.target.value)} />
            </label>
            <label>
              Vigente hasta
              <input type="date" value={aValidUntil} onChange={(e) => setAValidUntil(e.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Evidencia de entrenamiento
            <textarea value={aEvidence} onChange={(e) => setAEvidence(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas
            <textarea value={aNotes} onChange={(e) => setANotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            Crear borrador
          </button>
        </form>
      )}

      {showForm && tab === "r03" && (
        <form className="card pad" onSubmit={(e) => void onCreateComp(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nueva evaluación de competencias</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <label>
              Persona
              <select value={cUserId} onChange={(e) => setCUserId(e.target.value)} required>
                <option value="">— Seleccionar —</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Año
              <input type="number" value={cYear} onChange={(e) => setCYear(e.target.value)} required />
            </label>
            <label>
              Evaluador
              <input value={cEvaluator} onChange={(e) => setCEvaluator(e.target.value)} />
            </label>
            <label>
              Puntaje técnico (1–5)
              <input type="number" min={1} max={5} value={cTech} onChange={(e) => setCTech(e.target.value)} />
            </label>
            <label>
              Puntaje personal (1–5)
              <input type="number" min={1} max={5} value={cPers} onChange={(e) => setCPers(e.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Conclusiones
            <textarea value={cConclusions} onChange={(e) => setCConclusions(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas
            <textarea value={cNotes} onChange={(e) => setCNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            Crear
          </button>
        </form>
      )}

      {showForm && tab === "r04" && (
        <form className="card pad" onSubmit={(e) => void onCreateRole(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Asignar rol / función</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label>
              Rol
              <input value={rRole} onChange={(e) => setRRole(e.target.value)} required placeholder="Director Técnico, Responsable Calidad…" />
            </label>
            <label>
              Titular
              <select value={rUserId} onChange={(e) => setRUserId(e.target.value)} required>
                <option value="">— Seleccionar —</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reemplazo (opcional)
              <select value={rSubId} onChange={(e) => setRSubId(e.target.value)}>
                <option value="">— Ninguno —</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Desde
              <input type="date" value={rSince} onChange={(e) => setRSince(e.target.value)} required />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Notas
            <textarea value={rNotes} onChange={(e) => setRNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            Asignar
          </button>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.9fr)", gap: 16 }}>
        <div className="card pad">
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : tab === "r01" ? (
            trainings.length === 0 ? (
              <p className="muted">Sin capacitaciones.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Año</th>
                      <th>Tema</th>
                      <th>Planificada</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainings.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        style={{ cursor: "pointer", background: selectedId === r.id ? "#e0f2fe" : undefined }}
                      >
                        <td>{r.number}</td>
                        <td>{r.programYear}</td>
                        <td style={{ maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.topic}
                        </td>
                        <td>{fmtDate(r.plannedDate)}</td>
                        <td>{TRAINING_STATUS[r.status] ?? r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : tab === "r02" ? (
            auths.length === 0 ? (
              <p className="muted">Sin autorizaciones.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Persona</th>
                      <th>Método</th>
                      <th>Estado</th>
                      <th>Vigente hasta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auths.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        style={{
                          cursor: "pointer",
                          background: selectedId === r.id ? "#e0f2fe" : r.isExpired ? "#fef2f2" : undefined
                        }}
                      >
                        <td>{r.number}</td>
                        <td>{r.personName}</td>
                        <td>{r.methodDocumentCode}</td>
                        <td>
                          {AUTH_STATUS[r.status] ?? r.status}
                          {r.isExpired ? " · vencida" : ""}
                        </td>
                        <td>{fmtDate(r.validUntil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : tab === "r03" ? (
            comps.length === 0 ? (
              <p className="muted">Sin evaluaciones.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Persona</th>
                      <th>Año</th>
                      <th>Técnica</th>
                      <th>Personal</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        style={{ cursor: "pointer", background: selectedId === r.id ? "#e0f2fe" : undefined }}
                      >
                        <td>{r.number}</td>
                        <td>{r.personName}</td>
                        <td>{r.reviewYear}</td>
                        <td>{r.technicalScore ?? "—"}</td>
                        <td>{r.personalScore ?? "—"}</td>
                        <td>{COMP_STATUS[r.status] ?? r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : roles.length === 0 ? (
            <p className="muted">Sin asignaciones de rol.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Rol</th>
                    <th>Titular</th>
                    <th>Reemplazo</th>
                    <th>Desde</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      style={{ cursor: "pointer", background: selectedId === r.id ? "#e0f2fe" : undefined }}
                    >
                      <td>{r.number}</td>
                      <td>{r.role}</td>
                      <td>{r.personName}</td>
                      <td>{r.substituteName || "—"}</td>
                      <td>{fmtDate(r.since)}</td>
                      <td>{ROLE_STATUS[r.status] ?? r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card pad">
          {tab === "r01" &&
            (!selectedTraining ? (
              <p className="muted">Seleccioná una capacitación.</p>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{selectedTraining.number}</h3>
                <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                  {TRAINING_STATUS[selectedTraining.status] ?? selectedTraining.status} · {selectedTraining.programYear}
                </p>
                <p style={{ fontSize: 13 }}>{selectedTraining.topic}</p>
                {selectedTraining.status !== "Cancelled" && selectedTraining.status !== "Done" && (
                  <>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Fecha realización
                      <input type="date" value={tDoneDate} onChange={(e) => setTDoneDate(e.target.value)} />
                    </label>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Verificación de eficacia
                      <textarea value={tEff} onChange={(e) => setTEff(e.target.value)} rows={3} style={{ width: "100%" }} />
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() =>
                          void (async () => {
                            setBusy(true);
                            setError(null);
                            try {
                              await api.updateQualityTraining(selectedTraining.id, {
                                status: "Done",
                                doneDate: tDoneDate ? new Date(tDoneDate).toISOString() : new Date().toISOString(),
                                effectivenessCheck: tEff.trim() || undefined
                              });
                              setMsg("Capacitación marcada como realizada.");
                              refresh();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : String(err));
                            } finally {
                              setBusy(false);
                            }
                          })()
                        }
                      >
                        Marcar realizada
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy}
                        onClick={() =>
                          void (async () => {
                            setBusy(true);
                            try {
                              await api.updateQualityTraining(selectedTraining.id, {
                                effectivenessCheck: tEff.trim() || undefined,
                                notes: tNotes.trim() || undefined
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
                        Guardar eficacia
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() =>
                          void (async () => {
                            if (!window.confirm(`¿Anular ${selectedTraining.number}?`)) return;
                            setBusy(true);
                            try {
                              await api.cancelQualityTraining(selectedTraining.id);
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
                {(selectedTraining.status === "Done" || selectedTraining.status === "Cancelled") && (
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    <div>
                      <strong>Realizada:</strong> {fmtDate(selectedTraining.doneDate)}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>Eficacia:</strong> {selectedTraining.effectivenessCheck || "—"}
                    </div>
                  </div>
                )}
              </>
            ))}

          {tab === "r02" &&
            (!selectedAuth ? (
              <p className="muted">Seleccioná una autorización. Solo el Director Técnico puede firmar.</p>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{selectedAuth.number}</h3>
                <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                  {AUTH_STATUS[selectedAuth.status] ?? selectedAuth.status}
                  {selectedAuth.isExpired ? " · vencida" : ""} · {selectedAuth.personName}
                </p>
                <p style={{ marginBottom: 12 }}>
                  <Link
                    className="btn btn-outline compact"
                    to={`/calidad/registros/personal/autorizacion/${selectedAuth.id}/pdf`}
                  >
                    Exportar PDF
                  </Link>
                </p>
                {selectedAuth.status !== "Cancelled" && (
                  <>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Código método / IT
                      <input
                        value={aMethodCode}
                        onChange={(e) => setAMethodCode(e.target.value)}
                        style={{ width: "100%" }}
                        disabled={selectedAuth.status === "Authorized"}
                      />
                    </label>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Título
                      <input
                        value={aMethodTitle}
                        onChange={(e) => setAMethodTitle(e.target.value)}
                        style={{ width: "100%" }}
                        disabled={selectedAuth.status === "Authorized"}
                      />
                    </label>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Evidencia de entrenamiento
                      <textarea value={aEvidence} onChange={(e) => setAEvidence(e.target.value)} rows={2} style={{ width: "100%" }} />
                    </label>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Supervisado por
                      <input value={aSupervised} onChange={(e) => setASupervised(e.target.value)} style={{ width: "100%" }} />
                    </label>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Vigente hasta
                      <input type="date" value={aValidUntil} onChange={(e) => setAValidUntil(e.target.value)} />
                    </label>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Notas
                      <textarea value={aNotes} onChange={(e) => setANotes(e.target.value)} rows={2} style={{ width: "100%" }} />
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
                              await api.updateQualityPersonnelAuthorization(selectedAuth.id, {
                                methodDocumentCode: aMethodCode.trim() || undefined,
                                methodTitle: aMethodTitle.trim() || undefined,
                                trainingEvidence: aEvidence.trim() || undefined,
                                supervisedBy: aSupervised.trim() || undefined,
                                validUntil: aValidUntil ? new Date(aValidUntil).toISOString() : undefined,
                                notes: aNotes.trim() || undefined
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
                        Guardar textos
                      </button>
                      {(selectedAuth.status === "Draft" || selectedAuth.status === "Suspended") && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          title="Solo el Director Técnico puede firmar"
                          onClick={() =>
                            void (async () => {
                              setBusy(true);
                              setError(null);
                              setMsg(null);
                              try {
                                await api.authorizeQualityPersonnel(selectedAuth.id, {
                                  validUntil: aValidUntil ? new Date(aValidUntil).toISOString() : undefined,
                                  notes: aNotes.trim() || undefined
                                });
                                setMsg("Autorización firmada por DT.");
                                refresh();
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "No se pudo firmar. Solo el Director Técnico está autorizado."
                                );
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          Firmar autorización (DT)
                        </button>
                      )}
                      {selectedAuth.status === "Authorized" && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={busy}
                          onClick={() =>
                            void (async () => {
                              setBusy(true);
                              try {
                                await api.updateQualityPersonnelAuthorization(selectedAuth.id, { status: "Suspended" });
                                setMsg("Autorización suspendida.");
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
                            if (!window.confirm(`¿Anular ${selectedAuth.number}?`)) return;
                            setBusy(true);
                            try {
                              await api.cancelQualityPersonnelAuthorization(selectedAuth.id);
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
                    {selectedAuth.authorizedByName ? (
                      <p style={{ fontSize: 12, color: "#64748b", marginTop: 12 }}>
                        Firmada por {selectedAuth.authorizedByName}
                        {selectedAuth.authorizedAt ? ` · ${fmtDate(selectedAuth.authorizedAt)}` : ""}
                      </p>
                    ) : null}
                  </>
                )}
              </>
            ))}

          {tab === "r03" &&
            (!selectedComp ? (
              <p className="muted">Seleccioná una evaluación.</p>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{selectedComp.number}</h3>
                <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                  {COMP_STATUS[selectedComp.status] ?? selectedComp.status} · {selectedComp.personName} ·{" "}
                  {selectedComp.reviewYear}
                </p>
                {selectedComp.status === "Draft" && (
                  <>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Evaluador
                      <input value={cEvaluator} onChange={(e) => setCEvaluator(e.target.value)} style={{ width: "100%" }} />
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <label>
                        Técnica (1–5)
                        <input type="number" min={1} max={5} value={cTech} onChange={(e) => setCTech(e.target.value)} />
                      </label>
                      <label>
                        Personal (1–5)
                        <input type="number" min={1} max={5} value={cPers} onChange={(e) => setCPers(e.target.value)} />
                      </label>
                    </div>
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Conclusiones
                      <textarea
                        value={cConclusions}
                        onChange={(e) => setCConclusions(e.target.value)}
                        rows={3}
                        style={{ width: "100%" }}
                      />
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
                              await api.updateQualityCompetenceReview(selectedComp.id, {
                                evaluator: cEvaluator.trim() || undefined,
                                technicalScore: Number(cTech) || undefined,
                                personalScore: Number(cPers) || undefined,
                                conclusions: cConclusions.trim() || undefined,
                                notes: cNotes.trim() || undefined
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
                              await api.updateQualityCompetenceReview(selectedComp.id, {
                                status: "Completed",
                                evaluator: cEvaluator.trim() || undefined,
                                technicalScore: Number(cTech) || undefined,
                                personalScore: Number(cPers) || undefined,
                                conclusions: cConclusions.trim() || undefined
                              });
                              setMsg("Evaluación completada.");
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
                            if (!window.confirm(`¿Anular ${selectedComp.number}?`)) return;
                            setBusy(true);
                            try {
                              await api.cancelQualityCompetenceReview(selectedComp.id);
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
                {selectedComp.status !== "Draft" && (
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    <div>
                      <strong>Evaluador:</strong> {selectedComp.evaluator || "—"}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>Puntajes:</strong> técnica {selectedComp.technicalScore ?? "—"} / personal{" "}
                      {selectedComp.personalScore ?? "—"}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>Conclusiones:</strong> {selectedComp.conclusions || "—"}
                    </div>
                  </div>
                )}
              </>
            ))}

          {tab === "r04" &&
            (!selectedRole ? (
              <p className="muted">Seleccioná una asignación de rol.</p>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{selectedRole.number}</h3>
                <p style={{ marginTop: 0, color: "#64748b", fontSize: 13 }}>
                  {ROLE_STATUS[selectedRole.status] ?? selectedRole.status} · {selectedRole.role}
                </p>
                <p style={{ fontSize: 13 }}>
                  Titular: <strong>{selectedRole.personName}</strong>
                  {selectedRole.substituteName ? (
                    <>
                      <br />
                      Reemplazo: {selectedRole.substituteName}
                    </>
                  ) : null}
                  <br />
                  Desde: {fmtDate(selectedRole.since)}
                  {selectedRole.until ? <> · Hasta: {fmtDate(selectedRole.until)}</> : null}
                </p>
                {selectedRole.status === "Active" && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          try {
                            await api.updateQualityRoleAssignment(selectedRole.id, {
                              status: "Ended",
                              until: new Date().toISOString()
                            });
                            setMsg("Asignación finalizada.");
                            refresh();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : String(err));
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      Finalizar asignación
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          if (!window.confirm(`¿Anular ${selectedRole.number}?`)) return;
                          setBusy(true);
                          try {
                            await api.cancelQualityRoleAssignment(selectedRole.id);
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
                )}
              </>
            ))}
        </div>
      </div>
    </div>
  );
}
