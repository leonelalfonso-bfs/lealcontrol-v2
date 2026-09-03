import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../api/client";
import { EmailComposer } from "../components/EmailComposer";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { numberToWords } from "../utils/numberToWords";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
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

  const handleDownloadPdf = async () => {
    const element = document.getElementById("invoice-pdf-sheet");
    if (!element || !invoice) return;

    try {
      setDownloadingPdf(true);
      const filename = `Factura_${invoice.formattedNumber}.pdf`;
      const html2pdf = await loadHtml2Pdf();

      const opt = {
        margin: [5, 5, 5, 5] as [number, number, number, number],
        filename,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["avoid-all", "css"] }
      };

      await html2pdf()
        .set(opt)
        .from(element)
        .save();
    } catch (err: unknown) {
      console.error(err);
    } finally {
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

  // Formatted Point of Sale (5 digits) and Voucher Number (8 digits) per RG 1415 / RG 4290
  const formattedPtoVta = String(invoice.pointOfSale || 1).padStart(5, "0");
  const formattedVoucherNum = String(invoice.invoiceNumber || 1).padStart(8, "0");

  const totalIva = (invoice.iva21 || 0) + (invoice.iva105 || 0) + (invoice.iva27 || 0);

  const formattedStartDate = company?.activityStartDate
    ? new Date(company.activityStartDate + "T00:00:00").toLocaleDateString("es-AR")
    : "01/03/2018";

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
              subject: `${docTitle} ${invoiceLetter} N° ${formattedPtoVta}-${formattedVoucherNum} - ${company?.tradeName || company?.legalName || "LEAL CONTROL"}`,
              body: `Estimado cliente,\n\nAdjuntamos el comprobante fiscal electrónico ${docTitle} ${invoiceLetter} N° ${formattedPtoVta}-${formattedVoucherNum} correspondiente a los servicios/productos provistos.\n\nDatos para el pago:\nBanco: ${settings.invoice.bankDetails.bankName}\nCBU: ${settings.invoice.bankDetails.cbu}\nAlias: ${settings.invoice.bankDetails.alias}\n\nSaludos cordiales,\n${company?.tradeName || "LEAL CONTROL ERP"}`
            }}
            onClose={() => setShowEmail(false)}
          />
        </div>
      )}

      {/* Main A4 Document Sheet (RG 1415 Anexo II Compliant) */}
      <div
        id="invoice-pdf-sheet"
        className="print-container"
        style={{
          width: "200mm",
          minHeight: "270mm",
          background: "white",
          margin: "0 auto",
          padding: "10mm 12mm",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
          fontFamily: "Helvetica, Arial, sans-serif",
          color: "#1e293b",
          fontSize: "11px",
          lineHeight: "1.4",
          boxSizing: "border-box",
          position: "relative"
        }}
      >
        {/* Header Section (RG 1415 Anexo II Apartado B) */}
        <div style={{ border: `1.5px solid ${primaryCol}`, borderRadius: "6px", padding: "10px", marginBottom: "8px", position: "relative" }}>
          {/* Central Letter Box */}
          <div style={{
            position: "absolute",
            left: "50%",
            top: "0",
            transform: "translateX(-50%)",
            width: "48px",
            height: "48px",
            background: "white",
            borderLeft: `1.5px solid ${primaryCol}`,
            borderRight: `1.5px solid ${primaryCol}`,
            borderBottom: `1.5px solid ${primaryCol}`,
            borderRadius: "0 0 6px 6px",
            textAlign: "center",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
          }}>
            <div style={{ fontSize: "24px", fontWeight: "bold", lineHeight: "30px", color: primaryCol }}>
              {invoiceLetter}
            </div>
            <div style={{ fontSize: "8.5px", fontWeight: "bold", color: "#64748b", marginTop: "-2px" }}>
              COD. {invoiceCode}
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                {/* Left Header: Issuer Company Data */}
                <td style={{ width: "47%", verticalAlign: "top", paddingRight: "15px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                    <img src="/logo.png?v=2" alt="Leal Control ERP" style={{ maxHeight: "55px", width: "auto" }} />
                    <div>
                      <h1 style={{ margin: 0, fontSize: "15px", fontWeight: "bold", color: primaryCol, textTransform: "uppercase" }}>
                        {company?.legalName || "LEAL CONTROL ERP S.A."}
                      </h1>
                      {company?.tradeName && (
                        <div style={{ fontSize: "10px", fontWeight: 600, color: "#475569" }}>
                          {company.tradeName}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: "10px", color: "#475569", lineHeight: "1.35", marginTop: "4px" }}>
                    <div><strong>Domicilio Comercial:</strong> {company?.fiscalStreet || "Luis Braile 705"}, {company?.fiscalCity || "San Lorenzo"}, {company?.fiscalProvince || "Santa Fe"} (CP {company?.fiscalPostalCode || "2200"})</div>
                    <div><strong>Condición frente al IVA:</strong> <span style={{ fontWeight: "bold", color: "#0f172a" }}>{company?.taxCondition || "IVA Responsable Inscripto"}</span></div>
                    {company?.phone && <div><strong>Teléfono:</strong> {company.phone}</div>}
                    {company?.email && <div><strong>Email:</strong> {company.email}</div>}
                  </div>
                </td>

                {/* Center Divider Spacer */}
                <td style={{ width: "6%" }}></td>

                {/* Right Header: Document & Issuer Fiscal Identifiers */}
                <td style={{ width: "47%", verticalAlign: "top", paddingLeft: "15px", borderLeft: "1px dashed #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: primaryCol, letterSpacing: "0.5px" }}>
                      {docTitle}
                    </h2>
                    <span style={{ fontSize: "10px", fontWeight: "bold", color: "#64748b", border: "1px solid #cbd5e1", padding: "1px 6px", borderRadius: "3px" }}>
                      ORIGINAL
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a", marginTop: "2px" }}>
                    Punto de Venta: {formattedPtoVta} &nbsp; Comp. Nro: {formattedVoucherNum}
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#334155", marginTop: "4px", lineHeight: "1.4" }}>
                    <div><strong>Fecha de Emisión:</strong> {new Date(invoice.issueDate).toLocaleDateString("es-AR")}</div>
                    <div><strong>CUIT:</strong> <span style={{ fontFamily: "monospace", fontWeight: "bold" }}>{company?.documentNumber || "30-71548962-9"}</span></div>
                    <div><strong>Ingresos Brutos:</strong> {company?.iibbNumber || "30-71548962-9"} ({company?.iibbRegime || "Convenio Multilateral"})</div>
                    <div><strong>Fecha de Inicio de Actividades:</strong> {formattedStartDate}</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Invoiced Period & Payment Due Date Bar (RG 1415 Anexo II / Servicios) */}
        <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "4px", padding: "4px 10px", marginBottom: "8px", display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#334155" }}>
          <div>
            <strong>Período Facturado Desde:</strong> {new Date(invoice.issueDate).toLocaleDateString("es-AR")} &nbsp;&nbsp;
            <strong>Hasta:</strong> {new Date(invoice.issueDate).toLocaleDateString("es-AR")}
          </div>
          <div>
            <strong>Fecha de Vto. para el Pago:</strong> <span style={{ fontWeight: "bold", color: "#b91c1c" }}>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("es-AR") : new Date(invoice.issueDate).toLocaleDateString("es-AR")}</span>
          </div>
        </div>

        {/* Customer / Receptor Section (RG 1415 Anexo II Título II) */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px 10px", marginBottom: "8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "58%", verticalAlign: "top" }}>
                  <div style={{ fontSize: "9px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase", marginBottom: "2px" }}>
                    DATOS DEL RECEPTOR / CLIENTE
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: "bold", color: "#0f172a" }}>
                    {invoice.customerName || customer?.legalName || "Cliente"}
                  </div>
                  {customer?.tradeName && (
                    <div style={{ fontSize: "10px", color: "#475569" }}>Nombre Fantasía: {customer.tradeName}</div>
                  )}
                  <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>
                    <strong>CUIT / Identificación:</strong> <span style={{ fontFamily: "monospace", fontWeight: "bold" }}>{invoice.customerDocument || customer?.documentNumber || "—"}</span>
                  </div>
                  <div style={{ fontSize: "10px", color: "#475569" }}>
                    <strong>Condición frente al IVA:</strong> {invoice.customerTaxCondition || customer?.taxCondition || "IVA Responsable Inscripto"}
                  </div>
                  <div style={{ fontSize: "10px", color: "#475569" }}>
                    <strong>Domicilio Comercial:</strong> {invoice.customerAddress || (customer?.fiscalAddress ? `${customer.fiscalAddress.street}, ${customer.fiscalAddress.city}, ${customer.fiscalAddress.province}` : "Sede Fiscal del Cliente")}
                  </div>
                </td>
                <td style={{ width: "42%", verticalAlign: "top", textAlign: "right", borderLeft: "1px dashed #cbd5e1", paddingLeft: "10px" }}>
                  <div style={{ fontSize: "9px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase", marginBottom: "2px" }}>
                    CONDICIONES COMERCIALES DE LA OPERACIÓN
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#334155" }}>
                    <strong>Condición de Venta:</strong> Cuenta Corriente Comercial / Transferencia
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#334155", marginTop: "2px" }}>
                    <strong>Moneda:</strong> {isUsd ? "USD (Dólares Estadounidenses)" : "ARS (Pesos Argentinos)"}
                  </div>
                  {isUsd && (
                    <div style={{ fontSize: "10.5px", color: "#0d9488", marginTop: "2px", fontWeight: "bold" }}>
                      Tipo de Cambio Oficial (BNA Divisa): $ {invoice.exchangeRate.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </div>
                  )}
                  {invoice.remitoId && (
                    <div style={{ fontSize: "10px", color: "#64748b", marginTop: "3px" }}>
                      <strong>Remito(s) Vinculado(s):</strong> Ref. Remito de Entrega
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section Title */}
        <div style={{ background: primaryCol, color: "white", padding: "4px 8px", fontWeight: "bold", fontSize: "10.5px", borderRadius: "4px 4px 0 0", letterSpacing: "0.5px", textTransform: "uppercase" }}>
          DETALLE DE LA OPERACIÓN
        </div>

        {/* Items Table (RG 1415 Anexo II Título III) */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", fontSize: "9px", textTransform: "uppercase", color: "#475569" }}>
              <th style={{ padding: "5px 4px", textAlign: "center", width: "4%" }}>#</th>
              <th style={{ padding: "5px 6px", textAlign: "left", width: "14%" }}>Código</th>
              <th style={{ padding: "5px 6px", textAlign: "left", width: "40%" }}>Descripción del Producto o Servicio</th>
              <th style={{ padding: "5px 6px", textAlign: "center", width: "7%" }}>Cant.</th>
              <th style={{ padding: "5px 6px", textAlign: "center", width: "6%" }}>U.M.</th>
              <th style={{ padding: "5px 6px", textAlign: "right", width: "14%" }}>Precio Unit. ({currSymbol.trim()})</th>
              <th style={{ padding: "5px 6px", textAlign: "center", width: "7%" }}>% IVA</th>
              <th style={{ padding: "5px 6px", textAlign: "right", width: "15%" }}>Subtotal ({currSymbol.trim()})</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0", fontSize: "10.5px" }}>
                <td style={{ padding: "6px 4px", textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                <td style={{ padding: "6px 6px", fontFamily: "monospace", color: "#475569" }}>{item.code || "ITEM"}</td>
                <td style={{ padding: "6px 6px" }}>
                  <div style={{ fontWeight: "bold", color: "#0f172a" }}>{item.description}</div>
                </td>
                <td style={{ padding: "6px 6px", textAlign: "center" }}>{item.quantity}</td>
                <td style={{ padding: "6px 6px", textAlign: "center", color: "#64748b" }}>u</td>
                <td style={{ padding: "6px 6px", textAlign: "right", fontFamily: "monospace" }}>
                  {item.unitPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: "6px 6px", textAlign: "center", color: "#64748b" }}>{item.vatRate}%</td>
                <td style={{ padding: "6px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                  {item.netSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals & Tax Breakdown (RG 1415 Anexo II Título IV) */}
        <div style={{ marginLeft: "auto", width: "46%", marginBottom: "10px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
            <tbody>
              <tr>
                <td style={{ padding: "2px 0", textAlign: "right", color: "#64748b" }}>Importe Neto Gravado:</td>
                <td style={{ padding: "2px 0", textAlign: "right", width: "45%", fontFamily: "monospace", fontWeight: "bold" }}>
                  {currSymbol}{invoice.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              {invoice.iva21 > 0 && (
                <tr>
                  <td style={{ padding: "2px 0", textAlign: "right", color: "#64748b" }}>IVA 21.0%:</td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace" }}>
                    {currSymbol}{invoice.iva21.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              {invoice.iva105 > 0 && (
                <tr>
                  <td style={{ padding: "2px 0", textAlign: "right", color: "#64748b" }}>IVA 10.5%:</td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace" }}>
                    {currSymbol}{invoice.iva105.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              {invoice.iva27 > 0 && (
                <tr>
                  <td style={{ padding: "2px 0", textAlign: "right", color: "#64748b" }}>IVA 27.0%:</td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace" }}>
                    {currSymbol}{invoice.iva27.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              {invoice.iibbPerception > 0 && (
                <tr>
                  <td style={{ padding: "2px 0", textAlign: "right", color: "#64748b" }}>Percepción IIBB:</td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontFamily: "monospace" }}>
                    {currSymbol}{invoice.iibbPerception.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
              <tr style={{ borderTop: `2px solid ${primaryCol}` }}>
                <td style={{ padding: "5px 0 2px 0", textAlign: "right", fontWeight: "bold", fontSize: "12px", color: "#0f172a" }}>
                  IMPORTE TOTAL:
                </td>
                <td style={{ padding: "5px 0 2px 0", textAlign: "right", fontWeight: "bold", fontSize: "13.5px", color: primaryCol, fontFamily: "monospace" }}>
                  {currSymbol}{invoice.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              {isUsd && (
                <tr>
                  <td style={{ padding: "2px 0", textAlign: "right", color: "#64748b", fontSize: "9.5px" }}>
                    Equiv. Pesos Argentinos (TC ${invoice.exchangeRate}):
                  </td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontSize: "9.5px", color: "#1e3a8a", fontFamily: "monospace", fontWeight: "bold" }}>
                    $ {(invoice.total * invoice.exchangeRate).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Amount in Words (Monto en Letras) - Standard Argentine Legal Requirement */}
        <div style={{ background: "#f8fafc", border: `1px solid ${primaryCol}33`, padding: "6px 10px", borderRadius: "4px", marginBottom: "8px", fontSize: "10px", color: "#1e293b", display: "flex", alignItems: "baseline", gap: "6px" }}>
          <strong style={{ color: primaryCol, textTransform: "uppercase", fontSize: "9.5px" }}>Importe en Letras:</strong>
          <span style={{ fontWeight: "bold", letterSpacing: "0.3px", textTransform: "uppercase", fontSize: "10px" }}>
            {numberToWords(invoice.total, invoice.currency)}
          </span>
        </div>

        {/* Banking Info Box for Invoice Collection */}
        {settings.invoice.showBankingInfo && (
          <div style={{ background: "rgba(13, 148, 136, 0.08)", border: `1px solid ${primaryCol}44`, padding: "6px 10px", borderRadius: "6px", marginBottom: "8px", fontSize: "9.5px" }}>
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
              <div style={{ fontSize: "9px", color: "#475569", marginTop: "2px", fontStyle: "italic" }}>
                {settings.invoice.paymentInstructions}
              </div>
            )}
          </div>
        )}

        {/* Notes Section */}
        {invoice.notes && (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "5px 8px", borderRadius: "4px", marginBottom: "8px", fontSize: "9.5px" }}>
            <strong>Observaciones:</strong> {invoice.notes}
          </div>
        )}

        {/* Interest Clause */}
        {settings.invoice.interestLegalText && (
          <div style={{ fontSize: "9px", color: "#64748b", marginBottom: "8px", textAlign: "center" }}>
            {settings.invoice.interestLegalText}
          </div>
        )}

        {/* Bottom Section: Transparencia Fiscal + Official ARCA CAE Box */}
        <div style={{ display: "grid", gridTemplateColumns: (invoiceLetter === "B" || invoiceLetter === "C") ? "35% 65%" : "1fr", gap: "10px" }}>
          {/* Régimen de Transparencia Fiscal al Consumidor (Ley 27.743 / RG 5614/2024) */}
          {(invoiceLetter === "B" || invoiceLetter === "C") && (
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 8px", background: "#f8fafc", fontSize: "9px" }}>
              <div style={{ fontWeight: "bold", color: "#334155", marginBottom: "2px" }}>
                Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)
              </div>
              <div><strong>IVA Contenido:</strong> $ {totalIva.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</div>
              <div><strong>Otros Impuestos Nacionales Indirectos:</strong> $ 0,00</div>
            </div>
          )}

          {/* Official ARCA CAE Box (RG 1415 Anexo II / RG 4290 / RG 4597) */}
          {invoice.status === "Authorized" && invoice.cae ? (
            <div style={{ border: `2px solid ${primaryCol}`, borderRadius: "6px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "12px", background: "#f8fafc" }}>
              {qrDataUrl && (
                <img src={qrDataUrl} alt="QR ARCA Oficial" style={{ width: "80px", height: "80px", display: "block" }} />
              )}
              <div style={{ flex: 1, fontSize: "10px", lineHeight: "1.4" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontWeight: "bold", fontSize: "13px", color: primaryCol }}>ARCA</span>
                  <span style={{ fontSize: "9.5px", color: "#64748b" }}>Agencia de Recaudación y Control Aduanero</span>
                </div>
                <div style={{ marginTop: "3px" }}>
                  <strong>C.A.E. N°:</strong> <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: "bold" }}>{invoice.cae}</span>
                </div>
                <div>
                  <strong>Fecha de Vto. de CAE:</strong> <span style={{ fontSize: "11px", fontWeight: "bold" }}>{invoice.caeDueDate ? new Date(invoice.caeDueDate).toLocaleDateString("es-AR") : "—"}</span>
                </div>
                <div style={{ fontSize: "8.5px", color: "#64748b", marginTop: "2px" }}>
                  {settings.invoice.customFooterText || "Comprobante Autorizado por ARCA. La autenticidad puede verificarse en www.afip.gob.ar/fe/qr/ escaneando el código QR."}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ border: "1px dashed #f59e0b", padding: "8px", textAlign: "center", background: "#fffbeb", borderRadius: "6px", fontSize: "10px", color: "#92400e" }}>
              🟡 <strong>Comprobante en estado Borrador / Proforma</strong> (Pendiente de Autorización Fiscal con ARCA).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
