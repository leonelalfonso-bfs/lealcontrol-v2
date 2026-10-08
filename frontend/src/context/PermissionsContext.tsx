import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { PermissionLevel, SensitivePermissions } from "../api/types";
import { useAuth } from "./AuthContext";

export type EffectivePermissions = {
  modules: Record<string, PermissionLevel>;
  sensitive: SensitivePermissions;
  isSuperAdmin: boolean;
  /** Claves de módulos visibles (las mismas que usa el menú). */
  allowedModules: string[];
};

const ORDER: PermissionLevel[] = ["None", "View", "Edit", "Approve", "Admin"];

type PermissionsContextValue = {
  permissions: EffectivePermissions | null;
  /** true si el usuario tiene al menos ese nivel en el módulo. Mientras carga, no oculta nada. */
  can: (module: string, level: PermissionLevel) => boolean;
  refresh: () => Promise<void>;
};

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: null,
  can: () => true,
  refresh: async () => undefined
});

const REFRESH_MS = 60_000;

/**
 * Permisos efectivos del usuario (perfil + excepciones), leídos del servidor. Se actualizan al
 * volver a la pestaña, así un cambio de perfil se ve sin cerrar sesión.
 */
export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, tenant, user } = useAuth();
  const [permissions, setPermissions] = useState<EffectivePermissions | null>(null);
  const lastLoad = useRef(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setPermissions(null);
      return;
    }
    try {
      lastLoad.current = Date.now();
      setPermissions(await api.getMyPermissions());
    } catch {
      // Sin permisos del servidor, la pantalla se comporta como antes (el servidor igual controla).
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh, tenant?.id, user?.id]);

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastLoad.current > REFRESH_MS) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const can = useCallback((module: string, level: PermissionLevel) => {
    if (!permissions) return true;
    if (permissions.isSuperAdmin) return true;
    return ORDER.indexOf(permissions.modules[module] ?? "None") >= ORDER.indexOf(level);
  }, [permissions]);

  return <PermissionsContext.Provider value={{ permissions, can, refresh }}>{children}</PermissionsContext.Provider>;
};

export const usePermissions = () => useContext(PermissionsContext);

/** Atajo: ¿puede este usuario ese nivel en ese módulo? */
export const useCan = (module: string, level: PermissionLevel) => usePermissions().can(module, level);
