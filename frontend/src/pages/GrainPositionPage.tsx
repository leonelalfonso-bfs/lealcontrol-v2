import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { GrainDashboardData } from "../api/types";

export function GrainPositionPage() {
  const [data, setData] = useState<GrainDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getGrainDashboard();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Link to="/cereales" style={{ textDecoration: "none", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
            ← Tablero Granario
          </Link>
          <h1 style={{ margin: "4px 0 0", fontSize: "1.5rem", fontWeight: 800 }}>
            🌾 Posición Granaria Física & Comercial
          </h1>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "0.85rem" }}>
            Control de existencias, riesgo de mercado abierto y balance de granos
          </p>
        </div>
      </div>

      {loading || !data ? (
        <p style={{ textAlign: "center", color: "var(--ink-soft)" }}>Cargando posición...</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
          {data.positionSummary.map((pos) => (
            <div
              key={pos.grainType}
              style={{
                background: "var(--surface-canvas)",
                border: "1px solid var(--surface-border)",
                borderRadius: "20px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>{pos.grainType}</h3>
                <span style={{
                  padding: "4px 10px",
                  borderRadius: "8px",
                  fontWeight: 800,
                  fontSize: "0.8rem",
                  background: pos.netPositionTons >= 0 ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: pos.netPositionTons >= 0 ? "#10b981" : "#ef4444"
                }}>
                  {pos.netPositionTons >= 0 ? "Posición Long (+)" : "Posición Short (-)"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.86rem" }}>
                <div className="card" style={{ padding: "12px" }}>
                  <div style={{ color: "var(--ink-soft)" }}>Comprado Total</div>
                  <strong style={{ fontSize: "1.1rem" }}>{pos.buyTons.toLocaleString("es-AR")} Tn</strong>
                </div>
                <div className="card" style={{ padding: "12px" }}>
                  <div style={{ color: "var(--ink-soft)" }}>Vendido Total</div>
                  <strong style={{ fontSize: "1.1rem" }}>{pos.sellTons.toLocaleString("es-AR")} Tn</strong>
                </div>
                <div className="card" style={{ padding: "12px" }}>
                  <div style={{ color: "var(--ink-soft)" }}>Entregado Físico</div>
                  <strong style={{ fontSize: "1.1rem", color: "#0d9488" }}>{pos.deliveredTons.toLocaleString("es-AR")} Tn</strong>
                </div>
                <div className="card" style={{ padding: "12px" }}>
                  <div style={{ color: "var(--ink-soft)" }}>Pendiente de Fijar</div>
                  <strong style={{ fontSize: "1.1rem", color: "#d97706" }}>{pos.openFixationTons.toLocaleString("es-AR")} Tn</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
