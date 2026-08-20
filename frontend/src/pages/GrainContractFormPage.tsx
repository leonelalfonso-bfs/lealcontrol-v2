import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/client";

export function GrainContractFormPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    contractNumber: "",
    contractType: "Compra",
    grainType: "Soja",
    harvest: "2025/2026",
    pricingMode: "PrecioHecho",
    pricePerTon: 315.00,
    currency: "USD",
    pricingReference: "Pizarra Rosario",
    totalTons: 1000,
    sellerName: "",
    buyerName: "",
    brokerCommissionPercentage: 1.0,
    deliveryPort: "Puerto San Martín",
    notes: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sellerName || !form.buyerName) {
      setError("Completá el nombre del Productor (Vendedor) y del Comprador.");
      return;
    }
    if (form.totalTons <= 0) {
      setError("Las toneladas contratadas deben ser mayores a 0.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await api.createGrainContract({
        ...form,
        totalTons: parseInt(form.totalTons.toString(), 10) || 1,
        pricePerTon: parseFloat(form.pricePerTon.toString()) || 0,
        brokerCommissionPercentage: parseFloat(form.brokerCommissionPercentage.toString()) || 1.0
      });
      navigate(`/cereales/contratos/${res.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar el contrato.");
    } finally {
      setSaving(false);
    }
  };

  const calculatedCommission = Math.round(
    (form.totalTons * form.pricePerTon * (form.brokerCommissionPercentage / 100)) * 100
  ) / 100;

  return (
    <div className="page" style={{ padding: "24px 32px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <Link to="/cereales/contratos" style={{ textDecoration: "none", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
          ← Volver a Contratos
        </Link>
        <h1 style={{ margin: "8px 0 0", fontSize: "1.5rem", fontWeight: 800 }}>
          🌾 Nuevo Contrato de Granos
        </h1>
        <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "0.85rem" }}>
          Emisión de boleto de compra/venta cerealera con fijación y comisión de corretaje
        </p>
      </div>

      {error && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: "16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", fontWeight: 700 }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{
        background: "var(--surface-canvas)",
        border: "1px solid var(--surface-border)",
        borderRadius: "20px",
        padding: "28px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.04)"
      }}>
        {/* Row 1: Cereal, Campaña, Tipo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          <div>
            <label className="label" style={{ fontWeight: 700 }}>Cereal / Cultivo *</label>
            <select className="input" value={form.grainType} onChange={(e) => setForm({ ...form, grainType: e.target.value })}>
              <option value="Soja">Soja</option>
              <option value="Maíz">Maíz</option>
              <option value="Trigo">Trigo</option>
              <option value="Girasol">Girasol</option>
              <option value="Cebada">Cebada</option>
              <option value="Sorgo">Sorgo</option>
            </select>
          </div>

          <div>
            <label className="label" style={{ fontWeight: 700 }}>Campaña Agrícola *</label>
            <select className="input" value={form.harvest} onChange={(e) => setForm({ ...form, harvest: e.target.value })}>
              <option value="2025/2026">2025/2026</option>
              <option value="2024/2025">2024/2025</option>
              <option value="2026/2027">2026/2027</option>
            </select>
          </div>

          <div>
            <label className="label" style={{ fontWeight: 700 }}>Tipo de Operación *</label>
            <select className="input" value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })}>
              <option value="Compra">Compra</option>
              <option value="Venta">Venta</option>
              <option value="Canje">Canje de Insumos</option>
              <option value="Intermediacion">Intermediación / Corretaje Puro</option>
            </select>
          </div>
        </div>

        {/* Row 2: Partes (Vendedor y Comprador) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label className="label" style={{ fontWeight: 700 }}>Productor / Vendedor *</label>
            <input
              type="text"
              className="input"
              placeholder="Ej: Agropecuaria Los Robles S.A."
              value={form.sellerName}
              onChange={(e) => setForm({ ...form, sellerName: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="label" style={{ fontWeight: 700 }}>Comprador / Destino *</label>
            <input
              type="text"
              className="input"
              placeholder="Ej: Cargill S.A.C.I. / Bunge / Molino"
              value={form.buyerName}
              onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
              required
            />
          </div>
        </div>

        {/* Row 3: Modalidad de Precio, Valor y Toneladas */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: "16px" }}>
          <div>
            <label className="label" style={{ fontWeight: 700 }}>Modalidad de Precio *</label>
            <select className="input" value={form.pricingMode} onChange={(e) => setForm({ ...form, pricingMode: e.target.value })}>
              <option value="PrecioHecho">Precio Hecho (Fijo)</option>
              <option value="AFijar">A Fijar (Pizarra)</option>
              <option value="Canje">Canje Cereal/Insumo</option>
            </select>
          </div>

          <div>
            <label className="label" style={{ fontWeight: 700 }}>Moneda</label>
            <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="USD">USD ($ Dólares)</option>
              <option value="ARS">ARS ($ Pesos)</option>
            </select>
          </div>

          <div>
            <label className="label" style={{ fontWeight: 700 }}>Precio Pactado / Base</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={form.pricePerTon}
              onChange={(e) => setForm({ ...form, pricePerTon: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <div>
            <label className="label" style={{ fontWeight: 700 }}>Toneladas (Entero) *</label>
            <input
              type="number"
              step="1"
              min="1"
              className="input"
              value={form.totalTons}
              onChange={(e) => setForm({ ...form, totalTons: parseInt(e.target.value, 10) || 1 })}
              required
            />
          </div>
        </div>

        {/* Row 4: Referencia de Mercado y Puerto */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label className="label" style={{ fontWeight: 700 }}>Referencia de Fijación / Cámara</label>
            <select className="input" value={form.pricingReference} onChange={(e) => setForm({ ...form, pricingReference: e.target.value })}>
              <option value="Pizarra Rosario">Pizarra Rosario</option>
              <option value="Pizarra Dársena">Pizarra Dársena / Buenos Aires</option>
              <option value="Pizarra Bahía Blanca">Pizarra Bahía Blanca</option>
              <option value="MATBA-ROFEX">MATBA-ROFEX Posición Futura</option>
            </select>
          </div>

          <div>
            <label className="label" style={{ fontWeight: 700 }}>Puerto o Destino de Entrega</label>
            <input
              type="text"
              className="input"
              placeholder="Ej: Puerto San Martín, Timbúes, Silo Planta"
              value={form.deliveryPort}
              onChange={(e) => setForm({ ...form, deliveryPort: e.target.value })}
            />
          </div>
        </div>

        {/* Row 5: Comisión de Corretaje */}
        <div style={{
          background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)",
          border: "1px solid rgba(16, 185, 129, 0.25)",
          borderRadius: "14px",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px"
        }}>
          <div>
            <label className="label" style={{ fontWeight: 700, color: "#10b981" }}>% Comisión Corretaje</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="10"
              className="input"
              style={{ width: "120px", marginTop: "4px" }}
              value={form.brokerCommissionPercentage}
              onChange={(e) => setForm({ ...form, brokerCommissionPercentage: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>Honorarios de Corretaje Estimados</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#10b981" }}>
              {form.currency} {calculatedCommission.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div>
          <label className="label" style={{ fontWeight: 700 }}>Observaciones / Cláusulas especiales</label>
          <textarea
            className="input"
            rows={3}
            placeholder="Cláusulas de entrega, libre de gastos, tolerancia de recibo..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "12px" }}>
          <button type="button" className="btn secondary" onClick={() => navigate("/cereales/contratos")}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={saving}
            style={{
              background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
              color: "#ffffff",
              fontWeight: 700,
              border: "none",
              padding: "10px 24px"
            }}
          >
            {saving ? "Guardando..." : "✅ Registrar Contrato Granario"}
          </button>
        </div>
      </form>
    </div>
  );
}
