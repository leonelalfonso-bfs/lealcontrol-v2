import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { type Product, type PurchaseInvoice, type PurchaseOrder, type Supplier, type Warehouse } from "../api/types";

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
  const invoiceIdParam = searchParams.get("invoice_id");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(orderIdParam);
  const [purchaseInvoiceId, setPurchaseInvoiceId] = useState<string | null>(invoiceIdParam);
  const [linkedInvoice, setLinkedInvoice] = useState<PurchaseInvoice | null>(null);
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
        const [sups, prods, whs] = await Promise.all([
          api.listSuppliers().catch(() => []),
          api.listProducts().catch(() => []),
          api.listWarehouses().catch(() => [])
        ]);
        setSuppliers(sups);
        setProducts(prods);
        setWarehouses(whs);

        if (whs && whs.length > 0) {
          const main = whs.find((w) => w.type === "MainWarehouse") || whs[0];
          setWarehouseLocation(main.name);
        }

        if (invoiceIdParam) {
          try {
            const inv = await api.getPurchaseInvoice(invoiceIdParam);
            setLinkedInvoice(inv);
            setPurchaseInvoiceId(inv.id);
            if (inv.purchaseOrderId) setPurchaseOrderId(inv.purchaseOrderId);
            setSelectedSupplierId(inv.supplierId);
            setSupplierName(inv.supplierName);
            setNotes(`Ingreso de mercadería s/ Factura ${inv.invoiceType} ${inv.formattedNumber}`);

            if (inv.items && inv.items.length > 0) {
              setItems(
                inv.items.map((it) => ({
                  productId: it.productId || undefined,
                  code: it.code || "ITEM",
                  description: it.description,
                  quantity: parseInt(String(it.quantity), 10) || 1,
                  unitMeasure: "u",
                  serialNumber: ""
                }))
              );
            }
          } catch (e) {
            console.error("Error al cargar factura vinculada", e);
          }
        } else if (orderIdParam) {
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
                  quantity: Math.max(1, parseInt(String(it.quantity - it.receivedQuantity), 10) || 1),
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
  }, [orderIdParam, invoiceIdParam]);

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
    } else {
      updated[index].productId = undefined;
      updated[index].code = "ITEM";
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
        purchaseInvoiceId: purchaseInvoiceId || null,
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
          quantity: parseInt(String(it.quantity), 10) || 1,
          unitMeasure: it.unitMeasure || "u",
          serialNumber: it.serialNumber || null
        }))
      };

      await api.createPurchaseReception(payload);
      navigate(invoiceIdParam ? "/compras/facturas" : "/compras/recepciones");
    } catch (err: any) {
      setError(err.message || "Error al registrar la recepción de mercadería.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wide" style={{ padding: "40px", textAlign: "center" }}>
        <p>Cargando datos de recepción...</p>
      </div>
    );
  }

  return (
    <div className="page-wide" style={{ paddingBottom: "60px" }}>
      {/* Header */}
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Link to={invoiceIdParam ? "/compras/facturas" : "/compras/recepciones"} className="btn ghost compact">
              ← Volver
            </Link>
            <span className="eyebrow" style={{ margin: 0 }}>
              COMPRAS & LOGÍSTICA · INGRESO DE STOCK
            </span>
          </div>
          <h1>📦 Recepción de Mercadería (Remito Proveedor)</h1>
          <p className="muted">
            Control de ingreso físico a almacén, trazabilidad de remito y alta de stock con costo real
          </p>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {/* Linked Invoice Banner */}
      {linkedInvoice && (
        <div
          className="card pad"
          style={{
            marginBottom: "20px",
            background: "linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(59, 130, 246, 0.04))",
            borderLeft: "4px solid #0284c7"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "#0369a1" }}>
                📥 Ingreso Vinculado a Factura de Compra
              </span>
              <h3 style={{ margin: "4px 0 0 0", color: "#0c4a6e" }}>
                Factura {linkedInvoice.invoiceType} {linkedInvoice.formattedNumber} — {linkedInvoice.supplierName}
              </h3>
              <p className="muted" style={{ margin: "2px 0 0 0", fontSize: "0.82rem" }}>
                Fecha emisión: {new Date(linkedInvoice.issueDate).toLocaleDateString("es-AR")} · Total:{" "}
                {linkedInvoice.currency} {linkedInvoice.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <span
              className="badge ok"
              style={{ padding: "6px 12px", borderRadius: "8px", fontWeight: 700, fontSize: "0.82rem" }}
            >
              Costos Unitarios Vinculados
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
            1. Cabecera del Remito & Depósito Destino
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
                Razón Social Proveedor *
              </label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                N° Remito Proveedor *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. R-0001-00012345"
                value={supplierRemitoNumber}
                onChange={(e) => setSupplierRemitoNumber(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", fontWeight: "bold" }}
              />
            </div>

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
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", fontWeight: 600 }}
              >
                {warehouses.length > 0 ? (
                  warehouses.map((w) => (
                    <option key={w.id} value={w.name}>
                      🏭 {w.name} ({w.code})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Depósito Central">🏭 Depósito Central</option>
                    <option value="Taller de Calibración">🛠️ Taller de Calibración</option>
                    <option value="Laboratorio">🔬 Laboratorio</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Recibido / Controlado Por
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
              Observaciones / N° Precinto / Transporte
            </label>
            <input
              type="text"
              placeholder="Notas de recepción, estado de embalaje, transportista..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
            />
          </div>
        </div>

        {/* Items Table */}
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
            2. Artículos / Insumos Físicos Recibidos
          </h3>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", fontSize: "0.82rem", color: "var(--ink-soft)", textAlign: "left" }}>
                  <th style={{ width: "26%", padding: "8px 4px" }}>Producto de Catálogo</th>
                  <th style={{ width: "32%", padding: "8px 4px" }}>Descripción / Ítem</th>
                  <th style={{ width: "12%", padding: "8px 4px", textAlign: "center" }}>Cant. a Ingresar</th>
                  <th style={{ width: "10%", padding: "8px 4px", textAlign: "center" }}>U.M.</th>
                  <th style={{ width: "16%", padding: "8px 4px" }}>N° Serie / Lote</th>
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
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.83rem" }}
                      >
                        <option value="">✍️ (Ítem libre / No inventariable)</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.code}] {p.name}
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
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "8px 4px" }}>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        required
                        value={it.quantity}
                        onChange={(e) => handleItemChange(idx, "quantity", parseInt(e.target.value, 10) || 1)}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", textAlign: "center", fontSize: "0.85rem", fontWeight: 700 }}
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
                        placeholder="Opcional..."
                        value={it.serialNumber || ""}
                        onChange={(e) => handleItemChange(idx, "serialNumber", e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "8px 4px", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "1.1rem" }}
                        title="Eliminar este ítem"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={addItemRow} className="btn btn-outline" style={{ fontSize: "0.85rem" }}>
            + Agregar Renglón
          </button>
        </div>

        {/* Submit Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <Link to={invoiceIdParam ? "/compras/facturas" : "/compras/recepciones"} className="btn btn-outline">
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ padding: "10px 24px", fontSize: "0.95rem", fontWeight: 700 }}
          >
            {submitting ? "Registrando ingreso..." : "💾 Confirmar Ingreso de Stock"}
          </button>
        </div>
      </form>
    </div>
  );
}
