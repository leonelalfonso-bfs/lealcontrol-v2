import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { api } from "../api/client";
import { EmailComposer } from "../components/EmailComposer";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { numberToWords } from "../utils/numberToWords";
import {
  currencyMeta,
  label,
  type CompanySettings,
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

function companyInitials(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "EM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function formatCuitDisplay(raw?: string | null): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length !== 11) return raw || "—";
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export const QuotePrintPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useDocumentTemplate();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
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
        const [q, prods, companySettings] = await Promise.all([
          api.getQuote(id),
          api.listProducts().catch(() => [] as Product[]),
          api.getCompanySettings().catch(() => null)
        ]);

        setQuote(q);
        setCompany(companySettings);

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
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["css", "legacy"] }
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

  const handleCancelQuote = async () => {
    if (!id || !quote) return;
    if (!confirm(`¿Anular el presupuesto ${quote.quoteNumber}? Queda registrado como anulado.`)) return;
    try {
      const updated = await api.cancelQuote(id);
      setQuote(updated);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al anular el presupuesto");
    }
  };

  const handleDeleteQuote = async () => {
    if (!id || !quote) return;
    if (!confirm(`¿Eliminar el presupuesto ${quote.quoteNumber}? No se puede recuperar.`)) return;
    try {
      await api.deleteQuote(id);
      navigate("/presupuestos");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al eliminar el presupuesto");
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

  const companyDisplayName = company?.tradeName?.trim() || company?.legalName || "Empresa";
  const companyLegalName =
    company?.legalName && company.legalName.trim() !== companyDisplayName.trim()
      ? company.legalName
      : null;
  const companyCuit = formatCuitDisplay(company?.documentNumber);
  const companyTax = label(company?.taxCondition) || company?.taxCondition || "—";
  const companyAddress = [
    company?.fiscalStreet,
    company?.fiscalCity,
    company?.fiscalProvince,
    company?.fiscalPostalCode ? `CP ${company.fiscalPostalCode}` : null
  ].filter(Boolean).join(", ");

  const technicalItems = quote.lines.map((line, idx) => {
    const prod = (line.productId ? productsMap[line.productId] : null) || (line.description ? productsMap[line.description.toUpperCase()] : null);
    const text = (line.technicalDetail || prod?.detailedDescription || "").trim();
    return { line, prod, text, idx };
  }).filter((item) => item.text.length > 0 || Boolean(item.prod?.imagePath));
  const showTechnicalOffer = includeTechnicalOffer && technicalItems.length > 0;

  const logoBlock = company?.logoUrl ? (
    <img
      src={company.logoUrl}
      alt={companyDisplayName}
      crossOrigin="anonymous"
      style={{ maxHeight: 96, maxWidth: 240, objectFit: "contain", display: "block", background: "#000", borderRadius: 8, padding: 4 }}
    />
  ) : (
    <div style={{ width: "64px", height: "64px", borderRadius: "12px", background: primaryCol, color: "#ffffff", display: "grid", placeItems: "center", fontSize: "1.25rem", fontWeight: 900 }}>
      {companyInitials(companyDisplayName)}
    </div>
  );

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
            {includeTechnicalOffer ? "Oferta técnica en la primera hoja" : "Solo oferta comercial"}
          </button>

          {quote.status !== "Cancelled" && (
            <button
              type="button"
              onClick={() => void handleCancelQuote()}
              style={{ padding: "8px 14px", borderRadius: "8px", background: "#ffffff", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 700 }}
            >
              Anular
            </button>
          )}
          {quote.status !== "Cancelled" && (
            <button
              type="button"
              onClick={() => void handleDeleteQuote()}
              style={{ padding: "8px 14px", borderRadius: "8px", background: "#ffffff", border: "1px solid #fecaca", color: "#b91c1c", cursor: "pointer", fontWeight: 700 }}
            >
              Eliminar
            </button>
          )}

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
            width: "720px",
            maxWidth: "100%",
            background: "#ffffff",
            padding: "12px",
            boxSizing: "border-box",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: "11px",
            color: "#1e293b"
          }}
        >
          {quote.status === "Cancelled" && (
            <div style={{ marginBottom: 12, padding: "8px 12px", border: "2px solid #b91c1c", color: "#b91c1c", fontWeight: 800, textAlign: "center", letterSpacing: "0.14em" }}>
              ANULADO
            </div>
          )}
          {/* =========================================================================
              HEADER BLOCK: Adaptable to configured template style
              ========================================================================= */}
          {settings.templateStyle === "classic" ? (
            <table style={{ width: "100%", background: primaryCol, color: "#ffffff", borderRadius: "6px", marginBottom: "16px", borderCollapse: "separate" }}>
              <tbody>
              <tr>
              <td style={{ padding: "14px 18px", verticalAlign: "middle" }}>
              <div>
                {company?.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt={companyDisplayName}
                    crossOrigin="anonymous"
                    style={{ maxHeight: 88, maxWidth: 220, objectFit: "contain", background: "#000", borderRadius: 6, padding: 4 }}
                  />
                ) : null}
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 900, color: "#ffffff" }}>{companyDisplayName}</h2>
                  {companyLegalName ? (
                    <div style={{ fontSize: "0.78rem", opacity: 0.92, fontWeight: 600 }}>{companyLegalName}</div>
                  ) : null}
                  <div style={{ fontSize: "0.72rem", opacity: 0.9 }}>CUIT: {companyCuit} | {companyTax}</div>
                </div>
              </div>
              </td>
              <td style={{ padding: "14px 18px", textAlign: "right", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>{showTechnicalOffer ? "OFERTA TÉCNICA" : (settings.quote.headerTitle || "PRESUPUESTO COMERCIAL")}</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.95 }}>N° {quote.quoteNumber} (Rev. {quote.revision})</div>
              </td>
              </tr>
              </tbody>
            </table>
          ) : (
            <table style={{ width: "100%", borderBottom: `2px solid ${primaryCol}`, marginBottom: "16px", borderCollapse: "collapse" }}>
              <tbody>
              <tr>
              <td style={{ paddingBottom: "14px", verticalAlign: "top" }}>
              <div>
                {logoBlock}
                <div>
                  <h1 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 900, color: "#0f172a", letterSpacing: "0.01em" }}>
                    {companyDisplayName}
                  </h1>
                  {companyLegalName ? (
                    <div style={{ fontSize: "0.82rem", color: "#475569", fontWeight: 600, marginTop: 2 }}>
                      {companyLegalName}
                    </div>
                  ) : null}
                  <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 2 }}>CUIT: {companyCuit} | {companyTax}</div>
                  {companyAddress ? (
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{companyAddress}</div>
                  ) : null}
                  {(company?.phone || company?.email) ? (
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      {[company?.phone, company?.email].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                </div>
              </div>

              </td>
              <td style={{ paddingBottom: "14px", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>
                <div style={{ display: "inline-block", padding: "3px 12px", borderRadius: "6px", background: primaryLightBg, color: primaryCol, fontWeight: 800, fontSize: "0.9rem" }}>
                  {showTechnicalOffer ? "OFERTA TÉCNICA" : (settings.quote.headerTitle || "PRESUPUESTO COMERCIAL")}
                </div>
                <div style={{ fontSize: "1.15rem", fontWeight: 900, color: "#0f172a", marginTop: "4px" }}>
                  N° {quote.quoteNumber} <span style={{ fontSize: "0.8rem", color: "#64748b" }}>(Rev. {quote.revision})</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                  Fecha: {new Date(quote.createdAtUtc).toLocaleDateString("es-AR")}
                </div>
              </td>
              </tr>
              </tbody>
            </table>
          )}

          {showTechnicalOffer && (
            <section>
              <p style={{ margin: "0 0 12px", fontSize: "0.82rem", color: "#475569" }}>
                Especificaciones y alcance. La oferta comercial, con precios, continúa en la hoja siguiente.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {technicalItems.map(({ line, prod, text, idx }) => (
                  <article key={line.id || idx} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                    <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a", marginBottom: 6 }}>
                      {idx + 1}. {line.description}
                    </div>
                    {prod?.imagePath && (
                      <img
                        src={prod.imagePath}
                        alt={line.description}
                        crossOrigin="anonymous"
                        style={{ maxWidth: 220, maxHeight: 160, objectFit: "contain", marginBottom: 8 }}
                      />
                    )}
                    {text && (
                      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.84rem", lineHeight: 1.45, color: "#1e293b" }}>
                        {text}
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <div style={{ breakBefore: "page", pageBreakBefore: "always" }} />
              <table className="quote-keep" style={{ width: "100%", borderBottom: `2px solid ${primaryCol}`, margin: "0 0 14px", borderCollapse: "collapse" }}>
                <tbody>
                <tr>
                <td style={{ paddingBottom: 8, verticalAlign: "bottom" }}>
                <div>
                  <div style={{ fontWeight: 900, color: primaryCol, letterSpacing: "0.04em" }}>OFERTA COMERCIAL</div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>N° {quote.quoteNumber} · Rev. {quote.revision}</div>
                </div>
                </td>
                <td style={{ paddingBottom: 8, textAlign: "right", verticalAlign: "bottom", fontSize: "0.78rem", color: "#64748b" }}>{companyDisplayName}</td>
                </tr>
                </tbody>
              </table>
            </section>
          )}

          {/* Customer & Commercial Details */}
          <table className="quote-keep" style={{ width: "100%", background: "#f8fafc", borderRadius: "8px", border: `1px solid ${primaryBorderLight}`, marginBottom: "14px", borderCollapse: "separate" }}>
            <tbody>
            <tr>
            <td style={{ width: "50%", padding: "12px 16px", verticalAlign: "top" }}>
              <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700 }}>Cliente / Razón Social:</div>
              <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{customer?.legalName || "Cliente Genérico"}</strong>
              <div style={{ color: "#475569", fontSize: "0.8rem" }}>CUIT: {customer?.documentNumber || "—"} ({customer?.taxCondition || "IVA Resp. Inscripto"})</div>
              {assignedContact && (
                <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: "2px" }}>
                  <strong>Atención:</strong> {assignedContact.name} {assignedContact.role ? `(${assignedContact.role})` : ""}
                </div>
              )}
            </td>
            <td style={{ width: "50%", padding: "12px 16px", verticalAlign: "top" }}>
              <div style={{ color: "#64748b", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700 }}>Destino / Entrega:</div>
              <div style={{ fontSize: "0.82rem", color: "#0f172a" }}>{deliveryLocation?.name || "Entrega en Planta Central"}</div>
              <div style={{ color: "#475569", fontSize: "0.78rem" }}>
                {deliveryLocation?.address?.street ? `${deliveryLocation.address.street}, ${deliveryLocation.address.city}` : "Según orden de compra"}
              </div>
              <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: "2px" }}>
                <strong>Validez:</strong> {quote.validDays} días corridos
              </div>
            </td>
            </tr>
            </tbody>
          </table>

          {/* Commercial Items Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px", tableLayout: "fixed" }}>
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
          <table style={{ width: "100%", marginBottom: "14px", borderCollapse: "collapse" }}><tbody><tr>
            <td style={{ width: "58%" }} />
            <td style={{ width: "42%", verticalAlign: "top" }}>
            <div style={{ border: `1px solid ${primaryBorderLight}`, borderRadius: "8px", padding: "10px", background: "#f8fafc" }}>
              <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}><tbody>
              <tr><td style={{ color: "#64748b", paddingBottom: 3 }}>Subtotal Neto:</td><td style={{ textAlign: "right", fontFamily: "monospace", paddingBottom: 3 }}>{curr.symbol} {subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td></tr>
              {quote.discountPercent > 0 && (
                <tr style={{ color: "#16a34a" }}><td style={{ paddingBottom: 3 }}>Descuento ({quote.discountPercent}%):</td><td style={{ textAlign: "right", fontFamily: "monospace", paddingBottom: 3 }}>- {curr.symbol} {globalDiscountAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td></tr>
              )}
              <tr><td style={{ color: "#64748b", paddingBottom: 4 }}>IVA Estimado:</td><td style={{ textAlign: "right", fontFamily: "monospace", paddingBottom: 4 }}>{curr.symbol} {estimatedVat.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td></tr>
              <tr style={{ fontSize: "1rem", fontWeight: 900, color: primaryCol }}><td style={{ paddingTop: 5, borderTop: `2px solid ${primaryCol}` }}>TOTAL:</td><td style={{ textAlign: "right", fontFamily: "monospace", paddingTop: 5, borderTop: `2px solid ${primaryCol}` }}>{curr.symbol} {grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td></tr>
              </tbody></table>
            </div>
            </td>
          </tr></tbody></table>

          {/* Amount in Words */}
          <div style={{ background: "#f8fafc", border: `1px solid ${primaryBorderLight}`, padding: "6px 10px", borderRadius: "6px", marginBottom: "12px", fontSize: "0.75rem", color: "#1e293b", display: "flex", alignItems: "baseline", gap: "6px" }}>
            <strong style={{ color: primaryCol, textTransform: "uppercase", fontSize: "0.72rem" }}>Importe en Letras:</strong>
            <span style={{ fontWeight: 700, letterSpacing: "0.3px", textTransform: "uppercase" }}>
              {numberToWords(grandTotal, quote.currency)}
            </span>
          </div>

          {/* Commercial Conditions Table */}
          <table style={{ width: "100%", marginTop: "14px", borderTop: `1px solid ${primaryBorderLight}`, fontSize: "0.76rem", color: "#475569", borderCollapse: "collapse" }}>
            <tbody>
            <tr>
              <td style={{ width: "50%", padding: "8px 8px 3px 0", verticalAlign: "top" }}><strong>Plazo de Entrega:</strong> {quote.deliveryTimeDays ? `${quote.deliveryTimeDays} días hábiles` : settings.quote.deliveryTerms}</td>
              <td style={{ width: "50%", padding: "8px 0 3px 8px", verticalAlign: "top" }}><strong>Condiciones de Pago:</strong> {quote.paymentTerms || settings.quote.paymentTerms}</td>
            </tr>
            <tr>
              <td style={{ padding: "3px 8px 0 0", verticalAlign: "top" }}><strong>Garantía:</strong> {quote.warranty || settings.quote.warrantyTerms}</td>
              <td style={{ padding: "3px 0 0 8px", verticalAlign: "top" }}><strong>Transporte / Flete:</strong> {quote.transportation || "Flete por cuenta y orden del comprador"}</td>
            </tr>
            </tbody>
          </table>
          <div style={{ fontSize: "0.76rem" }}>

            {quote.notes && (
              <div style={{ background: "#fef9c3", borderLeft: "3px solid #eab308", padding: "6px 8px", marginTop: "6px", fontSize: "0.76rem", color: "#713f12" }}>
                <strong>Observaciones:</strong> {quote.notes}
              </div>
            )}
          </div>

          {/* Signatures Space */}
          {settings.quote.showSignatures && (
            <table style={{ width: "100%", marginTop: "24px", borderCollapse: "collapse" }}><tbody><tr>
              <td style={{ width: "50%", textAlign: "center", paddingRight: 16 }}>
                <div style={{ borderTop: "1px dashed #94a3b8", width: "75%", margin: "0 auto 3px" }} />
                <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Firma Responsable / Asesor Técnico</div>
              </td>
              <td style={{ width: "50%", textAlign: "center", paddingLeft: 16 }}>
                <div style={{ borderTop: "1px dashed #94a3b8", width: "75%", margin: "0 auto 3px" }} />
                <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Aceptación de Propuesta / Firma Cliente</div>
              </td>
            </tr></tbody></table>
          )}

          {/* Custom Footer Terms */}
          <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px solid #e2e8f0", fontSize: "0.7rem", color: "#64748b", textAlign: "center", lineHeight: 1.3 }}>
            {settings.quote.customFooterText}
          </div>
        </div>
      </div>
    </div>
  );
};
