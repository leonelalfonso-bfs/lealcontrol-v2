import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--lc-canvas, var(--lc-ink))", color: "var(--lc-ink, #fff)" }}>
        <div className="t-center">
          <div className="t-xl" style={{ marginBottom: "12px" }}>⚖️</div>
          <strong>Cargando LEAL Control ERP...</strong>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
