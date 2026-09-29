import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { api } from "../api/client";
import { EmailComposer } from "../components/EmailComposer";
import { QuoteDocument } from "../components/QuoteDocument";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import {
  currencyMeta,
  type CompanySettings,
  type Contact,
  type CustomerDetail,
  type Location,
  type Product,
  type Quote
} from "../api/types";

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
        margin: [8, 10, 8, 10] as [number, number, number, number],
        filename,
        image: { type: "jpeg" as const, quality: 0.92 },
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
  const grandTotal = quote.total;
  const primaryCol = settings.primaryColor || "#3975e5";
  const hasTechnicalItems = quote.lines.some((line) => {
    const product = (line.productId && productsMap[line.productId]) || productsMap[line.description.toUpperCase()];
    return Boolean(line.technicalDetail?.trim() || product?.detailedDescription?.trim() || product?.imagePath);
  });

  return (
    <div style={{ background: "#e9eef5", minHeight: "100vh", padding: "20px" }}>
      {/* Top Action Bar */}
      <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px auto", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center", background: "#ffffff", padding: "10px 18px", borderRadius: "12px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
        <button
          type="button"
          onClick={() => navigate(`/presupuestos/${id}/editar`)}
          style={{ padding: "8px 16px", borderRadius: "8px", background: "#ffffff", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600 }}
        >
          ← Volver a Editar
        </button>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
          {/* Toggle Technical Offer with Images */}
          {hasTechnicalItems && settings.quote.showTechnicalOffer && <button
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
            {includeTechnicalOffer ? "Incluir detalle técnico" : "Sin detalle técnico"}
          </button>
          }

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

      <div style={{ width: "720px", maxWidth: "100%", margin: "0 auto", boxShadow: "0 16px 45px rgba(22, 38, 64, 0.22)" }}>
        <QuoteDocument
          quote={quote}
          company={company}
          customer={customer}
          deliveryLocation={deliveryLocation}
          assignedContact={assignedContact}
          productsMap={productsMap}
          includeTechnicalOffer={includeTechnicalOffer}
        />
      </div>
    </div>
  );
};
