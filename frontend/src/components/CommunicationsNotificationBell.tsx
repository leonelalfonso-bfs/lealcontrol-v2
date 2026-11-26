import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Icon } from "./ui/Icon";
import {
  enableBrowserNotifications,
  getNotificationPermission,
  isBrowserNotificationsEnabled,
  isBrowserNotificationsSupported,
  setBrowserNotificationsEnabled,
  type CommNotificationItem
} from "../lib/communicationsNotifications";

type Summary = {
  unreadTotal: number;
  needsResponseCount: number;
  recent: CommNotificationItem[];
};

function channelIcon(ch: string) {
  if (ch === "instagram") return "📸";
  if (ch === "facebook") return "📘";
  return "✉️";
}

export function CommunicationsNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [desktopEnabled, setDesktopEnabled] = useState(isBrowserNotificationsEnabled);
  const [permission, setPermission] = useState(getNotificationPermission());
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    void api.getCommunicationsNotificationSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  };

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggleDesktop = async () => {
    if (desktopEnabled) {
      setBrowserNotificationsEnabled(false);
      setDesktopEnabled(false);
      return;
    }
    const result = await enableBrowserNotifications();
    setPermission(result);
    setDesktopEnabled(result === "granted");
  };

  const badgeCount = (summary?.unreadTotal || 0) + (summary?.needsResponseCount || 0);
  const hasAlert = badgeCount > 0;
  const canUseDesktop = isBrowserNotificationsSupported();

  return (
    <div ref={ref} className="ins-bell">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          load();
        }}
        className={`ins-bell__button${hasAlert ? " ins-bell__button--alert" : ""}`}
        title="Notificaciones de comunicaciones"
      >
        <span className="ins-bell__label">
          <Icon name="bell" size={16} />
          <span>Comunicaciones</span>
        </span>
        {hasAlert && <span className="ins-bell__count">{badgeCount > 99 ? "99+" : badgeCount}</span>}
      </button>

      {open && (
        <div
          className="ins-bell__panel"
          style={{
            maxHeight: 420,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--lc-line)" }}>
            <div className="t-strong">Bandeja — alertas</div>
            <div className="muted t-small" style={{ marginTop: 2 }}>
              {summary?.unreadTotal || 0} sin leer · {summary?.needsResponseCount || 0} requieren respuesta
            </div>
            {canUseDesktop && (
              <label
                style={{ alignItems: "center", gap: 8, marginTop: 10, cursor: permission === "denied" ? "not-allowed" : "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={desktopEnabled && permission === "granted"}
                  disabled={permission === "denied"}
                  onChange={() => void toggleDesktop()}
                />
                <span>Notificaciones de escritorio</span>
              </label>
            )}
            {permission === "denied" && (
              <div className="muted t-small" style={{ marginTop: 4 }}>
                Bloqueadas por el navegador. Habilitálas en la configuración del sitio.
              </div>
            )}
            {desktopEnabled && permission === "granted" && (
              <div className="muted t-small" style={{ marginTop: 4 }}>
                Te avisamos cuando llegue un mensaje nuevo (con la app abierta).
              </div>
            )}
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {(summary?.recent || []).length === 0 ? (
              <div className="muted t-center t-small" style={{ padding: 16 }}>
                No hay alertas pendientes.
              </div>
            ) : (
              summary!.recent.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    navigate("/comunicaciones", { state: { conversationId: item.id } });
                  }}
                  style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--lc-line)", background: "transparent", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span className="t-strong" style={{ fontSize: "0.84rem" }}>
                      {channelIcon(item.channelType)} {item.participantName || item.participantId}
                    </span>
                    <span className="muted t-small" style={{ flexShrink: 0 }}>
                      {new Date(item.lastMessageAtUtc).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div
                    className="muted t-small"
                    style={{ marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {item.lastMessagePreview}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    {item.unreadCount > 0 && (
                      <span className="t-small t-accent t-strong">
                        {item.unreadCount} nuevo(s)
                      </span>
                    )}
                    {item.needsResponse && (
                      <span className="t-small t-danger t-strong">
                        ⏰ SLA
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          <div style={{ padding: 10, borderTop: "1px solid var(--lc-line)" }}>
            <Link className="t-center t-small t-strong t-accent"
              to="/comunicaciones"
              onClick={() => setOpen(false)}
              style={{ display: "block", textDecoration: "none" }}
            >
              Abrir bandeja completa →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
