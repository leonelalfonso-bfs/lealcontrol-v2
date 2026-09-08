import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualityComplaint } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";

const STATUS_LABEL: Record<string, string> = {
  Open: "Registrada",
  UnderValidation: "En validación",
  Invalid: "No procede",
  Investigating: "En investigación",
  PendingCommunication: "Pendiente de comunicación",
  Closed: "Cerrada",
  Cancelled: "Anulada"
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

/** Impresión / PDF de una instancia PG03-R01 (formato tipo planilla SGC). */
export function QualityComplaintPrintPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<QualityComplaint | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.getQualityComplaint(id),
      api.getCompanySettings().catch(() => null)
    ])
      .then(([complaint, settings]) => {
        setRow(complaint);
        setCompany(settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const downloadPdf = async () => {
    const el = document.getElementById("pg03-r01-sheet");
    if (!el || !row) return;
    setDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `PG03-R01_${row.number}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["avoid-all", "css"] }
        })
        .from(el)
        .save();
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="workspace-page pad">Cargando queja…</div>;
  if (error || !row) {
    return (
      <div className="workspace-page pad" style={{ color: "#b91c1c" }}>
        {error || "Queja no encontrada"}
        <div style={{ marginTop: 12 }}>
          <Link to="/calidad/registros/quejas">← Volver</Link>
        </div>
      </div>
    );
  }

  const cell: CSSProperties = {
    border: "1px solid #334155",
    padding: "6px 8px",
    fontSize: 12,
    verticalAlign: "top"
  };
  const label: CSSProperties = { ...cell, background: "#f1f5f9", fontWeight: 700, width: "28%" };
  const companyName = company?.legalName || company?.tradeName || "Empresa";

  return (
    <div style={{ background: "#e2e8f0", minHeight: "100vh", padding: 20 }}>
      <div
        className="no-print"
        style={{
          maxWidth: "210mm",
          margin: "0 auto 16px",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center"
        }}
      >
        <button type="button" className="btn btn-outline" onClick={() => navigate("/calidad/registros/quejas")}>
          ← Volver al listado
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>
            Imprimir
          </button>
          <button type="button" className="btn btn-primary" disabled={downloading} onClick={() => void downloadPdf()}>
            {downloading ? "Generando PDF…" : "Descargar PDF"}
          </button>
        </div>
      </div>

      <div
        id="pg03-r01-sheet"
        style={{
          maxWidth: "210mm",
          margin: "0 auto",
          background: "#fff",
          color: "#0f172a",
          padding: "14mm 12mm",
          boxShadow: "0 4px 24px rgba(15,23,42,0.12)",
          fontFamily: "Georgia, 'Times New Roman', serif"
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <tbody>
            <tr>
              <td style={{ ...cell, width: "26%", textAlign: "center", verticalAlign: "middle" }}>
                {company?.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt={companyName}
                    crossOrigin="anonymous"
                    style={{ maxHeight: 52, maxWidth: 140, objectFit: "contain", display: "block", margin: "0 auto 4px" }}
                  />
                ) : null}
                <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>{companyName}</div>
                {company?.documentNumber ? (
                  <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>CUIT {company.documentNumber}</div>
                ) : null}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>
                <div style={{ fontSize: 11, letterSpacing: 0.04 }}>SISTEMA DE GESTIÓN DE CALIDAD · ISO/IEC 17025</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>PG03-R01 · Seguimiento de quejas</div>
              </td>
              <td style={{ ...cell, width: "24%", fontSize: 11 }}>
                <div><strong>Código:</strong> PG03-R01</div>
                <div><strong>Nº:</strong> {row.number}</div>
                <div><strong>Estado:</strong> {STATUS_LABEL[row.status] ?? row.status}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={label}>Fecha de recepción</td>
              <td style={cell}>{fmt(row.receivedAt)}</td>
              <td style={label}>Canal</td>
              <td style={cell}>{row.channel}</td>
            </tr>
            <tr>
              <td style={label}>Reclamante</td>
              <td style={cell} colSpan={3}>{row.partyName}</td>
            </tr>
            <tr>
              <td style={label}>Contacto</td>
              <td style={cell} colSpan={3}>{row.partyContact || "—"}</td>
            </tr>
            <tr>
              <td style={label}>Responsable</td>
              <td style={cell} colSpan={3}>{row.responsible || "—"}</td>
            </tr>
            <tr>
              <td style={label}>Descripción de la queja</td>
              <td style={{ ...cell, minHeight: 72, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.description}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 12, fontWeight: 800, margin: "12px 0 6px" }}>1. Validación (plazo 2 días)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={label}>¿Procede?</td>
              <td style={cell}>
                {row.isValid == null ? "Pendiente" : row.isValid ? "Sí" : "No"}
              </td>
              <td style={label}>Fecha validación</td>
              <td style={cell}>{fmt(row.validatedAt)}</td>
            </tr>
            <tr>
              <td style={label}>Observaciones</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap", minHeight: 48 }} colSpan={3}>
                {row.validationNotes || "—"}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 12, fontWeight: 800, margin: "12px 0 6px" }}>2. Investigación (plazo 5 días)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={{ ...cell, whiteSpace: "pre-wrap", minHeight: 80 }}>{row.investigation || "—"}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 12, fontWeight: 800, margin: "12px 0 6px" }}>3. Acciones / comunicación (plazo 2 días)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={label}>Acciones</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap", minHeight: 64 }} colSpan={3}>
                {row.actions || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Comunicado</td>
              <td style={cell}>{fmt(row.communicatedAt)}</td>
              <td style={label}>Cierre</td>
              <td style={cell}>{fmt(row.closedAt)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 12, fontWeight: 800, margin: "12px 0 6px" }}>Plazos SLA (calculados al registrar)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <tbody>
            <tr>
              <td style={label}>Registro</td>
              <td style={cell}>{fmt(row.registerDueAt)}</td>
              <td style={label}>Validación</td>
              <td style={cell}>{fmt(row.validateDueAt)}</td>
            </tr>
            <tr>
              <td style={label}>Investigación</td>
              <td style={cell}>{fmt(row.investigateDueAt)}</td>
              <td style={label}>Cierre</td>
              <td style={cell}>{fmt(row.closeDueAt)}</td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: 10, color: "#64748b", margin: 0 }}>
          Copia generada desde Leal Control · {row.recordCode} · {new Date().toLocaleString("es-AR")} · COPIA NO CONTROLADA
        </p>
      </div>

      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          #pg03-r01-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
}
