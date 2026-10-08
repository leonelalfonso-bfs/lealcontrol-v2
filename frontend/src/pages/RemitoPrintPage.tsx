import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { RemitoDocument } from "../components/CommercialDocuments";
import { api } from "../api/client";
import { EmailComposer } from "../components/EmailComposer";
import { WhatsAppComposer } from "../components/WhatsAppComposer";
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
  const [showWhatsApp, setShowWhatsApp] = useState(false);
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
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename,
        image: { type: "jpeg" as const, quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["css", "legacy"] }
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
            onClick={() => setShowWhatsApp(true)}
            style={{ padding: "8px 16px", borderRadius: "6px", background: "white", border: "1px solid #cbd5e1", cursor: "pointer", fontWeight: 600 }}
          >
            💬 WhatsApp
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

      {showWhatsApp && (
        <WhatsAppComposer
          context={{
            entityType: "Remito",
            entityId: remito.id,
            phone: customer?.whatsApp || customer?.phone,
            body: `Hola, te enviamos el remito N° ${remito.remitoNumber}.\n\nSaludos, ${company?.tradeName || company?.legalName || ""}`,
            documentPdf: { elementId: "remito-pdf-sheet", fileName: `Remito_${remito.remitoNumber}.pdf` }
          }}
          onClose={() => setShowWhatsApp(false)}
        />
      )}

      {showEmail && (
        <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px auto" }}>
          <EmailComposer
            context={{
              entityType: "Remito",
              entityId: remito.id,
              to: customer?.email ?? undefined,
              subject: `Remito N° ${remito.remitoNumber} - ${company?.tradeName || company?.legalName || ""}`,
              body: `Estimado cliente,\n\nAdjuntamos el remito N° ${remito.remitoNumber}.\n\nSaludos cordiales,\n${company?.tradeName || company?.legalName || ""}`,
              documentPdf: { elementId: "remito-pdf-sheet", fileName: `Remito_${remito.remitoNumber}.pdf` }
            }}
            onClose={() => setShowEmail(false)}
          />
        </div>
      )}

      <div style={{ width: "720px", maxWidth: "100%", margin: "0 auto", boxShadow: "0 16px 45px rgba(22, 38, 64, 0.22)" }}>
        <RemitoDocument remito={remito} customer={customer} company={company} />
      </div>
    </div>
  );
}
