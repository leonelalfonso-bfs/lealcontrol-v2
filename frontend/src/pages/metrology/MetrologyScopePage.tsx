import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyActivityMode } from "../../api/types";
import { assaysForMode, scopeTitle } from "./metrologyScope";

const OPTIONS: { value: MetrologyActivityMode; title: string; detail: string }[] = [
  {
    value: "Laboratory",
    title: "Laboratorio de ensayos",
    detail: "Solo aparecen verificación periódica y verificación primitiva."
  },
  {
    value: "Repairer",
    title: "Reparador",
    detail: "Aparecen los cuatro ensayos: calibración, verificación periódica, verificación primitiva y verificación posterior a la reparación."
  }
];

export function MetrologyScopePage() {
  const [mode, setMode] = useState<MetrologyActivityMode>("Repairer");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMetrologySettings()
      .then((settings) => setMode(settings.activityMode === "Laboratory" ? "Laboratory" : "Repairer"))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const choose = async (next: MetrologyActivityMode) => {
    if (next === mode || saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.updateMetrologySettings({ activityMode: next });
      setMode(res.activityMode === "Laboratory" ? "Laboratory" : "Repairer");
      setMessage("Alcance guardado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const visible = assaysForMode(mode);

  return (
    <div className="page-wide">
      <div className="page-head" style={{ marginBottom: 20 }}>
        <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
          Metrología Legal
        </span>
        <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>Alcance</h1>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>
          Elegí si la empresa es laboratorio de ensayos o reparador. El alta de ensayos solo muestra lo que corresponde.
        </p>
      </div>

      {loading ? (
        <div className="muted">Cargando alcance…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, maxWidth: 860 }}>
          {OPTIONS.map((opt) => {
            const selected = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={saving}
                onClick={() => choose(opt.value)}
                className="card pad"
                style={{
                  textAlign: "left",
                  cursor: saving ? "wait" : "pointer",
                  border: selected ? "2px solid #0d9488" : "1px solid var(--surface-border, #e5e7eb)",
                  background: selected ? "rgba(13, 148, 136, 0.06)" : undefined
                }}
              >
                <strong style={{ display: "block", fontSize: "1.05rem" }}>{opt.title}</strong>
                <span className="muted" style={{ display: "block", marginTop: 6, fontSize: "0.86rem" }}>{opt.detail}</span>
                <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: "0.86rem" }}>
                  {assaysForMode(opt.value).map((a) => (
                    <li key={a.code}>{a.label}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      )}

      {!loading && (
        <div className="card pad" style={{ marginTop: 18, maxWidth: 860 }}>
          <strong>Ensayos que aparecen ahora ({scopeTitle(mode)})</strong>
          <div className="muted" style={{ marginTop: 6, fontSize: "0.88rem" }}>
            {visible.map((a) => a.label).join(" · ")}
          </div>
          <div style={{ marginTop: 14 }}>
            <Link to="/metrologia/ensayos/nuevo" className="btn" style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
              Nuevo ensayo
            </Link>
          </div>
        </div>
      )}

      {message && <p style={{ color: "#0f766e", marginTop: 12 }}>{message}</p>}
      {error && <p style={{ color: "#dc2626", marginTop: 12 }}>{error}</p>}
    </div>
  );
}
