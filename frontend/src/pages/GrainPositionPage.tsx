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
          <Link className="muted" to="/cereales" style={{ textDecoration: "none" }}>
            ← Tablero Granario
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>
            🌾 Posición Granaria Física & Comercial
          </h1>
          <p className="muted t-small" style={{ margin: 0 }}>
            Control de existencias, riesgo de mercado abierto y balance de granos
          </p>
        </div>
      </div>

      {loading || !data ? (
        <p className="t-center muted">Cargando posición...</p>
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
                <h3 style={{ margin: 0 }}>{pos.grainType}</h3>
                <span className="alert t-strong t-small">
                  {pos.netPositionTons >= 0 ? "Posición Long (+)" : "Posición Short (-)"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div className="card" style={{ padding: "12px" }}>
                  <div className="muted">Comprado Total</div>
                  <strong style={{ fontSize: "1.1rem" }}>{pos.buyTons.toLocaleString("es-AR")} Tn</strong>
                </div>
                <div className="card" style={{ padding: "12px" }}>
                  <div className="muted">Vendido Total</div>
                  <strong style={{ fontSize: "1.1rem" }}>{pos.sellTons.toLocaleString("es-AR")} Tn</strong>
                </div>
                <div className="card" style={{ padding: "12px" }}>
                  <div className="muted">Entregado Físico</div>
                  <strong className="t-accent" style={{ fontSize: "1.1rem" }}>{pos.deliveredTons.toLocaleString("es-AR")} Tn</strong>
                </div>
                <div className="card" style={{ padding: "12px" }}>
                  <div className="muted">Pendiente de Fijar</div>
                  <strong className="t-warn" style={{ fontSize: "1.1rem" }}>{pos.openFixationTons.toLocaleString("es-AR")} Tn</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
