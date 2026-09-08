import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "leal_presentation_mode";

interface PresentationModeContextType {
  active: boolean;
  loading: boolean;
  start: () => Promise<void>;
  end: (password: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const PresentationModeContext = createContext<PresentationModeContextType | undefined>(undefined);

export function PresentationModeProvider({ children }: { children: ReactNode }) {
  const { user, tenant } = useAuth();
  const [active, setActive] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) === "1" : false
  );
  const [loading, setLoading] = useState(false);

  const persist = useCallback((value: boolean) => {
    setActive(value);
    if (typeof window === "undefined") return;
    if (value) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const refresh = useCallback(async () => {
    if (!user || !tenant?.id) {
      persist(false);
      return;
    }
    try {
      const status = await api.getQualityPresentationStatus();
      persist(!!status.active);
    } catch {
      // Si el módulo no está contratado u otro error, no forzar el flag local.
    }
  }, [user, tenant?.id, persist]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = useCallback(async () => {
    setLoading(true);
    try {
      await api.startQualityPresentation();
      persist(true);
    } finally {
      setLoading(false);
    }
  }, [persist]);

  const end = useCallback(async (password: string) => {
    setLoading(true);
    try {
      await api.endQualityPresentation(password);
      persist(false);
    } finally {
      setLoading(false);
    }
  }, [persist]);

  const value = useMemo(
    () => ({ active, loading, start, end, refresh }),
    [active, loading, start, end, refresh]
  );

  return (
    <PresentationModeContext.Provider value={value}>
      {children}
    </PresentationModeContext.Provider>
  );
}

export function usePresentationMode(): PresentationModeContextType {
  const ctx = useContext(PresentationModeContext);
  if (!ctx) {
    return {
      active: false,
      loading: false,
      start: async () => undefined,
      end: async () => undefined,
      refresh: async () => undefined
    };
  }
  return ctx;
}
