import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CompanySettings, ServiceOrder, ServiceOrderItem } from "../api/types";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { num, rangeText, serviceOrderStatusLabel } from "../lib/fleet";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";

const cell: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };

/** Informe de servicio imprimible: qué se pidió, qué se hizo, con qué y quiénes; con lugar para las firmas. */
export function FleetServiceOrderReportPage() {
  const { id } = useParams<{ id: string }>();
  const { settings } = useDocumentTemplate();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [items, setItems] = useState<ServiceOrderItem[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getServiceOrder(id), api.listServiceOrderItems(id), api.getCompanySettings().catch(() => null)])
      .then(([o, i, c]) => { setOrder(o); setItems(i); setCompany(c); })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const download = async () => {
    const element = document.getElementById("service-report-sheet");
    if (!element || !order) return;
    setDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set({
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `Informe_${order.code}.pdf`,
        image: { type: "jpeg" as const, quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["css", "legacy"] }
      }).from(element).save();
    } finally {
      setDownloading(false);
    }
  };

  if (error) return <div className="workspace-page"><div className="alert">{error}</div></div>;
  if (!order) return <div className="workspace-page"><p className="muted">Cargando informe…</p></div>;

  const primary = settings.global.primaryColor;
  const companyName = company?.tradeName || company?.legalName || "";
  const address = [company?.fiscalStreet, company?.fiscalCity, company?.fiscalProvince].filter(Boolean).join(", ");

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: 20 }}>
      <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Link to={`/flota/ordenes/${order.id}`} className="btn btn-outline">← Volver a la orden</Link>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>🖨 Imprimir</button>
          <button type="button" className="btn" disabled={downloading} onClick={() => void download()}>{downloading ? "Generando…" : "📥 Descargar PDF"}</button>
        </div>
      </div>

      <div id="service-report-sheet" style={{ maxWidth: "210mm", margin: "0 auto", background: "#fff", color: "#1e293b", padding: "12mm", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 11 }}>
        <table style={{ width: "100%", borderBottom: `2px solid ${primary}`, paddingBottom: 8, marginBottom: 12 }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: "top" }}>
                {company?.logoUrl && <img src={company.logoUrl} alt="" style={{ maxHeight: 48, maxWidth: 160, marginBottom: 4 }} crossOrigin="anonymous" />}
                <div style={{ fontWeight: 700, fontSize: 14 }}>{companyName}</div>
                <div>{company?.documentNumber ? `CUIT ${company.documentNumber}` : ""}</div>
                <div>{address}</div>
                <div>{[company?.phone, company?.email].filter(Boolean).join(" · ")}</div>
              </td>
              <td style={{ textAlign: "right", verticalAlign: "top" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: primary }}>INFORME DE SERVICIO</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{order.code}</div>
                <div>Estado: {serviceOrderStatusLabel(order.status)}</div>
                {order.salesOrderNumber && <div>Pedido {order.salesOrderNumber}</div>}
                {order.remitoNumber && <div>Remito {order.remitoNumber}</div>}
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <tbody>
            <tr><td style={{ ...cell, width: "22%", fontWeight: 700 }}>Cliente</td><td style={cell}>{order.customerName}</td></tr>
            {order.location && <tr><td style={{ ...cell, fontWeight: 700 }}>Lugar</td><td style={cell}>{order.location}</td></tr>}
            <tr><td style={{ ...cell, fontWeight: 700 }}>Fecha y horario</td><td style={cell}>{rangeText(order.start, order.end)}</td></tr>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Técnicos</td><td style={cell}>{order.people.map((p) => p.label).join(", ") || "—"}</td></tr>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Unidades</td><td style={cell}>{order.vehicles.map((v) => v.label).join(", ") || "—"}</td></tr>
          </tbody>
        </table>

        <h4 style={{ margin: "10px 0 4px", color: primary }}>Trabajo solicitado</h4>
        <p style={{ margin: 0, whiteSpace: "pre-line" }}>{order.description}</p>

        <h4 style={{ margin: "12px 0 4px", color: primary }}>Trabajo realizado</h4>
        <p style={{ margin: 0, whiteSpace: "pre-line", minHeight: order.workPerformed ? undefined : 60 }}>{order.workPerformed || ""}</p>

        {order.observations && (
          <>
            <h4 style={{ margin: "12px 0 4px", color: primary }}>Observaciones</h4>
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>{order.observations}</p>
          </>
        )}

        {items.length > 0 && (
          <>
            <h4 style={{ margin: "12px 0 4px", color: primary }}>Repuestos y materiales</h4>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={cell}>Código</th><th style={cell}>Descripción</th><th style={{ ...cell, textAlign: "right" }}>Cantidad</th><th style={cell}>N° de serie</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td style={cell}>{i.code || "—"}</td>
                    <td style={cell}>{i.description}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{num(i.quantity, 3)} {i.unit}</td>
                    <td style={cell}>{i.serialNumbers || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <table style={{ width: "100%", marginTop: 48, pageBreakInside: "avoid" }}>
          <tbody>
            <tr>
              <td style={{ width: "45%", borderTop: "1px solid #94a3b8", paddingTop: 4, textAlign: "center" }}>Firma del técnico</td>
              <td style={{ width: "10%" }}></td>
              <td style={{ width: "45%", borderTop: "1px solid #94a3b8", paddingTop: 4, textAlign: "center" }}>Firma, aclaración y DNI del cliente</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
