import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import html2pdf from "html2pdf.js";
import { api } from "../api/client";
import { EmailComposer } from "../components/EmailComposer";
import {
  currencyMeta,
  type Contact,
  type CustomerDetail,
  type Location,
  type Quote
} from "../api/types";

export const QuotePrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [deliveryLocation, setDeliveryLocation] = useState<Location | null>(null);
  const [assignedContact, setAssignedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const loadQuoteData = async () => {
      try {
        setLoading(true);
        const q = await api.getQuote(id);
        setQuote(q);

        if (q.customerId) {
          const cust = await api.getCustomer(q.customerId);
          setCustomer(cust);

          if (q.locationId) {
            const loc = cust.locations.find((l) => l.id === q.locationId);
            if (loc) setDeliveryLocation(loc);
          }

          if (q.contactId) {
            const con = cust.contacts.find((c) => c.id === q.contactId);
            if (con) setAssignedContact(con);
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al cargar vista de impresión");
      } finally {
        setLoading(false);
      }
    };

    loadQuoteData();
  }, [id]);

  const handleDownloadPdf = () => {
    const element = document.getElementById("quote-pdf-sheet");
    if (!element || !quote) return;

    try {
      setDownloadingPdf(true);
      const filename = `Presupuesto_${quote.quoteNumber}_rev${quote.revision}.pdf`;

      const opt = {
        margin: [5, 5, 5, 5] as [number, number, number, number],
        filename,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["avoid-all", "css"] }
      };

      html2pdf()
        .set(opt)
        .from(element)
        .save()
        .then(() => setDownloadingPdf(false))
        .catch((err: unknown) => {
          console.error(err);
          setDownloadingPdf(false);
        });
    } catch (err: unknown) {
      console.error(err);
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif", color: "#64748b" }}>
        Cargando documento comercial de presupuesto...
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div style={{ padding: "40px", color: "#ef4444", fontFamily: "sans-serif" }}>
        Error: {error || "Presupuesto no encontrado"}
      </div>
    );
  }

  const curr = currencyMeta[quote.currency] ?? { label: quote.currency, detail: "", symbol: "$" };
  const subtotal = quote.subtotal;
  const globalDiscountAmount = (subtotal * quote.discountPercent) / 100;
  const netSubtotal = subtotal - globalDiscountAmount;
  const estimatedVat = netSubtotal * 0.21;
  const grandTotal = quote.total > 0 ? quote.total : netSubtotal + estimatedVat;

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: "20px" }}>
      {/* Top Action Bar */}
      <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => navigate(`/presupuestos/${id}/editar`)}
          style={{ padding: "8px 16px", borderRadius: "6px", background: "white", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600 }}
        >
          ← Volver a Editar
        </button>

        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={() => setShowEmail(true)}>✉ Enviar por email</button>
          {showEmail && <EmailComposer context={{ entityType: "Quote", entityId: quote.id, to: assignedContact?.email || customer?.email || undefined, subject: `Presupuesto ${quote.quoteNumber} rev.${quote.revision}`, body: `Hola,\n\nAdjuntamos los datos del presupuesto ${quote.quoteNumber}, revisión ${quote.revision}, por un total de ${curr.symbol} ${grandTotal.toLocaleString("es-AR")}.\n\nQuedamos atentos a su confirmación.\n` }} onClose={() => setShowEmail(false)} />}
          <button
            type="button"
            disabled={downloadingPdf}
            onClick={handleDownloadPdf}
            style={{
              padding: "8px 20px",
              borderRadius: "6px",
              background: "linear-gradient(180deg, #1aaa97, #128c7e)",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 4px 12px rgba(18, 140, 126, 0.3)"
            }}
          >
            {downloadingPdf ? "Generando..." : "📥 Descargar PDF"}
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            style={{ padding: "8px 16px", borderRadius: "6px", background: "#3b82f6", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}
          >
            🖨️ Imprimir
          </button>
        </div>
      </div>

      {/* Main A4 Document Sheet - Targeted by html2pdf.js */}
      <div
        id="quote-pdf-sheet"
        className="print-container"
        style={{
          width: "200mm",
          height: "auto",
          background: "white",
          margin: "0 auto",
          padding: "12mm 12mm",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
          fontFamily: "Helvetica, Arial, sans-serif",
          color: "#333333",
          fontSize: "11.5px",
          lineHeight: "1.45",
          boxSizing: "border-box"
        }}
      >
        {/* Header Section */}
        <div style={{ borderBottom: "2px solid #3b82f6", paddingBottom: "10px", marginBottom: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "25%", verticalAlign: "top" }}>
                  <img src="/logo.png?v=2" alt="Leal Control ERP" style={{ maxHeight: "60px", width: "auto" }} />
                </td>
                <td style={{ width: "45%", verticalAlign: "top", paddingLeft: "15px" }}>
                  <h1 style={{ margin: 0, fontSize: "17px", color: "#3b82f6" }}>LEAL CONTROL ERP S.A.</h1>
                  <p style={{ margin: "2px 0", fontSize: "10.5px", color: "#64748b" }}>Sistemas Comerciales, Industriales & Metrología</p>
                  <p style={{ margin: "1px 0", fontSize: "10.5px", color: "#64748b" }}>CUIT: 30-71548962-9 | contacto@lealcontrol.com</p>
                  <p style={{ margin: "1px 0", fontSize: "10.5px", color: "#64748b" }}>www.lealcontrol.com</p>
                </td>
                <td style={{ width: "30%", verticalAlign: "top", textAlign: "right" }}>
                  <h2 style={{ margin: 0, fontSize: "19px", color: "#1e293b", letterSpacing: "0.5px" }}>PRESUPUESTO</h2>
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "#3b82f6", marginTop: "2px" }}>
                    N° {quote.quoteNumber} <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: "normal" }}>rev.{quote.revision}</span>
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "3px" }}>
                    Fecha: <strong>{new Date(quote.createdAtUtc).toLocaleDateString("es-AR")}</strong>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Client & Location Data */}
        <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "6px", marginBottom: "12px", border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "55%", verticalAlign: "top" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase", marginBottom: "3px" }}>
                    CLIENTE / DESTINATARIO (DATOS FISCALES)
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>
                    {customer?.legalName || "Cliente Generico"}
                  </div>
                  {customer?.tradeName && (
                    <div style={{ fontSize: "10.5px", color: "#475569" }}>Nombre Fantasía: {customer.tradeName}</div>
                  )}
                  <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                    CUIT: <strong>{customer?.documentNumber || "—"}</strong> | IVA: {customer?.taxCondition || "Responsable Inscripto"}
                  </div>
                  {customer?.fiscalAddress && (
                    <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                      {customer.fiscalAddress.street}, {customer.fiscalAddress.city}, {customer.fiscalAddress.province}
                    </div>
                  )}
                </td>
                <td style={{ width: "45%", verticalAlign: "top", textAlign: "right", borderLeft: "1px dashed #cbd5e1", paddingLeft: "12px" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase", marginBottom: "3px" }}>
                    LUGAR DE ENTREGA / ATENCIÓN
                  </div>
                  {deliveryLocation ? (
                    <>
                      <div style={{ fontSize: "11.5px", fontWeight: "bold", color: "#0f172a" }}>{deliveryLocation.name}</div>
                      <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                        {deliveryLocation.address.street}, {deliveryLocation.address.city}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: "10.5px", color: "#64748b" }}>Casa Central / Domicilio Fiscal del Cliente</div>
                  )}
                  {assignedContact && (
                    <div style={{ fontSize: "10.5px", color: "#334155", marginTop: "3px" }}>
                      <strong>Atención a:</strong> {assignedContact.name} ({assignedContact.role})
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section Title: Oferta Comercial */}
        <div style={{ background: "#3b82f6", color: "white", padding: "5px 10px", fontWeight: "bold", fontSize: "11px", borderRadius: "4px 4px 0 0", letterSpacing: "0.5px", textTransform: "uppercase" }}>
          OFERTA COMERCIAL
        </div>

        {/* Lines Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", fontSize: "9.5px", textTransform: "uppercase", color: "#475569" }}>
              <th style={{ padding: "6px 5px", textAlign: "center", width: "5%" }}>#</th>
              <th style={{ padding: "6px 5px", textAlign: "left", width: "45%" }}>Descripción del Artículo / Servicio</th>
              <th style={{ padding: "6px 5px", textAlign: "center", width: "8%" }}>Cant.</th>
              <th style={{ padding: "6px 5px", textAlign: "right", width: "14%" }}>Precio U. ({curr.symbol})</th>
              <th style={{ padding: "6px 5px", textAlign: "center", width: "8%" }}>Desc.</th>
              <th style={{ padding: "6px 5px", textAlign: "center", width: "6%" }}>IVA</th>
              <th style={{ padding: "6px 5px", textAlign: "right", width: "14%" }}>Total ({curr.symbol})</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((line, idx) => (
              <tr key={line.id} style={{ borderBottom: "1px solid #e2e8f0", opacity: line.isOptional ? 0.65 : 1 }}>
                <td style={{ padding: "6px 5px", textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                <td style={{ padding: "6px 5px" }}>
                  <strong>{line.description}</strong>
                  {line.isOptional && <span style={{ color: "#d97706", fontWeight: "bold", marginLeft: "6px" }}>(OPCIONAL)</span>}
                </td>
                <td style={{ padding: "6px 5px", textAlign: "center" }}>{line.quantity}</td>
                <td style={{ padding: "6px 5px", textAlign: "right", fontFamily: "monospace" }}>
                  {line.unitPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: "6px 5px", textAlign: "center", color: line.discountPercent > 0 ? "#16a34a" : "#94a3b8" }}>
                  {line.discountPercent > 0 ? `${line.discountPercent}%` : "—"}
                </td>
                <td style={{ padding: "6px 5px", textAlign: "center" }}>{line.taxRate}%</td>
                <td style={{ padding: "6px 5px", textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                  {line.isOptional ? "—" : line.lineSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Table */}
        <div style={{ marginLeft: "auto", width: "45%", marginBottom: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "3px 0", textAlign: "right", color: "#64748b" }}>SUBTOTAL {curr.label}:</td>
                <td style={{ padding: "3px 0", textAlign: "right", width: "45%", fontFamily: "monospace" }}>
                  {curr.symbol} {subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              {quote.discountPercent > 0 && (
                <tr>
                  <td style={{ padding: "3px 0", textAlign: "right", color: "#16a34a" }}>
                    DESCUENTO GLOBAL ({quote.discountPercent}%):
                  </td>
                  <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", color: "#16a34a" }}>
                    - {curr.symbol} {globalDiscountAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              <tr>
                <td style={{ padding: "3px 0", textAlign: "right", color: "#64748b" }}>IVA ESTIMADO (21%):</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace" }}>
                  {curr.symbol} {estimatedVat.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr style={{ borderTop: "3px solid #3b82f6" }}>
                <td style={{ padding: "6px 0 0 0", textAlign: "right", fontWeight: "bold", fontSize: "13px", color: "#3b82f6" }}>
                  TOTAL PROPUESTA:
                </td>
                <td style={{ padding: "6px 0 0 0", textAlign: "right", fontWeight: "bold", fontSize: "13px", color: "#3b82f6", fontFamily: "monospace" }}>
                  {curr.symbol} {grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Currency Exchange Rate Legend Box */}
        {quote.currency !== "ARS" && (
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "8px 10px", marginBottom: "12px", fontSize: "10.5px", color: "#1e3a8a" }}>
            <div>
              <strong>
                Tipo de cambio de referencia: $ {quote.currency === "USD_BILLETE" ? quote.exchangeRateUsdBillete : quote.exchangeRateUsdDivisa} ARS —{" "}
                {quote.currency === "USD_BILLETE" ? "USD Billete BNA (cotización vendedor)" : "USD Divisa BNA Mayorista (cotización vendedor)"}.
              </strong>
            </div>
            <div style={{ marginTop: "3px", color: "#475569" }}>
              Los importes en dólares se cotizan según la tasa de referencia BNA indicada. El valor final en pesos se definirá al momento de la facturación/cobro.
            </div>
          </div>
        )}

        {/* Commercial Conditions Box */}
        <div style={{ borderTop: "2px solid #3b82f6", paddingTop: "8px" }}>
          <div style={{ fontWeight: "bold", color: "#3b82f6", textTransform: "uppercase", fontSize: "11px", marginBottom: "5px" }}>
            Condiciones Comerciales:
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
            <tbody>
              <tr>
                <td style={{ width: "50%", padding: "2px 0", verticalAlign: "top" }}>
                  <strong style={{ color: "#64748b" }}>Plazo de entrega:</strong> {quote.deliveryTimeDays ? `${quote.deliveryTimeDays} días hábiles` : "—"}
                </td>
                <td style={{ width: "50%", padding: "2px 0", verticalAlign: "top" }}>
                  <strong style={{ color: "#64748b" }}>Medio de Pago:</strong> {quote.paymentMethod || "Transferencia Bancaria"}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "2px 0", verticalAlign: "top" }}>
                  <strong style={{ color: "#64748b" }}>Condiciones de pago:</strong> {quote.paymentTerms || "50% anticipo, saldo contra entrega"}
                </td>
                <td style={{ padding: "2px 0", verticalAlign: "top" }}>
                  <strong style={{ color: "#64748b" }}>Transporte:</strong> {quote.transportation || "Flete a cargo del comprador"}
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ padding: "2px 0", verticalAlign: "top" }}>
                  <strong style={{ color: "#64748b" }}>Garantía:</strong> {quote.warranty || "12 meses de garantía oficial por defectos de fabricación"}
                </td>
              </tr>
            </tbody>
          </table>

          {quote.notes && (
            <div style={{ background: "#fef9c3", borderLeft: "3px solid #eab308", padding: "6px 8px", marginTop: "6px", fontSize: "10.5px", color: "#713f12" }}>
              <strong>Notas:</strong> {quote.notes}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", marginTop: "10px", paddingTop: "6px", fontSize: "9.5px", color: "#94a3b8" }}>
            <div>Este presupuesto tiene una validez de {quote.validDays} días desde su fecha de emisión.</div>
            <div>Desarrollado por Leal Control ERP Cloud</div>
          </div>
        </div>
      </div>
    </div>
  );
};
