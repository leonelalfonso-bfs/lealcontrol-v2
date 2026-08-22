import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

export function OrganizationPositionFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [posList, empList] = await Promise.all([
          api.listPositions(),
          api.listEmployees()
        ]);
        setPositions(posList || []);
        setEmployees(empList || []);

        if (isEditing && id) {
          const current = (posList || []).find((p) => p.id === id);
          if (current) {
            setTitle(current.title);
            setDepartment(current.department);
            setReportsToPositionId(current.reportsToPositionId || "");
            setAssignedEmployeeId(current.assignedEmployeeId || "");
            setMission(current.mission || "");
            setResponsibilities(current.responsibilities || "");
            setRequiredQualifications(current.requiredQualifications || "");
            setCompetencies(current.competencies || "");
            setKpis(current.kpis || "");
            setLevel(current.level || 3);
          }
        }
      } catch (err: any) {
        setError(err?.message || "Error al cargar datos del puesto.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEditing]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Ingresá el título o denominación del puesto.");
      return;
    }

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

      if (isEditing && id) {
        await api.updatePosition(id, payload);
      } else {
        await api.createPosition(payload);
      }
      navigate("/rrhh/organigrama");
    } catch (err: any) {
      setError(err?.message || "Error al guardar el puesto.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <p className="muted">Cargando formulario de puesto...</p>
      </div>
    );
  }

  return (
    <div className="page-wide stack" style={{ gap: 24, paddingBottom: 80 }}>
      {/* Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#64748b", marginBottom: 6 }}>
            <Link to="/rrhh" style={{ color: "#64748b", textDecoration: "none" }}>
              RRHH
            </Link>
            <span>›</span>
            <Link to="/rrhh/organigrama" style={{ color: "#64748b", textDecoration: "none" }}>
              Organigrama & Puestos
            </Link>
            <span>›</span>
            <span style={{ color: "#0f172a", fontWeight: 600 }}>{isEditing ? `Editar: ${title}` : "Nuevo Puesto"}</span>
          </div>
          <h1 style={{ margin: 0 }}>{isEditing ? `✏️ Editar Puesto: ${title}` : "➕ Nuevo Puesto en Organigrama"}</h1>
          <p className="muted" style={{ margin: "4px 0 0 0" }}>
            Definición estructural del puesto, dependencia jerárquica, colaborador ocupante y descripción de funciones
          </p>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate("/rrhh/organigrama")}>
            ← Cancelar y Volver
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSubmit}
            disabled={saving}
            style={{ background: "linear-gradient(135deg, #ec4899, #db2777)", color: "#fff", fontWeight: 700 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Puesto"}
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <form onSubmit={handleSubmit} className="stack" style={{ gap: 20 }}>
        {/* Tarjeta 1: Estructura & Asignación */}
        <div className="card pad stack" style={{ gap: 16, borderLeft: "5px solid #ec4899" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>1. Identificación y Ubicación en el Organigrama</h2>
          
          <div className="grid-2">
            <label>
              Título / Denominación del Puesto *
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Técnico Metrólogo Senior"
              />
            </label>

            <label>
              Departamento / Área de la Empresa *
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
              Colaborador Ocupante Asignado
              <select value={assignedEmployeeId} onChange={(e) => setAssignedEmployeeId(e.target.value)}>
                <option value="">-- Vacante / Sin Asignar --</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    👤 {e.lastName}, {e.firstName} (Legajo: {e.fileNumber})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Reporta Jerárquicamente a (Superior)
              <select value={reportsToPositionId} onChange={(e) => setReportsToPositionId(e.target.value)}>
                <option value="">-- Sin Superior Directo (Dirección) --</option>
                {positions.filter((p) => p.id !== id).map((p) => (
                  <option key={p.id} value={p.id}>
                    🏢 {p.title} ({p.department})
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
        </div>

        {/* Tarjeta 2: Misión y Responsabilidades */}
        <div className="card pad stack" style={{ gap: 16, borderLeft: "5px solid #3b82f6" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>2. Misión y Responsabilidades del Puesto</h2>

          <label>
            Misión Principal del Puesto (Propósito Estratégico) *
            <textarea
              rows={3}
              required
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              placeholder="Describí en 2 o 3 oraciones cuál es el propósito de este puesto y qué valor aporta a la empresa..."
            />
          </label>

          <label>
            Responsabilidades y Tareas Clave *
            <textarea
              rows={5}
              required
              value={responsibilities}
              onChange={(e) => setResponsibilities(e.target.value)}
              placeholder="- Ejecutar calibraciones y ensayos in situ conforme a las normas OIML / INTI.&#10;- Confeccionar informes técnicos y certificados de calibración.&#10;- Mantener la trazabilidad de los patrones de masa y equipos auxiliares.&#10;- Cumplir con las normas de seguridad e higiene laboral."
            />
          </label>
        </div>

        {/* Tarjeta 3: Perfil, Competencias & KPIs */}
        <div className="card pad stack" style={{ gap: 16, borderLeft: "5px solid #10b981" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>3. Perfil Requerido, Competencias y Métricas (KPIs)</h2>

          <div className="grid-2">
            <label>
              Formación & Experiencia Requerida
              <textarea
                rows={4}
                value={requiredQualifications}
                onChange={(e) => setRequiredQualifications(e.target.value)}
                placeholder="Título técnico electromecánico / electrónico, registro de conducir habilitado, experiencia mínima de 2 años en pesaje industrial..."
              />
            </label>

            <label>
              Competencias Técnicas y Conductuales
              <textarea
                rows={4}
                value={competencies}
                onChange={(e) => setCompetencies(e.target.value)}
                placeholder="Orientación a la precisión, proactividad, trabajo en equipo, capacidad analítica, comunicación clara con clientes..."
              />
            </label>
          </div>

          <label>
            Indicadores Clave de Desempeño (KPIs de Evaluación)
            <textarea
              rows={2}
              value={kpis}
              onChange={(e) => setKpis(e.target.value)}
              placeholder="Ej: Calibraciones realizadas dentro de plazo (>95%), 0 no conformidades en auditorías de calidad..."
            />
          </label>
        </div>

        {/* Bottom Action Bar */}
        <div className="card pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate("/rrhh/organigrama")}>
            ← Cancelar y Volver
          </button>
          <button
            type="submit"
            className="btn"
            disabled={saving}
            style={{ background: "linear-gradient(135deg, #ec4899, #db2777)", color: "#fff", fontWeight: 700 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Puesto en Organigrama"}
          </button>
        </div>
      </form>
    </div>
  );
}
