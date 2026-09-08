import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CompanySettings } from "../../api/types";
import type { QualityEquipmentLogEntry } from "../../api/types/quality";
import { loadHtml2Pdf } from "../../utils/loadHtml2Pdf";

const SOURCE_LABEL: Record<string, string> = {
  StandardWeight: "Pesa patrón",
  Instrument: "Instrumento",
  QualityEquipment: "Equipo auxiliar"
};

const KIND_LABEL: Record<string, string> = {
  C: "Calibración",
  V: "Verificación",
  MP: "Mant. preventivo",
  MC: "Mant. correctivo",
  Baja: "Baja"
};

const VERDICT_LABEL: Record<string, string> = {
  Apto: "Apto",
  NoApto: "No apto",
  Condicional: "Condicional"
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

export function QualityEquipmentLogPrintPage() {
  const { source = "", assetId = "" } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<QualityEquipmentLogEntry[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!source || !assetId) return;
    setLoading(true);
    Promise.all([
      api.listQualityEquipmentLogEntries({ assetSource: source, assetId }),
      api.getCompanySettings().catch(() => null)
    ])
      .then(([list, settings]) => {
        setRows((list.rows || []).filter((r) => r.status !== "Cancelled"));
        setCompany(settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [source, assetId]);

  const header = useMemo(() => {
    const first = rows[0];
    return {
      code: first?.assetCode || "—",
      description: first?.assetDescription || "—",
      sourceLabel: SOURCE_LABEL[source] || source
    };
  }, [rows, source]);

  const downloadPdf = async () => {
    const el = document.getElementById("pg14-r01-sheet");
    if (!el) return;
    setDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `PG14-R01_${header.code || assetId}.pdf`,
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
  if (error) {
    return (
      <div className="workspace-page pad" style={{ color: "#b91c1c" }}>
        {error}
        <div style={{ marginTop: 12 }}>
          <Link to="/calidad/registros/equipos?tab=r01">← Volver</Link>
        </div>
      </div>
    );
  }

  const cell: CSSProperties = { border: "1px solid #334155", padding: "6px 8px", fontSize: 11, verticalAlign: "top" };
  const th: CSSProperties = { ...cell, background: "#f1f5f9", fontWeight: 700, textAlign: "left" };
  const companyName = company?.legalName || company?.tradeName || "Empresa";

  return (
    <div style={{ background: "#e2e8f0", minHeight: "100vh", padding: 20 }}>
      <div
        className="no-print"
        style={{ maxWidth: "210mm", margin: "0 auto 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
      >
        <button type="button" className="btn btn-outline" onClick={() => navigate("/calidad/registros/equipos?tab=r01")}>
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
        id="pg14-r01-sheet"
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
                  <img src={company.logoUrl} alt="Logo" style={{ maxHeight: 56, maxWidth: "100%" }} />
                ) : (
                  <strong>{companyName}</strong>
                )}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>PG14-R01 · Hoja de vida del equipo</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>{companyName}</div>
              </td>
              <td style={{ ...cell, width: "28%" }}>
                <div><strong>Origen</strong> {header.sourceLabel}</div>
                <div><strong>Código</strong> {header.code}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: 12, marginBottom: 12 }}>
          <strong>Descripción:</strong> {header.description}
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>N.º</th>
              <th style={th}>Fecha</th>
              <th style={th}>Tipo</th>
              <th style={th}>Descripción</th>
              <th style={th}>Certificado</th>
              <th style={th}>Dictamen</th>
              <th style={th}>Responsable</th>
              <th style={th}>DT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={cell}>{r.number}</td>
                <td style={cell}>{fmt(r.eventDate)}</td>
                <td style={cell}>{KIND_LABEL[r.kind] || r.kind}</td>
                <td style={cell}>{r.description || "—"}</td>
                <td style={cell}>{r.certificateNumber || "—"}</td>
                <td style={cell}>{VERDICT_LABEL[r.verdict || ""] || r.verdict || "—"}</td>
                <td style={cell}>{r.responsible || "—"}</td>
                <td style={cell}>{r.approvedByTechnicalDirector ? "Sí" : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td style={cell} colSpan={8}>
                  Sin eventos activos para este activo.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <p style={{ fontSize: 10, color: "#64748b", marginTop: 24 }}>
          COPIA NO CONTROLADA · Generado desde el SGC · {new Date().toLocaleString("es-AR")}
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          #pg14-r01-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
    </div>
  );
}
