import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { PayrollRunSummary } from "../api/types";
import { monthRangeAr } from "../lib/dates";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Liquidaciones mensuales de sueldos (nota 68, S3). */
export function PayrollListPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<PayrollRunSummary[]>([]);
  const [form, setForm] = useState({ month: monthRangeAr(0).from.slice(0, 7), paymentDate: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.listPayrollRuns().then(setRuns).catch((err) => setError(err.message)); }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const [year, month] = form.month.split("-").map(Number);
      const run = await api.createPayrollRun({ year, month, paymentDate: form.paymentDate });
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
          <p className="muted">Liquidación mensual con novedades, aportes, contribuciones, recibo legal y asiento contable.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link to="/rrhh/convenios" className="btn ghost">📜 Convenios</Link>
          <Link to="/rrhh/sueldos/configuracion" className="btn ghost">⚙️ Configuración</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <form className="card pad row" style={{ gap: 12, alignItems: "flex-end", flexWrap: "wrap" }} onSubmit={create}>
        <label style={{ maxWidth: 180 }}>Mes<input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required /></label>
        <label style={{ maxWidth: 200 }}>Fecha de pago<input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} required /></label>
        <button type="submit" className="btn" disabled={busy}>➕ Nueva liquidación</button>
      </form>

      <div className="card pad">
        {runs.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todavía no hay liquidaciones.</p>
        ) : (
          <table style={{ fontSize: "0.85rem" }}>
            <thead><tr><th>Período</th><th>Pago</th><th>Estado</th><th style={{ textAlign: "right" }}>Recibos</th><th style={{ textAlign: "right" }}>Bruto</th><th style={{ textAlign: "right" }}>Neto</th><th /></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{String(r.month).padStart(2, "0")}/{r.year}</td>
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
