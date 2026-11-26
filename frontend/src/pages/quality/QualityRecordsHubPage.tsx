import { Link } from "react-router-dom";
import { labelOf, RECORD_KIND } from "./qualityLabels";
import { QUALITY_OPERATIONAL_RECORDS } from "./qualityRecordRoutes";

export function QualityRecordsHubPage() {
  const ready = QUALITY_OPERATIONAL_RECORDS.filter((r) => r.ready);
  const soon = QUALITY_OPERATIONAL_RECORDS.filter((r) => !r.ready);

  return (
    <div className="workspace-page pad">
      <div className="page-head">
        <Link className="t-small" to="/calidad">← Tablero SGC</Link>
        <h1 style={{ margin: "8px 0 0" }}>Registros operativos</h1>
        <p className="muted" style={{ marginTop: 6, maxWidth: 720 }}>
          Acceso a las pantallas de carga y seguimiento. Las plantillas PDF/Excel siguen en el árbol documental;
          desde cada código podés abrir su registro cuando esté disponible.
        </p>
      </div>

      <div style={{ marginTop: 20 }}>
        <h2 style={{ marginBottom: 10 }}>Disponibles</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {ready.map((r) => (
            <Link
              key={r.code}
              to={r.path}
              className="card pad"
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="t-accent t-strong t-small">{r.code}</div>
                  <strong>{r.title}</strong>
                  <div className="muted t-small" style={{ marginTop: 4 }}>{r.blurb}</div>
                </div>
                <span className="pill">{labelOf(RECORD_KIND, r.kind)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {soon.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ marginBottom: 10 }}>Próximos</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {soon.map((r) => (
              <div key={r.code} className="card pad" style={{ opacity: 0.75 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div className="muted t-strong t-small">{r.code}</div>
                    <strong>{r.title}</strong>
                    <div className="muted t-small" style={{ marginTop: 4 }}>{r.blurb}</div>
                  </div>
                  <span className="pill">Pendiente</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ marginTop: 24 }}>
        <Link className="btn btn-outline" to="/calidad/documentos">Ir al árbol documental</Link>
      </p>
    </div>
  );
}
