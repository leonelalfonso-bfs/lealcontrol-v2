import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Product } from "../api/types";
import { ProductPicker } from "../components/pickers";

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
    return <div className="t-center" style={{ padding: "40px" }}>Cargando formulario de solicitud...</div>;
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
        <div className="t-danger alert" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <h3 className="t-accent" style={{ marginBottom: "16px" }}>
            Datos del Solicitante & Justificación
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label>
                Solicitante *
              </label>
              <input
                type="text"
                required
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label>
                Departamento / Sector *
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="Taller de Balanzas">Taller de Balanzas</option>
                <option value="Operaciones / En Campo">Operaciones / En Campo</option>
                <option value="Laboratorio de Metrología">Laboratorio de Metrología</option>
                <option value="Logística & Depósito">Logística & Depósito</option>
                <option value="Administración & Ventas">Administración & Ventas</option>
              </select>
            </div>

            <div>
              <label>
                Prioridad *
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{ width: "100%" }}
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
              <label>
                Fecha Límite Requerida
              </label>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label>
                Motivo / Destino de la Compra *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Repuesto para orden de trabajo #102 en cliente Bunge..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <h3 className="t-accent" style={{ marginBottom: "16px" }}>
            Artículos o Repuestos Requeridos
          </h3>

          <table style={{ marginBottom: "12px" }}>
            <thead>
              <tr>
                <th style={{ width: "25%" }}>Catálogo</th>
                <th style={{ width: "38%" }}>Descripción del Ítem</th>
                <th className="t-center" style={{ width: "12%" }}>Cantidad</th>
                <th className="t-center" style={{ width: "10%" }}>Unidad</th>
                <th style={{ width: "15%" }}>Notas Ítem</th>
                <th style={{ width: "4%" }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>
                    <ProductPicker
                      aria-label={`Producto del renglón ${idx + 1}`}
                      value={it.productId || ""}
                      onChange={(id) => handleProductSelect(idx, id)}
                      products={products}
                      price="cost"
                      placeholder="Ítem libre"
                    />
                  </td>
                  <td>
                    <input className="t-small"
                      type="text"
                      required
                      value={it.description}
                      onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                      placeholder="Descripción del ítem requerido..."
                     style={{ width: "100%" }}/>
                  </td>
                  <td>
                    <input className="t-center t-small t-strong"
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={it.quantity}
                      onChange={(e) => handleItemChange(idx, "quantity", e.target.value === "" ? "" : parseFloat(e.target.value))}
                     style={{ width: "100%" }}/>
                  </td>
                  <td>
                    <input className="t-center t-small"
                      type="text"
                      value={it.unitMeasure}
                      onChange={(e) => handleItemChange(idx, "unitMeasure", e.target.value)}
                     style={{ width: "100%" }}/>
                  </td>
                  <td>
                    <input className="t-small"
                      type="text"
                      placeholder="Ej: marca sugerida..."
                      value={it.notes || ""}
                      onChange={(e) => handleItemChange(idx, "notes", e.target.value)}
                     style={{ width: "100%" }}/>
                  </td>
                  <td className="t-center">
                    <button className="t-danger"
                      type="button"
                      onClick={() => removeItemRow(idx)}
                     style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.1rem" }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button type="button" onClick={addItemRow} className="btn btn-outline">
            + Agregar Línea
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <Link to="/compras/solicitudes" className="btn btn-outline">
            Cancelar
          </Link>
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? "Enviando..." : "🚀 Enviar Solicitud a Compras"}
          </button>
        </div>
      </form>
    </div>
  );
}
