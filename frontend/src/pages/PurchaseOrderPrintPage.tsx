import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { PurchaseOrderDocument } from "../components/CommercialDocuments";
import { api } from "../api/client";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { type CompanySettings, type PurchaseOrder, type Supplier } from "../api/types";

export function PurchaseOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings } = useDocumentTemplate();

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

  const handleDownloadPdf = async () => {
    const element = document.getElementById("purchase-order-pdf-sheet");
    if (!element || !order) return;

    try {
      setDownloadingPdf(true);
      const filename = `OrdenCompra_${order.orderNumber}.pdf`;

      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename,
        image: { type: "jpeg" as const, quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["css", "legacy"] }
      };

      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set(opt).from(element).save();
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Cargando orden de compra...</div>;
  }

  if (error || !order) {
    return <div style={{ padding: "40px", color: "#ef4444" }}>Error: {error || "Orden no encontrada"}</div>;
  }


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

      <div style={{ width: "720px", maxWidth: "100%", margin: "0 auto", boxShadow: "0 16px 45px rgba(22, 38, 64, 0.22)" }}>
        <PurchaseOrderDocument order={order} supplier={supplier} company={company} />
      </div>
    </div>
  );
}
