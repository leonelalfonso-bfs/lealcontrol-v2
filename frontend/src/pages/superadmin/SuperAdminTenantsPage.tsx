import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { ALL_SYSTEM_MODULES } from "./SuperAdminPlansPage";

export function SuperAdminTenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Edit Modules Modal
  const [editTenant, setEditTenant] = useState<any | null>(null);
  const [tenantModules, setTenantModules] = useState<string[]>([]);
  const [savingModules, setSavingModules] = useState(false);

  // Payment Link Modal / Notification
  const [paymentInfo, setPaymentInfo] = useState<{ tenantName: string; paymentUrl: string; amount: number } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.listSuperAdminTenants(), api.listSuperAdminPlans()])
      .then(([tList, pList]) => {
        setTenants(tList);
        setPlans(pList);
      })
      .catch(() => navigate("/superadmin/login"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

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

  const openModulesModal = (tenant: any) => {
    setEditTenant(tenant);
    try {
      const mods = typeof tenant.enabledModulesJson === "string" ? JSON.parse(tenant.enabledModulesJson) : tenant.enabledModulesJson || [];
      setTenantModules(Array.isArray(mods) && mods.length > 0 ? mods : ["sales", "crm"]);
    } catch {
      setTenantModules(["sales", "crm"]);
    }
  };

  const toggleTenantModule = (id: string) => {
    if (tenantModules.includes(id)) {
      if (tenantModules.length === 1) return;
      setTenantModules(tenantModules.filter((m) => m !== id));
    } else {
      setTenantModules([...tenantModules, id]);
    }
  };

  const saveTenantModules = async () => {
    if (!editTenant) return;
    setSavingModules(true);
    try {
      await api.updateSuperAdminTenantModules(editTenant.id, {
        enabledModulesJson: JSON.stringify(tenantModules)
      });
      setEditTenant(null);
      load();
    } catch (err: any) {
      alert("Error al actualizar módulos: " + err.message);
    } finally {
      setSavingModules(false);
    }
  };

  const handleGeneratePaymentLink = async (tenant: any) => {
    try {
      const res = await api.generateSuperAdminPaymentLink(tenant.id);
      if (res.success && res.paymentUrl) {
        setPaymentInfo({
          tenantName: tenant.name,
          paymentUrl: res.paymentUrl,
          amount: res.amount
        });
      }
    } catch (err: any) {
      alert("Error al generar link de pago: " + err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("¡Link de MercadoPago copiado al portapapeles! Podés enviárselo al cliente por WhatsApp o Email.");
  };

  const filtered = tenants.filter((t) =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.slug?.toLowerCase().includes(search.toLowerCase()) ||
    t.dbName?.toLowerCase().includes(search.toLowerCase()) ||
    t.adminEmail?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: "100vh", background: "#090d16", color: "#f1f5f9", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ borderBottom: "1px solid #1e293b", background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(12px)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "linear-gradient(135deg, #eab308, #ca8a04)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", color: "#000", fontSize: "20px" }}>
            ⚡
          </div>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: "800", margin: 0 }}>LEAL SuperAdmin</h2>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Directorio de Empresas, Módulos & Cobranzas</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Link to="/superadmin" style={{ color: "#cbd5e1", textDecoration: "none", fontSize: "14px", fontWeight: "600", padding: "8px 14px", borderRadius: "8px", border: "1px solid #334155" }}>
            ← Volver al Dashboard
          </Link>
          <Link to="/superadmin/planes" style={{ color: "#cbd5e1", textDecoration: "none", fontSize: "14px", fontWeight: "600", padding: "8px 14px", borderRadius: "8px", border: "1px solid #334155" }}>
            💎 Planes & Tarifas
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 6px", color: "#f8fafc" }}>🏢 Empresas, Módulos & Pasarela MercadoPago</h1>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: "14px" }}>Gestión directa de bases aisladas, módulos activos y links de pago para suscripciones.</p>
          </div>
          <input
            type="text"
            placeholder="🔍 Buscar por nombre, slug, base o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "340px", padding: "10px 16px", background: "#131c2e", border: "1px solid #334155", borderRadius: "10px", color: "#fff", outline: "none", fontSize: "14px" }}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Cargando directorio...</div>
        ) : (
          <div style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e293b", color: "#94a3b8" }}>
                  <th style={{ padding: "12px 16px" }}>Empresa</th>
                  <th style={{ padding: "12px 16px" }}>Base PostgreSQL</th>
                  <th style={{ padding: "12px 16px" }}>Plan & Módulos</th>
                  <th style={{ padding: "12px 16px" }}>Admin Contacto</th>
                  <th style={{ padding: "12px 16px" }}>Abono Mensual</th>
                  <th style={{ padding: "12px 16px" }}>Estado</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  let mods: string[] = [];
                  try {
                    mods = typeof t.enabledModulesJson === "string" ? JSON.parse(t.enabledModulesJson) : t.enabledModulesJson || [];
                  } catch {
                    mods = [];
                  }

                  return (
                    <tr key={t.id} style={{ borderBottom: "1px solid rgba(30, 41, 59, 0.5)" }}>
                      <td style={{ padding: "16px", fontWeight: "600", color: "#f8fafc" }}>
                        {t.name}
                        <div style={{ fontSize: "12px", color: "#64748b" }}>ID: {t.id}</div>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <code style={{ background: "#0b1120", padding: "4px 8px", borderRadius: "6px", color: "#a855f7", fontSize: "12px", fontWeight: "700" }}>{t.dbName}</code>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <span style={{ textTransform: "uppercase", fontWeight: "700", color: "#eab308", fontSize: "12px" }}>{t.planCode}</span>
                          <button
                            onClick={() => openModulesModal(t)}
                            style={{ background: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: "700" }}
                          >
                            ⚙️ {mods.length} Módulos
                          </button>
                        </div>
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
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <button
                            onClick={() => handleGeneratePaymentLink(t)}
                            title="Generar Link de Pago MercadoPago"
                            style={{ background: "#009ee3", border: "none", color: "#fff", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px" }}
                          >
                            💳 Cobrar MP
                          </button>
                          <button
                            onClick={() => handleDownloadBackup(t.id, t.slug)}
                            title="Descargar Dump SQL de esta empresa"
                            style={{ background: "#0b1120", border: "1px solid #334155", color: "#38bdf8", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
                          >
                            📥 Backup
                          </button>
                          <button
                            onClick={() => handleToggleStatus(t)}
                            style={{ background: "#0b1120", border: "1px solid #334155", color: t.status === "Active" ? "#f87171" : "#4ade80", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
                          >
                            {t.status === "Active" ? "Suspender" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Modificar Módulos de Tenant */}
        {editTenant && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px" }}>
            <div style={{ background: "#131c2e", border: "1px solid #334155", borderRadius: "16px", padding: "28px", maxWidth: "600px", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#f8fafc", margin: 0 }}>⚙️ Módulos de {editTenant.name}</h2>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>Base de datos: {editTenant.dbName}</span>
                </div>
                <button onClick={() => setEditTenant(null)} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}>✕</button>
              </div>

              <p style={{ fontSize: "13px", color: "#cbd5e1", marginBottom: "16px" }}>
                Seleccioná qué módulos tiene contratados esta empresa. Solo los módulos tildados aparecerán en el ERP de sus usuarios:
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "24px" }}>
                {ALL_SYSTEM_MODULES.map((m) => {
                  const isChecked = tenantModules.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => toggleTenantModule(m.id)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        background: isChecked ? "rgba(37, 99, 235, 0.2)" : "#090d16",
                        border: isChecked ? "1px solid #3b82f6" : "1px solid #334155",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                      }}
                    >
                      <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ cursor: "pointer" }} />
                      <span style={{ fontSize: "13px", fontWeight: "700", color: isChecked ? "#fff" : "#94a3b8" }}>
                        {m.icon} {m.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button onClick={() => setEditTenant(null)} style={{ background: "#334155", border: "none", color: "#cbd5e1", padding: "10px 18px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={saveTenantModules} disabled={savingModules} style={{ background: "#2563eb", border: "none", color: "#fff", padding: "10px 24px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}>
                  {savingModules ? "Guardando..." : "💾 Guardar Módulos"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Link de Pago MercadoPago */}
        {paymentInfo && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0, 0, 0, 0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px" }}>
            <div style={{ background: "#131c2e", border: "1px solid #334155", borderRadius: "16px", padding: "28px", maxWidth: "560px", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#009ee3", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "900" }}>
                    💳
                  </div>
                  <div>
                    <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#f8fafc", margin: 0 }}>Link de Pago MercadoPago</h2>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>{paymentInfo.tenantName}</span>
                  </div>
                </div>
                <button onClick={() => setPaymentInfo(null)} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer" }}>✕</button>
              </div>

              <div style={{ background: "#090d16", border: "1px solid #334155", borderRadius: "10px", padding: "16px", marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Importe a Cobrar:</div>
                <div style={{ fontSize: "24px", fontWeight: "900", color: "#38bdf8", marginBottom: "12px" }}>
                  $ {paymentInfo.amount.toLocaleString("es-AR")} ARS
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>URL de Pago Checkout:</div>
                <input
                  type="text"
                  readOnly
                  value={paymentInfo.paymentUrl}
                  style={{ width: "100%", padding: "8px", background: "#131c2e", border: "1px solid #334155", borderRadius: "6px", color: "#38bdf8", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  onClick={() => setPaymentInfo(null)}
                  style={{ background: "#334155", border: "none", color: "#cbd5e1", padding: "10px 16px", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}
                >
                  Cerrar
                </button>
                <button
                  onClick={() => window.open(paymentInfo.paymentUrl, "_blank")}
                  style={{ background: "#1e293b", border: "1px solid #009ee3", color: "#009ee3", padding: "10px 16px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                >
                  🌐 Abrir Pasarela
                </button>
                <button
                  onClick={() => copyToClipboard(paymentInfo.paymentUrl)}
                  style={{ background: "#009ee3", border: "none", color: "#fff", padding: "10px 20px", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
                >
                  📋 Copiar Link
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
