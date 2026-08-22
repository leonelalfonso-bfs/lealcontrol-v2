import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Position Create/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [reportsToPositionId, setReportsToPositionId] = useState<string>("");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<string>("");
  const [mission, setMission] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [requiredQualifications, setRequiredQualifications] = useState("");
  const [competencies, setCompetencies] = useState("");
  const [kpis, setKpis] = useState("");
  const [level, setLevel] = useState(3);
  const [saving, setSaving] = useState(false);

  // Job Description View Modal
  const [viewingPosition, setViewingPosition] = useState<OrganizationPosition | null>(null);

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

  const openNew = () => {
    setEditingId(null);
    setTitle("");
    setDepartment(DEPARTMENTS[0]);
    setReportsToPositionId("");
    setAssignedEmployeeId("");
    setMission("");
    setResponsibilities("");
    setRequiredQualifications("");
    setCompetencies("");
    setKpis("");
    setLevel(3);
    setShowModal(true);
  };

  const openEdit = (pos: OrganizationPosition) => {
    setEditingId(pos.id);
    setTitle(pos.title);
    setDepartment(pos.department);
    setReportsToPositionId(pos.reportsToPositionId || "");
    setAssignedEmployeeId(pos.assignedEmployeeId || "");
    setMission(pos.mission || "");
    setResponsibilities(pos.responsibilities || "");
    setRequiredQualifications(pos.requiredQualifications || "");
    setCompetencies(pos.competencies || "");
    setKpis(pos.kpis || "");
    setLevel(pos.level || 3);
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<OrganizationPosition> = {
        title: title.trim(),
        department: department.trim(),
        reportsToPositionId: reportsToPositionId || null,
        assignedEmployeeId: assignedEmployeeId || null,
        mission: mission.trim(),
        responsibilities: responsibilities.trim(),
        requiredQualifications: requiredQualifications.trim(),
        competencies: competencies.trim(),
        kpis: kpis.trim(),
        level: Number(level)
      };

      if (editingId) {
        await api.updatePosition(editingId, payload);
      } else {
        await api.createPosition(payload);
      }
      setShowModal(false);
      await load();
    } catch (err: any) {
      setError(err?.message || "Error al guardar puesto.");
    } finally {
      setSaving(false);
    }
  };

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
          <button className="btn" onClick={openNew} style={{ background: "linear-gradient(135deg, #ec4899, #db2777)", color: "#fff", fontWeight: 700 }}>
            ➕ Nuevo Puesto en Organigrama
          </button>
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
            <button className="btn" onClick={openNew} style={{ marginTop: 12 }}>
              + Crear Primer Puesto
            </button>
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
                            <p className="muted" style={{ fontSize: "0.78rem", marginTop: 6, lineClamp: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {pos.mission}
                            </p>
                          )}
                        </div>

                        <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                          <button
                            type="button"
                            className="btn ghost compact"
                            style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                            onClick={() => setViewingPosition(pos)}
                          >
                            📄 Ver Descripción
                          </button>
                          <div className="row" style={{ gap: 4 }}>
                            <button
                              type="button"
                              className="btn ghost compact"
                              style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                              onClick={() => openEdit(pos)}
                            >
                              ✏️
                            </button>
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

      {/* Modal: Ver Descripción de Puesto Completa */}
      {viewingPosition && (
        <div className="modal-backdrop" onClick={() => setViewingPosition(null)}>
          <div className="modal-card" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <span className="eyebrow">PERFIL & DESCRIPCIÓN DE PUESTO</span>
                <h2>📄 {viewingPosition.title}</h2>
                <div className="muted">{viewingPosition.department} · Nivel {viewingPosition.level}</div>
              </div>
              <button type="button" className="icon-button" onClick={() => setViewingPosition(null)}>
                ×
              </button>
            </div>

            <div className="stack" style={{ gap: 16, marginTop: 16, fontSize: "0.9rem" }}>
              <div style={{ background: "var(--surface-sunken)", padding: "12px 14px", borderRadius: 8 }}>
                <strong style={{ display: "block", marginBottom: 4 }}>🎯 Misión Principal del Puesto</strong>
                <p style={{ margin: 0 }} className="muted">{viewingPosition.mission || "No especificada."}</p>
              </div>

              <div>
                <strong>📋 Responsabilidades y Tareas Clave</strong>
                <p className="muted" style={{ whiteSpace: "pre-line", marginTop: 4 }}>{viewingPosition.responsibilities || "No especificadas."}</p>
              </div>

              <div className="grid-2" style={{ gap: 14 }}>
                <div>
                  <strong>🎓 Formación & Requisitos</strong>
                  <p className="muted" style={{ whiteSpace: "pre-line", marginTop: 4 }}>{viewingPosition.requiredQualifications || "No especificados."}</p>
                </div>
                <div>
                  <strong>💡 Competencias Requeridas</strong>
                  <p className="muted" style={{ whiteSpace: "pre-line", marginTop: 4 }}>{viewingPosition.competencies || "No especificadas."}</p>
                </div>
              </div>

              {viewingPosition.kpis && (
                <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1" }}>
                  <strong>📊 Indicadores Clave de Desempeño (KPIs)</strong>
                  <p className="muted" style={{ whiteSpace: "pre-line", margin: "4px 0 0 0" }}>{viewingPosition.kpis}</p>
                </div>
              )}
            </div>

            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" className="btn" onClick={() => setViewingPosition(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear / Editar Puesto */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <span className="eyebrow">ESTRUCTURA RRHH</span>
                <h2>{editingId ? "✏️ Editar Puesto" : "➕ Nuevo Puesto en Organigrama"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSave} className="stack" style={{ gap: 14, marginTop: 14 }}>
              <div className="grid-2">
                <label>
                  Título del Puesto *
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej: Técnico Metrólogo Senior"
                  />
                </label>

                <label>
                  Departamento / Área *
                  <select value={department} onChange={(e) => setDepartment(e.target.value)} required>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid-3">
                <label>
                  Colaborador Asignado
                  <select value={assignedEmployeeId} onChange={(e) => setAssignedEmployeeId(e.target.value)}>
                    <option value="">-- Vacante / Sin Asignar --</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.lastName}, {e.firstName} ({e.fileNumber})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Reporta Jerárquicamente a
                  <select value={reportsToPositionId} onChange={(e) => setReportsToPositionId(e.target.value)}>
                    <option value="">-- Sin Superior Directo --</option>
                    {positions.filter((p) => p.id !== editingId).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.department})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Nivel Jerárquico *
                  <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                    <option value={1}>1. Dirección / Gerencia General</option>
                    <option value={2}>2. Gerencia de Área</option>
                    <option value={3}>3. Jefatura / Líder Técnico</option>
                    <option value={4}>4. Operativo / Especialista</option>
                  </select>
                </label>
              </div>

              <label>
                Misión Principal del Puesto *
                <textarea
                  rows={2}
                  required
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  placeholder="Propósito estratégico del puesto dentro de la organización..."
                />
              </label>

              <label>
                Responsabilidades y Tareas Clave *
                <textarea
                  rows={3}
                  required
                  value={responsibilities}
                  onChange={(e) => setResponsibilities(e.target.value)}
                  placeholder="- Realizar ensayos y calibraciones metrológicas in situ&#10;- Confeccionar informes técnicos y certificados..."
                />
              </label>

              <div className="grid-2">
                <label>
                  Formación & Requisitos
                  <textarea
                    rows={2}
                    value={requiredQualifications}
                    onChange={(e) => setRequiredQualifications(e.target.value)}
                    placeholder="Técnico electrónico / electromecánico, registro de conducir habilitado..."
                  />
                </label>

                <label>
                  Competencias Requeridas
                  <textarea
                    rows={2}
                    value={competencies}
                    onChange={(e) => setCompetencies(e.target.value)}
                    placeholder="Orientación al detalle, trabajo en equipo, manejo de normas ISO 17025..."
                  />
                </label>
              </div>

              <label>
                Indicadores de Desempeño (KPIs)
                <input
                  value={kpis}
                  onChange={(e) => setKpis(e.target.value)}
                  placeholder="Ej: Calibraciones realizadas en término, 0 reclamos técnicos..."
                />
              </label>

              <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar Puesto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
