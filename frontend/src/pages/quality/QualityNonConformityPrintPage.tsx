import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualityNonConformity } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";
import { labelOf, NC_ORIGIN } from "./qualityLabels";

const KIND_LABEL: Record<string, string> = {
  NonConformity: "No conformidad (NC)",
  NonConformingWork: "Trabajo no conforme (TNC)",
  Risk: "Riesgo",
  Opportunity: "Oportunidad de mejora (OM)"
};

const STATUS_LABEL: Record<string, string> = {
  Open: "Abierta",
  InAnalysis: "En análisis",
  ActionPending: "Acción pendiente",
  EffectivenessCheck: "Verificación de eficacia",
  Closed: "Cerrada",
  Cancelled: "Anulada"
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

export function QualityNonConformityPrintPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<QualityNonConformity | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.getQualityNonConformity(id), api.getCompanySettings().catch(() => null)])
      .then(([nc, settings]) => {
        setRow(nc);
        setCompany(settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const downloadPdf = async () => {
    const el = document.getElementById("pg07-r01-sheet");
    if (!el || !row) return;
    setDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `PG07-R1_${row.number}.pdf`,
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

  if (loading) return <div className="workspace-page pad">Cargando…</div>;
  if (error || !row) {
    return (
      <div className="workspace-page pad" style={{ color: "#b91c1c" }}>
        {error || "No encontrado"}
        <div style={{ marginTop: 12 }}><Link to="/calidad/registros/nc">← Volver</Link></div>
      </div>
    );
  }

  const cell: CSSProperties = { border: "1px solid #334155", padding: "6px 8px", fontSize: 12, verticalAlign: "top" };
  const label: CSSProperties = { ...cell, background: "#f1f5f9", fontWeight: 700, width: "28%" };
  const companyName = company?.legalName || company?.tradeName || "Empresa";

  return (
    <div style={{ background: "#e2e8f0", minHeight: "100vh", padding: 20 }}>
      <div className="no-print" style={{ maxWidth: "210mm", margin: "0 auto 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-outline" onClick={() => navigate("/calidad/registros/nc")}>← Volver</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>Imprimir</button>
          <button type="button" className="btn btn-primary" disabled={downloading} onClick={() => void downloadPdf()}>
            {downloading ? "Generando…" : "Descargar PDF"}
          </button>
        </div>
      </div>

      <div id="pg07-r01-sheet" style={{ maxWidth: "210mm", margin: "0 auto", background: "#fff", color: "#0f172a", padding: "14mm 12mm", boxShadow: "0 4px 24px rgba(15,23,42,0.12)", fontFamily: "Georgia, 'Times New Roman', serif" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <tbody>
            <tr>
              <td style={{ ...cell, width: "26%", textAlign: "center", verticalAlign: "middle" }}>
                {company?.logoUrl ? (
                  <img src={company.logoUrl} alt={companyName} crossOrigin="anonymous" style={{ maxHeight: 52, maxWidth: 140, objectFit: "contain", display: "block", margin: "0 auto 4px" }} />
                ) : null}
                <div style={{ fontSize: 11, fontWeight: 800 }}>{companyName}</div>
                {company?.documentNumber ? <div style={{ fontSize: 9, color: "#475569" }}>CUIT {company.documentNumber}</div> : null}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>
                <div style={{ fontSize: 11 }}>SISTEMA DE GESTIÓN DE CALIDAD · ISO/IEC 17025</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>PG07-R1 · NC, Riesgos y Oportunidades</div>
              </td>
              <td style={{ ...cell, width: "24%", fontSize: 11 }}>
                <div><strong>Nº:</strong> {row.number}</div>
                <div><strong>Tipo:</strong> {KIND_LABEL[row.kind] ?? row.kind}</div>
                <div><strong>Estado:</strong> {STATUS_LABEL[row.status] ?? row.status}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={label}>Detectado</td>
              <td style={cell}>{fmt(row.detectedAt)}</td>
              <td style={label}>Origen</td>
              <td style={cell}>{labelOf(NC_ORIGIN, row.origin)}</td>
            </tr>
            <tr>
              <td style={label}>Responsable</td>
              <td style={cell}>{row.responsible || "—"}</td>
              <td style={label}>Vencimiento</td>
              <td style={cell}>{fmt(row.effectiveDueAt)}</td>
            </tr>
            <tr>
              <td style={label}>Descripción</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap", minHeight: 64 }} colSpan={3}>{row.description}</td>
            </tr>
            <tr>
              <td style={label}>Acción inmediata</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>{row.immediateAction || "—"}</td>
            </tr>
            <tr>
              <td style={label}>Impacto resultados previos</td>
              <td style={cell}>{row.impactOnPreviousResults ? "Sí" : "No"}</td>
              <td style={label}>Cliente notificado</td>
              <td style={cell}>{row.customerNotified ? "Sí" : "No"}</td>
            </tr>
          </tbody>
        </table>

        {row.kind === "Risk" && (
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
            <tbody>
              <tr>
                <td style={label}>Probabilidad</td>
                <td style={cell}>{row.probability ?? "—"}</td>
                <td style={label}>Impacto</td>
                <td style={cell}>{row.impact ?? "—"}</td>
              </tr>
              <tr>
                <td style={label}>Nivel</td>
                <td style={cell}>{row.level ?? "—"}</td>
                <td style={label}>Residual</td>
                <td style={cell}>{row.residualLevel ?? "—"}</td>
              </tr>
              <tr>
                <td style={label}>Controles</td>
                <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>{row.controls || "—"}</td>
              </tr>
            </tbody>
          </table>
        )}

        <div style={{ fontSize: 12, fontWeight: 800, margin: "10px 0 6px" }}>Análisis de causa y acción</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={label}>Método</td>
              <td style={cell} colSpan={3}>{row.rootCauseMethod || "—"}</td>
            </tr>
            <tr>
              <td style={label}>Causa raíz</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap", minHeight: 48 }} colSpan={3}>{row.rootCause || "—"}</td>
            </tr>
            <tr>
              <td style={label}>Acción correctiva / mejora</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap", minHeight: 48 }} colSpan={3}>{row.correctiveAction || "—"}</td>
            </tr>
            <tr>
              <td style={label}>Verificación eficacia</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>{row.effectivenessCheck || "—"}</td>
            </tr>
            <tr>
              <td style={label}>Resultado</td>
              <td style={cell}>{row.effectivenessResult || "—"}</td>
              <td style={label}>Cierre</td>
              <td style={cell}>{fmt(row.closedAt)}</td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: 10, color: "#64748b", margin: 0 }}>
          Copia generada desde Leal Control · PG07-R1 · {new Date().toLocaleString("es-AR")} · COPIA NO CONTROLADA
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          #pg07-r01-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
}
