import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";

export function SuperAdminSettingsPage() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.getSuperAdminCommunicationsInbox()
      .then((result) => setEnabled(result.enabled))
      .catch((cause: Error) => {
        if (cause.message.includes("401") || cause.message.includes("403")) navigate("/superadmin/login");
        else setError(cause.message);
      });
  }, [navigate]);

  const toggle = async () => {
    if (enabled === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const requested = !enabled;
      await api.setSuperAdminCommunicationsInbox(requested);
      const actual = await api.getPublicFeatures();
      setEnabled(actual.communicationsInboxEnabled);
      if (actual.communicationsInboxEnabled !== requested) {
        setError("El cambio no se refleja en la API del tenant. Revisá la conexión de staging antes de continuar.");
      }
      window.dispatchEvent(new Event("communications-feature-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "#090d16", color: "#f1f5f9", padding: "40px 24px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <Link to="/superadmin" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 700 }}>← Volver al panel</Link>
        <h1 style={{ fontSize: 30, margin: "24px 0 6px" }}>Configuración de SuperAdmin</h1>
        <p style={{ color: "#94a3b8", marginBottom: 30 }}>Disponibilidad de funciones en esta instalación.</p>
        <section style={{ background: "#131c2e", border: "1px solid #334155", borderRadius: 14, padding: 24 }} aria-label="Comunicaciones">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <div style={{ maxWidth: 600 }}>
              <h2 style={{ fontSize: 19, margin: "0 0 8px" }}>Comunicaciones</h2>
              <p style={{ color: "#94a3b8", lineHeight: 1.55, margin: 0 }}>
                Permite usar la bandeja en las empresas que tengan Comunicaciones asignado. El correo compartido de Ventas y Directorio sigue disponible.
              </p>
            </div>
            <button type="button" onClick={toggle} disabled={enabled === null || saving} aria-pressed={enabled === true}
              style={{ background: enabled ? "#206bc4" : "#334155", color: "#fff", border: 0, borderRadius: 8, padding: "11px 18px", fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
              {enabled === null ? "Cargando..." : saving ? "Guardando..." : enabled ? "Activado · Desactivar" : "Desactivado · Activar"}
            </button>
          </div>
          {error && <p role="alert" style={{ color: "#fca5a5", marginBottom: 0 }}>{error}</p>}
        </section>
        <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 18 }}>
          Para mostrar el módulo a una empresa, asignalo también en Clientes & Bases. Sus usuarios deben volver a iniciar sesión después de cambiar esa asignación.
        </p>
      </div>
    </main>
  );
}
