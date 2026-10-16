import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CompanySettings, WorkCertificate } from "../api/types";
import { TERMINATION_CAUSES } from "../lib/payrollLabels";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const cuit = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : s;
};
const cell = { border: "1px solid #999", padding: "3px 6px" } as const;
const KIND: Record<string, string> = { Monthly: "Mensual", Sac: "Aguinaldo", Final: "Liquidación final" };

/** Certificado de trabajo del art. 80 LCT (Ley 27.802): se entrega dentro de los 45 días hábiles del egreso. */
export function WorkCertificatePrintPage() {
  const { id = "" } = useParams();
  const [data, setData] = useState<WorkCertificate | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getWorkCertificate(id).then(setData).catch((err) => setError(err.message));
    api.getCompanySettings().then(setCompany).catch(() => setCompany(null));
  }, [id]);

  if (!data) return <div className="card pad">{error ?? "Cargando certificado…"}</div>;
  const e = data.employee;
  const totals = data.periods.reduce((t, p) => ({ rem: t.rem + p.remunerative, ss: t.ss + p.employeeSocialSecurity, emp: t.emp + p.employer }), { rem: 0, ss: 0, emp: 0 });

  return (
    <div className="page-wide" style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 60 }}>
      <div className="no-print toolbar" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <Link className="btn ghost" to={`/rrhh/liquidaciones/${id}`}>← Volver a la liquidación</Link>
        <button type="button" className="btn" onClick={() => window.print()}>🖨️ Imprimir</button>
      </div>
      <div style={{ border: "1px solid #333", padding: 24, fontSize: "0.85rem", color: "#111", background: "#fff" }}>
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: "1.05rem", marginBottom: 14 }}>CERTIFICADO DE TRABAJO (art. 80 LCT)</div>
        <p style={{ margin: "0 0 10px" }}>
          <b>{company?.legalName ?? "—"}</b>, CUIT {company ? cuit(company.documentNumber) : "—"}, con domicilio en{" "}
          {[company?.fiscalStreet, company?.fiscalCity, company?.fiscalProvince].filter(Boolean).join(", ") || "—"}, certifica que:
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <tbody>
            <tr><td style={cell}><b>Trabajador</b></td><td style={cell}>{e.name}</td><td style={cell}><b>CUIL</b></td><td style={cell}>{cuit(e.cuil)}</td></tr>
            <tr><td style={cell}><b>Ingreso</b></td><td style={cell}>{day(e.hireDate)}</td><td style={cell}><b>Egreso</b></td><td style={cell}>{day(e.terminationDate)}</td></tr>
            <tr><td style={cell}><b>Función</b></td><td style={cell}>{e.jobTitle || "—"}</td><td style={cell}><b>Convenio / categoría</b></td><td style={cell}>{e.agreement ? `${e.agreement} — ${e.category ?? ""}` : "Fuera de convenio"}</td></tr>
            <tr><td style={cell}><b>Jornada</b></td><td style={cell}>{e.partTime ? `Tiempo parcial${e.weeklyHours ? `, ${e.weeklyHours} h semanales` : ""}` : "Jornada completa"}</td><td style={cell}><b>Causa del egreso</b></td><td style={cell}>{TERMINATION_CAUSES[data.run.terminationCause ?? ""] ?? "—"}</td></tr>
          </tbody>
        </table>
        <p style={{ margin: "0 0 6px" }}>Capacitaciones realizadas: ............................................................................................................</p>
        <p style={{ margin: "10px 0 6px", fontWeight: 700 }}>Remuneraciones liquidadas y aportes y contribuciones ingresados</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#eee" }}>
              <th style={cell}>Período</th><th style={cell}>Liquidación</th><th style={cell}>Remunerativo</th><th style={cell}>No remunerativo</th>
              <th style={cell}>Aportes del trabajador</th><th style={cell}>Contribuciones</th>
            </tr>
          </thead>
          <tbody>
            {data.periods.map((p, i) => (
              <tr key={i}>
                <td style={cell}>{String(p.month).padStart(2, "0")}/{p.year}</td><td style={cell}>{KIND[p.kind] ?? p.kind}</td>
                <td style={{ ...cell, textAlign: "right" }}>{money(p.remunerative)}</td><td style={{ ...cell, textAlign: "right" }}>{money(p.nonRemunerative)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{money(p.employeeSocialSecurity)}</td><td style={{ ...cell, textAlign: "right" }}>{money(p.employer)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 800 }}>
              <td style={cell} colSpan={2}>Totales</td><td style={{ ...cell, textAlign: "right" }}>{money(totals.rem)}</td><td style={cell} />
              <td style={{ ...cell, textAlign: "right" }}>{money(totals.ss)}</td><td style={{ ...cell, textAlign: "right" }}>{money(totals.emp)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ margin: "10px 0 0", fontSize: "0.78rem" }}>
          Los períodos anteriores a los liquidados en este sistema y la constancia de ingreso de los aportes pueden consultarse en
          ARCA (Mis Aportes) y ANSES. Se entrega dentro del plazo de 45 días hábiles del art. 80 de la LCT.
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 50, gap: 40 }}>
          <div style={{ flex: 1, borderTop: "1px solid #333", textAlign: "center", paddingTop: 3 }}>Firma y aclaración del empleador</div>
          <div style={{ flex: 1, borderTop: "1px solid #333", textAlign: "center", paddingTop: 3 }}>Recibí: firma del trabajador y fecha</div>
        </div>
      </div>
    </div>
  );
}
