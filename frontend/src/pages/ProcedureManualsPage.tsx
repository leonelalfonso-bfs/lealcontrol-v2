import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HrTabs } from "../components/hr/HrTabs";
import { api, type HrArea } from "../api/client";
import { FileAttachment } from "../components/FileAttachment";
import { type ProcedureManual } from "../api/types";


export function ProcedureManualsPage() {
  const [manuals, setManuals] = useState<ProcedureManual[]>([]);
  const [selectedArea, setSelectedArea] = useState("ALL");
  const [areaList, setAreaList] = useState<HrArea[]>([]);
  const AREAS = [{ id: "ALL", label: "Todas las áreas" }, ...areaList.map((a) => ({ id: a.name, label: a.name }))];
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  useEffect(() => { api.listHrAreas().then(setAreaList).catch(() => setAreaList([])); }, []);

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
    return (
      m.code.toLowerCase().includes(q) ||
      m.title.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page-wide stack" style={{ gap: 24, paddingBottom: 60 }}>
      {/* Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span className="eyebrow t-violet t-strong">GESTIÓN DE CALIDAD & OPERACIONES</span>
          <h1>📖 Manuales de Procedimientos e Instructivos</h1>
          <p className="muted">Repositorio documental de procesos estandarizados, instructivos de trabajo (IT) y normas operativas por área</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link
            to="/rrhh/manuales/nuevo"
            className="btn"
          >
            ➕ Nuevo Procedimiento / Instructivo
          </Link>
        </div>
      </div>

      <HrTabs />

      {error && <div className="alert">{error}</div>}

      {/* Area Filter Buttons & Search */}
      <div className="card pad" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <input
            type="text"
            placeholder="🔍 Buscar por código, título o alcance del procedimiento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
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
          <p style={{ padding: 30 }} className="muted t-center">
            Cargando manuales de procedimientos...
          </p>
        ) : filteredManuals.length === 0 ? (
          <p style={{ padding: 30 }} className="muted t-center">
            No se encontraron procedimientos registrados en el área seleccionada.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Código</th>
                  <th>Título del Procedimiento / Instructivo</th>
                  <th style={{ width: 130 }}>Área</th>
                  <th className="t-center" style={{ width: 80 }}>Versión</th>
                  <th className="t-center" style={{ width: 100 }}>Vigencia</th>
                  <th className="t-center" style={{ width: 90 }}>Estado</th>
                  <th className="t-right" style={{ width: 130 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredManuals.map((m) => (
                  <tr key={m.id}>
                    <td className="t-mono t-strong t-violet">
                      {m.code}
                    </td>
                    <td>
                      <div>
                        <strong style={{ color: "var(--text-main)", display: "block" }}>{m.title}</strong>
                        {m.description && (
                          <span className="muted t-small">
                            {m.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge primary t-small">
                        {m.area}
                      </span>
                    </td>
                    <td className="t-center t-strong">{m.version}</td>
                    <td className="muted t-center t-small">
                      {m.effectiveDate ? new Date(m.effectiveDate).toLocaleDateString("es-AR") : "—"}
                    </td>
                    <td className="t-center">
                      <span
                        className={`badge ${m.status === "Vigente" ? "ok" : m.status === "EnRevisión" ? "primary" : "ghost"}`}
                        style={{ fontSize: "0.7rem" }}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="t-right">
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <FileAttachment path={`/api/v1/hr/manuals/${m.id}/file`} fileName={m.fileName} onChanged={() => void load()} />
                        {m.documentUrl && (
                          <a
                            href={m.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn ghost compact"
                            title="Abrir el enlace externo"
                          >
                            🔗 Enlace
                          </a>
                        )}
                        <Link
                          to={`/rrhh/manuales/${m.id}`}
                          className="btn ghost compact"
                          title="Editar manual"
                        >
                          ✏️
                        </Link>
                        <button
                          type="button"
                          className="btn ghost compact btn-outline danger"
                          title="Eliminar manual"
                          onClick={() => handleDelete(m)}
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
    </div>
  );
}
