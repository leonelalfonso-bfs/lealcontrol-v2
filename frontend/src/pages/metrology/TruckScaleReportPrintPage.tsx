import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings, CustomerDetail } from "../../api/types";
import type { TruckScaleReport, TruckScaleVerdict } from "../../api/types/truckScale";

// Estilo del paquete "Informes BFS" (aprobado): naranja BFS, gris oscuro, verde conforme, rojo no conforme.
const ORANGE = "#F07020";
const DARK = "#3C3C3C";
const MID = "#6B6B6B";
const LIGHT = "#F2F2F2";
const OK = { bg: "#E3F1DA", fg: "#2E6B1F" };
const BAD = { bg: "#FCE8E6", fg: "#A1271B" };
const WARN = { bg: "#FFF1E0", fg: "#9A5B00" };

const es = (n: number | null | undefined, dec = 0) => (n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, 2) }));
const pct = (v: number) => `${es(v * 100, 1)} %`;
const day = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const cuit = (s?: string | null) => { const d = (s ?? "").replace(/\D/g, ""); return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : s || "—"; };

const td: CSSProperties = { border: "1px solid #CFCFCF", padding: "3px 6px", verticalAlign: "middle" };
const th: CSSProperties = { ...td, background: DARK, color: "#fff", fontWeight: 700, textAlign: "center", textTransform: "none", letterSpacing: "normal", fontSize: "inherit" };
const center: CSSProperties = { ...td, textAlign: "center" };
const label: CSSProperties = { ...td, background: LIGHT, fontWeight: 700, width: "22%" };

const verdictCell = (v: TruckScaleVerdict) => {
  const style = v === "Satisface" ? { background: OK.bg, color: OK.fg, fontWeight: 700 } : v === "NoSatisface" ? { background: BAD.bg, color: BAD.fg, fontWeight: 700 }
    : v === "NoEnsayado" ? { background: WARN.bg, color: WARN.fg } : { color: MID };
  const text = v === "Satisface" ? "Satisface" : v === "NoSatisface" ? "No satisface" : v === "NoEnsayado" ? "No ensayado" : "No aplica";
  return <td style={{ ...center, ...style }}>{text}</td>;
};
const mark = (pass: boolean) => <td style={{ ...center, fontWeight: 700, background: pass ? OK.bg : BAD.bg, color: pass ? OK.fg : BAD.fg }}>{pass ? "✓" : "✗"}</td>;

function Section({ n, title, right, children, breakBefore }: { n: number | string; title: string; right?: string; children: ReactNode; breakBefore?: boolean }) {
  return (
    <section style={{ marginTop: 14, breakBefore: breakBefore ? "page" : undefined, breakInside: "avoid-page" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `2px solid ${ORANGE}`, marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: "11.5pt", color: DARK, textTransform: "uppercase" }}><span style={{ color: ORANGE }}>{n}.</span> {title}</h2>
        {right && <span style={{ fontWeight: 700, fontSize: "9pt", color: DARK }}>{right}</span>}
      </div>
      {children}
    </section>
  );
}
const Table = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8.6pt", ...style }}>{children}</table>
);

/** Informe de calibración de báscula camionera con el formato BFS (impresión a PDF desde el navegador). */
export function TruckScaleReportPrintPage() {
  const { id = "" } = useParams();
  const [r, setR] = useState<TruckScaleReport | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getTruckScaleReport(id).then((report) => {
      setR(report);
      if (report.customerId) api.getCustomer(report.customerId).then(setCustomer).catch(() => setCustomer(null));
      if (report.approvedByUserId) api.signatoryImageUrl(report.approvedByUserId).then(setSignature).catch(() => setSignature(null));
    }).catch((err) => setError(err.message));
    api.getCompanySettings().then(setCompany).catch(() => setCompany(null));
  }, [id]);

  if (!r) return <div className="card pad">{error ?? "Cargando informe…"}</div>;
  const ev = r.evaluation;
  const d = r.data;
  const i = d.instrument;
  const eq = r.equipment;
  const u = i.unit;
  const is25 = ev.standard === "25/2025";
  const issued = r.reportStatus === "Issued";
  const conforming = ev.conforming;
  const companyName = company?.legalName ?? "";
  const address = [company?.fiscalStreet, company?.fiscalPostalCode ? `(${company.fiscalPostalCode}) ${company?.fiscalCity ?? ""}` : company?.fiscalCity, company?.fiscalProvince].filter(Boolean).join(" – ");
  const customerAddress = customer?.fiscalAddress ? [customer.fiscalAddress.street, customer.fiscalAddress.city, customer.fiscalAddress.province].filter(Boolean).join(" – ") : r.location;
  const footer = `${companyName} · Informe N° ${r.number} · ${customer?.legalName ?? r.customerName} · ${ev.standardShort} · ${r.procedureCode}`;
  const rolling = d.eccentricity?.method === "rodante";
  const positions = ev.eccentricity;
  const bands = ev.mpeBands;

  return (
    <div className="bfs-report-page">
      <style>{`
        @page { size: A4; margin: 12mm 12mm 16mm 12mm; @bottom-left { content: "${footer.replace(/"/g, "'")}"; font: 7pt Arial; color: #6B6B6B; } @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7pt Arial; color: #6B6B6B; } }
        .bfs-report { font-family: Arial, Helvetica, sans-serif; color: ${DARK}; background: #fff; max-width: 186mm; margin: 0 auto; font-size: 9pt; position: relative; }
        .bfs-report .watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.045; pointer-events: none; z-index: 0; }
        .bfs-report > table.frame { width: 100%; border-collapse: collapse; position: relative; z-index: 1; }
        .bfs-report td, .bfs-report th { border-bottom-color: #CFCFCF; }
        .bfs-report tr:hover td { background: inherit; }
        .bfs-report > table.frame > thead > tr > td, .bfs-report > table.frame > tbody > tr > td { padding: 0; border: 0; }
        @media print { .no-print { display: none !important; } .bfs-report-page { padding: 0 !important; } }
      `}</style>
      <div className="no-print toolbar" style={{ justifyContent: "space-between", margin: "0 auto 16px", maxWidth: "186mm" }}>
        <Link className="btn ghost" to={`/metrologia/informes/camionera/${r.id}`}>← Informe</Link>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {!issued && <span style={{ color: WARN.fg, fontWeight: 700 }}>BORRADOR: todavía no está emitido</span>}
          <button type="button" className="btn" onClick={() => window.print()}>🖨️ Imprimir / guardar PDF</button>
        </div>
      </div>

      <div className="bfs-report">
        {company?.logoUrl && <div className="watermark"><img src={company.logoUrl} alt="" style={{ width: "70%" }} /></div>}
        <table className="frame">
          <thead>
            <tr><td>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 6, marginBottom: 8, borderBottom: `1px solid #DDD` }}>
                {company?.logoUrl && <img src={company.logoUrl} alt={companyName} style={{ height: 58, maxWidth: 150, objectFit: "contain" }} />}
                <div style={{ flex: 1, fontSize: "7.6pt", lineHeight: 1.35 }}>
                  <div style={{ fontWeight: 700, fontSize: "11pt" }}>{companyName}</div>
                  <div style={{ color: MID }}>{address}</div>
                  <div style={{ color: MID }}>{company?.phone ? `Tel. ${company.phone} · ` : ""}CUIT {cuit(company?.documentNumber)}</div>
                  <div style={{ color: MID }}>{company?.email}</div>
                  {company?.website && <div style={{ color: ORANGE, fontWeight: 700 }}>{company.website}</div>}
                </div>
                <div style={{ background: DARK, color: "#fff", padding: "6px 14px", textAlign: "center", minWidth: 170 }}>
                  <div style={{ fontSize: "7.5pt", fontWeight: 700 }}>INFORME DE CALIBRACIÓN</div>
                  <div style={{ fontSize: "13pt", fontWeight: 700 }}>N° {r.number}</div>
                  <div style={{ fontSize: "7pt" }}>Báscula camionera · Tag {eq.code}</div>
                </div>
              </div>
            </td></tr>
          </thead>
          <tbody><tr><td>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "15pt", fontWeight: 700 }}>INFORME DE CALIBRACIÓN</div>
              <div style={{ color: MID, marginBottom: 8 }}>Báscula para vehículos (camionera) – {ev.standardShort}</div>
            </div>
            <Table>
              <thead><tr>{["Fecha de ensayo", "Fecha de emisión", "Próxima calibración", "Resultado"].map((t) => <th key={t} style={{ ...center, background: LIGHT, fontWeight: 700 }}>{t}</th>)}</tr></thead>
              <tbody><tr>
                <td style={{ ...center, fontWeight: 700, fontSize: "10pt" }}>{day(r.calibrationDate)}</td>
                <td style={{ ...center, fontWeight: 700, fontSize: "10pt" }}>{issued ? day(r.approvedAtUtc) : "Borrador"}</td>
                <td style={{ ...center, fontWeight: 700, fontSize: "10pt" }}>{day(r.nextCalibrationDate)}</td>
                <td style={{ ...center, fontWeight: 700, fontSize: "10pt", background: conforming ? OK.bg : BAD.bg, color: conforming ? OK.fg : BAD.fg }}>{conforming ? "CONFORME" : "NO CONFORME"}</td>
              </tr></tbody>
            </Table>

            <Section n={1} title="Datos del usuario">
              <Table><tbody>
                <tr><td style={label}>Razón social</td><td style={td}>{customer?.legalName ?? r.customerName}</td></tr>
                <tr><td style={label}>CUIT</td><td style={td}>{cuit(customer?.documentNumber)}</td></tr>
                <tr><td style={label}>Domicilio</td><td style={td}>{customerAddress || "—"}</td></tr>
                <tr><td style={label}>Servicio / Remito</td><td style={td}>Servicio N° {r.serviceNumber}{r.remitoNumber ? `  ·  Remito ${r.remitoNumber}` : ""}{r.orderReference ? `  ·  ${r.orderReference}` : ""}</td></tr>
              </tbody></Table>
            </Section>

            <Section n={2} title="Datos del instrumento">
              <Table><tbody>
                {[
                  ["Tipo", "Báscula para vehículos (camionera)", "Tag / ubicación", `${eq.code} – ${eq.location || r.location}`],
                  ["Indicador (marca / modelo)", `${eq.indicator1Brand || "—"} / ${eq.indicator1Model || "—"}`, "N° de serie indicador", eq.indicator1SerialNumber || "—"],
                  ["Receptor (marca / modelo)", `${eq.brand || "—"} / ${eq.model || "—"}`, "Módulos / apoyos", `${i.modules || "—"} / ${i.supports || "—"}`],
                  ["Capacidad máxima (Máx.)", `${es(i.max)} ${u}`, "División de verificación (e)", `${es(i.e)} ${u}`],
                  [`Capacidad mínima (${ev.minCapacityRule})`, `${es(ev.minCapacity)} ${u}`, "Clase de exactitud", i.accuracyClass],
                  ["Aprobación de modelo", eq.platformApprovalCode || eq.approvalCode || "—", "Indicación", i.indication === "digital" ? "Digital" : "Analógica"]
                ].map((row) => <tr key={row[0]}><td style={label}>{row[0]}</td><td style={td}>{row[1]}</td><td style={label}>{row[2]}</td><td style={td}>{row[3]}</td></tr>)}
              </tbody></Table>
            </Section>

            <Section n={3} title="Ensayo">
              <Table><tbody>
                <tr><td style={label}>Ensayo realizado por</td><td style={td}>{r.performedBy}</td></tr>
                <tr><td style={label}>Norma aplicada</td><td style={td}>{ev.standardName}</td></tr>
                <tr><td style={label}>Procedimiento interno</td><td style={td}>{r.procedureCode}</td></tr>
                <tr><td style={label}>Errores máximos tolerados</td><td style={td}>En servicio, clase {i.accuracyClass}: hasta {es(bands[0])} e → ± 1 e;  hasta {es(bands[1])} e → ± 2 e;  mayor → ± 3 e  (e = {es(i.e)} {u})</td></tr>
                <tr><td style={label}>Método</td><td style={td}>{ev.usesSubstitution && d.substitution
                  ? `Pesas patrón certificadas hasta ${es(ev.maxWeightsApplied)} ${u} y carga de sustitución (${d.substitution.description.toLowerCase()}, ${es(d.substitution.value)} ${u}).`
                  : "Pesas patrón certificadas."}</td></tr>
              </tbody></Table>
            </Section>

            <Section n={4} title="Patrones utilizados">
              <Table>
                <thead><tr>{["Masa nominal", "Cant.", "Total", "Identificación", "Certificado", "Vencimiento"].map((t) => <th key={t} style={th}>{t}</th>)}</tr></thead>
                <tbody>
                  {d.weights.map((w, k) => (
                    <tr key={k}><td style={center}>{es(w.mass)} {u}</td><td style={center}>{w.quantity}</td><td style={center}>{es(w.mass * w.quantity)} {u}</td>
                      <td style={td}>{w.identification}</td><td style={center}>{w.certificate}</td><td style={center}>{day(w.expiration)}</td></tr>
                  ))}
                  <tr><td colSpan={2} style={{ ...td, background: LIGHT, fontWeight: 700 }}>Masa total de patrones</td><td style={{ ...center, background: LIGHT, fontWeight: 700 }}>{es(ev.totalStandardsMass)} {u}</td>
                    <td colSpan={3} style={{ ...td, background: LIGHT, color: MID }}>{i.max ? pct(ev.totalStandardsMass / i.max) : "—"} de la capacidad máxima</td></tr>
                </tbody>
              </Table>
            </Section>

            {d.inspection.length > 0 && (
              <Section n={5} title="Inspección del instrumento">
                <Table>
                  <thead><tr><th style={th}>Punto</th><th style={th}>Estado</th><th style={th}>Punto</th><th style={th}>Estado</th></tr></thead>
                  <tbody>
                    {Array.from({ length: Math.ceil(d.inspection.length / 2) }, (_, k) => {
                      const half = Math.ceil(d.inspection.length / 2);
                      const cells = [d.inspection[k], d.inspection[k + half]];
                      return (
                        <tr key={k}>
                          {cells.map((it, j) => it ? [
                            <td key={`p${j}`} style={td}>{it.point}</td>,
                            <td key={`s${j}`} style={{ ...center, fontWeight: 700, ...(it.status === "OK" ? { background: OK.bg, color: OK.fg } : it.status === "No OK" ? { background: BAD.bg, color: BAD.fg } : { color: MID }) }}>{it.status}</td>
                          ] : [<td key={`p${j}`} style={td} />, <td key={`s${j}`} style={td} />])}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
                {d.inspection.some((it) => it.observation) && (
                  <p style={{ fontSize: "8pt", color: MID, margin: "4px 0 0" }}>Observaciones: {d.inspection.filter((it) => it.observation).map((it) => `${it.point}: ${it.observation}`).join(" · ")}</p>
                )}
              </Section>
            )}

            <Section n={6} title="Verificación de requisitos" right={ev.standardShort} breakBefore>
              <Table>
                <thead><tr><th style={th}>Párrafo</th><th style={th}>Requisito</th><th style={th}>Resultado</th></tr></thead>
                <tbody>{ev.requirements.map((q) => <tr key={q.key}><td style={center}>{q.paragraph}</td><td style={td}>{q.name}</td>{verdictCell(q.verdict)}</tr>)}</tbody>
              </Table>
            </Section>

            <Section n={7} title="Ensayo de pesaje (cargas crecientes y decrecientes)">
              <Table>
                <thead><tr>{[`Carga de ensayo (${u})`, "Pesas patrón", "Carga de sustitución", "Lectura asc.", "Error asc.", "Lectura desc.", "Error desc.", "E.M.T.", "Result."].map((t) => <th key={t} style={th}>{t}</th>)}</tr></thead>
                <tbody>
                  {ev.weighing.map((s, k) => (
                    <tr key={k}>
                      <td style={{ ...center, fontWeight: 700 }}>{es(s.load)}</td><td style={{ ...center, color: MID }}>{es(s.weights)}</td><td style={{ ...center, color: MID }}>{s.substitution ? es(s.substitution) : "—"}</td>
                      <td style={center}>{es(s.ascending)}</td><td style={center}>{es(s.ascendingError)}</td><td style={center}>{s.descending == null ? "—" : es(s.descending)}</td>
                      <td style={center}>{s.descendingError == null ? "—" : es(s.descendingError)}</td><td style={{ ...center, color: MID }}>± {es(s.mpe)}</td>{mark(s.pass)}
                    </tr>
                  ))}
                </tbody>
              </Table>
              {ev.usesSubstitution && d.substitution && (
                <>
                  <div style={{ fontWeight: 700, margin: "8px 0 4px" }}>Carga de sustitución</div>
                  <Table>
                    <thead><tr><th style={th}>Concepto</th><th style={th}>Valor</th><th style={th}>{is25 ? "Condición 3.7.3" : "Referencia (Res. 25/2025, 3.7.3)"}</th></tr></thead>
                    <tbody>
                      <tr><td style={td}>Carga de sustitución utilizada</td><td style={center}>{d.substitution.description}: {es(d.substitution.value)} {u}</td><td style={{ ...td, color: MID }}>Valor asignado por comparación con pesas</td></tr>
                      <tr><td style={td}>Masa máxima de pesas patrón aplicada</td><td style={center}>{es(ev.maxWeightsApplied)} {u} ({pct(ev.weightsFraction)} de Máx.)</td>
                        <td style={{ ...td, color: MID }}>Mínimo requerido: {ev.requiredWeightsFraction === 0.5 ? "50 %" : ev.requiredWeightsFraction === 0.2 ? "1/5" : "1/3"} de Máx.</td></tr>
                      <tr><td style={td}>Repetibilidad con carga ≈ sustitución</td><td style={center}>{ev.repeatabilitySpread == null ? "—" : `${es(ev.repeatabilitySpread)} ${u} (${es(ev.repeatabilitySpread / i.e, 1)} e)`}</td>
                        <td style={{ ...td, color: MID }}>≤ 0,2 e → 1/5 · ≤ 0,3 e → 1/3 · otro → 1/2</td></tr>
                      <tr><td style={td}>Carga máxima ensayada</td><td style={center}>{es(ev.maxLoad)} {u} ({pct(ev.rangeFraction)} de Máx.)</td><td style={{ ...td, color: MID }}>{is25 ? "A.4.4.5: sustituir hasta Máx." : "Rango de uso habitual"}</td></tr>
                    </tbody>
                  </Table>
                  <p style={{ fontSize: "7.8pt", fontStyle: "italic", color: MID, margin: "4px 0 0" }}>
                    La carga de sustitución se coloca hasta la misma indicación obtenida con las pesas y luego se le agregan las pesas patrón en escalones.
                    {ev.repeatabilitySpread === 0 ? " La repetibilidad se determinó con la indicación digital (d = e); para justificar ≤ 0,2 e se recomienda el método del punto de cambio (A.4.4.3)." : ""}
                  </p>
                </>
              )}
            </Section>

            <Section n={8} title="Repetibilidad y puesta a cero">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  {d.repeatability && d.repeatability.readings.length > 0 ? (
                    <>
                      <div style={{ fontWeight: 700 }}>Repetibilidad / fidelidad <span style={{ fontWeight: 400, color: MID }}>(carga {es(d.repeatability.load)} {u} · E.M.T. ± {es(ev.repeatabilityMpe)})</span></div>
                      <Table>
                        <thead><tr>{["Pesada", "Lectura", "Error", "Result."].map((t) => <th key={t} style={th}>{t}</th>)}</tr></thead>
                        <tbody>
                          {d.repeatability.readings.map((l, k) => <tr key={k}><td style={center}>{k + 1}</td><td style={center}>{es(l)}</td><td style={center}>{es(l - d.repeatability!.load)}</td>{mark(Math.abs(l - d.repeatability!.load) <= (ev.repeatabilityMpe ?? 0))}</tr>)}
                          <tr><td colSpan={2} style={{ ...td, background: LIGHT, fontWeight: 700 }}>Diferencia máx. – mín.</td><td style={{ ...center, background: LIGHT, fontWeight: 700 }}>{es(ev.repeatabilitySpread)}</td>
                            {mark(ev.requirements.find((q) => q.key === "rep")?.verdict === "Satisface")}</tr>
                        </tbody>
                      </Table>
                    </>
                  ) : <p style={{ color: WARN.fg }}>Repetibilidad: no ensayada.</p>}
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>Puesta a cero <span style={{ fontWeight: 400, color: MID }}>(4 % de Máx. = {es(0.04 * i.max)} {u})</span></div>
                  <Table>
                    <thead><tr>{["Ensayo", "Resultado", "Result."].map((t) => <th key={t} style={th}>{t}</th>)}</tr></thead>
                    <tbody>
                      <tr><td style={td}>Pone a cero con 4 % de Máx.</td><td style={center}>{d.zero?.at4Percent == null ? "No ensayado" : d.zero.at4Percent ? "Sí" : "No"}</td>
                        {d.zero?.at4Percent == null ? <td style={{ ...center, color: MID }}>—</td> : mark(d.zero.at4Percent)}</tr>
                      <tr><td style={td}>Con 4 % de Máx. + 1 e</td><td style={center}>{d.zero?.at4PercentPlusE == null ? "No ensayado" : d.zero.at4PercentPlusE ? "Sí" : "No"}</td>
                        {d.zero?.at4PercentPlusE == null ? <td style={{ ...center, color: MID }}>—</td> : mark(!d.zero.at4PercentPlusE)}</tr>
                      {is25 && <tr><td style={td}>Error de puesta a cero (E0)</td><td style={center}>{d.zero?.zeroErrorE == null ? "No determinado" : `${es(d.zero.zeroErrorE, 2)} e`}</td>
                        {d.zero?.zeroErrorE == null ? <td style={{ ...center, color: MID }}>—</td> : mark(Math.abs(d.zero.zeroErrorE) <= 0.25)}</tr>}
                    </tbody>
                  </Table>
                </div>
              </div>
            </Section>

            <Section n={9} title="Excentricidad" right={rolling ? "Carga rodante por tercios" : "Carga por apoyo"} breakBefore>
              {d.eccentricity && positions.length > 0 ? (
                <>
                  <p style={{ margin: "0 0 6px" }}>{rolling
                    ? `Carga de ensayo: vehículo de ${es(d.eccentricity.load)} ${u} (${pct(d.eccentricity.load / i.max)} de Máx.; máximo admitido 0,8 Máx. = ${es(0.8 * i.max)} ${u}), aplicado en los tres tercios del receptor —inicio, centro y final— en el sentido normal de circulación y luego en sentido inverso, determinando cero antes de cambiar de sentido (Res. 25/2025, 3.6.2.4 y A.4.7.4). E.M.T. ± ${es(ev.eccentricityMpe)} ${u}.`
                    : is25 ? `Carga de ensayo: ${es(d.eccentricity.load)} ${u} sobre cada apoyo (Res. 25/2025, 3.6.2.2: 1/(n−1) de Máx. = ${es(i.max / Math.max(1, i.supports - 1))} ${u}). E.M.T. ± ${es(ev.eccentricityMpe)} ${u}.`
                      : `Carga de ensayo: ${es(d.eccentricity.load)} ${u} de pesas patrón sobre cada uno de los ${i.supports} apoyos (Res. 2307/80, 13.4.2.1: 1/n de Máx. = ${es(i.max / Math.max(1, i.supports))} ${u}). E.M.T. ± ${es(ev.eccentricityMpe)} ${u}.`}</p>
                  <p style={{ textAlign: "center", fontStyle: "italic", color: MID, fontSize: "8pt", margin: "4px 0" }}>
                    {rolling ? "Croquis del receptor de carga (vista en planta, sentido normal de circulación de izquierda a derecha)" : "Croquis de la plataforma (vista en planta)"}
                  </p>
                  {(() => {
                    const cell = (p?: (typeof positions)[number]) => p ? (
                      <td style={{ ...center, padding: "10px 4px", background: p.pass ? OK.bg : BAD.bg }}>
                        <div style={{ fontWeight: 700 }}>{p.position}</div>
                        <div style={{ fontSize: "8pt" }}>Lectura {es(p.reading)} {u}</div>
                        <div style={{ fontSize: "8pt" }}>Error {es(p.error)} <b style={{ color: p.pass ? OK.fg : BAD.fg }}>{p.pass ? "✓" : "✗"}</b></div>
                      </td>
                    ) : <td style={td} />;
                    if (rolling) {
                      const rows = d.eccentricity!.rows ?? ["Ida  →", "Vuelta  ←"];
                      return (
                        <Table>
                          <thead><tr>{["Sentido", "1.er tercio (inicio)", "2.º tercio (centro)", "3.er tercio (final)"].map((t) => <th key={t} style={th}>{t}</th>)}</tr></thead>
                          <tbody>{Array.from({ length: Math.ceil(positions.length / 3) }, (_, k) => (
                            <tr key={k}><td style={{ ...center, background: LIGHT, fontWeight: 700, width: "16%" }}>{rows[k] ?? `Pasada ${k + 1}`}</td>{[0, 1, 2].map((j) => <td key={j} style={{ padding: 0, border: "1px solid #CFCFCF" }}><Table style={{ fontSize: "inherit" }}><tbody><tr>{cell(positions[k * 3 + j])}</tr></tbody></Table></td>)}</tr>
                          ))}</tbody>
                        </Table>
                      );
                    }
                    const cols = Math.ceil(positions.length / 2);
                    return (
                      <Table>
                        <tbody>
                          <tr>{Array.from({ length: cols }, (_, k) => <td key={k} style={{ padding: 0, border: "1px solid #CFCFCF" }}><Table style={{ fontSize: "inherit" }}><tbody><tr>{cell(positions[k])}</tr></tbody></Table></td>)}</tr>
                          <tr>{Array.from({ length: cols }, (_, k) => <td key={k} style={{ padding: 0, border: "1px solid #CFCFCF" }}><Table style={{ fontSize: "inherit" }}><tbody><tr>{cell(positions[cols + k])}</tr></tbody></Table></td>)}</tr>
                        </tbody>
                      </Table>
                    );
                  })()}
                  <p style={{ fontSize: "7.8pt", fontStyle: "italic", color: MID, margin: "4px 0 0" }}>Ubicación de las cargas según croquis. El error se calcula como lectura − carga aplicada.</p>
                </>
              ) : <p style={{ color: WARN.fg }}>Excentricidad: no ensayada.</p>}
            </Section>

            {!(is25 && i.indication === "digital") && d.mobility.length > 0 && (
              <Section n="9 bis" title="Movilidad">
                <Table>
                  <thead><tr>{["Carga", "Lectura", "Lectura + 1,4 e", "Result."].map((t) => <th key={t} style={th}>{t}</th>)}</tr></thead>
                  <tbody>{d.mobility.map((m, k) => <tr key={k}><td style={center}>{es(m.load)}</td><td style={center}>{es(m.reading)}</td><td style={center}>{es(m.readingAfter)}</td>{mark(m.readingAfter - m.reading >= i.e)}</tr>)}</tbody>
                </Table>
              </Section>
            )}

            <Section n={10} title="Conclusión">
              {ev.observations.length > 0 && <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>{ev.observations.map((o) => <li key={o} style={{ marginBottom: 2 }}>{o}</li>)}</ul>}
              <div style={{ background: conforming ? OK.bg : BAD.bg, borderLeft: `4px solid ${conforming ? OK.fg : BAD.fg}`, padding: "8px 12px" }}>
                <b style={{ color: conforming ? OK.fg : BAD.fg }}>Conclusión: </b>
                {conforming ? `El instrumento SATISFACE los requisitos de la ${ev.standardShort} para los ensayos realizados.` : `El instrumento NO SATISFACE los requisitos de la ${ev.standardShort}. Ver ensayos marcados como "No satisface".`}
                <span style={{ color: MID }}>  Próxima calibración: {day(r.nextCalibrationDate)}.</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 30, breakInside: "avoid" }}>
                <div style={{ fontSize: "8.5pt" }}>
                  <div style={{ fontWeight: 700 }}>Ensayo realizado por</div>
                  <div>{r.performedBy}</div>
                  <div style={{ color: MID }}>{company?.fiscalCity ?? ""}{issued ? `, ${day(r.approvedAtUtc)}` : ""}</div>
                </div>
                <div style={{ width: 230, textAlign: "center" }}>
                  {signature ? <img src={signature} alt="Firma" style={{ maxHeight: 70, maxWidth: 200, objectFit: "contain" }} /> : <div style={{ height: 60 }} />}
                  <div style={{ borderTop: `1px solid ${DARK}`, paddingTop: 3, fontSize: "8pt" }}>
                    {issued && r.approvedBy ? <><b>{r.approvedBy}</b><br /></> : null}Firma del responsable técnico
                  </div>
                </div>
              </div>
            </Section>

            <Section n="" title="Anexo – Procedimiento y referencias" breakBefore>
              <div style={{ fontWeight: 700, margin: "4px 0" }}>Ensayos realizados</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Inspección visual del instrumento y de la instalación (plataforma, celdas, cajas de suma, fosa, indicador y precintos).</li>
                <li>Ensayo de pesaje con cargas crecientes y decrecientes{is25 ? " (al menos cinco valores de carga, 8.3.3)" : ""}.</li>
                <li>{is25 ? "Repetibilidad: serie de al menos tres pesadas de la misma carga (A.4.10); la diferencia entre resultados no debe superar el E.M.T. para esa carga (3.6.1)."
                  : "Fidelidad: pesadas repetidas de la misma carga; la diferencia entre resultados no debe superar el E.M.T. (14.1.2)."}</li>
                <li>{is25 ? "Excentricidad (básculas para vehículos): el vehículo más pesado y concentrado de uso habitual, sin superar 0,8 Máx., se aplica en los tres tercios del receptor —inicio, centro y final— en el sentido normal de circulación y luego en sentido inverso (3.6.2.4, A.4.7.4)."
                  : "Excentricidad: carga de pesas patrón igual a 1/n de la capacidad máxima, aplicada sucesivamente sobre cada uno de los n apoyos del receptor (13.4.2.1)."}</li>
                <li>Puesta a cero: debe operar hasta el 4 % de Máx. y no por encima{is25 ? "; exactitud de puesta a cero ≤ 0,25 e (4.5.2, A.4.2.3)." : " (A.3.2.2)."}</li>
              </ul>
              {ev.usesSubstitution && (
                <>
                  <div style={{ fontWeight: 700, margin: "8px 0 4px" }}>Ensayo de pesaje con material de sustitución</div>
                  <ol style={{ margin: 0, paddingLeft: 18 }}>
                    <li>Se aplican las pesas patrón desde cero hasta la cantidad máxima disponible, registrando el error en cada escalón.</li>
                    <li>Se retiran las pesas y se coloca la carga de sustitución (camión o material) hasta obtener la misma indicación.</li>
                    <li>Sobre la carga de sustitución se vuelven a aplicar las pesas en escalones, registrando el error.</li>
                    <li>Se repite hasta el rango requerido y se descarga en sentido inverso para las lecturas descendentes.</li>
                  </ol>
                  <p style={{ fontSize: "7.8pt", fontStyle: "italic", color: MID }}>Res. 25/2025, 3.7.3: las pesas patrón deben representar al menos el 50 % de Máx.; 1/3 si la repetibilidad es ≤ 0,3 e; 1/5 si es ≤ 0,2 e (determinada con una carga ≈ la de sustitución, colocada tres veces).</p>
                </>
              )}
              <div style={{ fontWeight: 700, margin: "8px 0 4px" }}>Referencias</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>{ev.standardName}.</li>
                {is25 ? <li>Ley 19.511 de Metrología Legal, art. 9 – verificación periódica de instrumentos en uso.</li>
                  : <li>Res. SIC N° 25/2025 (reemplaza a la Res. 2307/80; los instrumentos en uso pueden seguir bajo la norma anterior hasta 10 años desde su publicación, art. 6).</li>}
                <li>OIML R 76-1:2006 – Non-automatic weighing instruments.</li>
                <li>EURAMET Calibration Guide No. 18, v4.0 – Calibración de instrumentos de pesar no automáticos (cargas de sustitución, §4.3.3).</li>
              </ul>
            </Section>
          </td></tr></tbody>
        </table>
      </div>
    </div>
  );
}
