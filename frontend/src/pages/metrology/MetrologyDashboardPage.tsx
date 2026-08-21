import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { CalibrationReport } from "../../api/types";

export function MetrologyDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    equipments: { total: number; active: number; expired: number };
    weights: { total: number; valid: number; expired: number };
    reports: { total: number; recent: CalibrationReport[] };
  } | null>(null);

  const loadData = () => {
    setLoading(true);
    api.getMetrologyDashboard()
      .then(setData)
      .catch((err) => console.error("Error al cargar dashboard metrología:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="page-wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Laboratorio & Servicios Técnicos
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            ⚖️ Metrología Legal e Industrial
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Control de parque de balanzas, trazabilidad a patrones INTI/SAC y ensayos según Res. 67/2025 y OIML R 76-1
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn ghost" onClick={loadData} title="Refrescar">
            🔄 Actualizar
          </button>
          <Link to="/metrologia/ensayos/nuevo" className="btn" style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
            ➕ Cargar Nuevo Ensayo
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi kpi-4" style={{ marginBottom: 24 }}>
        <div className="card pad" style={{ borderLeft: "4px solid #0d9488" }}>
          <div className="muted">Parque de Balanzas</div>
          <strong style={{ fontSize: "1.8rem" }}>{data?.equipments.total ?? 0}</strong>
          <div style={{ fontSize: "0.78rem", color: "var(--ok)", fontWeight: 700, marginTop: 4 }}>
            ✓ {data?.equipments.active ?? 0} operativas en clientes
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div className="muted">Calibraciones Vencidas</div>
          <strong style={{ fontSize: "1.8rem", color: (data?.equipments.expired ?? 0) > 0 ? "#dc2626" : "inherit" }}>
            {data?.equipments.expired ?? 0}
          </strong>
          <div style={{ fontSize: "0.78rem", color: (data?.equipments.expired ?? 0) > 0 ? "#dc2626" : "var(--ink-soft)", fontWeight: 600, marginTop: 4 }}>
            {(data?.equipments.expired ?? 0) > 0 ? "⚠️ Requieren reinspección técnica" : "✓ Al día con las normativas"}
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #3b82f6" }}>
          <div className="muted">Patrones de Masa (Pesas)</div>
          <strong style={{ fontSize: "1.8rem" }}>{data?.weights.total ?? 0}</strong>
          <div style={{ fontSize: "0.78rem", color: "#2563eb", fontWeight: 700, marginTop: 4 }}>
            🛡️ {data?.weights.valid ?? 0} con certificado INTI vigente
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #8b5cf6" }}>
          <div className="muted">Certificados Emitidos</div>
          <strong style={{ fontSize: "1.8rem" }}>{data?.reports.total ?? 0}</strong>
          <div style={{ fontSize: "0.78rem", color: "#7c3aed", fontWeight: 700, marginTop: 4 }}>
            📋 Ensayos oficiales registrados
          </div>
        </div>
      </div>

      {/* Accesos Rápidos Operativos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/equipos")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>🏢</span>
            <div>
              <strong style={{ display: "block", fontSize: "0.95rem" }}>Parque de Equipos</strong>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Ficha técnica de balanzas por cliente</span>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/patrones")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>⚖️</span>
            <div>
              <strong style={{ display: "block", fontSize: "0.95rem" }}>Pesas Patrón & Trazabilidad</strong>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Certificados INTI / SAC y masas nominales</span>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/ensayos/nuevo")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>📝</span>
            <div>
              <strong style={{ display: "block", fontSize: "0.95rem" }}>Nuevo Ensayo en Campo</strong>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Asistente con cálculo de EMT en vivo</span>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/informes")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>📄</span>
            <div>
              <strong style={{ display: "block", fontSize: "0.95rem" }}>Certificados e Informes</strong>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Historial e impresión de certificados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Últimos Certificados Emitidos */}
      <div className="card pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>📋 Últimos Ensayos & Certificados Metrológicos</h3>
          <Link to="/metrologia/informes" style={{ fontSize: "0.82rem", color: "var(--primary)", fontWeight: 700 }}>
            Ver todos los certificados →
          </Link>
        </div>

        {loading ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>Cargando datos metrológicos...</div>
        ) : !data?.reports.recent || data.reports.recent.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            No hay ensayos registrados aún. Haga clic en <strong>"➕ Cargar Nuevo Ensayo"</strong> para emitir el primero.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº Certificado</th>
                  <th>Fecha</th>
                  <th>Instrumento</th>
                  <th>Cliente</th>
                  <th>Normativa</th>
                  <th>Metrólogo</th>
                  <th>Dictamen</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.reports.recent.map((rep) => (
                  <tr key={rep.id}>
                    <td>
                      <strong style={{ color: "#0d9488" }}>{rep.reportNumber}</strong>
                    </td>
                    <td>{new Date(rep.calibrationDate).toLocaleDateString("es-AR")}</td>
                    <td>
                      <div>
                        <strong>{rep.equipmentCode}</strong>
                        <div className="muted" style={{ fontSize: "0.76rem" }}>{rep.equipmentDescription}</div>
                      </div>
                    </td>
                    <td>{rep.customerName || "—"}</td>
                    <td><span className="tag">{rep.normativeApplied}</span></td>
                    <td>{rep.performedBy}</td>
                    <td>
                      <span className={`badge ${rep.result === "Apto" ? "ok" : rep.result === "No Apto" ? "prio-high" : "warn"}`}>
                        {rep.result}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link to={`/metrologia/informes/${rep.id}/imprimir`} className="btn ghost compact" target="_blank">
                        🖨️ Imprimir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
