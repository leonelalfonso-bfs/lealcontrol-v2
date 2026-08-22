import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type ProcedureManual } from "../api/types";

const AREAS = [
  { id: "ALL", label: "Todas las Áreas" },
  { id: "Metrología", label: "⚖️ Metrología & Laboratorio" },
  { id: "Calidad", label: "🛡️ Calidad & Procesos (ISO)" },
  { id: "Ventas", label: "💼 Comercial & Ventas" },
  { id: "Taller", label: "🔧 Taller & Servicio Técnico" },
  { id: "Logística", label: "🚚 Logística & Flota" },
  { id: "Administración", label: "📊 Administración & Finanzas" },
  { id: "RRHH", label: "👥 Recursos Humanos" }
];

export function ProcedureManualsPage() {
  const [manuals, setManuals] = useState<ProcedureManual[]>([]);
  const [selectedArea, setSelectedArea] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("Metrología");
  const [version, setVersion] = useState("v1.0");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Vigente");
  const [description, setDescription] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listProcedureManuals(selectedArea);
      setManuals(data || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Error al cargar manuales de procedimientos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedArea]);

  const openNew = () => {
    setEditingId(null);
    setCode(`PO-${selectedArea !== "ALL" ? selectedArea.slice(0, 3).toUpperCase() : "MET"}-00${manuals.length + 1}`);
    setTitle("");
    setArea(selectedArea !== "ALL" ? selectedArea : "Metrología");
    setVersion("v1.0");
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setStatus("Vigente");
    setDescription("");
    setDocumentUrl("");
    setShowModal(true);
  };

  const openEdit = (m: ProcedureManual) => {
    setEditingId(m.id);
    setCode(m.code);
    setTitle(m.title);
    setArea(m.area);
    setVersion(m.version);
    setEffectiveDate(m.effectiveDate ? m.effectiveDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setStatus(m.status);
    setDescription(m.description || "");
    setDocumentUrl(m.documentUrl || "");
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
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

      if (editingId) {
        await api.updateProcedureManual(editingId, payload);
      } else {
        await api.createProcedureManual(payload);
      }
      setShowModal(false);
      await load();
    } catch (err: any) {
      setError(err?.message || "Error al guardar manual.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: ProcedureManual) => {
    if (!window.confirm(`¿Eliminar el manual "${m.code} - ${m.title}"?`)) return;
    try {
      await api.deleteProcedureManual(m.id);
      await load();
    } catch (err: any) {
      setError(err?.message || "Error al eliminar manual.");
    }
  };

  const filteredManuals = manuals.filter((m) => {
    const q = search.toLowerCase();
    return m.code.toLowerCase().includes(q) || m.title.toLowerCase().includes(q) || (m.description && m.description.toLowerCase().includes(q));
  });

  return (
    <div className="page-wide stack" style={{ gap: 24, paddingBottom: 60 }}>
      {/* Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span className="eyebrow" style={{ color: "#8b5cf6", fontWeight: 700 }}>GESTIÓN DE CALIDAD & OPERACIONES</span>
          <h1>📖 Manuales de Procedimientos e Instructivos</h1>
          <p className="muted">Repositorio documental de procesos estandarizados, instructivos de trabajo (IT) y normas operativas por área</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn" onClick={openNew} style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700 }}>
            ➕ Nuevo Procedimiento / Instructivo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-row">
        <Link to="/rrhh" className="tab-btn">
          📊 Tablero RRHH
        </Link>
        <Link to="/rrhh/empleados" className="tab-btn">
          👤 Colaboradores & Legajos
        </Link>
        <Link to="/rrhh/organigrama" className="tab-btn">
          🏢 Organigrama & Puestos
        </Link>
        <Link to="/rrhh/manuales" className="tab-btn active">
          📖 Manuales de Procedimientos ({manuals.length})
        </Link>
        <Link to="/rrhh/liquidaciones" className="tab-btn">
          💰 Liquidación de Sueldos
        </Link>
        <Link to="/rrhh/ayuda" className="tab-btn">
          💡 Ayuda RRHH
        </Link>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* Area Filter Buttons & Search */}
      <div className="card pad" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <input
            type="text"
            placeholder="🔍 Buscar por código, título o alcance del procedimiento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}
          />
        </div>

        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {AREAS.map((a) => (
            <button
              key={a.id}
              className={`tab-btn ${selectedArea === a.id ? "active" : ""}`}
              onClick={() => setSelectedArea(a.id)}
              style={{ fontSize: "0.8rem", padding: "6px 10px" }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Manuals List Table */}
      <div className="card pad">
        {loading ? (
          <p style={{ textAlign: "center", padding: 30 }} className="muted">
            Cargando manuales de procedimientos...
          </p>
        ) : filteredManuals.length === 0 ? (
          <p style={{ textAlign: "center", padding: 30 }} className="muted">
            No se encontraron procedimientos registrados en el área seleccionada.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ width: "100%", fontSize: "0.88rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--surface-sunken)", borderBottom: "2px solid #cbd5e1" }}>
                  <th style={{ width: 120 }}>Código</th>
                  <th>Título del Procedimiento / Instructivo</th>
                  <th style={{ width: 130 }}>Área</th>
                  <th style={{ width: 80, textAlign: "center" }}>Versión</th>
                  <th style={{ width: 100, textAlign: "center" }}>Vigencia</th>
                  <th style={{ width: 90, textAlign: "center" }}>Estado</th>
                  <th style={{ width: 130, textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredManuals.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ fontFamily: "monospace", fontWeight: 700, color: "#8b5cf6" }}>
                      {m.code}
                    </td>
                    <td>
                      <div>
                        <strong style={{ color: "var(--text-main)", display: "block" }}>{m.title}</strong>
                        {m.description && (
                          <span className="muted" style={{ fontSize: "0.78rem" }}>
                            {m.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge primary" style={{ fontSize: "0.72rem" }}>
                        {m.area}
                      </span>
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{m.version}</td>
                    <td style={{ textAlign: "center", fontSize: "0.82rem" }} className="muted">
                      {m.effectiveDate ? new Date(m.effectiveDate).toLocaleDateString("es-AR") : "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        className={`badge ${m.status === "Vigente" ? "ok" : m.status === "EnRevisión" ? "primary" : "ghost"}`}
                        style={{ fontSize: "0.7rem" }}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {m.documentUrl && (
                          <a
                            href={m.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn ghost compact"
                            title="Ver documento adjunto"
                            style={{ padding: "3px 8px", fontSize: "0.75rem", color: "#8b5cf6" }}
                          >
                            👁️ Ver
                          </a>
                        )}
                        <button
                          type="button"
                          className="btn ghost compact"
                          title="Editar manual"
                          onClick={() => openEdit(m)}
                          style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn ghost compact"
                          title="Eliminar manual"
                          onClick={() => handleDelete(m)}
                          style={{ padding: "3px 8px", fontSize: "0.75rem", color: "#ef4444" }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Crear / Editar Manual */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <span className="eyebrow">CONTROL DOCUMENTAL</span>
                <h2>{editingId ? "✏️ Editar Procedimiento" : "➕ Nuevo Procedimiento / Instructivo"}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSave} className="stack" style={{ gap: 14, marginTop: 14 }}>
              <div className="grid-2">
                <label>
                  Código del Procedimiento *
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
                    {AREAS.filter((a) => a.id !== "ALL").map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Título del Procedimiento *
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: Procedimiento de Calibración de Balanzas de Gran Capacidad"
                />
              </label>

              <div className="grid-3">
                <label>
                  Versión *
                  <input
                    required
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="v1.0"
                  />
                </label>

                <label>
                  Fecha de Vigencia *
                  <input
                    type="date"
                    required
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                  />
                </label>

                <label>
                  Estado *
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="Vigente">✓ Vigente</option>
                    <option value="EnRevisión">En Revisión</option>
                    <option value="Obsoleto">Obsoleto</option>
                  </select>
                </label>
              </div>

              <label>
                Alcance y Descripción del Procedimiento
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe brevemente el alcance, destinatarios y pautas clave del instructivo..."
                />
              </label>

              <label>
                Enlace al Documento (URL / PDF en la nube / Red local)
                <input
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                  placeholder="https://drive.google.com/... o enlace interno"
                />
              </label>

              <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar Procedimiento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
