import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityDocumentDetail } from "../../api/types/quality";

export function QualityDocumentDetailPage() {
  const { code = "" } = useParams();
  const [data, setData] = useState<QualityDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    api.getQualityDocument(code)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return <div className="workspace-page pad">Cargando {code}…</div>;
  if (error) return <div className="workspace-page pad" style={{ color: "#b91c1c" }}>{error}</div>;
  if (!data) return null;

  const d = data.document;
  const published = data.versions.find((v) => v.id === d.currentVersionId);

  return (
    <div className="workspace-page pad">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <Link to="/calidad/documentos" style={{ fontSize: 13 }}>← Árbol documental</Link>
          <h1 style={{ margin: "8px 0 0" }}>{d.displayCode} · {d.title}</h1>
          <p style={{ color: "#64748b", marginTop: 6 }}>
            {d.type} · {d.status}
            {d.recordKind ? ` · ${d.recordKind}` : ""}
            {d.iso17025Clauses ? ` · ISO ${d.iso17025Clauses}` : ""}
          </p>
        </div>
        {published?.publishedFileId && (
          <a className="btn btn-primary" href={api.downloadQualityFileUrl(published.publishedFileId)} target="_blank" rel="noreferrer">
            Descargar PDF (copia no controlada)
          </a>
        )}
      </div>

      <div className="card pad" style={{ marginTop: 16 }}>
        <h3>Versiones</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Versión</th>
                <th>Estado</th>
                <th>Elaboró</th>
                <th>Revisó</th>
                <th>Aprobó</th>
                <th>Vigencia</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.id}>
                  <td>v{v.version}</td>
                  <td>{v.status}</td>
                  <td>{v.elaboratedBy || "—"}{v.elaboratedAt ? ` (${new Date(v.elaboratedAt).toLocaleDateString("es-AR")})` : ""}</td>
                  <td>{v.reviewedBy || "—"}</td>
                  <td>{v.approvedBy || "—"}</td>
                  <td>{v.effectiveFrom ? new Date(v.effectiveFrom).toLocaleDateString("es-AR") : "—"}</td>
                  <td>
                    {v.publishedFileId ? (
                      <a href={api.downloadQualityFileUrl(v.publishedFileId)} target="_blank" rel="noreferrer">PDF</a>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>Sin publicar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.children.length > 0 && (
        <div className="card pad" style={{ marginTop: 16 }}>
          <h3>Registros asociados</h3>
          <ul>
            {data.children.map((c) => (
              <li key={c.id}>
                <Link to={`/calidad/documentos/${encodeURIComponent(c.code)}`}>
                  {c.displayCode} — {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
