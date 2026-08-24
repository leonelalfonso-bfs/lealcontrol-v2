import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { CalibrationReport } from "../../api/types";

export function MetrologyDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

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

  const totalEquipments = data?.equipments?.total ?? data?.stats?.totalEquipments ?? data?.Stats?.TotalEquipments ?? 0;
  const activeEquipments = data?.equipments?.active ?? data?.stats?.activeEquipments ?? data?.Stats?.ActiveEquipments ?? 0;
  const expiredEquipments = data?.equipments?.expired ?? data?.stats?.expiredCalibrations ?? data?.Stats?.ExpiredCalibrations ?? 0;

  const totalWeights = data?.weights?.total ?? data?.stats?.totalWeights ?? data?.Stats?.TotalWeights ?? 0;
  const validWeights = data?.weights?.valid ?? data?.stats?.validWeights ?? data?.Stats?.ValidWeights ?? 0;

  const totalReports = data?.reports?.total ?? data?.stats?.totalReports ?? data?.Stats?.TotalReports ?? 0;
  const recentReports: CalibrationReport[] = data?.reports?.recent ?? data?.recentReports ?? data?.RecentReports ?? [];

  return (
    <div className="page-wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Laboratorio de Ensayos
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            ⚖️ Metrología Legal
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Gestión de equipos, pesas patrón trazables y emisión de informes técnicos de ensayo
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn ghost" onClick={loadData} title="Refrescar">
            🔄 Actualizar
          </button>
          <Link to="/metrologia/ensayos/nuevo" className="btn" style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
            ➕ Nuevo Ensayo
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi kpi-4" style={{ marginBottom: 24 }}>
        <div className="card pad" style={{ borderLeft: "4px solid #0d9488" }}>
          <div className="muted">Equipos Registrados</div>
          <strong style={{ fontSize: "1.8rem" }}>{totalEquipments}</strong>
          <div style={{ fontSize: "0.78rem", color: "var(--ok)", fontWeight: 700, marginTop: 4 }}>
            ✓ {activeEquipments} operativos en clientes
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div className="muted">Ensayos Vencidos</div>
          <strong style={{ fontSize: "1.8rem", color: expiredEquipments > 0 ? "#dc2626" : "inherit" }}>
            {expiredEquipments}
          </strong>
          <div style={{ fontSize: "0.78rem", color: expiredEquipments > 0 ? "#dc2626" : "var(--ink-soft)", fontWeight: 600, marginTop: 4 }}>
            {expiredEquipments > 0 ? "⚠️ Requieren nuevo ensayo" : "✓ Al día"}
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #3b82f6" }}>
          <div className="muted">Pesas Patrón</div>
          <strong style={{ fontSize: "1.8rem" }}>{totalWeights}</strong>
          <div style={{ fontSize: "0.78rem", color: "#2563eb", fontWeight: 700, marginTop: 4 }}>
            🛡️ {validWeights} con trazabilidad vigente
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #8b5cf6" }}>
          <div className="muted">Informes de Ensayo</div>
          <strong style={{ fontSize: "1.8rem" }}>{totalReports}</strong>
          <div style={{ fontSize: "0.78rem", color: "#7c3aed", fontWeight: 700, marginTop: 4 }}>
            📋 Informes técnicos emitidos
          </div>
        </div>
      </div>

      {/* Accesos Rápidos Operativos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/equipos")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>🏢</span>
            <div>
              <strong style={{ display: "block", fontSize: "0.95rem" }}>Gestión de Equipos</strong>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Ficha técnica de balanzas e instrumentos</span>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/patrones")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>⚖️</span>
            <div>
              <strong style={{ display: "block", fontSize: "0.95rem" }}>Gestión de Pesas Patrón</strong>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Masas nominales y certificados de calibración</span>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/ensayos/nuevo")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>📝</span>
            <div>
              <strong style={{ display: "block", fontSize: "0.95rem" }}>Nuevo Ensayo</strong>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Carga de pruebas y cálculo de EMT en vivo</span>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/informes")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>📋</span>
            <div>
              <strong style={{ display: "block", fontSize: "0.95rem" }}>Informes de Ensayo</strong>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Historial e impresión de informes emitidos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Actividad Reciente */}
      <div className="card pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Últimos Informes de Ensayo Emitidos</h3>
          <Link to="/metrologia/informes" className="btn ghost compact">
            Ver Todos →
          </Link>
        </div>

        {loading ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>Cargando actividad reciente...</div>
        ) : recentReports.length === 0 ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>
            No hay ensayos registrados recientemente.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº Informe</th>
                  <th>Fecha</th>
                  <th>Instrumento</th>
                  <th>Cliente</th>
                  <th>Metrólogo</th>
                  <th>Dictamen</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((r) => {
                  const certNum = (r as any).certificateNumber || r.reportNumber || "INF";
                  const vRaw: any = r.result || (r as any).verdict || "Apto";
                  const isOk = vRaw === "Apto" || vRaw === "Approved";
                  return (
                    <tr key={r.id}>
                      <td><strong>{certNum}</strong></td>
                      <td>{r.calibrationDate ? new Date(r.calibrationDate).toLocaleDateString("es-AR") : "—"}</td>
                      <td>{r.equipmentCode}</td>
                      <td>{r.customerName || "—"}</td>
                      <td>{r.performedBy || "—"}</td>
                      <td>
                        <span className={`badge ${isOk ? "ok" : "prio-high"}`}>
                          {isOk ? "✓ Apto" : "✗ No Apto"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link to={`/metrologia/informes/${r.id}/imprimir`} className="btn ghost compact">
                          🖨️ Ver / Imprimir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
