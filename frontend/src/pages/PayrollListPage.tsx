import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Employee, PayrollRunSummary } from "../api/types";
import { monthRangeAr } from "../lib/dates";
import { TERMINATION_CAUSES } from "../lib/payrollLabels";

type Kind = "Monthly" | "Sac" | "Final";
const KIND_LABEL = (r: PayrollRunSummary) =>
  r.kind === "Sac" ? `Aguinaldo ${r.month === 6 ? "1.er" : "2.º"} semestre` : r.kind === "Final" ? `Final · ${r.employeeName ?? ""}` : "Mensual";
const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Liquidaciones de sueldos: mensuales (S3), de aguinaldo (S4) y finales (S6), nota 68. */
export function PayrollListPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<PayrollRunSummary[]>([]);
  const [form, setForm] = useState({
    month: monthRangeAr(0).from.slice(0, 7), paymentDate: "", kind: "Monthly" as Kind,
    employeeId: "", terminationCause: "DismissalWithoutCause", noticeGiven: false, agreedAmount: "", priorBestSalary: ""
  });
  const [leaving, setLeaving] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.listPayrollRuns().then(setRuns).catch((err) => setError(err.message)); }, []);
  useEffect(() => {
    if (form.kind === "Final") api.listEmployees().then((list) => setLeaving(list.filter((e) => e.terminationDate))).catch(() => setLeaving([]));
  }, [form.kind]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const [year, month] = form.month.split("-").map(Number);
      const run = await api.createPayrollRun({
        year, month, paymentDate: form.paymentDate, kind: form.kind,
        ...(form.kind === "Final" ? {
          employeeId: form.employeeId, terminationCause: form.terminationCause, noticeGiven: form.noticeGiven,
          agreedAmount: Number(form.agreedAmount) || 0, priorBestSalary: Number(form.priorBestSalary) || 0
        } : {})
      });
      navigate(`/rrhh/liquidaciones/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la liquidación.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>💰 Liquidación de Sueldos</h1>
          <p className="muted">Liquidación mensual y de aguinaldo con novedades, aportes, contribuciones, recibo legal y asiento contable.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link to="/rrhh/convenios" className="btn ghost">📜 Convenios</Link>
          <Link to="/rrhh/sueldos/configuracion" className="btn ghost">⚙️ Configuración</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <form className="card pad row" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }} onSubmit={create}>
        <label style={{ maxWidth: 200 }}>Tipo
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
            <option value="Monthly">Mensual</option>
            <option value="Sac">Aguinaldo (junio o diciembre)</option>
            <option value="Final">Liquidación final (egreso)</option>
          </select>
        </label>
        {form.kind !== "Final" && (
          <label style={{ maxWidth: 180 }}>Mes<input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required /></label>
        )}
        {form.kind === "Final" && (
          <>
            <label style={{ minWidth: 220 }}>Colaborador que egresa
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
                <option value="">{leaving.length === 0 ? "Nadie tiene fecha de egreso en el legajo" : "Elegí…"}</option>
                {leaving.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName} (egreso {e.terminationDate?.slice(0, 10).split("-").reverse().join("/")})</option>)}
              </select>
            </label>
            <label style={{ minWidth: 240 }}>Causa
              <select value={form.terminationCause} onChange={(e) => setForm({ ...form, terminationCause: e.target.value })}>
                {Object.entries(TERMINATION_CAUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            {form.terminationCause === "DismissalWithoutCause" && (
              <label className="row" style={{ gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={form.noticeGiven} onChange={(e) => setForm({ ...form, noticeGiven: e.target.checked })} /> Se otorgó el preaviso
              </label>
            )}
            {form.terminationCause === "MutualAgreement" && (
              <label style={{ maxWidth: 200 }}>Gratificación pactada $<input type="number" min={0} step="0.01" value={form.agreedAmount} onChange={(e) => setForm({ ...form, agreedAmount: e.target.value })} /></label>
            )}
            <label style={{ maxWidth: 240 }}>Mejor sueldo del año liquidado afuera $ (opcional)
              <input type="number" min={0} step="0.01" value={form.priorBestSalary} onChange={(e) => setForm({ ...form, priorBestSalary: e.target.value })} />
            </label>
          </>
        )}
        <label style={{ maxWidth: 200 }}>Fecha de pago<input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} required /></label>
        <button type="submit" className="btn" disabled={busy}>➕ Nueva liquidación</button>
      </form>

      <div className="card pad">
        {runs.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todavía no hay liquidaciones.</p>
        ) : (
          <table style={{ fontSize: "0.85rem" }}>
            <thead><tr><th>Período</th><th>Tipo</th><th>Pago</th><th>Estado</th><th style={{ textAlign: "right" }}>Recibos</th><th style={{ textAlign: "right" }}>Bruto</th><th style={{ textAlign: "right" }}>Neto</th><th /></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{String(r.month).padStart(2, "0")}/{r.year}</td>
                  <td>{KIND_LABEL(r)}</td>
                  <td>{r.paymentDate.slice(0, 10).split("-").reverse().join("/")}</td>
                  <td>{r.status === "Closed" ? "Cerrada" : "Borrador"}</td>
                  <td style={{ textAlign: "right" }}>{r.payslips}</td>
                  <td style={{ textAlign: "right" }}>{money(r.gross)}</td>
                  <td style={{ textAlign: "right" }}>{money(r.net)}</td>
                  <td style={{ textAlign: "right" }}><Link to={`/rrhh/liquidaciones/${r.id}`} className="btn ghost compact">Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
