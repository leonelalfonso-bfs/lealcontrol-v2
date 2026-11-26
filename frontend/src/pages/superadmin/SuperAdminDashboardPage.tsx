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
  const [adminPassword, setAdminPassword] = useState("");
  const [monthlyPriceArs, setMonthlyPriceArs] = useState<number>(95000);
  const [selectedModules, setSelectedModules] = useState<string[]>([
    "sales", "purchases", "inventory", "finance", "fleet", "hr"
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
          const selectable = new Set(ALL_SYSTEM_MODULES.map((m) => m.id));
          setSelectedModules(mods.filter((m: string) => selectable.has(m)));
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
    <div style={{ minHeight: "100vh", background: "#090d16", color: "var(--lc-surface-2)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Top Header */}
      <header style={{ borderBottom: "1px solid var(--lc-ink)", background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(12px)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "linear-gradient(135deg, var(--lc-warn), var(--lc-warn))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", color: "#000", fontSize: "20px" }}>
            ⚡
          </div>
          <div>
            <h2 style={{ margin: 0, letterSpacing: "-0.5px" }}>LEAL SuperAdmin</h2>
            <span className="t-small muted">Plataforma Central SaaS & Multi-Bases</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Link className="t-strong" to="/superadmin/demos" style={{ color: "var(--lc-line-2)", textDecoration: "none", padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--lc-ink-2)" }}>
            📩 Solicitudes Demo
          </Link>
          <Link className="t-strong" to="/superadmin/tenants" style={{ color: "var(--lc-line-2)", textDecoration: "none", padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--lc-ink-2)" }}>
            🏢 Clientes & Bases
          </Link>
          <Link className="t-strong" to="/superadmin/planes" style={{ color: "var(--lc-line-2)", textDecoration: "none", padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--lc-ink-2)" }}>
            💎 Planes & Tarifas
          </Link>
          <Link className="t-strong" to="/superadmin/configuracion" style={{ color: "var(--lc-line-2)", textDecoration: "none", padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--lc-ink-2)" }}>
            ⚙️ Configuración
          </Link>
          <button className="t-danger t-small t-strong"
            onClick={() => { localStorage.removeItem("leal_superadmin_token"); navigate("/superadmin/login"); }}
            style={{ background: "var(--lc-ink)", border: "1px solid var(--lc-ink-2)", padding: "8px 14px", borderRadius: "8px", cursor: "pointer" }}
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
            <h1 style={{ margin: "0 0 6px" }}>Panel de Control SaaS</h1>
            <p className="muted" style={{ margin: 0 }}>Monitoreo de bases físicas aisladas, facturación recurrente (MRR) y métricas de tenants.</p>
          </div>
          <button className="t-strong"
            onClick={() => setShowModal(true)}
            style={{ background: "linear-gradient(135deg, var(--lc-warn), var(--lc-warn))", border: "none", color: "#000", padding: "12px 22px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 20px rgba(234, 179, 8, 0.3)" }}
          >
            ➕ Aprovisionar Nueva Empresa & BD
          </button>
        </div>

        {loading ? (
          <div className="t-center muted" style={{ padding: "80px 0" }}>Cargando métricas de la plataforma...</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px", marginBottom: "32px" }}>
              <div style={{ background: "#131c2e", border: "1px solid var(--lc-ink)", borderRadius: "14px", padding: "20px" }}>
                <div className="t-small t-strong muted" style={{ marginBottom: "6px" }}>Empresas Activas</div>
                <div className="t-strong t-ok" style={{ fontSize: "32px" }}>{data?.activeTenants || 0}</div>
                <div className="t-small muted" style={{ marginTop: "4px" }}>De un total de {data?.totalTenants || 0} bases</div>
              </div>

              <div style={{ background: "#131c2e", border: "1px solid var(--lc-ink)", borderRadius: "14px", padding: "20px" }}>
                <div className="t-small t-strong muted" style={{ marginBottom: "6px" }}>MRR Estimado (ARS)</div>
                <div className="t-strong t-info" style={{ fontSize: "32px" }}>$ {(data?.mrrArs || 0).toLocaleString("es-AR")}</div>
                <div className="t-small muted" style={{ marginTop: "4px" }}>Ingresos mensuales recurrentes</div>
              </div>

              <div style={{ background: "#131c2e", border: "1px solid var(--lc-ink)", borderRadius: "14px", padding: "20px" }}>
                <div className="t-small t-strong muted" style={{ marginBottom: "6px" }}>Almacenamiento Total</div>
                <div className="t-strong" style={{ fontSize: "32px", color: "#a855f7" }}>{data?.totalStorageMb || 0} MB</div>
                <div className="t-small muted" style={{ marginTop: "4px" }}>Bases PostgreSQL físicas</div>
              </div>

              <div style={{ background: "#131c2e", border: "1px solid var(--lc-ink)", borderRadius: "14px", padding: "20px" }}>
                <div className="t-small t-strong muted" style={{ marginBottom: "6px" }}>Bases Suspendidas</div>
                <div className="t-strong" style={{ fontSize: "32px", color: data?.suspendedTenants > 0 ? "var(--lc-danger)" : "var(--lc-ink-3)" }}>{data?.suspendedTenants || 0}</div>
                <div className="t-small muted" style={{ marginTop: "4px" }}>Por falta de pago / vencidas</div>
              </div>
            </div>

            {/* Recent Tenants Table */}
            <div style={{ background: "#131c2e", border: "1px solid var(--lc-ink)", borderRadius: "14px", padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                <h3 style={{ margin: 0 }}>Últimas Empresas Aprovisionadas</h3>
                <Link className="t-info t-small t-strong" to="/superadmin/tenants" style={{ textDecoration: "none" }}>Ver todas las empresas →</Link>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Base PostgreSQL</th>
                    <th>Plan</th>
                    <th>Admin</th>
                    <th>Abono</th>
                    <th>Estado</th>
                    <th className="t-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.recentTenants?.map((t: any) => (
                    <tr key={t.id}>
                      <td className="t-strong" style={{ color: "var(--lc-surface-2)" }}>
                        {t.name}
                        <div className="t-small muted">Slug: {t.slug}</div>
                      </td>
                      <td>
                        <code className="t-small t-strong" style={{ background: "#0b1120", padding: "4px 8px", borderRadius: "6px", color: "#a855f7" }}>{t.dbName}</code>
                      </td>
                      <td>
                        <span className="t-caps t-strong t-warn t-small">{t.planCode}</span>
                      </td>
                      <td>
                        <div>{t.adminFullName}</div>
                        <div className="t-small muted">{t.adminEmail}</div>
                      </td>
                      <td className="t-strong t-info">
                        $ {(t.monthlyPriceArs || 0).toLocaleString("es-AR")}
                      </td>
                      <td>
                        <span className="t-small t-strong" style={{ display: "inline-block", padding: "4px 10px", borderRadius: "20px", background: t.status === "Active" ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)", color: t.status === "Active" ? "#4ade80" : "#f87171" }}>
                          {t.status === "Active" ? "🟢 Activo" : "🔴 Suspendido"}
                        </span>
                      </td>
                      <td className="t-right">
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                          <button className="t-info t-small t-strong"
                            onClick={() => handleDownloadBackup(t.id, t.slug)}
                            title="Descargar Dump SQL"
                            style={{ background: "#0b1120", border: "1px solid var(--lc-ink-2)", padding: "6px 12px", borderRadius: "6px", cursor: "pointer" }}
                          >
                            📥 Backup
                          </button>
                          <button className="t-small t-strong"
                            onClick={() => handleToggleStatus(t)}
                            style={{ background: "#0b1120", border: "1px solid var(--lc-ink-2)", color: t.status === "Active" ? "#f87171" : "#4ade80", padding: "6px 12px", borderRadius: "6px", cursor: "pointer" }}
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
        <div className="modal-backdrop">
          <div style={{ background: "#131c2e", border: "1px solid var(--lc-ink-2)", borderRadius: "16px", padding: "28px", maxWidth: "680px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0 }}>➕ Aprovisionar Nueva Empresa & BD</h2>
              <button className="muted" onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", fontSize: "20px", cursor: "pointer" }}>✕</button>
            </div>

            {modalError && (
              <div className="alert" style={{ marginBottom: "16px" }}>
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleCreateTenant} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label>Nombre de la Empresa / Razón Social *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                  }}
                  placeholder="Ej: Agropecuaria El Ombú S.A."
                  style={{ width: "100%", color: "#fff" }}
                />
              </div>

              <div>
                <label>Identificador / Slug DB *</label>
                <input className="t-strong"
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="el-ombu"
                  style={{ width: "100%", color: "#a855f7" }}
                />
              </div>

              <div>
                <label>Plantilla de Plan</label>
                <select
                  value={planCode}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  style={{ width: "100%", color: "#fff" }}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.name} (${p.priceArs.toLocaleString("es-AR")}/mes)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Nombre del Administrador *</label>
                <input
                  type="text"
                  required
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  placeholder="Ing. Carlos Pérez"
                  style={{ width: "100%", color: "#fff" }}
                />
              </div>

              <div>
                <label>Email del Administrador *</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@elombu.com"
                  style={{ width: "100%", color: "#fff" }}
                />
              </div>

              <div>
                <label>Contraseña Inicial *</label>
                <input
                  type="text"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  style={{ width: "100%", color: "#fff" }}
                />
              </div>

              <div>
                <label>Cuota Mensual (ARS)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={monthlyPriceArs}
                  onChange={(e) => setMonthlyPriceArs(Number(e.target.value))}
                  style={{ width: "100%", color: "#fff" }}
                />
              </div>

              {/* Modular Checkboxes */}
              <div style={{ gridColumn: "1 / -1", marginTop: "8px" }}>
                <label>
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
                        <span className="t-small t-strong" style={{ color: isChecked ? "#fff" : "var(--lc-ink-3)" }}>
                          {m.icon} {m.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "12px" }}>
                <button className="t-strong"
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ background: "#0b1120", border: "1px solid var(--lc-ink-2)", color: "var(--lc-line-2)", padding: "10px 18px", borderRadius: "8px", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button className="t-strong"
                  type="submit"
                  disabled={creating}
                  style={{ background: "linear-gradient(135deg, var(--lc-warn), var(--lc-warn))", border: "none", color: "#000", padding: "10px 22px", borderRadius: "8px", cursor: "pointer", opacity: creating ? 0.7 : 1 }}
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
