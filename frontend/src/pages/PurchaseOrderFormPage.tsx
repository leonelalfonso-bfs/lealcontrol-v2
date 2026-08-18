import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { type Product, type Supplier } from "../api/types";

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

  const handleProductSelect = (index: number, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    const updated = [...items];
    if (prod) {
      updated[index].productId = prod.id;
      updated[index].code = prod.code;
      updated[index].description = prod.name;
      updated[index].unitPrice = prod.basePrice;
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
    return <div style={{ padding: "40px", textAlign: "center" }}>Cargando formulario de orden de compra...</div>;
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
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", marginBottom: "16px", border: "1px solid #f87171" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px", alignItems: "start" }}>
          {/* Main Info Card */}
          <div className="card pad">
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              1. Datos del Proveedor & Condiciones Comerciales
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Seleccionar Proveedor *
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
                  CUIT / Documento *
                </label>
                <input
                  type="text"
                  value={supplierDocument}
                  onChange={(e) => setSupplierDocument(e.target.value)}
                  required
                  placeholder="30-xxxxxxxx-x"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                >
                  <option value="ARS">Pesos Argentinos (ARS)</option>
                  <option value="USD">Dólares Estadounidenses (USD)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Tipo de Cambio (TC)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Fecha Estimada de Entrega
                </label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Condición de Pago
                </label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Lugar / Dirección de Entrega
                </label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>
            </div>

            {/* Items Table */}
            <h3 style={{ marginTop: "24px", marginBottom: "12px", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              2. Artículos / Repuestos / Servicios a Adquirir
            </h3>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", fontSize: "0.82rem", color: "var(--ink-soft)", textAlign: "left" }}>
                    <th style={{ width: "25%", padding: "8px 4px" }}>Catálogo / Código</th>
                    <th style={{ width: "35%", padding: "8px 4px" }}>Descripción</th>
                    <th style={{ width: "10%", padding: "8px 4px", textAlign: "center" }}>Cant.</th>
                    <th style={{ width: "15%", padding: "8px 4px", textAlign: "right" }}>Precio U.</th>
                    <th style={{ width: "10%", padding: "8px 4px", textAlign: "center" }}>IVA</th>
                    <th style={{ width: "5%", padding: "8px 4px" }}></th>
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
                          style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", textAlign: "center", fontSize: "0.85rem" }}
                        />
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={it.unitPrice}
                          onChange={(e) => handleItemChange(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", textAlign: "right", fontSize: "0.85rem", fontFamily: "monospace" }}
                        />
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <select
                          value={it.taxRate}
                          onChange={(e) => handleItemChange(idx, "taxRate", parseFloat(e.target.value))}
                          style={{ width: "100%", padding: "6px 4px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.82rem" }}
                        >
                          <option value="21">21%</option>
                          <option value="10.5">10.5%</option>
                          <option value="27">27%</option>
                          <option value="0">0%</option>
                        </select>
                      </td>
                      <td style={{ padding: "8px 4px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "1.1rem" }}
                          title="Eliminar fila"
                        >
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
              style={{ fontSize: "0.85rem" }}
            >
              + Agregar Ítem
            </button>
          </div>

          {/* Totals & Submit Sidebar */}
          <div>
            <div className="card pad" style={{ position: "sticky", top: "80px" }}>
              <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "1.05rem" }}>Resumen de la Orden</h3>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.9rem" }}>
                <span className="muted">Subtotal Neto:</span>
                <span style={{ fontFamily: "monospace", fontWeight: "bold" }}>
                  {currency === "USD" ? "USD " : "$ "}
                  {subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.9rem" }}>
                <span className="muted">IVA Estimado:</span>
                <span style={{ fontFamily: "monospace" }}>
                  {currency === "USD" ? "USD " : "$ "}
                  {taxAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div style={{ borderTop: "2px solid var(--surface-border)", paddingTop: "12px", display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>Total OC:</span>
                <span style={{ fontWeight: "bold", fontSize: "1.2rem", color: "#047857", fontFamily: "monospace" }}>
                  {currency === "USD" ? "USD " : "$ "}
                  {grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {currency === "USD" && (
                <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", marginBottom: "16px", fontSize: "0.82rem", color: "#1e3a8a" }}>
                  Equivalente ARS (TC ${exchangeRate}): <strong>$ {(grandTotal * exchangeRate).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Observaciones / Leyendas
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instrucciones de entrega, embalaje, condiciones de pago..."
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ width: "100%", padding: "12px", fontSize: "1rem", fontWeight: "bold" }}
              >
                {submitting ? "Emitiendo Orden..." : "📝 Emitir Orden de Compra"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
