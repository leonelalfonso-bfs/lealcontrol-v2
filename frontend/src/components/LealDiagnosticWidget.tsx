import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { automationApi, type DiagnosticItem, type LealDiagnosticReport } from "../api/automationApi";

export function LealDiagnosticWidget() {
  const [report, setReport] = useState<LealDiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostic = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await automationApi.getDiagnostic();
      setReport(data);
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar el diagnóstico inteligente.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDiagnostic();
  }, []);

  const getLevelStyle = (level: string) => {
    switch (level) {
      case "critical":
        return {
          icon: "🔴",
          badgeBg: "#fef2f2",
          badgeText: "#b91c1c",
          badgeBorder: "#fca5a5",
          btnBg: "#dc2626"
        };
      case "warning":
        return {
          icon: "🟠",
          badgeBg: "#fff7ed",
          badgeText: "#c2410c",
          badgeBorder: "#fdba74",
          btnBg: "#ea580c"
        };
      case "info":
        return {
          icon: "🟡",
          badgeBg: "#fefce8",
          badgeText: "#854d0e",
          badgeBorder: "#fde047",
          btnBg: "#d97706"
        };
      default:
        return {
          icon: "🟢",
          badgeBg: "#ecfdf5",
          badgeText: "#047857",
          badgeBorder: "#6ee7b7",
          btnBg: "#059669"
        };
    }
  };

  return (
    <div style={{
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      borderRadius: "16px",
      color: "#ffffff",
      padding: "24px",
      marginBottom: "24px",
      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.15)",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Background subtle glow decoration */}
      <div style={{
        position: "absolute",
        top: "-80px",
        right: "-80px",
        width: "240px",
        height: "240px",
        background: "radial-gradient(circle, rgba(13, 148, 136, 0.25) 0%, rgba(13, 148, 136, 0) 70%)",
        borderRadius: "50%",
        pointerEvents: "none"
      }} />

      {/* Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px", marginBottom: "18px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "1.4rem" }}>✨</span>
            <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 900, letterSpacing: "-0.02em", color: "#f8fafc" }}>
              LEAL Diagnóstico
            </h2>
            <span style={{
              background: "rgba(13, 148, 136, 0.2)",
              color: "#2dd4bf",
              border: "1px solid rgba(45, 212, 191, 0.4)",
              padding: "3px 10px",
              borderRadius: "20px",
              fontSize: "0.75rem",
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px"
            }}>
              ● Copiloto Inteligente Activo
            </span>
          </div>
          <p style={{ margin: "6px 0 0 0", fontSize: "0.95rem", color: "#94a3b8" }}>
            {report?.greeting || "Buenos días, Leonel"} • {report?.summary || "Analizando el pulso operativo y financiero de tu empresa..."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchDiagnostic(true)}
          disabled={loading || refreshing}
          className="btn"
          style={{
            background: refreshing ? "rgba(255,255,255,0.1)" : "rgba(255, 255, 255, 0.12)",
            color: "#ffffff",
            border: "1px solid rgba(255,255,255,0.2)",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          {refreshing ? "⏳ Analizando empresa..." : "⚡ Actualizar Diagnóstico"}
        </button>
      </div>

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", color: "#fca5a5", padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem", marginBottom: "16px" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !report && (
        <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
          <div style={{ fontSize: "1.8rem", marginBottom: "8px" }}>🔍</div>
          <div>Escaneando facturas, clientes, parque de balanzas, inventario y cotizaciones...</div>
        </div>
      )}

      {/* Diagnostics Grid */}
      {report && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px" }}>
          {report.items.map((item) => {
            const style = getLevelStyle(item.level);
            return (
              <div
                key={item.id}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  backdropFilter: "blur(6px)",
                  transition: "transform 0.15s ease, border-color 0.15s ease",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: style.badgeBg,
                      color: style.badgeText,
                      border: `1px solid ${style.badgeBorder}`
                    }}>
                      {item.category}
                    </span>
                    <span style={{ fontSize: "0.9rem" }}>{style.icon}</span>
                  </div>

                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#f8fafc", marginBottom: "6px", lineHeight: "1.3" }}>
                    {item.title}
                  </div>

                  <div style={{ fontSize: "0.82rem", color: "#cbd5e1", lineHeight: "1.4", marginBottom: "12px" }}>
                    {item.description}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600 }}>
                    💡 {item.impact}
                  </span>
                  <Link
                    to={item.actionUrl}
                    style={{
                      background: style.btnBg,
                      color: "#ffffff",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      textDecoration: "none",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {item.actionLabel} →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
