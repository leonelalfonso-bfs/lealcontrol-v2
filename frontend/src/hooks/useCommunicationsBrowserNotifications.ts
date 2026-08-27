import { useEffect, useRef } from "react";
import { api } from "../api/client";
import {
  isBrowserNotificationsEnabled,
  processNotificationSummary,
  type CommNotificationSummary
} from "../lib/communicationsNotifications";

const POLL_MS = 25_000;

/** Poll de alertas y notificaciones de escritorio (con app abierta). */
export function useCommunicationsBrowserNotifications(active: boolean) {
  const initialRef = useRef(true);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const poll = async () => {
      if (!isBrowserNotificationsEnabled()) return;
      try {
        const summary = await api.getCommunicationsNotificationSummary();
        if (cancelled) return;
        processNotificationSummary(summary as CommNotificationSummary, initialRef.current);
        initialRef.current = false;
      } catch {
        // ignore
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active]);
}
