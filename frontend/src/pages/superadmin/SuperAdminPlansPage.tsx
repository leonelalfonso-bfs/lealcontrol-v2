import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export function SuperAdminPlansPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        </div>
      </header>

      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "26px", fontWeight: "800", margin: "0 0 6px", color: "#f8fafc" }}>💎 Planes & Tarifas de Licenciamiento</h1>
          <p style={{ color: "#94a3b8", margin: 0, fontSize: "15px" }}>Configuración de precios mensuales, límites de usuarios y módulos incluidos para clientes.</p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Cargando planes...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
            {plans.map((p) => {
              let features: string[] = [];
              try {
                features = typeof p.featuresJson === "string" ? JSON.parse(p.featuresJson) : p.featuresJson || [];
              } catch {
                features = [];
              }

              return (
                <div key={p.id} style={{ background: "#131c2e", border: "1px solid #1e293b", borderRadius: "16px", padding: "28px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <span style={{ textTransform: "uppercase", fontSize: "12px", fontWeight: "800", color: "#eab308", background: "rgba(234, 179, 8, 0.1)", padding: "4px 10px", borderRadius: "20px" }}>
                        {p.code}
                      </span>
                      <span style={{ fontSize: "12px", color: "#22c55e", fontWeight: "700" }}>🟢 Activo</span>
                    </div>

                    <h3 style={{ fontSize: "22px", fontWeight: "800", color: "#f8fafc", margin: "0 0 8px" }}>{p.name}</h3>
                    <p style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 20px" }}>{p.description}</p>

                    <div style={{ marginBottom: "20px" }}>
                      <div style={{ fontSize: "32px", fontWeight: "900", color: "#38bdf8" }}>
                        $ {p.priceArs.toLocaleString("es-AR")}
                        <span style={{ fontSize: "14px", fontWeight: "400", color: "#94a3b8" }}> /mes</span>
                      </div>
                      <div style={{ fontSize: "14px", color: "#64748b" }}>Hasta {p.maxUsers} usuarios concurrentes</div>
                    </div>

                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: "16px" }}>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#cbd5e1", marginBottom: "10px" }}>Módulos Incluidos:</div>
                      <ul style={{ margin: 0, paddingLeft: "18px", color: "#94a3b8", fontSize: "13px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        {features.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
