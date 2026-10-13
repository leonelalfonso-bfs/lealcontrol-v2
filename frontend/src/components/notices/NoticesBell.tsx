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
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="icon-button" aria-label={`Avisos: ${total}`} title="Mis avisos" onClick={() => setOpen(!open)}
        style={{ position: "relative", background: "transparent", border: "none", cursor: "pointer", fontSize: "1.1rem", padding: "4px 8px" }}>
        🔔
        {total > 0 && (
          <span style={{ position: "absolute", top: -2, right: -2, background: "#dc2626", color: "#fff", borderRadius: 999,
            fontSize: "0.65rem", fontWeight: 700, padding: "1px 5px", lineHeight: 1.3 }}>{total > 99 ? "99+" : total}</span>
        )}
      </button>
      {open && (
        <div className="card pad" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 340, maxHeight: 420, overflowY: "auto", zIndex: 50 }}>
          <strong>Mis avisos</strong>
          {total === 0 ? <p className="muted" style={{ margin: "8px 0" }}>No tenés avisos pendientes.</p> : notices!.groups.map((g) => (
            <div key={g.code} style={{ marginTop: 10 }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "var(--ink-soft)" }}>{g.label} ({g.items.length})</div>
              {g.items.slice(0, 4).map((item, i) => (
                <div key={i} style={{ fontSize: "0.82rem", marginTop: 4 }}>
                  {item.link ? <Link to={item.link} onClick={() => setOpen(false)}>{item.title}</Link> : item.title}
                  {item.detail && <div className="muted" style={{ fontSize: "0.75rem" }}>{item.detail}</div>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <Link to="/mi-perfil/avisos" onClick={() => setOpen(false)}>Ver todos y elegir qué recibir →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
