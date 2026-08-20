import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { GrainMarketPrice } from "../api/types";

export function GrainFixationsPage() {
  const [prices, setPrices] = useState<GrainMarketPrice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrices();
  }, []);

  const loadPrices = async () => {
    try {
      setLoading(true);
      const res = await api.listGrainMarketPrices();
      setPrices(res);
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
            ⚖️ Pizarra de Cotizaciones & Fijaciones
          </h1>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "0.85rem" }}>
            Precios de referencia de cámaras arbitrales de Rosario, Buenos Aires y Bahía Blanca
          </p>
        </div>

        <Link to="/cereales/contratos" className="btn primary">
          Ir a Contratos para Fijar
        </Link>
      </div>

      <div style={{
        background: "var(--surface-canvas)",
        border: "1px solid var(--surface-border)",
        borderRadius: "20px",
        padding: "20px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
      }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "var(--ink-soft)" }}>Cargando cotizaciones...</p>
        ) : (
          <table className="table" style={{ width: "100%", fontSize: "0.88rem" }}>
            <thead>
              <tr>
                <th>Cereal / Cultivo</th>
                <th>Mercado / Cámara</th>
                <th>Fecha de Cotización</th>
                <th>Precio Ajuste / Cierre</th>
                <th>Rango (Mín / Máx)</th>
                <th>Variación Diaria</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => {
                const isPos = p.dailyVariationPercentage >= 0;
                return (
                  <tr key={p.id}>
                    <td><strong>{p.grainType}</strong></td>
                    <td>{p.market}</td>
                    <td>{new Date(p.priceDate).toLocaleDateString("es-AR")}</td>
                    <td>
                      <strong style={{ fontSize: "1.05rem" }}>
                        {p.currency} {p.settlementPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </strong>
                    </td>
                    <td>
                      {p.minPrice && p.maxPrice
                        ? `${p.minPrice} - ${p.maxPrice}`
                        : "-"}
                    </td>
                    <td>
                      <span style={{
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontWeight: 800,
                        fontSize: "0.78rem",
                        background: isPos ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                        color: isPos ? "#10b981" : "#ef4444"
                      }}>
                        {isPos ? "▲ +" : "▼ "}{p.dailyVariationPercentage}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
