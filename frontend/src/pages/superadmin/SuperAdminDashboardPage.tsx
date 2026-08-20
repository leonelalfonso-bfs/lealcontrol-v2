import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export function SuperAdminDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
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
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getSuperAdminDashboard()
      .then(setData)
      .catch(() => {
        navigate("/superadmin/login");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

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
        monthlyPriceUsd: 0
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
            style={{ background: "transparent", border: "1px solid #dc2626", color: "#f87171", padding: "8px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}
          >
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "800", margin: "0 0 6px", color: "#f8fafc" }}>Panel de Control Maestro</h1>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: "15px" }}>Monitoreo en vivo de clientes, bases de datos PostgreSQL aisladas y facturación SaaS recurrente.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{ background: "linear-gradient(135deg, #eab308, #ca8a04)", border: "none", color: "#000", fontWeight: "700", padding: "12px 20px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", boxShadow: "0 10px 15px -3px rgba(234, 179, 8, 0.3)" }}
          >
            ➕ Aprovisionar Nueva Empresa & BD
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Cargando métricas maestras...</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "32px" }}>
              <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px" }}>
                <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: "600", textTransform: "uppercase" }}>Total Empresas</span>
                <div style={{ fontSize: "32px", fontWeight: "800", color: "#f8fafc", marginTop: "8px" }}>{data?.totalTenants || 0}</div>
                <span style={{ fontSize: "12px", color: "#22c55e", fontWeight: "600" }}>🟢 {data?.activeTenants || 0} activas</span>
              </div>

              <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px" }}>
                <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: "600", textTransform: "uppercase" }}>MRR (Facturación Mensual)</span>
                <div style={{ fontSize: "32px", fontWeight: "800", color: "#38bdf8", marginTop: "8px" }}>$ {(data?.mrrArs || 0).toLocaleString("es-AR")}</div>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>Ingreso recurrente ARS</span>
              </div>

              <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px" }}>
                <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: "600", textTransform: "uppercase" }}>Bases PostgreSQL Aisladas</span>
                <div style={{ fontSize: "32px", fontWeight: "800", color: "#a855f7", marginTop: "8px" }}>{data?.totalTenants || 0}</div>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>100% físicas e independientes</span>
              </div>

              <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px" }}>
                <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: "600", textTransform: "uppercase" }}>Almacenamiento Total</span>
                <div style={{ fontSize: "32px", fontWeight: "800", color: "#eab308", marginTop: "8px" }}>{data?.totalStorageMb || 0} MB</div>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>Uso en disco en VPS</span>
              </div>
            </div>

            {/* Plans Distribution */}
            <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "24px", marginBottom: "32px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 16px", color: "#f8fafc" }}>Distribución por Plan de Suscripción</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                {data?.planBreakdown?.map((p: any) => (
                  <div key={p.code} style={{ background: "#0b1120", border: "1px solid #1e293b", borderRadius: "10px", padding: "16px" }}>
                    <div style={{ fontWeight: "700", color: "#eab308", fontSize: "15px", marginBottom: "4px" }}>{p.name}</div>
                    <div style={{ fontSize: "22px", fontWeight: "800", color: "#f8fafc" }}>{p.count} clientes</div>
                    <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px" }}>$ {p.revenueArs.toLocaleString("es-AR")} /mes</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Tenants Table */}
            <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: "700", margin: 0, color: "#f8fafc" }}>Últimas Empresas & Bases Registradas</h3>
                <Link to="/superadmin/tenants" style={{ color: "#38bdf8", textDecoration: "none", fontSize: "14px", fontWeight: "600" }}>Ver todas las empresas →</Link>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e293b", color: "#94a3b8" }}>
                      <th style={{ padding: "12px 16px" }}>Empresa / Razón Social</th>
                      <th style={{ padding: "12px 16px" }}>Base de Datos</th>
                      <th style={{ padding: "12px 16px" }}>Plan</th>
                      <th style={{ padding: "12px 16px" }}>Admin</th>
                      <th style={{ padding: "12px 16px" }}>Cuota Mensual</th>
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
                          <code style={{ background: "#0b1120", padding: "4px 8px", borderRadius: "6px", color: "#a855f7", fontSize: "12px" }}>{t.dbName}</code>
                        </td>
                        <td style={{ padding: "16px" }}>
                          <span style={{ textTransform: "capitalize", fontWeight: "600", color: "#eab308" }}>{t.planCode}</span>
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
                              title="Descargar Dump SQL de esta empresa"
                              style={{ background: "#0b1120", border: "1px solid #334155", color: "#38bdf8", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}
                            >
                              📥 Backup SQL
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
            </div>
          </>
        )}
      </main>

      {/* Modal Aprovisionar Nuevo Tenant */}
      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", zIndex: 1000 }}>
          <div style={{ background: "#131c2e", border: "1px solid #334155", borderRadius: "16px", padding: "32px", width: "100%", maxWidth: "600px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.8)" }}>
            <h2 style={{ fontSize: "22px", fontWeight: "800", margin: "0 0 8px", color: "#f8fafc" }}>➕ Aprovisionar Nueva Empresa</h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 20px" }}>El sistema creará la base de datos PostgreSQL física de forma automática y creará su usuario administrador.</p>

            {modalError && (
              <div style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5", padding: "12px", borderRadius: "8px", fontSize: "14px", marginBottom: "16px" }}>
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
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>Plan de Suscripción</label>
                <select
                  value={planCode}
                  onChange={(e) => {
                    setPlanCode(e.target.value);
                    if (e.target.value === "starter") setMonthlyPriceArs(45000);
                    else if (e.target.value === "pyme") setMonthlyPriceArs(95000);
                    else if (e.target.value === "agro") setMonthlyPriceArs(165000);
                    else if (e.target.value === "enterprise") setMonthlyPriceArs(280000);
                  }}
                  style={{ width: "100%", padding: "10px 12px", background: "#0b1120", border: "1px solid #334155", borderRadius: "8px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                >
                  <option value="starter">Starter Pyme ($45.000/mes)</option>
                  <option value="pyme">Pyme Profesional ($95.000/mes)</option>
                  <option value="agro">LEAL Agro Granario ($165.000/mes)</option>
                  <option value="enterprise">Enterprise ($280.000/mes)</option>
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
                  min="0"
                  step="1000"
                  value={monthlyPriceArs}
                  onChange={(e) => setMonthlyPriceArs(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", background: "#0b1120", border: "1px solid #334155", borderRadius: "8px", color: "#fff", outline: "none", boxSizing: "border-box" }}
                />
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
