import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityIndicator, QualityIndicatorValue } from "../../api/types/quality";
import { INDICATOR_STATUS, labelOf } from "./qualityLabels";

const FORMULA_PLACEHOLDER =
  "(Número de verificaciones concretadas en el período) / (Número total verificaciones planificadas en el período) x 100";

function defaultPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function complianceLabel(c?: string | null) {
  if (c === "Met") return { text: "Cumple", color: "#166534" };
  if (c === "Below") return { text: "No cumple", color: "#991b1b" };
  return { text: "Sin meta", color: "#64748b" };
}

function isYearMonth(period: string): boolean {
  return /^\d{4}-\d{2}$/.test(period);
}

/** Fallback client-side if API omits cumulativeYtd. */
function withCumulativeYtd(values: QualityIndicatorValue[]): Array<QualityIndicatorValue & { cumulativeYtd: number }> {
  const byYear = new Map<string, QualityIndicatorValue[]>();
  for (const v of values) {
    if (!isYearMonth(v.period)) continue;
    const year = v.period.slice(0, 4);
    const list = byYear.get(year) ?? [];
    list.push(v);
    byYear.set(year, list);
  }

  const cumById = new Map<string, number>();
  for (const list of byYear.values()) {
    let running = 0;
    for (const v of [...list].sort((a, b) => a.period.localeCompare(b.period))) {
      running += v.value;
      cumById.set(v.id, running);
    }
  }

  return values.map((v) => ({
    ...v,
    cumulativeYtd: v.cumulativeYtd ?? cumById.get(v.id) ?? v.value
  }));
}

export function QualityMc01R03Page() {
  const [rows, setRows] = useState<QualityIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [formula, setFormula] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("%");
  const [direction, setDirection] = useState("HigherIsBetter");
  const [responsible, setResponsible] = useState("");
  const [frequency, setFrequency] = useState("Monthly");
  const [actions, setActions] = useState("");
  const [followUp, setFollowUp] = useState("");

  const [period, setPeriod] = useState(defaultPeriod());
  const [value, setValue] = useState("");
  const [valueNotes, setValueNotes] = useState("");

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const selectedValues = useMemo(
    () => withCumulativeYtd(selected?.values ?? []),
    [selected?.values]
  );

  const load = () => {
    setLoading(true);
    api.listQualityMc01R03()
      .then((res) => {
        setRows(res.rows || []);
        if (selectedId && !(res.rows || []).some((r) => r.id === selectedId)) {
          setSelectedId(null);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.createQualityIndicator({
        name: name.trim(),
        objective: objective.trim() || undefined,
        formula: formula.trim() || undefined,
        targetValue: targetValue.trim() ? Number(targetValue) : undefined,
        targetUnit: targetUnit.trim() || undefined,
        direction,
        responsible: responsible.trim() || undefined,
        frequency,
        actions: actions.trim() || undefined,
        followUp: followUp.trim() || undefined
      });
      setMsg("Indicador creado.");
      setShowForm(false);
      setName("");
      setObjective("");
      setFormula("");
      setTargetValue("");
      setResponsible("");
      setActions("");
      setFollowUp("");
      setSelectedId(created.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onAddValue = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!period.trim() || value.trim() === "" || Number.isNaN(Number(value))) {
      setError("Período y valor numérico son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.createQualityIndicatorValue(selected.id, {
        period: period.trim(),
        value: Number(value),
        notes: valueNotes.trim() || undefined
      });
      setMsg(`Valor ${period} registrado.`);
      setValue("");
      setValueNotes("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDeactivate = async (id: string, label: string) => {
    if (!window.confirm(`¿Desactivar el indicador “${label}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deactivateQualityIndicator(id);
      if (selectedId === id) setSelectedId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteValue = async (indicatorId: string, valueId: string) => {
    if (!window.confirm("¿Eliminar este valor de período?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteQualityIndicatorValue(indicatorId, valueId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to="/calidad/documentos/MC01-R03" style={{ fontSize: 13 }}>← Plantilla MC01-R03</Link>
          <h1 style={{ margin: "8px 0 0" }}>MC01-R03 · Seguimiento de objetivos e indicadores</h1>
          <p style={{ color: "#64748b", marginTop: 6 }}>
            Definí indicadores del SGC y cargá el valor real por período (cláusula ISO 8.2).
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-outline" to="/calidad/registros">Índice registros</Link>
          <Link className="btn btn-outline" to="/calidad/registros/mc01-r03/pdf">Descargar seguimiento PDF</Link>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cerrar alta" : "Nuevo indicador"}
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
          <h3 style={{ marginTop: 0 }}>Alta de indicador</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label>
              Nombre *
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. % informes entregados a tiempo" />
            </label>
            <label>
              Meta
              <input type="number" step="any" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
            </label>
            <label>
              Unidad
              <input value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} placeholder="%, días, qty…" />
            </label>
            <label>
              Dirección
              <select value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="HigherIsBetter">Mayor es mejor</option>
                <option value="LowerIsBetter">Menor es mejor</option>
                <option value="Exact">Exacto</option>
              </select>
            </label>
            <label>
              Frecuencia
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="Monthly">Mensual</option>
                <option value="Quarterly">Trimestral</option>
                <option value="Yearly">Anual</option>
              </select>
            </label>
            <label>
              Responsable
              <input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Objetivo
            <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>
            Fórmula / fuente
            <input
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              style={{ width: "100%" }}
              placeholder={FORMULA_PLACEHOLDER}
            />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>
            Acciones
            <textarea value={actions} onChange={(e) => setActions(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>
            Seguimiento
            <textarea value={followUp} onChange={(e) => setFollowUp(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <div style={{ marginTop: 12, justifyContent: "flex-end", display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)", gap: 16, marginTop: 16, alignItems: "start" }}>
        <div className="card pad">
          <h3 style={{ marginTop: 0 }}>Indicadores</h3>
          {loading ? (
            <div className="muted">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="muted">Aún no hay indicadores. Creá el primero.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Indicador</th>
                    <th>Acumulado</th>
                    <th>Meta</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const latest = r.values?.find((v) => v.period === r.latestPeriod);
                    const cumulative = r.latestCumulativeYtd ?? (latest ? withCumulativeYtd(r.values ?? []).find((v) => v.id === latest.id)?.cumulativeYtd : null) ?? r.latestValue;
                    const compliance = cumulative == null || r.targetValue == null ? null
                      : (r.direction === "LowerIsBetter" ? cumulative <= r.targetValue
                        : r.direction === "Exact" ? cumulative === r.targetValue
                        : cumulative >= r.targetValue) ? "Met" : "Below";
                    const c = complianceLabel(compliance);
                    return (
                      <tr
                        key={r.id}
                        style={{
                          cursor: "pointer",
                          background: selectedId === r.id ? "#ecfeff" : undefined,
                          opacity: r.status === "Inactive" ? 0.55 : 1
                        }}
                        onClick={() => setSelectedId(r.id)}
                      >
                        <td>
                          <strong>{r.name}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {r.responsible || "Sin responsable"} · {labelOf(INDICATOR_STATUS, r.status)}
                          </div>
                        </td>
                        <td>
                          {r.latestPeriod != null && cumulative != null ? (
                            <>
                              <div>{cumulative}{r.targetUnit ? ` ${r.targetUnit}` : ""}</div>
                              <div className="muted" style={{ fontSize: 12 }}>{r.latestPeriod}</div>
                              <div style={{ fontSize: 12, color: c.color, fontWeight: 700 }}>{c.text}</div>
                            </>
                          ) : (
                            <span className="muted">Sin datos</span>
                          )}
                        </td>
                        <td>
                          {r.targetValue != null ? `${r.targetValue}${r.targetUnit ? ` ${r.targetUnit}` : ""}` : "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {r.status === "Active" && (
                            <button
                              type="button"
                              className="btn ghost compact"
                              disabled={busy}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                void onDeactivate(r.id, r.name);
                              }}
                            >
                              Desactivar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card pad">
          {!selected ? (
            <p className="muted">Seleccioná un indicador para cargar valores por período.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>{selected.name}</h3>
              <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
                {selected.objective || "Sin objetivo descripto."}
                {selected.formula ? ` · Fórmula: ${selected.formula}` : ""}
              </p>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
                <div>
                  <strong>Acciones:</strong> {selected.actions || "—"}
                </div>
                <div style={{ marginTop: 6 }}>
                  <strong>Seguimiento:</strong> {selected.followUp || selected.notes || "—"}
                </div>
              </div>

              {selected.status === "Active" && (
                <form onSubmit={(e) => void onAddValue(e)} style={{ marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label>
                      Período
                      <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-09 o 2026-Q3" />
                    </label>
                    <label>
                      Valor
                      <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
                    </label>
                  </div>
                  <label style={{ display: "block", marginTop: 8 }}>
                    Seguimiento
                    <input value={valueNotes} onChange={(e) => setValueNotes(e.target.value)} style={{ width: "100%" }} />
                  </label>
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      {busy ? "Guardando…" : "Registrar valor"}
                    </button>
                  </div>
                </form>
              )}

              {selectedValues.length === 0 ? (
                <div className="muted">Sin valores cargados.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>Valor</th>
                      <th>Acumulado</th>
                      <th>Seguimiento</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {selectedValues.map((v) => (
                      <tr key={v.id}>
                        <td>{v.period}</td>
                        <td>{v.value}{selected.targetUnit ? ` ${selected.targetUnit}` : ""}</td>
                        <td>{v.cumulativeYtd}{selected.targetUnit ? ` ${selected.targetUnit}` : ""}</td>
                        <td>{v.notes || "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn ghost compact"
                            disabled={busy}
                            onClick={() => void onDeleteValue(selected.id, v.id)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
