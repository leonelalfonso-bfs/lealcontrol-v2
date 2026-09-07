import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export const ALL_SYSTEM_MODULES = [
  { id: "sales", name: "Facturación & Ventas", desc: "Facturación ARCA, presupuestos, remitos y precios", icon: "🧾" },
  { id: "crm", name: "CRM & Clientes", desc: "Clientes, leads, oportunidades Kanban y seguimiento", icon: "👥" },
  { id: "purchases", name: "Compras & Proveedores", desc: "Órdenes de compra y facturas proveedor", icon: "🛒" },
  { id: "inventory", name: "Stock & Producción", desc: "Inventario 4D, depósitos y producción", icon: "📦" },
  { id: "finance", name: "Finanzas & Echeqs", desc: "Bancos, cheques/echeqs, cobranzas y cashflow", icon: "💰" },
  { id: "fleet", name: "Flota & Vehículos", desc: "Control de móviles, combustible y mantenimientos", icon: "🚚" },
  { id: "hr", name: "RRHH & Sueldos", desc: "Legajos, asistencias y liquidación de haberes", icon: "👔" },
  { id: "grains", name: "Cereales & Agro", desc: "Contratos de granos, balanza CPE/CTG y fijaciones", icon: "🌾" },
  { id: "accounting", name: "Contabilidad & Balances", desc: "Plan de cuentas, asientos, libro diario y balances", icon: "📚" },
  { id: "metrology", name: "Metrología Legal", desc: "Laboratorio de ensayos, pesas patrón e informes técnicos", icon: "⚖️" },
  { id: "quality", name: "Calidad ISO 17025", desc: "Sistema de gestión de calidad, documentos SGC y registros", icon: "✅" }
];

export function SuperAdminPlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceArs, setPriceArs] = useState(95000);
  const [priceUsd, setPriceUsd] = useState(95);
  const [maxUsers, setMaxUsers] = useState(10);
  const [selectedModules, setSelectedModules] = useState<string[]>([
    "sales", "crm", "purchases", "inventory", "finance", "fleet", "hr", "grains"
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.listSuperAdminPlans()
      .then(setPlans)
      .catch(() => navigate("/superadmin/login"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openNewPlan = () => {
    setIsEditing(false);
    setEditingId(null);
    setCode("");
    setName("");
    setDescription("");
    setPriceArs(95000);
    setPriceUsd(95);
    setMaxUsers(10);
    setSelectedModules(["sales", "crm"]);
    setError(null);
    setShowModal(true);
  };

  const openEditPlan = (p: any) => {
    setIsEditing(true);
    setEditingId(p.id);
    setCode(p.code);
    setName(p.name);
    setDescription(p.description || "");
    setPriceArs(p.priceArs);
    setPriceUsd(p.priceUsd);
    setMaxUsers(p.maxUsers || 10);
    try {
      const mods = typeof p.enabledModulesJson === "string" ? JSON.parse(p.enabledModulesJson) : p.enabledModulesJson || [];
      setSelectedModules(Array.isArray(mods) && mods.length > 0 ? mods : ["sales", "crm"]);
    } catch {
      setSelectedModules(["sales", "crm"]);
    }
    setError(null);
    setShowModal(true);
  };

  const toggleModule = (id: string) => {
    if (selectedModules.includes(id)) {
      if (selectedModules.length === 1) return; // al menos 1 modulo
      setSelectedModules(selectedModules.filter((m) => m !== id));
    } else {
      setSelectedModules([...selectedModules, id]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre del plan es obligatorio.");
      return;
    }
    if (!isEditing && !code.trim()) {
      setError("El código identificador del plan es obligatorio.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const enabledModulesJson = JSON.stringify(selectedModules);
      const featuresJson = JSON.stringify(
        selectedModules.map((m) => {
          const mod = ALL_SYSTEM_MODULES.find((s) => s.id === m);
          return mod ? mod.name : m;
        })
      );

      if (isEditing && editingId) {
        await api.updateSuperAdminPlan(editingId, {
          name: name.trim(),
          priceArs,
          priceUsd,
          maxUsers,
          description: description.trim(),
          featuresJson,
          enabledModulesJson
        });
      } else {
        await api.createSuperAdminPlan({
          code: code.trim().toLowerCase(),
          name: name.trim(),
          priceArs,
          priceUsd,
          maxUsers,
          description: description.trim(),
          featuresJson,
          enabledModulesJson
        });
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setError(err?.message || "Error al guardar el plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#090d16", color: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ borderBottom: "1px solid #1e293b", background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(12px)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "linear-gradient(135deg, #eab308, #ca8a04)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", color: "#000", fontSize: "20px" }}>
            ⚡
          </div>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: "800", margin: 0 }}>LEAL SuperAdmin</h2>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Planes Comerciales & Suscripciones SaaS</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Link to="/superadmin" style={{ color: "#cbd5e1", textDecoration: "none", fontSize: "14px", fontWeight: "600", padding: "8px 14px", borderRadius: "8px", border: "1px solid #334155" }}>
            ← Volver al Dashboard
          </Link>
          <Link to="/superadmin/tenants" style={{ color: "#cbd5e1", textDecoration: "none", fontSize: "14px", fontWeight: "600", padding: "8px 14px", borderRadius: "8px", border: "1px solid #334155" }}>
            🏢 Clientes & Bases
          </Link>
          <button
            onClick={openNewPlan}
            style={{ background: "#2563eb", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontWeight: "700", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
          >
            ➕ Crear Plan a Medida
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 6px", color: "#f8fafc" }}>💎 Planes & Tarifas de Licenciamiento</h1>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: "15px" }}>Configuración de precios mensuales, límites de usuarios y selección de módulos habilitados.</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Cargando planes...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
            {plans.map((p) => {
              let planMods: string[] = [];
              try {
                planMods = typeof p.enabledModulesJson === "string" ? JSON.parse(p.enabledModulesJson) : p.enabledModulesJson || [];
              } catch {
                planMods = [];
              }

              return (
                <div key={p.id} style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "16px", padding: "28px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <span style={{ textTransform: "uppercase", fontSize: "12px", fontWeight: "800", color: "#eab308", background: "rgba(234, 179, 8, 0.1)", padding: "4px 10px", borderRadius: "20px" }}>
                        {p.code}
                      </span>
                      <button
                        onClick={() => openEditPlan(p)}
                        style={{ background: "#1e293b", border: "1px solid #334155", color: "#38bdf8", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
                      >
                        ✏️ Modificar Módulos / Precio
                      </button>
                    </div>

                    <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#f8fafc", margin: "0 0 8px" }}>{p.name}</h3>
                    <p style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 20px" }}>{p.description}</p>

                    <div style={{ marginBottom: "20px" }}>
                      <div style={{ fontSize: "30px", fontWeight: "900", color: "#38bdf8" }}>
                        $ {p.priceArs.toLocaleString("es-AR")}
                        <span style={{ fontSize: "14px", fontWeight: "400", color: "#94a3b8" }}> /mes ARS</span>
                      </div>
                      <div style={{ fontSize: "14px", color: "#64748b" }}>U$S {p.priceUsd} • Hasta {p.maxUsers} usuarios</div>
                    </div>

                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: "16px" }}>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#cbd5e1", marginBottom: "10px" }}>
                        Módulos Habilitados ({planMods.length}/{ALL_SYSTEM_MODULES.length}):
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {ALL_SYSTEM_MODULES.map((m) => {
                          const isIncluded = planMods.includes(m.id);
                          return (
                            <span
                              key={m.id}
                              style={{
                                fontSize: "12px",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                background: isIncluded ? "rgba(34, 197, 94, 0.15)" : "rgba(100, 116, 139, 0.1)",
                                border: isIncluded ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(100, 116, 139, 0.2)",
                                color: isIncluded ? "#4ade80" : "#64748b",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <span>{m.icon}</span> {m.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Creación / Edición de Plan */}
        {showModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px" }}>
            <div style={{ background: "#131c2e", border: "1px solid #334155", borderRadius: "16px", padding: "28px", maxWidth: "680px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#f8fafc", margin: 0 }}>
                  {isEditing ? `✏️ Editar Plan: ${name}` : "➕ Crear Nuevo Plan Personalizado"}
                </h2>
                <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}>✕</button>
              </div>

              {error && (
                <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", color: "#f87171", fontSize: "14px", marginBottom: "16px" }}>
                  ⚠️ {error}
                </div>
              )}

              <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>Código Identificador:</label>
                    <input
                      type="text"
                      disabled={isEditing}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="ej: agro-premium, pyme-express"
                      style={{ width: "100%", padding: "10px", background: "#090d16", border: "1px solid #334155", borderRadius: "8px", color: "#fff", boxSizing: "border-box" }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>Nombre Comercial:</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ej: Plan Acopio Plus"
                      style={{ width: "100%", padding: "10px", background: "#090d16", border: "1px solid #334155", borderRadius: "8px", color: "#fff", boxSizing: "border-box" }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>Descripción Comercial:</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="ej: Para acopios y cooperativas con hasta 15 operadores"
                    style={{ width: "100%", padding: "10px", background: "#090d16", border: "1px solid #334155", borderRadius: "8px", color: "#fff", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>Precio Mensual ARS ($):</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={priceArs}
                      onChange={(e) => setPriceArs(parseFloat(e.target.value) || 0)}
                      style={{ width: "100%", padding: "10px", background: "#090d16", border: "1px solid #334155", borderRadius: "8px", color: "#fff", boxSizing: "border-box" }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>Precio USD (U$S):</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={priceUsd}
                      onChange={(e) => setPriceUsd(parseFloat(e.target.value) || 0)}
                      style={{ width: "100%", padding: "10px", background: "#090d16", border: "1px solid #334155", borderRadius: "8px", color: "#fff", boxSizing: "border-box" }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "6px" }}>Máximo de Usuarios:</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={maxUsers}
                      onChange={(e) => setMaxUsers(parseInt(e.target.value, 10) || 1)}
                      style={{ width: "100%", padding: "10px", background: "#090d16", border: "1px solid #334155", borderRadius: "8px", color: "#fff", boxSizing: "border-box" }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "700", color: "#cbd5e1", marginBottom: "8px" }}>
                    Selección Modular de Funcionalidades ({selectedModules.length} seleccionados):
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    {ALL_SYSTEM_MODULES.map((m) => {
                      const isChecked = selectedModules.includes(m.id);
                      return (
                        <div
                          key={m.id}
                          onClick={() => toggleModule(m.id)}
                          style={{
                            padding: "12px",
                            borderRadius: "8px",
                            background: isChecked ? "rgba(37, 99, 235, 0.15)" : "#090d16",
                            border: isChecked ? "1px solid #3b82f6" : "1px solid #334155",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            transition: "all 0.15s"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            style={{ marginTop: "3px", cursor: "pointer" }}
                          />
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: "700", color: isChecked ? "#fff" : "#cbd5e1" }}>
                              {m.icon} {m.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>{m.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{ background: "#334155", border: "none", color: "#cbd5e1", padding: "10px 18px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{ background: "#2563eb", border: "none", color: "#fff", padding: "10px 24px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                  >
                    {saving ? "Guardando..." : "💾 Guardar Plan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
