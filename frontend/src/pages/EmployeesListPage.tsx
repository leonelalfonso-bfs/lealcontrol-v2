import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Employee } from "../api/types";

export function EmployeesListPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  useEffect(() => {
    loadEmployees();
  }, [search]);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await api.listEmployees(search);
      setEmployees(data);
    } catch (err) {
      console.error("Error al cargar empleados", err);
    } finally {
      setLoading(false);
    }
  };

  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));

  const filtered = employees.filter((e) => {
    if (departmentFilter !== "ALL" && e.department !== departmentFilter) return false;
    return true;
  });

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Recursos Humanos & Colaboradores</h1>
          <p className="muted">Legajos digitales 360°, control de puestos, CCT y asignaciones</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/rrhh/liquidaciones" className="btn btn-outline" style={{ background: "#ffffff" }}>
            💰 Liquidación de Sueldos
          </Link>
          <Link to="/rrhh/empleados/nuevo" className="btn btn-primary" style={{ background: "#0d9488" }}>
            + Nuevo Colaborador
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-row" style={{ marginBottom: 16 }}>
        <Link to="/rrhh" className="tab-btn">
          📊 Tablero RRHH
        </Link>
        <Link to="/rrhh/empleados" className="tab-btn active">
          👤 Colaboradores & Legajos ({employees.length})
        </Link>
        <Link to="/rrhh/organigrama" className="tab-btn">
          🏢 Organigrama & Puestos
        </Link>
        <Link to="/rrhh/manuales" className="tab-btn">
          📖 Manuales de Procedimientos
        </Link>
        <Link to="/rrhh/liquidaciones" className="tab-btn">
          💰 Liquidación de Sueldos
        </Link>
        <Link to="/rrhh/ayuda" className="tab-btn">
          💡 Ayuda RRHH
        </Link>
      </div>

      {/* KPI Cards Header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(13, 148, 136, 0.08), rgba(255,255,255,1))" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>TOTAL COLABORADORES</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#0f172a", marginTop: 4 }}>{employees.length}</div>
          <div style={{ fontSize: "0.75rem", color: "#047857" }}>{employees.filter((e) => e.status === 0).length} Activos en nómina</div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(255,255,255,1))" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>DEPARTAMENTOS</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#1e40af", marginTop: 4 }}>{departments.length || 1}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Técnica, Operaciones, Ventas</div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(255,255,255,1))" }}>
          <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 700 }}>CONVENIOS (CCT)</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#b45309", marginTop: 4 }}>
            {new Set(employees.map((e) => e.unionCct).filter(Boolean)).size || 1}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Comercio, UOM, UOCRA, etc.</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card pad" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            <input
              type="text"
              placeholder="Buscar por Nombre, Apellido, Legajo o CUIL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "9px 14px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
            />
          </div>

          <div style={{ width: "200px" }}>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}
            >
              <option value="ALL">Todos los Departamentos</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Employees Grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px" }}>Cargando nómina de colaboradores...</div>
      ) : filtered.length === 0 ? (
        <div className="card pad" style={{ textAlign: "center", padding: "40px" }}>
          <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "8px" }}>👥</span>
          <h3>No se encontraron colaboradores</h3>
          <p className="muted">Registrá a los miembros de tu equipo para gestionar sus legajos, EPP y sueldos.</p>
          <Link to="/rrhh/empleados/nuevo" className="btn btn-primary" style={{ background: "#0d9488", marginTop: "12px" }}>
            + Cargar Primer Colaborador
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {filtered.map((emp) => (
            <div
              key={emp.id}
              className="card pad"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderTop: `4px solid ${emp.status === 0 ? "#0d9488" : "#94a3b8"}`,
                cursor: "pointer",
                transition: "transform 0.15s ease, box-shadow 0.15s ease"
              }}
              onClick={() => navigate(`/rrhh/empleados/${emp.id}`)}
            >
              <div>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  {/* Photo or Initials Avatar */}
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: "50%",
                      background: "#e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.2rem",
                      fontWeight: 800,
                      color: "#475569",
                      overflow: "hidden",
                      flexShrink: 0
                    }}
                  >
                    {emp.photoPath ? (
                      <img src={emp.photoPath} alt={emp.firstName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      `${emp.firstName.charAt(0)}${emp.lastName.charAt(0)}`
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b" }}>LEGAJO #{emp.fileNumber}</span>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          background: emp.status === 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(100, 116, 139, 0.15)",
                          color: emp.status === 0 ? "#047857" : "#475569",
                          fontWeight: 700
                        }}
                      >
                        {emp.status === 0 ? "Activo" : "Baja"}
                      </span>
                    </div>

                    <h3 style={{ margin: "2px 0 0 0", fontSize: "1.05rem", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {emp.lastName}, {emp.firstName}
                    </h3>
                    <div style={{ fontSize: "0.82rem", color: "#0d9488", fontWeight: 600 }}>{emp.jobTitle || "Puesto no definido"}</div>
                  </div>
                </div>

                <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #f1f5f9", display: "grid", gap: "6px", fontSize: "0.8rem", color: "#475569" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>CUIL / DNI:</span>
                    <strong style={{ fontFamily: "monospace" }}>{emp.cuil || emp.documentNumber}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Dpto / Centro:</span>
                    <span>{emp.department} • {emp.costCenter}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Convenio / Gremio:</span>
                    <span style={{ fontWeight: 600 }}>{emp.unionCct}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Básico Mensual:</span>
                    <strong style={{ color: "#047857", fontFamily: "monospace" }}>${(emp.baseSalary || 0).toLocaleString("es-AR")}</strong>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/rrhh/empleados/${emp.id}`);
                  }}
                  className="btn btn-outline"
                  style={{ padding: "5px 12px", fontSize: "0.75rem" }}
                >
                  Ver Ficha 360° →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
