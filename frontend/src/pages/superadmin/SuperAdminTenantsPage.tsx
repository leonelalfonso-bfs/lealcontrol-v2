import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export function SuperAdminTenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.listSuperAdminTenants()
      .then(setTenants)
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
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Directorio de Empresas & Bases de Datos</span>
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
            <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 6px", color: "#f8fafc" }}>🏢 Empresas & Bases Físicas</h1>
            <p style={{ color: "#94a3b8", margin: 0, fontSize: "14px" }}>Gestión directa de bases de datos PostgreSQL aisladas, cuotas mensuales y respaldos.</p>
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
                  <th style={{ padding: "12px 16px" }}>Plan</th>
                  <th style={{ padding: "12px 16px" }}>Almacenamiento</th>
                  <th style={{ padding: "12px 16px" }}>Admin Contacto</th>
                  <th style={{ padding: "12px 16px" }}>Cuota ARS</th>
                  <th style={{ padding: "12px 16px" }}>Estado</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid rgba(30, 41, 59, 0.5)" }}>
                    <td style={{ padding: "16px", fontWeight: "600", color: "#f8fafc" }}>
                      {t.name}
                      <div style={{ fontSize: "12px", color: "#64748b" }}>ID: {t.id}</div>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <code style={{ background: "#0b1120", padding: "4px 8px", borderRadius: "6px", color: "#a855f7", fontSize: "12px", fontWeight: "700" }}>{t.dbName}</code>
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span style={{ textTransform: "uppercase", fontWeight: "700", color: "#eab308", fontSize: "12px" }}>{t.planCode}</span>
                    </td>
                    <td style={{ padding: "16px", color: "#cbd5e1" }}>
                      {t.storageMb} MB
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
        )}
      </main>
    </div>
  );
}
