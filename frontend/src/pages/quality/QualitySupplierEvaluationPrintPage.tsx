import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualitySupplierEvaluation } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";

const STATUS_LABEL: Record<string, string> = {
  Draft: "Borrador",
  Approved: "Aprobada",
  Rejected: "Rechazada",
  Suspended: "Suspendida",
  Cancelled: "Anulada"
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

export function QualitySupplierEvaluationPrintPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<QualitySupplierEvaluation | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.getQualitySupplierEvaluation(id), api.getCompanySettings().catch(() => null)])
      .then(([evalRow, settings]) => {
        setRow(evalRow);
        setCompany(settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const downloadPdf = async () => {
    const el = document.getElementById("pg05-r01-sheet");
    if (!el || !row) return;
    setDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `PG05-R01_${row.number}.pdf`,
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
        <div style={{ marginTop: 12 }}>
          <Link to="/calidad/registros/proveedores?tab=r01">← Volver</Link>
        </div>
      </div>
    );
  }

  const cell: CSSProperties = { border: "1px solid #334155", padding: "6px 8px", fontSize: 12, verticalAlign: "top" };
  const label: CSSProperties = { ...cell, background: "#f1f5f9", fontWeight: 700, width: "28%" };
  const companyName = company?.legalName || company?.tradeName || "Empresa";

  return (
    <div style={{ background: "#e2e8f0", minHeight: "100vh", padding: 20 }}>
      <div
        className="no-print"
        style={{ maxWidth: "210mm", margin: "0 auto 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
      >
        <button type="button" className="btn btn-outline" onClick={() => navigate("/calidad/registros/proveedores?tab=r01")}>
          ← Volver
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>
            Imprimir
          </button>
          <button type="button" className="btn btn-primary" disabled={downloading} onClick={() => void downloadPdf()}>
            {downloading ? "Generando…" : "Descargar PDF"}
          </button>
        </div>
      </div>

      <div
        id="pg05-r01-sheet"
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
                <div style={{ fontSize: 11, fontWeight: 800 }}>{companyName}</div>
                {company?.documentNumber ? <div style={{ fontSize: 9, color: "#475569" }}>CUIT {company.documentNumber}</div> : null}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>
                <div style={{ fontSize: 11 }}>SISTEMA DE GESTIÓN DE CALIDAD · ISO/IEC 17025</div>
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>PG05-R01 · Evaluación inicial de proveedores</div>
              </td>
              <td style={{ ...cell, width: "24%", fontSize: 11 }}>
                <div>
                  <strong>Nº:</strong> {row.number}
                </div>
                <div>
                  <strong>Estado:</strong> {STATUS_LABEL[row.status] ?? row.status}
                </div>
                {row.isExpired ? (
                  <div style={{ color: "#b91c1c", fontWeight: 700 }}>Vencida</div>
                ) : null}
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={label}>Proveedor</td>
              <td style={cell} colSpan={3}>
                {row.supplierName || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Documento</td>
              <td style={cell}>{row.supplierDocument || "—"}</td>
              <td style={label}>Fecha evaluación</td>
              <td style={cell}>{fmt(row.evaluatedAt)}</td>
            </tr>
            <tr>
              <td style={label}>Alcance del servicio</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.serviceScope || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Puntaje</td>
              <td style={cell}>{row.score ?? "—"}</td>
              <td style={label}>Vigente hasta</td>
              <td style={cell}>{fmt(row.validUntil)}</td>
            </tr>
            <tr>
              <td style={label}>Criterios / notas</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.criteriaNotes || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Fortalezas</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.strengths || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Debilidades</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.weaknesses || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Aprobado por</td>
              <td style={cell}>{row.approvedBy || "—"}</td>
              <td style={label}>Fecha aprobación</td>
              <td style={cell}>{fmt(row.approvedAt)}</td>
            </tr>
            <tr>
              <td style={label}>Notas</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.notes || "—"}
              </td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: 9, color: "#64748b", marginTop: 16 }}>
          Documento generado desde LealControl · PG05-R01 (evaluación inicial de proveedores) ·{" "}
          {new Date().toLocaleString("es-AR")}
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          #pg05-r01-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
}
