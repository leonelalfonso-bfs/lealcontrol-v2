import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { SupplierWithholdingProfile, Withholding, WithholdingRegime, WithholdingSettings } from "../api/types/finance";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const CONDITIONS: Record<SupplierWithholdingProfile["condition"], string> = {
  Inscripto: "Inscripto en Ganancias", NoInscripto: "No inscripto", Monotributo: "Monotributista", Exento: "Exento"
};
const firstOfMonth = () => new Date().toISOString().slice(0, 8) + "01";
const lastOfMonth = (from: string) => { const d = new Date(from + "T00:00:00"); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); };

/** Retenciones de Ganancias RG 830 (nota 69, F2): agente, regímenes, proveedores, certificados y archivo de SICORE. */
export function FinanceWithholdingsPage() {
  const [settings, setSettings] = useState<WithholdingSettings | null>(null);
  const [agent, setAgent] = useState({ isAgent: false, agentSince: "" });
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; taxId?: string; iva?: string }[]>([]);
  const [regimeEdit, setRegimeEdit] = useState<Omit<WithholdingRegime, "id"> | null>(null);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(lastOfMonth(firstOfMonth()));
  const [rows, setRows] = useState<Withholding[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const s = await api.getWithholdingSettings();
      setSettings(s);
      setAgent({ isAgent: s.isAgent, agentSince: s.agentSince?.slice(0, 10) || "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  };
  useEffect(() => {
    void load();
    api.listAllCustomers("supplier").then((list) => setSuppliers(list.filter((d) => d.isSupplier).map((d) => ({ id: d.id, name: d.tradeName || d.legalName, taxId: d.documentNumber, iva: d.taxCondition })))).catch(() => setSuppliers([]));
  }, []);
  useEffect(() => { api.listWithholdings(from, to).then(setRows).catch((err) => setError(err.message)); }, [from, to]);

  const run = async (action: () => Promise<string>) => {
    setError(null);
    setMsg(null);
    try {
      setMsg(await action());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  };

  const profiles = useMemo(() => new Map((settings?.profiles ?? []).map((p) => [p.supplierId, p])), [settings]);
  const visibleSuppliers = suppliers.filter((s) => !search.trim() || `${s.name} ${s.taxId ?? ""}`.toLowerCase().includes(search.toLowerCase())).slice(0, 50);
  const withheld = rows.filter((r) => r.status === "Active" && r.amount > 0);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>🧾 Retenciones de Ganancias (RG 830)</h1>
          <p className="muted">La orden de pago calcula la retención sola; acá se configura el agente, los regímenes y cada proveedor, y se exporta a SICORE.</p>
        </div>
        <Link to="/finanzas/ayuda#retenciones" className="btn ghost">💡 Ayuda</Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card pad row" style={{ gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="row" style={{ gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={agent.isAgent} onChange={(e) => setAgent({ ...agent, isAgent: e.target.checked })} /> La empresa es agente de retención de Ganancias
        </label>
        <label style={{ maxWidth: 180 }}>Desde<input type="date" value={agent.agentSince} onChange={(e) => setAgent({ ...agent, agentSince: e.target.value })} /></label>
        <button type="button" className="btn" onClick={() => void run(async () => {
          await api.saveWithholdingSettings({ isAgent: agent.isAgent, agentSince: agent.agentSince || null });
          return agent.isAgent ? `✓ Desde el ${day(agent.agentSince)} las órdenes de pago retienen Ganancias.` : "✓ La empresa no retiene Ganancias.";
        })}>Guardar</button>
      </div>

      <div className="card pad stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Regímenes (RG 830, Anexo VIII)</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>Los valores iniciales se confirman con el estudio contra el anexo vigente antes de empezar a retener.</p>
        <table style={{ fontSize: "0.85rem" }}>
          <thead><tr><th>Código</th><th>Régimen</th><th style={{ textAlign: "right" }}>Mínimo no sujeto (mes)</th><th style={{ textAlign: "right" }}>Inscripto</th><th style={{ textAlign: "right" }}>No inscripto</th><th style={{ textAlign: "right" }}>Retención mínima</th><th>Fuente</th><th /></tr></thead>
          <tbody>
            {settings?.regimes.map((r) => (
              <tr key={r.id}>
                <td>{r.code}</td><td>{r.name}</td><td style={{ textAlign: "right" }}>{money(r.nonTaxableAmount)}</td>
                <td style={{ textAlign: "right" }}>{r.rateRegistered} %</td><td style={{ textAlign: "right" }}>{r.rateUnregistered} %</td>
                <td style={{ textAlign: "right" }}>{money(r.minimumWithholding)}</td><td className="muted" style={{ fontSize: "0.75rem" }}>{r.source}</td>
                <td><button type="button" className="btn ghost compact" onClick={() => setRegimeEdit({ ...r })}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div><button type="button" className="btn ghost compact" onClick={() => setRegimeEdit({ code: "", name: "", nonTaxableAmount: 0, rateRegistered: 2, rateUnregistered: 28, minimumWithholding: 240, source: "", isActive: true })}>+ Otro régimen</button></div>
        {regimeEdit && (
          <form className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }} onSubmit={(e) => {
            e.preventDefault();
            void run(async () => { await api.saveWithholdingRegime(regimeEdit); setRegimeEdit(null); return "✓ Régimen guardado."; });
          }}>
            <label style={{ maxWidth: 80 }}>Código<input value={regimeEdit.code} maxLength={3} onChange={(e) => setRegimeEdit({ ...regimeEdit, code: e.target.value })} required /></label>
            <label style={{ minWidth: 260 }}>Nombre<input value={regimeEdit.name} onChange={(e) => setRegimeEdit({ ...regimeEdit, name: e.target.value })} required /></label>
            <label style={{ maxWidth: 150 }}>Mínimo no sujeto $<input type="number" step="0.01" value={regimeEdit.nonTaxableAmount} onChange={(e) => setRegimeEdit({ ...regimeEdit, nonTaxableAmount: Number(e.target.value) })} /></label>
            <label style={{ maxWidth: 110 }}>Inscripto %<input type="number" step="0.01" value={regimeEdit.rateRegistered} onChange={(e) => setRegimeEdit({ ...regimeEdit, rateRegistered: Number(e.target.value) })} /></label>
            <label style={{ maxWidth: 110 }}>No inscripto %<input type="number" step="0.01" value={regimeEdit.rateUnregistered} onChange={(e) => setRegimeEdit({ ...regimeEdit, rateUnregistered: Number(e.target.value) })} /></label>
            <label style={{ maxWidth: 130 }}>Retención mínima $<input type="number" step="0.01" value={regimeEdit.minimumWithholding} onChange={(e) => setRegimeEdit({ ...regimeEdit, minimumWithholding: Number(e.target.value) })} /></label>
            <label style={{ minWidth: 220 }}>Fuente<input value={regimeEdit.source} onChange={(e) => setRegimeEdit({ ...regimeEdit, source: e.target.value })} /></label>
            <button type="submit" className="btn">Guardar</button>
            <button type="button" className="btn ghost" onClick={() => setRegimeEdit(null)}>Cancelar</button>
          </form>
        )}
      </div>

      <div className="card pad stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Proveedores</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>Solo se retiene a los proveedores con condición cargada. Verificá la condición en la constancia de inscripción de ARCA.</p>
        <input placeholder="Buscar proveedor por nombre o CUIT" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
        <table style={{ fontSize: "0.85rem" }}>
          <thead><tr><th>Proveedor</th><th>Condición</th><th>Régimen</th><th>Excluido hasta</th></tr></thead>
          <tbody>
            {visibleSuppliers.map((s) => {
              const p = profiles.get(s.id);
              const save = (patch: Partial<SupplierWithholdingProfile>) => void run(async () => {
                await api.saveSupplierWithholdingProfile(s.id, {
                  condition: patch.condition ?? p?.condition ?? "Inscripto", regimeCode: patch.regimeCode ?? p?.regimeCode ?? "078",
                  excludedUntil: patch.excludedUntil !== undefined ? patch.excludedUntil : p?.excludedUntil ?? null
                });
                return `✓ ${s.name} actualizado.`;
              });
              return (
                <tr key={s.id}>
                  <td>{s.name}<div className="muted" style={{ fontSize: "0.75rem" }}>{s.taxId || "sin CUIT"}{s.iva ? ` · IVA: ${s.iva}` : ""}</div></td>
                  <td>
                    <select value={p?.condition ?? ""} onChange={(e) => e.target.value && save({ condition: e.target.value as SupplierWithholdingProfile["condition"] })}>
                      <option value="">No se retiene</option>
                      {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={p?.regimeCode ?? "078"} disabled={!p} onChange={(e) => save({ regimeCode: e.target.value })}>
                      {settings?.regimes.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name.slice(0, 40)}</option>)}
                    </select>
                  </td>
                  <td><input type="date" value={p?.excludedUntil?.slice(0, 10) ?? ""} disabled={!p} onChange={(e) => save({ excludedUntil: e.target.value || null })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card pad stack" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, flex: 1 }}>Retenciones practicadas</h3>
          <label style={{ maxWidth: 170 }}>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label style={{ maxWidth: 170 }}>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="btn" disabled={withheld.length === 0} onClick={() => void run(async () => { await api.downloadSicore(from, to); return "✓ Archivo para SICORE descargado."; })}>⬇️ Archivo SICORE</button>
        </div>
        <table style={{ fontSize: "0.85rem" }}>
          <thead><tr><th>Fecha</th><th>Certificado</th><th>Proveedor</th><th>Régimen</th><th>OP</th><th style={{ textAlign: "right" }}>Base del mes</th><th style={{ textAlign: "right" }}>Retenido</th><th /></tr></thead>
          <tbody>
            {withheld.map((w) => (
              <tr key={w.id}>
                <td>{day(w.date)}</td><td>{w.certificateNumber}</td><td>{w.supplierName}</td><td>{w.regimeCode}</td><td>{w.paymentOrderNumber}</td>
                <td style={{ textAlign: "right" }}>{money(w.priorBase + w.base)}</td><td style={{ textAlign: "right", fontWeight: 700 }}>{money(w.amount)}</td>
                <td><Link className="btn ghost compact" to={`/finanzas/retenciones/${w.id}/certificado`}>Certificado</Link></td>
              </tr>
            ))}
            {withheld.length === 0 && <tr><td colSpan={8} className="muted" style={{ padding: 14 }}>Sin retenciones en el período.</td></tr>}
          </tbody>
          {withheld.length > 0 && <tfoot><tr style={{ fontWeight: 800 }}><td colSpan={6}>Total a depositar</td><td style={{ textAlign: "right" }}>{money(withheld.reduce((s, w) => s + w.amount, 0))}</td><td /></tr></tfoot>}
        </table>
      </div>
    </div>
  );
}
