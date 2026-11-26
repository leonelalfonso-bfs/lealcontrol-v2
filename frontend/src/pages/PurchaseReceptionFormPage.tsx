import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { type Product, type PurchaseInvoice, type PurchaseOrder, type Supplier, type Warehouse } from "../api/types";
import { CustomerPicker, ProductPicker } from "../components/pickers";

import { todayAr } from "../lib/dates";
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
  
  const [receptionDate, setReceptionDate] = useState(todayAr());
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
      <div className="page-wide t-center" style={{ padding: "40px" }}>
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
         style={{ marginBottom: "20px", borderLeft: "4px solid var(--lc-info)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span className="t-small t-strong t-info t-caps">
                📥 Ingreso Vinculado a Factura de Compra
              </span>
              <h3 style={{ margin: "4px 0 0 0" }}>
                Factura {linkedInvoice.invoiceType} {linkedInvoice.formattedNumber} — {linkedInvoice.supplierName}
              </h3>
              <p className="muted t-small" style={{ margin: "2px 0 0 0" }}>
                Fecha emisión: {new Date(linkedInvoice.issueDate).toLocaleDateString("es-AR")} · Total:{" "}
                {linkedInvoice.currency} {linkedInvoice.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <span
              className="badge ok t-strong t-small"
             style={{ padding: "6px 12px", borderRadius: "8px" }}>
              Costos Unitarios Vinculados
            </span>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <h3 className="t-accent" style={{ marginBottom: "16px" }}>
            1. Datos de la Recepción & Depósito Destino
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label>
                Proveedor *
              </label>
              <CustomerPicker
                role="supplier"
                value={selectedSupplierId}
                onChange={(id) => handleSupplierChange(id)}
                options={suppliers}
              />
            </div>

            <div>
              <label>
                Razón Social Proveedor *
              </label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                style={{ width: "100%" }}
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
              <label style={{ alignItems: "center", gap: "8px", cursor: "pointer", margin: 0 }}>
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
                <span className="badge t-info t-strong" style={{ background: "rgba(59, 130, 246, 0.1)", padding: "4px 10px", borderRadius: 8 }}>
                  ℹ️ Recepción Directa (Sin remito de proveedor — se asignará número interno de recepción automáticamente)
                </span>
              )}
            </div>

            {hasSupplierRemito && (
              <div style={{ marginTop: "12px", maxWidth: "340px" }}>
                <label>
                  N° Remito del Proveedor *
                </label>
                <input className="t-strong"
                  type="text"
                  required={hasSupplierRemito}
                  placeholder="Ej. R-0001-00012345"
                  value={supplierRemitoNumber}
                  onChange={(e) => setSupplierRemitoNumber(e.target.value)}
                 style={{ width: "100%" }}/>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label>
                Fecha de Recepción *
              </label>
              <input
                type="date"
                required
                value={receptionDate}
                onChange={(e) => setReceptionDate(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label>
                Depósito de Ingreso *
              </label>
              <select className="t-strong"
                value={warehouseLocation}
                onChange={(e) => setWarehouseLocation(e.target.value)}
               style={{ width: "100%" }}>
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
              <label>
                Recibido Por / Responsable
              </label>
              <input
                type="text"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Ej. Juan Pérez (Depósito)"
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div>
            <label>
              Observaciones / Notas de Entrega
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Bultos en buen estado, transporte Andesmar, precinto intacto..."
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Section 2: Items */}
        <div className="card pad" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h3 className="t-accent" style={{ margin: 0 }}>
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
          <p className="muted t-small" style={{ marginBottom: 12 }}>
            Cada línea debe vincularse a un producto del catálogo. Sin producto no se genera movimiento de inventario y la recepción será rechazada.
          </p>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "220px" }}>Producto Catálogo</th>
                  <th style={{ width: "120px" }}>Código</th>
                  <th>Descripción</th>
                  <th className="t-right" style={{ width: "110px" }}>Cantidad</th>
                  <th style={{ width: "80px" }}>Unidad</th>
                  <th style={{ width: "150px" }}>N° Serie / Lote</th>
                  <th className="t-center" style={{ width: "50px" }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <ProductPicker
                        aria-label={`Producto del renglón ${index + 1}`}
                        value={row.productId || ""}
                        onChange={(id) => handleProductSelect(index, id)}
                        products={products}
                        price="cost"
                        placeholder="Manual / Sin catálogo"
                      />
                    </td>
                    <td>
                      <input className="t-small t-mono"
                        type="text"
                        required
                        value={row.code}
                        onChange={(e) => handleItemChange(index, "code", e.target.value)}
                        placeholder="CÓDIGO"
                       style={{ width: "100%" }}/>
                    </td>
                    <td>
                      <input className="t-small"
                        type="text"
                        required
                        value={row.description}
                        onChange={(e) => handleItemChange(index, "description", e.target.value)}
                        placeholder="Descripción del ítem recibido..."
                       style={{ width: "100%" }}/>
                    </td>
                    <td className="t-right">
                      <input className="t-small t-right t-strong"
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={row.quantity}
                        onChange={(e) => handleItemChange(index, "quantity", parseInt(e.target.value, 10) || 1)}
                       style={{ width: "90px" }}/>
                    </td>
                    <td>
                      <input className="t-small"
                        type="text"
                        value={row.unitMeasure}
                        onChange={(e) => handleItemChange(index, "unitMeasure", e.target.value)}
                       style={{ width: "60px" }}/>
                    </td>
                    <td>
                      <input className="t-small"
                        type="text"
                        value={row.serialNumber || ""}
                        onChange={(e) => handleItemChange(index, "serialNumber", e.target.value)}
                        placeholder="Opcional..."
                       style={{ width: "100%" }}/>
                    </td>
                    <td className="t-center">
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="btn ghost compact t-danger"
                          onClick={() => removeItemRow(index)}
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
          >
            {submitting ? "Registrando ingreso..." : "💾 Confirmar Recepción e Ingresar Stock"}
          </button>
        </div>
      </form>
    </div>
  );
}
