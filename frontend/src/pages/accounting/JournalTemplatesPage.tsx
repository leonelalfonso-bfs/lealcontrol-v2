import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { JournalTemplate } from "../../api/types";
import { BatchPostingModal } from "./BatchPostingModal";

export function JournalTemplatesPage() {
  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showBatchModal, setShowBatchModal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const tplList = await api.listJournalTemplates();
      setTemplates(tplList || []);
    } catch (err: any) {
      console.error("Error al cargar asientos modelos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: string, codeName: string) => {
    if (!confirm(`¿Confirma eliminar el asiento modelo "${codeName}"?`)) return;
    try {
      await api.deleteJournalTemplate(id);
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar asiento modelo.");
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesModule = filterModule === "all" || t.sourceModule.toLowerCase() === filterModule.toLowerCase();
    const matchesSearch = !searchTerm || t.code.toLowerCase().includes(searchTerm.toLowerCase()) || t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.documentType.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesModule && matchesSearch;
  });

  return (
    <div className="page-wide">
      {/* Top Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Configuración Contable & Automatización
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            ⚙️ Asientos Modelos
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Plantillas dinámicas para la imputación contable exacta de comprobantes, cobros, pagos y movimientos operativos.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn"
            style={{ background: "#dc2626", color: "#fff", fontWeight: 700 }}
            onClick={() => setShowBatchModal(true)}
          >
            🔴 ► CONTABILIZAR
          </button>
          
          {/* BOTÓN A PANTALLA COMPLETA DEDICADA */}
          <Link
            to="/contabilidad/modelos/nuevo"
            className="btn"
            style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", fontWeight: 700 }}
          >
            ➕ Nuevo Asiento Modelo
          </Link>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="kpi kpi-4" style={{ marginBottom: 24 }}>
        <div className="card pad" style={{ borderLeft: "4px solid #0d9488" }}>
          <div className="muted">Total Modelos Configurados</div>
          <strong style={{ fontSize: "1.8rem" }}>{templates.length}</strong>
          <div style={{ fontSize: "0.78rem", color: "var(--ok)", fontWeight: 700, marginTop: 4 }}>
            ✓ {templates.filter((t) => t.status === "Active").length} activos en ejecución
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #3b82f6" }}>
          <div className="muted">Módulo Ventas</div>
          <strong style={{ fontSize: "1.8rem" }}>{templates.filter((t) => t.sourceModule === "Sales").length}</strong>
          <div style={{ fontSize: "0.78rem", color: "#2563eb", fontWeight: 600, marginTop: 4 }}>
            Facturas A/B/C, NC, ND
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div className="muted">Módulo Compras</div>
          <strong style={{ fontSize: "1.8rem" }}>{templates.filter((t) => t.sourceModule === "Purchases").length}</strong>
          <div style={{ fontSize: "0.78rem", color: "#d97706", fontWeight: 600, marginTop: 4 }}>
            Facturas proveedor & gastos
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #8b5cf6" }}>
          <div className="muted">Finanzas & Tesorería</div>
          <strong style={{ fontSize: "1.8rem" }}>{templates.filter((t) => t.sourceModule === "Finance").length}</strong>
          <div style={{ fontSize: "0.78rem", color: "#7c3aed", fontWeight: 600, marginTop: 4 }}>
            Recibos, pagos y transferencias
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "Todos los Módulos" },
              { id: "Sales", label: "🛒 Ventas" },
              { id: "Purchases", label: "📦 Compras" },
              { id: "Finance", label: "💳 Finanzas / Pagos" },
              { id: "Inventory", label: "🏭 Stock & Producción" }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`btn compact ${filterModule === tab.id ? "" : "ghost"}`}
                style={filterModule === tab.id ? { background: "#0d9488", color: "#fff" } : {}}
                onClick={() => setFilterModule(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ minWidth: 260 }}>
            <input
              type="search"
              placeholder="🔍 Buscar por código, nombre o comprobante..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "100%", padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc" }}
            />
          </div>
        </div>
      </div>

      {/* Templates Table */}
      <div className="card pad">
        {loading ? (
          <div className="muted" style={{ padding: 40, textAlign: "center" }}>Cargando asientos modelos...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="muted" style={{ padding: 40, textAlign: "center" }}>
            No se encontraron asientos modelos con los filtros seleccionados.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Código</th>
                  <th>Nombre del Asiento Modelo</th>
                  <th>Módulo Origen</th>
                  <th>Tipo Comprobante</th>
                  <th>Serie</th>
                  <th style={{ textAlign: "center" }}>Líneas</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="badge" style={{ background: "#e6fffa", color: "#0f766e", fontWeight: 700 }}>
                        {t.code}
                      </span>
                    </td>
                    <td>
                      <strong>{t.name}</strong>
                      {t.description && <div className="muted" style={{ fontSize: "0.76rem" }}>{t.description}</div>}
                    </td>
                    <td>
                      <span className="badge">
                        {t.sourceModule === "Sales" ? "🛒 Ventas" : t.sourceModule === "Purchases" ? "📦 Compras" : t.sourceModule === "Finance" ? "💳 Finanzas" : t.sourceModule}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{t.documentType}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.8rem", color: "#555" }}>{t.entrySeries || "General"}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="badge" style={{ background: "#f1f5f9", fontWeight: 700 }}>
                        {t.lines?.length || 0} cuentas
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${t.status === "Active" ? "ok" : "prio-high"}`}>
                        {t.status === "Active" ? "✓ Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <Link
                          to={`/contabilidad/modelos/${t.id}`}
                          className="btn ghost compact"
                          title="Editar Asiento Modelo"
                        >
                          ✏️ Editar
                        </Link>
                        <button
                          type="button"
                          className="btn ghost compact"
                          style={{ color: "#dc2626" }}
                          onClick={() => handleDelete(t.id, `${t.code} - ${t.name}`)}
                          title="Eliminar Asiento Modelo"
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

      {/* MODAL DE CONTABILIZACIÓN EN LOTE (BOTÓN CONTABILIZAR) */}
      <BatchPostingModal
        isOpen={showBatchModal}
        onClose={() => {
          setShowBatchModal(false);
          loadData();
        }}
      />
    </div>
  );
}
