import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CompanySettings, PayslipDetail } from "../api/types";
import { amountInWords } from "../lib/numberWords";
import { todayAr } from "../lib/dates";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const cuit = (s: string) => (s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : s);
const cell = { border: "1px solid #999", padding: "3px 6px" } as const;

/** Recibo de haberes con los requisitos del art. 140 LCT, en original y duplicado (nota 68, S3). */
export function PayslipPrintPage() {
  const { id = "", pid = "" } = useParams();
  const [data, setData] = useState<PayslipDetail | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [signedAt, setSignedAt] = useState(todayAr());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => api.getPayslip(id, pid).then(setData).catch((err) => setError(err.message));
  useEffect(() => { void load(); api.getCompanySettings().then(setCompany).catch(() => setCompany(null)); }, [id, pid]);

  if (!data) return <div className="card pad">{error ?? "Cargando recibo…"}</div>;
  const { run, payslip: p, intact } = data;
  const closed = run.status === "Closed";
  const lines = p.lines.filter((l) => l.kind !== "Employer").sort((a, b) => a.order - b.order);
  const period = `${String(run.month).padStart(2, "0")}/${run.year}`;

  const sign = async () => {
    setError(null);
    try {
      await api.markPayslipSigned(id, pid, signedAt);
      setMsg("✓ Recibo marcado como firmado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la firma.");
    }
  };

  const copy = (label: string) => (
    <div style={{ border: "1px solid #333", padding: 14, fontSize: "0.78rem", color: "#111", background: "#fff", breakInside: "avoid", marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>{company?.legalName ?? "—"}</div>
          <div>CUIT {company ? cuit(company.documentNumber) : "—"}</div>
          <div>{[company?.fiscalStreet, company?.fiscalCity, company?.fiscalProvince].filter(Boolean).join(", ")}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800 }}>RECIBO DE HABERES — {label}</div>
          <div>Período: {period}{run.kind === "Sac" ? ` · Aguinaldo ${run.month === 6 ? "1.er" : "2.º"} semestre` : ""}</div>
          <div>Fecha de pago: {day(run.paymentDate)}</div>
          <div>Lugar de pago: {company?.fiscalCity ?? "—"}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
        <tbody>
          <tr>
            <td style={cell}><b>Apellido y nombre:</b> {p.employeeName}</td>
            <td style={cell}><b>CUIL:</b> {cuit(p.cuil)}</td>
            <td style={cell}><b>Legajo:</b> {p.fileNumber}</td>
          </tr>
          <tr>
            <td style={cell}><b>Convenio / categoría:</b> {p.agreement || "Fuera de convenio"}{p.category ? ` — ${p.category}` : ""}</td>
            <td style={cell}><b>Ingreso:</b> {day(p.hireDate)}</td>
            <td style={cell}><b>Remuneración asignada:</b> $ {money(p.assignedSalary)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
        <thead>
          <tr style={{ background: "#eee" }}>
            <th style={cell}>Cód.</th><th style={{ ...cell, textAlign: "left" }}>Concepto</th><th style={cell}>Cant.</th>
            <th style={cell}>Haberes c/aportes</th><th style={cell}>Haberes s/aportes</th><th style={cell}>Descuentos</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td style={cell}>{l.code}</td>
              <td style={cell}>{l.name}{l.detail ? <span style={{ color: "#555" }}> · {l.detail}</span> : null}</td>
              <td style={{ ...cell, textAlign: "right" }}>{l.quantity ? l.quantity : ""}</td>
              <td style={{ ...cell, textAlign: "right" }}>{l.kind === "Remunerative" ? money(l.amount) : ""}</td>
              <td style={{ ...cell, textAlign: "right" }}>{l.kind === "NonRemunerative" ? money(l.amount) : ""}</td>
              <td style={{ ...cell, textAlign: "right" }}>{l.kind === "Deduction" ? money(l.amount) : ""}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 800 }}>
            <td style={cell} colSpan={3}>Totales</td>
            <td style={{ ...cell, textAlign: "right" }}>{money(p.remunerative)}</td>
            <td style={{ ...cell, textAlign: "right" }}>{money(p.nonRemunerative)}</td>
            <td style={{ ...cell, textAlign: "right" }}>{money(p.deductions)}</td>
          </tr>
          <tr style={{ fontWeight: 800, fontSize: "0.9rem" }}>
            <td style={cell} colSpan={5}>NETO A COBRAR</td>
            <td style={{ ...cell, textAlign: "right" }}>$ {money(p.net)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 8 }}><b>Son pesos:</b> {amountInWords(p.net)}</div>
      <div style={{ marginTop: 4 }}>
        <b>Último depósito de aportes:</b> período {run.lastDepositPeriod ?? "—"}, fecha {day(run.lastDepositDate)}, {run.lastDepositBank ?? "—"}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 34, gap: 30 }}>
        <div style={{ flex: 1, borderTop: "1px solid #333", textAlign: "center", paddingTop: 3 }}>Firma del empleador</div>
        <div style={{ flex: 1, borderTop: "1px solid #333", textAlign: "center", paddingTop: 3 }}>
          Recibí el importe neto de esta liquidación y copia del recibo — firma del trabajador
        </div>
      </div>
      {p.contentHash && <div style={{ marginTop: 8, fontSize: "0.62rem", color: "#666", wordBreak: "break-all" }}>Huella del recibo (SHA-256): {p.contentHash}</div>}
    </div>
  );

  return (
    <div className="page-wide" style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 60 }}>
      <div className="no-print stack" style={{ gap: 10, marginBottom: 16 }}>
        <div className="toolbar" style={{ justifyContent: "space-between" }}>
          <Link className="btn ghost" to={`/rrhh/liquidaciones/${id}`}>← Volver a la liquidación</Link>
          <button type="button" className="btn" onClick={() => window.print()}>🖨️ Imprimir</button>
        </div>
        {error && <div className="alert">{error}</div>}
        {msg && <div className="alert ok">{msg}</div>}
        {!closed && <div className="alert">Borrador: la liquidación no está cerrada, este recibo todavía puede cambiar y no tiene validez.</div>}
        {closed && !intact && <div className="alert">⚠️ El contenido del recibo no coincide con la huella guardada al cerrar. Reabrí y volvé a cerrar la liquidación.</div>}
        {closed && (p.signedAtUtc ? (
          <div className="alert ok">✓ Firmado por el trabajador el {day(p.signedAtUtc)}.</div>
        ) : (
          <div className="card pad row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ maxWidth: 200 }}>Fecha de firma<input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} /></label>
            <button type="button" className="btn ghost" onClick={() => void sign()}>Marcar como firmado</button>
          </div>
        ))}
      </div>
      {copy("ORIGINAL")}
      {copy("DUPLICADO")}
    </div>
  );
}
