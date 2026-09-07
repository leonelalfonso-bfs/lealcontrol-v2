import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

export function QualityDashboardPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getQualityDashboard>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getQualityDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="workspace-page pad">
      <div className="page-head">
        <span className="eyebrow" style={{ color: "#0f766e", fontWeight: 800 }}>CALIDAD · ISO/IEC 17025</span>
        <h1 style={{ margin: "4px 0 0" }}>Tablero del SGC</h1>
      </div>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12, marginTop: 16 }}>
          <div className="card pad"><div style={{ fontSize: 12, color: "#64748b" }}>Documentos</div><strong style={{ fontSize: 28 }}>{data.totalDocuments}</strong></div>
          <div className="card pad"><div style={{ fontSize: 12, color: "#64748b" }}>Vigentes</div><strong style={{ fontSize: 28 }}>{data.current}</strong></div>
          <div className="card pad"><div style={{ fontSize: 12, color: "#64748b" }}>Borradores</div><strong style={{ fontSize: 28 }}>{data.draft}</strong></div>
          <div className="card pad"><div style={{ fontSize: 12, color: "#64748b" }}>Revisión vencida</div><strong style={{ fontSize: 28 }}>{data.overdueReview}</strong></div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <Link className="btn btn-primary" to="/calidad/documentos">Abrir árbol documental</Link>
        <Link className="btn btn-outline" to="/calidad/registros/mc01-r01">MC01-R01 Confidencialidad</Link>
        <Link className="btn btn-outline" to="/calidad/registros/pg01-r01">PG01-R01 Lista de documentos</Link>
        <Link className="btn btn-outline" to="/calidad/registros/pg01-r02">PG01-R02 Documentos externos</Link>
      </div>
    </div>
  );
}
