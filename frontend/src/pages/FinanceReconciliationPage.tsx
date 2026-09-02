import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

type Account = { id: string; name: string; currency: string; type: string };
type MovementRow = {
  id: string;
  side?: string;
  operationDateUtc: string;
  kind: string;
  amount: number;
  currency: string;
  description: string;
  externalReference?: string;
  reconciliationStatus: number | string;
  linkedEntityType?: string;
  linkedEntityId?: string;
};
type MatchSuggestion = {
  importedMovementId: string;
  systemMovementId: string;
  amount: number;
  importedDescription: string;
  systemDescription: string;
};

export function FinanceReconciliationPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [imported, setImported] = useState<MovementRow[]>([]);
  const [system, setSystem] = useState<MovementRow[]>([]);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listFinanceAccounts().then((rows) => {
      setAccounts(rows);
      if (rows[0]?.id) setAccountId(rows[0].id);
    }).catch((e) => setError(e instanceof Error ? e.message : "Error cargando cuentas"));
  }, []);

  const load = async () => {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.getFinanceReconciliation(accountId);
      setImported(data.imported ?? []);
      setSystem(data.system ?? []);
      setSuggestions(data.suggestedMatches ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la conciliación.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (accountId) void load();
  }, [accountId]);

  const confirmMatch = async (s: MatchSuggestion) => {
    setBusy(true);
    try {
      await api.matchFinanceReconciliation(s.importedMovementId, s.systemMovementId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conciliar.");
    } finally {
      setBusy(false);
    }
  };

  const money = (n: number, c = "ARS") =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · CONCILIACIÓN</span>
          <h1>Extracto ↔ Sistema</h1>
          <p className="muted">Matcheá movimientos importados del banco con movimientos generados por recibos, OP y transferencias.</p>
        </div>
        <div className="toolbar">
          <Link to="/finanzas/bancos" className="btn btn-outline">← Cuentas</Link>
          <button className="btn" onClick={() => void load()} disabled={busy}>↻ Actualizar</button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <section className="card pad" style={{ marginBottom: 16 }}>
        <label>Cuenta bancaria
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
            ))}
          </select>
        </label>
      </section>

      {suggestions.length > 0 && (
        <section className="card pad" style={{ marginBottom: 16 }}>
          <h2>Sugerencias de match</h2>
          <table className="table">
            <thead>
              <tr><th>Extracto</th><th>Sistema</th><th>Importe</th><th></th></tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={`${s.importedMovementId}-${s.systemMovementId}`}>
                  <td>{s.importedDescription}</td>
                  <td>{s.systemDescription}</td>
                  <td>{money(s.amount)}</td>
                  <td>
                    <button className="btn btn-sm" disabled={busy} onClick={() => void confirmMatch(s)}>
                      Conciliar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="grid-2" style={{ gap: 16 }}>
        <section className="card pad">
          <h2>Extracto (Imported)</h2>
          <p className="muted">{imported.length} movimientos pendientes</p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {imported.map((m) => (
              <li key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>{new Date(m.operationDateUtc).toLocaleDateString("es-AR")} · {money(m.amount, m.currency)}</div>
                <div className="muted">{m.description}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card pad">
          <h2>Sistema (PendingBank)</h2>
          <p className="muted">{system.length} movimientos sin respaldo bancario</p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {system.map((m) => (
              <li key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div>{new Date(m.operationDateUtc).toLocaleDateString("es-AR")} · {money(m.amount, m.currency)}</div>
                <div className="muted">{m.description}</div>
                {m.linkedEntityType && (
                  <div className="muted" style={{ fontSize: 12 }}>{m.linkedEntityType} {m.linkedEntityId}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
