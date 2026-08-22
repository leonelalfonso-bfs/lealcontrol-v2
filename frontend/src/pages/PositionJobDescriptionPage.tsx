import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { type Employee, type OrganizationPosition } from "../api/types";

export function PositionJobDescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [position, setPosition] = useState<OrganizationPosition | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [superiorPosition, setSuperiorPosition] = useState<OrganizationPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [positions, employees] = await Promise.all([
          api.listPositions(),
          api.listEmployees()
        ]);
        const current = (positions || []).find((p) => p.id === id) || null;
        setPosition(current);

        if (current?.assignedEmployeeId) {
          const emp = (employees || []).find((e) => e.id === current.assignedEmployeeId) || null;
          setEmployee(emp);
        }

        if (current?.reportsToPositionId) {
          const sup = (positions || []).find((p) => p.id === current.reportsToPositionId) || null;
          setSuperiorPosition(sup);
        }
      } catch (e: any) {
        setError(e?.message || "Error al cargar la descripción de puesto.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <p className="muted">Cargando descripción de puesto...</p>
      </div>
    );
  }

  if (!position) {
    return (
      <div className="page-wide stack" style={{ gap: 20 }}>
        <div className="alert">{error || "Puesto no encontrado"}</div>
        <button className="btn" onClick={() => navigate("/rrhh/organigrama")}>
          ← Volver al Organigrama
        </button>
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
            <span style={{ color: "#0f172a", fontWeight: 600 }}>{position.title}</span>
          </div>
          <h1 style={{ margin: 0 }}>📄 Perfil & Descripción de Puesto: {position.title}</h1>
          <p className="muted" style={{ margin: "4px 0 0 0" }}>
            {position.department} · Nivel Jerárquico {position.level}
          </p>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>
            🖨️ Imprimir / Guardar PDF
          </button>
          <Link to={`/rrhh/organigrama/puestos/${position.id}`} className="btn btn-outline">
            ✏️ Editar Puesto
          </Link>
          <button type="button" className="btn" onClick={() => navigate("/rrhh/organigrama")}>
            ← Volver al Organigrama
          </button>
        </div>
      </div>

      {/* Main Document Card */}
      <div className="card pad stack" style={{ gap: 24, borderTop: "6px solid #ec4899" }}>
        {/* Top Summary Grid */}
        <div className="grid-3" style={{ background: "var(--surface-sunken)", padding: "16px", borderRadius: 8 }}>
          <div>
            <span className="muted" style={{ fontSize: "0.8rem", display: "block" }}>DEPARTAMENTO / ÁREA</span>
            <strong style={{ fontSize: "1.05rem" }}>🏢 {position.department}</strong>
          </div>
          <div>
            <span className="muted" style={{ fontSize: "0.8rem", display: "block" }}>COLABORADOR OCUPANTE</span>
            <strong style={{ fontSize: "1.05rem", color: employee ? "#0d9488" : "#f59e0b" }}>
              {employee ? `👤 ${employee.lastName}, ${employee.firstName}` : "⚠️ Vacante sin asignar"}
            </strong>
          </div>
          <div>
            <span className="muted" style={{ fontSize: "0.8rem", display: "block" }}>SUPERIOR INMEDIATO</span>
            <strong style={{ fontSize: "1.05rem" }}>
              {superiorPosition ? `🏢 ${superiorPosition.title}` : "Dirección General"}
            </strong>
          </div>
        </div>

        {/* Section 1: Mission */}
        <div>
          <h3 style={{ borderBottom: "2px solid #cbd5e1", paddingBottom: 6, color: "#0f172a" }}>
            1. Misión Principal del Puesto
          </h3>
          <p style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "#334155" }}>
            {position.mission || "No se ha definido una misión específica para este puesto."}
          </p>
        </div>

        {/* Section 2: Responsibilities */}
        <div>
          <h3 style={{ borderBottom: "2px solid #cbd5e1", paddingBottom: 6, color: "#0f172a" }}>
            2. Responsabilidades y Tareas Clave
          </h3>
          <p style={{ fontSize: "0.95rem", lineHeight: 1.6, whiteSpace: "pre-line", color: "#334155" }}>
            {position.responsibilities || "No se han especificado responsabilidades."}
          </p>
        </div>

        {/* Section 3: Qualifications & Competencies */}
        <div className="grid-2" style={{ gap: 20 }}>
          <div>
            <h3 style={{ borderBottom: "2px solid #cbd5e1", paddingBottom: 6, color: "#0f172a" }}>
              3. Formación & Requisitos Mínimos
            </h3>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.6, whiteSpace: "pre-line", color: "#334155" }}>
              {position.requiredQualifications || "No se han especificado requisitos formativos."}
            </p>
          </div>
          <div>
            <h3 style={{ borderBottom: "2px solid #cbd5e1", paddingBottom: 6, color: "#0f172a" }}>
              4. Competencias Requeridas
            </h3>
            <p style={{ fontSize: "0.95rem", lineHeight: 1.6, whiteSpace: "pre-line", color: "#334155" }}>
              {position.competencies || "No se han especificado competencias."}
            </p>
          </div>
        </div>

        {/* Section 4: KPIs */}
        {position.kpis && (
          <div style={{ background: "#f8fafc", padding: "16px", borderRadius: 8, border: "1px solid #cbd5e1" }}>
            <h3 style={{ margin: "0 0 8px 0", color: "#0f172a" }}>5. Indicadores Clave de Desempeño (KPIs)</h3>
            <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.6, whiteSpace: "pre-line", color: "#334155" }}>
              {position.kpis}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
