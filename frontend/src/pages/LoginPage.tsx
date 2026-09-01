import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { TenantInfo } from "../api/types";

export function LoginPage() {
  const { applySession, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"credentials" | "tenant">("credentials");
  const [tenantChoices, setTenantChoices] = useState<TenantInfo[]>([]);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);

  // Login Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Por favor ingresá tu correo electrónico y contraseña.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.login({ email: email.trim(), password });
      if (res.availableTenants.length > 1) {
        setTenantChoices(res.availableTenants);
        setPendingCredentials({ email: email.trim(), password });
        setStep("tenant");
        return;
      }
      applySession(res);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Credenciales inválidas. Verificá tu usuario y contraseña.");
    } finally {
      setLoading(false);
    }
  };

  const handleTenantPick = async (tenantId: string) => {
    if (!pendingCredentials) return;
    try {
      setLoading(true);
      setError(null);
      await login(pendingCredentials.email, pendingCredentials.password, tenantId);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo ingresar a la empresa seleccionada.");
    } finally {
      setLoading(false);
    }
  };

  const resetToCredentials = () => {
    setStep("credentials");
    setTenantChoices([]);
    setPendingCredentials(null);
    setError(null);
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
      background: "#090d16",
      color: "#f8fafc",
      fontFamily: "var(--font-sans, system-ui, sans-serif)"
    }}>
      {/* ================= LEFT SIDE: SYSTEM HIGHLIGHTS & BRANDING ================= */}
      <div style={{
        background: "radial-gradient(circle at 20% 20%, #1e293b 0%, #0b1120 70%, #020617 100%)",
        padding: "48px 40px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Subtle Ambient Glow */}
        <div style={{
          position: "absolute",
          top: "-10%",
          left: "-10%",
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, transparent 70%)",
          filter: "blur(60px)",
          pointerEvents: "none"
        }} />

        <div>
          {/* Brand Logo Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 36 }}>
            <img
              src="/logo.png"
              alt="LEAL Control ERP"
              style={{ height: 58, width: "auto", objectFit: "contain", filter: "drop-shadow(0 4px 12px rgba(16, 185, 129, 0.2))" }}
            />
            <span style={{
              fontSize: "0.75rem",
              fontWeight: 800,
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(37, 99, 235, 0.2)",
              color: "#60a5fa",
              border: "1px solid rgba(96, 165, 250, 0.3)",
              letterSpacing: "0.05em"
            }}>
              v2.0 CLOUD ERP
            </span>
          </div>

          {/* Marketing & Value Title */}
          <h1 style={{
            fontSize: "2.4rem",
            fontWeight: 900,
            lineHeight: 1.2,
            marginBottom: 16,
            letterSpacing: "-0.02em",
            color: "#ffffff"
          }}>
            La Plataforma Integral que Potencia la Gestión de tu <span style={{ color: "#38bdf8" }}>Empresa</span>
          </h1>

          <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.6, marginBottom: 32, maxWidth: "560px" }}>
            Unificá en tiempo real todas las áreas estratégicas de tu negocio bajo una arquitectura Cloud ágil, segura y 100% homologada.
          </p>

          {/* 4 Key Feature Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 30 }}>
            <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: "1.2rem", marginBottom: 6 }}>🏛️</div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f1f5f9" }}>Contabilidad & P&L en Vivo</div>
              <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 4 }}>Asientos automáticos, libro diario y Balance 8 Columnas oficial.</div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: "1.2rem", marginBottom: 6 }}>📊</div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f1f5f9" }}>Ventas & ARCA (AFIP)</div>
              <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 4 }}>Facturas A, B, C, MiPyME con CAE directo y presupuestos por WhatsApp.</div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: "1.2rem", marginBottom: 6 }}>🌾</div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f1f5f9" }}>Cereales & Granos</div>
              <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 4 }}>Contratos, fijaciones a pizarra Rosario/MATba, balanza y CPE.</div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: "1.2rem", marginBottom: 6 }}>💳</div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f1f5f9" }}>Finanzas, eCheqs & Flota</div>
              <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 4 }}>Cartera unificada de cheques, cuentas corrientes y control de camiones.</div>
            </div>
          </div>
        </div>

        {/* Trust Badges */}
        <div style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          paddingTop: 20,
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          fontSize: "0.78rem",
          color: "#64748b"
        }}>
          <span>🛡️ Homologado ARCA (AFIP)</span>
          <span>☁️ Multi-Empresa Cloud</span>
          <span>🔒 Encriptación SSL 256-bit</span>
          <span>🇦🇷 Soporte Nacional</span>
        </div>
      </div>

      {/* ================= RIGHT SIDE: LOGIN FORM ================= */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 32px",
        background: "#080c14"
      }}>
        <div style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(15, 23, 42, 0.9)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "20px",
          padding: "36px 32px",
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.6)"
        }}>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#ffffff", marginBottom: 6 }}>
              {step === "tenant" ? "Elegí tu Empresa" : "Ingreso al Sistema"}
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>
              {step === "tenant"
                ? "Tu usuario tiene acceso a varias empresas. Seleccioná con cuál querés trabajar."
                : "Ingresá tus credenciales autorizadas para acceder al panel de tu empresa."}
            </p>
          </div>

          {/* Inactivity Notice Banner */}
          {location.search.includes("inactivity=1") && (
            <div style={{
              padding: "12px 14px",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "10px",
              color: "#93c5fd",
              fontSize: "0.82rem",
              marginBottom: "20px",
              lineHeight: 1.4
            }}>
              ℹ️ Tu sesión se cerró por inactividad (30 min). Por seguridad, ingresá tus datos nuevamente.
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div style={{
              padding: "12px 14px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "10px",
              color: "#fca5a5",
              fontSize: "0.82rem",
              marginBottom: "20px",
              lineHeight: 1.4
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Login Form */}
          {step === "credentials" ? (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                Correo Electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="tu.usuario@empresa.com"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "10px",
                  color: "#ffffff",
                  fontSize: "0.92rem",
                  outline: "none",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                Contraseña
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  style={{
                    width: "100%",
                    padding: "12px 42px 12px 14px",
                    background: "rgba(30, 41, 59, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "10px",
                    color: "#ffffff",
                    fontSize: "0.92rem",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    padding: 0
                  }}
                  title={showPassword ? "Ocultar" : "Mostrar"}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px",
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                border: "none",
                borderRadius: "10px",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.95rem",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                marginTop: "6px",
                transition: "opacity 0.2s"
              }}
            >
              {loading ? "Verificando credenciales..." : "🔐 Ingresar a LEAL Control ➔"}
            </button>
          </form>
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {tenantChoices.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={loading}
                onClick={() => handleTenantPick(t.id)}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  textAlign: "left",
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "10px",
                  color: "#ffffff",
                  cursor: loading ? "not-allowed" : "pointer"
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                  🏢 {t.tradeName || t.legalName}
                </div>
                {t.documentNumber && (
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 4 }}>
                    CUIT {t.documentNumber}
                  </div>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={resetToCredentials}
              disabled={loading}
              style={{
                marginTop: 8,
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "0.82rem"
              }}
            >
              ← Volver a credenciales
            </button>
          </div>
          )}

          {/* Links Footer */}
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255, 255, 255, 0.08)", textAlign: "center", fontSize: "0.82rem", color: "#64748b" }}>
            <span>¿Necesitás una cuenta o querés probar el sistema?</span><br/>
            <Link to="/landing" style={{ color: "#38bdf8", fontWeight: 700, textDecoration: "none", display: "inline-block", marginTop: 6 }}>
              ✨ Solicitá tu Demo Personalizada aquí ➔
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
