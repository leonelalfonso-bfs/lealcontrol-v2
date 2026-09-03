import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { api } from "../api/client";
import { EmailComposer } from "../components/EmailComposer";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { numberToWords } from "../utils/numberToWords";
import {
  currencyMeta,
  type Contact,
  type CustomerDetail,
  type Location,
  type Product,
  type Quote
} from "../api/types";

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith("#")) return hex || "#0d9488";
  const cleanHex = hex.replace("#", "");
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

export const QuotePrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useDocumentTemplate();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [deliveryLocation, setDeliveryLocation] = useState<Location | null>(null);
  const [assignedContact, setAssignedContact] = useState<Contact | null>(null);
  const [productsMap, setProductsMap] = useState<Record<string, Product>>({});
  const [includeTechnicalOffer, setIncludeTechnicalOffer] = useState(true);

  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const loadQuoteData = async () => {
      try {
        setLoading(true);
        const [q, prods] = await Promise.all([
          api.getQuote(id),
          api.listProducts().catch(() => [] as Product[])
        ]);

        setQuote(q);

        // Build products lookup dictionary
        const pMap: Record<string, Product> = {};
        prods.forEach((p) => {
          pMap[p.id] = p;
          if (p.code) pMap[p.code.toUpperCase()] = p;
        });
        setProductsMap(pMap);

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

  const handleDownloadPdf = async () => {
    const element = document.getElementById("quote-pdf-sheet");
    if (!element || !quote) return;

    try {
      setDownloadingPdf(true);
      const filename = `Presupuesto_${quote.quoteNumber}_rev${quote.revision}.pdf`;

      const opt = {
        margin: [4, 4, 4, 4] as [number, number, number, number],
        filename,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          onclone: (clonedDoc: Document) => {
            // Remove external stylesheet and style tags from the clone to prevent parsing errors on modern CSS features
            const styles = clonedDoc.querySelectorAll("style, link[rel='stylesheet']");
            styles.forEach((s) => s.remove());
          }
        },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["avoid-all", "css"] }
      };

      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set(opt).from(element).save();
    } catch (err: unknown) {
      console.error("Error al generar PDF:", err);
      alert("Hubo un error al generar el archivo PDF.");
    } finally {
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

  const primaryCol = settings.primaryColor || "#0d9488";
  const primaryLightBg = hexToRgba(primaryCol, 0.1);
  const primaryBorderLight = hexToRgba(primaryCol, 0.25);

  // Identify lines that have technical info or images
  const technicalItems = quote.lines.map((line) => {
    const prod = (line.productId ? productsMap[line.productId] : null) || (line.description ? productsMap[line.description.toUpperCase()] : null);
    return { line, prod };
  }).filter((item) => item.prod && (item.prod.imagePath || item.prod.detailedDescription));

  return (
    <div style={{ background: "#525659", minHeight: "100vh", padding: "20px" }}>
      {/* Top Action Bar */}
      <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px auto", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#ffffff", padding: "10px 18px", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
        <button
          type="button"
          onClick={() => navigate(`/presupuestos/${id}/editar`)}
          style={{ padding: "8px 16px", borderRadius: "8px", background: "#ffffff", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600 }}
        >
          ← Volver a Editar
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Toggle Technical Offer with Images */}
          <button
            type="button"
            onClick={() => setIncludeTechnicalOffer(!includeTechnicalOffer)}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              background: includeTechnicalOffer ? "rgba(16, 185, 129, 0.12)" : "#f1f5f9",
              border: `1px solid ${includeTechnicalOffer ? "#10b981" : "#cbd5e1"}`,
              color: includeTechnicalOffer ? "#047857" : "#475569",
              fontWeight: 700,
              fontSize: "0.84rem",
              cursor: "pointer"
            }}
          >
            {includeTechnicalOffer ? "🖼️ Oferta Técnica con Fotos: ACTIVADA" : "📄 Solo Tabla Comercial"}
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => window.print()}
            title="Imprimir usando el diálogo nativo del navegador"
            style={{ padding: "8px 14px" }}
          >
            🖨️ Imprimir
          </button>

          <button type="button" className="btn btn-outline" onClick={() => setShowEmail(true)} style={{ padding: "8px 14px" }}>
            ✉ Email
          </button>

          {showEmail && (
            <EmailComposer
              context={{
                entityType: "Quote",
                entityId: quote.id,
                to: assignedContact?.email || customer?.email || undefined,
                subject: `Presupuesto ${quote.quoteNumber} rev.${quote.revision}`,
                body: `Estimado/a,\n\nAdjuntamos la propuesta comercial y oferta técnica ${quote.quoteNumber} (rev. ${quote.revision}) por un total de ${curr.symbol} ${grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}.\n\nQuedamos a su entera disposición ante cualquier consulta técnica o comercial.\n\nSaludos cordiales.`
              }}
              onClose={() => setShowEmail(false)}
            />
          )}

          <button
            type="button"
            disabled={downloadingPdf}
            onClick={handleDownloadPdf}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              background: primaryCol,
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
            }}
          >
            {downloadingPdf ? "Generando Archivo PDF..." : "📥 Descargar Archivo PDF"}
          </button>
        </div>
      </div>

      {/* Screen Wrapper for Visual Shadow */}
      <div style={{ maxWidth: "210mm", margin: "0 auto", boxShadow: "0 8px 30px rgba(0, 0, 0, 0.25)", borderRadius: "4px" }}>
        {/* The Printable A4 Container */}
        <div
          id="quote-pdf-sheet"
          style={{
            width: "210mm",
            minHeight: "297mm",
            background: "#ffffff",
            padding: "14mm 16mm",
            boxSizing: "border-box",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: "11px",
            color: "#1e293b",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {/* =========================================================================
              HEADER BLOCK: Adaptable to configured template style
              ========================================================================= */}
          {settings.templateStyle === "classic" ? (
            <div style={{ background: primaryCol, color: "#ffffff", padding: "14px 18px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 900, color: "#ffffff" }}>LEAL CONTROL ERP</h2>
                <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>Soluciones Industriales & Pesaje Comercial</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>PRESUPUESTO COMERCIAL</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.95 }}>N° {quote.quoteNumber} (Rev. {quote.revision})</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "14px", borderBottom: `2px solid ${primaryCol}`, marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "50px", height: "50px", borderRadius: "12px", background: primaryCol, color: "#ffffff", display: "grid", placeItems: "center", fontSize: "1.4rem", fontWeight: 900 }}>
                  LC
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 900, color: "#0f172a" }}>LEAL CONTROL ERP</h1>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Soluciones Industriales & Automatización</div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b" }}>CUIT: 30-71234567-9 | IVA Responsable Inscripto</div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ display: "inline-block", padding: "3px 12px", borderRadius: "6px", background: primaryLightBg, color: primaryCol, fontWeight: 800, fontSize: "0.9rem" }}>
                  PRESUPUESTO COMERCIAL
                </div>
                <div style={{ fontSize: "1.15rem", fontWeight: 900, color: "#0f172a", marginTop: "4px" }}>
                  N° {quote.quoteNumber} <span style={{ fontSize: "0.8rem", color: "#64748b" }}>(Rev. {quote.revision})</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  Fecha: {new Date(quote.createdAtUtc).toLocaleDateString("es-AR")}
                </div>
              </div>
            </div>
          )}

          {/* Customer & Commercial Details */}
          <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: `1px solid ${primaryBorderLight}`, marginBottom: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700 }}>Cliente / Razón Social:</div>
              <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{customer?.legalName || "Cliente Genérico"}</strong>
              <div style={{ color: "#475569", fontSize: "0.8rem" }}>CUIT: {customer?.documentNumber || "—"} ({customer?.taxCondition || "IVA Resp. Inscripto"})</div>
              {assignedContact && (
                <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: "2px" }}>
                  <strong>Atención:</strong> {assignedContact.name} {assignedContact.role ? `(${assignedContact.role})` : ""}
                </div>
              )}
            </div>

            <div>
              <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700 }}>Destino / Entrega:</div>
              <div style={{ fontSize: "0.82rem", color: "#0f172a" }}>{deliveryLocation?.name || "Entrega en Planta Central"}</div>
              <div style={{ color: "#475569", fontSize: "0.78rem" }}>
                {deliveryLocation?.address?.street ? `${deliveryLocation.address.street}, ${deliveryLocation.address.city}` : "Según orden de compra"}
              </div>
              <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: "2px" }}>
                <strong>Validez:</strong> {quote.validDays} días corridos
              </div>
            </div>
          </div>

          {/* Commercial Items Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
            <thead>
              <tr style={{ background: primaryLightBg, borderBottom: `2px solid ${primaryCol}`, color: primaryCol, fontSize: "9.5px", textTransform: "uppercase" }}>
                <th style={{ padding: "8px 6px", textAlign: "center", width: "5%" }}>#</th>
                <th style={{ padding: "8px 6px", textAlign: "left", width: "45%" }}>Descripción del Artículo / Servicio</th>
                <th style={{ padding: "8px 6px", textAlign: "center", width: "8%" }}>Cant.</th>
                <th style={{ padding: "8px 6px", textAlign: "right", width: "14%" }}>Precio Unit. ({curr.symbol})</th>
                <th style={{ padding: "8px 6px", textAlign: "center", width: "8%" }}>Desc.</th>
                <th style={{ padding: "8px 6px", textAlign: "center", width: "6%" }}>IVA</th>
                <th style={{ padding: "8px 6px", textAlign: "right", width: "14%" }}>Total ({curr.symbol})</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line, idx) => (
                <tr key={line.id} style={{ borderBottom: "1px solid #e2e8f0", opacity: line.isOptional ? 0.65 : 1 }}>
                  <td style={{ padding: "7px 6px", textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                  <td style={{ padding: "7px 6px" }}>
                    <strong>{line.description}</strong>
                    {line.isOptional && <span style={{ color: "#d97706", fontWeight: "bold", marginLeft: "6px" }}>(OPCIONAL)</span>}
                  </td>
                  <td style={{ padding: "7px 6px", textAlign: "center" }}>{line.quantity}</td>
                  <td style={{ padding: "7px 6px", textAlign: "right", fontFamily: "monospace" }}>
                    {line.unitPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "7px 6px", textAlign: "center", color: line.discountPercent > 0 ? "#16a34a" : "#94a3b8" }}>
                    {line.discountPercent > 0 ? `${line.discountPercent}%` : "—"}
                  </td>
                  <td style={{ padding: "7px 6px", textAlign: "center" }}>{line.taxRate}%</td>
                  <td style={{ padding: "7px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                    {line.isOptional ? "—" : line.lineSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals Table */}
          <div style={{ marginLeft: "auto", width: "42%", marginBottom: "14px" }}>
            <div style={{ border: `1px solid ${primaryBorderLight}`, borderRadius: "8px", padding: "10px", background: "#f8fafc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "3px" }}>
                <span style={{ color: "#64748b" }}>Subtotal Neto:</span>
                <span style={{ fontFamily: "monospace" }}>{curr.symbol} {subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
              {quote.discountPercent > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "3px", color: "#16a34a" }}>
                  <span>Descuento ({quote.discountPercent}%):</span>
                  <span style={{ fontFamily: "monospace" }}>- {curr.symbol} {globalDiscountAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "4px" }}>
                <span style={{ color: "#64748b" }}>IVA Estimado:</span>
                <span style={{ fontFamily: "monospace" }}>{curr.symbol} {estimatedVat.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1rem", fontWeight: 900, paddingTop: "5px", borderTop: `2px solid ${primaryCol}`, color: primaryCol }}>
                <span>TOTAL:</span>
                <span style={{ fontFamily: "monospace" }}>{curr.symbol} {grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Amount in Words */}
          <div style={{ background: "#f8fafc", border: `1px solid ${primaryBorderLight}`, padding: "6px 10px", borderRadius: "6px", marginBottom: "12px", fontSize: "0.75rem", color: "#1e293b", display: "flex", alignItems: "baseline", gap: "6px" }}>
            <strong style={{ color: primaryCol, textTransform: "uppercase", fontSize: "0.72rem" }}>Importe en Letras:</strong>
            <span style={{ fontWeight: 700, letterSpacing: "0.3px", textTransform: "uppercase" }}>
              {numberToWords(grandTotal, quote.currency)}
            </span>
          </div>

          {/* =========================================================================
              SECTION: ANEXO DE OFERTA TÉCNICA CON IMÁGENES
              ========================================================================= */}
          {includeTechnicalOffer && technicalItems.length > 0 && (
            <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `2px solid ${primaryCol}` }}>
              <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: "6px", background: primaryCol, color: "#ffffff", fontWeight: 800, fontSize: "0.85rem", textTransform: "uppercase", marginBottom: "12px" }}>
                📑 ANEXO: OFERTA TÉCNICA & ESPECIFICACIONES DE EQUIPAMIENTO
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {technicalItems.map(({ line, prod }, idx) => (
                  <div
                    key={line.id || idx}
                    style={{
                      display: "grid",
                      gridTemplateColumns: prod?.imagePath ? "130px 1fr" : "1fr",
                      gap: "14px",
                      padding: "12px",
                      borderRadius: "8px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0"
                    }}
                  >
                    {prod?.imagePath && (
                      <div style={{ width: "120px", height: "120px", borderRadius: "8px", overflow: "hidden", background: "#ffffff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img
                          src={prod.imagePath}
                          alt={prod.name}
                          crossOrigin="anonymous"
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                        />
                      </div>
                    )}

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{prod?.name || line.description}</strong>
                          {prod?.code && (
                            <span style={{ marginLeft: "8px", fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
                              SKU: {prod.code}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: "6px", background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" }}>Ítem {idx + 1}</span>
                      </div>

                      {prod?.description && (
                        <p style={{ margin: "4px 0", fontSize: "0.8rem", color: "#475569" }}>
                          {prod.description}
                        </p>
                      )}

                      {prod?.detailedDescription && (
                        <div style={{ marginTop: "6px", padding: "8px 10px", background: "#ffffff", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.76rem", color: "#334155", lineHeight: 1.4 }}>
                          <strong style={{ color: primaryCol, display: "block", marginBottom: "2px" }}>Especificaciones Técnicas & Alcance:</strong>
                          <div style={{ whiteSpace: "pre-line" }}>{prod.detailedDescription}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commercial Conditions Table */}
          <div style={{ marginTop: "14px", borderTop: `1px solid ${primaryBorderLight}`, paddingTop: "8px", fontSize: "0.76rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", color: "#475569" }}>
              <div><strong>Plazo de Entrega:</strong> {quote.deliveryTimeDays ? `${quote.deliveryTimeDays} días hábiles` : settings.quote.deliveryTerms}</div>
              <div><strong>Condiciones de Pago:</strong> {quote.paymentTerms || settings.quote.paymentTerms}</div>
              <div><strong>Garantía:</strong> {settings.quote.warrantyTerms}</div>
              <div><strong>Transporte / Flete:</strong> {quote.transportation || "Flete por cuenta y orden del comprador"}</div>
            </div>

            {quote.notes && (
              <div style={{ background: "#fef9c3", borderLeft: "3px solid #eab308", padding: "6px 8px", marginTop: "6px", fontSize: "0.76rem", color: "#713f12" }}>
                <strong>Observaciones:</strong> {quote.notes}
              </div>
            )}
          </div>

          {/* Signatures Space */}
          {settings.quote.showSignatures && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px", marginTop: "24px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ borderTop: "1px dashed #94a3b8", width: "75%", margin: "0 auto 3px" }} />
                <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Firma Responsable / Asesor Técnico</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ borderTop: "1px dashed #94a3b8", width: "75%", margin: "0 auto 3px" }} />
                <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Aceptación de Propuesta / Firma Cliente</div>
              </div>
            </div>
          )}

          {/* Custom Footer Terms */}
          <div style={{ marginTop: "auto", paddingTop: "14px", borderTop: "1px solid #e2e8f0", fontSize: "0.7rem", color: "#64748b", textAlign: "center", lineHeight: 1.3 }}>
            {settings.quote.customFooterText}
          </div>
        </div>
      </div>
    </div>
  );
};
