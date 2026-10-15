import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { DepreciationPreview, FixedAsset, FixedAssetInput } from "../../api/types";
import { AccountingTabs } from "../../components/accounting/AccountingTabs";
import { monthRangeAr, todayAr } from "../../lib/dates";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

// Cuenta del bien → su amortización acumulada en el plan de cuentas inicial.
const ASSET_ACCOUNTS = [
  { asset: "1.2.01.001", accumulated: "1.2.01.004", label: "Rodados" },
  { asset: "1.2.01.002", accumulated: "1.2.01.005", label: "Maquinarias y equipos" },
  { asset: "1.2.01.003", accumulated: "1.2.01.006", label: "Instalaciones" }
];

const EMPTY: FixedAssetInput = {
  code: "", name: "", acquisitionDate: todayAr(), cost: 0, residualValue: 0, usefulLifeMonths: 60,
  assetAccountCode: "1.2.01.002", accumulatedAccountCode: "1.2.01.005", expenseAccountCode: "5.2.08", notes: ""
};

/** Bienes de uso: registro, amortización mensual en línea recta y baja. */
export function FixedAssetsPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [form, setForm] = useState<FixedAssetInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [depDate, setDepDate] = useState(monthRangeAr(1).to);
  const [preview, setPreview] = useState<DepreciationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listFixedAssets().then(setAssets).catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los bienes."));
  useEffect(() => { void load(); }, []);

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

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    void run(async () => {
      if (editingId) await api.updateFixedAsset(editingId, form);
      else await api.createFixedAsset(form);
      setForm(null);
      setEditingId(null);
      return "✓ Bien guardado.";
    });
  };

  const edit = (a: FixedAsset) => {
    setEditingId(a.id);
    setForm({
      code: a.code, name: a.name, acquisitionDate: a.acquisitionDate.slice(0, 10), cost: a.cost, residualValue: a.residualValue,
      usefulLifeMonths: a.usefulLifeMonths, assetAccountCode: a.assetAccountCode, accumulatedAccountCode: a.accumulatedAccountCode,
      expenseAccountCode: a.expenseAccountCode, notes: a.notes ?? ""
    });
  };

  const dispose = (a: FixedAsset) => {
    const date = window.prompt(`Fecha de baja de ${a.code} ${a.name} (aaaa-mm-dd):`, todayAr());
    if (!date) return;
    void run(async () => {
      await api.disposeFixedAsset(a.id, date);
      return `✓ ${a.code} dado de baja. Registrá la venta o la baja del bien con un asiento manual (ver Ayuda).`;
    });
  };

  const set = <K extends keyof FixedAssetInput>(key: K, value: FixedAssetInput[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>🏗️ Bienes de uso</h1>
          <p className="muted">Registro de bienes y amortización mensual en línea recta (el mes de alta cuenta entero).</p>
        </div>
        <button type="button" className="btn" onClick={() => { setEditingId(null); setForm({ ...EMPTY }); }}>➕ Nuevo bien</button>
      </div>

      <AccountingTabs />
      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {form && (
        <form className="card pad stack" style={{ gap: 12 }} onSubmit={save}>
          <h3 style={{ margin: 0 }}>{editingId ? "Editar bien" : "Nuevo bien"}</h3>
          <div className="grid-3">
            <label>Código<input value={form.code} onChange={(e) => set("code", e.target.value)} required /></label>
            <label>Nombre<input value={form.name} onChange={(e) => set("name", e.target.value)} required /></label>
            <label>Fecha de alta<input type="date" value={form.acquisitionDate} onChange={(e) => set("acquisitionDate", e.target.value)} required /></label>
            <label>Costo ($)<input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => set("cost", Number(e.target.value))} required /></label>
            <label>Valor residual ($)<input type="number" step="0.01" min="0" value={form.residualValue} onChange={(e) => set("residualValue", Number(e.target.value))} /></label>
            <label>Vida útil (meses)<input type="number" min="1" max="600" value={form.usefulLifeMonths} onChange={(e) => set("usefulLifeMonths", Number(e.target.value))} required /></label>
            <label>
              Tipo de bien
              <select value={form.assetAccountCode} onChange={(e) => {
                const pair = ASSET_ACCOUNTS.find((p) => p.asset === e.target.value);
                setForm((f) => (f ? { ...f, assetAccountCode: e.target.value, accumulatedAccountCode: pair?.accumulated ?? f.accumulatedAccountCode } : f));
              }}>
                {ASSET_ACCOUNTS.map((p) => <option key={p.asset} value={p.asset}>{p.label} ({p.asset})</option>)}
                {!ASSET_ACCOUNTS.some((p) => p.asset === form.assetAccountCode) && <option value={form.assetAccountCode}>{form.assetAccountCode}</option>}
              </select>
            </label>
            <label>Cuenta de amortización acumulada<input value={form.accumulatedAccountCode} onChange={(e) => set("accumulatedAccountCode", e.target.value)} required /></label>
            <label>Cuenta de gasto<input value={form.expenseAccountCode ?? ""} onChange={(e) => set("expenseAccountCode", e.target.value)} /></label>
          </div>
          <label>Notas<input value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            Amortización mensual: $ {money(form.usefulLifeMonths > 0 ? (form.cost - form.residualValue) / form.usefulLifeMonths : 0)}
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button type="submit" className="btn" disabled={busy}>Guardar</button>
            <button type="button" className="btn ghost" onClick={() => { setForm(null); setEditingId(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card pad" style={{ overflowX: "auto" }}>
        {assets.length === 0 ? (
          <p className="muted">Todavía no hay bienes cargados.</p>
        ) : (
          <table style={{ fontSize: "0.82rem" }}>
            <thead>
              <tr>
                <th>Bien</th>
                <th>Alta</th>
                <th style={{ textAlign: "right" }}>Costo</th>
                <th style={{ textAlign: "right" }}>Por mes</th>
                <th style={{ textAlign: "right" }}>Amort. acumulada</th>
                <th style={{ textAlign: "right" }}>Valor residual contable</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.code} — {a.name}<div className="muted" style={{ fontSize: "0.72rem" }}>{a.assetAccountCode} · {a.usefulLifeMonths} meses</div></td>
                  <td>{day(a.acquisitionDate)}</td>
                  <td style={{ textAlign: "right" }}>{money(a.cost)}</td>
                  <td style={{ textAlign: "right" }}>{money(a.monthlyDepreciation)}</td>
                  <td style={{ textAlign: "right" }}>{money(a.accumulatedDepreciation)}<div className="muted" style={{ fontSize: "0.72rem" }}>hasta {day(a.depreciatedThrough)}</div></td>
                  <td style={{ textAlign: "right" }}>{money(a.bookValue)}</td>
                  <td>{a.status === "Active" ? "Activo" : `Baja ${day(a.disposedAt)}`}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" className="btn ghost compact" onClick={() => edit(a)}>Editar</button>
                    {a.status === "Active" && <button type="button" className="btn ghost compact" onClick={() => dispose(a)}>Baja</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card pad stack" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>Amortización del mes</h3>
        <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ maxWidth: 200 }}>Último día del mes<input type="date" value={depDate} onChange={(e) => { setDepDate(e.target.value); setPreview(null); }} /></label>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(async () => { setPreview(await api.previewDepreciation(depDate)); })}>
            👁️ Calcular
          </button>
          <button type="button" className="btn" disabled={busy || !preview || preview.total === 0 || preview.existingEntryNumber != null}
            onClick={() => void run(async () => {
              const res = await api.postDepreciation(depDate);
              setPreview(null);
              return `✓ Amortización registrada: asiento N° ${res.entryNumber} por $ ${money(res.total)}.`;
            })}>
            Registrar asiento
          </button>
        </div>
        {preview && (
          <>
            {preview.existingEntryNumber != null && <div className="alert">Ese mes ya tiene amortización: asiento N° {preview.existingEntryNumber}.</div>}
            <table style={{ fontSize: "0.8rem" }}>
              <tbody>
                {preview.rows.filter((r) => r.amount > 0).map((r) => (
                  <tr key={r.assetId}><td>{r.code} — {r.name}</td><td style={{ textAlign: "right" }}>{money(r.amount)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr style={{ fontWeight: 800 }}><td>Total del mes</td><td style={{ textAlign: "right" }}>{money(preview.total)}</td></tr></tfoot>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
