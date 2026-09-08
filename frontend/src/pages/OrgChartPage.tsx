import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Employee, type OrganizationPosition } from "../api/types";

const DEPARTMENTS = [
  "Dirección & Gerencia General",
  "Metrología & Laboratorio",
  "Calidad & Asuntos Regulatorios",
  "Comercial & Ventas",
  "Taller & Servicio Técnico",
  "Logística & Flota",
  "Administración & Finanzas",
  "Recursos Humanos"
];

export function OrgChartPage() {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [posList, empList] = await Promise.all([
        api.listPositions(),
        api.listEmployees()
      ]);
      setPositions(posList || []);
      setEmployees(empList || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Error al cargar organigrama.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (pos: OrganizationPosition) => {
    if (!window.confirm(`¿Eliminar el puesto "${pos.title}" del organigrama?`)) return;
    try {
      await api.deletePosition(pos.id);
      await load();
    } catch (err: any) {
      setError(err?.message || "Error al eliminar puesto.");
    }
  };

  const empMap = new Map(employees.map((e) => [e.id, `${e.lastName}, ${e.firstName}`]));

  return (
    <div className="page-wide stack" style={{ gap: 24, paddingBottom: 60 }}>
      {/* Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span className="eyebrow" style={{ color: "#ec4899", fontWeight: 700 }}>ESTRUCTURA ORGANIZACIONAL</span>
          <h1>🏢 Organigrama & Descripción de Puestos</h1>
          <p className="muted">Estructura jerárquica de la empresa, asignación de colaboradores y perfiles de puesto por área</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link
            to="/rrhh/organigrama/puestos/nuevo"
            className="btn"
            style={{ background: "linear-gradient(135deg, #ec4899, #db2777)", color: "#fff", fontWeight: 700 }}
          >
            ➕ Nuevo Puesto en Organigrama
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-row">
        <Link to="/rrhh" className="tab-btn">
          📊 Tablero RRHH
        </Link>
        <Link to="/rrhh/empleados" className="tab-btn">
          👤 Colaboradores & Legajos ({employees.length})
        </Link>
        <Link to="/rrhh/organigrama" className="tab-btn active">
          🏢 Organigrama & Puestos ({positions.length})
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

      {error && <div className="alert">{error}</div>}

      {/* Organigrama Grid by Department */}
      <div className="stack" style={{ gap: 20 }}>
        {loading ? (
          <div className="card pad" style={{ textAlign: "center", padding: 40 }}>
            <div className="muted">Cargando organigrama...</div>
          </div>
        ) : positions.length === 0 ? (
          <div className="card pad" style={{ textAlign: "center", padding: 40 }}>
            <h3>No hay puestos definidos en el Organigrama</h3>
            <p className="muted">Comenzá dando de alta los puestos clave de la empresa con sus descripciones y colaboradores asignados.</p>
            <Link to="/rrhh/organigrama/puestos/nuevo" className="btn" style={{ marginTop: 12 }}>
              + Crear Primer Puesto
            </Link>
          </div>
        ) : (
          DEPARTMENTS.map((dept) => {
            const deptPositions = positions.filter((p) => p.department === dept);
            if (deptPositions.length === 0) return null;

            return (
              <div key={dept} className="card pad" style={{ borderLeft: "5px solid #ec4899" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h2 style={{ fontSize: "1.15rem", margin: 0 }}>🏢 {dept}</h2>
                  <span className="badge primary" style={{ fontSize: "0.75rem" }}>
                    {deptPositions.length} {deptPositions.length === 1 ? "puesto" : "puestos"}
                  </span>
                </div>

                <div className="grid-3" style={{ gap: 14 }}>
                  {deptPositions.map((pos) => {
                    const assignedName = pos.assignedEmployeeId ? empMap.get(pos.assignedEmployeeId) : null;
                    return (
                      <div
                        key={pos.id}
                        style={{
                          background: "var(--surface-sunken)",
                          padding: "14px 16px",
                          borderRadius: 8,
                          border: "1px solid #cbd5e1",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          gap: 10
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <strong style={{ fontSize: "0.95rem", color: "var(--text-main)" }}>{pos.title}</strong>
                            <span className="badge ok" style={{ fontSize: "0.68rem" }}>
                              Nivel {pos.level}
                            </span>
                          </div>

                          <div style={{ marginTop: 8, fontSize: "0.82rem" }}>
                            <span className="muted">Ocupante: </span>
                            {assignedName ? (
                              <strong style={{ color: "#0d9488" }}>👤 {assignedName}</strong>
                            ) : (
                              <span style={{ color: "#f59e0b", fontStyle: "italic" }}>⚠️ Vacante sin asignar</span>
                            )}
                          </div>

                          {pos.mission && (
                            <p
                              className="muted"
                              style={{
                                fontSize: "0.78rem",
                                marginTop: 6,
                                lineClamp: 2,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden"
                              }}
                            >
                              {pos.mission}
                            </p>
                          )}
                        </div>

                        <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                          <Link
                            to={`/rrhh/organigrama/puestos/${pos.id}/descripcion`}
                            className="btn ghost compact"
                            style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                          >
                            📄 Ver Descripción
                          </Link>
                          <div className="row" style={{ gap: 4 }}>
                            <Link
                              to={`/rrhh/organigrama/puestos/${pos.id}`}
                              className="btn ghost compact"
                              style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                            >
                              ✏️
                            </Link>
                            <button
                              type="button"
                              className="btn ghost compact"
                              style={{ fontSize: "0.75rem", padding: "4px 8px", color: "#ef4444" }}
                              onClick={() => handleDelete(pos)}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
