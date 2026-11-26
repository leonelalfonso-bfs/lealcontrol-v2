import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { type CustomerDetail, type Product, type Supplier } from "../api/types";
import { QuickCustomerModal } from "../components/QuickCustomerModal";
import { QuickProductModal } from "../components/QuickProductModal";
import { CustomerPicker, ProductPicker } from "../components/pickers";

interface ItemRow {
  productId?: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
}

export function PurchaseOrderFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestIdParam = searchParams.get("request_id");
  const supplierIdParam = searchParams.get("supplier_id");
  const currencyParam = searchParams.get("currency");
  const quoteRefParam = searchParams.get("quote_ref");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierDocument, setSupplierDocument] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("30 días fecha factura");
  const [paymentMethod, setPaymentMethod] = useState("Transferencia bancaria");
  const [deliveryAddress, setDeliveryAddress] = useState("Planta Central - Ruta 11 Km 325");
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<ItemRow[]>([
    { code: "", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, taxRate: 21 }
  ]);

  // Quick Modals
  const [showQuickSupplierModal, setShowQuickSupplierModal] = useState(false);
  const [showQuickProductModal, setShowQuickProductModal] = useState(false);
  const [quickProductLineIndex, setQuickProductLineIndex] = useState<number | null>(null);

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

        // Fetch BNA exchange rate
        try {
          const rates = await api.getExchangeRates();
          if (rates?.usdDivisa.venta) {
            setExchangeRate(rates.usdDivisa.venta);
          }
        } catch {
          // ignore
        }

        if (supplierIdParam) {
          const sup = sups.find((s) => s.id === supplierIdParam);
          if (sup) {
            setSelectedSupplierId(sup.id);
            setSupplierName(sup.legalName || sup.tradeName || "");
            setSupplierDocument(sup.documentNumber || "");
            if (sup.paymentTerms) setPaymentTerms(sup.paymentTerms);
          }
        }

        if (currencyParam) {
          setCurrency(currencyParam);
        }

        // Pre-fill from Purchase Request
        if (requestIdParam) {
          try {
            const req = await api.getPurchaseRequest(requestIdParam);
            if (req.items && req.items.length > 0) {
              let noteText = `Generada desde Solicitud #${req.requestNumber} (${req.requestedBy} - ${req.department}).`;
              if (quoteRefParam) {
                noteText += ` Según Presupuesto Proveedor N° ${quoteRefParam}.`;
              }
              noteText += ` Motivo: ${req.reason}`;
              setNotes(noteText);

              if (req.requiredDate) {
                setExpectedDeliveryDate(new Date(req.requiredDate).toISOString().split("T")[0]);
              }
              setItems(
                req.items.map((it) => ({
                  productId: it.productId || undefined,
                  code: it.code,
                  description: it.description,
                  quantity: it.quantity,
                  unitPrice: it.estimatedUnitPrice || 0,
                  discountPercent: 0,
                  taxRate: 21
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
  }, [requestIdParam, supplierIdParam, currencyParam, quoteRefParam]);

  const handleSupplierChange = (supId: string) => {
    setSelectedSupplierId(supId);
    const sup = suppliers.find((s) => s.id === supId);
    if (sup) {
      setSupplierName(sup.legalName || sup.tradeName || "");
      setSupplierDocument(sup.documentNumber || "");
      if (sup.paymentTerms) setPaymentTerms(sup.paymentTerms);
    }
  };

  const handleSupplierCreated = (newSup: CustomerDetail) => {
    const formatted: Supplier = {
      id: newSup.id,
      legalName: newSup.legalName,
      tradeName: newSup.tradeName,
      documentType: newSup.documentType || "Cuit",
      documentNumber: newSup.documentNumber,
      taxCondition: newSup.taxCondition,
      email: newSup.email,
      phone: newSup.phone,
      paymentTerms: "30 días fecha factura",
      createdAtUtc: new Date().toISOString()
    };

    setSuppliers((prev) => [formatted, ...prev]);
    setSelectedSupplierId(newSup.id);
    setSupplierName(newSup.legalName || newSup.tradeName || "");
    setSupplierDocument(newSup.documentNumber || "");
  };

  const handleProductCreated = (newProd: Product) => {
    setProducts((prev) => [newProd, ...prev]);

    const targetIdx = quickProductLineIndex;
    if (targetIdx !== null && targetIdx >= 0 && targetIdx < items.length) {
      handleProductSelect(targetIdx, newProd.id);
    } else {
      // Append new row
      setItems((prev) => [
        ...prev,
        {
          productId: newProd.id,
          code: newProd.code,
          description: newProd.name,
          quantity: 1,
          unitPrice: newProd.costPrice || newProd.basePrice,
          discountPercent: 0,
          taxRate: newProd.taxRate || 21
        }
      ]);
    }
  };

  const handleProductSelect = (index: number, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    const updated = [...items];
    if (prod) {
      updated[index].productId = prod.id;
      updated[index].code = prod.code;
      updated[index].description = prod.name;
      updated[index].unitPrice = prod.costPrice || prod.basePrice;
      updated[index].taxRate = prod.taxRate || 21;
    } else {
      updated[index].productId = undefined;
    }
    setItems(updated);
  };

  const handleItemChange = (index: number, field: keyof ItemRow, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([
      ...items,
      { code: "", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, taxRate: 21 }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const calculateLineSubtotal = (it: ItemRow) => {
    const gross = it.quantity * it.unitPrice;
    const disc = gross * (it.discountPercent / 100);
    return Math.max(0, gross - disc);
  };

  const subtotal = items.reduce((acc, it) => acc + calculateLineSubtotal(it), 0);
  const taxAmount = items.reduce((acc, it) => acc + calculateLineSubtotal(it) * (it.taxRate / 100), 0);
  const grandTotal = subtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName || !supplierDocument) {
      setError("Por favor seleccione un proveedor válido.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        supplierId: selectedSupplierId || "00000000-0000-0000-0000-000000000000",
        supplierName,
        supplierDocument,
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate).toISOString() : null,
        currency,
        exchangeRate,
        paymentTerms,
        paymentMethod,
        deliveryAddress,
        notes,
        items: items.map((it) => ({
          productId: it.productId || null,
          code: it.code || "ITEM",
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          discountPercent: Number(it.discountPercent),
          taxRate: Number(it.taxRate)
        }))
      };

      const created = await api.createPurchaseOrder(payload);
      navigate(`/compras/ordenes/${created.id}/imprimir`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar la orden de compra");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="t-center" style={{ padding: "40px" }}>Cargando formulario de orden de compra...</div>;
  }

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Nueva Orden de Compra</h1>
          <p className="muted">Formalización de pedido a proveedor y fijación de condiciones de compra</p>
        </div>
        <Link to="/compras/ordenes" className="btn btn-outline">
          ← Cancelar
        </Link>
      </div>

      {error && (
        <div className="t-danger alert" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px", alignItems: "start" }}>
          {/* Main Info Card */}
          <div className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 className="t-accent" style={{ margin: 0 }}>
                1. Datos del Proveedor & Condiciones Comerciales
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickSupplierModal(true)}
                className="btn btn-primary compact"
              >
                + Nuevo Proveedor Completo
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label>
                    Seleccionar Proveedor *
                  </label>
                  <button className="t-small t-accent t-strong"
                    type="button"
                    onClick={() => setShowQuickSupplierModal(true)}
                   style={{ background: "none", border: "none", cursor: "pointer" }}>
                    + Alta Rápida
                  </button>
                </div>
                <CustomerPicker
                  role="supplier"
                  value={selectedSupplierId}
                  onChange={(id) => handleSupplierChange(id)}
                  options={suppliers}
                />
              </div>

              <div>
                <label>
                  CUIT / Documento *
                </label>
                <input
                  type="text"
                  value={supplierDocument}
                  onChange={(e) => setSupplierDocument(e.target.value)}
                  required
                  placeholder="30-xxxxxxxx-x"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label>
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="ARS">Pesos Argentinos (ARS)</option>
                  <option value="USD">Dólares Estadounidenses (USD)</option>
                </select>
              </div>

              <div>
                <label>
                  Tipo de Cambio (TC)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label>
                  Fecha Estimada de Entrega
                </label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label>
                  Condición de Pago
                </label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label>
                  Lugar / Dirección de Entrega
                </label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* Items Table */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px", marginBottom: "12px" }}>
              <h3 className="t-accent" style={{ margin: 0 }}>
                2. Artículos / Repuestos / Insumos a Adquirir
              </h3>
              <button
                type="button"
                onClick={() => {
                  setQuickProductLineIndex(null);
                  setShowQuickProductModal(true);
                }}
                className="btn btn-outline compact"
              >
                + Crear Insumo / Producto
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ marginBottom: "12px" }}>
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Catálogo / Código</th>
                    <th style={{ width: "32%" }}>Descripción</th>
                    <th className="t-center" style={{ width: "10%" }}>Cant.</th>
                    <th className="t-right" style={{ width: "13%" }}>Precio U.</th>
                    <th className="t-center" style={{ width: "10%" }}>IVA</th>
                    <th style={{ width: "5%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                          <ProductPicker
                            aria-label={`Producto del renglón ${idx + 1}`}
                            value={it.productId || ""}
                            onChange={(id) => handleProductSelect(idx, id)}
                            products={products}
                            price="cost"
                            placeholder="Ítem libre"
                          />
                          <button className="t-strong t-small"
                            type="button"
                            onClick={() => {
                              setQuickProductLineIndex(idx);
                              setShowQuickProductModal(true);
                            }}
                            title="Crear un producto nuevo y asignarlo aquí"
                            style={{ padding: "4px 8px", borderRadius: "6px", background: "var(--lc-accent)", color: "#fff", border: "none", cursor: "pointer" }}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <input className="t-small"
                          type="text"
                          required
                          value={it.description}
                          onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                          placeholder="Descripción del ítem..."
                         style={{ width: "100%" }}/>
                      </td>
                      <td>
                        <input className="t-center t-small"
                          type="number"
                          step="any"
                          min="0"
                          required
                          value={it.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", e.target.value === "" ? "" : parseFloat(e.target.value))}
                         style={{ width: "100%" }}/>
                      </td>
                      <td>
                        <input className="t-right t-small t-mono"
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={it.unitPrice}
                          onChange={(e) => handleItemChange(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                         style={{ width: "100%" }}/>
                      </td>
                      <td>
                        <select className="t-small"
                          value={it.taxRate}
                          onChange={(e) => handleItemChange(idx, "taxRate", parseFloat(e.target.value))}
                         style={{ width: "100%" }}>
                          <option value="21">21%</option>
                          <option value="10.5">10.5%</option>
                          <option value="27">27%</option>
                          <option value="0">0%</option>
                        </select>
                      </td>
                      <td className="t-center">
                        <button className="t-danger"
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          title="Eliminar fila"
                         style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.1rem" }}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addItemRow}
              className="btn btn-outline"
            >
              + Agregar Ítem
            </button>
          </div>

          {/* Right Sidebar: Totals & Final Notes */}
          <div className="card pad" style={{ position: "sticky", top: "20px" }}>
            <h3 className="t-accent" style={{ marginBottom: "16px" }}>
              Resumen de Orden
            </h3>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <span className="muted">Subtotal Neto:</span>
              <strong>{currency} {subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
              <span className="muted">IVA Estimado:</span>
              <strong>{currency} {taxAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
            </div>

            <div style={{ borderTop: "2px solid rgba(0,0,0,0.08)", paddingTop: "12px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="t-strong">Total OC:</span>
              <span className="t-ok" style={{ fontSize: "1.3rem", fontWeight: "900" }}>
                {currency} {grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label>
                Instrucciones / Observaciones
              </label>
              <textarea className="t-small"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones de entrega, referencias de presupuesto..."
               style={{ width: "100%" }}/>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
             style={{ width: "100%" }}>
              {submitting ? "Generando Orden..." : "📋 Confirmar & Emitir Orden"}
            </button>
          </div>
        </div>
      </form>

      {/* QUICK SUPPLIER MODAL */}
      <QuickCustomerModal
        isOpen={showQuickSupplierModal}
        onClose={() => setShowQuickSupplierModal(false)}
        onSuccess={handleSupplierCreated}
        mode="supplier"
      />

      {/* QUICK PRODUCT MODAL */}
      <QuickProductModal
        isOpen={showQuickProductModal}
        onClose={() => {
          setShowQuickProductModal(false);
          setQuickProductLineIndex(null);
        }}
        onSuccess={handleProductCreated}
      />
    </div>
  );
}
