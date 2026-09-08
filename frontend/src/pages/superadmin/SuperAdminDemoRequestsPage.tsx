import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { ALL_SYSTEM_MODULES } from "./SuperAdminPlansPage";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const STATUS_COLORS: Record<string, string> = {
  Pending: "#fbbf24",
  Contacted: "#60a5fa",
  Provisioned: "#34d399",
  Dismissed: "#94a3b8"
};

export function SuperAdminDemoRequestsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("Pending");

  const [selected, setSelected] = useState<any | null>(null);
  const [slug, setSlug] = useState("");
  const [planCode, setPlanCode] = useState("pyme");
  const [adminPassword, setAdminPassword] = useState("");
  const [monthlyPriceArs, setMonthlyPriceArs] = useState(95000);
  const [selectedModules, setSelectedModules] = useState<string[]>(["sales", "purchases", "finance"]);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.listSuperAdminDemoRequests(), api.listSuperAdminPlans()])
      .then(([list, pList]) => {
        setRequests(list);
        setPlans(pList);
      })
      .catch(() => navigate("/superadmin/login"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openProvision = (req: any) => {
    setSelected(req);
    setSlug(slugify(req.companyName || "empresa"));
    setPlanCode("pyme");
    setAdminPassword("");
    setProvisionResult(null);
    setError(null);
    try {
      const mods = typeof req.interestedModulesJson === "string" ? JSON.parse(req.interestedModulesJson) : [];
      if (Array.isArray(mods) && mods.length > 0) {
        setSelectedModules(mods);
      }
    } catch {
      // keep defaults
    }
    const plan = plans.find((p) => p.code === "pyme");
    if (plan) setMonthlyPriceArs(plan.priceArs);
  };

  const handlePlanChange = (code: string) => {
    setPlanCode(code);
    const plan = plans.find((p) => p.code === code);
    if (plan) {
      setMonthlyPriceArs(plan.priceArs);
      try {
        const mods = typeof plan.enabledModulesJson === "string" ? JSON.parse(plan.enabledModulesJson) : [];
        if (Array.isArray(mods) && mods.length > 0) {
          const selectable = new Set(ALL_SYSTEM_MODULES.map((m) => m.id));
          setSelectedModules(mods.filter((m: string) => selectable.has(m)));
        }
      } catch {
        // keep
      }
    }
  };

  const handleStatus = async (id: string, status: string) => {
    try {
      await api.updateSuperAdminDemoRequestStatus(id, status);
      load();
    } catch (e: any) {
      alert(e.message || "No se pudo actualizar el estado.");
    }
  };

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!adminPassword || adminPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setProvisioning(true);
    setError(null);
    try {
      const res = await api.provisionSuperAdminDemoRequest(selected.id, {
        adminPassword,
        slug,
        planCode,
        adminFullName: selected.contactFullName,
        enabledModulesJson: JSON.stringify(selectedModules),
        monthlyPriceArs: Number(monthlyPriceArs) || 0
      });
      setProvisionResult(
        `Empresa creada (${res.dbName}). El cliente entra en erp.lealcontrol.com con ${res.adminEmail || selected.email}`
      );
      load();
    } catch (err: any) {
      setError(err.message || "Error al aprovisionar.");
    } finally {
      setProvisioning(false);
    }
  };

  const filtered = requests.filter((r) => (filter === "all" ? true : r.status === filter));
  const pendingCount = requests.filter((r) => r.status === "Pending").length;

  return (
    <div style={{ minHeight: "100vh", background: "#090d16", color: "#f1f5f9", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ borderBottom: "1px solid #1e293b", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px" }}>Solicitudes de Demo</h2>
          <span style={{ color: "#94a3b8", fontSize: "13px" }}>{pendingCount} pendientes</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/superadmin" style={{ color: "#cbd5e1", textDecoration: "none", padding: "8px 14px", border: "1px solid #334155", borderRadius: "8px" }}>← Panel</Link>
          <Link to="/superadmin/tenants" style={{ color: "#cbd5e1", textDecoration: "none", padding: "8px 14px", border: "1px solid #334155", borderRadius: "8px" }}>Clientes</Link>
        </div>
      </header>

      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          {["Pending", "Contacted", "Provisioned", "Dismissed", "all"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: filter === s ? "1px solid #eab308" : "1px solid #334155",
                background: filter === s ? "rgba(234,179,8,0.15)" : "#1e293b",
                color: "#f8fafc",
                cursor: "pointer"
              }}
            >
              {s === "all" ? "Todas" : s}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#94a3b8" }}>Cargando solicitudes...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No hay solicitudes en este filtro.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filtered.map((req) => (
              <div key={req.id} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ fontSize: "16px" }}>{req.companyName}</strong>
                    <span style={{ marginLeft: "10px", fontSize: "12px", color: STATUS_COLORS[req.status] || "#94a3b8" }}>{req.status}</span>
                    <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "6px" }}>
                      {req.contactFullName} · {req.email} · {req.phone}
                      {req.cuit ? ` · CUIT ${req.cuit}` : ""}
                    </div>
                    <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                      {new Date(req.createdAtUtc).toLocaleString("es-AR")} · Usuarios: {req.estimatedUsers}
                    </div>
                    {req.message && <p style={{ marginTop: "8px", fontSize: "13px", color: "#cbd5e1" }}>{req.message}</p>}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
                    {req.status === "Pending" && (
                      <button type="button" onClick={() => handleStatus(req.id, "Contacted")} style={btnSecondary}>Contactado</button>
                    )}
                    {req.status !== "Provisioned" && (
                      <button type="button" onClick={() => openProvision(req)} style={btnPrimary}>Crear empresa</button>
                    )}
                    {req.status !== "Dismissed" && req.status !== "Provisioned" && (
                      <button type="button" onClick={() => handleStatus(req.id, "Dismissed")} style={btnSecondary}>Descartar</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", zIndex: 50 }}>
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "14px", padding: "24px", width: "100%", maxWidth: "520px", maxHeight: "90vh", overflow: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Aprovisionar: {selected.companyName}</h3>
            {provisionResult ? (
              <div>
                <p style={{ color: "#34d399" }}>{provisionResult}</p>
                <button type="button" onClick={() => { setSelected(null); setProvisionResult(null); }} style={btnPrimary}>Cerrar</button>
              </div>
            ) : (
              <form onSubmit={handleProvision} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={labelStyle}>Slug (URL interna)
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} style={inputStyle} required />
                </label>
                <label style={labelStyle}>Plan
                  <select value={planCode} onChange={(e) => handlePlanChange(e.target.value)} style={inputStyle}>
                    {plans.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>Admin email (fijo)
                  <input value={selected.email} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
                </label>
                <label style={labelStyle}>Contraseña inicial del admin
                  <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} style={inputStyle} required minLength={8} />
                </label>
                <label style={labelStyle}>Precio ARS/mes
                  <input type="number" value={monthlyPriceArs} onChange={(e) => setMonthlyPriceArs(Number(e.target.value))} style={inputStyle} />
                </label>
                {error && <p style={{ color: "#f87171", margin: 0, fontSize: "13px" }}>{error}</p>}
                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                  <button type="submit" disabled={provisioning} style={btnPrimary}>{provisioning ? "Creando BD..." : "Aprovisionar empresa + BD"}</button>
                  <button type="button" onClick={() => setSelected(null)} style={btnSecondary}>Cancelar</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: "13px", color: "#cbd5e1", display: "flex", flexDirection: "column", gap: "6px" };
const inputStyle: React.CSSProperties = { padding: "10px", borderRadius: "8px", border: "1px solid #334155", background: "#1e293b", color: "#fff" };
const btnPrimary: React.CSSProperties = { background: "linear-gradient(135deg, #eab308, #ca8a04)", border: "none", color: "#000", fontWeight: 700, padding: "10px 16px", borderRadius: "8px", cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0", padding: "10px 16px", borderRadius: "8px", cursor: "pointer" };
