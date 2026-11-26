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
        <span className="eyebrow t-accent t-strong t-caps t-small" style={{ letterSpacing: "0.08em" }}>
          Metrología Legal
        </span>
        <h1 style={{ margin: "2px 0 0" }}>Alcance</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>
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
                style={{ cursor: saving ? "wait" : "pointer" }}
              >
                <strong style={{ display: "block", fontSize: "1.05rem" }}>{opt.title}</strong>
                <span className="muted" style={{ display: "block", marginTop: 6 }}>{opt.detail}</span>
                <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
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
          <div className="muted" style={{ marginTop: 6 }}>
            {visible.map((a) => a.label).join(" · ")}
          </div>
          <div style={{ marginTop: 14 }}>
            <Link to="/metrologia/ensayos/nuevo" className="btn">
              Nuevo ensayo
            </Link>
          </div>
        </div>
      )}

      {message && <p className="t-accent" style={{ marginTop: 12 }}>{message}</p>}
      {error && <p className="t-danger" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
