import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { CalibrationReport } from "../../api/types";

export function MetrologyDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [activityMode, setActivityMode] = useState<"Laboratory" | "Repairer">("Repairer");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.getMetrologyDashboard(),
      api.getMetrologySettings().catch(() => ({ activityMode: "Repairer" as const }))
    ])
      .then(([dash, settings]) => {
        setData(dash);
        setActivityMode(settings?.activityMode === "Laboratory" ? "Laboratory" : "Repairer");
      })
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
          <span className="eyebrow t-accent t-strong t-caps t-small" style={{ letterSpacing: "0.08em" }}>
            Laboratorio de Ensayos
          </span>
          <h1 style={{ margin: "2px 0 0" }}>
            ⚖️ Metrología Legal
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Gestión de equipos, pesas patrón trazables y emisión de informes técnicos de ensayo
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn ghost" onClick={loadData} title="Refrescar">
            🔄 Actualizar
          </button>
          <Link to="/metrologia/ensayos/nuevo" className="btn">
            ➕ Nuevo Ensayo
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi kpi-4" style={{ marginBottom: 24 }}>
        <div className="card pad" style={{ borderLeft: "4px solid var(--lc-accent)" }}>
          <div className="muted">Equipos Registrados</div>
          <strong className="t-xl">{totalEquipments}</strong>
          <div className="t-small t-strong" style={{ color: "var(--ok)", marginTop: 4 }}>
            ✓ {activeEquipments} operativos en clientes
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid var(--lc-warn)" }}>
          <div className="muted">Ensayos Vencidos</div>
          <strong className="t-xl" style={{ color: expiredEquipments > 0 ? "#dc2626" : "inherit" }}>
            {expiredEquipments}
          </strong>
          <div className="t-small t-strong" style={{ color: expiredEquipments > 0 ? "#dc2626" : "var(--ink-soft)", marginTop: 4 }}>
            {expiredEquipments > 0 ? "⚠️ Requieren nuevo ensayo" : "✓ Al día"}
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid var(--lc-info)" }}>
          <div className="muted">Pesas Patrón</div>
          <strong className="t-xl">{totalWeights}</strong>
          <div className="t-small t-info t-strong" style={{ marginTop: 4 }}>
            🛡️ {validWeights} con trazabilidad vigente
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid var(--lc-violet)" }}>
          <div className="muted">Informes de Ensayo</div>
          <strong className="t-xl">{totalReports}</strong>
          <div className="t-small t-violet t-strong" style={{ marginTop: 4 }}>
            📋 Informes técnicos emitidos
          </div>
        </div>
      </div>

      {/* Accesos Rápidos Operativos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 28 }}>
        <div className="card pad" style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <strong>Alcance de Metrología Legal</strong>
              <div className="muted t-small" style={{ marginTop: 2 }}>
                {activityMode === "Laboratory"
                  ? "Laboratorio de ensayos: solo verificación periódica y verificación primitiva."
                  : "Reparador: calibración, verificación periódica, verificación primitiva y verificación posterior a la reparación."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Link to="/metrologia/alcance" className="btn ghost compact">
                Configurar alcance
              </Link>
            </div>
          </div>
        </div>
        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/equipos")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="t-xl">🏢</span>
            <div>
              <strong style={{ display: "block" }}>Gestión de Equipos</strong>
              <span className="muted t-small">Ficha técnica de balanzas e instrumentos</span>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/patrones")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="t-xl">⚖️</span>
            <div>
              <strong style={{ display: "block" }}>Gestión de Pesas Patrón</strong>
              <span className="muted t-small">Masas nominales y certificados de calibración</span>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/ensayos/nuevo")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="t-xl">📝</span>
            <div>
              <strong style={{ display: "block" }}>Nuevo Ensayo</strong>
              <span className="muted t-small">Carga de pruebas y cálculo de EMT en vivo</span>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ cursor: "pointer", transition: "transform 0.15s ease" }} onClick={() => navigate("/metrologia/informes")}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="t-xl">📋</span>
            <div>
              <strong style={{ display: "block" }}>Informes de Ensayo</strong>
              <span className="muted t-small">Historial e impresión de informes emitidos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Actividad Reciente */}
      <div className="card pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Últimos Informes de Ensayo Emitidos</h3>
          <Link to="/metrologia/informes" className="btn ghost compact">
            Ver Todos →
          </Link>
        </div>

        {loading ? (
          <div className="muted t-center" style={{ padding: 20 }}>Cargando actividad reciente...</div>
        ) : recentReports.length === 0 ? (
          <div className="muted t-center" style={{ padding: 20 }}>
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
                  <th>Verificador</th>
                  <th>Dictamen</th>
                  <th className="t-right">Acciones</th>
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
                      <td className="t-right">
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
