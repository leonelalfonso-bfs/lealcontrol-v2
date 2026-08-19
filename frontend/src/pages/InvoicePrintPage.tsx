import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import html2pdf from "html2pdf.js";
import QRCode from "qrcode";
import { api } from "../api/client";
import { EmailComposer } from "../components/EmailComposer";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { type CompanySettings, type CustomerDetail, type Invoice } from "../api/types";

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useDocumentTemplate();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [inv, comp] = await Promise.all([
        api.getInvoice(id),
        api.getCompanySettings().catch(() => null)
      ]);
      setInvoice(inv);
      setCompany(comp);

      if (inv.customerId && inv.customerId !== "00000000-0000-0000-0000-000000000000") {
        const cust = await api.getCustomer(inv.customerId).catch(() => null);
        setCustomer(cust);
      }

      if (inv.qrUrl) {
        QRCode.toDataURL(inv.qrUrl, { margin: 1, width: 140 }).then(setQrDataUrl);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar la factura");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleAuthorizeArca = async () => {
    if (!id) return;
    try {
      setAuthorizing(true);
      setError(null);
      await api.authorizeInvoiceArca(id);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al autorizar con ARCA");
    } finally {
      setAuthorizing(false);
    }
  };

  const handleDownloadPdf = () => {
    const element = document.getElementById("invoice-pdf-sheet");
    if (!element || !invoice) return;

    try {
      setDownloadingPdf(true);
      const filename = `Factura_${invoice.formattedNumber}.pdf`;

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
        Cargando documento fiscal de factura...
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div style={{ padding: "40px", color: "#ef4444", fontFamily: "sans-serif" }}>
        Error: {error || "Factura no encontrada"}
      </div>
    );
  }

  const primaryCol = settings.global.primaryColor;
  const isUsd = invoice.currency === "USD";
  const currSymbol = isUsd ? "USD " : "$ ";
  const invoiceLetter = invoice.invoiceType.replace("NC_", "").replace("ND_", "");
  const isNc = invoice.invoiceType.startsWith("NC");
  const isNd = invoice.invoiceType.startsWith("ND");
  const docTitle = isNc ? "NOTA DE CRÉDITO" : isNd ? "NOTA DE DÉBITO" : invoice.invoiceType === "Proforma" ? "FACTURA PROFORMA" : "FACTURA";

  const afipCodes: Record<string, string> = {
    A: "01",
    B: "06",
    C: "11",
    M: "51",
    NC_A: "03",
    NC_B: "08",
    NC_C: "13",
    NC_M: "52",
    ND_A: "02",
    ND_B: "07",
    ND_C: "12",
    ND_M: "53",
    Proforma: "00"
  };
  const invoiceCode = afipCodes[invoice.invoiceType] ?? "01";

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: "20px" }}>
      {/* Top Action Bar */}
      <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => navigate("/facturas")}
          style={{ padding: "8px 16px", borderRadius: "6px", background: "white", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600 }}
        >
          ← Volver a Facturas
        </button>

        <div style={{ display: "flex", gap: "10px" }}>
          {invoice.status !== "Authorized" && (
            <button
              type="button"
              onClick={handleAuthorizeArca}
              disabled={authorizing}
              style={{
                padding: "8px 20px",
                borderRadius: "6px",
                background: "#047857",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontWeight: "bold",
                boxShadow: "0 4px 12px rgba(4, 120, 87, 0.3)"
              }}
            >
              {authorizing ? "Autorizando con ARCA..." : "⚡ Autorizar con ARCA"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowEmail(!showEmail)}
            style={{ padding: "8px 16px", borderRadius: "6px", background: "white", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600 }}
          >
            ✉️ Enviar por Email
          </button>

          <button
            type="button"
            disabled={downloadingPdf}
            onClick={handleDownloadPdf}
            style={{
              padding: "8px 20px",
              borderRadius: "6px",
              background: primaryCol,
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: `0 4px 12px ${primaryCol}44`
            }}
          >
            {downloadingPdf ? "Generando..." : "📥 Descargar PDF"}
          </button>
        </div>
      </div>

      {showEmail && (
        <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px auto" }}>
          <EmailComposer
            context={{
              entityType: "Invoice",
              entityId: invoice.id,
              to: customer?.email ?? undefined,
              subject: `Factura Electrónica N° ${invoice.formattedNumber} - ${company?.tradeName || company?.legalName || "LEAL CONTROL"}`,
              body: `Estimado cliente,\n\nAdjuntamos la factura electrónica correspondiente a los servicios/productos provistos.\n\nDatos para el pago:\nBanco: ${settings.invoice.bankDetails.bankName}\nCBU: ${settings.invoice.bankDetails.cbu}\nAlias: ${settings.invoice.bankDetails.alias}\n\nSaludos cordiales,\n${company?.tradeName || "LEAL CONTROL ERP"}`
            }}
            onClose={() => setShowEmail(false)}
          />
        </div>
      )}

      {/* Main A4 Document Sheet */}
      <div
        id="invoice-pdf-sheet"
        className="print-container"
        style={{
          width: "200mm",
          minHeight: "270mm",
          background: "white",
          margin: "0 auto",
          padding: "12mm 12mm",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
          fontFamily: "Helvetica, Arial, sans-serif",
          color: "#333333",
          fontSize: "11.5px",
          lineHeight: "1.45",
          boxSizing: "border-box",
          position: "relative"
        }}
      >
        {/* Header Section */}
        <div style={{ borderBottom: `2px solid ${primaryCol}`, paddingBottom: "10px", marginBottom: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "22%", verticalAlign: "top" }}>
                  <img src="/logo.png?v=2" alt="Leal Control ERP" style={{ maxHeight: "65px", width: "auto" }} />
                </td>
                <td style={{ width: "40%", verticalAlign: "top", paddingLeft: "10px" }}>
                  <h1 style={{ margin: 0, fontSize: "17px", color: primaryCol }}>
                    {company?.legalName || "LEAL CONTROL ERP S.A."}
                  </h1>
                  <p style={{ margin: "2px 0", fontSize: "10.5px", color: "#64748b" }}>
                    {company?.tradeName || "Sistemas Comerciales, Industriales & Metrología"}
                  </p>
                  <p style={{ margin: "1px 0", fontSize: "10.5px", color: "#64748b" }}>
                    CUIT: {company?.documentNumber || "30-71548962-9"} | IIBB: {company?.iibbNumber || "Convenio Multilateral"}
                  </p>
                  <p style={{ margin: "1px 0", fontSize: "10.5px", color: "#64748b" }}>
                    {company?.fiscalStreet || "Luis Braile 705"}, {company?.fiscalCity || "San Lorenzo"}, {company?.fiscalProvince || "Santa Fe"}
                  </p>
                  <p style={{ margin: "1px 0", fontSize: "10.5px", color: "#64748b" }}>
                    Condición IVA: <strong>{company?.taxCondition || "IVA Responsable Inscripto"}</strong>
                  </p>
                </td>
                <td style={{ width: "10%", verticalAlign: "top", textAlign: "center" }}>
                  <div style={{
                    border: `3px solid ${primaryCol}`,
                    fontSize: "24px",
                    fontWeight: "bold",
                    width: "46px",
                    height: "46px",
                    textAlign: "center",
                    lineHeight: "44px",
                    margin: "0 auto",
                    background: "#fff",
                    color: primaryCol
                  }}>
                    {invoiceLetter}
                  </div>
                  <div style={{ fontSize: "9px", marginTop: "3px", fontWeight: "bold", color: primaryCol }}>
                    COD. {invoiceCode}
                  </div>
                </td>
                <td style={{ width: "28%", verticalAlign: "top", textAlign: "right" }}>
                  <h2 style={{ margin: 0, fontSize: "16px", color: primaryCol, letterSpacing: "0.5px" }}>
                    {settings.invoice.headerTitle} {invoiceLetter}
                  </h2>
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "#1e293b", marginTop: "2px" }}>
                    N° {invoice.formattedNumber}
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "3px" }}>
                    Fecha de Emisión: <strong>{new Date(invoice.issueDate).toLocaleDateString("es-AR")}</strong>
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                    Fecha de Vto. Pago: <strong>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("es-AR") : new Date(invoice.issueDate).toLocaleDateString("es-AR")}</strong>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Client Data Section */}
        <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "6px", marginBottom: "12px", border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "60%", verticalAlign: "top" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase", marginBottom: "3px" }}>
                    RECEPTOR DEL COMPROBANTE
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>
                    {invoice.customerName || customer?.legalName || "Cliente"}
                  </div>
                  {customer?.tradeName && (
                    <div style={{ fontSize: "10.5px", color: "#475569" }}>Nombre Fantasía: {customer.tradeName}</div>
                  )}
                  <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                    CUIT / Documento: <strong>{invoice.customerDocument || customer?.documentNumber || "—"}</strong>
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                    Condición Frente al IVA: <strong>{customer?.taxCondition || "IVA Responsable Inscripto"}</strong>
                  </div>
                  {customer?.fiscalAddress && (
                    <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                      Domicilio Comercial: {customer.fiscalAddress.street}, {customer.fiscalAddress.city}, {customer.fiscalAddress.province}
                    </div>
                  )}
                </td>
                <td style={{ width: "40%", verticalAlign: "top", textAlign: "right", borderLeft: "1px dashed #cbd5e1", paddingLeft: "12px" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase", marginBottom: "3px" }}>
                    CONDICIONES COMERCIALES
                  </div>
                  <div style={{ fontSize: "11px", color: "#334155" }}>
                    Condición de Venta: <strong>Cuenta Corriente Comercial / Transferencia</strong>
                  </div>
                  <div style={{ fontSize: "11px", color: "#334155", marginTop: "2px" }}>
                    Moneda del Comprobante: <strong>{invoice.currency}</strong>
                  </div>
                  {isUsd && (
                    <div style={{ fontSize: "11px", color: "#0d9488", marginTop: "2px" }}>
                      Tipo de Cambio Oficial: <strong>$ {invoice.exchangeRate.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section Title */}
        <div style={{ background: primaryCol, color: "white", padding: "5px 10px", fontWeight: "bold", fontSize: "11px", borderRadius: "4px 4px 0 0", letterSpacing: "0.5px", textTransform: "uppercase" }}>
          DETALLE DE PRODUCTOS / SERVICIOS
        </div>

        {/* Items Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", fontSize: "9.5px", textTransform: "uppercase", color: "#475569" }}>
              <th style={{ padding: "6px 5px", textAlign: "center", width: "5%" }}>#</th>
              <th style={{ padding: "6px 8px", textAlign: "left", width: "15%" }}>Código</th>
              <th style={{ padding: "6px 8px", textAlign: "left", width: "42%" }}>Descripción</th>
              <th style={{ padding: "6px 8px", textAlign: "center", width: "8%" }}>Cant.</th>
              <th style={{ padding: "6px 8px", textAlign: "right", width: "15%" }}>P. Unitario ({currSymbol.trim()})</th>
              <th style={{ padding: "6px 8px", textAlign: "center", width: "7%" }}>% IVA</th>
              <th style={{ padding: "6px 8px", textAlign: "right", width: "18%" }}>Subtotal ({currSymbol.trim()})</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "7px 5px", textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                <td style={{ padding: "7px 8px", fontFamily: "monospace", color: "#475569" }}>{item.code}</td>
                <td style={{ padding: "7px 8px" }}>
                  <div style={{ fontWeight: "bold", color: "#0f172a" }}>{item.description}</div>
                </td>
                <td style={{ padding: "7px 8px", textAlign: "center" }}>{item.quantity}</td>
                <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "monospace" }}>
                  {item.unitPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: "7px 8px", textAlign: "center", color: "#64748b" }}>{item.vatRate}%</td>
                <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                  {item.netSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Table */}
        <div style={{ marginLeft: "auto", width: "45%", marginBottom: "14px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <tbody>
              <tr>
                <td style={{ padding: "3px 0", textAlign: "right", color: "#64748b" }}>Subtotal Neto Gravado:</td>
                <td style={{ padding: "3px 0", textAlign: "right", width: "45%", fontFamily: "monospace", fontWeight: "bold" }}>
                  {currSymbol}{invoice.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              {invoice.iva21 > 0 && (
                <tr>
                  <td style={{ padding: "3px 0", textAlign: "right", color: "#64748b" }}>IVA 21.0%:</td>
                  <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace" }}>
                    {currSymbol}{invoice.iva21.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              {invoice.iva105 > 0 && (
                <tr>
                  <td style={{ padding: "3px 0", textAlign: "right", color: "#64748b" }}>IVA 10.5%:</td>
                  <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace" }}>
                    {currSymbol}{invoice.iva105.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              {invoice.iva27 > 0 && (
                <tr>
                  <td style={{ padding: "3px 0", textAlign: "right", color: "#64748b" }}>IVA 27.0%:</td>
                  <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace" }}>
                    {currSymbol}{invoice.iva27.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              <tr style={{ borderTop: `2px solid ${primaryCol}` }}>
                <td style={{ padding: "6px 0 3px 0", textAlign: "right", fontWeight: "bold", fontSize: "13px", color: "#0f172a" }}>
                  TOTAL FACTURA:
                </td>
                <td style={{ padding: "6px 0 3px 0", textAlign: "right", fontWeight: "bold", fontSize: "14px", color: primaryCol, fontFamily: "monospace" }}>
                  {currSymbol}{invoice.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              {isUsd && (
                <tr>
                  <td style={{ padding: "2px 0", textAlign: "right", color: "#64748b", fontSize: "10px" }}>
                    Equiv. ARS (TC ${invoice.exchangeRate}):
                  </td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontSize: "10px", color: "#1e3a8a", fontFamily: "monospace", fontWeight: "bold" }}>
                    $ {(invoice.total * invoice.exchangeRate).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Banking Info Box */}
        {settings.invoice.showBankingInfo && (
          <div style={{ background: "rgba(13, 148, 136, 0.08)", border: `1px solid ${primaryCol}44`, padding: "8px 12px", borderRadius: "6px", marginBottom: "12px", fontSize: "10px" }}>
            <strong style={{ color: primaryCol, display: "block", marginBottom: "2px" }}>
              🏦 DATOS PARA ACREDITACIÓN / TRANSFERENCIA BANCARIA:
            </strong>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
              <div><strong>Banco:</strong> {settings.invoice.bankDetails.bankName} ({settings.invoice.bankDetails.accountType})</div>
              <div><strong>CBU:</strong> <span style={{ fontFamily: "monospace", fontWeight: "bold" }}>{settings.invoice.bankDetails.cbu}</span></div>
              <div><strong>Alias:</strong> <span style={{ fontFamily: "monospace", fontWeight: "bold", color: primaryCol }}>{settings.invoice.bankDetails.alias}</span></div>
              <div><strong>Titular / CUIT:</strong> {settings.invoice.bankDetails.accountHolder} ({settings.invoice.bankDetails.cuit})</div>
            </div>
            {settings.invoice.paymentInstructions && (
              <div style={{ fontSize: "9.5px", color: "#475569", marginTop: "3px", fontStyle: "italic" }}>
                {settings.invoice.paymentInstructions}
              </div>
            )}
          </div>
        )}

        {/* Notes Section */}
        {invoice.notes && (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "6px 10px", borderRadius: "6px", marginBottom: "12px", fontSize: "10px" }}>
            <strong>Observaciones:</strong> {invoice.notes}
          </div>
        )}

        {/* Interest Clause */}
        {settings.invoice.interestLegalText && (
          <div style={{ fontSize: "9.5px", color: "#64748b", marginBottom: "10px", textAlign: "center" }}>
            {settings.invoice.interestLegalText}
          </div>
        )}

        {/* Official ARCA CAE Box */}
        {invoice.status === "Authorized" && invoice.cae ? (
          <div style={{ border: `2px solid ${primaryCol}`, borderRadius: "6px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "16px", background: "#f8fafc" }}>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR ARCA Oficial" style={{ width: "85px", height: "85px", display: "block" }} />
            )}
            <div style={{ flex: 1, fontSize: "10.5px", lineHeight: "1.5" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontWeight: "bold", fontSize: "13px", color: primaryCol }}>ARCA</span>
                <span style={{ fontSize: "10px", color: "#64748b" }}>Agencia de Recaudación y Control Aduanero</span>
              </div>
              <div style={{ marginTop: "4px" }}>
                <strong>CAE N°:</strong> <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: "bold" }}>{invoice.cae}</span>
              </div>
              <div>
                <strong>Fecha de Vto. de CAE:</strong> {invoice.caeDueDate ? new Date(invoice.caeDueDate).toLocaleDateString("es-AR") : "—"}
              </div>
              <div style={{ fontSize: "9.5px", color: "#64748b", marginTop: "3px" }}>
                {settings.invoice.customFooterText || "Comprobante Autorizado. La autenticidad de este documento puede verificarse en www.afip.gob.ar/fe/qr/ escaneando el código QR."}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ border: "1px dashed #f59e0b", padding: "10px", textAlign: "center", background: "#fffbeb", borderRadius: "6px", fontSize: "11px", color: "#92400e" }}>
            🟡 <strong>Comprobante en estado Borrador / Proforma</strong> (Pendiente de Autorización Fiscal con ARCA).
          </div>
        )}
      </div>
    </div>
  );
}
