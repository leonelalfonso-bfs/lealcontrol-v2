import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HrTabs } from "../components/hr/HrTabs";
import { api } from "../api/client";
import { type Employee } from "../api/types";
import { SearchField } from "../components/ui/SearchField";
import { useDebouncedValue } from "../lib/useDebouncedValue";

export function EmployeesListPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  useEffect(() => {
    loadEmployees();
  }, [debouncedSearch]);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await api.listEmployees(debouncedSearch);
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
          <Link to="/rrhh/liquidaciones" className="btn btn-outline">
            💰 Liquidación de Sueldos
          </Link>
          <Link to="/rrhh/empleados/nuevo" className="btn btn-primary">
            + Nuevo Colaborador
          </Link>
        </div>
      </div>

      <HrTabs />

      {/* KPI Cards Header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad">
          <div className="t-small muted t-strong">TOTAL COLABORADORES</div>
          <div className="t-xl" style={{ fontWeight: 900, marginTop: 4 }}>{employees.length}</div>
          <div className="t-small t-ok">{employees.filter((e) => e.status === 0).length} Activos en nómina</div>
        </div>

        <div className="card pad">
          <div className="t-small muted t-strong">DEPARTAMENTOS</div>
          <div className="t-xl t-info" style={{ fontWeight: 900, marginTop: 4 }}>{departments.length || 1}</div>
          <div className="t-small muted">Técnica, Operaciones, Ventas</div>
        </div>

        <div className="card pad">
          <div className="t-small muted t-strong">CONVENIOS (CCT)</div>
          <div className="t-xl t-warn" style={{ fontWeight: 900, marginTop: 4 }}>
            {new Set(employees.map((e) => e.unionCct).filter(Boolean)).size || 1}
          </div>
          <div className="t-small muted">Comercio, UOM, UOCRA, etc.</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card pad" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar por nombre, apellido, legajo o CUIL"
              style={{ flex: "1 1 320px", maxWidth: 520 }}
            />
          </div>

          <div style={{ width: "200px" }}>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              style={{ width: "100%" }}
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
        <div className="t-center" style={{ padding: "40px" }}>Cargando nómina de colaboradores...</div>
      ) : filtered.length === 0 ? (
        <div className="card pad t-center" style={{ padding: "40px" }}>
          <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "8px" }}>👥</span>
          <h3>No se encontraron colaboradores</h3>
          <p className="muted">Registrá a los miembros de tu equipo para gestionar sus legajos, EPP y sueldos.</p>
          <Link to="/rrhh/empleados/nuevo" className="btn btn-primary" style={{ marginTop: "12px" }}>
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
                  <div className="t-strong muted"
                    style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--lc-line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", overflow: "hidden", flexShrink: 0 }}
                  >
                    {emp.photoPath ? (
                      <img src={emp.photoPath} alt={emp.firstName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      `${emp.firstName.charAt(0)}${emp.lastName.charAt(0)}`
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span className="t-small t-strong muted">LEGAJO #{emp.fileNumber}</span>
                      <span className="t-small t-strong"
                        style={{ padding: "2px 8px", borderRadius: "12px", background: emp.status === 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(100, 116, 139, 0.15)", color: emp.status === 0 ? "var(--lc-ok)" : "var(--lc-ink-2)" }}
                      >
                        {emp.status === 0 ? "Activo" : "Baja"}
                      </span>
                    </div>

                    <h3 style={{ margin: "2px 0 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {emp.lastName}, {emp.firstName}
                    </h3>
                    <div className="t-small t-accent t-strong">{emp.jobTitle || "Puesto no definido"}</div>
                  </div>
                </div>

                <div className="t-small muted" style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--lc-surface-2)", display: "grid", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>CUIL / DNI:</span>
                    <strong className="t-mono">{emp.cuil || emp.documentNumber}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Dpto / Centro:</span>
                    <span>{emp.department} • {emp.costCenter}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Convenio / Gremio:</span>
                    <span className="t-strong">{emp.unionCct}</span>
                  </div>
                  {emp.baseSalary != null && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Básico Mensual:</span>
                      <strong className="t-ok t-mono">${emp.baseSalary.toLocaleString("es-AR")}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/rrhh/empleados/${emp.id}`);
                  }}
                  className="btn btn-outline compact"
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
