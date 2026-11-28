import { useEffect, useMemo, useRef, useState } from "react";
import { businessDate } from "../lib/dates";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Invoice } from "../api/types";
import type { FinanceMovementReview, InvestmentFund, ReceivedCheque } from "../api/types/finance";
import { fileToBase64, fileToText } from "../lib/files";

type Account = {
  id: string;
  name: string;
  currency: string;
  type: string;
  balance: number;
  isActive: boolean;
  bookingMode?: string;
};

type ImportRow = {
  operationDateUtc: string;
  amount: number;
  kind: string;
  description: string;
  externalReference?: string;
  error?: string;
};

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const isManual = (a: Account) => (a.bookingMode || "Statement") === "Manual";

function daysUntil(iso?: string | null) {
  if (!iso) return null;
  const target = Date.parse(iso.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(target)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function FinancePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [funds, setFunds] = useState<InvestmentFund[]>([]);
  const [cheques, setCheques] = useState<ReceivedCheque[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [movementsToReview, setMovementsToReview] = useState<FinanceMovementReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [csv, setCsv] = useState("");
  const [file, setFile] = useState<{ fileBase64: string; fileName: string } | null>(null);
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: "",
    currency: "ARS",
    type: "Bank",
    openingBalance: "0",
    bookingMode: "Statement" as "Statement" | "Manual"
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const statementAccounts = useMemo(
    () => accounts.filter((a) => !isManual(a)),
    [accounts]
  );

  const load = () =>
    Promise.all([
      api.listFinanceAccounts().then(setAccounts),
      api.listInvestmentFunds().then(setFunds).catch(() => setFunds([])),
      api.listReceivedCheques().then(setCheques).catch(() => setCheques([])),
      api.listInvoices().then(setInvoices).catch(() => setInvoices([])),
      api.listFinanceMovementsForReview().then(setMovementsToReview).catch(() => setMovementsToReview([]))
    ]).catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los datos de Finanzas."));

  useEffect(() => {
    void load();
  }, []);

  const ownChequesDue = useMemo(
    () =>
      cheques
        .filter((c) => c.direction === "Issued" && c.status === "Issued")
        .map((c) => ({ cheque: c, days: daysUntil(c.dueDateUtc) }))
        .filter((x): x is { cheque: ReceivedCheque; days: number } => x.days !== null && x.days <= 5)
        .sort((a, b) => a.days - b.days),
    [cheques]
  );

  const thirdPartyChequesToDeposit = useMemo(
    () =>
      cheques
        .filter((c) => c.direction === "Received" && c.status === "Available")
        .map((c) => ({ cheque: c, days: daysUntil(c.dueDateUtc) }))
        .filter((x): x is { cheque: ReceivedCheque; days: number } => x.days !== null && x.days <= 3)
        .sort((a, b) => a.days - b.days),
    [cheques]
  );

  const overdueByCustomer = useMemo(() => {
    const map = new Map<
      string,
      { customerId: string; customerName: string; count: number; maxDays: number; ars: number; usd: number }
    >();
    for (const inv of invoices) {
      if (inv.status !== "Authorized" || /^NC/i.test(inv.invoiceType || "")) continue;
      const pending = typeof inv.pending === "number" ? inv.pending : 0;
      if (pending <= 0.01) continue;
      const d = daysUntil(inv.dueDate);
      if (d === null || d >= 0) continue;
      const overdueDays = Math.abs(d);
      const curr = map.get(inv.customerId) ?? {
        customerId: inv.customerId,
        customerName: inv.customerName || "Cliente",
        count: 0,
        maxDays: 0,
        ars: 0,
        usd: 0
      };
      curr.count += 1;
      curr.maxDays = Math.max(curr.maxDays, overdueDays);
      if ((inv.currency || "ARS").startsWith("USD")) curr.usd += pending;
      else curr.ars += pending;
      map.set(inv.customerId, curr);
    }
    return Array.from(map.values()).sort((a, b) => b.maxDays - a.maxDays || b.ars - a.ars);
  }, [invoices]);

  const readFile = async (f: File) => {
    setFile({ fileBase64: await fileToBase64(f), fileName: f.name });
    setCsv(/\.xlsx?$/i.test(f.name) ? "" : await fileToText(f));
  };
  const source = () => (file ? file : { csvContent: csv });

  const doPreview = async () => {
    if (!accountId || (!file && !csv.trim())) return setError("Elegí una cuenta y cargá el extracto.");
    setBusy(true);
    setError(null);
    try {
      const result = await api.previewFinanceBankImport(accountId, source());
      if (result.requiresMapping) {
        setPreview([]);
        setError("No se reconocieron las columnas. Abrí la cuenta y usá el asistente de mapeo, o descargá la plantilla LealControl.");
        return;
      }
      setPreview(result.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar el extracto.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await api.confirmFinanceBankImport(accountId, source());
      setPreview([]);
      setCsv("");
      setFile(null);
      await load();
      alert(
        `Importados: ${result.imported}. Duplicados: ${result.duplicates}. Rechazadas: ${result.rejected}` +
          (result.matchedSystem ? `. Matcheados con sistema: ${result.matchedSystem}` : "") +
          "."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar la importación.");
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (!accountForm.name.trim()) return setError("Ingresá un nombre para la cuenta.");
    setBusy(true);
    try {
      await api.createFinanceAccount({
        ...accountForm,
        openingBalance: Number(accountForm.openingBalance) || 0,
        bookingMode: accountForm.bookingMode
      });
      setAccountForm({
        name: "",
        currency: "ARS",
        type: "Bank",
        openingBalance: "0",
        bookingMode: "Statement"
      });
      setShowAccountForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la cuenta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · CENTRO DE CONTROL</span>
          <h1>Finanzas y Tesorería</h1>
          <p className="muted">Disponibilidad, vencimientos de cheques, cobranzas vencidas y conciliación bancaria en un solo lugar.</p>
        </div>
        <div className="toolbar">
          <Link className="btn btn-outline" to="/finanzas/cobranzas">+ Recibo de cobro</Link>
          <Link className="btn btn-outline" to="/finanzas/pagos">+ Orden de pago</Link>
          <button className="btn btn-outline" onClick={() => setShowAccountForm((value) => !value)}>
            + Nueva cuenta
          </button>
          <button className="btn" onClick={() => void load()}>
            ↻ Actualizar
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {showAccountForm && (
        <section className="card pad" style={{ marginBottom: 22 }}>
          <h2>Nueva cuenta financiera</h2>
          <div className="grid-2">
            <label>
              Nombre
              <input
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder="Banco Galicia - Cuenta corriente"
              />
            </label>
            <label>
              Tipo
              <select
                value={accountForm.type}
                onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}
              >
                <option value="Bank">Banco</option>
                <option value="Cash">Caja</option>
                <option value="Wallet">Billetera virtual</option>
                <option value="Investment">Inversión</option>
              </select>
            </label>
            <label>
              Moneda
              <select
                value={accountForm.currency}
                onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
              >
                <option>ARS</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </label>
            <label>
              Saldo inicial
              <input
                type="number"
                value={accountForm.openingBalance}
                onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Modo de carga
              <select
                value={accountForm.bookingMode}
                onChange={(e) =>
                  setAccountForm({
                    ...accountForm,
                    bookingMode: e.target.value as "Statement" | "Manual"
                  })
                }
              >
                <option value="Statement">Con extracto bancario (CSV)</option>
                <option value="Manual">Manual (movimientos uno a uno)</option>
              </select>
              <small className="muted" style={{ display: "block", marginTop: 4 }}>
                {accountForm.bookingMode === "Manual"
                  ? "No se podrá importar CSV en esta cuenta. Los movimientos se cargan uno a uno."
                  : "No se podrán cargar movimientos manuales. Solo importación de extracto."}
              </small>
            </label>
          </div>
          <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn ghost" onClick={() => setShowAccountForm(false)}>
              Cancelar
            </button>
            <button className="btn" disabled={busy} onClick={() => void createAccount()}>
              Guardar cuenta
            </button>
          </div>
        </section>
      )}

      <div className="kpi kpi-4">
        {accounts.map((account) => (
          <div className="card pad" key={account.id}>
            <span className="muted">{account.name}</span>
            <strong style={{ display: "block", marginTop: 10, fontSize: "1.55rem" }}>
              {money(account.balance, account.currency)}
            </strong>
            <small className="muted">
              {account.type} · {account.currency} · {isManual(account) ? "Manual" : "Extracto"}
            </small>
          </div>
        ))}
        {funds.map((fund) => (
          <Link className="card pad" key={fund.id} to="/finanzas/fondos" style={{ color: "inherit", textDecoration: "none" }}>
            <span className="muted">{fund.name}</span>
            <strong style={{ display: "block", marginTop: 10, fontSize: "1.55rem" }}>
              {fund.valuation != null ? money(fund.valuation, fund.currency) : "Sin valuar"}
            </strong>
            <small className="muted">
              Fondo común · {fund.currency} · {fund.units.toLocaleString("es-AR", { maximumFractionDigits: 2 })} cuotapartes
            </small>
          </Link>
        ))}
      </div>

      <div className="kpi kpi-4" style={{ marginTop: 18 }}>
        <Link className="card" to="/finanzas/echeqs" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="muted">Cheques propios (≤ 5 días)</span>
          <strong>{ownChequesDue.length}</strong>
        </Link>
        <Link className="card" to="/finanzas/echeqs" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="muted">Cheques a depositar (≤ 3 días)</span>
          <strong>{thirdPartyChequesToDeposit.length}</strong>
        </Link>
        <Link className="card" to="/finanzas/cuenta-corriente" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="muted">Clientes con facturas vencidas</span>
          <strong>{overdueByCustomer.length}</strong>
        </Link>
        <Link className="card" to="/finanzas/conciliacion" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="muted">Movimientos por conciliar</span>
          <strong>{movementsToReview.length}</strong>
        </Link>
      </div>

      <div className="split" style={{ marginTop: 18 }}>
        <section className="card pad">
          <div className="section-head">
            <div>
              <h2>Cheques y conciliación bancaria</h2>
              <p className="muted">Cheques propios a fondear, cheques de terceros listos para depositar y extractos pendientes.</p>
            </div>
            <Link className="btn btn-outline compact" to="/finanzas/echeqs">Cartera →</Link>
          </div>
          {ownChequesDue.length === 0 && thirdPartyChequesToDeposit.length === 0 && movementsToReview.length === 0 ? (
            <p className="muted">No hay cheques próximos ni movimientos pendientes de conciliar. ¡Al día!</p>
          ) : (
            <>
              {ownChequesDue.slice(0, 6).map(({ cheque: c, days }) => (
                <Link className="production-setup-row" key={c.id} to="/finanzas/echeqs">
                  <span>
                    <strong>Cheque propio {c.checkNumber}</strong> · {c.issuerName || "Sin beneficiario"}
                    <small>
                      {days < 0 ? `Venció hace ${Math.abs(days)}d` : days === 0 ? "Vence hoy" : days === 1 ? "Vence mañana" : `Vence en ${days} días`}
                      {" · "}{money(c.amount, c.currency || "ARS")}
                      {c.bankName ? ` · ${c.bankName}` : ""}
                    </small>
                  </span>
                  <span className={`badge ${days <= 1 ? "danger" : "warn"}`}>A debitarse</span>
                </Link>
              ))}
              {thirdPartyChequesToDeposit.slice(0, 6).map(({ cheque: c, days }) => (
                <Link className="production-setup-row" key={c.id} to="/finanzas/echeqs">
                  <span>
                    <strong>Cheque {c.checkNumber}</strong> · {c.issuerName || "Sin emisor"}
                    <small>
                      {days <= 0 ? "Listo para depositar hoy" : `Fecha de pago en ${days} día${days === 1 ? "" : "s"}`}
                      {" · "}{money(c.amount, c.currency || "ARS")}
                    </small>
                  </span>
                  <span className={`badge ${days <= 0 ? "warn" : "info"}`}>Depositar</span>
                </Link>
              ))}
              {movementsToReview.length > 0 && (
                <Link className="production-setup-row" to="/finanzas/conciliacion">
                  <span>
                    <strong>Conciliación bancaria pendiente</strong>
                    <small>{movementsToReview.length} movimiento{movementsToReview.length === 1 ? "" : "s"} de extracto por revisar o clasificar</small>
                  </span>
                  <span className="badge info">Conciliar →</span>
                </Link>
              )}
            </>
          )}
        </section>

        <section className="card pad">
          <div className="section-head">
            <div>
              <h2>Cobranzas vencidas por cliente</h2>
              <p className="muted">Acceso directo a la cuenta corriente o a armar el borrador de recordatorio de cobro.</p>
            </div>
            <Link className="btn btn-outline compact" to="/finanzas/cuenta-corriente">Cuentas →</Link>
          </div>
          {overdueByCustomer.length === 0 ? (
            <p className="muted">No hay facturas de venta vencidas con saldo pendiente.</p>
          ) : (
            overdueByCustomer.slice(0, 8).map((c) => {
              const totals = [
                c.ars > 0.01 ? money(c.ars, "ARS") : null,
                c.usd > 0.01 ? `USD ${c.usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null
              ].filter(Boolean).join(" + ");
              return (
                <div className="production-setup-row" key={c.customerId} style={{ cursor: "default" }}>
                  <Link
                    to={`/finanzas/cuenta-corriente?cuenta=${c.customerId}`}
                    style={{ textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}
                  >
                    <strong>{c.customerName}</strong>
                    <small>
                      {c.count} factura{c.count === 1 ? "" : "s"} vencida{c.count === 1 ? "" : "s"} · hasta {c.maxDays}d · {totals}
                    </small>
                  </Link>
                  <Link
                    className="btn btn-outline compact"
                    to={`/finanzas/cuenta-corriente?cuenta=${c.customerId}&recordatorio=1`}
                    title="Abrir borrador de recordatorio de cobro (nunca se envía solo)"
                  >
                    ✉ Recordatorio
                  </Link>
                </div>
              );
            })
          )}
        </section>
      </div>

      <section className="card pad" style={{ marginTop: 22 }}>
        <div className="page-head" style={{ marginBottom: 12 }}>
          <div>
            <h2>Importar extracto bancario</h2>
            <p className="muted">
              Solo cuentas en modo extracto. Formato: Fecha;Importe;Descripción;Referencia.
            </p>
          </div>
        </div>
        <div className="grid-2">
          <label>
            Cuenta
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Seleccionar cuenta</option>
              {statementAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            Archivo CSV
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.xls,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
          </label>
        </div>
        <textarea
          value={csv}
          onChange={(e) => { setFile(null); setCsv(e.target.value); }}
          rows={5}
          placeholder={"Fecha;Importe;Descripción;Referencia\n15/08/2026;125000;Transferencia recibida;TRX-001"}
          style={{ width: "100%", marginTop: 14 }}
        />
        <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn btn-outline" disabled={busy || (!file && !csv.trim())} onClick={() => void doPreview()}>
            Vista previa
          </button>
          {preview.length > 0 && (
            <button className="btn" disabled={busy} onClick={() => void confirm()}>
              Confirmar importación
            </button>
          )}
        </div>
        {preview.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Importe</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    <td>{businessDate(row.operationDateUtc)}</td>
                    <td>{row.kind === "Credit" ? "Ingreso" : "Egreso"}</td>
                    <td>{row.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                    <td>{row.description}</td>
                    <td>
                      {row.error ? (
                        <span className="badge danger">{row.error}</span>
                      ) : (
                        <span className="badge success">Válida</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
