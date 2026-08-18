import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import html2pdf from "html2pdf.js";
import { api } from "../api/client";
import { type CompanySettings, type PurchaseOrder, type Supplier } from "../api/types";

export function PurchaseOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
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
        const [ord, comp] = await Promise.all([
          api.getPurchaseOrder(id!),
          api.getCompanySettings().catch(() => null)
        ]);
        setOrder(ord);
        setCompany(comp);

        if (ord.supplierId && ord.supplierId !== "00000000-0000-0000-0000-000000000000") {
          const sup = await api.getSupplier(ord.supplierId).catch(() => null);
          setSupplier(sup);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al cargar la orden de compra");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  const handleDownloadPdf = () => {
    const element = document.getElementById("purchase-order-pdf-sheet");
    if (!element || !order) return;

    try {
      setDownloadingPdf(true);
      const filename = `OrdenCompra_${order.orderNumber}.pdf`;

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
    return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Cargando orden de compra...</div>;
  }

  if (error || !order) {
    return <div style={{ padding: "40px", color: "#ef4444" }}>Error: {error || "Orden no encontrada"}</div>;
  }

  const isUsd = order.currency === "USD";
  const currSymbol = isUsd ? "USD " : "$ ";

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: "20px" }}>
      {/* Top Action Bar */}
      <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => navigate("/compras/ordenes")}
          style={{ padding: "8px 16px", borderRadius: "6px", background: "white", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600 }}
        >
          ← Volver al Listado
        </button>

        <div style={{ display: "flex", gap: "10px" }}>
          <Link
            to={`/compras/recepciones/nueva?order_id=${order.id}`}
            style={{ padding: "8px 16px", borderRadius: "6px", background: "#10b981", color: "white", textDecoration: "none", fontWeight: "bold" }}
          >
            📦 Recibir Mercadería
          </Link>

          <Link
            to={`/compras/facturas/nueva?order_id=${order.id}`}
            style={{ padding: "8px 16px", borderRadius: "6px", background: "#3b82f6", color: "white", textDecoration: "none", fontWeight: "bold" }}
          >
            🧾 Cargar Factura Proveedor
          </Link>

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

      {/* Main A4 Document Sheet */}
      <div
        id="purchase-order-pdf-sheet"
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
        <div style={{ borderBottom: "2px solid #3b82f6", paddingBottom: "10px", marginBottom: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "22%", verticalAlign: "top" }}>
                  <img src="/logo.png?v=2" alt="Leal Control ERP" style={{ maxHeight: "65px", width: "auto" }} />
                </td>
                <td style={{ width: "42%", verticalAlign: "top", paddingLeft: "10px" }}>
                  <h1 style={{ margin: 0, fontSize: "17px", color: "#3b82f6" }}>
                    {company?.legalName || "LEAL CONTROL ERP S.A."}
                  </h1>
                  <p style={{ margin: "2px 0", fontSize: "10.5px", color: "#64748b" }}>
                    {company?.tradeName || "Sistemas Comerciales, Industriales & Metrología"}
                  </p>
                  <p style={{ margin: "1px 0", fontSize: "10.5px", color: "#64748b" }}>
                    CUIT: {company?.documentNumber || "30-71548962-9"} | IIBB: {company?.iibbNumber || "Convenio Multilateral"}
                  </p>
                  <p style={{ margin: "1px 0", fontSize: "10.5px", color: "#64748b" }}>
                    {company?.fiscalStreet || "Ruta 11 Km 325"}, {company?.fiscalCity || "San Lorenzo"}, {company?.fiscalProvince || "Santa Fe"}
                  </p>
                </td>
                <td style={{ width: "36%", verticalAlign: "top", textAlign: "right" }}>
                  <h2 style={{ margin: 0, fontSize: "18px", color: "#3b82f6", letterSpacing: "0.5px" }}>
                    ORDEN DE COMPRA
                  </h2>
                  <div style={{ fontSize: "15px", fontWeight: "bold", color: "#1e293b", marginTop: "2px" }}>
                    N° {order.orderNumber}
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "3px" }}>
                    Fecha de Emisión: <strong>{new Date(order.issueDate).toLocaleDateString("es-AR")}</strong>
                  </div>
                  {order.expectedDeliveryDate && (
                    <div style={{ fontSize: "10.5px", color: "#047857" }}>
                      Entrega Requerida: <strong>{new Date(order.expectedDeliveryDate).toLocaleDateString("es-AR")}</strong>
                    </div>
                  )}
                  <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                    Moneda: <strong>{isUsd ? "USD Dólar Estadounidense" : "ARS Pesos Argentinos"}</strong>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Supplier & Delivery Data Section */}
        <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "6px", marginBottom: "12px", border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "55%", verticalAlign: "top" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase", marginBottom: "3px" }}>
                    PROVEEDOR ADJUDICADO
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>
                    {order.supplierName}
                  </div>
                  {supplier?.tradeName && (
                    <div style={{ fontSize: "10.5px", color: "#475569" }}>Nombre Fantasía: {supplier.tradeName}</div>
                  )}
                  <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                    CUIT: <strong>{order.supplierDocument}</strong>
                  </div>
                  {supplier?.address && (
                    <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                      {supplier.address.street}, {supplier.address.city}, {supplier.address.province}
                    </div>
                  )}
                </td>
                <td style={{ width: "45%", verticalAlign: "top", textAlign: "right", borderLeft: "1px dashed #cbd5e1", paddingLeft: "12px" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase", marginBottom: "3px" }}>
                    CONDICIONES & DESTINO DE ENTREGA
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: "bold", color: "#0f172a" }}>
                    Lugar de Entrega: {order.deliveryAddress || "Planta Central"}
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                    Condición de Pago: <strong>{order.paymentTerms || "Cuenta Corriente"}</strong>
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                    Medio de Pago: <strong>{order.paymentMethod || "Transferencia"}</strong>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section Title */}
        <div style={{ background: "#3b82f6", color: "white", padding: "5px 10px", fontWeight: "bold", fontSize: "11px", borderRadius: "4px 4px 0 0", letterSpacing: "0.5px", textTransform: "uppercase" }}>
          DETALLE DE PRODUCTOS / SERVICIOS SOLICITADOS
        </div>

        {/* Items Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", fontSize: "9.5px", textTransform: "uppercase", color: "#475569" }}>
              <th style={{ padding: "6px 5px", textAlign: "center", width: "5%" }}>#</th>
              <th style={{ padding: "6px 6px", textAlign: "left", width: "15%" }}>Código</th>
              <th style={{ padding: "6px 6px", textAlign: "left", width: "42%" }}>Descripción del Ítem / Repuesto</th>
              <th style={{ padding: "6px 6px", textAlign: "center", width: "8%" }}>Cant.</th>
              <th style={{ padding: "6px 6px", textAlign: "right", width: "12%" }}>Precio U.</th>
              <th style={{ padding: "6px 6px", textAlign: "center", width: "6%" }}>IVA</th>
              <th style={{ padding: "6px 6px", textAlign: "right", width: "12%" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, idx) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "6px 5px", textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                <td style={{ padding: "6px 6px", fontFamily: "monospace", color: "#334155" }}>{item.code}</td>
                <td style={{ padding: "6px 6px" }}>
                  <strong>{item.description}</strong>
                </td>
                <td style={{ padding: "6px 6px", textAlign: "center", fontWeight: "bold" }}>{item.quantity}</td>
                <td style={{ padding: "6px 6px", textAlign: "right", fontFamily: "monospace" }}>
                  {currSymbol}{item.unitPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: "6px 6px", textAlign: "center", color: "#64748b" }}>{item.taxRate}%</td>
                <td style={{ padding: "6px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                  {currSymbol}{item.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals Breakdown */}
        <div style={{ marginLeft: "auto", width: "45%", marginBottom: "16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <tbody>
              <tr>
                <td style={{ padding: "3px 0", textAlign: "right", color: "#64748b" }}>Subtotal Neto:</td>
                <td style={{ padding: "3px 0", textAlign: "right", width: "45%", fontFamily: "monospace", fontWeight: "bold" }}>
                  {currSymbol}{order.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "3px 0", textAlign: "right", color: "#64748b" }}>IVA Estimado:</td>
                <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace" }}>
                  {currSymbol}{order.taxAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              <tr style={{ borderTop: "2px solid #3b82f6" }}>
                <td style={{ padding: "6px 0 3px 0", textAlign: "right", fontWeight: "bold", fontSize: "13px", color: "#0f172a" }}>
                  TOTAL ORDEN DE COMPRA:
                </td>
                <td style={{ padding: "6px 0 3px 0", textAlign: "right", fontWeight: "bold", fontSize: "14px", color: "#047857", fontFamily: "monospace" }}>
                  {currSymbol}{order.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </td>
              </tr>
              {isUsd && (
                <tr>
                  <td style={{ padding: "2px 0", textAlign: "right", color: "#64748b", fontSize: "10px" }}>
                    Equiv. ARS (TC ${order.exchangeRate}):
                  </td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontSize: "10px", color: "#1e3a8a", fontFamily: "monospace", fontWeight: "bold" }}>
                    $ {(order.total * order.exchangeRate).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Notes & Clauses */}
        {order.notes && (
          <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", padding: "8px 12px", borderRadius: "6px", marginBottom: "16px", fontSize: "10px" }}>
            <strong>Observaciones y Condiciones Particulares:</strong> {order.notes}
          </div>
        )}

        {/* Authorization Signatures */}
        <div style={{ marginTop: "30px", borderTop: "2px solid #cbd5e1", paddingTop: "15px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "48%", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "12px", verticalAlign: "top", height: "85px" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase", marginBottom: "30px" }}>
                    AUTORIZADO POR (DEPTO. DE COMPRAS / GERENCIA)
                  </div>
                  <div style={{ borderTop: "1px dashed #94a3b8", paddingTop: "4px", fontSize: "10px", color: "#64748b", textAlign: "center" }}>
                    Firma, Aclaración y Sello de Autorización
                  </div>
                </td>
                <td style={{ width: "4%" }}></td>
                <td style={{ width: "48%", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "12px", verticalAlign: "top", height: "85px" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase", marginBottom: "30px" }}>
                    ACEPTACIÓN DE PROVEEDOR
                  </div>
                  <div style={{ borderTop: "1px dashed #94a3b8", paddingTop: "4px", fontSize: "10px", color: "#64748b", textAlign: "center" }}>
                    Firma de Conformidad / Fecha Estimada de Despacho
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
