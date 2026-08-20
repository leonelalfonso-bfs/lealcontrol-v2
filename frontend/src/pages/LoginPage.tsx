import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LealLogo } from "../components/LealLogo";

export function LoginPage() {
  const { login, registerTenant } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login Form State
  const [email, setEmail] = useState("admin@lealcontrol.com");
  const [password, setPassword] = useState("admin123");

  // Register Tenant Form State
  const [companyName, setCompanyName] = useState("");
  const [cuit, setCuit] = useState("");
  const [phone, setPhone] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    try {
      setLoading(true);
      setError(null);
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !registerEmail.trim() || !registerPassword) return;

    try {
      setLoading(true);
      setError(null);
      await registerTenant({
        companyName: companyName.trim(),
        cuit: cuit.trim() || undefined,
        phone: phone.trim() || undefined,
        adminFullName: adminFullName.trim() || undefined,
        email: registerEmail.trim(),
        password: registerPassword
      });
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar la nueva empresa.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(circle at 50% 10%, #0f172a 0%, #020617 100%)",
      padding: "24px",
      fontFamily: "var(--font-sans, system-ui, sans-serif)"
    }}>
      <div style={{
        maxWidth: "480px",
        width: "100%",
        background: "rgba(15, 23, 42, 0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "24px",
        padding: "36px 32px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        color: "#f8fafc"
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ display: "inline-block", marginBottom: "12px" }}>
            <LealLogo size={54} showText animated />
          </div>
          <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "0.88rem" }}>
            Sistema de Gestión Integral Cloud ERP 2.0
          </p>
        </div>

        {/* Tab Toggle */}
        <div style={{
          display: "flex",
          background: "rgba(30, 41, 59, 0.6)",
          padding: "4px",
          borderRadius: "12px",
          marginBottom: "24px",
          border: "1px solid rgba(255, 255, 255, 0.08)"
        }}>
          <button
            type="button"
            onClick={() => { setTab("login"); setError(null); }}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              borderRadius: "8px",
              background: tab === "login" ? "#0d9488" : "transparent",
              color: tab === "login" ? "#ffffff" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            🔑 Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => { setTab("register"); setError(null); }}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              borderRadius: "8px",
              background: tab === "register" ? "#0d9488" : "transparent",
              color: tab === "register" ? "#ffffff" : "#94a3b8",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            🏢 Nueva Empresa
          </button>
        </div>

        {error && (
          <div style={{
            padding: "12px 16px",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "10px",
            color: "#fca5a5",
            fontSize: "0.85rem",
            marginBottom: "20px"
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Tab 1: Login */}
        {tab === "login" && (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "8px",
                padding: "14px",
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #0d9488 0%, #059669 100%)",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "1rem",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(13, 148, 136, 0.4)",
                transition: "transform 0.15s"
              }}
            >
              {loading ? "Ingresando..." : "🚀 Ingresar a LEAL Control"}
            </button>

            <div style={{
              marginTop: "16px",
              padding: "12px",
              borderRadius: "10px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              fontSize: "0.78rem",
              color: "#94a3b8",
              textAlign: "center"
            }}>
              💡 <strong>Credencial de prueba:</strong> <code>admin@lealcontrol.com</code> / <code>admin123</code>
            </div>
          </form>
        )}

        {/* Tab 2: Register Tenant */}
        {tab === "register" && (
          <form onSubmit={handleRegisterTenant} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                Razón Social / Nombre de la Empresa *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ej: Metrología Andina S.R.L."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                  CUIT (opcional)
                </label>
                <input
                  type="text"
                  value={cuit}
                  onChange={(e) => setCuit(e.target.value)}
                  placeholder="30-12345678-9"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    background: "rgba(15, 23, 42, 0.6)",
                    color: "#ffffff",
                    fontSize: "0.9rem",
                    boxSizing: "border-box"
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                  Teléfono
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: 341-555-0100"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    background: "rgba(15, 23, 42, 0.6)",
                    color: "#ffffff",
                    fontSize: "0.9rem",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                Nombre del Administrador
              </label>
              <input
                type="text"
                value={adminFullName}
                onChange={(e) => setAdminFullName(e.target.value)}
                placeholder="Ej: Ing. Carlos Gómez"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                Email de Acceso *
              </label>
              <input
                type="email"
                required
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                placeholder="admin@tuempresa.com"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                Contraseña *
              </label>
              <input
                type="password"
                required
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(15, 23, 42, 0.6)",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "10px",
                padding: "14px",
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #0d9488 0%, #059669 100%)",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "1rem",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(13, 148, 136, 0.4)"
              }}
            >
              {loading ? "Creando empresa..." : "🏢 Crear Empresa y Entrar Limpio"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
