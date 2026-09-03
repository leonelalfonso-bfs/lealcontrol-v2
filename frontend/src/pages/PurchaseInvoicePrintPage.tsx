import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { api } from "../api/client";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { numberToWords } from "../utils/numberToWords";
import { type CompanySettings, type PurchaseInvoice, type Supplier } from "../api/types";

export function PurchaseInvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useDocumentTemplate();

  const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    async function loadData() {
      try {
        setLoading(true);
        const [inv, comp] = await Promise.all([
          api.getPurchaseInvoice(id!),
          api.getCompanySettings().catch(() => null)
        ]);
        setInvoice(inv);
        setCompany(comp);

        if (inv.supplierId && inv.supplierId !== "00000000-0000-0000-0000-000000000000") {
          const sup = await api.getSupplier(inv.supplierId).catch(() => null);
          setSupplier(sup);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al cargar la factura de compra");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  const handleDownloadPdf = async () => {
    const element = document.getElementById("purchase-invoice-pdf-sheet");
    if (!element || !invoice) return;

    try {
      setDownloadingPdf(true);
      const filename = `FacturaCompra_${invoice.formattedNumber}_${invoice.supplierName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      const html2pdf = await loadHtml2Pdf();

      const opt = {
        margin: [5, 5, 5, 5] as [number, number, number, number],
        filename,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["avoid-all", "css"] }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Cargando comprobante de compra...</div>;
  }

  if (error || !invoice) {
    return <div style={{ padding: "40px", color: "#ef4444" }}>Error: {error || "Factura no encontrada"}</div>;
  }

  const isUsd = invoice.currency === "USD";
  const currSymbol = isUsd ? "USD " : "$ ";
  const totalIva = invoice.iva21 + invoice.iva105 + invoice.iva27;
  const hasStockItems = invoice.items && invoice.items.some((i) => !!i.productId);
  const isReceived = !!invoice.purchaseReceptionId;

  const letterCodeMap: Record<string, string> = {
    A: "COD. 01",
    B: "COD. 06",
    C: "COD. 11",
    M: "COD. 51",
    NC_A: "COD. 03",
    NC_B: "COD. 08",
    NC_C: "COD. 13",
    ND_A: "COD. 02",
    ND_B: "COD. 07",
    ND_C: "COD. 12"
  };

  const invoiceTypeTitle =
    invoice.invoiceType.startsWith("NC")
      ? "NOTA DE CRÉDITO"
      : invoice.invoiceType.startsWith("ND")
      ? "NOTA DE DÉBITO"
      : "FACTURA DE PROVEEDOR";

  const letterDisplay = invoice.invoiceType.replace(/^(NC_|ND_)/, "") || "A";

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: "20px" }}>
      {/* Top Action Bar */}
      <div
        className="no-print"
        style={{
          maxWidth: "210mm",
          margin: "0 auto 16px auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px"
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/compras/facturas")}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            background: "white",
            border: "1px solid #cbd5e1",
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          ← Volver a Facturas
        </button>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {hasStockItems && !isReceived && (
            <Link
              to={`/compras/recepciones/nueva?invoice_id=${invoice.id}`}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                background: "#0284c7",
                color: "white",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "0.88rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              📦 Recibir Mercadería (Remito)
            </Link>
          )}

          {invoice.status !== "Paid" && (
            <Link
              to={`/finanzas/pagos/nueva`}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                background: "#10b981",
                color: "white",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "0.88rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              💳 Pagar Factura
            </Link>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              background: "#1e293b",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            🖨️ Imprimir (Ctrl+P)
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              background: "#0284c7",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            {downloadingPdf ? "Generando..." : "📥 Descargar PDF"}
          </button>
        </div>
      </div>

      {/* Printable Sheet (A4 portrait) */}
      <div
        id="purchase-invoice-pdf-sheet"
        style={{
          maxWidth: "210mm",
          minHeight: "297mm",
          margin: "0 auto",
          background: "white",
          padding: "16mm 14mm",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
          borderRadius: "4px",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: "11px",
          lineHeight: "1.4",
          boxSizing: "border-box"
        }}
      >
        {/* Header Voucher Box */}
        <div style={{ border: "2px solid #0f172a", borderRadius: "6px", position: "relative", marginBottom: "12px" }}>
          {/* Central Letter Box */}
          <div
            style={{
              position: "absolute",
              top: "-1px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "48px",
              height: "44px",
              background: "white",
              border: "2px solid #0f172a",
              borderTop: "none",
              borderBottomLeftRadius: "6px",
              borderBottomRightRadius: "6px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2
            }}
          >
            <span style={{ fontSize: "20px", fontWeight: "900", lineHeight: "1" }}>{letterDisplay}</span>
            <span style={{ fontSize: "7px", fontWeight: "bold", color: "#475569" }}>
              {letterCodeMap[invoice.invoiceType] || "COD. 01"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "12px 14px" }}>
            {/* Left Column: Supplier / Issuer Info */}
            <div style={{ paddingRight: "28px" }}>
              <h2 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "900", color: "#0f172a" }}>
                {invoice.supplierName}
              </h2>
              <div style={{ color: "#334155", fontSize: "10px", marginBottom: "2px" }}>
                <strong>CUIT Emisor:</strong> {invoice.supplierDocument}
              </div>
              <div style={{ color: "#334155", fontSize: "10px", marginBottom: "2px" }}>
                <strong>Condición IVA:</strong> {invoice.supplierTaxCondition}
              </div>
              {supplier?.fiscalStreet && (
                <div style={{ color: "#475569", fontSize: "9.5px" }}>
                  <strong>Domicilio:</strong> {supplier.fiscalStreet} {supplier.fiscalCity ? ` - ${supplier.fiscalCity}` : ""}
                </div>
              )}
              {supplier?.email && (
                <div style={{ color: "#475569", fontSize: "9.5px" }}>
                  <strong>Email:</strong> {supplier.email}
                </div>
              )}
            </div>

            {/* Right Column: Invoice Info */}
            <div style={{ borderLeft: "1px solid #cbd5e1", paddingLeft: "28px" }}>
              <div style={{ fontSize: "14px", fontWeight: "900", textTransform: "uppercase", color: "#0f172a", marginBottom: "4px" }}>
                {invoiceTypeTitle}
              </div>
              <div style={{ fontSize: "13px", fontWeight: "bold", fontFamily: "monospace", color: "#0f172a", marginBottom: "6px" }}>
                N° {invoice.formattedNumber}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px", fontSize: "10px", color: "#334155" }}>
                <strong>Fecha de Emisión:</strong>
                <span>{new Date(invoice.issueDate).toLocaleDateString("es-AR")}</span>

                <strong>Fecha de Vto. Pago:</strong>
                <span style={{ fontWeight: "bold", color: "#b91c1c" }}>{new Date(invoice.dueDate).toLocaleDateString("es-AR")}</span>

                <strong>Moneda / Tipo Cambio:</strong>
                <span>{invoice.currency} {isUsd ? `(Cotiz. $ ${invoice.exchangeRate})` : ""}</span>

                {invoice.cae && (
                  <>
                    <strong>CAE N°:</strong>
                    <span style={{ fontFamily: "monospace", fontWeight: "bold", color: "#047857" }}>{invoice.cae}</span>
                  </>
                )}

                {invoice.caeDueDate && (
                  <>
                    <strong>Vto. CAE:</strong>
                    <span>{new Date(invoice.caeDueDate).toLocaleDateString("es-AR")}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Client / Buyer (Our Company) Info Box */}
        <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px", background: "#f8fafc" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: "10px" }}>
            <div>
              <span className="muted" style={{ fontSize: "8px", textTransform: "uppercase", fontWeight: "bold", display: "block" }}>
                Receptor / Comprador:
              </span>
              <strong style={{ fontSize: "11px", color: "#0f172a" }}>
                {company?.legalName || company?.tradeName || "LEAL CONTROL"}
              </strong>
              <div style={{ color: "#475569" }}>
                <strong>CUIT:</strong> {company?.documentNumber || "30-71548962-9"}
              </div>
            </div>
            <div>
              <div style={{ color: "#475569", marginTop: "10px" }}>
                <strong>Condición IVA:</strong> {company?.taxCondition || "Responsable Inscripto"}
              </div>
              <div style={{ color: "#475569" }}>
                <strong>Domicilio Fiscal:</strong> {company?.fiscalStreet ? `${company.fiscalStreet} ${company.fiscalCity || ""}` : "Ruta 11 Km 325 - Santa Fe, Argentina"}
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflow: "hidden", marginBottom: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1", textAlign: "left", fontWeight: "bold", color: "#334155" }}>
                <th style={{ padding: "6px 8px", width: "12%" }}>Código</th>
                <th style={{ padding: "6px 8px", width: "42%" }}>Descripción / Concepto</th>
                <th style={{ padding: "6px 8px", width: "10%", textAlign: "center" }}>Cant.</th>
                <th style={{ padding: "6px 8px", width: "12%", textAlign: "right" }}>Precio Neto U.</th>
                <th style={{ padding: "6px 8px", width: "10%", textAlign: "center" }}>IVA</th>
                <th style={{ padding: "6px 8px", width: "14%", textAlign: "right" }}>Subtotal Neto</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((it, idx) => (
                  <tr
                    key={it.id || idx}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: idx % 2 === 0 ? "white" : "#fafafa"
                    }}
                  >
                    <td style={{ padding: "6px 8px", fontFamily: "monospace", color: "#475569" }}>
                      {it.code || "COMPRA"}
                    </td>
                    <td style={{ padding: "6px 8px", fontWeight: "500" }}>
                      {it.description}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: "bold" }}>
                      {parseInt(String(it.quantity), 10) || 1}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>
                      {currSymbol}{Number(it.unitPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center", color: "#047857", fontWeight: "600" }}>
                      {it.vatRate}%
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                      {currSymbol}{(it.quantity * it.unitPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>
                    Insumos / Servicios Generales
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown & Taxes */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px", marginBottom: "14px" }}>
          {/* Notes & Status Box */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px 10px", background: "#f8fafc" }}>
              <span style={{ fontSize: "8.5px", fontWeight: "bold", textTransform: "uppercase", color: "#64748b" }}>
                Observaciones / Detalle Adicional:
              </span>
              <p style={{ margin: "2px 0 0 0", fontSize: "9.5px", color: "#334155" }}>
                {invoice.notes || "Sin observaciones adicionales."}
              </p>
            </div>

            {/* Tracking Badges */}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <div
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: isReceived ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)",
                  border: isReceived ? "1px solid #10b981" : "1px solid #f59e0b"
                }}
              >
                <span style={{ fontSize: "8px", textTransform: "uppercase", fontWeight: "bold", color: "#475569" }}>
                  Estado de Stock:
                </span>
                <div style={{ fontWeight: 700, fontSize: "10px", color: isReceived ? "#065f46" : "#92400e" }}>
                  {isReceived ? "✓ Mercadería Recibida" : hasStockItems ? "📥 Recepción Pendiente" : "📋 No inventariable"}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: invoice.status === "Paid" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: invoice.status === "Paid" ? "1px solid #10b981" : "1px solid #ef4444"
                }}
              >
                <span style={{ fontSize: "8px", textTransform: "uppercase", fontWeight: "bold", color: "#475569" }}>
                  Estado de Pago:
                </span>
                <div style={{ fontWeight: 700, fontSize: "10px", color: invoice.status === "Paid" ? "#065f46" : "#b91c1c" }}>
                  {invoice.status === "Paid" ? "✓ Factura Pagada" : "⏳ Pendiente de Pago"}
                </div>
              </div>
            </div>
          </div>

          {/* Taxes & Grand Total Table */}
          <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", padding: "8px 12px", background: "#f8fafc" }}>
            <table style={{ width: "100%", fontSize: "10px", lineHeight: "1.6" }}>
              <tbody>
                <tr>
                  <td style={{ color: "#475569" }}>Subtotal Neto Gravado:</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                    {currSymbol}{invoice.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>

                {invoice.iva21 > 0 && (
                  <tr>
                    <td style={{ color: "#475569" }}>IVA 21.0%:</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {currSymbol}{invoice.iva21.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {invoice.iva105 > 0 && (
                  <tr>
                    <td style={{ color: "#475569" }}>IVA 10.5%:</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {currSymbol}{invoice.iva105.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {invoice.iva27 > 0 && (
                  <tr>
                    <td style={{ color: "#475569" }}>IVA 27.0%:</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {currSymbol}{invoice.iva27.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {invoice.iibbPerception > 0 && (
                  <tr>
                    <td style={{ color: "#475569" }}>Percepción Ingresos Brutos (IIBB):</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {currSymbol}{invoice.iibbPerception.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {invoice.ivaPerception > 0 && (
                  <tr>
                    <td style={{ color: "#475569" }}>Percepción IVA:</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {currSymbol}{invoice.ivaPerception.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {invoice.otherTaxes > 0 && (
                  <tr>
                    <td style={{ color: "#475569" }}>Otros Tributos / Impuestos:</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {currSymbol}{invoice.otherTaxes.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                <tr style={{ borderTop: "2px solid #0f172a" }}>
                  <td style={{ paddingTop: "6px", fontSize: "12px", fontWeight: "900", color: "#0f172a" }}>
                    TOTAL FACTURA:
                  </td>
                  <td style={{ paddingTop: "6px", textAlign: "right", fontSize: "14px", fontWeight: "900", fontFamily: "monospace", color: "#0f172a" }}>
                    {currSymbol}{invoice.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Amount in words */}
        <div style={{ padding: "6px 10px", background: "#f1f5f9", borderRadius: "4px", fontSize: "9px", color: "#334155", marginBottom: "14px" }}>
          <strong>Son:</strong> {numberToWords(invoice.total)} {isUsd ? "DÓLARES ESTADOUNIDENSES" : "PESOS ARGENTINOS"}
        </div>

        {/* Footer Legal & System Stamp */}
        <div
          style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: "8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "8.5px",
            color: "#94a3b8"
          }}
        >
          <div>
            Comprobante fiscal registrado en <strong>LEAL CONTROL ERP</strong> · Módulo de Compras & Cuentas por Pagar
          </div>
          <div>
            Registro #{invoice.id.slice(0, 8)} · Fecha: {new Date(invoice.createdAtUtc).toLocaleString("es-AR")}
          </div>
        </div>
      </div>
    </div>
  );
}
