import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { GrainDashboardData } from "../api/types";

export function GrainsDashboardPage() {
  const [data, setData] = useState<GrainDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getGrainDashboard();
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar datos del tablero granario.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page" style={{ padding: "32px" }}>
        <div className="t-center" style={{ padding: "60px 0" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "16px" }}>🌾</div>
          <p className="muted t-strong">Cargando Tablero Ejecutivo de Cereales y Corretaje...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page" style={{ padding: "32px" }}>
        <div className="card t-center" style={{ padding: "24px" }}>
          <p className="t-danger t-strong">⚠️ {error || "No se pudieron cargar los datos."}</p>
          <button className="btn primary" onClick={loadDashboard} style={{ marginTop: "12px" }}>Reintentar</button>
        </div>
      </div>
    );
  }

  const deliveryProgress = data.totalContractedTons > 0
    ? Math.round((data.totalDeliveredTons / data.totalContractedTons) * 100)
    : 0;

  const fixationProgress = data.totalContractedTons > 0
    ? Math.round((data.totalFixedTons / data.totalContractedTons) * 100)
    : 0;

  return (
    <div className="page" style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Banner */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "16px",
        background: "linear-gradient(135deg, rgba(217, 119, 6, 0.15) 0%, rgba(180, 83, 9, 0.05) 100%)",
        border: "1px solid rgba(245, 158, 11, 0.3)",
        borderRadius: "20px",
        padding: "24px 28px",
        backdropFilter: "blur(12px)"
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span className="t-xl">🌾</span>
            <h1 style={{ margin: 0 }}>
              Tablero Granario & Corretaje
            </h1>
            <span className="t-small t-strong" style={{ background: "linear-gradient(135deg, var(--lc-warn), var(--lc-warn))", color: "#fff", padding: "3px 10px", borderRadius: "12px" }}>
              Campaña 2025/2026
            </span>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Control de contratos, fijaciones de precio, logística de camiones CPE y comisiones de corretaje.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link to="/cereales/contratos/nuevo" className="btn primary">
            + Nuevo Contrato
          </Link>
          <Link to="/cereales/fijaciones" className="btn secondary">
            ⚖️ Fijar Precio
          </Link>
          <Link to="/cereales/entregas" className="btn secondary">
            🚚 Balanza & CPE
          </Link>
        </div>
      </div>

      {/* Live Market Pizarra Ticker */}
      {data.marketPrices && data.marketPrices.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px"
        }}>
          {data.marketPrices.map((p) => {
            const isPositive = p.dailyVariationPercentage >= 0;
            return (
              <div
                key={p.id}
                style={{
                  background: "var(--surface-canvas)",
                  border: "1px solid var(--surface-border)",
                  borderRadius: "14px",
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                }}
              >
                <div>
                  <div className="t-small muted t-strong">
                    {p.market}
                  </div>
                  <div className="t-strong" style={{ fontSize: "1.05rem" }}>
                    {p.grainType}
                  </div>
                </div>
                <div className="t-right">
                  <div style={{ fontSize: "1.15rem", fontWeight: 900 }}>
                    {p.currency} {p.settlementPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="t-small t-strong" style={{ color: isPositive ? "var(--lc-ok)" : "var(--lc-danger)" }}>
                    {isPositive ? "▲ +" : "▼ "}
                    {p.dailyVariationPercentage}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4 Core KPI Metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "16px"
      }}>
        {/* Card 1: Volumen Contratado */}
        <div style={{
          background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.02) 100%)",
          border: "1px solid rgba(245, 158, 11, 0.25)",
          borderRadius: "18px",
          padding: "20px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span className="t-small t-strong muted t-caps">
              Total Contratado
            </span>
            <span style={{ fontSize: "1.3rem" }}>📋</span>
          </div>
          <div style={{ fontSize: "1.85rem", fontWeight: 900 }}>
            {data.totalContractedTons.toLocaleString("es-AR")} <span className="muted">Tn</span>
          </div>
          <div className="t-small muted" style={{ marginTop: "6px" }}>
            {data.activeContractsCount} contratos activos en cartera
          </div>
        </div>

        {/* Card 2: Entregado vs Pendiente */}
        <div style={{
          background: "linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(13, 148, 136, 0.02) 100%)",
          border: "1px solid rgba(13, 148, 136, 0.25)",
          borderRadius: "18px",
          padding: "20px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span className="t-small t-strong muted t-caps">
              Entregas Físicas
            </span>
            <span style={{ fontSize: "1.3rem" }}>🚚</span>
          </div>
          <div className="t-accent" style={{ fontSize: "1.85rem", fontWeight: 900 }}>
            {data.totalDeliveredTons.toLocaleString("es-AR")} <span className="muted">Tn</span>
          </div>
          <div style={{ marginTop: "8px", width: "100%", background: "rgba(0,0,0,0.1)", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${deliveryProgress}%`, background: "var(--lc-accent)", height: "100%" }} />
          </div>
          <div className="t-small muted" style={{ marginTop: "6px", display: "flex", justifyContent: "space-between" }}>
            <span>{deliveryProgress}% cumplido</span>
            <span>{data.totalPendingTons.toLocaleString("es-AR")} Tn pend.</span>
          </div>
        </div>

        {/* Card 3: Fijaciones de Precio */}
        <div style={{
          background: "linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.02) 100%)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: "18px",
          padding: "20px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span className="t-small t-strong muted t-caps">
              Precio Fijado
            </span>
            <span style={{ fontSize: "1.3rem" }}>⚖️</span>
          </div>
          <div className="t-info" style={{ fontSize: "1.85rem", fontWeight: 900 }}>
            {data.totalFixedTons.toLocaleString("es-AR")} <span className="muted">Tn</span>
          </div>
          <div style={{ marginTop: "8px", width: "100%", background: "rgba(0,0,0,0.1)", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${fixationProgress}%`, background: "var(--lc-info)", height: "100%" }} />
          </div>
          <div className="t-small muted" style={{ marginTop: "6px", display: "flex", justifyContent: "space-between" }}>
            <span>{fixationProgress}% con precio cerrado</span>
            <span>{(data.totalContractedTons - data.totalFixedTons).toLocaleString("es-AR")} Tn a fijar</span>
          </div>
        </div>

        {/* Card 4: Comisiones Corretaje */}
        <div style={{
          background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)",
          border: "1px solid rgba(16, 185, 129, 0.25)",
          borderRadius: "18px",
          padding: "20px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span className="t-small t-strong muted t-caps">
              Comisiones de Corretaje
            </span>
            <span style={{ fontSize: "1.3rem" }}>💰</span>
          </div>
          <div className="t-ok" style={{ fontSize: "1.85rem", fontWeight: 900 }}>
            USD {data.totalBrokerageEarnedUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
          <div className="t-small muted" style={{ marginTop: "6px" }}>
            Intermediación y liquidaciones pactadas
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px", alignItems: "start" }}>
        {/* Left Column: Posición Granaria por Cereal */}
        <div style={{
          background: "var(--surface-canvas)",
          border: "1px solid var(--surface-border)",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 style={{ margin: 0 }}>🌾 Posición Granaria & Stock</h2>
              <p className="t-small muted" style={{ margin: 0 }}>Distribución física y comercial por cultivo</p>
            </div>
            <Link className="t-small t-strong t-warn" to="/cereales/posicion" style={{ textDecoration: "none" }}>
              Ver desglose completo →
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {data.positionSummary.map((pos) => {
              const maxTons = Math.max(...data.positionSummary.map(p => p.totalTons), 1);
              const barWidth = Math.round((pos.totalTons / maxTons) * 100);

              return (
                <div key={pos.grainType} style={{
                  padding: "14px 16px",
                  borderRadius: "14px",
                  background: "var(--surface-muted)",
                  border: "1px solid var(--surface-border)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="t-strong">{pos.grainType}</span>
                    </div>
                    <div className="t-strong">
                      {pos.totalTons.toLocaleString("es-AR")} <span className="t-small muted">Tn</span>
                    </div>
                  </div>

                  <div style={{ width: "100%", background: "rgba(0,0,0,0.06)", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "10px" }}>
                    <div style={{
                      width: `${barWidth}%`,
                      background: pos.grainType === "Soja" ? "#10b981" : pos.grainType === "Maíz" ? "#f59e0b" : pos.grainType === "Trigo" ? "#eab308" : "#8b5cf6",
                      height: "100%"
                    }} />
                  </div>

                  <div className="t-small muted" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                    <div>
                      <span>Entregado:</span> <strong>{pos.deliveredTons.toLocaleString("es-AR")} Tn</strong>
                    </div>
                    <div>
                      <span>A Fijar:</span> <strong className="t-warn">{pos.openFixationTons.toLocaleString("es-AR")} Tn</strong>
                    </div>
                    <div>
                      <span>Posición Neta:</span> <strong style={{ color: pos.netPositionTons >= 0 ? "var(--lc-ok)" : "var(--lc-danger)" }}>
                        {pos.netPositionTons > 0 ? "+" : ""}{pos.netPositionTons.toLocaleString("es-AR")} Tn
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Contratos Recientes */}
        <div style={{
          background: "var(--surface-canvas)",
          border: "1px solid var(--surface-border)",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h2 style={{ margin: 0 }}>📋 Contratos en Ejecución</h2>
              <p className="t-small muted" style={{ margin: 0 }}>Últimos compromisos pactados</p>
            </div>
            <Link className="t-small t-strong t-warn" to="/cereales/contratos" style={{ textDecoration: "none" }}>
              Ver todos ({data.recentContracts.length}) →
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {data.recentContracts.map((c) => {
              const prog = c.totalTons > 0 ? Math.round((c.deliveredTons / c.totalTons) * 100) : 0;
              return (
                <Link
                  key={c.id}
                  to={`/cereales/contratos/${c.id}`}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--surface-border)",
                    textDecoration: "none",
                    color: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    transition: "transform 0.15s, border-color 0.15s"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="t-strong t-small t-warn">
                      {c.contractNumber}
                    </span>
                    <span className="t-small t-strong" style={{ padding: "2px 8px", borderRadius: "6px", background: c.pricingMode === "PrecioHecho" ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)", color: c.pricingMode === "PrecioHecho" ? "#10b981" : "#d97706" }}>
                      {c.pricingMode === "PrecioHecho" ? "Fijo" : "A Fijar"}
                    </span>
                  </div>

                  <div className="t-small">
                    <strong>{c.sellerName}</strong> → {c.buyerName}
                  </div>

                  <div className="t-small muted" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{c.grainType} · {c.totalTons.toLocaleString("es-AR")} Tn @ {c.currency} {c.pricePerTon}</span>
                    <span className="t-strong" style={{ color: prog === 100 ? "#10b981" : "var(--ink)" }}>
                      {c.deliveredTons.toLocaleString("es-AR")} Tn ({prog}%)
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

      </div>

      {/* Bottom Section: Últimas Descargas en Balanza con CPE */}
      {data.recentDeliveries && data.recentDeliveries.length > 0 && (
        <div style={{
          background: "var(--surface-canvas)",
          border: "1px solid var(--surface-border)",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ margin: 0 }}>🚚 Últimas Descargas de Camiones (CPE & Balanza)</h2>
              <p className="t-small muted" style={{ margin: 0 }}>Pesaje bruto, tara, mermas y calidad de entrega</p>
            </div>
            <Link className="t-small t-strong t-warn" to="/cereales/entregas" style={{ textDecoration: "none" }}>
              Ver todas las entregas →
            </Link>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>N° Remito / CPE</th>
                  <th>Chapa / Acoplado</th>
                  <th>Chofer</th>
                  <th>Balanza (Bruto / Tara)</th>
                  <th>Humedad</th>
                  <th>Neto Comercial</th>
                  <th>Destino / Silo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.recentDeliveries.map((del) => (
                  <tr key={del.id}>
                    <td>
                      <div className="t-strong">{del.deliveryNumber}</div>
                      <small className="muted">{del.cpeNumber || "-"}</small>
                    </td>
                    <td>
                      <div><strong>{del.truckPlate}</strong></div>
                      <small className="muted">{del.trailerPlate || "-"}</small>
                    </td>
                    <td>{del.driverName || "-"}</td>
                    <td>
                      <div>{(del.grossWeightKg / 1000).toFixed(2)} Tn / {(del.tareWeightKg / 1000).toFixed(2)} Tn</div>
                      <small className="muted">Neto: {(del.netWeightKg / 1000).toFixed(2)} Tn</small>
                    </td>
                    <td>
                      <span className="t-strong" style={{ color: del.humidityPercentage > 14.0 ? "#ef4444" : "var(--ink)" }}>
                        {del.humidityPercentage}%
                      </span>
                    </td>
                    <td>
                      <strong className="t-accent">
                        {del.commercialNetWeightTons.toLocaleString("es-AR")} Tn
                      </strong>
                    </td>
                    <td>{del.destinationSiloOrPort || "-"}</td>
                    <td>
                      <span className="t-small t-strong t-ok" style={{ padding: "3px 8px", borderRadius: "6px", background: "rgba(16, 185, 129, 0.12)" }}>
                        {del.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
