import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { FinanceAccount, PaymentBatch, PaymentBatchCandidate } from "../api/types/finance";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

/** Pagos por archivo (nota 69, F4): las transferencias de las órdenes de pago se juntan en un lote y se exportan para Interbanking. */
export function FinancePaymentBatchesPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [accountCbu, setAccountCbu] = useState("");
  const [candidates, setCandidates] = useState<PaymentBatchCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cbuEdit, setCbuEdit] = useState<Record<string, string>>({});
  const [requestDate, setRequestDate] = useState(tomorrow());
  const [consolidated, setConsolidated] = useState(true);
  const [batches, setBatches] = useState<PaymentBatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const banks = accounts.filter((a) => a.type === "Bank" && a.isActive && a.currency === "ARS");
  const account = banks.find((a) => a.id === accountId);

  const loadAccounts = () => api.listFinanceAccounts().then(setAccounts).catch((err) => setError(err.message));
  const load = async () => {
    setBatches(await api.listPaymentBatches());
    if (accountId) {
      const list = await api.listPaymentBatchCandidates(accountId);
      setCandidates(list);
      setSelected((prev) => new Set([...prev].filter((id) => list.some((c) => c.movementId === id && !c.problem))));
    }
  };
  useEffect(() => { void loadAccounts(); }, []);
  useEffect(() => { if (!accountId && banks.length > 0) setAccountId(banks[0].id); }, [banks, accountId]);
  useEffect(() => { setAccountCbu(account?.cbu ?? ""); setSelected(new Set()); void load().catch((err) => setError(err.message)); }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const total = useMemo(() => candidates.filter((c) => selected.has(c.movementId)).reduce((s, c) => s + c.amount, 0), [candidates, selected]);
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>📤 Pagos por archivo (Interbanking)</h1>
          <p className="muted">Las transferencias de las órdenes de pago se juntan en un lote; el archivo se sube a Interbanking y, cuando el banco debita, la conciliación lo reconoce solo.</p>
        </div>
        <Link to="/finanzas/ayuda#lotes" className="btn ghost">💡 Ayuda</Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card pad row" style={{ gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ minWidth: 240 }}>Cuenta a debitar
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {banks.length === 0 && <option value="">No hay cuentas bancarias en pesos</option>}
            {banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label style={{ minWidth: 260 }}>CBU de la cuenta<input value={accountCbu} maxLength={26} inputMode="numeric" onChange={(e) => setAccountCbu(e.target.value)} placeholder="22 dígitos" /></label>
        <button type="button" className="btn ghost" disabled={!accountId} onClick={() => void run(async () => {
          await api.saveAccountCbu(accountId, accountCbu.trim() || null);
          await loadAccounts();
          return "✓ CBU de la cuenta guardado.";
        })}>Guardar CBU</button>
      </div>

      <div className="card pad stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Transferencias pendientes</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>Órdenes de pago con transferencia desde esta cuenta que el banco todavía no debitó y no están en otro lote.</p>
        <table style={{ fontSize: "0.85rem" }}>
          <thead><tr><th /><th>Fecha</th><th>Orden de pago</th><th>Proveedor</th><th>CBU del proveedor</th><th style={{ textAlign: "right" }}>Importe</th></tr></thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.movementId}>
                <td><input type="checkbox" aria-label={`Incluir ${c.orderNumber}`} disabled={!!c.problem} checked={selected.has(c.movementId)} onChange={() => toggle(c.movementId)} /></td>
                <td>{day(c.date)}</td>
                <td>{c.orderNumber}</td>
                <td>{c.supplierName}<div className="muted" style={{ fontSize: "0.75rem" }}>{c.supplierTaxId || "sin CUIT"}</div></td>
                <td>
                  {c.cbu && !(c.supplierId && c.supplierId in cbuEdit) ? (
                    <span>{c.cbu} {c.supplierId && <button type="button" className="btn ghost compact" onClick={() => setCbuEdit({ ...cbuEdit, [c.supplierId!]: c.cbu ?? "" })}>Cambiar</button>}</span>
                  ) : c.supplierId ? (
                    <form className="row" style={{ gap: 6 }} onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api.saveSupplierBankAccount(c.supplierId!, { cbu: cbuEdit[c.supplierId!] ?? "" });
                        const { [c.supplierId!]: _, ...rest } = cbuEdit;
                        setCbuEdit(rest);
                        return `✓ CBU de ${c.supplierName} guardado.`;
                      });
                    }}>
                      <input value={cbuEdit[c.supplierId] ?? ""} placeholder="CBU, 22 dígitos" inputMode="numeric" maxLength={26} onChange={(e) => setCbuEdit({ ...cbuEdit, [c.supplierId!]: e.target.value })} style={{ width: 210 }} />
                      <button type="submit" className="btn ghost compact">Guardar</button>
                    </form>
                  ) : null}
                  {c.problem && <div className="muted" style={{ fontSize: "0.75rem", color: "var(--danger, #b42318)" }}>{c.problem}</div>}
                </td>
                <td style={{ textAlign: "right" }}>$ {money(c.amount)}</td>
              </tr>
            ))}
            {candidates.length === 0 && <tr><td colSpan={6} className="muted">No hay transferencias pendientes en esta cuenta.</td></tr>}
          </tbody>
        </table>
        <div className="row" style={{ gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ maxWidth: 170 }}>Fecha de pago<input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} /></label>
          <label className="row" style={{ gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={consolidated} onChange={(e) => setConsolidated(e.target.checked)} /> Débito consolidado (un solo débito por el total)
          </label>
          <button type="button" className="btn" disabled={selected.size === 0} onClick={() => void run(async () => {
            const batch = await api.createPaymentBatch({ accountId, movementIds: [...selected], requestDate, consolidated });
            setSelected(new Set());
            await api.downloadInterbanking(batch);
            return `✓ Lote ${String(batch.number).padStart(4, "0")} generado por $ ${money(batch.total)}: subí el archivo a Interbanking.`;
          })}>Generar lote ({selected.size}) · $ {money(total)}</button>
        </div>
      </div>

      <div className="card pad stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Lotes generados</h3>
        <table style={{ fontSize: "0.85rem" }}>
          <thead><tr><th>Lote</th><th>Cuenta</th><th>Fecha de pago</th><th>Transferencias</th><th style={{ textAlign: "right" }}>Total</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td>{String(b.number).padStart(4, "0")}</td>
                <td>{accounts.find((a) => a.id === b.accountId)?.name ?? "—"}</td>
                <td>{day(b.requestDate)}{b.consolidated ? " · consolidado" : ""}</td>
                <td>{b.items.map((i) => `${i.paymentOrderNumber} ${i.supplierName}`).join(" · ")}</td>
                <td style={{ textAlign: "right" }}>$ {money(b.total)}</td>
                <td>{b.status === "Generated" ? "Generado" : "Anulado"}</td>
                <td className="row" style={{ gap: 6 }}>
                  {b.status === "Generated" && <>
                    <button type="button" className="btn ghost compact" onClick={() => void run(() => api.downloadInterbanking(b))}>⬇️ Archivo</button>
                    <button type="button" className="btn ghost compact" onClick={() => window.confirm(`¿Anular el lote ${b.number}? Sus transferencias vuelven a quedar disponibles para otro lote.`) && void run(async () => { await api.cancelPaymentBatch(b.id); return "✓ Lote anulado."; })}>Anular</button>
                  </>}
                </td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={7} className="muted">Todavía no se generaron lotes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
