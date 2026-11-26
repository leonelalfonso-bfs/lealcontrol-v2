import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HrTabs } from "../components/hr/HrTabs";
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
          <span className="eyebrow t-strong" style={{ color: "#ec4899" }}>GESTIÓN DE CAPITAL HUMANO</span>
          <h1>👥 Tablero Ejecutivo de Recursos Humanos</h1>
          <p className="muted">Supervisión de personal, estructura organizacional, legajos digitales y manuales de procedimientos</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link to="/rrhh/empleados/nuevo" className="btn">
            ➕ Nuevo Colaborador
          </Link>
        </div>
      </div>

      <HrTabs />

      {error && <div className="alert">{error}</div>}

      {/* Metric Cards */}
      <div className="grid-4" style={{ gap: 16 }}>
        <div className="card pad" style={{ borderLeft: "5px solid var(--lc-ok)" }}>
          <div className="muted t-small t-strong">COLABORADORES ACTIVOS</div>
          <div className="t-xl t-strong t-ok" style={{ marginTop: 6 }}>
            {loading ? "..." : summary?.activeEmployees ?? 0}
          </div>
          <div className="muted t-small" style={{ marginTop: 4 }}>
            De un total de {summary?.totalEmployees ?? 0} registrados
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "5px solid var(--lc-info)" }}>
          <div className="muted t-small t-strong">PUESTOS ORGANIZACIONALES</div>
          <div className="t-xl t-strong t-info" style={{ marginTop: 6 }}>
            {loading ? "..." : `${summary?.coveredPositions ?? 0} / ${summary?.positionsCount ?? 0}`}
          </div>
          <div className="muted t-small" style={{ marginTop: 4 }}>
            Puestos cubiertos en el Organigrama
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "5px solid var(--lc-violet)" }}>
          <div className="muted t-small t-strong">MANUALES & INSTRUCTIVOS</div>
          <div className="t-xl t-strong t-violet" style={{ marginTop: 6 }}>
            {loading ? "..." : summary?.manualsCount ?? 0}
          </div>
          <div className="muted t-small" style={{ marginTop: 4 }}>
            Procedimientos vigentes por área
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: `5px solid ${(summary?.expiringDocsCount ?? 0) > 0 ? "#f59e0b" : "#10b981"}` }}>
          <div className="muted t-small t-strong">VENCIMIENTOS DOCUMENTALES</div>
          <div className="t-xl t-strong" style={{ color: (summary?.expiringDocsCount ?? 0) > 0 ? "var(--lc-warn)" : "var(--lc-ok)", marginTop: 6 }}>
            {loading ? "..." : summary?.expiringDocsCount ?? 0}
          </div>
          <div className="muted t-small" style={{ marginTop: 4 }}>
            Exámenes ART / Licencias en prox. 30 días
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid-2" style={{ gap: 20 }}>
        {/* Department Distribution */}
        <div className="card pad">
          <h2 style={{ marginBottom: 14 }}>🏢 Distribución de Personal por Área</h2>
          {summary?.departmentDistribution && summary.departmentDistribution.length > 0 ? (
            <div className="stack" style={{ gap: 12 }}>
              {summary.departmentDistribution.map((d) => {
                const pct = summary.activeEmployees > 0 ? Math.round((d.count / summary.activeEmployees) * 100) : 0;
                return (
                  <div key={d.department}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span className="t-strong">{d.department}</span>
                      <span className="muted">{d.count} colaboradores ({pct}%)</span>
                    </div>
                    <div style={{ height: 8, background: "var(--surface-sunken)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #ec4899, var(--lc-violet))", borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted t-center" style={{ padding: 20 }}>No hay datos suficientes de departamentos.</p>
          )}
        </div>

        {/* Quick Management Links */}
        <div className="card pad">
          <h2 style={{ marginBottom: 14 }}>⚡ Accesos Rápidos de Recursos Humanos</h2>
          <div className="stack" style={{ gap: 10 }}>
            <Link
              to="/rrhh/organigrama"
              className="card pad"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none" }}
            >
              <div>
                <strong style={{ color: "var(--text-main)", display: "block" }}>🏢 Organigrama & Descripción de Puestos</strong>
                <span className="muted t-small">Definir estructura jerárquica, misiones, responsabilidades y competencias.</span>
              </div>
              <span>➔</span>
            </Link>

            <Link
              to="/rrhh/empleados"
              className="card pad"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none" }}
            >
              <div>
                <strong style={{ color: "var(--text-main)", display: "block" }}>👤 Legajos Digitales de Colaboradores</strong>
                <span className="muted t-small">Checklist de 14 documentos (Ingreso activo + Subcategoría de Egreso).</span>
              </div>
              <span>➔</span>
            </Link>

            <Link
              to="/rrhh/manuales"
              className="card pad"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none" }}
            >
              <div>
                <strong style={{ color: "var(--text-main)", display: "block" }}>📖 Manuales de Procedimientos e Instructivos</strong>
                <span className="muted t-small">Gestión documental por áreas operativas y control de versiones.</span>
              </div>
              <span>➔</span>
            </Link>

            <Link
              to="/rrhh/liquidaciones"
              className="card pad"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none" }}
            >
              <div>
                <strong style={{ color: "var(--text-main)", display: "block" }}>💰 Liquidación de Sueldos</strong>
                <span className="muted t-small">En reconstrucción: ley vigente y convenios configurables.</span>
              </div>
              <span>➔</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
