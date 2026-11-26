import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { MyNotices } from "../../api/types";
import { Icon } from "../ui/Icon";

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
    <div ref={ref} className="ins-bell">
      <button type="button" aria-label={`Mis avisos: ${total}`} title="Mis avisos" onClick={() => setOpen(!open)}
        className={`ins-bell__button${total > 0 ? " ins-bell__button--alert" : ""}`}>
        <span className="ins-bell__label"><Icon name="bell" size={16} /><span>Mis avisos</span></span>
        {total > 0 && <span className="ins-bell__count">{total > 99 ? "99+" : total}</span>}
      </button>
      {open && (
        <div className="ins-bell__panel" style={{
          overflowY: "auto", padding: "12px 14px"
        }}>
          <div className="t-strong">Mis avisos</div>
          {total === 0 ? <p className="muted t-small" style={{ margin: "8px 0" }}>No tenés avisos pendientes.</p> : notices!.groups.map((g) => (
            <div key={g.code} style={{ marginTop: 10 }}>
              <div className="t-small t-strong t-caps muted">{g.label} ({g.items.length})</div>
              {g.items.slice(0, 4).map((item, i) => (
                <div className="t-small" key={i} style={{ marginTop: 4 }}>
                  {item.link ? <Link to={item.link} onClick={() => setOpen(false)}>{item.title}</Link> : item.title}
                  {item.detail && <div className="muted t-small">{item.detail}</div>}
                </div>
              ))}
            </div>
          ))}
          <div className="t-small" style={{ marginTop: 12, borderTop: "1px solid var(--surface-border)", paddingTop: 8 }}>
            <Link to="/mi-perfil/avisos" onClick={() => setOpen(false)}>Ver todos y elegir qué recibir →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
