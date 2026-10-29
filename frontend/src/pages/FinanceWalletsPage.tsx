import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Employee } from "../api/types";
import type { ExpensePolicy, ExpenseReportSummary, ExpenseWallet, FinanceAccount } from "../api/types/finance";
import { todayAr } from "../lib/dates";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Billeteras de viáticos de los empleados y sus rendiciones de gastos (planilla FS 7.1 901 R2). */
export function FinanceWalletsPage() {
  const navigate = useNavigate();
  const [wallets, setWallets] = useState<ExpenseWallet[]>([]);
  const [reports, setReports] = useState<ExpenseReportSummary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [banks, setBanks] = useState<FinanceAccount[]>([]);
  const [policy, setPolicy] = useState<ExpensePolicy | null>(null);
  const [newWallet, setNewWallet] = useState({ employeeId: "", openingBalance: "" });
  const [deposit, setDeposit] = useState<{ walletId: string; fromAccountId: string; amount: string; date: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const [w, r] = await Promise.all([api.listExpenseWallets(), api.listExpenseReports()]);
    setWallets(w);
    setReports(r);
  };
  useEffect(() => {
    void load().catch((err) => setError(err.message));
    api.listEmployees().then((list) => setEmployees(list.filter((e) => e.status !== 2))).catch(() => setEmployees([]));
    api.listFinanceAccounts().then((list) => setBanks(list.filter((a) => a.isActive && a.currency === "ARS" && (a.type === "Bank" || a.type === "Cash")))).catch(() => setBanks([]));
    api.getExpensePolicy().then(setPolicy).catch(() => setPolicy(null));
  }, []);

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

  const withoutWallet = employees.filter((e) => !wallets.some((w) => w.employeeId === e.id));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>👛 Viáticos y rendiciones</h1>
          <p className="muted">La billetera de cada empleado recibe los viáticos por transferencia y descuenta los gastos de las rendiciones aprobadas.</p>
        </div>
        <Link to="/finanzas/ayuda#viaticos" className="btn ghost">💡 Ayuda</Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card pad stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Billeteras</h3>
        <table style={{ fontSize: "0.88rem" }}>
          <thead><tr><th>Empleado</th><th style={{ textAlign: "right" }}>Saldo</th><th style={{ textAlign: "right" }}>En rendiciones abiertas</th><th /></tr></thead>
          <tbody>
            {wallets.map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>$ {money(w.balance)}</td>
                <td style={{ textAlign: "right" }}>{w.openReports > 0 ? `$ ${money(w.pendingAmount)} (${w.openReports})` : "—"}</td>
                <td className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                  <button type="button" className="btn ghost compact" onClick={() => setDeposit({ walletId: w.id, fromAccountId: banks[0]?.id ?? "", amount: "", date: todayAr() })}>💸 Depositar viáticos</button>
                  <button type="button" className="btn compact" onClick={() => void run(async () => {
                    const r = await api.createExpenseReport({ employeeId: w.employeeId, weekStart: `${todayAr()}T00:00:00Z` });
                    navigate(`/finanzas/rendiciones/${r.id}`);
                  })}>＋ Rendición</button>
                </td>
              </tr>
            ))}
            {wallets.length === 0 && <tr><td colSpan={4} className="muted">Todavía no hay billeteras.</td></tr>}
          </tbody>
        </table>

        {deposit && (
          <form className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }} onSubmit={(e) => {
            e.preventDefault();
            const wallet = wallets.find((w) => w.id === deposit.walletId)!;
            void run(async () => {
              await api.financeTransfer({ fromAccountId: deposit.fromAccountId, toAccountId: deposit.walletId, amount: Number(deposit.amount), currency: "ARS",
                operationDateUtc: `${deposit.date}T00:00:00Z`, description: `Viáticos · ${wallet.name}` });
              setDeposit(null);
              return `✓ Depositados $ ${money(Number(deposit.amount))} en ${wallet.name}.`;
            });
          }}>
            <strong style={{ alignSelf: "center" }}>{wallets.find((w) => w.id === deposit.walletId)?.name}</strong>
            <label style={{ minWidth: 200 }}>Desde
              <select value={deposit.fromAccountId} onChange={(e) => setDeposit({ ...deposit, fromAccountId: e.target.value })} required>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label style={{ maxWidth: 150 }}>Fecha<input type="date" value={deposit.date} onChange={(e) => setDeposit({ ...deposit, date: e.target.value })} required /></label>
            <label style={{ maxWidth: 160 }}>Importe<input type="number" step="0.01" min="0.01" value={deposit.amount} onChange={(e) => setDeposit({ ...deposit, amount: e.target.value })} required /></label>
            <button type="submit" className="btn">Depositar</button>
            <button type="button" className="btn ghost" onClick={() => setDeposit(null)}>Cancelar</button>
          </form>
        )}

        <form className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6 }} onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const w = await api.createExpenseWallet({ employeeId: newWallet.employeeId, openingBalance: Number(newWallet.openingBalance || 0) });
            setNewWallet({ employeeId: "", openingBalance: "" });
            return `✓ ${w.name} creada.`;
          });
        }}>
          <label style={{ minWidth: 240 }}>Nueva billetera para
            <select value={newWallet.employeeId} onChange={(e) => setNewWallet({ ...newWallet, employeeId: e.target.value })} required>
              <option value="">Elegí un empleado…</option>
              {withoutWallet.map((e) => <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>)}
            </select>
          </label>
          <label style={{ maxWidth: 200 }}>Saldo actual (de la planilla)<input type="number" step="0.01" value={newWallet.openingBalance} onChange={(e) => setNewWallet({ ...newWallet, openingBalance: e.target.value })} /></label>
          <button type="submit" className="btn ghost">Crear billetera</button>
        </form>
      </div>

      <div className="card pad stack" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>Rendiciones</h3>
        <table style={{ fontSize: "0.88rem" }}>
          <thead><tr><th>N.º</th><th>Empleado</th><th>Semana</th><th>Vehículo / OS</th><th style={{ textAlign: "right" }}>Gastos</th><th style={{ textAlign: "right" }}>Total</th><th>Estado</th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/finanzas/rendiciones/${r.id}`)}>
                <td><Link to={`/finanzas/rendiciones/${r.id}`}>{r.number}</Link></td>
                <td>{r.employeeName}</td>
                <td>{day(r.weekStart)}</td>
                <td>{[r.vehiclePlate, r.serviceOrderLabel].filter(Boolean).join(" · ") || "—"}</td>
                <td style={{ textAlign: "right" }}>{r.lines}</td>
                <td style={{ textAlign: "right" }}>$ {money(r.total)}</td>
                <td>{r.status === "Open" ? "Abierta" : "Aprobada"}</td>
              </tr>
            ))}
            {reports.length === 0 && <tr><td colSpan={7} className="muted">Todavía no hay rendiciones.</td></tr>}
          </tbody>
        </table>
      </div>

      {policy && (
        <form className="card pad row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }} onSubmit={(e) => {
          e.preventDefault();
          void run(async () => { await api.saveExpensePolicy(policy); return "✓ Topes guardados."; });
        }}>
          <strong style={{ alignSelf: "center" }}>Topes por persona (U$D)</strong>
          <label style={{ maxWidth: 110 }}>Comida<input type="number" step="0.01" value={policy.mealUsd} onChange={(e) => setPolicy({ ...policy, mealUsd: Number(e.target.value) })} /></label>
          <label style={{ maxWidth: 110 }}>Refrigerio<input type="number" step="0.01" value={policy.snackUsd} onChange={(e) => setPolicy({ ...policy, snackUsd: Number(e.target.value) })} /></label>
          <label style={{ maxWidth: 130 }}>Hospedaje 1 pers.<input type="number" step="0.01" value={policy.lodgingOneUsd} onChange={(e) => setPolicy({ ...policy, lodgingOneUsd: Number(e.target.value) })} /></label>
          <label style={{ maxWidth: 130 }}>Hospedaje 2 pers.<input type="number" step="0.01" value={policy.lodgingTwoUsd} onChange={(e) => setPolicy({ ...policy, lodgingTwoUsd: Number(e.target.value) })} /></label>
          <button type="submit" className="btn ghost">Guardar</button>
          <span className="muted" style={{ fontSize: "0.78rem" }}>Al dólar billete vendedor del Banco Nación. Pasarse no bloquea: avisa para aprobar a conciencia.</span>
        </form>
      )}
    </div>
  );
}
