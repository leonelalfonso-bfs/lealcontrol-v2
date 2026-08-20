import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { ALL_SYSTEM_MODULES } from "./SuperAdminPlansPage";

export function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // New tenant form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [planCode, setPlanCode] = useState("pyme");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("admin123");
  const [monthlyPriceArs, setMonthlyPriceArs] = useState<number>(95000);
  const [selectedModules, setSelectedModules] = useState<string[]>([
    "sales", "crm", "purchases", "inventory", "finance", "fleet", "hr"
  ]);
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getSuperAdminDashboard(), api.listSuperAdminPlans()])
      .then(([dash, pList]) => {
        setData(dash);
        setPlans(pList);
      })
      .catch(() => {
        navigate("/superadmin/login");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handlePlanChange = (code: string) => {
    setPlanCode(code);
    const plan = plans.find((p) => p.code === code);
    if (plan) {
      setMonthlyPriceArs(plan.priceArs);
      try {
        const mods = typeof plan.enabledModulesJson === "string" ? JSON.parse(plan.enabledModulesJson) : plan.enabledModulesJson || [];
        if (Array.isArray(mods) && mods.length > 0) {
          setSelectedModules(mods);
        }
      } catch {
        // keep
      }
    }
  };

  const toggleModule = (id: string) => {
    if (selectedModules.includes(id)) {
      if (selectedModules.length === 1) return;
      setSelectedModules(selectedModules.filter((m) => m !== id));
    } else {
      setSelectedModules([...selectedModules, id]);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setModalError(null);
    try {
      await api.createSuperAdminTenant({
        name,
        slug,
        planCode,
        adminFullName,
        adminEmail,
        adminPassword,
        monthlyPriceArs: Number(monthlyPriceArs) || 0,
        monthlyPriceUsd: 0,
        enabledModulesJson: JSON.stringify(selectedModules)
      });
      setShowModal(false);
      setName("");
      setSlug("");
      setAdminEmail("");
      load();
    } catch (err: any) {
      setModalError(err.message || "Error al aprovisionar la empresa.");
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadBackup = (id: string, slug: string) => {
    window.open(`/api/v1/superadmin/tenants/${id}/backup`, "_blank");
  };

  const handleToggleStatus = async (tenant: any) => {
    const nextStatus = tenant.status === "Active" ? "Suspended" : "Active";
    if (!window.confirm(`¿Seguro de cambiar el estado de ${tenant.name} a ${nextStatus}?`)) return;
    try {
      await api.updateSuperAdminTenantStatus(tenant.id, { status: nextStatus });
      load();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#090d16", color: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Top Header */}
      <header style={{ borderBottom: "1px solid #1e293b", background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(12px)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "linear-gradient(135deg, #eab308, #ca8a04)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", color: "#000", fontSize: "20px" }}>
            ⚡
          </div>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: "800", margin: 0, letterSpacing: "-0.5px" }}>LEAL SuperAdmin</h2>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Plataforma Central SaaS & Multi-Bases</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Link to="/superadmin/tenants" style={{ color: "#cbd5e1", textDecoration: "none", fontSize: "14px", fontWeight: "600", padding: "8px 14px", borderRadius: "8px", border: "1px solid #334155" }}>
            🏢 Clientes & Bases
          </Link>
          <Link to="/superadmin/planes" style={{ color: "#cbd5e1", textDecoration: "none", fontSize: "14px", fontWeight: "600", padding: "8px 14px", borderRadius: "8px", border: "1px solid #334155" }}>
            💎 Planes & Tarifas
          </Link>
          <button
            onClick={() => { localStorage.removeItem("leal_superadmin_token"); navigate("/superadmin/login"); }}
            style={{ background: "#1e293b", border: "1px solid #334155", color: "#f87171", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}
          >
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "32px 24px" }}>
        {/* Title Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "800", margin: "0 0 6px", color: "#f8fafc" }}>Panel de Control SaaS</h1>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: "15px" }}>Monitoreo de bases físicas aisladas, facturación recurrente (MRR) y métricas de tenants.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{ background: "linear-gradient(135deg, #eab308, #ca8a04)", border: "none", color: "#000", fontWeight: "800", padding: "12px 22px", borderRadius: "10px", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 20px rgba(234, 179, 8, 0.3)" }}
          >
            ➕ Aprovisionar Nueva Empresa & BD
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>Cargando métricas de la plataforma...</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px", marginBottom: "32px" }}>
              <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#94a3b8", marginBottom: "6px" }}>Empresas Activas</div>
                <div style={{ fontSize: "32px", fontWeight: "800", color: "#22c55e" }}>{data?.activeTenants || 0}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>De un total de {data?.totalTenants || 0} bases</div>
              </div>

              <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#94a3b8", marginBottom: "6px" }}>MRR Estimado (ARS)</div>
                <div style={{ fontSize: "32px", fontWeight: "800", color: "#38bdf8" }}>$ {(data?.mrrArs || 0).toLocaleString("es-AR")}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Ingresos mensuales recurrentes</div>
              </div>

              <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#94a3b8", marginBottom: "6px" }}>Almacenamiento Total</div>
                <div style={{ fontSize: "32px", fontWeight: "800", color: "#a855f7" }}>{data?.totalStorageMb || 0} MB</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Bases PostgreSQL físicas</div>
              </div>

              <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px" }}>
                <div style={{ fontSize: "13px", fontWeight: "600", color: "#94a3b8", marginBottom: "6px" }}>Bases Suspendidas</div>
                <div style={{ fontSize: "32px", fontWeight: "800", color: data?.suspendedTenants > 0 ? "#f87171" : "#94a3b8" }}>{data?.suspendedTenants || 0}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Por falta de pago / vencidas</div>
              </div>
            </div>

            {/* Recent Tenants Table */}
            <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: "700", margin: 0, color: "#f8fafc" }}>Últimas Empresas Aprovisionadas</h3>
                <Link to="/superadmin/tenants" style={{ color: "#38bdf8", textDecoration: "none", fontSize: "13px", fontWeight: "600" }}>Ver todas las empresas →</Link>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#94a3b8" }}>
                    <th style={{ padding: "12px 16px" }}>Empresa</th>
                    <th style={{ padding: "12px 16px" }}>Base PostgreSQL</th>
                    <th style={{ padding: "12px 16px" }}>Plan</th>
                    <th style={{ padding: "12px 16px" }}>Admin</th>
                    <th style={{ padding: "12px 16px" }}>Abono</th>
                    <th style={{ padding: "12px 16px" }}>Estado</th>
                    <th style={{ padding: "12px 16px", textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recentTenants?.map((t: any) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid rgba(30, 41, 59, 0.5)" }}>
                      <td style={{ padding: "16px", fontWeight: "600", color: "#f8fafc" }}>
                        {t.name}
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Slug: {t.slug}</div>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <code style={{ background: "#0b1120", padding: "4px 8px", borderRadius: "6px", color: "#a855f7", fontSize: "12px", fontWeight: "700" }}>{t.dbName}</code>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <span style={{ textTransform: "uppercase", fontWeight: "700", color: "#eab308", fontSize: "12px" }}>{t.planCode}</span>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div>{t.adminFullName}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{t.adminEmail}</div>
                      </td>
                      <td style={{ padding: "16px", fontWeight: "700", color: "#38bdf8" }}>
                        $ {(t.monthlyPriceArs || 0).toLocaleString("es-AR")}
                      </td>
                      <td style={{ padding: "16px" }}>
                        <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "700", background: t.status === "Active" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)", color: t.status === "Active" ? "#4ade80" : "#f87171" }}>
                          {t.status === "Active" ? "🟢 Activo" : "🔴 Suspendido"}
                        </span>
                      </td>
                      <td style={{ padding: "16px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => handleDownloadBackup(t.id, t.slug)}
                            title="Descargar Dump SQL"
                            style={{ background: "#0b1120", border: "1px solid #334155", color: "#38bdf8", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}
                          >
                            📥 Backup
                          </button>
                          <button
                            onClick={() => handleToggleStatus(t)}
                            style={{ background: "#0b1120", border: "1px solid #334155", color: t.status === "Active" ? "#f87171" : "#4ade80", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}
                          >
                            {t.status === "Active" ? "Suspender" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Modal Aprovisionar Empresa */}
      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px" }}>
          <div style={{ background: "#131c2e", border: "1px solid #334155", borderRadius: "16px", padding: "28px", maxWidth: "680px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#f8fafc", margin: 0 }}>➕ Aprovisionar Nueva Empresa & BD</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}>✕</button>
            </div>

            {modalError && (
              <div style={{ padding: "12px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", color: "#f87171", fontSize: "14px", marginBottom: "16px" }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleCreateTenant} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>Nombre de la Empresa / Razón Social *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                  }}
                  placeholder="Ej: Agropecuaria El Ombú S.A."
                  style={{ width: "100%", padding: "10px 12px", background: "#0b1120", border: "1px solid #334155", borderRadius: "8px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>Identificador / Slug DB *</label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="el-ombu"
                  style={{ width: "100%", padding: "10px 12px", background: "#0b1120", border: "1px solid #334155", borderRadius: "8px", color: "#a855f7", fontWeight: "600", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>Plantilla de Plan</label>
                <select
                  value={planCode}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", background: "#0b1120", border: "1px solid #334155", borderRadius: "8px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.name} (${p.priceArs.toLocaleString("es-AR")}/mes)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>Nombre del Administrador *</label>
                <input
                  type="text"
                  required
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  placeholder="Ing. Carlos Pérez"
                  style={{ width: "100%", padding: "10px 12px", background: "#0b1120", border: "1px solid #334155", borderRadius: "8px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>Email del Administrador *</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@elombu.com"
                  style={{ width: "100%", padding: "10px 12px", background: "#0b1120", border: "1px solid #334155", borderRadius: "8px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>Contraseña Inicial *</label>
                <input
                  type="text"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", background: "#0b1120", border: "1px solid #334155", borderRadius: "8px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>Cuota Mensual (ARS)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={monthlyPriceArs}
                  onChange={(e) => setMonthlyPriceArs(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", background: "#0b1120", border: "1px solid #334155", borderRadius: "8px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Modular Checkboxes */}
              <div style={{ gridColumn: "1 / -1", marginTop: "8px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#cbd5e1", marginBottom: "8px" }}>
                  Módulos Habilitados para esta Empresa ({selectedModules.length} activos):
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {ALL_SYSTEM_MODULES.map((m) => {
                    const isChecked = selectedModules.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        onClick={() => toggleModule(m.id)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          background: isChecked ? "rgba(37, 99, 235, 0.2)" : "#0b1120",
                          border: isChecked ? "1px solid #3b82f6" : "1px solid #334155",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px"
                        }}
                      >
                        <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ cursor: "pointer" }} />
                        <span style={{ fontSize: "12px", fontWeight: "700", color: isChecked ? "#fff" : "#94a3b8" }}>
                          {m.icon} {m.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ background: "#0b1120", border: "1px solid #334155", color: "#cbd5e1", padding: "10px 18px", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{ background: "linear-gradient(135deg, #eab308, #ca8a04)", border: "none", color: "#000", padding: "10px 22px", borderRadius: "8px", cursor: "pointer", fontWeight: "700", opacity: creating ? 0.7 : 1 }}
                >
                  {creating ? "Creando BD PostgreSQL..." : "Aprovisionar Empresa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
