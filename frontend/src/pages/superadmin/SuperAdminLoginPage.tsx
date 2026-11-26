import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@lealcontrol.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.superAdminLogin({ email, password });
      localStorage.removeItem("leal_token");
      localStorage.removeItem("leal_user");
      localStorage.removeItem("leal_tenant_id");
      localStorage.setItem("leal_superadmin_token", res.token);
      localStorage.setItem("leal_superadmin_user", JSON.stringify(res.user));
      navigate("/superadmin");
    } catch (err: any) {
      setError(err.message || "Credenciales de SuperAdmin inválidas.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at top, #1e1b4b, var(--lc-ink), #020617)", padding: "20px" }}>
      <div style={{ width: "100%", maxWidth: "440px", background: "rgba(30, 41, 59, 0.7)", backdropFilter: "blur(16px)", border: "1px solid rgba(255, 215, 0, 0.2)", borderRadius: "16px", padding: "36px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)" }}>
        <div className="t-center" style={{ marginBottom: "28px" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "linear-gradient(135deg, var(--lc-warn), var(--lc-warn))", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "28px", boxShadow: "0 10px 20px -5px rgba(234, 179, 8, 0.4)" }}>
            ⚡
          </div>
          <h1 style={{ margin: "0 0 6px" }}>LEAL SuperAdmin</h1>
          <p className="muted" style={{ margin: 0 }}>Panel de Control Maestro & Multi-Bases SaaS</p>
        </div>

        {error && (
          <div className="alert" style={{ marginBottom: "20px" }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label>Email Maestro</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: "100%", color: "#fff" }}
              placeholder="admin@lealcontrol.com"
            />
          </div>

          <div>
            <label>Contraseña Maestra</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", color: "#fff" }}
              placeholder="••••••••"
            />
          </div>

          <button className="t-strong"
            type="submit"
            disabled={loading}
            style={{ marginTop: "10px", width: "100%", padding: "12px", background: "linear-gradient(135deg, var(--lc-warn), var(--lc-warn))", border: "none", borderRadius: "8px", color: "#000", cursor: "pointer", transition: "all 0.2s", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Accediendo al Master..." : "Ingresar al Panel Maestro"}
          </button>
        </form>
      </div>
    </div>
  );
}
