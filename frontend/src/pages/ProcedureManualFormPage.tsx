import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { type ProcedureManual } from "../api/types";

const AREAS = [
  "Metrología",
  "Calidad",
  "Ventas",
  "Taller",
  "Logística",
  "Administración",
  "RRHH"
];

export function ProcedureManualFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState(AREAS[0]);
  const [version, setVersion] = useState("v1.0");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Vigente");
  const [description, setDescription] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isEditing || !id) {
        setCode(`PO-MET-00${Math.floor(1 + Math.random() * 9)}`);
        return;
      }

      setLoading(true);
      try {
        const manuals = await api.listProcedureManuals();
        const current = (manuals || []).find((m) => m.id === id);
        if (current) {
          setCode(current.code);
          setTitle(current.title);
          setArea(current.area);
          setVersion(current.version);
          setEffectiveDate(current.effectiveDate ? current.effectiveDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
          setStatus(current.status);
          setDescription(current.description || "");
          setDocumentUrl(current.documentUrl || "");
        }
      } catch (err: any) {
        setError(err?.message || "Error al cargar procedimiento.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEditing]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) {
      setError("Completá el código y título del procedimiento.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: Partial<ProcedureManual> = {
        code: code.trim(),
        title: title.trim(),
        area: area.trim(),
        version: version.trim(),
        effectiveDate: new Date(effectiveDate).toISOString(),
        status: status.trim(),
        description: description.trim(),
        documentUrl: documentUrl.trim() || null
      };

      if (isEditing && id) {
        await api.updateProcedureManual(id, payload);
      } else {
        await api.createProcedureManual(payload);
      }
      navigate("/rrhh/manuales");
    } catch (err: any) {
      setError(err?.message || "Error al guardar el procedimiento.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <p className="muted">Cargando procedimiento...</p>
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
            <Link to="/rrhh/manuales" style={{ color: "#64748b", textDecoration: "none" }}>
              Manuales de Procedimientos
            </Link>
            <span>›</span>
            <span style={{ color: "#0f172a", fontWeight: 600 }}>{isEditing ? `Editar: ${code}` : "Nuevo Procedimiento"}</span>
          </div>
          <h1 style={{ margin: 0 }}>{isEditing ? `✏️ Editar Procedimiento: ${code} - ${title}` : "➕ Nuevo Procedimiento / Instructivo"}</h1>
          <p className="muted" style={{ margin: "4px 0 0 0" }}>
            Estandarización de procesos operativos, control de versiones ISO y manuales de calidad por área
          </p>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate("/rrhh/manuales")}>
            ← Cancelar y Volver
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSubmit}
            disabled={saving}
            style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Procedimiento"}
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <form onSubmit={handleSubmit} className="stack" style={{ gap: 20 }}>
        {/* Card 1: Identificación */}
        <div className="card pad stack" style={{ gap: 16, borderLeft: "5px solid #8b5cf6" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>1. Identificación y Alcance del Procedimiento</h2>

          <div className="grid-3">
            <label>
              Código Normalizado *
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ej: PO-MET-001"
              />
            </label>

            <label>
              Área Responsable *
              <select value={area} onChange={(e) => setArea(e.target.value)} required>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Versión *
              <input
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="v1.0"
              />
            </label>
          </div>

          <label>
            Título Completo del Procedimiento / Instructivo *
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Procedimiento de Calibración de Balanzas de Gran Capacidad in situ"
            />
          </label>

          <div className="grid-2">
            <label>
              Fecha de Entrada en Vigencia *
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </label>

            <label>
              Estado del Procedimiento *
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Vigente">✓ Vigente</option>
                <option value="EnRevisión">En Revisión</option>
                <option value="Obsoleto">Obsoleto</option>
              </select>
            </label>
          </div>
        </div>

        {/* Card 2: Contenido & Enlaces */}
        <div className="card pad stack" style={{ gap: 16, borderLeft: "5px solid #3b82f6" }}>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>2. Descripción del Contenido y Documento Adjunto</h2>

          <label>
            Resumen, Alcance y Destinatarios del Procedimiento *
            <textarea
              rows={5}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describí los pasos principales, criterios de aceptación, equipos de seguridad requeridos y responsables de ejecución..."
            />
          </label>

          <label>
            Enlace al Documento Completo (URL / PDF / Documento en la Nube)
            <input
              value={documentUrl}
              onChange={(e) => setDocumentUrl(e.target.value)}
              placeholder="https://docs.google.com/... o https://drive.google.com/..."
            />
            <small className="muted">Podés pegar el link directo al archivo PDF o carpeta de red donde se encuentra el manual original.</small>
          </label>
        </div>

        {/* Action Bar */}
        <div className="card pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate("/rrhh/manuales")}>
            ← Cancelar y Volver
          </button>
          <button
            type="submit"
            className="btn"
            disabled={saving}
            style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Procedimiento"}
          </button>
        </div>
      </form>
    </div>
  );
}
