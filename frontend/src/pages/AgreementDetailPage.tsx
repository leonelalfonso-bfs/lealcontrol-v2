import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { AgreementDetail, AgreementInput, AgreementRule, AgreementRuleInput, AgreementScaleRow, AgreementSimulation } from "../api/types";
import { todayAr } from "../lib/dates";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const TYPES: Record<string, string> = { Addition: "Adicional", EmployeeDeduction: "Descuento al trabajador", EmployerContribution: "Contribución del empleador" };
const BASES: Record<string, string> = {
  PercentOfBasic: "% del básico", PercentOfGross: "% de la remuneración", Fixed: "Monto fijo",
  FixedPerSeniorityYear: "$ por año de antigüedad", PercentOfBasicPerSeniorityYear: "% del básico por año de antigüedad"
};
const APPLIES: Record<string, string> = { All: "Todos", UnionMembers: "Afiliados", NonMembers: "No afiliados" };
const EMPTY_RULE: AgreementRuleInput = {
  type: "Addition", code: "", name: "", basis: "PercentOfBasic", value: 0, remunerative: true, appliesTo: "All",
  zones: "", groups: "", requiresFlag: null, seniorityFromNextMonth: false, validFrom: todayAr().slice(0, 7), validTo: null
};

/** Detalle de un convenio: categorías, escalas por mes, reglas y simulador (nota 68, S2). */
export function AgreementDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AgreementDetail | null>(null);
  const [month, setMonth] = useState(todayAr().slice(0, 7));
  const [scales, setScales] = useState<AgreementScaleRow[]>([]);
  const [paste, setPaste] = useState({ text: "", source: "" });
  const [increase, setIncrease] = useState({ percent: "", source: "", roundToPesos: true });
  const [newCategory, setNewCategory] = useState({ group: "", name: "" });
  const [rule, setRule] = useState<AgreementRuleInput | null>(null);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [sim, setSim] = useState({ categoryId: "", zone: "", seniorityFrom: "2020-01-01", unionMember: false, flags: [] as string[] });
  const [simResult, setSimResult] = useState<AgreementSimulation | null>(null);
  const [header, setHeader] = useState<AgreementInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.getAgreement(id).then(setDetail).catch((err) => setError(err.message));
  const loadScales = () => api.getAgreementScales(id, month).then(setScales).catch(() => setScales([]));
  useEffect(() => { void load(); }, [id]);
  useEffect(() => { void loadScales(); }, [id, month]);

  const zones = useMemo(() => (detail?.agreement.zones ? detail.agreement.zones.split(",") : [""]), [detail]);
  const flags = useMemo(() => [...new Set((detail?.rules ?? []).map((r) => r.requiresFlag).filter((f): f is string => !!f))], [detail]);

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const text = await action();
      if (text) setMsg(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return <div className="card pad">{error ?? "Cargando…"}</div>;
  const a = detail.agreement;
  const scaleOf = (categoryId: string, zone: string) => scales.find((s) => s.categoryId === categoryId && s.zone === zone);

  const saveRule = (e: FormEvent) => {
    e.preventDefault();
    if (!rule) return;
    void run(async () => {
      if (ruleId) await api.updateAgreementRule(id, ruleId, rule);
      else await api.addAgreementRule(id, rule);
      setRule(null);
      setRuleId(null);
      await load();
      return "✓ Regla guardada.";
    });
  };

  const editRule = (r: AgreementRule) => {
    setRuleId(r.id);
    setRule({ ...r, validFrom: r.validFrom.slice(0, 7), validTo: r.validTo ? r.validTo.slice(0, 7) : null });
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>📜 {a.union} {a.code}</h1>
          <p className="muted">{a.name} · divisor de la hora {a.hourDivisor} · {a.zones ? `zonas ${a.zones}` : "sin zonas"}</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link to="/rrhh/convenios" className="btn ghost">← Convenios</Link>
          <button type="button" className="btn ghost" onClick={() => setHeader({ code: a.code, name: a.name, union: a.union, hourDivisor: a.hourDivisor, zones: a.zones, notes: a.notes ?? "" })}>Editar datos</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => {
            if (!window.confirm(`¿Borrar el convenio ${a.code} con sus categorías, escalas y reglas?`)) return;
            void run(async () => { await api.deleteAgreement(id); navigate("/rrhh/convenios"); });
          }}>Borrar</button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}
      {a.notes && <div className="card pad muted" style={{ fontSize: "0.85rem" }}>{a.notes}</div>}

      {header && (
        <form className="card pad stack" style={{ gap: 10 }} onSubmit={(e) => {
          e.preventDefault();
          void run(async () => { await api.updateAgreement(id, header); setHeader(null); await load(); return "✓ Convenio actualizado."; });
        }}>
          <div className="grid-3">
            <label>Número (CCT)<input value={header.code} onChange={(e) => setHeader({ ...header, code: e.target.value })} required /></label>
            <label>Nombre<input value={header.name} onChange={(e) => setHeader({ ...header, name: e.target.value })} required /></label>
            <label>Sindicato<input value={header.union} onChange={(e) => setHeader({ ...header, union: e.target.value })} /></label>
            <label>Divisor de la hora<input type="number" min={1} max={400} value={header.hourDivisor} onChange={(e) => setHeader({ ...header, hourDivisor: Number(e.target.value) })} /></label>
            <label>Zonas (separadas por coma)<input value={header.zones} onChange={(e) => setHeader({ ...header, zones: e.target.value })} /></label>
          </div>
          <label>Notas<textarea rows={3} value={header.notes ?? ""} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></label>
          <div className="row" style={{ gap: 10 }}>
            <button type="submit" className="btn" disabled={busy}>Guardar</button>
            <button type="button" className="btn ghost" onClick={() => setHeader(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {/* Escalas */}
      <div className="card pad stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Escala salarial</h3>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            Mes<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ maxWidth: 170 }} />
          </label>
        </div>
        {detail.scaleMonths.length > 0 && (
          <div className="muted" style={{ fontSize: "0.8rem" }}>Meses con escala cargada: {detail.scaleMonths.map(monthLabel).join(", ")}</div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: "0.8rem" }}>
            <thead>
              <tr><th>Grupo</th><th>Categoría</th>{zones.map((z) => <th key={z} style={{ textAlign: "right" }}>{z ? `Zona ${z}` : "Básico"}</th>)}</tr>
            </thead>
            <tbody>
              {detail.categories.map((c) => (
                <tr key={c.id}>
                  <td className="muted">{c.group}</td>
                  <td>
                    {c.name}{" "}
                    <button type="button" className="btn ghost compact" title="Borrar categoría" disabled={busy} onClick={() => {
                      if (!window.confirm(`¿Borrar la categoría ${c.name} y su escala?`)) return;
                      void run(async () => { await api.deleteAgreementCategory(id, c.id); await load(); await loadScales(); return "✓ Categoría borrada."; });
                    }}>×</button>
                  </td>
                  {zones.map((z) => {
                    const s = scaleOf(c.id, z);
                    return (
                      <td key={z} style={{ textAlign: "right" }}>
                        {s ? money(s.basic) : "—"}
                        {s && !s.isCurrentMonth && <div className="muted" style={{ fontSize: "0.7rem" }}>de {monthLabel(s.validFrom)}</div>}
                        {s && s.nonRemunerative > 0 && <div className="muted" style={{ fontSize: "0.7rem" }}>+ {money(s.nonRemunerative)} no rem.</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {scales[0]?.source && <div className="muted" style={{ fontSize: "0.75rem" }}>Fuente: {scales[0].source}</div>}

        <div className="grid-2" style={{ alignItems: "start" }}>
          <form className="stack" style={{ gap: 8 }} onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await api.increaseAgreementScales(id, { month, percent: Number(increase.percent.replace(",", ".")), source: increase.source, roundToPesos: increase.roundToPesos });
              await loadScales(); await load();
              return `✓ Escala de ${monthLabel(month + "-01")} generada (${r.saved} valores).`;
            });
          }}>
            <strong style={{ fontSize: "0.9rem" }}>Aplicar un aumento sobre la escala anterior</strong>
            <div className="grid-2">
              <label>Aumento % (del mes elegido)<input inputMode="decimal" value={increase.percent} onChange={(e) => setIncrease({ ...increase, percent: e.target.value })} required /></label>
              <label>Fuente<input value={increase.source} placeholder="Acuerdo y fecha" onChange={(e) => setIncrease({ ...increase, source: e.target.value })} required /></label>
            </div>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={increase.roundToPesos} onChange={(e) => setIncrease({ ...increase, roundToPesos: e.target.checked })} />
              Redondear a pesos
            </label>
            <div><button type="submit" className="btn ghost" disabled={busy}>Generar escala del mes</button></div>
          </form>

          <form className="stack" style={{ gap: 8 }} onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await api.pasteAgreementScales(id, { month, ...paste });
              setPaste({ text: "", source: paste.source });
              await loadScales(); await load();
              return `✓ ${r.saved} valores cargados para ${monthLabel(month + "-01")}.`;
            });
          }}>
            <strong style={{ fontSize: "0.9rem" }}>Pegar la escala desde una planilla</strong>
            <span className="muted" style={{ fontSize: "0.78rem" }}>
              Una fila por categoría y zona: categoría, zona, básico y, si hay, suma no remunerativa (separados por tabulación o punto y coma).
            </span>
            <textarea rows={4} value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} required />
            <label>Fuente<input value={paste.source} placeholder="Acuerdo y fecha" onChange={(e) => setPaste({ ...paste, source: e.target.value })} required /></label>
            <div><button type="submit" className="btn ghost" disabled={busy}>Cargar escala del mes</button></div>
          </form>
        </div>

        <form className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }} onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api.addAgreementCategory(id, { ...newCategory, sortOrder: detail.categories.length + 1 });
            setNewCategory({ group: newCategory.group, name: "" });
            await load();
            return "✓ Categoría agregada.";
          });
        }}>
          <label style={{ maxWidth: 220 }}>Grupo<input value={newCategory.group} onChange={(e) => setNewCategory({ ...newCategory, group: e.target.value })} /></label>
          <label style={{ maxWidth: 260 }}>Nueva categoría<input value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} required /></label>
          <button type="submit" className="btn ghost" disabled={busy}>Agregar categoría</button>
        </form>
      </div>

      {/* Reglas */}
      <div className="card pad stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Adicionales, descuentos y contribuciones</h3>
          <button type="button" className="btn ghost" onClick={() => { setRuleId(null); setRule({ ...EMPTY_RULE }); }}>➕ Nueva regla</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: "0.8rem" }}>
            <thead><tr><th>Código</th><th>Concepto</th><th>Tipo</th><th>Cálculo</th><th>Aplica a</th><th>Vigencia</th><th /></tr></thead>
            <tbody>
              {detail.rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>
                    {r.name}
                    <div className="muted" style={{ fontSize: "0.72rem" }}>
                      {[r.zones && `zonas ${r.zones}`, r.groups && `grupos ${r.groups}`, r.requiresFlag && `marca "${r.requiresFlag}"`,
                        r.seniorityFromNextMonth && "desde el mes siguiente", r.type === "Addition" && (r.remunerative ? "remunerativo" : "no remunerativo")]
                        .filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td>{TYPES[r.type]}</td>
                  <td>{r.basis.startsWith("Fixed") ? `$ ${money(r.value)}` : `${r.value} %`} {BASES[r.basis].replace("Monto fijo", "")}</td>
                  <td>{APPLIES[r.appliesTo]}</td>
                  <td>{monthLabel(r.validFrom)}{r.validTo ? ` a ${monthLabel(r.validTo)}` : " en adelante"}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <button type="button" className="btn ghost compact" onClick={() => editRule(r)}>Editar</button>
                    <button type="button" className="btn ghost compact" disabled={busy} onClick={() => void run(async () => {
                      await api.deleteAgreementRule(id, r.id); await load(); return "✓ Regla borrada.";
                    })}>Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rule && (
          <form className="stack" style={{ gap: 10 }} onSubmit={saveRule}>
            <strong>{ruleId ? "Editar regla" : "Nueva regla"}</strong>
            <span className="muted" style={{ fontSize: "0.78rem" }}>
              Cuando un monto cambia por paritaria, cargá una regla nueva con el mismo código desde el mes del cambio y cerrá la anterior con “hasta”.
            </span>
            <div className="grid-3">
              <label>Tipo<select value={rule.type} onChange={(e) => setRule({ ...rule, type: e.target.value as AgreementRuleInput["type"] })}>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
              <label>Código<input value={rule.code} onChange={(e) => setRule({ ...rule, code: e.target.value })} required /></label>
              <label>Concepto<input value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} required /></label>
              <label>Cálculo<select value={rule.basis} onChange={(e) => setRule({ ...rule, basis: e.target.value as AgreementRuleInput["basis"] })}>
                {Object.entries(BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
              <label>Valor<input type="number" step="0.0001" min={0} value={rule.value} onChange={(e) => setRule({ ...rule, value: Number(e.target.value) })} required /></label>
              <label>Aplica a<select value={rule.appliesTo} onChange={(e) => setRule({ ...rule, appliesTo: e.target.value as AgreementRuleInput["appliesTo"] })}>
                {Object.entries(APPLIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
              <label>Solo en zonas<input value={rule.zones} placeholder="Todas" onChange={(e) => setRule({ ...rule, zones: e.target.value })} /></label>
              <label>Solo en grupos<input value={rule.groups} placeholder="Todos" onChange={(e) => setRule({ ...rule, groups: e.target.value })} /></label>
              <label>Pide la marca<input value={rule.requiresFlag ?? ""} placeholder="Ninguna" onChange={(e) => setRule({ ...rule, requiresFlag: e.target.value || null })} /></label>
              <label>Desde (mes)<input type="month" value={rule.validFrom} onChange={(e) => setRule({ ...rule, validFrom: e.target.value })} required /></label>
              <label>Hasta (mes)<input type="month" value={rule.validTo ?? ""} onChange={(e) => setRule({ ...rule, validTo: e.target.value || null })} /></label>
            </div>
            <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
              {rule.type === "Addition" && (
                <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={rule.remunerative} onChange={(e) => setRule({ ...rule, remunerative: e.target.checked })} /> Remunerativo
                </label>
              )}
              {rule.basis.includes("Seniority") && (
                <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={rule.seniorityFromNextMonth} onChange={(e) => setRule({ ...rule, seniorityFromNextMonth: e.target.checked })} />
                  El año que se cumple en el mes se cobra desde el mes siguiente
                </label>
              )}
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button type="submit" className="btn" disabled={busy}>Guardar regla</button>
              <button type="button" className="btn ghost" onClick={() => { setRule(null); setRuleId(null); }}>Cancelar</button>
            </div>
          </form>
        )}
      </div>

      {/* Simulador */}
      <div className="card pad stack" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>Simulador del convenio</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
          Lo que fija el convenio para una categoría en el mes elegido arriba. Los aportes de ley, las novedades del mes y los proporcionales se
          suman en la liquidación.
        </p>
        <div className="grid-3">
          <label>Categoría<select value={sim.categoryId} onChange={(e) => setSim({ ...sim, categoryId: e.target.value })}>
            <option value="">Elegí…</option>
            {detail.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          {a.zones && <label>Zona<select value={sim.zone} onChange={(e) => setSim({ ...sim, zone: e.target.value })}>
            <option value="">Elegí…</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select></label>}
          <label>Antigüedad desde<input type="date" value={sim.seniorityFrom} onChange={(e) => setSim({ ...sim, seniorityFrom: e.target.value })} /></label>
        </div>
        <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={sim.unionMember} onChange={(e) => setSim({ ...sim, unionMember: e.target.checked })} /> Afiliado
          </label>
          {flags.map((f) => (
            <label key={f} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={sim.flags.includes(f)}
                onChange={(e) => setSim({ ...sim, flags: e.target.checked ? [...sim.flags, f] : sim.flags.filter((x) => x !== f) })} /> {f}
            </label>
          ))}
        </div>
        <div><button type="button" className="btn ghost" disabled={busy || !sim.categoryId || (!!a.zones && !sim.zone)}
          onClick={() => void run(async () => { setSimResult(await api.simulateAgreement(id, { ...sim, month, seniorityFrom: `${sim.seniorityFrom}T00:00:00Z` })); })}>
          Simular
        </button></div>
        {simResult && (
          <>
            {simResult.warnings.map((w) => <div key={w} className="alert" style={{ margin: 0 }}>{w}</div>)}
            <table style={{ fontSize: "0.82rem" }}>
              <tbody>
                {simResult.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.name}<div className="muted" style={{ fontSize: "0.72rem" }}>{l.detail}</div></td>
                    <td className="muted">{l.type === "Addition" ? (l.remunerative ? "Remunerativo" : "No remunerativo") : TYPES[l.type]}</td>
                    <td style={{ textAlign: "right" }}>{l.type === "EmployeeDeduction" ? "−" : ""}{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}><td colSpan={2}>Remunerativo</td><td style={{ textAlign: "right" }}>{money(simResult.remunerative)}</td></tr>
                <tr><td colSpan={2}>No remunerativo</td><td style={{ textAlign: "right" }}>{money(simResult.nonRemunerative)}</td></tr>
                <tr><td colSpan={2}>Descuentos del convenio</td><td style={{ textAlign: "right" }}>− {money(simResult.employeeDeductions)}</td></tr>
                <tr><td colSpan={2}>Contribuciones del empleador al convenio</td><td style={{ textAlign: "right" }}>{money(simResult.employerContributions)}</td></tr>
              </tfoot>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
