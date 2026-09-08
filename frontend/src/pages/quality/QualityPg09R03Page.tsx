import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CalibrationReport } from "../../api/types";
import type { QualitySatisfactionSurvey } from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";

const STATUS_LABEL: Record<string, string> = {
  Draft: "Borrador",
  Received: "Recibida",
  Cancelled: "Anulada"
};

const CHANNEL_LABEL: Record<string, string> = {
  Email: "Correo",
  Phone: "Teléfono",
  InPerson: "Presencial",
  Other: "Otro"
};

const SCORE_OPTIONS = [1, 2, 3, 4, 5] as const;

type Filter = "all" | "Draft" | "Received" | "Cancelled";

function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}

function channelLabel(s?: string) {
  if (!s) return "—";
  return CHANNEL_LABEL[s] ?? s;
}

function certOf(r: CalibrationReport): string {
  return r.certificateNumber || r.reportNumber || "";
}

function scoreSelect(
  value: string,
  onChange: (v: string) => void,
  disabled?: boolean
) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">—</option>
      {SCORE_OPTIONS.map((n) => (
        <option key={n} value={String(n)}>
          {n}
        </option>
      ))}
    </select>
  );
}

function parseOptionalScore(raw: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function QualityPg09R03Page() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<QualitySatisfactionSurvey[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [receivedCount, setReceivedCount] = useState(0);
  const [averageOverall, setAverageOverall] = useState<number | null>(null);
  const [reports, setReports] = useState<CalibrationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [customerName, setCustomerName] = useState("");
  const [surveyDate, setSurveyDate] = useState(new Date().toISOString().slice(0, 10));
  const [certificateNumber, setCertificateNumber] = useState("");
  const [calibrationReportId, setCalibrationReportId] = useState("");
  const [channel, setChannel] = useState("Other");
  const [scorePunctuality, setScorePunctuality] = useState("");
  const [scoreQuality, setScoreQuality] = useState("");
  const [scoreCommunication, setScoreCommunication] = useState("");
  const [scoreOverall, setScoreOverall] = useState("");
  const [comments, setComments] = useState("");
  const [notes, setNotes] = useState("");

  const [editCustomerName, setEditCustomerName] = useState("");
  const [editSurveyDate, setEditSurveyDate] = useState("");
  const [editCertificateNumber, setEditCertificateNumber] = useState("");
  const [editCalibrationReportId, setEditCalibrationReportId] = useState("");
  const [editChannel, setEditChannel] = useState("Other");
  const [editScorePunctuality, setEditScorePunctuality] = useState("");
  const [editScoreQuality, setEditScoreQuality] = useState("");
  const [editScoreCommunication, setEditScoreCommunication] = useState("");
  const [editScoreOverall, setEditScoreOverall] = useState("");
  const [editComments, setEditComments] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const recentReports = useMemo(
    () =>
      [...reports]
        .sort((a, b) => String(b.createdAtUtc || b.calibrationDate).localeCompare(String(a.createdAtUtc || a.calibrationDate)))
        .slice(0, 40),
    [reports]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.listQualityPg09R03(),
      api.listCalibrationReports().catch(() => [] as CalibrationReport[])
    ])
      .then(([res, reportList]) => {
        setRows(res.rows || []);
        setDraftCount(res.draftCount ?? 0);
        setReceivedCount(res.receivedCount ?? 0);
        setAverageOverall(res.averageOverall ?? null);
        setReports(reportList || []);
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
    const fromReport = searchParams.get("fromReport");
    const cert = searchParams.get("cert");
    const customer = searchParams.get("customer");
    if (!fromReport && !cert && !customer) return;
    setShowForm(true);
    if (customer) setCustomerName(customer);
    if (cert) setCertificateNumber(cert);
    if (fromReport) setCalibrationReportId(fromReport);
  }, [searchParams]);

  useEffect(() => {
    if (!selected) return;
    setEditCustomerName(selected.customerName || "");
    setEditSurveyDate(selected.surveyDate ? selected.surveyDate.slice(0, 10) : "");
    setEditCertificateNumber(selected.certificateNumber || "");
    setEditCalibrationReportId(selected.calibrationReportId || "");
    setEditChannel(selected.channel || "Other");
    setEditScorePunctuality(selected.scorePunctuality != null ? String(selected.scorePunctuality) : "");
    setEditScoreQuality(selected.scoreQuality != null ? String(selected.scoreQuality) : "");
    setEditScoreCommunication(selected.scoreCommunication != null ? String(selected.scoreCommunication) : "");
    setEditScoreOverall(selected.scoreOverall != null ? String(selected.scoreOverall) : "");
    setEditComments(selected.comments || "");
    setEditNotes(selected.notes || "");
  }, [selected?.id]);

  const applyReportLink = (
    reportId: string,
    setReportId: (v: string) => void,
    setCert: (v: string) => void,
    setCustomer: (v: string) => void,
    currentCustomer: string
  ) => {
    setReportId(reportId);
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;
    const cert = certOf(report);
    if (cert) setCert(cert);
    if (!currentCustomer.trim() && report.customerName) setCustomer(report.customerName);
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualitySatisfactionSurvey({
        customerName: customerName.trim(),
        surveyDate: surveyDate ? new Date(surveyDate).toISOString() : undefined,
        calibrationReportId: calibrationReportId || undefined,
        certificateNumber: certificateNumber.trim() || undefined,
        channel,
        scorePunctuality: parseOptionalScore(scorePunctuality),
        scoreQuality: parseOptionalScore(scoreQuality),
        scoreCommunication: parseOptionalScore(scoreCommunication),
        scoreOverall: parseOptionalScore(scoreOverall),
        comments: comments.trim() || undefined,
        notes: notes.trim() || undefined
      });
      setMsg(`Encuesta ${created.number} creada.`);
      setShowForm(false);
      setCustomerName("");
      setCertificateNumber("");
      setCalibrationReportId("");
      setChannel("Other");
      setScorePunctuality("");
      setScoreQuality("");
      setScoreCommunication("");
      setScoreOverall("");
      setComments("");
      setNotes("");
      setSurveyDate(new Date().toISOString().slice(0, 10));
      setSelectedId(created.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body: Parameters<typeof api.updateQualitySatisfactionSurvey>[1], ok: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.updateQualitySatisfactionSurvey(selected.id, body);
      setMsg(ok);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSave = () =>
    void patch(
      {
        customerName: editCustomerName.trim(),
        surveyDate: editSurveyDate ? new Date(editSurveyDate).toISOString() : undefined,
        calibrationReportId: editCalibrationReportId || null,
        certificateNumber: editCertificateNumber.trim(),
        channel: editChannel,
        scorePunctuality: parseOptionalScore(editScorePunctuality) ?? null,
        scoreQuality: parseOptionalScore(editScoreQuality) ?? null,
        scoreCommunication: parseOptionalScore(editScoreCommunication) ?? null,
        scoreOverall: parseOptionalScore(editScoreOverall) ?? null,
        comments: editComments,
        notes: editNotes
      },
      "Encuesta guardada."
    );

  const onMarkReceived = () => void patch({ status: "Received" }, "Encuesta marcada como recibida.");

  const onCancel = async (id: string) => {
    if (!window.confirm("¿Anular esta encuesta?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelQualitySatisfactionSurvey(id);
      setMsg("Encuesta anulada.");
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
    const columns: ExcelColumn<QualitySatisfactionSurvey>[] = [
      { key: "number", header: "Número" },
      { key: "surveyDate", header: "Fecha", value: (r) => excelDate(r.surveyDate) },
      { key: "customerName", header: "Cliente" },
      { key: "certificateNumber", header: "Certificado" },
      { key: "channel", header: "Canal", value: (r) => channelLabel(r.channel) },
      { key: "scorePunctuality", header: "Puntualidad" },
      { key: "scoreQuality", header: "Calidad" },
      { key: "scoreCommunication", header: "Comunicación" },
      { key: "scoreOverall", header: "General" },
      { key: "averageScore", header: "Promedio" },
      { key: "status", header: "Estado", value: (r) => statusLabel(r.status) },
      { key: "comments", header: "Comentarios" },
      { key: "notes", header: "Notas" }
    ];
    void exportToExcel(`PG09-R03_encuestas_${filter}`, filtered, columns);
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to="/calidad/documentos/PG09-R03" style={{ fontSize: 13 }}>
            ← Plantilla PG09-R03
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>PG09-R03 · Encuesta de satisfacción</h1>
          <p style={{ marginTop: 6, color: "#64748b", maxWidth: 640 }}>
            Cada encuesta se <strong>genera en el sistema</strong> (ENC-AAAA-NNNN). Puntajes 1–5 y vínculo
            opcional al informe de ensayo.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline" disabled={filtered.length === 0} onClick={exportExcel}>
            Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cerrar alta" : "Nueva encuesta"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {msg && <p style={{ color: "#15803d" }}>{msg}</p>}
      <p style={{ fontSize: 13, color: "#64748b" }}>
        Borradores: <strong>{draftCount}</strong> · Recibidas: <strong>{receivedCount}</strong>
        {averageOverall != null ? (
          <>
            {" "}
            · Promedio recibidas: <strong>{averageOverall.toFixed(2)}</strong>
          </>
        ) : null}{" "}
        · Total: {rows.length}
      </p>

      {showForm && (
        <form className="card pad" onSubmit={(e) => void onCreate(e)} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Nueva encuesta de satisfacción</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label>
              Cliente *
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            </label>
            <label>
              Fecha
              <input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} required />
            </label>
            <label>
              Canal
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="Email">Correo</option>
                <option value="Phone">Teléfono</option>
                <option value="InPerson">Presencial</option>
                <option value="Other">Otro</option>
              </select>
            </label>
            <label>
              Nº certificado
              <input value={certificateNumber} onChange={(e) => setCertificateNumber(e.target.value)} />
            </label>
            <label>
              Informe de ensayo
              <select
                value={calibrationReportId}
                onChange={(e) =>
                  applyReportLink(e.target.value, setCalibrationReportId, setCertificateNumber, setCustomerName, customerName)
                }
              >
                <option value="">Sin vincular</option>
                {recentReports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {certOf(r) || r.reportNumber} · {r.customerName || "—"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 12 }}>
            <label>
              Puntualidad (1–5)
              {scoreSelect(scorePunctuality, setScorePunctuality)}
            </label>
            <label>
              Calidad técnica (1–5)
              {scoreSelect(scoreQuality, setScoreQuality)}
            </label>
            <label>
              Comunicación (1–5)
              {scoreSelect(scoreCommunication, setScoreCommunication)}
            </label>
            <label>
              Satisfacción general (1–5)
              {scoreSelect(scoreOverall, setScoreOverall)}
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Comentarios
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Notas internas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            Generar ENC
          </button>
        </form>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {(["all", "Draft", "Received", "Cancelled"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`btn ${filter === f ? "btn-primary" : "btn-outline"}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Todas" : statusLabel(f)}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Cargando…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1.2fr)", gap: 16 }}>
          <div className="card pad" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "6px 4px" }}>Número</th>
                  <th style={{ padding: "6px 4px" }}>Cliente</th>
                  <th style={{ padding: "6px 4px" }}>Prom.</th>
                  <th style={{ padding: "6px 4px" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    style={{
                      cursor: "pointer",
                      background: selectedId === r.id ? "#f1f5f9" : undefined,
                      borderBottom: "1px solid #f1f5f9"
                    }}
                  >
                    <td style={{ padding: "8px 4px" }}>{r.number}</td>
                    <td style={{ padding: "8px 4px" }}>{r.customerName}</td>
                    <td style={{ padding: "8px 4px" }}>{r.averageScore != null ? r.averageScore.toFixed(1) : "—"}</td>
                    <td style={{ padding: "8px 4px" }}>{statusLabel(r.status)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: "#64748b" }}>
                      Sin encuestas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card pad">
            {!selected ? (
              <p style={{ color: "#64748b", margin: 0 }}>Seleccioná una encuesta para ver el detalle.</p>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{selected.number}</h3>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
                      {statusLabel(selected.status)}
                      {selected.averageScore != null ? ` · promedio ${selected.averageScore.toFixed(2)}` : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link className="btn btn-outline" to={`/calidad/registros/encuestas/${selected.id}/pdf`}>
                      PDF
                    </Link>
                    {selected.status !== "Cancelled" && (
                      <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void onCancel(selected.id)}>
                        Anular
                      </button>
                    )}
                  </div>
                </div>

                {editable ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
                      <label>
                        Cliente
                        <input value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} />
                      </label>
                      <label>
                        Fecha
                        <input type="date" value={editSurveyDate} onChange={(e) => setEditSurveyDate(e.target.value)} />
                      </label>
                      <label>
                        Canal
                        <select value={editChannel} onChange={(e) => setEditChannel(e.target.value)}>
                          <option value="Email">Correo</option>
                          <option value="Phone">Teléfono</option>
                          <option value="InPerson">Presencial</option>
                          <option value="Other">Otro</option>
                        </select>
                      </label>
                      <label>
                        Nº certificado
                        <input value={editCertificateNumber} onChange={(e) => setEditCertificateNumber(e.target.value)} />
                      </label>
                      <label>
                        Informe de ensayo
                        <select
                          value={editCalibrationReportId}
                          onChange={(e) =>
                            applyReportLink(
                              e.target.value,
                              setEditCalibrationReportId,
                              setEditCertificateNumber,
                              setEditCustomerName,
                              editCustomerName
                            )
                          }
                        >
                          <option value="">Sin vincular</option>
                          {recentReports.map((r) => (
                            <option key={r.id} value={r.id}>
                              {certOf(r) || r.reportNumber} · {r.customerName || "—"}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 12 }}>
                      <label>
                        Puntualidad
                        {scoreSelect(editScorePunctuality, setEditScorePunctuality)}
                      </label>
                      <label>
                        Calidad
                        {scoreSelect(editScoreQuality, setEditScoreQuality)}
                      </label>
                      <label>
                        Comunicación
                        {scoreSelect(editScoreCommunication, setEditScoreCommunication)}
                      </label>
                      <label>
                        General
                        {scoreSelect(editScoreOverall, setEditScoreOverall)}
                      </label>
                    </div>
                    <label style={{ display: "block", marginTop: 12 }}>
                      Comentarios
                      <textarea value={editComments} onChange={(e) => setEditComments(e.target.value)} rows={3} style={{ width: "100%" }} />
                    </label>
                    <label style={{ display: "block", marginTop: 8 }}>
                      Notas
                      <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
                    </label>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={onSave}>
                        Guardar
                      </button>
                      <button type="button" className="btn btn-outline" disabled={busy} onClick={onMarkReceived}>
                        Marcar recibida
                      </button>
                    </div>
                  </>
                ) : (
                  <dl
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      display: "grid",
                      gridTemplateColumns: "auto 1fr",
                      gap: "6px 12px"
                    }}
                  >
                    <dt>Cliente</dt>
                    <dd style={{ margin: 0 }}>{selected.customerName}</dd>
                    <dt>Fecha</dt>
                    <dd style={{ margin: 0 }}>{new Date(selected.surveyDate).toLocaleDateString("es-AR")}</dd>
                    <dt>Canal</dt>
                    <dd style={{ margin: 0 }}>{channelLabel(selected.channel)}</dd>
                    <dt>Certificado</dt>
                    <dd style={{ margin: 0 }}>{selected.certificateNumber || "—"}</dd>
                    <dt>Puntualidad</dt>
                    <dd style={{ margin: 0 }}>{selected.scorePunctuality ?? "—"}</dd>
                    <dt>Calidad</dt>
                    <dd style={{ margin: 0 }}>{selected.scoreQuality ?? "—"}</dd>
                    <dt>Comunicación</dt>
                    <dd style={{ margin: 0 }}>{selected.scoreCommunication ?? "—"}</dd>
                    <dt>General</dt>
                    <dd style={{ margin: 0 }}>{selected.scoreOverall ?? "—"}</dd>
                    <dt>Comentarios</dt>
                    <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{selected.comments || "—"}</dd>
                    <dt>Notas</dt>
                    <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{selected.notes || "—"}</dd>
                  </dl>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
