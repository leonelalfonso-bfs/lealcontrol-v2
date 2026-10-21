import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { ReconciliationTray } from "../api/types/finance";

type Account = { id: string; name: string; currency: string; type: string };
type Row = ReconciliationTray["rows"][number];

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const isDebit = (r: Row) => r.kind === "Debit" || r.kind === 1;
const CONFIRMABLE = ["Match", "MatchMany", "Cheque", "Classified"];

/** Bandeja de conciliación (nota 69, F1b): cada movimiento del extracto con su acción sugerida; se confirman todas juntas. */
export function FinanceReconciliationPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [tray, setTray] = useState<ReconciliationTray | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listFinanceAccounts().then((rows) => {
      const banks = rows.filter((a: Account) => a.type !== "Cash");
      setAccounts(banks);
      if (banks.length > 0) setAccountId(banks[0].id);
    }).catch((err) => setError(err.message));
  }, []);

  const load = async () => {
    if (!accountId) return;
    setError(null);
    try {
      const result = await api.getReconciliationTray(accountId);
      setTray(result);
      setSelected(new Set(result.rows.filter((r) => CONFIRMABLE.includes(r.suggestion.type)).map((r) => r.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la bandeja.");
    }
  };
  useEffect(() => { void load(); }, [accountId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of tray?.rows ?? []) c[r.suggestion.type] = (c[r.suggestion.type] ?? 0) + 1;
    return c;
  }, [tray]);
  const rows = (tray?.rows ?? []).filter((r) => filter === "all" || r.suggestion.type === filter
    || (filter === "Create" && r.suggestion.type.startsWith("Create")) || (filter === "Match" && r.suggestion.type === "MatchMany"));

  const confirm = async () => {
    if (!tray) return;
    const chosen = tray.rows.filter((r) => selected.has(r.id));
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const result = await api.confirmReconciliationTray({
        accountId,
        matches: chosen.flatMap((r) => (r.suggestion.type === "Match" ? [{ importedId: r.id, systemId: r.suggestion.systemId }] : [])),
        matchesMany: chosen.flatMap((r) => (r.suggestion.type === "MatchMany" ? [{ importedId: r.id, systemIds: r.suggestion.systemIds }] : [])),
        cheques: chosen.flatMap((r) => (r.suggestion.type === "Cheque" ? [{ importedId: r.id, chequeId: r.suggestion.chequeId }] : [])),
        classify: chosen.filter((r) => r.suggestion.type === "Classified").map((r) => r.id)
      });
      setMsg(`✓ Conciliados ${result.matched} pagos y cobros, ${result.cheques} eCheq y ${result.classified} gastos o impuestos del banco.`
        + (result.errors.length ? ` ${result.errors.join(" ")}` : ""));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setBusy(false);
    }
  };

  const action = (r: Row) => {
    const s = r.suggestion;
    const query = `movementId=${r.id}&accountId=${accountId}&amount=${r.amount}`;
    switch (s.type) {
      case "Match": return <span>Conciliar con <strong>{s.label}</strong> <span className="muted">({day(s.operationDateUtc)})</span></span>;
      case "MatchMany": return <span>Paga varias juntas: <strong>{s.label}</strong></span>;
      case "Cheque": return <span>Es el <strong>{s.label}</strong></span>;
      case "Classified": return <span>Gasto / impuesto del banco: <strong>{s.label}</strong></span>;
      case "CreatePayment": return <Link className="btn compact" to={`/finanzas/pagos/nueva?supplierId=${s.counterpartyId}&${query}`}>💳 Crear orden de pago</Link>;
      case "CreateReceipt": return <Link className="btn compact" to={`/finanzas/cobranzas?customerId=${s.counterpartyId}&${query}`}>🧾 Crear recibo</Link>;
      default: return (
        <span className="row" style={{ gap: 6 }}>
          {isDebit(r)
            ? <Link className="btn ghost compact" to={`/finanzas/pagos/nueva?${query}`}>Orden de pago</Link>
            : <Link className="btn ghost compact" to={`/finanzas/cobranzas?${query}`}>Recibo</Link>}
          <Link className="btn ghost compact" to="/finanzas/conceptos">Crear regla</Link>
        </span>
      );
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>🔗 Conciliación bancaria</h1>
          <p className="muted">Lo que trajo el extracto y todavía no está vinculado, con la acción sugerida para cada movimiento.</p>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
          <Link to="/finanzas/bancos" className="btn ghost">Importar extracto</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {tray && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {[
              ["all", `Todos (${tray.rows.length})`],
              ["Match", `Pagos y cobros (${(counts.Match ?? 0) + (counts.MatchMany ?? 0)})`],
              ["Cheque", `eCheq (${counts.Cheque ?? 0})`],
              ["Classified", `Gastos e impuestos (${counts.Classified ?? 0})`],
              ["Create", `Crear OP o recibo (${(counts.CreatePayment ?? 0) + (counts.CreateReceipt ?? 0)})`],
              ["Unknown", `Sin identificar (${counts.Unknown ?? 0})`]
            ].map(([key, label]) => (
              <button key={key} type="button" className={filter === key ? "btn compact" : "btn ghost compact"} onClick={() => setFilter(key)}>{label}</button>
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn" disabled={busy || selected.size === 0} onClick={() => void confirm()}>
              ✓ Confirmar {selected.size} sugerencia(s)
            </button>
          </div>
          {tray.pendingSystem > 0 && (
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Hay {tray.pendingSystem} cobro(s) o pago(s) del sistema que todavía no aparecieron en el extracto.
            </p>
          )}
          <div className="card pad table-wrap">
            <table style={{ fontSize: "0.86rem" }}>
              <thead><tr><th /><th>Fecha</th><th>Movimiento del banco</th><th style={{ textAlign: "right" }}>Débito</th><th style={{ textAlign: "right" }}>Crédito</th><th>Acción sugerida</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {CONFIRMABLE.includes(r.suggestion.type) && (
                        <input type="checkbox" checked={selected.has(r.id)} onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(r.id); else next.delete(r.id);
                          setSelected(next);
                        }} />
                      )}
                    </td>
                    <td>{day(r.operationDateUtc)}</td>
                    <td>
                      {r.description}
                      {r.counterpartyTaxId && <div className="muted" style={{ fontSize: "0.75rem" }}>CUIT {r.counterpartyTaxId}</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>{isDebit(r) ? money(r.amount) : ""}</td>
                    <td style={{ textAlign: "right" }}>{isDebit(r) ? "" : money(r.amount)}</td>
                    <td>{action(r)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 16 }}>No hay movimientos pendientes.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
