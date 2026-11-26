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
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--surface-border)" }}>
            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Bandeja — alertas</div>
            <div className="muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>
              {summary?.unreadTotal || 0} sin leer · {summary?.needsResponseCount || 0} requieren respuesta
            </div>
            {canUseDesktop && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 10,
                  fontSize: "0.78rem",
                  cursor: permission === "denied" ? "not-allowed" : "pointer"
                }}
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
              <div className="muted" style={{ fontSize: "0.72rem", marginTop: 4 }}>
                Bloqueadas por el navegador. Habilitálas en la configuración del sitio.
              </div>
            )}
            {desktopEnabled && permission === "granted" && (
              <div className="muted" style={{ fontSize: "0.72rem", marginTop: 4 }}>
                Te avisamos cuando llegue un mensaje nuevo (con la app abierta).
              </div>
            )}
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {(summary?.recent || []).length === 0 ? (
              <div className="muted" style={{ padding: 16, textAlign: "center", fontSize: "0.85rem" }}>
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
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    border: "none",
                    borderBottom: "1px solid var(--surface-border)",
                    background: "transparent",
                    cursor: "pointer"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>
                      {channelIcon(item.channelType)} {item.participantName || item.participantId}
                    </span>
                    <span className="muted" style={{ fontSize: "0.72rem", flexShrink: 0 }}>
                      {new Date(item.lastMessageAtUtc).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div
                    className="muted"
                    style={{
                      fontSize: "0.78rem",
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {item.lastMessagePreview}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    {item.unreadCount > 0 && (
                      <span style={{ fontSize: "0.7rem", color: "var(--lc-accent-strong)", fontWeight: 700 }}>
                        {item.unreadCount} nuevo(s)
                      </span>
                    )}
                    {item.needsResponse && (
                      <span style={{ fontSize: "0.7rem", color: "var(--lc-danger)", fontWeight: 700 }}>
                        ⏰ SLA
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          <div style={{ padding: 10, borderTop: "1px solid var(--surface-border)" }}>
            <Link
              to="/comunicaciones"
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                textAlign: "center",
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "var(--lc-accent-strong)",
                textDecoration: "none"
              }}
            >
              Abrir bandeja completa →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
