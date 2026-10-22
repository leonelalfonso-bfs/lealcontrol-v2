import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { FinanceAccount, InvestmentFund } from "../api/types/finance";
import { fileToBase64 } from "../lib/files";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const units = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 6 });
const day = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const STATUS: Record<string, string> = { Settled: "Liquidada", Pending: "Pendiente" };
type Draft = { accountId: string; openingUnits: string; openingDate: string; openingCost: string; lastUnitValue: string; lastUnitValueDate: string };

/** Fondos comunes de inversión (nota 69, F5): operaciones importadas del home banking, tenencia, valuación, rendimiento y control contra el extracto. */
export function FinanceInvestmentFundsPage() {
  const [funds, setFunds] = useState<InvestmentFund[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const list = await api.listInvestmentFunds();
    setFunds(list);
    setDrafts(Object.fromEntries(list.map((f) => [f.id, {
      accountId: f.accountId ?? "", openingUnits: String(f.openingUnits || ""), openingDate: f.openingDate?.slice(0, 10) ?? "",
      openingCost: String(f.openingCost || ""), lastUnitValue: f.lastUnitValue != null ? String(f.lastUnitValue) : "", lastUnitValueDate: f.lastUnitValueDate?.slice(0, 10) ?? ""
    }])));
  };
  useEffect(() => {
    void load().catch((err) => setError(err.message));
    api.listFinanceAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const run = async (action: () => Promise<string>) => {
    setError(null);
    setMsg(null);
    try {
      setMsg(await action());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar.");
    }
  };

  const importFile = (file: File) => void run(async () => {
    const r = await api.importInvestmentFunds({ fileBase64: await fileToBase64(file), fileName: file.name });
    return `✓ ${r.rows} operaciones leídas: ${r.created} nuevas, ${r.updated} actualizadas, ${r.unchanged} sin cambios.`;
  });

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>📈 Fondos comunes de inversión</h1>
          <p className="muted">Suscripciones y rescates importados del home banking, con la tenencia en cuotapartes, su valuación y el rendimiento.</p>
        </div>
        <Link to="/finanzas/ayuda#fondos" className="btn ghost">💡 Ayuda</Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card pad row" style={{ gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <label className="btn" style={{ cursor: "pointer" }}>
          📥 Importar movimientos de fondos (Excel)
          <input type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }} />
        </label>
        <span className="muted" style={{ fontSize: "0.82rem" }}>Galicia: Inversiones → Fondos → Movimientos → descargar. Se puede importar las veces que haga falta: no duplica.</span>
      </div>

      {funds.length === 0 && <div className="card pad muted">Todavía no hay fondos: importá el primer listado de movimientos.</div>}

      {funds.map((f) => {
        const d = drafts[f.id];
        const set = (patch: Partial<Draft>) => setDrafts({ ...drafts, [f.id]: { ...d, ...patch } });
        return (
          <div key={f.id} className="card pad stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ margin: 0 }}>{f.name} · {f.currency}</h3>
              <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
                <div><div className="muted" style={{ fontSize: "0.75rem" }}>Cuotapartes</div><b>{units(f.units)}</b></div>
                <div><div className="muted" style={{ fontSize: "0.75rem" }}>Valuación al {day(f.lastUnitValueDate)}</div><b>{f.valuation != null ? `${f.currency} ${money(f.valuation)}` : "—"}</b></div>
                <div><div className="muted" style={{ fontSize: "0.75rem" }}>Aportado neto</div><b>{f.currency} {money(f.contributed)}</b></div>
                <div><div className="muted" style={{ fontSize: "0.75rem" }}>Rendimiento</div><b>{f.result != null ? `${f.currency} ${money(f.result)}` : "—"}</b></div>
              </div>
            </div>
            {f.units < 0 && <div className="alert">La tenencia da negativa: cargá la tenencia inicial (las cuotapartes que había antes de la primera operación importada).</div>}
            {d && (
              <form className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }} onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api.saveInvestmentFund(f.id, {
                    accountId: d.accountId || null, openingUnits: Number(d.openingUnits || 0), openingDate: d.openingDate || null, openingCost: Number(d.openingCost || 0),
                    lastUnitValue: d.lastUnitValue ? Number(d.lastUnitValue) : null, lastUnitValueDate: d.lastUnitValueDate || null
                  });
                  return `✓ ${f.name} guardado.`;
                });
              }}>
                <label style={{ minWidth: 200 }}>Cuenta bancaria
                  <select value={d.accountId} onChange={(e) => set({ accountId: e.target.value })}>
                    <option value="">Sin vincular</option>
                    {accounts.filter((a) => a.currency === f.currency && a.type === "Bank").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label style={{ maxWidth: 150 }}>Tenencia inicial (cp)<input type="number" step="0.000001" value={d.openingUnits} onChange={(e) => set({ openingUnits: e.target.value })} /></label>
                <label style={{ maxWidth: 160 }}>al día<input type="date" value={d.openingDate} onChange={(e) => set({ openingDate: e.target.value })} /></label>
                <label style={{ maxWidth: 160 }}>Costo de esa tenencia<input type="number" step="0.01" value={d.openingCost} onChange={(e) => set({ openingCost: e.target.value })} /></label>
                <label style={{ maxWidth: 140 }}>Valor cuotaparte<input type="number" step="0.000001" value={d.lastUnitValue} onChange={(e) => set({ lastUnitValue: e.target.value })} /></label>
                <label style={{ maxWidth: 160 }}>al día<input type="date" value={d.lastUnitValueDate} onChange={(e) => set({ lastUnitValueDate: e.target.value })} /></label>
                <button type="submit" className="btn">Guardar</button>
              </form>
            )}
            <table style={{ fontSize: "0.85rem" }}>
              <thead><tr><th>Liquidación</th><th>Operación</th><th>N.º</th><th style={{ textAlign: "right" }}>Importe</th><th style={{ textAlign: "right" }}>Cuotapartes</th><th style={{ textAlign: "right" }}>Valor cp</th><th>Estado</th><th>Extracto</th></tr></thead>
              <tbody>
                {f.operations.map((o) => (
                  <tr key={o.id}>
                    <td>{day(o.settlementDate)}</td>
                    <td>{o.kind === "Subscription" ? "Suscripción" : "Rescate"}</td>
                    <td>{o.externalId}</td>
                    <td style={{ textAlign: "right" }}>{money(o.amount)}</td>
                    <td style={{ textAlign: "right" }}>{units(o.units)}</td>
                    <td style={{ textAlign: "right" }}>{o.unitValue != null ? units(o.unitValue) : "—"}</td>
                    <td>{STATUS[o.status] ?? o.status}</td>
                    <td>{o.inBank === true ? "✓ en el banco" : o.inBank === false ? <span style={{ color: "var(--danger, #b42318)" }}>no figura</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
