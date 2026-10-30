import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyEquipment, StandardWeight } from "../../api/types";
import type { TruckScaleData, TruckScaleEvaluation, TruckScaleInput, TruckScaleReport, TruckScaleVerdict } from "../../api/types/truckScale";
import { useAuth } from "../../context/AuthContext";

const num = (n?: number | null, dec = 0) => (n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: 2 }));
const today = () => new Date().toISOString().slice(0, 10);
const nextYear = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + 1); return d.toISOString().slice(0, 10); };
const VERDICT: Record<TruckScaleVerdict, { text: string; color: string; bg: string }> = {
  Satisface: { text: "Satisface", color: "#2E6B1F", bg: "#E3F1DA" },
  NoSatisface: { text: "No satisface", color: "#A1271B", bg: "#FCE8E6" },
  NoEnsayado: { text: "No ensayado", color: "#9a5b00", bg: "#FFF1E0" },
  NoAplica: { text: "No aplica", color: "#64748b", bg: "transparent" }
};
const INSPECTION = [
  "Estado general de la plataforma y módulos", "Topes y juego lateral / longitudinal", "Celdas de carga y soportes", "Cajas de suma y cables de señal",
  "Fosa: limpieza y drenaje", "Rampas de acceso y nivelación", "Indicador: precintos y marcas obligatorias", "Puesta a tierra y alimentación"
];
const ROLLING = ["Ida – inicio", "Ida – centro", "Ida – final", "Vuelta – inicio", "Vuelta – centro", "Vuelta – final"];
const numberInput = (value: number | null | undefined, onChange: (v: number | null) => void, extra: Record<string, unknown> = {}) => (
  <input type="number" inputMode="decimal" step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} {...extra} />
);

function emptyInput(user?: string): TruckScaleInput {
  const date = today();
  return {
    equipmentId: "", standard: "2307", serviceNumber: "", remitoNumber: "", orderReference: "", procedureCode: "PE-02 rev03", calibrationDate: date,
    nextCalibrationDate: nextYear(date), performedBy: user ?? "", modules: 0, weightIds: [], substitution: null,
    inspection: INSPECTION.map((point) => ({ point, status: "OK", observation: "" })), weighing: [], repeatability: { load: 0, readings: [0, 0, 0] },
    eccentricity: { method: "apoyos", load: 0, positions: [], rows: null }, zero: { at4Percent: null, at4PercentPlusE: null, zeroErrorE: null },
    mobility: [], observations: [], temperatureCelsius: null, thermometerInstrumentId: null
  };
}

/** Carga del informe de calibración de báscula camionera (en campo o en oficina) con el resultado calculado en vivo. */
export function TruckScaleReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const storageKey = `truck-scale-draft-${id ?? "new"}`;
  const [report, setReport] = useState<TruckScaleReport | null>(null);
  const [input, setInput] = useState<TruckScaleInput>(() => emptyInput(user?.fullName));
  const [equipment, setEquipment] = useState<MetrologyEquipment[]>([]);
  const [weights, setWeights] = useState<StandardWeight[]>([]);
  const [evaluation, setEvaluation] = useState<TruckScaleEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canApprove = !!user?.isTechnicalDirector || user?.role === "Admin" || user?.role === "Administrador" || user?.role === "DirectorTecnico";

  useEffect(() => {
    api.listMetrologyEquipment().then(setEquipment).catch(() => setEquipment([]));
    api.listStandardWeights().then(setWeights).catch(() => setWeights([]));
    if (id) api.getTruckScaleReport(id).then((r) => { setReport(r); setInput({ ...r.input, calibrationDate: r.input.calibrationDate.slice(0, 10), nextCalibrationDate: r.input.nextCalibrationDate?.slice(0, 10) ?? null }); })
      .catch((err) => setError(err.message));
    else {
      try { const saved = localStorage.getItem(storageKey); if (saved) setInput(JSON.parse(saved)); } catch { /* sin respaldo local */ }
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Respaldo en el equipo mientras se carga en campo (si se corta la conexión, no se pierde lo tipeado).
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(input)); } catch { /* sin almacenamiento */ } }, [input, storageKey]);

  const eq = equipment.find((e) => e.id === input.equipmentId);
  const locked = !!report && report.reportStatus !== "Draft";
  const set = (patch: Partial<TruckScaleInput>) => setInput((prev) => ({ ...prev, ...patch }));

  // Datos para el cálculo en vivo: instrumento del equipo y patrones del maestro, agrupados como en el servidor.
  const data = useMemo<TruckScaleData | null>(() => {
    if (!eq) return null;
    const chosen = weights.filter((w) => input.weightIds.includes(w.id));
    const groups = new Map<string, StandardWeight[]>();
    chosen.forEach((w) => { const k = `${w.nominalValue}|${w.certificateNumber}|${w.expirationDate ?? ""}`; groups.set(k, [...(groups.get(k) ?? []), w]); });
    return {
      standard: input.standard,
      instrument: { max: eq.maxCapacity, e: eq.verificationIntervalE, d: eq.divisionD, accuracyClass: eq.accuracyClass, unit: eq.unit, indication: eq.indicationType?.startsWith("Anal") ? "analogica" : "digital", supports: eq.loadCellsCount, modules: input.modules },
      weights: [...groups.values()].map((g) => ({ mass: g[0].nominalValue, quantity: g.length, identification: g.map((w) => w.code).join(" · "), certificate: g[0].certificateNumber, expiration: g[0].expirationDate })),
      substitution: input.substitution, inspection: input.inspection, weighing: input.weighing, repeatability: input.repeatability, eccentricity: input.eccentricity,
      zero: input.zero, mobility: input.mobility, observations: input.observations
    };
  }, [eq, weights, input]);

  useEffect(() => {
    if (!data) return setEvaluation(null);
    const t = setTimeout(() => api.evaluateTruckScale(data, `${input.calibrationDate}T00:00:00Z`).then(setEvaluation).catch(() => setEvaluation(null)), 400);
    return () => clearTimeout(t);
  }, [data, input.calibrationDate]);

  const pickEquipment = (equipmentId: string) => {
    const e = equipment.find((x) => x.id === equipmentId);
    const supports = e?.loadCellsCount ?? 0;
    set({
      equipmentId, standard: e?.applicableStandard === "Res25_2025" ? "25/2025" : "2307",
      eccentricity: { method: "apoyos", load: e ? Math.round(e.maxCapacity / Math.max(1, supports)) : 0, positions: Array.from({ length: supports }, (_, i) => ({ position: `Apoyo ${i + 1}`, reading: 0 })), rows: null }
    });
  };
  const setMethod = (method: "apoyos" | "rodante") => {
    const supports = eq?.loadCellsCount ?? 0;
    set({ eccentricity: method === "rodante"
      ? { method, load: input.eccentricity?.load ?? 0, positions: ROLLING.map((position) => ({ position, reading: 0 })), rows: ["Ida  →", "Vuelta  ←"] }
      : { method, load: input.eccentricity?.load ?? 0, positions: Array.from({ length: supports }, (_, i) => ({ position: `Apoyo ${i + 1}`, reading: 0 })), rows: null } });
  };
  const updateStep = (i: number, patch: Partial<TruckScaleInput["weighing"][number]>) => {
    const rows = input.weighing.map((s, k) => {
      if (k !== i) return s;
      const next = { ...s, ...patch };
      return { ...next, load: (next.weights || 0) + (next.substitution || 0) };
    });
    set({ weighing: rows });
  };

  const save = async () => {
    setBusy(true); setError(null); setMsg(null);
    try {
      const body = { ...input, calibrationDate: `${input.calibrationDate}T00:00:00Z`, nextCalibrationDate: input.nextCalibrationDate ? `${input.nextCalibrationDate}T00:00:00Z` : null };
      const r = report ? await api.updateTruckScaleReport(report.id, body) : await api.createTruckScaleReport(body);
      try { localStorage.removeItem(storageKey); } catch { /* sin almacenamiento */ }
      setReport(r);
      setMsg(`✓ Informe ${r.number} guardado.`);
      if (!report) navigate(`/metrologia/informes/camionera/${r.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!report) return;
    setBusy(true); setError(null);
    try {
      await save();
      await api.approveCalibrationReport(report.id);
      setReport(await api.getTruckScaleReport(report.id));
      setMsg("✓ Informe emitido.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo emitir.");
    } finally {
      setBusy(false);
    }
  };

  const u = eq?.unit ?? "kg";
  const validWeights = weights.filter((w) => w.status !== "OutOfService");
  const expiredAt = (w: StandardWeight) => !!w.expirationDate && w.expirationDate.slice(0, 10) < input.calibrationDate;

  return (
    <div className="stack" style={{ gap: 14, maxWidth: 980, margin: "0 auto" }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">METROLOGÍA · BÁSCULA CAMIONERA</span>
          <h1>{report ? `Informe ${report.number}` : "Nuevo informe de calibración"}</h1>
          <p className="muted">{report ? (locked ? "Emitido: para corregirlo hay que emitir una enmienda." : "Borrador: se puede seguir cargando.") : "Elegí el equipo y cargá las lecturas; el resultado se calcula solo."}</p>
        </div>
        <Link className="btn ghost" to="/metrologia/informes">← Informes</Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <fieldset disabled={locked} className="stack" style={{ gap: 14, border: 0, padding: 0, margin: 0 }}>
        <section className="card pad stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>1. Servicio e instrumento</h3>
          <div className="grid-2">
            <label>Equipo
              <select value={input.equipmentId} disabled={!!report} onChange={(e) => pickEquipment(e.target.value)}>
                <option value="">Elegí el equipo…</option>
                {equipment.filter((e) => e.platformType === "TruckScale" || e.id === input.equipmentId).map((e) => <option key={e.id} value={e.id}>{e.code} · {e.customerName} · {e.location}</option>)}
              </select>
            </label>
            <label>Norma
              <select value={input.standard} onChange={(e) => set({ standard: e.target.value as TruckScaleInput["standard"] })}>
                <option value="2307">Res. 2307/80 (aprobado por la norma anterior)</option>
                <option value="25/2025">Res. 25/2025</option>
              </select>
            </label>
            <label>N.º de servicio<input value={input.serviceNumber} disabled={!!report} onChange={(e) => set({ serviceNumber: e.target.value })} placeholder="2601" /></label>
            <label>Remito<input value={input.remitoNumber ?? ""} onChange={(e) => set({ remitoNumber: e.target.value })} /></label>
            <label>Pedido / OC / presupuesto<input value={input.orderReference ?? ""} onChange={(e) => set({ orderReference: e.target.value })} /></label>
            <label>Procedimiento<input value={input.procedureCode} onChange={(e) => set({ procedureCode: e.target.value })} /></label>
            <label>Fecha de ensayo<input type="date" value={input.calibrationDate} onChange={(e) => set({ calibrationDate: e.target.value, nextCalibrationDate: nextYear(e.target.value) })} /></label>
            <label>Próxima calibración<input type="date" value={input.nextCalibrationDate ?? ""} onChange={(e) => set({ nextCalibrationDate: e.target.value })} /></label>
            <label>Realizó<input value={input.performedBy} onChange={(e) => set({ performedBy: e.target.value })} /></label>
            <label>Módulos de la plataforma{numberInput(input.modules, (v) => set({ modules: v ?? 0 }))}</label>
          </div>
          {eq && (
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Máx. {num(eq.maxCapacity)} {u} · e = {num(eq.verificationIntervalE)} {u} · d = {num(eq.divisionD)} {u} · clase {eq.accuracyClass} · {eq.loadCellsCount} apoyos · indicación {eq.indicationType}
              {evaluation && ` · capacidad mínima ${num(evaluation.minCapacity)} ${u} (${evaluation.minCapacityRule})`}. Los datos del instrumento se corrigen en la ficha del equipo.
            </p>
          )}
        </section>

        <section className="card pad stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>2. Patrones utilizados</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>Solo se emite con patrones vigentes a la fecha del ensayo.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 6, maxHeight: 260, overflow: "auto" }}>
            {validWeights.map((w) => (
              <label key={w.id} className="row" style={{ gap: 6, alignItems: "center", fontSize: "0.82rem", color: expiredAt(w) ? "#A1271B" : undefined }}>
                <input type="checkbox" checked={input.weightIds.includes(w.id)}
                  onChange={(e) => set({ weightIds: e.target.checked ? [...input.weightIds, w.id] : input.weightIds.filter((x) => x !== w.id) })} />
                {w.code} · {num(w.nominalValue)} {w.unit}{expiredAt(w) ? " · vencida" : ""}
              </label>
            ))}
          </div>
          {data && <p style={{ margin: 0, fontSize: "0.82rem" }}>Seleccionados: {input.weightIds.length} · {num(evaluation?.totalStandardsMass)} {u}</p>}
        </section>

        <section className="card pad stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0 }}>3. Inspección del instrumento</h3>
          {input.inspection.map((it, i) => (
            <div key={it.point} className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ flex: "1 1 240px", fontSize: "0.86rem" }}>{it.point}</span>
              <select value={it.status} style={{ width: 90 }} onChange={(e) => set({ inspection: input.inspection.map((x, k) => (k === i ? { ...x, status: e.target.value as typeof x.status } : x)) })}>
                <option>OK</option><option>No OK</option><option>N/A</option>
              </select>
              <input placeholder="Observación" style={{ flex: "1 1 160px" }} value={it.observation ?? ""} onChange={(e) => set({ inspection: input.inspection.map((x, k) => (k === i ? { ...x, observation: e.target.value } : x)) })} />
            </div>
          ))}
        </section>

        <section className="card pad stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>4. Ensayo de pesaje</h3>
          <label className="row" style={{ gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={!!input.substitution} onChange={(e) => set({ substitution: e.target.checked ? { description: "Camión cargado", value: 0 } : null })} /> Con carga de sustitución
          </label>
          {input.substitution && (
            <div className="grid-2">
              <label>Carga de sustitución<input value={input.substitution.description} onChange={(e) => set({ substitution: { ...input.substitution!, description: e.target.value } })} /></label>
              <label>Valor asignado ({u}){numberInput(input.substitution.value, (v) => set({ substitution: { ...input.substitution!, value: v ?? 0 } }))}</label>
            </div>
          )}
          <div className="table-wrap">
            <table style={{ fontSize: "0.84rem", minWidth: 560 }}>
              <thead><tr><th>Pesas ({u})</th><th>Sustitución</th><th>Carga</th><th>Lectura asc.</th><th>Lectura desc.</th><th>E.M.T.</th><th /></tr></thead>
              <tbody>
                {input.weighing.map((s, i) => {
                  const r = evaluation?.weighing[i];
                  return (
                    <tr key={i}>
                      <td>{numberInput(s.weights, (v) => updateStep(i, { weights: v ?? 0 }))}</td>
                      <td>{numberInput(s.substitution, (v) => updateStep(i, { substitution: v ?? 0 }), { disabled: !input.substitution })}</td>
                      <td style={{ fontWeight: 700 }}>{num(s.load)}</td>
                      <td>{numberInput(s.ascending, (v) => updateStep(i, { ascending: v ?? 0 }))}</td>
                      <td>{numberInput(s.descending, (v) => updateStep(i, { descending: v }))}</td>
                      <td style={{ color: r ? (r.pass ? "#2E6B1F" : "#A1271B") : undefined, fontWeight: 700 }}>{r ? `± ${num(r.mpe)} ${r.pass ? "✓" : "✗"}` : "—"}</td>
                      <td><button type="button" className="btn ghost compact" onClick={() => set({ weighing: input.weighing.filter((_, k) => k !== i) })}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div><button type="button" className="btn ghost compact" onClick={() => set({ weighing: [...input.weighing, { load: 0, weights: 0, substitution: input.substitution?.value ?? 0, ascending: 0, descending: null }].map((s) => ({ ...s, load: s.weights + s.substitution })) })}>＋ Escalón</button></div>
        </section>

        <section className="card pad stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>5. Repetibilidad y puesta a cero</h3>
          <div className="grid-2">
            <label>Carga de repetibilidad ({u}){numberInput(input.repeatability?.load, (v) => set({ repeatability: { load: v ?? 0, readings: input.repeatability?.readings ?? [] } }))}</label>
            <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
              {(input.repeatability?.readings ?? []).map((r, i) => (
                <label key={i} style={{ maxWidth: 120 }}>Pesada {i + 1}{numberInput(r, (v) => set({ repeatability: { load: input.repeatability!.load, readings: input.repeatability!.readings.map((x, k) => (k === i ? v ?? 0 : x)) } }))}</label>
              ))}
              <button type="button" className="btn ghost compact" onClick={() => set({ repeatability: { load: input.repeatability?.load ?? 0, readings: [...(input.repeatability?.readings ?? []), 0] } })}>＋</button>
            </div>
            <label>¿Pone a cero con 4 % de Máx.?
              <select value={input.zero?.at4Percent == null ? "" : String(input.zero.at4Percent)} onChange={(e) => set({ zero: { ...input.zero, at4Percent: e.target.value === "" ? null : e.target.value === "true" } })}>
                <option value="">No ensayado</option><option value="true">Sí</option><option value="false">No</option>
              </select>
            </label>
            <label>¿Pone a cero con 4 % + 1 e?
              <select value={input.zero?.at4PercentPlusE == null ? "" : String(input.zero.at4PercentPlusE)} onChange={(e) => set({ zero: { ...input.zero, at4PercentPlusE: e.target.value === "" ? null : e.target.value === "true" } })}>
                <option value="">No ensayado</option><option value="true">Sí</option><option value="false">No</option>
              </select>
            </label>
            {input.standard === "25/2025" && <label>Error de puesta a cero E0 (en e){numberInput(input.zero?.zeroErrorE, (v) => set({ zero: { ...input.zero, zeroErrorE: v } }))}</label>}
          </div>
        </section>

        <section className="card pad stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>6. Excentricidad</h3>
          <div className="grid-2">
            <label>Método
              <select value={input.eccentricity?.method ?? "apoyos"} onChange={(e) => setMethod(e.target.value as "apoyos" | "rodante")}>
                <option value="apoyos">Pesas sobre cada apoyo</option>
                <option value="rodante">Vehículo por tercios, ida y vuelta (Res. 25/2025)</option>
              </select>
            </label>
            <label>Carga ({u}){numberInput(input.eccentricity?.load, (v) => set({ eccentricity: { ...input.eccentricity!, load: v ?? 0 } }))}</label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${input.eccentricity?.method === "rodante" ? 3 : Math.max(1, Math.ceil((input.eccentricity?.positions.length ?? 0) / 2))}, minmax(0, 1fr))`, gap: 6 }}>
            {(input.eccentricity?.positions ?? []).map((p, i) => {
              const r = evaluation?.eccentricity[i];
              return (
                <label key={p.position} style={{ fontSize: "0.8rem", background: r ? (r.pass ? "#E3F1DA" : "#FCE8E6") : undefined, padding: 4, borderRadius: 4 }}>{p.position}
                  {numberInput(p.reading, (v) => set({ eccentricity: { ...input.eccentricity!, positions: input.eccentricity!.positions.map((x, k) => (k === i ? { ...x, reading: v ?? 0 } : x)) } }))}
                </label>
              );
            })}
          </div>
        </section>

        {!(input.standard === "25/2025" && !eq?.indicationType?.startsWith("Anal")) && (
          <section className="card pad stack" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>7. Movilidad</h3>
            {input.mobility.map((m, i) => (
              <div key={i} className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ maxWidth: 140 }}>Carga{numberInput(m.load, (v) => set({ mobility: input.mobility.map((x, k) => (k === i ? { ...x, load: v ?? 0 } : x)) }))}</label>
                <label style={{ maxWidth: 140 }}>Lectura{numberInput(m.reading, (v) => set({ mobility: input.mobility.map((x, k) => (k === i ? { ...x, reading: v ?? 0 } : x)) }))}</label>
                <label style={{ maxWidth: 160 }}>Lectura + 1,4 e{numberInput(m.readingAfter, (v) => set({ mobility: input.mobility.map((x, k) => (k === i ? { ...x, readingAfter: v ?? 0 } : x)) }))}</label>
                <button type="button" className="btn ghost compact" onClick={() => set({ mobility: input.mobility.filter((_, k) => k !== i) })}>✕</button>
              </div>
            ))}
            <div><button type="button" className="btn ghost compact" onClick={() => set({ mobility: [...input.mobility, { load: 0, reading: 0, readingAfter: 0 }] })}>＋ Carga</button></div>
          </section>
        )}

        <section className="card pad stack" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Observaciones</h3>
          <textarea rows={3} value={input.observations.join("\n")} onChange={(e) => set({ observations: e.target.value.split("\n") })} placeholder="Una por renglón" />
        </section>
      </fieldset>

      {evaluation && (
        <section className="card pad stack" style={{ gap: 8, position: "sticky", bottom: 0, boxShadow: "0 -4px 12px rgba(0,0,0,0.06)" }}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong style={{ color: evaluation.conforming ? "#2E6B1F" : "#A1271B" }}>
              {evaluation.conforming ? "CONFORME" : "NO CONFORME"} · {evaluation.standardShort}
            </strong>
            <div className="row" style={{ gap: 6 }}>
              {!locked && <button type="button" className="btn" disabled={busy || !input.equipmentId} onClick={() => void save()}>{busy ? "Guardando…" : "💾 Guardar"}</button>}
              {report && !locked && canApprove && <button type="button" className="btn" disabled={busy} onClick={() => void approve()}>✓ Emitir</button>}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {evaluation.requirements.map((r) => (
              <span key={r.key} title={`${r.paragraph} · ${r.name}`} style={{ fontSize: "0.76rem", padding: "2px 8px", borderRadius: 10, color: VERDICT[r.verdict].color, background: VERDICT[r.verdict].bg, border: "1px solid #e2e8f0" }}>
                {r.name}: {VERDICT[r.verdict].text}
              </span>
            ))}
          </div>
          {evaluation.warnings.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, color: "#9a5b00", fontSize: "0.8rem" }}>{evaluation.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        </section>
      )}
    </div>
  );
}
