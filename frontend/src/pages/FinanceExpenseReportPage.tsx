import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { ServiceOrder, Vehicle } from "../api/types";
import type { ExpenseCategory, ExpenseLine, ExpenseLineInput, ExpenseReport, ExpenseVoucherType } from "../api/types/finance";
import { EXPENSE_CATEGORIES, EXPENSE_VOUCHERS, expenseLimitArs } from "../lib/expenses";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const addDays = (iso: string, n: number) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
type Draft = ExpenseLineInput & { id: string | null };
const emptyLine = (date: string): Draft => ({
  id: null, date, category: "Meal", people: 1, supplierName: "", supplierTaxId: "", voucherType: "B", voucherNumber: "", amount: 0, liters: null, detail: "", purchaseInvoiceId: null
});

/** Rendición de gastos de una semana: se va cargando durante el viaje y se aprueba al final. */
export function FinanceExpenseReportPage() {
  const { id = "" } = useParams();
  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [candidates, setCandidates] = useState<{ id: string; supplierName: string; formattedNumber: string; total: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getExpenseReport(id).then(setReport).catch((err) => setError(err.message));
    api.listVehicles().then(setVehicles).catch(() => setVehicles([]));
    api.listServiceOrders().then(setOrders).catch(() => setOrders([]));
    api.getBnaRate("billete").then((r) => setUsdRate(r.current?.sell ?? null)).catch(() => setUsdRate(null));
  }, [id]);
  useEffect(() => {
    if (draft?.voucherType !== "A") return setCandidates([]);
    api.listExpensePurchaseCandidates(draft.supplierTaxId, draft.supplierTaxId ? "" : draft.supplierName).then(setCandidates).catch(() => setCandidates([]));
  }, [draft?.voucherType, draft?.supplierTaxId, draft?.supplierName]);

  const run = async (action: () => Promise<ExpenseReport | void>, done?: string) => {
    setError(null);
    setMsg(null);
    try {
      const r = await action();
      if (r) setReport(r);
      if (done) setMsg(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar.");
    }
  };

  const rate = report?.status === "Approved" ? report.usdRate ?? null : usdRate;
  const overLimit = (l: Pick<ExpenseLine, "category" | "people" | "amount">) => {
    if (!report || !rate) return null;
    const limit = expenseLimitArs(report.policy, l, rate);
    return limit != null && l.amount > limit ? limit : null;
  };
  const alerts = useMemo(() => (report?.lines ?? []).filter((l) => overLimit(l) != null).length, [report, rate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!report) return <div className="card pad">{error ?? "Cargando rendición…"}</div>;
  const open = report.status === "Open";
  const header = { employeeId: report.employeeId, weekStart: report.weekStart, vehicleId: report.vehicleId, serviceOrderId: report.serviceOrderId, notes: report.notes };
  const days = Array.from({ length: 7 }, (_, i) => addDays(report.weekStart, i));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · RENDICIÓN DE GASTOS</span>
          <h1>{report.number} · {report.employeeName}</h1>
          <p className="muted">Semana del {day(report.weekStart)} al {day(days[6])} · {open ? "Abierta: se puede seguir cargando" : `Aprobada${report.approvedBy ? ` por ${report.approvedBy}` : ""}`}</p>
        </div>
        <div className="toolbar">
          <Link className="btn ghost" to="/finanzas/billeteras">← Billeteras</Link>
          <Link className="btn ghost" to={`/finanzas/rendiciones/${report.id}/imprimir`}>🖨️ Planilla</Link>
          {open ? (
            <button type="button" className="btn" disabled={report.lines.length === 0 || report.problems.length > 0}
              onClick={() => (alerts === 0 || window.confirm(`${alerts} gasto(s) superan el tope. ¿Aprobar igual?`)) && void run(() => api.approveExpenseReport(report.id, rate), "✓ Rendición aprobada: los gastos salieron de la billetera.")}>
              ✓ Aprobar
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={() => window.confirm("¿Reabrir? Los gastos vuelven a la billetera y se anulan los pagos de las facturas A.") && void run(() => api.reopenExpenseReport(report.id), "✓ Rendición reabierta.")}>Reabrir</button>
          )}
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}
      {open && report.problems.length > 0 && (
        <div className="alert"><b>Para aprobar falta:</b><ul style={{ margin: "4px 0 0 18px" }}>{report.problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
      )}

      <div className="kpi kpi-4">
        <div className="card pad"><span className="muted">Total rendido</span><strong style={{ display: "block", fontSize: "1.4rem" }}>$ {money(report.total)}</strong></div>
        <div className="card pad"><span className="muted">Anticipos / reposiciones de la semana</span><strong style={{ display: "block", fontSize: "1.4rem" }}>$ {money(report.advancesTotal)}</strong></div>
        <div className="card pad"><span className="muted">Saldo de la billetera</span><strong style={{ display: "block", fontSize: "1.4rem" }}>$ {money(report.walletBalance)}</strong></div>
        <div className="card pad"><span className="muted">{open ? "Saldo al aprobar" : "Topes al dólar"}</span>
          <strong style={{ display: "block", fontSize: "1.4rem", color: open && report.balanceAfter < 0 ? "var(--danger, #b42318)" : undefined }}>
            {open ? `$ ${money(report.balanceAfter)}` : rate ? `$ ${money(rate)}` : "—"}
          </strong>
          {open && <small className="muted">Dólar billete BNA: {rate ? `$ ${money(rate)}` : "no disponible"}</small>}
        </div>
      </div>

      <div className="card pad row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ maxWidth: 170 }}>Semana (lunes)<input type="date" disabled={!open} value={report.weekStart.slice(0, 10)}
          onChange={(e) => e.target.value && void run(() => api.updateExpenseReport(report.id, { ...header, weekStart: `${e.target.value}T00:00:00Z` }))} /></label>
        <label style={{ minWidth: 200 }}>Vehículo
          <select disabled={!open} value={report.vehicleId ?? ""} onChange={(e) => void run(() => api.updateExpenseReport(report.id, { ...header, vehicleId: e.target.value || null }))}>
            <option value="">Sin vehículo</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label} · {v.brand} {v.model}</option>)}
          </select>
        </label>
        <label style={{ minWidth: 260 }}>Orden de servicio
          <select disabled={!open} value={report.serviceOrderId ?? ""} onChange={(e) => void run(() => api.updateExpenseReport(report.id, { ...header, serviceOrderId: e.target.value || null }))}>
            <option value="">Sin orden de servicio</option>
            {orders.filter((o) => o.id === report.serviceOrderId || o.people.some((p) => p.id === report.employeeId)).map((o) => <option key={o.id} value={o.id}>{o.code} · {o.customerName}</option>)}
          </select>
        </label>
      </div>

      <div className="card pad stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Gastos</h3>
          {open && !draft && <button type="button" className="btn compact" onClick={() => setDraft(emptyLine(report.lines.at(-1)?.date.slice(0, 10) ?? report.weekStart.slice(0, 10)))}>＋ Gasto</button>}
        </div>
        <table style={{ fontSize: "0.86rem" }}>
          <thead><tr><th>Fecha</th><th>Categoría</th><th>Proveedor</th><th>Comprobante</th><th style={{ textAlign: "right" }}>Importe</th><th /></tr></thead>
          <tbody>
            {report.lines.map((l) => {
              const limit = overLimit(l);
              return (
                <tr key={l.id}>
                  <td>{day(l.date)}</td>
                  <td>{l.categoryName}{l.people > 1 ? ` · ${l.people} pers.` : ""}{l.liters ? ` · ${l.liters} l` : ""}</td>
                  <td>{l.supplierName}{l.supplierTaxId && <div className="muted" style={{ fontSize: "0.74rem" }}>{l.supplierTaxId}</div>}</td>
                  <td>{EXPENSE_VOUCHERS[l.voucherType]} {l.voucherNumber}
                    {l.voucherType === "A" && <div style={{ fontSize: "0.74rem", color: l.purchaseInvoiceId ? "#047857" : "#b42318" }}>{l.purchaseInvoiceId ? `Compras ${l.purchaseInvoiceNumber}` : "Falta vincular en Compras"}</div>}
                  </td>
                  <td style={{ textAlign: "right" }}>$ {money(l.amount)}
                    {limit != null && <div style={{ fontSize: "0.74rem", color: "#b45309" }}>⚠ supera el tope ($ {money(limit)})</div>}
                  </td>
                  <td className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                    {open && <>
                      <button type="button" className="btn ghost compact" onClick={() => setDraft({ ...l, date: l.date.slice(0, 10), id: l.id })}>Editar</button>
                      <button type="button" className="btn ghost compact" onClick={() => window.confirm("¿Quitar este gasto?") && void run(() => api.deleteExpenseLine(report.id, l.id))}>✕</button>
                    </>}
                  </td>
                </tr>
              );
            })}
            {report.lines.length === 0 && <tr><td colSpan={6} className="muted">Todavía no hay gastos cargados.</td></tr>}
          </tbody>
        </table>

        {draft && (
          <form className="stack" style={{ gap: 8, borderTop: "1px solid var(--border, #e2e8f0)", paddingTop: 10 }} onSubmit={(e) => {
            e.preventDefault();
            const { id: lineId, ...body } = draft;
            void run(async () => {
              const r = await api.saveExpenseLine(report.id, lineId, { ...body, date: `${draft.date}T00:00:00Z` });
              setDraft(lineId ? null : { ...emptyLine(draft.date), category: draft.category });
              return r;
            });
          }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ maxWidth: 150 }}>Fecha<input type="date" min={days[0]} max={days[6]} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required /></label>
              <label style={{ minWidth: 170 }}>Categoría
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as ExpenseCategory })}>
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {["Meal", "Snack", "Lodging"].includes(draft.category) && (
                <label style={{ maxWidth: 90 }}>Personas<input type="number" min={1} max={20} value={draft.people} onChange={(e) => setDraft({ ...draft, people: Number(e.target.value) || 1 })} /></label>
              )}
              <label style={{ minWidth: 200 }}>Proveedor<input value={draft.supplierName} onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })} required /></label>
              <label style={{ maxWidth: 150 }}>CUIT<input value={draft.supplierTaxId ?? ""} onChange={(e) => setDraft({ ...draft, supplierTaxId: e.target.value })} placeholder="opcional" /></label>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ minWidth: 150 }}>Comprobante
                <select value={draft.voucherType} onChange={(e) => setDraft({ ...draft, voucherType: e.target.value as ExpenseVoucherType, purchaseInvoiceId: null })}>
                  {Object.entries(EXPENSE_VOUCHERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={{ maxWidth: 150 }}>Número<input value={draft.voucherNumber ?? ""} onChange={(e) => setDraft({ ...draft, voucherNumber: e.target.value })} placeholder="122-10827" /></label>
              <label style={{ maxWidth: 150 }}>Importe<input type="number" step="0.01" min="0.01" value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} required /></label>
              {draft.category === "Fuel" && <label style={{ maxWidth: 110 }}>Litros<input type="number" step="0.01" value={draft.liters ?? ""} onChange={(e) => setDraft({ ...draft, liters: e.target.value ? Number(e.target.value) : null })} /></label>}
              <label style={{ minWidth: 200 }}>Detalle<input value={draft.detail ?? ""} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} placeholder="opcional" /></label>
            </div>
            {draft.voucherType === "A" && (
              <label style={{ maxWidth: 520 }}>Factura en Compras (para el crédito de IVA)
                <select value={draft.purchaseInvoiceId ?? ""} onChange={(e) => {
                  const c = candidates.find((x) => x.id === e.target.value);
                  setDraft({ ...draft, purchaseInvoiceId: e.target.value || null, amount: c ? c.total : draft.amount });
                }}>
                  <option value="">Sin vincular: registrala en Compras o importá Mis Comprobantes</option>
                  {draft.purchaseInvoiceId && !candidates.some((c) => c.id === draft.purchaseInvoiceId) && <option value={draft.purchaseInvoiceId}>Vinculada actualmente</option>}
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.supplierName} · {c.formattedNumber} · $ {money(c.total)}</option>)}
                </select>
              </label>
            )}
            {overLimit(draft) != null && <div style={{ color: "#b45309", fontSize: "0.82rem" }}>⚠ Supera el tope de $ {money(overLimit(draft)!)}: se puede cargar igual y se avisa al aprobar.</div>}
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn">{draft.id ? "Guardar" : "Agregar"}</button>
              <button type="button" className="btn ghost" onClick={() => setDraft(null)}>{draft.id ? "Cancelar" : "Terminar"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
