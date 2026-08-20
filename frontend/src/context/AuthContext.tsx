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
  registerTenant: (data: { companyName: string; cuit?: string; phone?: string; adminFullName?: string; email: string; password: string }) => Promise<AuthResponse>;
  switchTenant: (tenantId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("leal_user") : null;
    return saved ? JSON.parse(saved) : null;
  });
  const [tenant, setTenant] = useState<TenantInfo | null>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("leal_tenant") : null;
    return saved ? JSON.parse(saved) : null;
  });
  const [availableTenants, setAvailableTenants] = useState<TenantInfo[]>([]);
  const [token, setToken] = useState<string | null>(() => (typeof window !== "undefined" ? localStorage.getItem("leal_token") : null));
  const [loading, setLoading] = useState(true);

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
          }
        })
        .catch(() => {
          // Keep local storage session if offline
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const handleAuthSuccess = (res: AuthResponse) => {
    setToken(res.token);
    setUser(res.user);
    setTenant(res.tenant);
    setAvailableTenants(res.availableTenants || []);

    localStorage.setItem("leal_token", res.token);
    localStorage.setItem("leal_user", JSON.stringify(res.user));
    localStorage.setItem("leal_tenant", JSON.stringify(res.tenant));
    localStorage.setItem("leal_tenant_id", res.tenant.id);
  };

  const login = async (email: string, password: string, tenantId?: string) => {
    const res = await api.login({ email, password, tenantId });
    handleAuthSuccess(res);
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
    localStorage.removeItem("leal_token");
    localStorage.removeItem("leal_user");
    localStorage.removeItem("leal_tenant");
    localStorage.removeItem("leal_tenant_id");
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
