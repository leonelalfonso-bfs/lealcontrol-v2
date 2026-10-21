import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CompanySettings } from "../api/types";
import type { Withholding } from "../api/types/finance";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cuit = (s: string) => { const d = s.replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : s; };
const cell = { border: "1px solid #999", padding: "4px 8px" } as const;

/** Certificado de retención de Ganancias (RG 830) que se entrega al proveedor con la orden de pago. */
export function FinanceWithholdingCertificatePage() {
  const { id = "" } = useParams();
  const [w, setW] = useState<Withholding | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getWithholding(id).then(setW).catch((err) => setError(err.message));
    api.getCompanySettings().then(setCompany).catch(() => setCompany(null));
  }, [id]);
  if (!w) return <div className="card pad">{error ?? "Cargando certificado…"}</div>;

  return (
    <div className="page-wide" style={{ maxWidth: 820, margin: "0 auto", paddingBottom: 60 }}>
      <div className="no-print toolbar" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <Link className="btn ghost" to="/finanzas/retenciones">← Retenciones</Link>
        <button type="button" className="btn" onClick={() => window.print()}>🖨️ Imprimir</button>
      </div>
      <div style={{ border: "1px solid #333", padding: 24, background: "#fff", color: "#111", fontSize: "0.88rem" }}>
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: "1.05rem" }}>CERTIFICADO DE RETENCIÓN · IMPUESTO A LAS GANANCIAS</div>
        <div style={{ textAlign: "center", marginBottom: 14 }}>RG (AFIP) 830 · N.º {w.certificateNumber}{w.status !== "Active" ? " · ANULADO" : ""}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <tbody>
            <tr><td style={cell}><b>Agente de retención</b></td><td style={cell}>{company?.legalName ?? "—"} · CUIT {company ? cuit(company.documentNumber) : "—"}</td></tr>
            <tr><td style={cell}><b>Domicilio</b></td><td style={cell}>{[company?.fiscalStreet, company?.fiscalCity, company?.fiscalProvince].filter(Boolean).join(", ") || "—"}</td></tr>
            <tr><td style={cell}><b>Sujeto retenido</b></td><td style={cell}>{w.supplierName} · CUIT {cuit(w.supplierTaxId)} · {w.condition === "NoInscripto" ? "No inscripto" : "Inscripto"}</td></tr>
            <tr><td style={cell}><b>Régimen</b></td><td style={cell}>{w.regimeCode} · {w.regimeName}</td></tr>
            <tr><td style={cell}><b>Fecha · comprobante</b></td><td style={cell}>{w.date.slice(0, 10).split("-").reverse().join("/")} · Orden de pago {w.paymentOrderNumber} por $ {money(w.paymentAmount)}</td></tr>
          </tbody>
        </table>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {w.condition !== "NoInscripto" && <>
              <tr><td style={cell}>Pagos anteriores del mes (sin IVA)</td><td style={{ ...cell, textAlign: "right" }}>$ {money(w.priorBase)}</td></tr>
              <tr><td style={cell}>Este pago (sin IVA)</td><td style={{ ...cell, textAlign: "right" }}>$ {money(w.base)}</td></tr>
              <tr><td style={cell}>Mínimo no sujeto a retención</td><td style={{ ...cell, textAlign: "right" }}>− $ {money(w.nonTaxableAmount)}</td></tr>
              <tr><td style={cell}>Base sujeta a retención</td><td style={{ ...cell, textAlign: "right" }}>$ {money(w.priorBase + w.base - w.nonTaxableAmount)}</td></tr>
              <tr><td style={cell}>Retenido anteriormente en el mes</td><td style={{ ...cell, textAlign: "right" }}>$ {money(w.priorWithheld)}</td></tr>
            </>}
            {w.condition === "NoInscripto" && <tr><td style={cell}>Base sujeta a retención</td><td style={{ ...cell, textAlign: "right" }}>$ {money(w.base)}</td></tr>}
            <tr><td style={cell}>Alícuota</td><td style={{ ...cell, textAlign: "right" }}>{w.rate} %</td></tr>
            <tr style={{ fontWeight: 800 }}><td style={cell}>IMPORTE RETENIDO</td><td style={{ ...cell, textAlign: "right" }}>$ {money(w.amount)}</td></tr>
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 50 }}>
          <div style={{ width: 260, borderTop: "1px solid #333", textAlign: "center", paddingTop: 3 }}>Firma y aclaración del agente de retención</div>
        </div>
      </div>
    </div>
  );
}
