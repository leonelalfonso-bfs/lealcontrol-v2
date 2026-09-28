import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { CompanySettings, CustomerDetail, Order } from "../api/types";
import { OrderDocument } from "../components/CommercialDocuments";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";

export function OrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useDocumentTemplate();
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const [result, companySettings] = await Promise.all([api.getOrder(id!), api.getCompanySettings().catch(() => null)]);
        setOrder(result);
        setCompany(companySettings);
        if (result.customerId) setCustomer(await api.getCustomer(result.customerId).catch(() => null));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar pedido");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  async function download() {
    const element = document.getElementById("order-pdf-sheet");
    if (!element || !order) return;
    try {
      setDownloading(true);
      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set({
        margin: [10, 10, 10, 10], filename: `Pedido_${order.orderNumber}.pdf`,
        image: { type: "jpeg", quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] }
      }).from(element).save();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el PDF");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <div style={{ padding: 40 }}>Cargando pedido...</div>;
  if (error || !order) return <div style={{ padding: 40, color: "#b91c1c" }}>{error || "Pedido no encontrado"}</div>;
  return <div style={{ minHeight: "100vh", padding: 20, background: "#f1f5f9" }}>
    <div className="no-print" style={{ width: 720, maxWidth: "100%", margin: "0 auto 16px", display: "flex", justifyContent: "space-between", gap: 12 }}>
      <button type="button" className="btn ghost" onClick={() => navigate(`/pedidos/${order.id}`)}>← Volver al pedido</button>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn ghost" onClick={() => window.print()}>Imprimir</button>
        <button type="button" className="btn" disabled={downloading} onClick={() => void download()} style={{ background: settings.global.primaryColor }}>{downloading ? "Generando PDF..." : "Descargar PDF"}</button>
      </div>
    </div>
    <div style={{ width: 720, maxWidth: "100%", margin: "0 auto", boxShadow: "0 16px 45px rgba(22, 38, 64, 0.22)" }}>
      <OrderDocument order={order} customer={customer} company={company} />
    </div>
  </div>;
}
