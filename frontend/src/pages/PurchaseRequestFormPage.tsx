import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Product } from "../api/types";

interface RequestRow {
  productId?: string;
  code: string;
  description: string;
  quantity: number;
  unitMeasure: string;
  estimatedUnitPrice: number;
  notes?: string;
}

export function PurchaseRequestFormPage() {
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestedBy, setRequestedBy] = useState("Leonel Alfonso");
  const [department, setDepartment] = useState("Taller de Balanzas");
  const [priority, setPriority] = useState("Normal");
  const [requiredDate, setRequiredDate] = useState("");
  const [reason, setReason] = useState("");

  const [items, setItems] = useState<RequestRow[]>([
    { code: "", description: "", quantity: 1, unitMeasure: "u", estimatedUnitPrice: 0, notes: "" }
  ]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const prods = await api.listProducts().catch(() => []);
        setProducts(prods);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleProductSelect = (index: number, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    const updated = [...items];
    if (prod) {
      updated[index].productId = prod.id;
      updated[index].code = prod.code;
      updated[index].description = prod.name;
      updated[index].estimatedUnitPrice = prod.basePrice || 0;
    }
    setItems(updated);
  };

  const handleItemChange = (index: number, field: keyof RequestRow, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([
      ...items,
      { code: "", description: "", quantity: 1, unitMeasure: "u", estimatedUnitPrice: 0, notes: "" }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedBy.trim()) {
      setError("Por favor indique el nombre del solicitante.");
      return;
    }
    if (!reason.trim()) {
      setError("Por favor indique la justificación o motivo de la compra.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        requestedBy,
        department,
        priority,
        requiredDate: requiredDate ? new Date(requiredDate).toISOString() : null,
        reason,
        items: items.map((it) => ({
          productId: it.productId || null,
          code: it.code || "SOL-ITEM",
          description: it.description,
          quantity: Number(it.quantity),
          unitMeasure: it.unitMeasure || "u",
          estimatedUnitPrice: Number(it.estimatedUnitPrice || 0),
          notes: it.notes || null
        }))
      };

      await api.createPurchaseRequest(payload);
      navigate("/compras/solicitudes");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar la solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center" }}>Cargando formulario de solicitud...</div>;
  }

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Nueva Solicitud de Compra (Requisición Interna)</h1>
          <p className="muted">
            Solicitá los materiales, repuestos o servicios necesarios para que el área de compras gestione cotizaciones
          </p>
        </div>
        <Link to="/compras/solicitudes" className="btn btn-outline">
          ← Volver
        </Link>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", marginBottom: "16px", border: "1px solid #f87171" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
            Datos del Solicitante & Justificación
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Solicitante *
              </label>
              <input
                type="text"
                required
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Departamento / Sector *
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              >
                <option value="Taller de Balanzas">Taller de Balanzas</option>
                <option value="Operaciones / En Campo">Operaciones / En Campo</option>
                <option value="Laboratorio de Metrología">Laboratorio de Metrología</option>
                <option value="Logística & Depósito">Logística & Depósito</option>
                <option value="Administración & Ventas">Administración & Ventas</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Prioridad *
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              >
                <option value="Low">Baja (Sin apuro)</option>
                <option value="Normal">Normal</option>
                <option value="High">Alta (Próximos días)</option>
                <option value="Urgent">Urgente (Parada de planta / Obra)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Fecha Límite Requerida
              </label>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Motivo / Destino de la Compra *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Repuesto para orden de trabajo #102 en cliente Bunge..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
            Artículos o Repuestos Requeridos
          </h3>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", fontSize: "0.82rem", color: "var(--ink-soft)", textAlign: "left" }}>
                <th style={{ width: "25%", padding: "8px 4px" }}>Catálogo</th>
                <th style={{ width: "38%", padding: "8px 4px" }}>Descripción del Ítem</th>
                <th style={{ width: "12%", padding: "8px 4px", textAlign: "center" }}>Cantidad</th>
                <th style={{ width: "10%", padding: "8px 4px", textAlign: "center" }}>Unidad</th>
                <th style={{ width: "15%", padding: "8px 4px" }}>Notas Ítem</th>
                <th style={{ width: "4%", padding: "8px 4px" }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <td style={{ padding: "8px 4px" }}>
                    <select
                      value={it.productId || ""}
                      onChange={(e) => handleProductSelect(idx, e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                    >
                      <option value="">(Ítem libre)</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} - {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <input
                      type="text"
                      required
                      value={it.description}
                      onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                      placeholder="Descripción del ítem requerido..."
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                    />
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={it.quantity}
                      onChange={(e) => handleItemChange(idx, "quantity", e.target.value === "" ? "" : parseFloat(e.target.value))}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", textAlign: "center", fontSize: "0.85rem", fontWeight: "bold" }}
                    />
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <input
                      type="text"
                      value={it.unitMeasure}
                      onChange={(e) => handleItemChange(idx, "unitMeasure", e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", textAlign: "center", fontSize: "0.85rem" }}
                    />
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <input
                      type="text"
                      placeholder="Ej: marca sugerida..."
                      value={it.notes || ""}
                      onChange={(e) => handleItemChange(idx, "notes", e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                    />
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "1.1rem" }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button type="button" onClick={addItemRow} className="btn btn-outline" style={{ fontSize: "0.85rem" }}>
            + Agregar Línea
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <Link to="/compras/solicitudes" className="btn btn-outline">
            Cancelar
          </Link>
          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ padding: "10px 24px", fontWeight: "bold" }}>
            {submitting ? "Enviando..." : "🚀 Enviar Solicitud a Compras"}
          </button>
        </div>
      </form>
    </div>
  );
}
