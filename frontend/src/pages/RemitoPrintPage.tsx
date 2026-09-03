import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { api } from "../api/client";
import { EmailComposer } from "../components/EmailComposer";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { type CompanySettings, type CustomerDetail, type Remito } from "../api/types";

export function RemitoPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useDocumentTemplate();

  const [remito, setRemito] = useState<Remito | null>(null);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    async function loadRemitoData() {
      try {
        setLoading(true);
        const [r, comp] = await Promise.all([
          api.getRemito(id!),
          api.getCompanySettings().catch(() => null)
        ]);
        setRemito(r);
        setCompany(comp);

        if (r.customerId && r.customerId !== "00000000-0000-0000-0000-000000000000") {
          const cust = await api.getCustomer(r.customerId).catch(() => null);
          setCustomer(cust);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al cargar remito");
      } finally {
        setLoading(false);
      }
    }

    loadRemitoData();
  }, [id]);

  const handleDownloadPdf = async () => {
    const element = document.getElementById("remito-pdf-sheet");
    if (!element || !remito) return;

    try {
      setDownloadingPdf(true);
      const filename = `Remito_${remito.remitoNumber}.pdf`;
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
    return (
      <div style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif", color: "#64748b" }}>
        Cargando documento de remito...
      </div>
    );
  }

  if (error || !remito) {
    return (
      <div style={{ padding: "40px", color: "#ef4444", fontFamily: "sans-serif" }}>
        Error: {error || "Remito no encontrado"}
      </div>
    );
  }

  const primaryCol = settings.global.primaryColor;

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: "20px" }}>
      {/* Top Action Bar */}
      <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => navigate("/remitos")}
          style={{ padding: "8px 16px", borderRadius: "6px", background: "white", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600 }}
        >
          ← Volver a Remitos
        </button>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={() => setShowEmail(!showEmail)}
            style={{ padding: "8px 16px", borderRadius: "6px", background: "white", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600 }}
          >
            ✉️ Enviar por Email
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            style={{
              padding: "8px 18px",
              borderRadius: "6px",
              background: primaryCol,
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            {downloadingPdf ? "Generando PDF..." : "📥 Descargar PDF"}
          </button>
        </div>
      </div>

      {showEmail && (
        <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px auto" }}>
          <EmailComposer
            context={{
              entityType: "Remito",
              entityId: remito.id,
              to: customer?.email ?? undefined,
              subject: `Remito de Entrega N° ${remito.remitoNumber} - ${company?.tradeName || company?.legalName || "LEAL CONTROL"}`,
              body: `Estimado cliente,\n\nAdjuntamos el remito de entrega oficial N° ${remito.remitoNumber} correspondiente a la mercadería despachada.\n\nSaludos cordiales,\n${company?.tradeName || "LEAL CONTROL ERP"}`
            }}
            onClose={() => setShowEmail(false)}
          />
        </div>
      )}

      {/* Main A4 Document Sheet - Targeted by html2pdf.js */}
      <div
        id="remito-pdf-sheet"
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
                    R
                  </div>
                  <div style={{ fontSize: "9px", marginTop: "3px", fontWeight: "bold", color: primaryCol }}>
                    COD. 91
                  </div>
                </td>
                <td style={{ width: "28%", verticalAlign: "top", textAlign: "right" }}>
                  <h2 style={{ margin: 0, fontSize: "16px", color: primaryCol, letterSpacing: "0.5px" }}>
                    {settings.remito.headerTitle}
                  </h2>
                  <div style={{ fontSize: "14px", fontWeight: "bold", color: "#1e293b", marginTop: "2px" }}>
                    N° {remito.remitoNumber}
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "3px" }}>
                    Fecha de Emisión: <strong>{new Date(remito.issueDate).toLocaleDateString("es-AR")}</strong>
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                    Fecha de Entrega: <strong>{new Date(remito.deliveryDate).toLocaleDateString("es-AR")}</strong>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Client & Logistics Data Section */}
        <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "6px", marginBottom: "12px", border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "55%", verticalAlign: "top" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase", marginBottom: "3px" }}>
                    CLIENTE / DESTINATARIO (DATOS FISCALES)
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0f172a" }}>
                    {remito.customerName || customer?.legalName || "Cliente"}
                  </div>
                  {customer?.tradeName && (
                    <div style={{ fontSize: "10.5px", color: "#475569" }}>Nombre Fantasía: {customer.tradeName}</div>
                  )}
                  <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                    CUIT: <strong>{remito.customerDocument || customer?.documentNumber || "—"}</strong> | IVA: {customer?.taxCondition || "Responsable Inscripto"}
                  </div>
                  {customer?.fiscalAddress && (
                    <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                      Sede Fiscal: {customer.fiscalAddress.street}, {customer.fiscalAddress.city}, {customer.fiscalAddress.province}
                    </div>
                  )}
                </td>
                <td style={{ width: "45%", verticalAlign: "top", textAlign: "right", borderLeft: "1px dashed #cbd5e1", paddingLeft: "12px" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: "bold", color: primaryCol, textTransform: "uppercase", marginBottom: "3px" }}>
                    LUGAR DE ENTREGA & LOGÍSTICA
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: "bold", color: "#0f172a" }}>
                    {remito.deliveryAddress || "Dirección Fiscal del Cliente"}
                  </div>
                  {settings.remito.showCarrierInfo && (
                    <>
                      {remito.carrierName && (
                        <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>
                          Transporte / Chofer: <strong>{remito.carrierName}</strong>
                        </div>
                      )}
                      {remito.driverLicense && (
                        <div style={{ fontSize: "10.5px", color: "#64748b" }}>
                          Patente / Dominio: <strong>{remito.driverLicense}</strong>
                        </div>
                      )}
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section Title */}
        <div style={{ background: primaryCol, color: "white", padding: "5px 10px", fontWeight: "bold", fontSize: "11px", borderRadius: "4px 4px 0 0", letterSpacing: "0.5px", textTransform: "uppercase" }}>
          MERCADERÍA Y DETALLE DE DESPACHO
        </div>

        {/* Items Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
          <thead>
            <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1", fontSize: "9.5px", textTransform: "uppercase", color: "#475569" }}>
              <th style={{ padding: "6px 5px", textAlign: "center", width: "5%" }}>#</th>
              <th style={{ padding: "6px 8px", textAlign: "left", width: "18%" }}>Código</th>
              <th style={{ padding: "6px 8px", textAlign: "left", width: "57%" }}>Descripción del Artículo / Mercadería & Números de Serie</th>
              <th style={{ padding: "6px 8px", textAlign: "center", width: "10%" }}>Cantidad</th>
              <th style={{ padding: "6px 8px", textAlign: "center", width: "10%" }}>Unidad</th>
            </tr>
          </thead>
          <tbody>
            {remito.items.map((item, idx) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px 5px", textAlign: "center", color: "#64748b" }}>{idx + 1}</td>
                <td style={{ padding: "8px 8px", fontFamily: "monospace", fontWeight: "bold", color: "#334155" }}>
                  {item.code || "ITEM"}
                </td>
                <td style={{ padding: "8px 8px" }}>
                  <div style={{ fontWeight: "bold", color: "#0f172a" }}>{item.description}</div>
                </td>
                <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: "bold", fontSize: "12px", color: primaryCol }}>
                  {item.quantity.toLocaleString("es-AR", { minimumFractionDigits: item.quantity % 1 === 0 ? 0 : 2 })}
                </td>
                <td style={{ padding: "8px 8px", textAlign: "center", color: "#64748b" }}>
                  {item.unitMeasure || "u"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Notes Section */}
        {remito.notes && (
          <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", padding: "8px 12px", borderRadius: "6px", marginBottom: "16px", fontSize: "10.5px" }}>
            <strong>Observaciones de Entrega:</strong> {remito.notes}
          </div>
        )}

        {/* Carrier & Reception Clauses */}
        <div style={{ fontSize: "10px", color: "#475569", marginBottom: "6px" }}>
          {settings.remito.carrierLegalText}
        </div>
        <div style={{ fontSize: "10px", color: "#475569", fontStyle: "italic", marginBottom: "16px" }}>
          "{settings.remito.receptionClause}"
        </div>

        {/* Conformity & Signature Footer Box */}
        {settings.remito.showSignaturesBox && (
          <div style={{ marginTop: "20px", borderTop: "2px solid #cbd5e1", paddingTop: "15px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ width: "48%", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "12px", verticalAlign: "top", height: "85px" }}>
                    <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase", marginBottom: "26px" }}>
                      ENTREGÓ CONFORME (TRANSPORTE / CHOFER)
                    </div>
                    <div style={{ borderTop: "1px dashed #94a3b8", paddingTop: "4px", fontSize: "10px", color: "#64748b", textAlign: "center" }}>
                      Firma, Aclaración y DNI del Transportista
                    </div>
                  </td>
                  <td style={{ width: "4%" }}></td>
                  <td style={{ width: "48%", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "12px", verticalAlign: "top", height: "85px" }}>
                    <div style={{ fontSize: "9.5px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase", marginBottom: "26px" }}>
                      RECIBIÓ CONFORME EN DESTINO (PLANTA / CLIENTE)
                    </div>
                    <div style={{ borderTop: "1px dashed #94a3b8", paddingTop: "4px", fontSize: "10px", color: "#64748b", textAlign: "center" }}>
                      Firma, Aclaración, DNI y Fecha de Recepción
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom Legal Notice */}
        <div style={{ marginTop: "15px", textAlign: "center", fontSize: "9.5px", color: "#94a3b8" }}>
          {settings.remito.customFooterText}
        </div>
      </div>
    </div>
  );
}
