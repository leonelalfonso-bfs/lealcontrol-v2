import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualityInternalAudit } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";

const STATUS_LABEL: Record<string, string> = {
  Planned: "Programada",
  InProgress: "En curso",
  Reported: "Informada",
  Closed: "Cerrada",
  Cancelled: "Anulada"
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

export function QualityInternalAuditPrintPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<QualityInternalAudit | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.getQualityInternalAudit(id), api.getCompanySettings().catch(() => null)])
      .then(([audit, settings]) => {
        setRow(audit);
        setCompany(settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const downloadPdf = async () => {
    const el = document.getElementById("pg04-sheet");
    if (!el || !row) return;
    setDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `PG04_${row.number}.pdf`,
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
          <Link to="/calidad/registros/auditorias">← Volver</Link>
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
        <button type="button" className="btn btn-outline" onClick={() => navigate("/calidad/registros/auditorias")}>
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
        id="pg04-sheet"
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
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>PG04 · Auditoría interna</div>
              </td>
              <td style={{ ...cell, width: "24%", fontSize: 11 }}>
                <div>
                  <strong>Nº:</strong> {row.number}
                </div>
                <div>
                  <strong>Año:</strong> {row.programYear}
                </div>
                <div>
                  <strong>Estado:</strong> {STATUS_LABEL[row.status] ?? row.status}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={label}>Fecha planificada</td>
              <td style={cell}>{fmt(row.plannedDate)}</td>
              <td style={label}>Fecha ejecución</td>
              <td style={cell}>{fmt(row.executedDate)}</td>
            </tr>
            <tr>
              <td style={label}>Auditor</td>
              <td style={cell}>{row.auditor || "—"}</td>
              <td style={label}>Auditado / área</td>
              <td style={cell}>{row.auditee || "—"}</td>
            </tr>
            <tr>
              <td style={label}>Cláusulas 17025</td>
              <td style={cell} colSpan={3}>
                {row.clauses || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Alcance</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.scope || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Objetivos / plan (R02)</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.objectives || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Lista de verificación (R04)</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.checklistNotes || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Hallazgos / informe (R03)</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.findingsSummary || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Conclusiones</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.conclusions || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Recomendaciones</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.recommendations || "—"}
              </td>
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
          Documento generado desde LealControl · PG04 (programa / plan / informe / checklist unificados) · {new Date().toLocaleString("es-AR")}
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          #pg04-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
}
