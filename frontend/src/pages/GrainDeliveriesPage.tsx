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
          <Link className="muted" to="/cereales" style={{ textDecoration: "none" }}>
            ← Tablero Granario
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>
            🚚 Logística de Camiones, Balanza & CPE
          </h1>
          <p className="muted t-small" style={{ margin: 0 }}>
            Control de descargas con Carta de Porte Electrónica, mermas de humedad y peso neto comercial
          </p>
        </div>

        <Link to="/cereales/contratos" className="btn primary">
          + Nueva Descarga desde Contrato
        </Link>
      </div>

      <div style={{
        background: "var(--lc-canvas)",
        border: "1px solid var(--lc-line)",
        borderRadius: "20px",
        padding: "20px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
      }}>
        {loading ? (
          <p className="t-center muted">Cargando descargas de balanza...</p>
        ) : (
          <table className="table">
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
                    <div><small className="muted">{del.cpeNumber || "-"}</small></div>
                  </td>
                  <td>{del.ctgNumber || "-"}</td>
                  <td>
                    <strong>{del.truckPlate}</strong>
                    <div><small className="muted">{del.trailerPlate || "-"}</small></div>
                  </td>
                  <td>{del.driverName || "-"}</td>
                  <td>
                    <div>Bruto: {(del.grossWeightKg / 1000).toFixed(2)} Tn</div>
                    <div>Tara: {(del.tareWeightKg / 1000).toFixed(2)} Tn</div>
                    <div><strong className="t-accent">Neto: {(del.netWeightKg / 1000).toFixed(2)} Tn</strong></div>
                  </td>
                  <td>
                    <span className="t-strong" style={{ color: del.humidityPercentage > 14.0 ? "#ef4444" : "var(--lc-ink)" }}>
                      {del.humidityPercentage}%
                    </span>
                  </td>
                  <td>
                    <strong className="t-accent">
                      {del.commercialNetWeightTons.toLocaleString("es-AR")} Tn
                    </strong>
                  </td>
                  <td>{del.destinationSiloOrPort || "-"}</td>
                  <td>{del.qualityGrade}</td>
                  <td>
                    <span className="t-small t-strong t-ok" style={{ padding: "3px 8px", borderRadius: "6px", background: "rgba(16, 185, 129, 0.12)" }}>
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
