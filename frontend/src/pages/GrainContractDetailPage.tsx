import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import type { GrainContract, GrainPriceFixation, GrainDelivery } from "../api/types";

export function GrainContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{
    contract: GrainContract;
    fixations: GrainPriceFixation[];
    deliveries: GrainDelivery[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"resumen" | "entregas" | "fijaciones">("resumen");

  // Fixation modal state
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixTons, setFixTons] = useState(100);
  const [fixPrice, setFixPrice] = useState(318.5);
  const [fixNotes, setFixNotes] = useState("");
  const [savingFix, setSavingFix] = useState(false);

  // Delivery modal state
  const [showDelModal, setShowDelModal] = useState(false);
  const [delForm, setDelForm] = useState({
    cpeNumber: "",
    ctgNumber: "",
    truckPlate: "",
    trailerPlate: "",
    driverName: "",
    grossWeightKg: 45000,
    tareWeightKg: 15000,
    humidityPercentage: 13.5,
    foreignMatterPercentage: 0.8,
    damagedPercentage: 1.0,
    destinationSiloOrPort: "Puerto San Martín"
  });
  const [savingDel, setSavingDel] = useState(false);

  useEffect(() => {
    if (id) loadDetail();
  }, [id]);

  const loadDetail = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await api.getGrainContract(id);
      setData(res);
      if (res.contract) {
        setFixPrice(res.contract.pricePerTon || 318.5);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFixation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !data) return;
    try {
      setSavingFix(true);
      await api.createGrainFixation({
        contractId: id,
        fixedTons: parseInt(fixTons.toString(), 10) || 1,
        pricePerTon: parseFloat(fixPrice.toString()) || 0,
        currency: data.contract.currency,
        notes: fixNotes
      });
      setShowFixModal(false);
      setFixNotes("");
      loadDetail();
    } catch (err) {
      alert("Error al fijar precio");
    } finally {
      setSavingFix(false);
    }
  };

  const handleCreateDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      setSavingDel(true);
      await api.createGrainDelivery({
        contractId: id,
        ...delForm
      });
      setShowDelModal(false);
      loadDetail();
    } catch (err) {
      alert("Error al registrar descarga en balanza");
    } finally {
      setSavingDel(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="page" style={{ padding: "32px", textAlign: "center" }}>
        <p style={{ color: "var(--ink-soft)" }}>Cargando ficha del contrato granario...</p>
      </div>
    );
  }

  const { contract, fixations, deliveries } = data;
  const delProg = contract.totalTons > 0 ? Math.round((contract.deliveredTons / contract.totalTons) * 100) : 0;
  const fixProg = contract.totalTons > 0 ? Math.round((contract.fixedTons / contract.totalTons) * 100) : 0;

  return (
    <div className="page" style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Top Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <Link to="/cereales/contratos" style={{ textDecoration: "none", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
            ← Volver a Contratos
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>
              {contract.contractNumber}
            </h1>
            <span style={{
              background: contract.pricingMode === "PrecioHecho" ? "rgba(16, 185, 129, 0.12)" : "rgba(245, 158, 11, 0.12)",
              color: contract.pricingMode === "PrecioHecho" ? "#10b981" : "#d97706",
              padding: "4px 12px",
              borderRadius: "8px",
              fontWeight: 800,
              fontSize: "0.8rem"
            }}>
              {contract.pricingMode === "PrecioHecho" ? "Precio Fijo" : "A Fijar (Pizarra)"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          {contract.pricingMode === "AFijar" && (
            <button
              className="btn primary"
              onClick={() => setShowFixModal(true)}
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#ffffff",
                fontWeight: 700,
                border: "none"
              }}
            >
              ⚖️ Registrar Fijación
            </button>
          )}

          <button
            className="btn primary"
            onClick={() => setShowDelModal(true)}
            style={{
              background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
              color: "#ffffff",
              fontWeight: 700,
              border: "none"
            }}
          >
            🚚 Registrar Balanza / CPE
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
        <div className="card" style={{ padding: "16px" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", fontWeight: 700 }}>CULTIVO & CAMPAÑA</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 800 }}>{contract.grainType}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>Campaña {contract.harvest}</div>
        </div>

        <div className="card" style={{ padding: "16px" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", fontWeight: 700 }}>VOLUMEN TOTAL</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 800 }}>{contract.totalTons.toLocaleString("es-AR")} Tn</div>
          <div style={{ fontSize: "0.8rem", color: "#0d9488" }}>{contract.deliveredTons.toLocaleString("es-AR")} Tn entregadas ({delProg}%)</div>
        </div>

        <div className="card" style={{ padding: "16px" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", fontWeight: 700 }}>PRECIO / BASE</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 800 }}>{contract.currency} {contract.pricePerTon.toLocaleString("es-AR")}</div>
          <div style={{ fontSize: "0.8rem", color: "#2563eb" }}>{contract.fixedTons.toLocaleString("es-AR")} Tn fijadas ({fixProg}%)</div>
        </div>

        <div className="card" style={{ padding: "16px" }}>
          <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", fontWeight: 700 }}>COMISIÓN CORRETAJE</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#10b981" }}>USD {contract.brokerCommissionAmount.toLocaleString("es-AR")}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>Tasa: {contract.brokerCommissionPercentage}%</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--surface-border)", paddingBottom: "8px" }}>
        <button
          className={`btn ${activeTab === "resumen" ? "primary" : "secondary"}`}
          onClick={() => setActiveTab("resumen")}
          style={{ fontWeight: 700 }}
        >
          📄 Resumen Comercial
        </button>
        <button
          className={`btn ${activeTab === "entregas" ? "primary" : "secondary"}`}
          onClick={() => setActiveTab("entregas")}
          style={{ fontWeight: 700 }}
        >
          🚚 Descargas & CPE ({deliveries.length})
        </button>
        <button
          className={`btn ${activeTab === "fijaciones" ? "primary" : "secondary"}`}
          onClick={() => setActiveTab("fijaciones")}
          style={{ fontWeight: 700 }}
        >
          ⚖️ Fijaciones de Precio ({fixations.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "resumen" && (
        <div style={{
          background: "var(--surface-canvas)",
          border: "1px solid var(--surface-border)",
          borderRadius: "20px",
          padding: "24px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px"
        }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, marginBottom: "12px" }}>Partes Intervinientes</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.88rem" }}>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>Vendedor (Productor):</span>
                <div><strong>{contract.sellerName}</strong></div>
              </div>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>Comprador (Exportador / Destino):</span>
                <div><strong>{contract.buyerName}</strong></div>
              </div>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>Puerto o Planta de Entrega:</span>
                <div><strong>{contract.deliveryPort || "Rosario Norte"}</strong></div>
              </div>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, marginBottom: "12px" }}>Condiciones del Negocio</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.88rem" }}>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>Modalidad de Fijación:</span>
                <div><strong>{contract.pricingMode} ({contract.pricingReference || "Pizarra Rosario"})</strong></div>
              </div>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>Estado Operativo:</span>
                <div><strong style={{ color: "#10b981" }}>{contract.status}</strong></div>
              </div>
              <div>
                <span style={{ color: "var(--ink-soft)" }}>Observaciones:</span>
                <div>{contract.notes || "Sin observaciones adicionales."}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "entregas" && (
        <div style={{
          background: "var(--surface-canvas)",
          border: "1px solid var(--surface-border)",
          borderRadius: "20px",
          padding: "20px"
        }}>
          {deliveries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px" }}>
              <p style={{ color: "var(--ink-soft)" }}>Aún no hay descargas registradas en balanza para este contrato.</p>
              <button className="btn primary" onClick={() => setShowDelModal(true)}>+ Cargar Primera Descarga</button>
            </div>
          ) : (
            <table className="table" style={{ width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  <th>N° Remito / CPE</th>
                  <th>Chapa</th>
                  <th>Chofer</th>
                  <th>Balanza Bruto / Tara</th>
                  <th>Humedad</th>
                  <th>Neto Comercial</th>
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
                    <td>{del.truckPlate} / {del.trailerPlate}</td>
                    <td>{del.driverName}</td>
                    <td>{(del.grossWeightKg / 1000).toFixed(2)} Tn / {(del.tareWeightKg / 1000).toFixed(2)} Tn</td>
                    <td>{del.humidityPercentage}%</td>
                    <td><strong style={{ color: "#0d9488" }}>{del.commercialNetWeightTons.toLocaleString("es-AR")} Tn</strong></td>
                    <td><span style={{ color: "#10b981", fontWeight: 700 }}>{del.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "fijaciones" && (
        <div style={{
          background: "var(--surface-canvas)",
          border: "1px solid var(--surface-border)",
          borderRadius: "20px",
          padding: "20px"
        }}>
          {fixations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px" }}>
              <p style={{ color: "var(--ink-soft)" }}>No hay fijaciones parciales registradas.</p>
              {contract.pricingMode === "AFijar" && (
                <button className="btn primary" onClick={() => setShowFixModal(true)}>+ Registrar Fijación de Precio</button>
              )}
            </div>
          ) : (
            <table className="table" style={{ width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  <th>N° Boleto Fijación</th>
                  <th>Fecha</th>
                  <th>Tn Fijadas</th>
                  <th>Precio Cerrado</th>
                  <th>Corretaje Generado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {fixations.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.fixationNumber}</strong></td>
                    <td>{new Date(f.fixationDateUtc).toLocaleDateString("es-AR")}</td>
                    <td><strong>{f.fixedTons.toLocaleString("es-AR")} Tn</strong></td>
                    <td>{f.currency} {f.pricePerTon.toLocaleString("es-AR")}</td>
                    <td><strong style={{ color: "#10b981" }}>USD {f.brokerageAmount.toLocaleString("es-AR")}</strong></td>
                    <td><span style={{ color: "#2563eb", fontWeight: 700 }}>{f.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal Fijación */}
      {showFixModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <div style={{
            background: "var(--surface-canvas)",
            borderRadius: "20px",
            padding: "24px",
            maxWidth: "480px",
            width: "100%",
            boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
          }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "1.2rem", fontWeight: 800 }}>⚖️ Fijación de Precio Granario</h3>
            <form onSubmit={handleCreateFixation} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="label" style={{ fontWeight: 700 }}>Toneladas a Fijar (Entero) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max={contract.totalTons - contract.fixedTons}
                  className="input"
                  value={fixTons}
                  onChange={(e) => setFixTons(parseInt(e.target.value, 10) || 1)}
                  required
                />
                <small style={{ color: "var(--ink-soft)" }}>
                  Máximo disponible a fijar: {(contract.totalTons - contract.fixedTons).toLocaleString("es-AR")} Tn
                </small>
              </div>

              <div>
                <label className="label" style={{ fontWeight: 700 }}>Precio por Tonelada ({contract.currency}) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={fixPrice}
                  onChange={(e) => setFixPrice(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontWeight: 700 }}>Observaciones</label>
                <textarea
                  className="input"
                  rows={2}
                  value={fixNotes}
                  onChange={(e) => setFixNotes(e.target.value)}
                  placeholder="Referencia de pizarra, confirmación telefónica..."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" className="btn secondary" onClick={() => setShowFixModal(false)}>Cancelar</button>
                <button type="submit" className="btn primary" disabled={savingFix}>
                  {savingFix ? "Guardando..." : "Confirmar Fijación"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Balanza / Entrega */}
      {showDelModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <div style={{
            background: "var(--surface-canvas)",
            borderRadius: "20px",
            padding: "24px",
            maxWidth: "560px",
            width: "100%",
            boxShadow: "0 10px 40px rgba(0,0,0,0.3)"
          }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "1.2rem", fontWeight: 800 }}>🚚 Registrar Descarga en Balanza & CPE</h3>
            <form onSubmit={handleCreateDelivery} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label className="label" style={{ fontWeight: 700 }}>N° Carta de Porte (CPE)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej: CPE-89410294"
                    value={delForm.cpeNumber}
                    onChange={(e) => setDelForm({ ...delForm, cpeNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" style={{ fontWeight: 700 }}>Código CTG</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej: CTG-992144"
                    value={delForm.ctgNumber}
                    onChange={(e) => setDelForm({ ...delForm, ctgNumber: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr", gap: "12px" }}>
                <div>
                  <label className="label" style={{ fontWeight: 700 }}>Chapa Camión</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="AF-123-ZZ"
                    value={delForm.truckPlate}
                    onChange={(e) => setDelForm({ ...delForm, truckPlate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" style={{ fontWeight: 700 }}>Acoplado</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="AE-999-YY"
                    value={delForm.trailerPlate}
                    onChange={(e) => setDelForm({ ...delForm, trailerPlate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" style={{ fontWeight: 700 }}>Nombre Chofer</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Juan Pérez"
                    value={delForm.driverName}
                    onChange={(e) => setDelForm({ ...delForm, driverName: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label className="label" style={{ fontWeight: 700 }}>Bruto (Kg) *</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="input"
                    value={delForm.grossWeightKg}
                    onChange={(e) => setDelForm({ ...delForm, grossWeightKg: parseInt(e.target.value, 10) || 0 })}
                    required
                  />
                </div>
                <div>
                  <label className="label" style={{ fontWeight: 700 }}>Tara (Kg) *</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="input"
                    value={delForm.tareWeightKg}
                    onChange={(e) => setDelForm({ ...delForm, tareWeightKg: parseInt(e.target.value, 10) || 0 })}
                    required
                  />
                </div>
                <div>
                  <label className="label" style={{ fontWeight: 700 }}>% Humedad</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    className="input"
                    value={delForm.humidityPercentage}
                    onChange={(e) => setDelForm({ ...delForm, humidityPercentage: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div>
                <label className="label" style={{ fontWeight: 700 }}>Destino / Silo Planta</label>
                <input
                  type="text"
                  className="input"
                  value={delForm.destinationSiloOrPort}
                  onChange={(e) => setDelForm({ ...delForm, destinationSiloOrPort: e.target.value })}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" className="btn secondary" onClick={() => setShowDelModal(false)}>Cancelar</button>
                <button type="submit" className="btn primary" disabled={savingDel}>
                  {savingDel ? "Registrando..." : "Guardar Descarga"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
