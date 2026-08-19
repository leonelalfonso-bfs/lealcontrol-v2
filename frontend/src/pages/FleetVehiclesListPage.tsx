import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Vehicle, type VehicleDocument } from "../api/types";

export function FleetVehiclesListPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<VehicleDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadFleetData();
  }, [search]);

  const loadFleetData = async () => {
    try {
      setLoading(true);
      const [vehs, docs] = await Promise.all([
        api.listVehicles(search),
        api.listExpiringDocuments().catch(() => [])
      ]);
      setVehicles(vehs);
      setExpiringDocs(docs);
    } catch (err) {
      console.error("Error al cargar flota", err);
    } finally {
      setLoading(false);
    }
  };

  const getVehicleTypeName = (type: number) => {
    switch (type) {
      case 0: return "🛻 Pick-up / Utilitario";
      case 1: return "🚐 Furgón / Van";
      case 2: return "🚛 Camión Chasis / Semi";
      case 3: return "🚗 Auto Comercial";
      case 4: return "🚜 Autoelevador / Clark";
      case 5: return "🚚 Acoplado / Semi";
      default: return "🚗 Vehículo";
    }
  };

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Gestión Integral de Flota Vehicular</h1>
          <p className="muted">Parque automotor, alertas de VTV/Seguro, choferes asignados y mantenimiento</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/flota/combustible" className="btn btn-outline" style={{ background: "#ffffff" }}>
            ⛽ Control de Combustible (KM/L)
          </Link>
          <Link to="/flota/vehiculos/nuevo" className="btn btn-primary" style={{ background: "#0d9488" }}>
            + Registrar Vehículo
          </Link>
        </div>
      </div>

      {/* Expirations / VTV / Insurance Alerts Banner */}
      {expiringDocs.length > 0 && (
        <div
          style={{
            background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
            border: "1px solid #f59e0b",
            borderRadius: "12px",
            padding: "16px 20px",
            marginBottom: "20px",
            boxShadow: "0 4px 12px rgba(245, 158, 11, 0.1)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span style={{ fontSize: "1.4rem" }}>⚠️</span>
            <h3 style={{ margin: 0, fontSize: "1rem", color: "#92400e" }}>
              Alertas de Vencimiento de Documentación ({expiringDocs.length} Próximos a Vencer)
            </h3>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {expiringDocs.slice(0, 4).map((d) => (
              <div
                key={d.id}
                style={{
                  background: "white",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px solid #fde68a",
                  fontSize: "0.8rem",
                  display: "flex",
                  gap: "8px",
                  alignItems: "center"
                }}
              >
                <strong style={{ fontFamily: "monospace" }}>{d.plate}</strong>
                <span>{d.title} ({d.issuerCompany || ""})</span>
                <span style={{ color: "#dc2626", fontWeight: 700 }}>
                  Vence: {new Date(d.expirationDateUtc).toLocaleDateString("es-AR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad" style={{ background: "rgba(13, 148, 136, 0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>UNIDADES EN FLOTA</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#0f172a", marginTop: 4 }}>{vehicles.length}</div>
          <div style={{ fontSize: "0.75rem", color: "#047857" }}>{vehicles.filter((v) => v.status === 0).length} Operativos activos</div>
        </div>

        <div className="card pad" style={{ background: "rgba(59, 130, 246, 0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>KILÓMETROS TOTALES</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#1e40af", marginTop: 4, fontFamily: "monospace" }}>
            {vehicles.reduce((acc, v) => acc + (v.currentKilometers || 0), 0).toLocaleString("es-AR")} KM
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Odómetro acumulado</div>
        </div>

        <div className="card pad" style={{ background: "rgba(245, 158, 11, 0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>EN MANTENIMIENTO</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#b45309", marginTop: 4 }}>
            {vehicles.filter((v) => v.status === 1).length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>En taller o service</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card pad" style={{ marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Buscar por Patente / Dominio, Marca o Modelo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: "9px 14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
        />
      </div>

      {/* Vehicles Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px" }}>Cargando vehículos de flota...</div>
      ) : vehicles.length === 0 ? (
        <div className="card pad" style={{ textAlign: "center", padding: "40px" }}>
          <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "8px" }}>🚛</span>
          <h3>No hay vehículos registrados</h3>
          <p className="muted">Cargá las camionetas, camiones y maquinaria de tu empresa para controlar VTV, pólizas y mantenimiento.</p>
          <Link to="/flota/vehiculos/nuevo" className="btn btn-primary" style={{ background: "#0d9488", marginTop: "12px" }}>
            + Cargar Primer Vehículo
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
          {vehicles.map((v) => (
            <div
              key={v.id}
              className="card pad"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderTop: `4px solid ${v.status === 0 ? "#0d9488" : v.status === 1 ? "#f59e0b" : "#ef4444"}`,
                cursor: "pointer"
              }}
              onClick={() => navigate(`/flota/vehiculos/${v.id}`)}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span
                      style={{
                        fontSize: "0.85rem",
                        padding: "3px 10px",
                        background: "#0f172a",
                        color: "#ffffff",
                        borderRadius: "6px",
                        fontWeight: 900,
                        fontFamily: "monospace",
                        letterSpacing: "1px"
                      }}
                    >
                      {v.plate}
                    </span>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4 }}>{getVehicleTypeName(v.type)}</div>
                  </div>

                  <span
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: v.status === 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                      color: v.status === 0 ? "#047857" : "#b45309",
                      fontWeight: 700
                    }}
                  >
                    {v.status === 0 ? "🟢 Activo" : v.status === 1 ? "🟡 En Taller" : "🔴 Fuera de Servicio"}
                  </span>
                </div>

                <h3 style={{ margin: "10px 0 2px 0", fontSize: "1.15rem", color: "#0f172a" }}>
                  {v.brand} {v.model} ({v.year})
                </h3>

                <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #f1f5f9", display: "grid", gap: "6px", fontSize: "0.82rem", color: "#475569" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Kilometraje Odómetro:</span>
                    <strong style={{ fontFamily: "monospace" }}>{v.currentKilometers.toLocaleString("es-AR")} KM</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Combustible:</span>
                    <span>{v.fuelType}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Chofer Habitual:</span>
                    <strong style={{ color: "#0d9488" }}>{v.assignedDriverName || "Sin chofer fijo"}</strong>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/flota/vehiculos/${v.id}`);
                  }}
                  className="btn btn-outline"
                  style={{ padding: "5px 12px", fontSize: "0.75rem" }}
                >
                  Ficha Técnica & Vencimientos →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
