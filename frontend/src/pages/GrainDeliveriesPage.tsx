import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { GrainDelivery } from "../api/types";

export function GrainDeliveriesPage() {
  const [deliveries, setDeliveries] = useState<GrainDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeliveries();
  }, []);

  const loadDeliveries = async () => {
    try {
      setLoading(true);
      const res = await api.listGrainDeliveries();
      setDeliveries(res);
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
            🚚 Logística de Camiones, Balanza & CPE
          </h1>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "0.85rem" }}>
            Control de descargas con Carta de Porte Electrónica, mermas de humedad y peso neto comercial
          </p>
        </div>

        <Link to="/cereales/contratos" className="btn primary">
          + Nueva Descarga desde Contrato
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
          <p style={{ textAlign: "center", color: "var(--ink-soft)" }}>Cargando descargas de balanza...</p>
        ) : (
          <table className="table" style={{ width: "100%", fontSize: "0.86rem" }}>
            <thead>
              <tr>
                <th>N° Remito / CPE</th>
                <th>Código CTG</th>
                <th>Chapa / Acoplado</th>
                <th>Chofer</th>
                <th>Balanza (Bruto / Tara / Neto)</th>
                <th>% Humedad</th>
                <th>Neto Comercial</th>
                <th>Destino / Silo</th>
                <th>Calidad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((del) => (
                <tr key={del.id}>
                  <td>
                    <strong>{del.deliveryNumber}</strong>
                    <div><small style={{ color: "var(--ink-soft)" }}>{del.cpeNumber || "-"}</small></div>
                  </td>
                  <td>{del.ctgNumber || "-"}</td>
                  <td>
                    <strong>{del.truckPlate}</strong>
                    <div><small style={{ color: "var(--ink-soft)" }}>{del.trailerPlate || "-"}</small></div>
                  </td>
                  <td>{del.driverName || "-"}</td>
                  <td>
                    <div>Bruto: {(del.grossWeightKg / 1000).toFixed(2)} Tn</div>
                    <div>Tara: {(del.tareWeightKg / 1000).toFixed(2)} Tn</div>
                    <div><strong style={{ color: "#0d9488" }}>Neto: {(del.netWeightKg / 1000).toFixed(2)} Tn</strong></div>
                  </td>
                  <td>
                    <span style={{ color: del.humidityPercentage > 14.0 ? "#ef4444" : "var(--ink)", fontWeight: 700 }}>
                      {del.humidityPercentage}%
                    </span>
                  </td>
                  <td>
                    <strong style={{ fontSize: "1rem", color: "#0d9488" }}>
                      {del.commercialNetWeightTons.toLocaleString("es-AR")} Tn
                    </strong>
                  </td>
                  <td>{del.destinationSiloOrPort || "-"}</td>
                  <td>{del.qualityGrade}</td>
                  <td>
                    <span style={{
                      padding: "3px 8px",
                      borderRadius: "6px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      background: "rgba(16, 185, 129, 0.12)",
                      color: "#10b981"
                    }}>
                      {del.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
