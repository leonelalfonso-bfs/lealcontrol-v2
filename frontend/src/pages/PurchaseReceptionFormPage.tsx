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
  
  // Option: with supplier remito or direct reception
  const [hasSupplierRemito, setHasSupplierRemito] = useState(true);
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
    if (hasSupplierRemito && !supplierRemitoNumber.trim()) {
      setError("Por favor ingrese el número de remito del proveedor o desmarque la opción si es recepción directa.");
      return;
    }

    const missingProduct = items.filter((it) => !it.productId && !(it.code || "").trim());
    if (missingProduct.length > 0) {
      setError(
        "Cada línea debe tener un producto del catálogo (seleccioná producto o código válido). Sin producto no se genera inventario."
      );
      return;
    }

    const withoutProductId = items.filter((it) => !it.productId);
    if (withoutProductId.length > 0) {
      const ok = window.confirm(
        `${withoutProductId.length} línea(s) no tienen producto seleccionado (solo código). El sistema intentará resolverlo por código. Si el código no existe en el catálogo, la recepción será rechazada. ¿Continuar?`
      );
      if (!ok) return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        purchaseOrderId: purchaseOrderId || null,
        purchaseInvoiceId: purchaseInvoiceId || null,
        supplierId: selectedSupplierId || "00000000-0000-0000-0000-000000000000",
        supplierName,
        supplierRemitoNumber: hasSupplierRemito && supplierRemitoNumber.trim() ? supplierRemitoNumber.trim() : null,
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
          <h1>📦 Recepción de Mercadería</h1>
          <p className="muted">
            Control de ingreso físico a almacén, trazabilidad de remito o recepción directa y alta de stock con costo real
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
            1. Datos de la Recepción & Depósito Destino
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

          {/* Tipo de Documento: Remito del Proveedor vs Recepción Directa */}
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 14px",
              background: "rgba(0,0,0,0.02)",
              borderRadius: "8px",
              border: "1px solid var(--surface-border)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 700, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={hasSupplierRemito}
                  onChange={(e) => {
                    setHasSupplierRemito(e.target.checked);
                    if (!e.target.checked) setSupplierRemitoNumber("");
                  }}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
                <span>🚚 Ingresa con Remito del Proveedor</span>
              </label>

              {!hasSupplierRemito && (
                <span className="badge" style={{ background: "rgba(59, 130, 246, 0.1)", color: "#1d4ed8", fontWeight: 600, padding: "4px 10px", borderRadius: 8 }}>
                  ℹ️ Recepción Directa (Sin remito de proveedor — se asignará número interno de recepción automáticamente)
                </span>
              )}
            </div>

            {hasSupplierRemito && (
              <div style={{ marginTop: "12px", maxWidth: "340px" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  N° Remito del Proveedor *
                </label>
                <input
                  type="text"
                  required={hasSupplierRemito}
                  placeholder="Ej. R-0001-00012345"
                  value={supplierRemitoNumber}
                  onChange={(e) => setSupplierRemitoNumber(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", fontWeight: "bold" }}
                />
              </div>
            )}
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
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", fontWeight: 600 }}
              >
                {warehouses.length > 0 ? (
                  warehouses.map((w) => (
                    <option key={w.id} value={w.name}>
                      🏭 {w.name} ({w.code})
                    </option>
                  ))
                ) : (
                  <option value="Depósito Central">🏭 Depósito Central</option>
                )}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Recibido Por / Responsable
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Ej. Juan Pérez (Depósito)"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
              Observaciones / Notas de Entrega
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Bultos en buen estado, transporte Andesmar, precinto intacto..."
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
            />
          </div>
        </div>

        {/* Section 2: Items */}
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              2. Ítems a Ingresar al Stock
            </h3>
            <button
              type="button"
              className="btn btn-outline compact"
              onClick={addItemRow}
            >
              + Agregar Ítem
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 12 }}>
            Cada línea debe vincularse a un producto del catálogo. Sin producto no se genera movimiento de inventario y la recepción será rechazada.
          </p>

          <div className="table-wrap">
            <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                  <th style={{ padding: "8px", width: "220px" }}>Producto Catálogo</th>
                  <th style={{ padding: "8px", width: "120px" }}>Código</th>
                  <th style={{ padding: "8px" }}>Descripción</th>
                  <th style={{ padding: "8px", width: "110px", textAlign: "right" }}>Cantidad</th>
                  <th style={{ padding: "8px", width: "80px" }}>Unidad</th>
                  <th style={{ padding: "8px", width: "150px" }}>N° Serie / Lote</th>
                  <th style={{ padding: "8px", width: "50px", textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <select
                        value={row.productId || ""}
                        onChange={(e) => handleProductSelect(index, e.target.value)}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                      >
                        <option value="">-- Manual / Sin catálogo --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} - {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input
                        type="text"
                        required
                        value={row.code}
                        onChange={(e) => handleItemChange(index, "code", e.target.value)}
                        placeholder="CÓDIGO"
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem", fontFamily: "monospace" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input
                        type="text"
                        required
                        value={row.description}
                        onChange={(e) => handleItemChange(index, "description", e.target.value)}
                        placeholder="Descripción del ítem recibido..."
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={row.quantity}
                        onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value, 10) || 1)}
                        style={{ width: "90px", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem", textAlign: "right", fontWeight: "bold" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input
                        type="text"
                        value={row.unitMeasure}
                        onChange={(e) => handleItemChange(index, "unitMeasure", e.target.value)}
                        style={{ width: "60px", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <input
                        type="text"
                        value={row.serialNumber || ""}
                        onChange={(e) => handleItemChange(index, "serialNumber", e.target.value)}
                        placeholder="Opcional..."
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="btn ghost compact"
                          onClick={() => removeItemRow(index)}
                          style={{ color: "#ef4444", padding: "4px 8px" }}
                          title="Eliminar renglón"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link to={invoiceIdParam ? "/compras/facturas" : "/compras/recepciones"} className="btn ghost">
            Cancelar
          </Link>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ padding: "10px 24px", fontWeight: "bold" }}
          >
            {submitting ? "Registrando ingreso..." : "💾 Confirmar Recepción e Ingresar Stock"}
          </button>
        </div>
      </form>
    </div>
  );
}
