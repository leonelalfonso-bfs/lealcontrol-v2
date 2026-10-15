import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { FiscalYears } from "../../api/types";
import { todayAr } from "../../lib/dates";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Ejercicios de la empresa: mes de cierre, estado de cada ejercicio, cierre (refundición, cierre y apertura,
 * y candado en todos sus meses) y reapertura.
 */
export function FiscalYearsCard({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<FiscalYears | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.getFiscalYears().then(setData).catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los ejercicios."));
  useEffect(() => { void load(); }, []);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      setMsg(await action());
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  const changeMonth = (month: number) => run(async () => {
    const res = await api.updateAccountingSettings({ fiscalYearEndMonth: month });
    return `✓ El ejercicio cierra el último día de ${MONTHS[res.fiscalYearEndMonth - 1].toLowerCase()}.`;
  });

  const close = (end: string, label: string) => {
    if (!window.confirm(`¿Cerrar el ejercicio ${label}? Se generan la refundición de resultados, el asiento de cierre y el de apertura, y todos sus meses quedan cerrados con candado.`)) return;
    void run(async () => {
      const res = await api.closeFiscalYear(end.slice(0, 10));
      return `✓ Ejercicio ${res.label} cerrado: asientos N° ${res.entryNumbers.join(", ")}.`;
    });
  };

  const reopen = (end: string, label: string) => {
    if (!window.confirm(`¿Reabrir el ejercicio ${label}? Se borran sus asientos de refundición, cierre y apertura, y sus meses se abren.`)) return;
    void run(async () => {
      const res = await api.reopenFiscalYear(end.slice(0, 10));
      return `✓ Ejercicio ${res.label} reabierto (${res.removed} asientos de cierre borrados).`;
    });
  };

  const anyClosed = data?.years.some((y) => y.status === "Closed") ?? false;

  return (
    <div className="card pad" style={{ border: "1px solid #9333ea", background: "rgba(147, 51, 234, 0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: "28px" }}>📅</div>
        <div>
          <h3 style={{ margin: 0, color: "#581c87" }}>Ejercicios y cierre anual</h3>
          <p className="muted" style={{ margin: 0, fontSize: "12px" }}>
            Refundición de resultados, asiento de cierre y apertura del ejercicio siguiente.
          </p>
        </div>
      </div>

      <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
        El ejercicio cierra el último día de:
        <select value={data?.fiscalYearEndMonth ?? 12} disabled={busy || !data || anyClosed} onChange={(e) => void changeMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </label>
      {anyClosed && <div className="muted" style={{ fontSize: "0.75rem" }}>Con ejercicios cerrados, el mes de cierre ya no se cambia.</div>}

      {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}
      {msg && <div className="alert ok" style={{ marginTop: 10 }}>{msg}</div>}

      <table style={{ fontSize: "0.8rem", marginTop: 12 }}>
        <thead>
          <tr>
            <th>Ejercicio</th>
            <th style={{ textAlign: "right" }}>Resultado</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.years.map((y, i) => {
            // Se cierra en orden: solo el más viejo abierto; se reabre solo el último cerrado.
            const closable = y.status === "Open" && y.end.slice(0, 10) < todayAr()
              && !data.years.slice(i + 1).some((older) => older.status === "Open");
            const reopenable = y.status === "Closed" && !data.years.slice(0, i).some((newer) => newer.status === "Closed");
            return (
              <tr key={y.end}>
                <td>{y.label}</td>
                <td style={{ textAlign: "right" }}>{money(y.result)}</td>
                <td>
                  {y.status === "Closed" ? `Cerrado (asientos ${y.closingEntryNumbers.join(", ")})` : "Abierto"}
                  {y.status === "Open" && y.pendingDocuments > 0 && (
                    <div className="muted" style={{ fontSize: "0.72rem" }}>{y.pendingDocuments} comprobante(s) sin contabilizar</div>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  {closable && (
                    <button type="button" className="btn compact" disabled={busy} onClick={() => close(y.end, y.label)}
                      style={{ background: "#9333ea", color: "#fff" }}>
                      Cerrar ejercicio
                    </button>
                  )}
                  {reopenable && (
                    <button type="button" className="btn ghost compact" disabled={busy} onClick={() => reopen(y.end, y.label)}>
                      Reabrir
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
