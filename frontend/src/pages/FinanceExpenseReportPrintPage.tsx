import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CompanySettings } from "../api/types";
import type { ExpenseCategory, ExpenseReport } from "../api/types/finance";
import { EXPENSE_CATEGORIES, EXPENSE_VOUCHERS } from "../lib/expenses";

const money = (n: number) => (n ? n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const cell = { border: "1px solid #999", padding: "3px 6px" } as const;
const num = { ...cell, textAlign: "right" as const };
const WEEKDAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sa", "Dom"];

/** Planilla de rendición de gastos FS 7.1 901 R2: días por categoría, anticipos, saldo y firmas, con el detalle de comprobantes. */
export function FinanceExpenseReportPrintPage() {
  const { id = "" } = useParams();
  const [r, setR] = useState<ExpenseReport | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getExpenseReport(id).then(setR).catch((err) => setError(err.message));
    api.getCompanySettings().then(setCompany).catch(() => setCompany(null));
  }, [id]);
  if (!r) return <div className="card pad">{error ?? "Cargando planilla…"}</div>;

  const dates = WEEKDAYS.map((_, i) => { const d = new Date(`${r.weekStart.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  const sum = (category: ExpenseCategory, date?: string) => r.lines.filter((l) => l.category === category && (!date || l.date.slice(0, 10) === date)).reduce((s, l) => s + l.amount, 0);
  const dayTotal = (date: string) => r.lines.filter((l) => l.date.slice(0, 10) === date).reduce((s, l) => s + l.amount, 0);
  const p = r.policy;

  return (
    <div className="page-wide" style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 60 }}>
      <div className="no-print toolbar" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <Link className="btn ghost" to={`/finanzas/rendiciones/${r.id}`}>← Rendición</Link>
        <button type="button" className="btn" onClick={() => window.print()}>🖨️ Imprimir</button>
      </div>
      <div style={{ border: "1px solid #333", padding: 20, background: "#fff", color: "#111", fontSize: "0.8rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>RENDICIÓN DE GASTOS</div>
          <div>{company?.legalName} · {r.number}{r.status === "Open" ? " · BORRADOR" : ""}</div>
        </div>
        <div style={{ margin: "8px 0", display: "flex", gap: 24, flexWrap: "wrap" }}>
          <span><b>Empleado:</b> {r.employeeName}</span>
          <span><b>Patente del vehículo:</b> {r.vehiclePlate ?? "—"}</span>
          <span><b>Semana:</b> {day(dates[0])} al {day(dates[6])}</span>
          {r.serviceOrderLabel && <span><b>Orden de servicio:</b> {r.serviceOrderLabel}</span>}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr><th style={cell}>DETALLE DE GASTOS</th>{WEEKDAYS.map((w, i) => <th key={w} style={cell}>{w}<div style={{ fontWeight: 400 }}>{day(dates[i]).slice(0, 5)}</div></th>)}<th style={cell}>TOTAL</th></tr>
          </thead>
          <tbody>
            {(Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[]).map((c) => (
              <tr key={c}><td style={cell}>{EXPENSE_CATEGORIES[c]}</td>{dates.map((d) => <td key={d} style={num}>{money(sum(c, d))}</td>)}<td style={{ ...num, fontWeight: 700 }}>{money(sum(c))}</td></tr>
            ))}
            <tr style={{ fontWeight: 700 }}><td style={cell}>Total rendido</td>{dates.map((d) => <td key={d} style={num}>{money(dayTotal(d))}</td>)}<td style={num}>{money(r.total)}</td></tr>
          </tbody>
        </table>
        <table style={{ width: 360, marginLeft: "auto", marginTop: 8, borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={cell}>Total rendido</td><td style={num}>$ {money(r.total) || "0,00"}</td></tr>
            <tr><td style={cell}>Anticipos / reposiciones de la semana</td><td style={num}>$ {money(r.advancesTotal) || "0,00"}</td></tr>
            <tr style={{ fontWeight: 700 }}><td style={cell}>Saldo de la billetera{r.status === "Open" ? " al aprobar" : ""}</td><td style={num}>$ {(r.status === "Open" ? r.balanceAfter : r.walletBalance).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: 10, fontSize: "0.72rem" }}>
          <b>RECORDATORIO:</b> viático de comida para una persona no podrá superar los U$D {p.mealUsd}; refrigerio para una persona, U$D {p.snackUsd};
          hospedaje para una persona, U$D {p.lodgingOneUsd}; hospedaje para dos personas, U$D {p.lodgingTwoUsd}. Tipo de cambio oficial billete vendedor del Banco Nación
          {r.usdRate ? `: $ ${r.usdRate.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : ""}.
        </div>
        <div style={{ marginTop: 12, fontWeight: 700 }}>Comprobantes</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}>
          <thead><tr><th style={cell}>Fecha</th><th style={cell}>Categoría</th><th style={cell}>Proveedor</th><th style={cell}>Comprobante</th><th style={cell}>Importe</th></tr></thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.id}><td style={cell}>{day(l.date)}</td><td style={cell}>{l.categoryName}</td><td style={cell}>{l.supplierName}</td>
                <td style={cell}>{EXPENSE_VOUCHERS[l.voucherType]} {l.voucherNumber}</td><td style={num}>{money(l.amount)}</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-around", marginTop: 50 }}>
          <div style={{ width: 260, borderTop: "1px solid #333", textAlign: "center", paddingTop: 3 }}>Firma y aclaración de quien rinde</div>
          <div style={{ width: 260, borderTop: "1px solid #333", textAlign: "center", paddingTop: 3 }}>Aprobación{r.approvedBy ? ` · ${r.approvedBy}` : ""}</div>
        </div>
        <div style={{ textAlign: "right", marginTop: 14, fontSize: "0.7rem", color: "#555" }}>FS 7.1 901 R2 Rendición de Gastos</div>
      </div>
    </div>
  );
}
