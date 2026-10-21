import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { SufferedTaxes } from "../api/types/finance";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const firstOfMonth = () => new Date().toISOString().slice(0, 8) + "01";
const lastOfMonth = (from: string) => { const d = new Date(from + "T00:00:00"); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); };
const SOURCES = { Receipt: "Recibo", PurchaseInvoice: "Factura de compra", Bank: "Extracto" } as const;

/** Retenciones y percepciones que le hicieron a la empresa (nota 69, F3): control por impuesto y jurisdicción y archivos de SIFERE. */
export function FinanceSufferedTaxesPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(lastOfMonth(firstOfMonth()));
  const [data, setData] = useState<SufferedTaxes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => api.getSufferedTaxes(from, to).then(setData).catch((err) => setError(err.message));
  useEffect(() => { void load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action: () => Promise<string | void>) => {
    setError(null);
    setMsg(null);
    try {
      const done = await action();
      if (done) setMsg(done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar.");
    }
  };

  const jurisdictions = Object.entries(data?.jurisdictions ?? {});
  const options = jurisdictions.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>📥 Retenciones y percepciones sufridas</h1>
          <p className="muted">Lo que les retienen los clientes, les perciben los proveedores y les cobra el banco, por impuesto y jurisdicción, con los archivos para SIFERE.</p>
        </div>
        <Link to="/finanzas/ayuda#sufridas" className="btn ghost">💡 Ayuda</Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card pad row" style={{ gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ maxWidth: 170 }}>Desde<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setTo(lastOfMonth(e.target.value)); }} /></label>
        <label style={{ maxWidth: 170 }}>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label style={{ minWidth: 260 }}>Jurisdicción de las percepciones de IIBB
          <select value={data?.defaultJurisdiction ?? ""} onChange={(e) => void run(async () => { await api.saveSufferedSettings(e.target.value || null); return "✓ Jurisdicción por defecto guardada."; })}>
            <option value="">Sin definir</option>
            {options}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => void run(() => api.downloadSifere("retenciones", from, to))}>⬇️ SIFERE retenciones</button>
        <button type="button" className="btn" onClick={() => void run(() => api.downloadSifere("percepciones", from, to))}>⬇️ SIFERE percepciones</button>
      </div>

      {data && data.problems.length > 0 && (
        <div className="alert">
          <b>Antes de generar SIFERE:</b>
          <ul style={{ margin: "4px 0 0 18px" }}>{data.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="card pad stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Totales del período</h3>
        <table style={{ fontSize: "0.85rem" }}>
          <thead><tr><th>Impuesto</th><th>Tipo</th><th>Jurisdicción</th><th style={{ textAlign: "right" }}>Comprobantes</th><th style={{ textAlign: "right" }}>Importe</th></tr></thead>
          <tbody>
            {data?.totals.map((t) => (
              <tr key={`${t.tax}-${t.kind}-${t.jurisdiction ?? ""}`}>
                <td>{t.tax}</td><td>{t.kind}</td><td>{t.jurisdiction ? `${t.jurisdiction} · ${t.jurisdictionName}` : t.tax === "IIBB" ? <span className="muted">sin jurisdicción</span> : "—"}</td>
                <td style={{ textAlign: "right" }}>{t.count}</td><td style={{ textAlign: "right" }}>$ {money(t.amount)}</td>
              </tr>
            ))}
            {data && data.totals.length === 0 && <tr><td colSpan={5} className="muted">Sin retenciones ni percepciones en el período.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card pad stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Detalle</h3>
        <table style={{ fontSize: "0.85rem" }}>
          <thead><tr><th>Fecha</th><th>Origen</th><th>Impuesto</th><th>Agente</th><th>Comprobante</th><th>Jurisdicción</th><th style={{ textAlign: "right" }}>Importe</th></tr></thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={`${r.source}-${r.sourceId}-${r.tax}`}>
                <td>{day(r.date)}</td>
                <td>{SOURCES[r.source]}</td>
                <td>{r.tax} · {r.kind}</td>
                <td>{r.agentName}<div className="muted" style={{ fontSize: "0.75rem" }}>{r.agentTaxId || "sin CUIT"}</div></td>
                <td>{r.voucher}</td>
                <td>
                  {r.tax === "IIBB" && r.source !== "Bank" ? (
                    <select aria-label="Jurisdicción" value={r.jurisdiction ?? ""} onChange={(e) => e.target.value && void run(async () => {
                      await api.setSufferedJurisdiction(r.source, r.sourceId, e.target.value);
                      return `✓ ${r.voucher}: jurisdicción ${e.target.value}.`;
                    })}>
                      <option value="">Elegir…</option>
                      {options}
                    </select>
                  ) : r.source === "Bank" && r.tax === "IIBB" ? <span className="muted">SIRCREB</span> : "—"}
                </td>
                <td style={{ textAlign: "right" }}>$ {money(r.amount)}</td>
              </tr>
            ))}
            {data && data.rows.length === 0 && <tr><td colSpan={7} className="muted">Sin movimientos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
