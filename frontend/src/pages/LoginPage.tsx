import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { TenantInfo } from "../api/types";
import "./login-page.css";

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

  const sortTenantChoices = (tenants: TenantInfo[]) => {
    const preferred = typeof window !== "undefined" ? localStorage.getItem("leal_preferred_tenant_id") : null;
    return [...tenants].sort((a, b) => {
      if (preferred && a.id === preferred) return -1;
      if (preferred && b.id === preferred) return 1;
      return (a.legalName || a.tradeName || "").localeCompare(b.legalName || b.tradeName || "", "es");
    });
  };

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
      if (res.requiresTenantSelection || (res.availableTenants.length > 1 && !res.token)) {
        setTenantChoices(sortTenantChoices(res.availableTenants));
        setPendingCredentials({ email: email.trim(), password });
        setStep("tenant");
        return;
      }
      if (!res.token || !res.user || !res.tenant) {
        throw new Error("No se pudo iniciar sesión. Verificá tus credenciales.");
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
    <main className="login-page">
      <section className="login-intro" aria-label="LEAL Control">
        <div className="login-brand">
          <img src="/logo.png" alt="LEAL Control ERP" />
          <span>LEAL CONTROL</span>
        </div>
        <div className="login-intro-content">
          <span className="login-eyebrow">Tu espacio de trabajo</span>
          <h1>Todo tu negocio,<br /><span>más claro.</span></h1>
          <p>Un solo lugar para trabajar con tus equipos, procesos e información.</p>
          <div className="login-intro-points">
            <span>Gestión integrada</span>
            <span>Información en tiempo real</span>
            <span>Acceso a tus empresas</span>
          </div>
        </div>
        <p className="login-intro-footer">LEAL Control ERP</p>
      </section>

      <section className="login-panel" aria-label="Acceso al sistema">
        <div className="login-card">
          <span className="login-card-kicker">Bienvenido</span>
          <h2>{step === "tenant" ? "Elegí tu empresa" : "Ingresá a tu cuenta"}</h2>
          <p className="login-card-description">
            {step === "tenant"
              ? "Seleccioná la empresa con la que querés trabajar."
              : "Usá tus credenciales para continuar."}
          </p>

          {location.search.includes("inactivity=1") && (
            <div className="login-notice" role="status">
              Tu sesión se cerró por inactividad. Ingresá nuevamente para continuar.
            </div>
          )}
          {error && <div className="login-error" role="alert">{error}</div>}

          {step === "credentials" ? (
            <form onSubmit={handleLogin} className="login-form">
              <label htmlFor="login-email">Correo electrónico</label>
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" placeholder="tu.usuario@empresa.com" />
              <label htmlFor="login-password">Contraseña</label>
              <div className="login-password-field">
                <input id="login-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Ingresá tu contraseña" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <button className="login-submit" type="submit" disabled={loading}>
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
            </form>
          ) : (
            <div className="login-tenants">
              {tenantChoices.map((tenant) => (
                <button key={tenant.id} type="button" disabled={loading} onClick={() => handleTenantPick(tenant.id)} className="login-tenant">
                  <strong>{tenant.legalName}</strong>
                  {tenant.tradeName && tenant.tradeName !== tenant.legalName && <span>{tenant.tradeName}</span>}
                  {tenant.documentNumber && <small>CUIT {tenant.documentNumber}</small>}
                </button>
              ))}
              <button type="button" className="login-back" onClick={resetToCredentials} disabled={loading}>← Volver a credenciales</button>
            </div>
          )}

          <div className="login-help">
            <span>¿Querés conocer LEAL Control?</span>
            <Link to="/landing">Solicitá una demo</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
