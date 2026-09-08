import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualityManagementReview } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";

const STATUS_LABEL: Record<string, string> = {
  Draft: "Borrador",
  Completed: "Completada",
  Cancelled: "Anulada"
};

type SnapshotCounts = {
  complaints?: { total?: number; open?: number; closed?: number };
  nonConformities?: { total?: number; open?: number; byKind?: Record<string, number> };
  audits?: { total?: number; byStatus?: Record<string, number> };
  trainings?: { planned?: number; done?: number };
  authorizations?: { authorized?: number; expiringSoon?: number };
  supplierEvaluations?: { approved?: number; suspended?: number };
  performanceReviews?: { completed?: number };
  satisfactionSurveys?: { received?: number };
  indicators?: { active?: number; belowTarget?: string[] };
  generatedAtUtc?: string;
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

function parseSnapshot(raw: unknown): SnapshotCounts | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as SnapshotCounts;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as SnapshotCounts;
  return null;
}

export function QualityManagementReviewPrintPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<QualityManagementReview | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.getQualityManagementReview(id), api.getCompanySettings().catch(() => null)])
      .then(([review, settings]) => {
        setRow(review);
        setCompany(settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const snapshot = useMemo(
    () => parseSnapshot(row?.inputsSnapshot ?? row?.inputsSnapshotJson),
    [row?.inputsSnapshot, row?.inputsSnapshotJson]
  );

  const downloadPdf = async () => {
    const el = document.getElementById("pg08-r01-sheet");
    if (!el || !row) return;
    setDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `PG08-R01_${row.number}.pdf`,
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
          <Link to="/calidad/registros/revision-direccion">← Volver</Link>
        </div>
      </div>
    );
  }

  const cell: CSSProperties = { border: "1px solid #334155", padding: "6px 8px", fontSize: 12, verticalAlign: "top" };
  const label: CSSProperties = { ...cell, background: "#f1f5f9", fontWeight: 700, width: "28%" };
  const companyName = company?.legalName || company?.tradeName || "Empresa";
  const kindEntries = snapshot?.nonConformities?.byKind ? Object.entries(snapshot.nonConformities.byKind) : [];
  const auditEntries = snapshot?.audits?.byStatus ? Object.entries(snapshot.audits.byStatus) : [];
  const below = snapshot?.indicators?.belowTarget ?? [];

  return (
    <div style={{ background: "#e2e8f0", minHeight: "100vh", padding: 20 }}>
      <div
        className="no-print"
        style={{ maxWidth: "210mm", margin: "0 auto 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
      >
        <button type="button" className="btn btn-outline" onClick={() => navigate("/calidad/registros/revision-direccion")}>
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
        id="pg08-r01-sheet"
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
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>PG08-R01 · Informe de revisión por la dirección</div>
              </td>
              <td style={{ ...cell, width: "24%", fontSize: 11 }}>
                <div>
                  <strong>Nº:</strong> {row.number}
                </div>
                <div>
                  <strong>Estado:</strong> {STATUS_LABEL[row.status] ?? row.status}
                </div>
                <div>
                  <strong>Año:</strong> {row.programYear}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={label}>Fecha de revisión</td>
              <td style={cell}>{fmt(row.reviewDate)}</td>
              <td style={label}>Año programa</td>
              <td style={cell}>{row.programYear}</td>
            </tr>
            <tr>
              <td style={label}>Participantes</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.attendees || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Resumen de inputs (SGC)</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {snapshot ? (
                  <>
                    <div>
                      Quejas: total {snapshot.complaints?.total ?? 0}, abiertas {snapshot.complaints?.open ?? 0},
                      cerradas {snapshot.complaints?.closed ?? 0}
                    </div>
                    <div>
                      NC/R/OP: total {snapshot.nonConformities?.total ?? 0}, abiertas{" "}
                      {snapshot.nonConformities?.open ?? 0}
                      {kindEntries.length > 0
                        ? ` (${kindEntries.map(([k, v]) => `${k}=${v}`).join(", ")})`
                        : ""}
                    </div>
                    <div>
                      Auditorías: total {snapshot.audits?.total ?? 0}
                      {auditEntries.length > 0
                        ? ` (${auditEntries.map(([k, v]) => `${STATUS_LABEL[k] ?? k}=${v}`).join(", ")})`
                        : ""}
                    </div>
                    <div>
                      Capacitaciones: planificadas {snapshot.trainings?.planned ?? 0}, realizadas{" "}
                      {snapshot.trainings?.done ?? 0}
                    </div>
                    <div>
                      Autorizaciones: vigentes {snapshot.authorizations?.authorized ?? 0}, por vencer{" "}
                      {snapshot.authorizations?.expiringSoon ?? 0}
                    </div>
                    <div>
                      Proveedores: aprobados {snapshot.supplierEvaluations?.approved ?? 0}, suspendidos{" "}
                      {snapshot.supplierEvaluations?.suspended ?? 0}; desempeños{" "}
                      {snapshot.performanceReviews?.completed ?? 0}
                    </div>
                    <div>Encuestas recibidas: {snapshot.satisfactionSurveys?.received ?? 0}</div>
                    <div>
                      Indicadores activos: {snapshot.indicators?.active ?? 0}
                      {below.length > 0 ? `; bajo meta: ${below.join(", ")}` : ""}
                    </div>
                  </>
                ) : (
                  "—"
                )}
              </td>
            </tr>
            <tr>
              <td style={label}>Notas sobre inputs</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.inputsNotes || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Decisiones</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.decisions || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Acciones</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.actions || "—"}
              </td>
            </tr>
            <tr>
              <td style={label}>Seguimiento</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap" }} colSpan={3}>
                {row.followUp || "—"}
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
          Documento generado desde LealControl · PG08-R01 (revisión por la dirección) ·{" "}
          {new Date().toLocaleString("es-AR")}
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          #pg08-r01-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
}
