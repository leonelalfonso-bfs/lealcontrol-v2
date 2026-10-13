import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MyNotices, NoticeSettings } from "../api/types";

const SEVERITY_COLOR = { Critical: "#b91c1c", Warning: "#b45309", Info: "var(--ink)" } as const;

/** Mi perfil → Mis avisos: lo que tengo hoy y qué avisos quiero recibir. */
export function MyNoticesPage() {
  const [notices, setNotices] = useState<MyNotices | null>(null);
  const [settings, setSettings] = useState<NoticeSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [mine, prefs] = await Promise.all([api.getMyNotices(), api.getNoticeSettings()]);
    setNotices(mine);
    setSettings(prefs);
  };

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  const save = async (body: { code?: string; enabled?: boolean; emailDigest?: boolean }) => {
    setBusy(true);
    setError(null);
    try {
      setSettings(await api.saveNoticeSetting(body));
      setNotices(await api.getMyNotices());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage((await api.sendMyNoticeDigestNow()).detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">MI PERFIL</span>
          <h1>Mis avisos</h1>
          <p className="muted">Lo que necesita tu atención hoy, según tu perfil. Elegís qué avisos recibir y si te llega el resumen por correo.</p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <section className="card pad" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Hoy {notices ? `(${notices.total})` : ""}</h3>
        {!notices ? <p className="muted">Cargando…</p> : notices.groups.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No tenés avisos pendientes.</p>
        ) : notices.groups.map((group) => (
          <div key={group.code} style={{ marginBottom: 14 }}>
            <strong>{group.label} ({group.items.length})</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {group.items.map((item, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {item.link ? (
                    <Link to={item.link} style={{ color: SEVERITY_COLOR[item.severity], fontWeight: 600 }}>{item.title}</Link>
                  ) : <span style={{ color: SEVERITY_COLOR[item.severity], fontWeight: 600 }}>{item.title}</span>}
                  {item.detail && <span className="muted"> — {item.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {settings && (
        <section className="card pad stack" style={{ gap: 12 }}>
          <h3 style={{ margin: 0 }}>Qué avisos recibir</h3>
          {settings.notices.length === 0 && <p className="muted" style={{ margin: 0 }}>Tu perfil no tiene avisos disponibles.</p>}
          {settings.notices.map((n) => (
            <label key={n.code} className="check-label" style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, fontWeight: 500 }}>
              <input type="checkbox" checked={n.enabled} disabled={busy} onChange={(e) => void save({ code: n.code, enabled: e.target.checked })} style={{ marginTop: 3 }} />
              <span><strong>{n.label}</strong><br /><span className="muted" style={{ fontSize: "0.82rem" }}>{n.description}</span></span>
            </label>
          ))}

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <label className="check-label" style={{ flexDirection: "row", alignItems: "center", gap: 10, fontWeight: 500 }}>
              <input type="checkbox" checked={settings.emailDigest} disabled={busy} onChange={(e) => void save({ emailDigest: e.target.checked })} />
              Recibir un resumen por correo todos los días a las 7{settings.email ? ` (a ${settings.email})` : ""}
            </label>
            <p className="muted" style={{ fontSize: "0.8rem", margin: "6px 0 0" }}>
              Un solo correo con todos tus avisos, solo los días que hay algo.
              {!settings.systemMailConfigured && " Todavía no está configurada la casilla del sistema: por ahora los avisos se ven acá y en la campanita."}
            </p>
            {settings.systemMailConfigured && (
              <button type="button" className="btn btn-outline compact" style={{ marginTop: 8 }} disabled={busy} onClick={() => void sendNow()}>
                Enviarme el resumen ahora
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
