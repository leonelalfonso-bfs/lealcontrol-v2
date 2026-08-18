import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { type Product, type PurchaseOrder, type Supplier } from "../api/types";

interface ReceptionRow {
  productId?: string;
  code: string;
  description: string;
  quantity: number;
  unitMeasure: string;
  serialNumber?: string;
}

export function PurchaseReceptionFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get("order_id");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(orderIdParam);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierRemitoNumber, setSupplierRemitoNumber] = useState("");
  const [receptionDate, setReceptionDate] = useState(new Date().toISOString().split("T")[0]);
  const [warehouseLocation, setWarehouseLocation] = useState("Depósito Central");
  const [receivedBy, setReceivedBy] = useState("Control de Calidad / Recepción");
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<ReceptionRow[]>([
    { code: "", description: "", quantity: 1, unitMeasure: "u", serialNumber: "" }
  ]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [sups, prods] = await Promise.all([
          api.listSuppliers().catch(() => []),
          api.listProducts().catch(() => [])
        ]);
        setSuppliers(sups);
        setProducts(prods);

        if (orderIdParam) {
          try {
            const ord = await api.getPurchaseOrder(orderIdParam);
            setPurchaseOrderId(ord.id);
            setSelectedSupplierId(ord.supplierId);
            setSupplierName(ord.supplierName);
            if (ord.items && ord.items.length > 0) {
              setItems(
                ord.items.map((it) => ({
                  productId: it.productId || undefined,
                  code: it.code,
                  description: it.description,
                  quantity: Math.max(1, it.quantity - it.receivedQuantity),
                  unitMeasure: "u",
                  serialNumber: ""
                }))
              );
            }
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [orderIdParam]);

  const handleSupplierChange = (supId: string) => {
    setSelectedSupplierId(supId);
    const sup = suppliers.find((s) => s.id === supId);
    if (sup) {
      setSupplierName(sup.legalName || sup.tradeName || "");
    }
  };

  const handleProductSelect = (index: number, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    const updated = [...items];
    if (prod) {
      updated[index].productId = prod.id;
      updated[index].code = prod.code;
      updated[index].description = prod.name;
    }
    setItems(updated);
  };

  const handleItemChange = (index: number, field: keyof ReceptionRow, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([
      ...items,
      { code: "", description: "", quantity: 1, unitMeasure: "u", serialNumber: "" }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName) {
      setError("Por favor indique el proveedor.");
      return;
    }
    if (!supplierRemitoNumber) {
      setError("Por favor ingrese el número de remito del proveedor.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        purchaseOrderId: purchaseOrderId || null,
        supplierId: selectedSupplierId || "00000000-0000-0000-0000-000000000000",
        supplierName,
        supplierRemitoNumber,
        receptionDate: new Date(receptionDate).toISOString(),
        warehouseLocation,
        receivedBy,
        notes,
        items: items.map((it) => ({
          productId: it.productId || null,
          code: it.code || "ITEM",
          description: it.description,
          quantity: Number(it.quantity),
          unitMeasure: it.unitMeasure || "u",
          serialNumber: it.serialNumber || null
        }))
      };

      await api.createPurchaseReception(payload);
      navigate("/compras/recepciones");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar la recepción");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center" }}>Cargando formulario de recepción...</div>;
  }

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Registrar Recepción de Mercadería</h1>
          <p className="muted">Ingreso de stock físico a depósitos mediante remito de proveedor</p>
        </div>
        <Link to="/compras/recepciones" className="btn btn-outline">
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
            Datos del Remito de Entrega
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Proveedor *
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => handleSupplierChange(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              >
                <option value="">-- Seleccionar Proveedor --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.legalName || s.tradeName} ({s.documentNumber})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                N° Remito de Proveedor *
              </label>
              <input
                type="text"
                required
                placeholder="R 0001-00012345"
                value={supplierRemitoNumber}
                onChange={(e) => setSupplierRemitoNumber(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Fecha de Recepción *
              </label>
              <input
                type="date"
                required
                value={receptionDate}
                onChange={(e) => setReceptionDate(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Depósito de Ingreso *
              </label>
              <select
                value={warehouseLocation}
                onChange={(e) => setWarehouseLocation(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              >
                <option value="Depósito Central">Depósito Central</option>
                <option value="Taller de Balanzas">Taller de Balanzas</option>
                <option value="Móvil de Asistencia Técnica">Móvil de Asistencia Técnica</option>
                <option value="Laboratorio de Metrología">Laboratorio de Metrología</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Recibido Por / Operador
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
            Mercadería a Ingresar en Stock Físico
          </h3>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", fontSize: "0.82rem", color: "var(--ink-soft)", textAlign: "left" }}>
                <th style={{ width: "25%", padding: "8px 4px" }}>Catálogo / Código</th>
                <th style={{ width: "35%", padding: "8px 4px" }}>Descripción</th>
                <th style={{ width: "12%", padding: "8px 4px", textAlign: "center" }}>Cantidad</th>
                <th style={{ width: "10%", padding: "8px 4px", textAlign: "center" }}>Unidad</th>
                <th style={{ width: "14%", padding: "8px 4px" }}>N° de Serie (S/N)</th>
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
                      <option value="">(Ítem libre / No inventariable)</option>
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
                      placeholder="Descripción del ítem..."
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                    />
                  </td>
                  <td style={{ padding: "8px 4px" }}>
                    <input
                      type="number"
                      step="1"
                      min="0.01"
                      required
                      value={it.quantity}
                      onChange={(e) => handleItemChange(idx, "quantity", parseFloat(e.target.value) || 1)}
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
                      placeholder="Ej: SN-2026-981"
                      value={it.serialNumber || ""}
                      onChange={(e) => handleItemChange(idx, "serialNumber", e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem", fontFamily: "monospace" }}
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
          <Link to="/compras/recepciones" className="btn btn-outline">
            Cancelar
          </Link>
          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ padding: "10px 24px" }}>
            {submitting ? "Registrando..." : "📦 Confirmar Recepción e Incrementar Stock"}
          </button>
        </div>
      </form>
    </div>
  );
}
