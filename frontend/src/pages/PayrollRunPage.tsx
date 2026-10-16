import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Employee, PayrollRunDetail } from "../api/types";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const KINDS: Record<string, { label: string; unit: "horas" | "días" | "$" | "" }> = {
  Overtime50: { label: "Horas extra al 50 %", unit: "horas" },
  Overtime100: { label: "Horas extra al 100 %", unit: "horas" },
  Absence: { label: "Inasistencia injustificada", unit: "días" },
  UnpaidLeave: { label: "Licencia sin goce de haberes", unit: "días" },
  PaidLeave: { label: "Licencia paga (enfermedad, especiales)", unit: "días" },
  NoPerfectAttendance: { label: "Pierde la asistencia perfecta", unit: "" },
  Advance: { label: "Adelanto de haberes", unit: "$" },
  Garnishment: { label: "Embargo judicial", unit: "$" },
  OtherRemunerative: { label: "Otro haber remunerativo", unit: "$" },
  OtherNonRemunerative: { label: "Otro haber no remunerativo", unit: "$" },
  OtherDeduction: { label: "Otro descuento", unit: "$" },
  SacPriorBest: { label: "Mejor remuneración del semestre liquidada fuera del sistema", unit: "$" }
};
const SAC_KINDS = ["SacPriorBest", "Garnishment", "OtherDeduction"];

/** Una liquidación (mensual o de aguinaldo): novedades, cálculo, recibos, cierre y reapertura (nota 68). */
export function PayrollRunPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<PayrollRunDetail | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [novelty, setNovelty] = useState({ employeeId: "", kind: "Overtime50", value: "", description: "" });
  const [close, setClose] = useState({ lastDepositPeriod: "", lastDepositDate: "", lastDepositBank: "" });
  const [issues, setIssues] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.getPayrollRun(id).then(setDetail).catch((err) => setError(err.message));
  useEffect(() => { void load(); api.listEmployees().then(setEmployees).catch(() => setEmployees([])); }, [id]);
  const runKind = detail?.run.kind;
  useEffect(() => { if (runKind) setNovelty((n) => ({ ...n, kind: runKind === "Sac" ? "SacPriorBest" : "Overtime50" })); }, [runKind]);

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const text = await action();
      if (text) setMsg(text);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return <div className="card pad">{error ?? "Cargando…"}</div>;
  const r = detail.run;
  const draft = r.status === "Draft";
  const sac = r.kind === "Sac";
  const kinds = Object.entries(KINDS).filter(([k]) => (sac ? SAC_KINDS.includes(k) : k !== "SacPriorBest"));
  const name = (employeeId: string) => {
    const e = employees.find((x) => x.id === employeeId);
    return e ? `${e.lastName}, ${e.firstName}` : "—";
  };

  const addNovelty = (e: FormEvent) => {
    e.preventDefault();
    const unit = KINDS[novelty.kind].unit;
    const value = Number(novelty.value.replace(",", ".")) || 0;
    void run(async () => {
      await api.addPayrollNovelty(id, {
        employeeId: novelty.employeeId, kind: novelty.kind,
        quantity: unit === "horas" || unit === "días" ? value : 0, amount: unit === "$" ? value : 0, description: novelty.description || undefined
      });
      setNovelty({ ...novelty, value: "", description: "" });
      return "✓ Novedad cargada. Recalculá la liquidación.";
    });
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>💰 {sac ? `Aguinaldo ${r.month === 6 ? "1.er" : "2.º"} semestre ${r.year}` : `Liquidación ${String(r.month).padStart(2, "0")}/${r.year}`}</h1>
          <p className="muted">
            {draft ? "Borrador" : `Cerrada el ${day(r.closedAtUtc)} por ${r.closedBy}`} · pago el {day(r.paymentDate)}
            {draft && !r.calculatedAtUtc && " · falta calcular (o hubo errores)"}
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link to="/rrhh/liquidaciones" className="btn ghost">← Liquidaciones</Link>
          {draft && <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => {
            const res = await api.calculatePayrollRun(id);
            setIssues({ errors: res.errors, warnings: res.warnings });
            return `✓ ${res.calculated} recibo(s) calculados.`;
          })}>🧮 Calcular</button>}
          {draft && <button type="button" className="btn ghost" disabled={busy} onClick={() => {
            if (!window.confirm("¿Borrar este borrador con sus novedades?")) return;
            void run(async () => { await api.deletePayrollRun(id); navigate("/rrhh/liquidaciones"); });
          }}>Borrar</button>}
          {!draft && <button type="button" className="btn ghost" disabled={busy} onClick={() => {
            if (!window.confirm("¿Reabrir la liquidación? Vuelve a borrador; si ya estaba contabilizada, se revierte el asiento.")) return;
            void run(async () => { await api.reopenPayrollRun(id); return "✓ Liquidación reabierta."; });
          }}>Reabrir</button>}
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}
      {issues && (issues.errors.length > 0 || issues.warnings.length > 0) && (
        <div className="card pad stack" style={{ gap: 6 }}>
          {issues.errors.map((x) => <div key={x} className="alert" style={{ margin: 0 }}>❌ {x}</div>)}
          {issues.warnings.map((x) => <div key={x} style={{ color: "#b45309", fontSize: "0.85rem" }}>⚠️ {x}</div>)}
        </div>
      )}

      {/* Novedades */}
      <div className="card pad stack" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>{sac ? "Novedades del aguinaldo" : "Novedades del mes"}</h3>
        {sac && (
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
            El aguinaldo toma la mejor remuneración de los meses del semestre cerrados en el sistema. Si algún mes lo liquidó el estudio
            y fue mayor, cargalo como “Mejor remuneración del semestre liquidada fuera del sistema”.
          </p>
        )}
        {detail.novelties.length > 0 && (
          <table style={{ fontSize: "0.82rem" }}>
            <tbody>
              {detail.novelties.map((n) => (
                <tr key={n.id}>
                  <td>{name(n.employeeId)}</td>
                  <td>{KINDS[n.kind]?.label ?? n.kind}{n.description && <span className="muted"> · {n.description}</span>}</td>
                  <td style={{ textAlign: "right" }}>{KINDS[n.kind]?.unit === "$" ? `$ ${money(n.amount)}` : KINDS[n.kind]?.unit ? `${n.quantity} ${KINDS[n.kind].unit}` : ""}</td>
                  <td style={{ textAlign: "right" }}>
                    {draft && <button type="button" className="btn ghost compact" disabled={busy} onClick={() => void run(async () => {
                      await api.deletePayrollNovelty(id, n.id); return "✓ Novedad borrada. Recalculá la liquidación.";
                    })}>Borrar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {draft && (
          <form className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }} onSubmit={addNovelty}>
            <label style={{ minWidth: 200 }}>Colaborador
              <select value={novelty.employeeId} onChange={(e) => setNovelty({ ...novelty, employeeId: e.target.value })} required>
                <option value="">Elegí…</option>
                {employees.filter((e) => e.status !== 2).map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}
              </select>
            </label>
            <label style={{ minWidth: 220 }}>Novedad
              <select value={novelty.kind} onChange={(e) => setNovelty({ ...novelty, kind: e.target.value })}>
                {kinds.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            {KINDS[novelty.kind].unit && (
              <label style={{ maxWidth: 140 }}>{KINDS[novelty.kind].unit === "$" ? "Importe $" : `Cantidad (${KINDS[novelty.kind].unit})`}
                <input inputMode="decimal" value={novelty.value} onChange={(e) => setNovelty({ ...novelty, value: e.target.value })} required />
              </label>
            )}
            {novelty.kind.startsWith("Other") && (
              <label style={{ minWidth: 200 }}>Detalle<input value={novelty.description} onChange={(e) => setNovelty({ ...novelty, description: e.target.value })} /></label>
            )}
            <button type="submit" className="btn ghost" disabled={busy}>Agregar</button>
          </form>
        )}
      </div>

      {/* Recibos */}
      <div className="card pad stack" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>Recibos</h3>
        {detail.payslips.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todavía no se calculó. Cargá las novedades y tocá “🧮 Calcular”.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: "0.82rem" }}>
              <thead>
                <tr>
                  <th>Colaborador</th><th style={{ textAlign: "right" }}>Días</th><th style={{ textAlign: "right" }}>Remunerativo</th>
                  <th style={{ textAlign: "right" }}>No remunerativo</th><th style={{ textAlign: "right" }}>Descuentos</th><th style={{ textAlign: "right" }}>Neto</th>
                  <th style={{ textAlign: "right" }}>Costo empleador</th><th>Firma</th><th />
                </tr>
              </thead>
              <tbody>
                {detail.payslips.map((p) => (
                  <tr key={p.id}>
                    <td>{p.employeeName}<div className="muted" style={{ fontSize: "0.72rem" }}>{p.category}</div>
                      {p.warnings && <div style={{ color: "#b45309", fontSize: "0.72rem" }}>⚠️ {p.warnings.split("\n")[0]}</div>}</td>
                    <td style={{ textAlign: "right" }}>{p.daysWorked}</td>
                    <td style={{ textAlign: "right" }}>{money(p.remunerative)}</td>
                    <td style={{ textAlign: "right" }}>{money(p.nonRemunerative)}</td>
                    <td style={{ textAlign: "right" }}>{money(p.deductions)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{money(p.net)}</td>
                    <td style={{ textAlign: "right" }}>{money(p.employerCost)}</td>
                    <td>{p.signedAtUtc ? `✓ ${day(p.signedAtUtc)}` : draft ? "—" : "Pendiente"}</td>
                    <td style={{ textAlign: "right" }}><Link to={`/rrhh/liquidaciones/${id}/recibos/${p.id}`} className="btn ghost compact">Recibo</Link></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={2}>Totales</td>
                  <td style={{ textAlign: "right" }}>{money(detail.totals.remunerative)}</td>
                  <td style={{ textAlign: "right" }}>{money(detail.totals.nonRemunerative)}</td>
                  <td style={{ textAlign: "right" }}>{money(detail.totals.deductions)}</td>
                  <td style={{ textAlign: "right" }}>{money(detail.totals.net)}</td>
                  <td style={{ textAlign: "right" }}>{money(detail.totals.employerCost)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            <div className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
              A pagar por F.931 (aportes, contribuciones, ART y seguro de vida): $ {money(detail.totals.f931)}
            </div>
          </div>
        )}
      </div>

      {draft && detail.payslips.length > 0 && (
        <form className="card pad stack" style={{ gap: 10 }} onSubmit={(e) => {
          e.preventDefault();
          if (!window.confirm("¿Cerrar la liquidación? Los recibos quedan fijos y listos para firmar.")) return;
          void run(async () => { await api.closePayrollRun(id, close); return "✓ Liquidación cerrada."; });
        }}>
          <h3 style={{ margin: 0 }}>Cerrar la liquidación</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>El recibo informa el último depósito de aportes (art. 140 LCT).</p>
          <div className="grid-3">
            <label>Período depositado<input value={close.lastDepositPeriod} placeholder="09/2026" onChange={(e) => setClose({ ...close, lastDepositPeriod: e.target.value })} required /></label>
            <label>Fecha del depósito<input type="date" value={close.lastDepositDate} onChange={(e) => setClose({ ...close, lastDepositDate: e.target.value })} required /></label>
            <label>Banco<input value={close.lastDepositBank} onChange={(e) => setClose({ ...close, lastDepositBank: e.target.value })} required /></label>
          </div>
          <div><button type="submit" className="btn" disabled={busy || !r.calculatedAtUtc}>Cerrar liquidación</button>
            {!r.calculatedAtUtc && <span className="muted" style={{ marginLeft: 10, fontSize: "0.8rem" }}>Calculá sin errores primero.</span>}</div>
        </form>
      )}
    </div>
  );
}
