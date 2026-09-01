import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "../api/client";
import type { UserInfo, TenantInfo, AuthResponse } from "../api/types";

interface AuthContextType {
  user: UserInfo | null;
  tenant: TenantInfo | null;
  availableTenants: TenantInfo[];
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string, tenantId?: string) => Promise<AuthResponse>;
  applySession: (res: AuthResponse) => void;
  registerTenant: (data: { companyName: string; cuit?: string; phone?: string; adminFullName?: string; email: string; password: string }) => Promise<AuthResponse>;
  switchTenant: (tenantId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos de inactividad
const AVAILABLE_TENANTS_KEY = "leal_available_tenants";
const PREFERRED_TENANT_KEY = "leal_preferred_tenant_id";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isSessionExpiredOnLoad = () => {
    if (typeof window === "undefined") return false;
    const lastActiveStr = localStorage.getItem("leal_last_activity");
    if (!lastActiveStr) return false;
    const lastActive = Number(lastActiveStr);
    return lastActive > 0 && Date.now() - lastActive > INACTIVITY_TIMEOUT_MS;
  };

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    if (isSessionExpiredOnLoad()) {
      localStorage.removeItem("leal_token");
      localStorage.removeItem("leal_user");
      localStorage.removeItem("leal_tenant");
      localStorage.removeItem("leal_tenant_id");
      localStorage.removeItem("leal_last_activity");
      localStorage.removeItem(AVAILABLE_TENANTS_KEY);
      return null;
    }
    return localStorage.getItem("leal_token");
  });

  const [user, setUser] = useState<UserInfo | null>(() => {
    if (typeof window === "undefined" || isSessionExpiredOnLoad()) return null;
    const saved = localStorage.getItem("leal_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [tenant, setTenant] = useState<TenantInfo | null>(() => {
    if (typeof window === "undefined" || isSessionExpiredOnLoad()) return null;
    const saved = localStorage.getItem("leal_tenant");
    return saved ? JSON.parse(saved) : null;
  });

  const [availableTenants, setAvailableTenants] = useState<TenantInfo[]>(() => {
    if (typeof window === "undefined" || isSessionExpiredOnLoad()) return [];
    const saved = localStorage.getItem(AVAILABLE_TENANTS_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(true);

  // Inactivity tracking
  useEffect(() => {
    if (!token) return;

    // Set initial activity timestamp
    localStorage.setItem("leal_last_activity", Date.now().toString());

    let lastRecorded = Date.now();
    const handleUserActivity = () => {
      const now = Date.now();
      // Throttle recording to once every 10 seconds
      if (now - lastRecorded > 10000) {
        lastRecorded = now;
        localStorage.setItem("leal_last_activity", now.toString());
      }
    };

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    // Check inactivity every 20 seconds
    const interval = setInterval(() => {
      const lastActiveStr = localStorage.getItem("leal_last_activity");
      const lastActive = lastActiveStr ? Number(lastActiveStr) : Date.now();
      if (Date.now() - lastActive > INACTIVITY_TIMEOUT_MS) {
        logout();
        window.location.href = "/login?inactivity=1";
      }
    }, 20000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (token) {
      api.getMe()
        .then((res) => {
          if (res.user) {
            setUser(res.user);
            localStorage.setItem("leal_user", JSON.stringify(res.user));
          }
          if (res.tenant) {
            setTenant(res.tenant);
            localStorage.setItem("leal_tenant", JSON.stringify(res.tenant));
            localStorage.setItem("leal_tenant_id", res.tenant.id);
          }
          if (res.availableTenants) {
            setAvailableTenants(res.availableTenants);
            localStorage.setItem(AVAILABLE_TENANTS_KEY, JSON.stringify(res.availableTenants));
          }
        })
        .catch((err) => {
          if (err?.message?.includes("401") || err?.message?.includes("Unauthorized")) {
            logout();
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const applySession = (res: AuthResponse) => {
    if (!res.token || !res.user || !res.tenant) {
      return;
    }

    setToken(res.token);
    setUser(res.user);
    setTenant(res.tenant);
    setAvailableTenants(res.availableTenants || []);

    localStorage.setItem("leal_token", res.token);
    localStorage.setItem("leal_user", JSON.stringify(res.user));
    localStorage.setItem("leal_tenant", JSON.stringify(res.tenant));
    localStorage.setItem("leal_tenant_id", res.tenant.id);
    localStorage.setItem(PREFERRED_TENANT_KEY, res.tenant.id);
    localStorage.setItem(AVAILABLE_TENANTS_KEY, JSON.stringify(res.availableTenants || []));
    localStorage.setItem("leal_last_activity", Date.now().toString());
  };

  const handleAuthSuccess = applySession;

  const login = async (email: string, password: string, tenantId?: string) => {
    const res = await api.login({ email, password, tenantId });
    if (!res.requiresTenantSelection && res.token) {
      applySession(res);
    }
    return res;
  };

  const registerTenant = async (data: { companyName: string; cuit?: string; phone?: string; adminFullName?: string; email: string; password: string }) => {
    const res = await api.registerTenant(data);
    handleAuthSuccess(res);
    return res;
  };

  const switchTenant = async (tenantId: string) => {
    const res = await api.switchTenant(tenantId);
    handleAuthSuccess(res);
    window.location.href = "/";
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTenant(null);
    setAvailableTenants([]);
    localStorage.removeItem("leal_token");
    localStorage.removeItem("leal_user");
    localStorage.removeItem("leal_tenant");
    localStorage.removeItem("leal_tenant_id");
    localStorage.removeItem("leal_last_activity");
    localStorage.removeItem(AVAILABLE_TENANTS_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        availableTenants,
        token,
        isAuthenticated: Boolean(token && user),
        loading,
        login,
        applySession,
        registerTenant,
        switchTenant,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
