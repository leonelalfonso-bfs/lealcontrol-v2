import { useState } from "react";
import { api } from "../../api/client";
import type { FxRevaluationPreview } from "../../api/types";
import { monthRangeAr } from "../../lib/dates";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Revaluación de fin de mes de caja y bancos en moneda extranjera: el saldo en dólares a la cotización de
 * cierre; la diferencia con el saldo en pesos va a diferencia de cambio.
 */
export function FxRevaluationCard() {
  const [date, setDate] = useState(monthRangeAr(1).to);
  const [rate, setRate] = useState("");
  const [preview, setPreview] = useState<FxRevaluationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const body = () => ({ date, rate: Number(rate.replace(",", ".")) });

  const load = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      setPreview(await api.previewFxRevaluation(body()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo calcular la revaluación.");
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!preview || !window.confirm(`¿Registrar la revaluación al ${date.split("-").reverse().join("/")} a $ ${rate}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.postFxRevaluation(body());
      setMsg(`✓ Revaluación registrada: asiento N° ${res.entryNumber}.`);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la revaluación.");
    } finally {
      setBusy(false);
    }
  };

  const differences = preview?.rows.filter((r) => r.difference !== 0) ?? [];

  return (
    <div className="card pad" style={{ border: "1px solid #2563eb", background: "rgba(37, 99, 235, 0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: "28px" }}>💱</div>
        <div>
          <h3 style={{ margin: 0, color: "#1d4ed8" }}>Revaluación de moneda extranjera</h3>
          <p className="muted" style={{ margin: 0, fontSize: "12px" }}>
            Valúa a la cotización de cierre la caja y los bancos en dólares (cuentas del plan con moneda USD).
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 10 }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
          Fecha de cierre:
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPreview(null); }} />
        </label>
        <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
          Cotización de cierre ($ por USD):
          <input inputMode="decimal" value={rate} placeholder="Ej. 1050,50" onChange={(e) => { setRate(e.target.value); setPreview(null); }} />
        </label>
      </div>

      {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}
      {msg && <div className="alert ok" style={{ marginTop: 10 }}>{msg}</div>}

      {preview && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          {preview.rows.length === 0 ? (
            <p className="muted">No hay cuentas en moneda extranjera en el plan de cuentas.</p>
          ) : (
            <table style={{ fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th style={{ textAlign: "right" }}>Saldo USD</th>
                  <th style={{ textAlign: "right" }}>Saldo en libros $</th>
                  <th style={{ textAlign: "right" }}>Revaluado $</th>
                  <th style={{ textAlign: "right" }}>Diferencia $</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.accountId}>
                    <td>{r.accountCode} — {r.accountName}</td>
                    <td style={{ textAlign: "right" }}>{money(r.foreignBalance)}</td>
                    <td style={{ textAlign: "right" }}>{money(r.bookBalance)}</td>
                    <td style={{ textAlign: "right" }}>{money(r.revaluedBalance)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{money(r.difference)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={4}>{preview.netDifference >= 0 ? "Diferencia de cambio positiva" : "Diferencia de cambio negativa"}</td>
                  <td style={{ textAlign: "right" }}>{money(preview.netDifference)}</td>
                </tr>
              </tfoot>
            </table>
          )}
          {preview.existingEntryNumber != null && (
            <div className="alert" style={{ marginTop: 8 }}>Este mes ya tiene revaluación: asiento N° {preview.existingEntryNumber}.</div>
          )}
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={load} disabled={busy || !date || !rate}>
          👁️ Ver diferencias
        </button>
        <button
          type="button"
          className="btn"
          onClick={post}
          disabled={busy || !preview || differences.length === 0 || preview.existingEntryNumber != null}
          style={{ background: "#1d4ed8", color: "#fff", fontWeight: 700 }}
        >
          Registrar asiento de revaluación
        </button>
      </div>
    </div>
  );
}
