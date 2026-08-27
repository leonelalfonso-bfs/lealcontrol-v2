const ENABLED_KEY = "leal_comm_browser_notifications_enabled";
const SNAPSHOT_KEY = "leal_comm_notifications_snapshot";
const OPEN_CONVERSATION_KEY = "leal_open_conversation_id";

export type CommNotificationItem = {
  id: string;
  participantName: string;
  participantId: string;
  channelType: string;
  lastMessagePreview?: string | null;
  unreadCount: number;
  lastMessageAtUtc: string;
  needsResponse: boolean;
};

export type CommNotificationSummary = {
  unreadTotal: number;
  needsResponseCount: number;
  recent: CommNotificationItem[];
};

type ConversationSnapshot = Record<string, { unreadCount: number; lastMessageAtUtc: string }>;

export function isBrowserNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function isBrowserNotificationsEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === "true";
}

export function setBrowserNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? "true" : "false");
  if (!enabled) {
    sessionStorage.removeItem(SNAPSHOT_KEY);
  }
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isBrowserNotificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isBrowserNotificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export async function enableBrowserNotifications(): Promise<NotificationPermission | "unsupported"> {
  const permission = await requestBrowserNotificationPermission();
  if (permission === "granted") {
    setBrowserNotificationsEnabled(true);
  }
  return permission;
}

function channelLabel(ch: string): string {
  if (ch === "whatsapp") return "WhatsApp";
  if (ch === "instagram") return "Instagram";
  if (ch === "facebook") return "Facebook";
  return "Email";
}

function loadSnapshot(): ConversationSnapshot {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as ConversationSnapshot) : {};
  } catch {
    return {};
  }
}

function saveSnapshot(snapshot: ConversationSnapshot): void {
  sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

function shouldSkipNotification(conversationId: string): boolean {
  if (window.location.pathname !== "/comunicaciones") return false;
  if (document.visibilityState !== "visible") return false;
  const activeId = sessionStorage.getItem(OPEN_CONVERSATION_KEY);
  return activeId === conversationId;
}

export function setActiveConversationForNotifications(conversationId: string | null): void {
  if (conversationId) {
    sessionStorage.setItem(OPEN_CONVERSATION_KEY, conversationId);
  } else {
    sessionStorage.removeItem(OPEN_CONVERSATION_KEY);
  }
}

export function consumePendingConversationOpen(): string | null {
  const pending = sessionStorage.getItem(OPEN_CONVERSATION_KEY);
  if (pending?.startsWith("pending:")) {
    const id = pending.slice("pending:".length);
    sessionStorage.setItem(OPEN_CONVERSATION_KEY, id);
    return id;
  }
  return null;
}

function openConversation(conversationId: string): void {
  sessionStorage.setItem(OPEN_CONVERSATION_KEY, `pending:${conversationId}`);
  if (window.location.pathname === "/comunicaciones") {
    window.dispatchEvent(new CustomEvent("leal:open-conversation", { detail: { conversationId } }));
    window.focus();
    return;
  }
  window.location.href = "/comunicaciones";
}

export function showBrowserNotification(item: CommNotificationItem): void {
  if (!isBrowserNotificationsEnabled()) return;
  if (!isBrowserNotificationsSupported() || Notification.permission !== "granted") return;
  if (shouldSkipNotification(item.id)) return;

  const title = `${channelLabel(item.channelType)} — ${item.participantName || item.participantId}`;
  const body = item.lastMessagePreview?.trim() || (item.needsResponse ? "Requiere respuesta" : "Nuevo mensaje");

  try {
    const notification = new Notification(title, {
      body,
      icon: "/favicon.png",
      tag: `leal-conv-${item.id}`,
      silent: false
    });

    notification.onclick = () => {
      notification.close();
      openConversation(item.id);
    };
  } catch {
    // ignore — algunos navegadores bloquean fuera de gesto del usuario
  }
}

/** Compara el resumen actual con el anterior y dispara notificaciones de escritorio. */
export function processNotificationSummary(summary: CommNotificationSummary, isInitial: boolean): void {
  if (!isBrowserNotificationsEnabled()) return;
  if (Notification.permission !== "granted") return;

  const prev = loadSnapshot();
  const next: ConversationSnapshot = { ...prev };

  for (const item of summary.recent) {
    const before = prev[item.id];
    const isNewActivity =
      !before ||
      item.unreadCount > before.unreadCount ||
      (item.lastMessageAtUtc !== before.lastMessageAtUtc && item.unreadCount > 0);

    if (!isInitial && isNewActivity && item.unreadCount > 0) {
      showBrowserNotification(item);
    }

    next[item.id] = {
      unreadCount: item.unreadCount,
      lastMessageAtUtc: item.lastMessageAtUtc
    };
  }

  saveSnapshot(next);
}
