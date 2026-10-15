import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { InflationPreview } from "../../api/types";
import { AccountingTabs } from "../../components/accounting/AccountingTabs";
import { monthRangeAr } from "../../lib/dates";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Lee índices pegados desde una planilla: una fila por mes, con el mes ("2026-03", "03/2026" o "3/2026")
 * y el valor ("1234,56" o "1234.56"), separados por tabulación, punto y coma o espacios.
 */
function parseIndices(text: string): { rows: { year: number; month: number; value: number }[]; errors: string[] } {
  const rows: { year: number; month: number; value: number }[] = [];
  const errors: string[] = [];
  for (const raw of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const parts = raw.split(/[\t;\s]+/).filter(Boolean);
    const period = parts[0] ?? "";
    let valueText = parts[parts.length - 1] ?? "";
    // "1.234,56" → 1234.56; "1234,56" → 1234.56; "1234.56" queda igual.
    if (valueText.includes(",")) valueText = valueText.replace(/\./g, "").replace(",", ".");
    const value = Number(valueText);
    const iso = /^(\d{4})-(\d{1,2})$/.exec(period);
    const ar = /^(\d{1,2})\/(\d{4})$/.exec(period);
    const year = iso ? Number(iso[1]) : ar ? Number(ar[2]) : 0;
    const month = iso ? Number(iso[2]) : ar ? Number(ar[1]) : 0;
    if (parts.length < 2 || !year || month < 1 || month > 12 || !(value > 0)) errors.push(raw);
    else rows.push({ year, month, value });
  }
  return { rows, errors };
}

/** Ajuste por inflación: índices FACPCE, cuentas no monetarias y asiento mensual contra RECPAM. */
export function InflationAdjustmentPage() {
  const [indices, setIndices] = useState<{ year: number; month: number; value: number }[]>([]);
  const [pasted, setPasted] = useState("");
  const [date, setDate] = useState(monthRangeAr(1).to);
  const [preview, setPreview] = useState<InflationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listInflationIndices().then(setIndices).catch(() => setIndices([]));
  useEffect(() => { void load(); }, []);

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

  const saveIndices = () => run(async () => {
    const { rows, errors } = parseIndices(pasted);
    if (errors.length > 0) throw new Error(`No se entendieron estas filas: ${errors.slice(0, 5).join(" | ")}`);
    if (rows.length === 0) throw new Error("Pegá al menos una fila con mes y valor.");
    await api.saveInflationIndices(rows);
    setPasted("");
    await load();
    return `✓ ${rows.length} índice(s) guardados.`;
  });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>📈 Ajuste por inflación</h1>
          <p className="muted">Reexpresión a moneda de cierre (RT 6) de las cuentas no monetarias, contra RECPAM.</p>
        </div>
      </div>

      <AccountingTabs />
      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card pad stack" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>1. Índices FACPCE</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Copiá de la planilla de la FACPCE las columnas de mes y valor (IPC nacional empalmado con IPIM) y pegalas acá, una fila por mes.
            Los meses que ya estaban se actualizan.
          </p>
          <textarea rows={6} value={pasted} placeholder={"2026-01\t9876,54\n2026-02\t10123,45"} onChange={(e) => setPasted(e.target.value)} />
          <button type="button" className="btn" disabled={busy || !pasted.trim()} onClick={() => void saveIndices()}>Guardar índices</button>
          {indices.length > 0 && (
            <table style={{ fontSize: "0.8rem" }}>
              <thead><tr><th>Mes</th><th style={{ textAlign: "right" }}>Índice</th></tr></thead>
              <tbody>
                {indices.slice(0, 24).map((i) => (
                  <tr key={`${i.year}-${i.month}`}>
                    <td>{String(i.month).padStart(2, "0")}/{i.year}</td>
                    <td style={{ textAlign: "right" }}>{i.value.toLocaleString("es-AR", { maximumFractionDigits: 6 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card pad stack" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>2. Cuentas no monetarias</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Se ajustan las cuentas marcadas con “Ajusta por inflación” en el <Link to="/contabilidad/plan-cuentas">Plan de Cuentas</Link>.
            La sugerencia marca bienes de cambio, bienes de uso, patrimonio neto y resultados (salvo los financieros). Revisala con el contador.
          </p>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(async () => {
            const res = await api.suggestInflationAccounts();
            return `✓ ${res.marked} cuenta(s) marcadas; ${res.total} en total ajustan por inflación.`;
          })}>Marcar las cuentas sugeridas</button>
        </div>
      </div>

      <div className="card pad stack" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>3. Ajuste del mes</h3>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ maxWidth: 200 }}>Último día del mes<input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPreview(null); }} /></label>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(async () => { setPreview(await api.previewInflationAdjustment(date)); })}>
            👁️ Calcular
          </button>
          <button type="button" className="btn" disabled={busy || !preview || preview.missingIndices.length > 0 || preview.existingEntryNumber != null || preview.rows.every((r) => r.adjustment === 0)}
            onClick={() => void run(async () => {
              const res = await api.postInflationAdjustment(date);
              setPreview(null);
              return `✓ Ajuste registrado: asiento N° ${res.entryNumber}.`;
            })}>
            Registrar asiento
          </button>
        </div>
        {preview && (
          <>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              Ejercicio {preview.fiscalYear} · índice de cierre {preview.closingIndex.toLocaleString("es-AR")} · {preview.markedAccounts} cuenta(s) marcadas
            </div>
            {preview.missingIndices.length > 0 && <div className="alert">Faltan los índices de {preview.missingIndices.join(", ")}.</div>}
            {preview.existingEntryNumber != null && <div className="alert">Ese mes ya tiene ajuste: asiento N° {preview.existingEntryNumber}.</div>}
            {preview.rows.length > 0 && (
              <table style={{ fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th style={{ textAlign: "right" }}>Saldo histórico</th>
                    <th style={{ textAlign: "right" }}>Reexpresado</th>
                    <th style={{ textAlign: "right" }}>Ajuste a registrar</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.accountCode}>
                      <td>{r.accountCode} — {r.accountName}</td>
                      <td style={{ textAlign: "right" }}>{money(r.historical)}</td>
                      <td style={{ textAlign: "right" }}>{money(r.restated)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{money(r.adjustment)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 800 }}>
                    <td colSpan={3}>RECPAM ({preview.recpam >= 0 ? "pérdida" : "ganancia"})</td>
                    <td style={{ textAlign: "right" }}>{money(Math.abs(preview.recpam))}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            <div className="muted" style={{ fontSize: "0.75rem" }}>Saldos con signo: positivo deudor, negativo acreedor.</div>
          </>
        )}
      </div>
    </div>
  );
}
