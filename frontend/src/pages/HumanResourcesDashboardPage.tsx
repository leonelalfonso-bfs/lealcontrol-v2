import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type HrDashboardSummary } from "../api/types";

export function HumanResourcesDashboardPage() {
  const [summary, setSummary] = useState<HrDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getHrDashboardSummary()
      .then(setSummary)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-wide stack" style={{ gap: 24, paddingBottom: 60 }}>
      {/* Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span className="eyebrow" style={{ color: "#ec4899", fontWeight: 700 }}>GESTIÓN DE CAPITAL HUMANO</span>
          <h1>👥 Tablero Ejecutivo de Recursos Humanos</h1>
          <p className="muted">Supervisión de personal, estructura organizacional, legajos digitales y manuales de procedimientos</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link to="/rrhh/empleados/nuevo" className="btn" style={{ background: "linear-gradient(135deg, #ec4899, #db2777)", color: "#fff", fontWeight: 700 }}>
            ➕ Nuevo Colaborador
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-row">
        <Link to="/rrhh" className="tab-btn active">
          📊 Tablero RRHH
        </Link>
        <Link to="/rrhh/empleados" className="tab-btn">
          👤 Colaboradores & Legajos ({summary?.totalEmployees ?? "..."})
        </Link>
        <Link to="/rrhh/organigrama" className="tab-btn">
          🏢 Organigrama & Puestos ({summary?.positionsCount ?? "..."})
        </Link>
        <Link to="/rrhh/manuales" className="tab-btn">
          📖 Manuales de Procedimientos ({summary?.manualsCount ?? "..."})
        </Link>
        <Link to="/rrhh/liquidaciones" className="tab-btn">
          💰 Liquidación de Sueldos
        </Link>
        <Link to="/rrhh/ayuda" className="tab-btn">
          💡 Ayuda RRHH
        </Link>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* Metric Cards */}
      <div className="grid-4" style={{ gap: 16 }}>
        <div className="card pad" style={{ borderLeft: "5px solid #10b981" }}>
          <div className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>COLABORADORES ACTIVOS</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#10b981", marginTop: 6 }}>
            {loading ? "..." : summary?.activeEmployees ?? 0}
          </div>
          <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>
            De un total de {summary?.totalEmployees ?? 0} registrados
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "5px solid #3b82f6" }}>
          <div className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>PUESTOS ORGANIZACIONALES</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#3b82f6", marginTop: 6 }}>
            {loading ? "..." : `${summary?.coveredPositions ?? 0} / ${summary?.positionsCount ?? 0}`}
          </div>
          <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>
            Puestos cubiertos en el Organigrama
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "5px solid #8b5cf6" }}>
          <div className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>MANUALES & INSTRUCTIVOS</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#8b5cf6", marginTop: 6 }}>
            {loading ? "..." : summary?.manualsCount ?? 0}
          </div>
          <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>
            Procedimientos vigentes por área
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: `5px solid ${(summary?.expiringDocsCount ?? 0) > 0 ? "#f59e0b" : "#10b981"}` }}>
          <div className="muted" style={{ fontSize: "0.85rem", fontWeight: 600 }}>VENCIMIENTOS DOCUMENTALES</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: (summary?.expiringDocsCount ?? 0) > 0 ? "#f59e0b" : "#10b981", marginTop: 6 }}>
            {loading ? "..." : summary?.expiringDocsCount ?? 0}
          </div>
          <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>
            Exámenes ART / Licencias en prox. 30 días
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid-2" style={{ gap: 20 }}>
        {/* Department Distribution */}
        <div className="card pad">
          <h2 style={{ fontSize: "1.15rem", marginBottom: 14 }}>🏢 Distribución de Personal por Área</h2>
          {summary?.departmentDistribution && summary.departmentDistribution.length > 0 ? (
            <div className="stack" style={{ gap: 12 }}>
              {summary.departmentDistribution.map((d) => {
                const pct = summary.activeEmployees > 0 ? Math.round((d.count / summary.activeEmployees) * 100) : 0;
                return (
                  <div key={d.department}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{d.department}</span>
                      <span className="muted">{d.count} colaboradores ({pct}%)</span>
                    </div>
                    <div style={{ height: 8, background: "var(--surface-sunken)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #ec4899, #8b5cf6)", borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted" style={{ padding: 20, textAlign: "center" }}>No hay datos suficientes de departamentos.</p>
          )}
        </div>

        {/* Quick Management Links */}
        <div className="card pad">
          <h2 style={{ fontSize: "1.15rem", marginBottom: 14 }}>⚡ Accesos Rápidos de Recursos Humanos</h2>
          <div className="stack" style={{ gap: 10 }}>
            <Link
              to="/rrhh/organigrama"
              className="card pad"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", background: "var(--surface-sunken)" }}
            >
              <div>
                <strong style={{ color: "var(--text-main)", display: "block" }}>🏢 Organigrama & Descripción de Puestos</strong>
                <span className="muted" style={{ fontSize: "0.82rem" }}>Definir estructura jerárquica, misiones, responsabilidades y competencias.</span>
              </div>
              <span>➔</span>
            </Link>

            <Link
              to="/rrhh/empleados"
              className="card pad"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", background: "var(--surface-sunken)" }}
            >
              <div>
                <strong style={{ color: "var(--text-main)", display: "block" }}>👤 Legajos Digitales de Colaboradores</strong>
                <span className="muted" style={{ fontSize: "0.82rem" }}>Checklist de 14 documentos (Ingreso activo + Subcategoría de Egreso).</span>
              </div>
              <span>➔</span>
            </Link>

            <Link
              to="/rrhh/manuales"
              className="card pad"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", background: "var(--surface-sunken)" }}
            >
              <div>
                <strong style={{ color: "var(--text-main)", display: "block" }}>📖 Manuales de Procedimientos e Instructivos</strong>
                <span className="muted" style={{ fontSize: "0.82rem" }}>Gestión documental por áreas operativas y control de versiones.</span>
              </div>
              <span>➔</span>
            </Link>

            <Link
              to="/rrhh/liquidaciones"
              className="card pad"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", background: "var(--surface-sunken)" }}
            >
              <div>
                <strong style={{ color: "var(--text-main)", display: "block" }}>💰 Liquidación de Sueldos & Libro Digital</strong>
                <span className="muted" style={{ fontSize: "0.82rem" }}>Cálculo automático de haberes, recibos digitales y exportación LSD / Bancos.</span>
              </div>
              <span>➔</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
