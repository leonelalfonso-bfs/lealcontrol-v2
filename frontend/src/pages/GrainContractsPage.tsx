import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { GrainContract } from "../api/types";

export function GrainContractsPage() {
  const [contracts, setContracts] = useState<GrainContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedGrain, setSelectedGrain] = useState("all");
  const [selectedPricing, setSelectedPricing] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  useEffect(() => {
    loadContracts();
  }, [search, selectedGrain, selectedPricing, selectedStatus]);

  const loadContracts = async () => {
    try {
      setLoading(true);
      const res = await api.listGrainContracts({
        search: search || undefined,
        grainType: selectedGrain,
        pricingMode: selectedPricing,
        status: selectedStatus
      });
      setContracts(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Link to="/cereales" style={{ textDecoration: "none", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
              ← Tablero Granario
            </Link>
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: "1.5rem", fontWeight: 800, color: "var(--ink)" }}>
            📋 Contratos de Granos
          </h1>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "0.85rem" }}>
            Gestión de compra/venta a fijar, precio hecho y canje agropecuario
          </p>
        </div>

        <Link
          to="/cereales/contratos/nuevo"
          className="btn primary"
          style={{
            background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
            color: "#ffffff",
            fontWeight: 700,
            border: "none",
            boxShadow: "0 4px 12px rgba(217, 119, 6, 0.3)"
          }}
        >
          + Nuevo Contrato de Granos
        </Link>
      </div>

      {/* Filters Bar */}
      <div style={{
        background: "var(--surface-canvas)",
        border: "1px solid var(--surface-border)",
        borderRadius: "16px",
        padding: "16px 20px",
        display: "grid",
        gridTemplateColumns: "1.5fr repeat(3, 1fr)",
        gap: "12px",
        alignItems: "center"
      }}>
        <input
          type="text"
          className="input"
          placeholder="Buscar por N° de contrato, productor, comprador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select className="input" value={selectedGrain} onChange={(e) => setSelectedGrain(e.target.value)}>
          <option value="all">🌾 Todos los granos</option>
          <option value="Soja">Soja</option>
          <option value="Maíz">Maíz</option>
          <option value="Trigo">Trigo</option>
          <option value="Girasol">Girasol</option>
          <option value="Cebada">Cebada</option>
          <option value="Sorgo">Sorgo</option>
        </select>

        <select className="input" value={selectedPricing} onChange={(e) => setSelectedPricing(e.target.value)}>
          <option value="all">⚖️ Toda modalidad</option>
          <option value="PrecioHecho">Precio Hecho / Fijo</option>
          <option value="AFijar">A Fijar (Pizarra)</option>
          <option value="Canje">Canje de Insumos</option>
        </select>

        <select className="input" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
          <option value="all">📌 Todos los estados</option>
          <option value="Activo">Activo</option>
          <option value="Cumplido">Cumplido</option>
          <option value="Cancelado">Cancelado</option>
        </select>
      </div>

      {/* Contracts Table */}
      <div style={{
        background: "var(--surface-canvas)",
        border: "1px solid var(--surface-border)",
        borderRadius: "20px",
        padding: "20px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
      }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <p style={{ color: "var(--ink-soft)" }}>Cargando contratos...</p>
          </div>
        ) : contracts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <span style={{ fontSize: "2rem" }}>🌾</span>
            <p style={{ fontWeight: 700, marginTop: "8px" }}>No se encontraron contratos con los filtros aplicados.</p>
            <Link to="/cereales/contratos/nuevo" className="btn primary" style={{ marginTop: "8px" }}>
              Crear primer contrato
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: "0.86rem" }}>
              <thead>
                <tr>
                  <th>N° Contrato</th>
                  <th>Cereal / Campaña</th>
                  <th>Modalidad</th>
                  <th>Productor (Vendedor)</th>
                  <th>Comprador (Destino)</th>
                  <th>Tn Totales</th>
                  <th>Progreso Entrega</th>
                  <th>Fijado</th>
                  <th>Comisión</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const prog = c.totalTons > 0 ? Math.round((c.deliveredTons / c.totalTons) * 100) : 0;
                  const fixProg = c.totalTons > 0 ? Math.round((c.fixedTons / c.totalTons) * 100) : 0;

                  return (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/cereales/contratos/${c.id}`} style={{ fontWeight: 800, color: "#d97706", textDecoration: "none" }}>
                          {c.contractNumber}
                        </Link>
                        <div><small style={{ color: "var(--ink-soft)" }}>{new Date(c.createdAtUtc).toLocaleDateString("es-AR")}</small></div>
                      </td>
                      <td>
                        <strong>{c.grainType}</strong>
                        <div><small style={{ color: "var(--ink-soft)" }}>{c.harvest}</small></div>
                      </td>
                      <td>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          background: c.pricingMode === "PrecioHecho" ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
                          color: c.pricingMode === "PrecioHecho" ? "#10b981" : "#d97706"
                        }}>
                          {c.pricingMode === "PrecioHecho" ? "Fijo" : "A Fijar"}
                        </span>
                        <div><small style={{ color: "var(--ink-soft)" }}>{c.currency} {c.pricePerTon}</small></div>
                      </td>
                      <td>
                        <strong>{c.sellerName}</strong>
                      </td>
                      <td>
                        <div>{c.buyerName}</div>
                        <small style={{ color: "var(--ink-soft)" }}>Puerto: {c.deliveryPort || "Rosario"}</small>
                      </td>
                      <td>
                        <strong>{c.totalTons.toLocaleString("es-AR")} Tn</strong>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "60px", background: "rgba(0,0,0,0.1)", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${prog}%`, background: "#0d9488", height: "100%" }} />
                          </div>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>{prog}%</span>
                        </div>
                        <small style={{ color: "var(--ink-soft)" }}>{c.deliveredTons.toLocaleString("es-AR")} Tn</small>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "60px", background: "rgba(0,0,0,0.1)", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${fixProg}%`, background: "#2563eb", height: "100%" }} />
                          </div>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>{fixProg}%</span>
                        </div>
                        <small style={{ color: "var(--ink-soft)" }}>{c.fixedTons.toLocaleString("es-AR")} Tn</small>
                      </td>
                      <td>
                        <strong style={{ color: "#10b981" }}>USD {c.brokerCommissionAmount.toLocaleString("es-AR")}</strong>
                        <div><small style={{ color: "var(--ink-soft)" }}>({c.brokerCommissionPercentage}%)</small></div>
                      </td>
                      <td>
                        <Link to={`/cereales/contratos/${c.id}`} className="btn secondary" style={{ fontSize: "0.76rem", padding: "4px 10px" }}>
                          Ver Ficha
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
