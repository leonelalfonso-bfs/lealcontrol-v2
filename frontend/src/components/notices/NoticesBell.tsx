import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { MyNotices } from "../../api/types";

const REFRESH_MS = 5 * 60_000;

/** Campanita de avisos personales: cantidad de pendientes y un vistazo rápido. */
export function NoticesBell() {
  const [notices, setNotices] = useState<MyNotices | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => api.getMyNotices().then(setNotices).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const total = notices?.total ?? 0;
  return (
    // Va al pie del menú lateral: botón a lo ancho y la lista se abre hacia arriba, como la de Comunicaciones.
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button type="button" aria-label={`Mis avisos: ${total}`} title="Mis avisos" onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "8px 12px",
          borderRadius: 10, border: total > 0 ? "1px solid #fbbf24" : "1px solid var(--surface-border)",
          background: total > 0 ? "rgba(251, 191, 36, 0.12)" : "var(--surface-muted)", cursor: "pointer",
          fontSize: "0.82rem", fontWeight: 700, color: "var(--ink)"
        }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span>🔔</span><span>Mis avisos</span></span>
        {total > 0 && (
          <span style={{ background: "#dc2626", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: "0.72rem", minWidth: 20, textAlign: "center" }}>
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0, zIndex: 50, background: "var(--surface)",
          border: "1px solid var(--surface-border)", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
          maxHeight: 420, overflowY: "auto", padding: "12px 14px"
        }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Mis avisos</div>
          {total === 0 ? <p className="muted" style={{ margin: "8px 0", fontSize: "0.82rem" }}>No tenés avisos pendientes.</p> : notices!.groups.map((g) => (
            <div key={g.code} style={{ marginTop: 10 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--ink-soft)" }}>{g.label} ({g.items.length})</div>
              {g.items.slice(0, 4).map((item, i) => (
                <div key={i} style={{ fontSize: "0.8rem", marginTop: 4 }}>
                  {item.link ? <Link to={item.link} onClick={() => setOpen(false)}>{item.title}</Link> : item.title}
                  {item.detail && <div className="muted" style={{ fontSize: "0.72rem" }}>{item.detail}</div>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 12, borderTop: "1px solid var(--surface-border)", paddingTop: 8, fontSize: "0.8rem" }}>
            <Link to="/mi-perfil/avisos" onClick={() => setOpen(false)}>Ver todos y elegir qué recibir →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
