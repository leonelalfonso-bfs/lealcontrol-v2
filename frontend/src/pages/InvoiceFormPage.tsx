import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import {
  type CustomerDetail,
  type CustomerSummary,
  type ExchangeRates,
  type InvoiceWrite,
  type ProductSummary
} from "../api/types";

interface FormInvoiceItem {
  productId?: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
}

export function InvoiceFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const orderId = queryParams.get("order_id");
  const remitoId = queryParams.get("remito_id");

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Model
  const [invoiceType, setInvoiceType] = useState<string>("A");
  const [pointOfSale, setPointOfSale] = useState<number>(1);
  const [salesPoints, setSalesPoints] = useState<Array<{ number: number; emissionType: string }>>([]);
  const [salesPointHint, setSalesPointHint] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerDocument, setCustomerDocument] = useState<string>("");
  const [customerTaxCondition, setCustomerTaxCondition] = useState<string>("ResponsableInscripto");
  const [locationId, setLocationId] = useState<string>("");
  const [customerAddress, setCustomerAddress] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [saleCondition, setSaleCondition] = useState<string>("Cuenta Corriente 30 días");
  const [dueDate, setDueDate] = useState<string>(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [rateSource, setRateSource] = useState<"divisas" | "billetes" | "manual">("divisas");
  const [exchangeRate, setExchangeRate] = useState<number>(1.0);
  const [advancePercent, setAdvancePercent] = useState<number>(100);
  const [notes, setNotes] = useState<string>("");
  const [sourceRemitoNumber, setSourceRemitoNumber] = useState<string>("");

  const [items, setItems] = useState<FormInvoiceItem[]>([
    { productId: undefined, code: "SERV-01", description: "Servicio / Producto", quantity: 1, unitPrice: 10000, discountPercent: 0, vatRate: 21.0 }
  ]);

  // Load initial reference data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [custPage, prodList, rates] = await Promise.all([
          api.listCustomers().catch(() => ({ items: [], total: 0, page: 1, pageSize: 50 })),
          api.listProducts().catch(() => []),
          api.getExchangeRates().catch(() => null)
        ]);

        setCustomers(custPage.items);
        setProducts(prodList);
        setExchangeRates(rates);
        const points = await api.listArcaSalesPoints().catch(() => null);
        if (points?.points?.length) {
          setSalesPoints(points.points);
          if (points.suggested) setPointOfSale(points.suggested);
          setSalesPointHint(points.suggested
            ? `ARCA autorizó el punto de venta ${points.suggested} para factura electrónica.`
            : null);
        }

        const defaultRate = rates?.usdDivisaSell || rates?.usdBilleteSell || 1400;

        if (orderId) {
          const order = await api.getOrder(orderId).catch(() => null);
          if (order) {
            let custDetail: CustomerDetail | null = null;
            if (order.customerId && order.customerId !== "00000000-0000-0000-0000-000000000000") {
              custDetail = await api.getCustomer(order.customerId).catch(() => null);
            }

            const foundName = custDetail?.legalName || custPage.items.find((c) => c.id === order.customerId)?.legalName || "";
            const foundDoc = custDetail?.documentNumber || custPage.items.find((c) => c.id === order.customerId)?.documentNumber || "";
            const foundTax = custDetail?.taxCondition || custPage.items.find((c) => c.id === order.customerId)?.taxCondition || "ResponsableInscripto";

            setCustomerId(order.customerId);
            setCustomerName(foundName);
            setCustomerDocument(foundDoc);
            setCustomerTaxCondition(foundTax);
            setCustomerDetail(custDetail);

            const isRi = foundTax === "ResponsableInscripto";
            setInvoiceType(isRi ? "A" : "B");

            let address = "";
            if (custDetail) {
              if (order.locationId) {
                const loc = custDetail.locations.find((l) => l.id === order.locationId);
                if (loc) {
                  setLocationId(loc.id);
                  address = `${loc.name} - ${loc.address.street}, ${loc.address.city}, ${loc.address.province}`;
                }
              }
              if (!address && custDetail.fiscalAddress?.street) {
                address = `${custDetail.fiscalAddress.street}, ${custDetail.fiscalAddress.city}, ${custDetail.fiscalAddress.province}`;
              }
            }
            setCustomerAddress(address);

            const isUsd = order.currency?.includes("USD");
            const orderRate = isUsd ? (order.exchangeRateUsdBillete || order.exchangeRateUsdDivisa || defaultRate) : 1.0;
            setCurrency(isUsd ? "USD" : "ARS");
            setExchangeRate(orderRate);
            setNotes(`Emitida a partir del Pedido N° ${order.orderNumber}${order.notes ? ` · ${order.notes}` : ""}`);

            const orderLines = order.lines || [];
            if (orderLines.length > 0) {
              setItems(
                orderLines.map((i) => {
                  const prod = prodList.find((p) => p.id === i.productId);
                  return {
                    productId: i.productId ?? undefined,
                    code: prod?.code || "ITEM",
                    description: i.description || prod?.name || "Ítem de venta",
                    quantity: Math.round(i.quantity) || 1,
                    unitPrice: i.unitPrice || 0,
                    discountPercent: i.discountPercent || 0,
                    vatRate: i.taxRate || 21.0
                  };
                })
              );
            }
          }
        } else if (remitoId) {
          const remito = await api.getRemito(remitoId).catch(() => null);
          if (remito) {
            setSourceRemitoNumber(remito.remitoNumber);
            let custDetail: CustomerDetail | null = null;
            if (remito.customerId) {
              custDetail = await api.getCustomer(remito.customerId).catch(() => null);
            }
            setCustomerDetail(custDetail);

            const foundTax = custDetail?.taxCondition || "ResponsableInscripto";
            setCustomerId(remito.customerId);
            setCustomerName(remito.customerName);
            setCustomerDocument(remito.customerDocument);
            setCustomerTaxCondition(foundTax);
            setInvoiceType(foundTax === "ResponsableInscripto" ? "A" : "B");
            setCustomerAddress(remito.deliveryAddress || "");
            setNotes(`Emitida a partir del Remito de Entrega N° ${remito.remitoNumber}`);

            const remitoItems = remito.items || [];
            if (remitoItems.length > 0) {
              setItems(
                remitoItems.map((i) => {
                  const prod = prodList.find((p) => (i.productId && p.id === i.productId) || (i.code && p.code.toLowerCase() === i.code.toLowerCase()));
                  return {
                    productId: i.productId ?? prod?.id ?? undefined,
                    code: i.code || prod?.code || "ITEM",
                    description: i.description || prod?.name || "Ítem despachado",
                    quantity: Math.round(i.quantity) || 1,
                    unitPrice: prod?.basePrice || 10000,
                    discountPercent: 0,
                    vatRate: prod?.taxRate || 21.0
                  };
                })
              );
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [orderId, remitoId]);

  // Handle Customer Selection
  const handleCustomerChange = async (newCustId: string) => {
    const c = customers.find((x) => x.id === newCustId);
    if (!c) return;

    setCustomerId(c.id);
    setCustomerName(c.legalName);
    setCustomerDocument(c.documentNumber);

    try {
      const detail = await api.getCustomer(newCustId);
      setCustomerDetail(detail);
      const taxCond = detail.taxCondition || c.taxCondition;
      setCustomerTaxCondition(taxCond);
      setInvoiceType(taxCond === "ResponsableInscripto" ? "A" : "B");

      if (detail.fiscalAddress?.street) {
        setCustomerAddress(`${detail.fiscalAddress.street}, ${detail.fiscalAddress.city}, ${detail.fiscalAddress.province}`);
      }
    } catch {
      // fallback
    }
  };

  const handleLocationChange = (locId: string) => {
    setLocationId(locId);
    if (!locId && customerDetail?.fiscalAddress?.street) {
      setCustomerAddress(`${customerDetail.fiscalAddress.street}, ${customerDetail.fiscalAddress.city}, ${customerDetail.fiscalAddress.province}`);
      return;
    }
    const loc = customerDetail?.locations.find((l) => l.id === locId);
    if (loc) {
      setCustomerAddress(`${loc.name} - ${loc.address.street}, ${loc.address.city}, ${loc.address.province}`);
    }
  };

  // Sale condition sync due date
  const handleSaleConditionChange = (cond: string) => {
    setSaleCondition(cond);
    const now = new Date(issueDate || Date.now());
    let days = 30;
    if (cond === "Contado") days = 0;
    else if (cond.includes("15")) days = 15;
    else if (cond.includes("30")) days = 30;
    else if (cond.includes("60")) days = 60;
    else if (cond.includes("90")) days = 90;

    now.setDate(now.getDate() + days);
    setDueDate(now.toISOString().split("T")[0]);
  };

  // Live Exchange Rates Refresh
  const handleRefreshBnaRates = async () => {
    try {
      setRatesLoading(true);
      const r = await api.getExchangeRates();
      setExchangeRates(r);
      if (currency === "USD") {
        const newRate = rateSource === "billetes" ? (r.usdBilleteSell || 1400) : (r.usdDivisaSell || 1400);
        setExchangeRate(newRate);
      }
    } catch (err) {
      console.error("Error refreshing BNA rates", err);
    } finally {
      setRatesLoading(false);
    }
  };

  // Multicurrency Dynamic Conversion
  const handleCurrencyChange = async (newCurrency: "ARS" | "USD") => {
    if (newCurrency === currency) return;

    let rate = exchangeRate;
    if (newCurrency === "USD" && rate <= 1.0) {
      rate = rateSource === "billetes" ? (exchangeRates?.usdBilleteSell || 1400) : (exchangeRates?.usdDivisaSell || 1400);
    }
    const effectiveRate = rate > 0 ? rate : 1.0;

    const converted = items.map((item) => {
      let price = item.unitPrice;
      if (newCurrency === "USD" && currency === "ARS") {
        price = Math.round((price / effectiveRate) * 100) / 100;
      } else if (newCurrency === "ARS" && currency === "USD") {
        price = Math.round((price * effectiveRate) * 100) / 100;
      }
      return { ...item, unitPrice: price };
    });

    setCurrency(newCurrency);
    setExchangeRate(newCurrency === "ARS" ? 1.0 : effectiveRate);
    setItems(converted);
  };

  // Apply Percentage (Facturación Parcial / Anticipo %)
  const handleApplyAdvancePercentage = () => {
    if (advancePercent <= 0 || advancePercent > 100) return;
    const factor = advancePercent / 100;
    setItems((prev) =>
      prev.map((i) => ({
        ...i,
        quantity: Math.round(i.quantity * factor * 100) / 100
      }))
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { productId: undefined, code: "", description: "", quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 21.0 }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemProductSelect = (index: number, prodId: string) => {
    const p = products.find((x) => x.id === prodId);
    if (!p) return;
    const rate = currency === "USD" && exchangeRate > 0 ? exchangeRate : 1.0;
    const isDollarProduct = p.saleCurrency !== "ARS";
    const price = currency === "USD"
      ? (isDollarProduct ? p.basePrice : p.basePrice / rate)
      : (isDollarProduct ? p.basePrice * rate : p.basePrice);

    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        productId: p.id,
        code: p.code,
        description: p.name,
        unitPrice: Math.round(price * 100) / 100,
        vatRate: p.taxRate || 21.0
      };
      return next;
    });
  };

  // Financial Calculations
  const calculateItemNet = (i: FormInvoiceItem) => {
    const gross = i.quantity * i.unitPrice;
    const discount = gross * ((i.discountPercent || 0) / 100);
    return Math.max(0, gross - discount);
  };

  const subtotalNeto = items.reduce((s, i) => s + calculateItemNet(i), 0);
  const iva21 = items.filter((i) => Math.abs(i.vatRate - 21.0) < 0.1).reduce((s, i) => s + (calculateItemNet(i) * 0.21), 0);
  const iva105 = items.filter((i) => Math.abs(i.vatRate - 10.5) < 0.1).reduce((s, i) => s + (calculateItemNet(i) * 0.105), 0);
  const iva27 = items.filter((i) => Math.abs(i.vatRate - 27.0) < 0.1).reduce((s, i) => s + (calculateItemNet(i) * 0.27), 0);
  const totalIva = iva21 + iva105 + iva27;
  const totalFactura = subtotalNeto + totalIva;
  const equivArs = currency === "USD" ? totalFactura * (exchangeRate || 1) : totalFactura;

  const handleSubmit = async (e: FormEvent, authorizeNow = false) => {
    e.preventDefault();
    if (!customerId) {
      setError("Por favor seleccioná un cliente para emitir la factura.");
      return;
    }

    const payload: InvoiceWrite = {
      invoiceType,
      pointOfSale,
      orderId: orderId || undefined,
      remitoId: remitoId || undefined,
      customerId,
      customerName,
      customerDocument,
      customerTaxCondition,
      customerAddress,
      dueDate,
      currency,
      exchangeRate: currency === "USD" ? exchangeRate : 1.0,
      notes,
      items: items.map((i) => ({
        productId: i.productId,
        code: i.code || "ITEM",
        description: i.discountPercent > 0 ? `${i.description} (Desc. ${i.discountPercent}%)` : i.description,
        quantity: i.quantity,
        unitPrice: Math.round(calculateItemNet(i) / (i.quantity || 1) * 100) / 100,
        vatRate: i.vatRate
      }))
    };

    try {
      setSaving(true);
      setError(null);
      const res = await api.createInvoice(payload);

      if (authorizeNow && ["A", "B", "C", "M"].includes(invoiceType)) {
        try {
          await api.authorizeInvoiceArca(res.id);
        } catch (authErr) {
          console.warn("Could not authorize immediately, invoice saved as Draft", authErr);
        }
      }

      navigate(`/facturas/${res.id}/imprimir`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la factura");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="pad muted">Cargando formulario de factura…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>📄 {orderId ? "Emitir Comprobante desde Pedido" : remitoId ? "Emitir Comprobante desde Remito" : "Emitir Comprobante"}</h1>
          <p className="muted">
            {orderId ? `Facturación oficial vinculada a Pedido de Venta` : "Carga y emisión de comprobantes fiscales con autorización ARCA"}
          </p>
        </div>
        <Link className="btn ghost" to={orderId ? `/pedidos/${orderId}` : "/facturas"}>
          ← Volver
        </Link>
      </div>

      {error && <div className="alert">{error}</div>}

      <form onSubmit={(e) => handleSubmit(e, false)}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem", alignItems: "start" }}>
          {/* Main Column */}
          <div className="stack" style={{ gap: 20 }}>
            {sourceRemitoNumber ? (
              <div
                style={{
                  background: "rgba(13, 148, 136, 0.08)",
                  border: "1px solid rgba(13, 148, 136, 0.3)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12
                }}
              >
                <span style={{ fontSize: "1.5rem" }}>🚚</span>
                <div>
                  <strong style={{ color: "#0f766e", fontSize: "0.95rem" }}>
                    Facturando Remito de Entrega N° {sourceRemitoNumber}
                  </strong>
                  <div style={{ fontSize: "0.82rem", color: "#475569", marginTop: 2 }}>
                    La mercadería ya fue egresada del inventario mediante este remito. Esta factura generará el comprobante fiscal oficial y la cuenta corriente sin duplicar el egreso de stock.
                  </div>
                </div>
              </div>
            ) : !orderId ? (
              <div
                style={{
                  background: "rgba(59, 130, 246, 0.06)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: "0.82rem",
                  color: "#1e40af",
                  display: "flex",
                  alignItems: "center",
                  gap: 10
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>⚡</span>
                <div>
                  <strong>Venta Directa / Mostrador:</strong> Al emitir esta factura, el stock de los productos inventariables se descontará automáticamente del depósito.
                </div>
              </div>
            ) : null}

            {/* General Info Card */}
            <div className="card pad">
              <h3 style={{ margin: "0 0 16px", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                1. Información General & Receptor
              </h3>

              <div className="grid-3">
                <label>
                  Cliente / Razón Social *
                  <select
                    value={customerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    required
                  >
                    <option value="">Seleccionar cliente...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legalName} ({c.documentNumber})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Planta / Entrega (CM)
                  <select
                    value={locationId}
                    onChange={(e) => handleLocationChange(e.target.value)}
                  >
                    <option value="">— Sede fiscal del cliente —</option>
                    {customerDetail?.locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.address.city}, {loc.address.province})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Fecha de Emisión *
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="grid-3" style={{ marginTop: 14 }}>
                <label>
                  Condición de Venta
                  <select
                    value={saleCondition}
                    onChange={(e) => handleSaleConditionChange(e.target.value)}
                  >
                    <option value="Contado">Contado / Contra Entrega</option>
                    <option value="Cuenta Corriente 15 días">Cuenta Corriente 15 días</option>
                    <option value="Cuenta Corriente 30 días">Cuenta Corriente 30 días</option>
                    <option value="Cuenta Corriente 60 días">Cuenta Corriente 60 días</option>
                    <option value="Cuenta Corriente 90 días">Cuenta Corriente 90 días</option>
                  </select>
                </label>

                <label>
                  Fecha de Vencimiento *
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </label>

                <label>
                  Condición IVA Receptor
                  <input value={customerTaxCondition} readOnly />
                </label>
              </div>

              <div className="grid-3" style={{ marginTop: 14 }}>
                <label>
                  Tipo de Comprobante *
                  <select
                    value={invoiceType}
                    onChange={(e) => setInvoiceType(e.target.value)}
                    required
                  >
                    <option value="A">Factura A (Resp. Inscripto)</option>
                    <option value="B">Factura B (Cons. Final / Monotributo)</option>
                    <option value="C">Factura C (Emisor Monotributo)</option>
                    <option value="M">Factura M (Régimen Retención)</option>
                    <option value="NC_A">Nota de Crédito A</option>
                    <option value="NC_B">Nota de Crédito B</option>
                    <option value="ND_A">Nota de Débito A</option>
                    <option value="ND_B">Nota de Débito B</option>
                    <option value="Proforma">Factura Proforma / Interna</option>
                  </select>
                </label>

                <label>
                  Punto de Venta *
                  {salesPoints.length > 0 ? (
                    <select value={pointOfSale} onChange={(e) => setPointOfSale(Number(e.target.value))} required>
                      {salesPoints.map((point) => (
                        <option key={point.number} value={point.number}>
                          {String(point.number).padStart(4, "0")} · {point.emissionType || "Factura electrónica"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={pointOfSale}
                      onChange={(e) => setPointOfSale(Number(e.target.value))}
                      required
                    />
                  )}
                  {salesPointHint && <span className="muted" style={{ display: "block", marginTop: 4, fontSize: "0.78rem" }}>{salesPointHint}</span>}
                </label>

                <label>
                  Moneda del Comprobante *
                  <select
                    value={currency}
                    onChange={(e) => handleCurrencyChange(e.target.value as "ARS" | "USD")}
                    required
                  >
                    <option value="ARS">Pesos Argentinos (ARS)</option>
                    <option value="USD">Dólares Estadounidenses (USD)</option>
                  </select>
                </label>
              </div>

              {/* Multicurrency & Exchange Rates Bar */}
              {currency === "USD" && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 14, borderRadius: 8, marginTop: 16 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ color: "#166534", fontSize: "0.9rem" }}>
                      💵 Cotización Aplicable (USD / ARS)
                    </strong>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                      onClick={handleRefreshBnaRates}
                      disabled={ratesLoading}
                    >
                      {ratesLoading ? "⌛ Actualizando..." : "🔄 Actualizar Tasas BNA"}
                    </button>
                  </div>
                  <div className="grid-2">
                    <label style={{ fontSize: "0.85rem" }}>
                      Tipo de Cotización
                      <select
                        value={rateSource}
                        onChange={(e) => {
                          const src = e.target.value as "divisas" | "billetes" | "manual";
                          setRateSource(src);
                          if (src === "divisas" && exchangeRates?.usdDivisaSell) setExchangeRate(exchangeRates.usdDivisaSell);
                          if (src === "billetes" && exchangeRates?.usdBilleteSell) setExchangeRate(exchangeRates.usdBilleteSell);
                        }}
                      >
                        <option value="divisas">Dólar Divisa BNA (Mayorista Comercial)</option>
                        <option value="billetes">Dólar Billete BNA (Minorista)</option>
                        <option value="manual">Manual (Personalizado)</option>
                      </select>
                    </label>

                    <label style={{ fontSize: "0.85rem" }}>
                      Tipo de Cambio Oficial ($ ARS / USD) *
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(Number(e.target.value))}
                        required
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Advance / Percentage Tool */}
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: 12, borderRadius: 8, marginTop: 14, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "bold", color: "#1e40af" }}>
                    ⚡ Facturación Parcial / Anticipo %:
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={advancePercent}
                    onChange={(e) => setAdvancePercent(Number(e.target.value))}
                    style={{ width: 75, textAlign: "center" }}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: "0.8rem", padding: "6px 12px", background: "#fff" }}
                    onClick={handleApplyAdvancePercentage}
                  >
                    Aplicar %
                  </button>
                </div>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Ajusta proporcionalmente las cantidades para facturar anticipos (ej: 30%, 50%).
                </span>
              </div>
            </div>

            {/* Items Table Card */}
            <div className="card pad">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>2. Ítems, Precios & Alícuotas de IVA</h3>
                <button type="button" className="btn ghost" onClick={handleAddItem}>
                  + Agregar Fila
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "30%" }}>Descripción / Producto</th>
                      <th style={{ width: "9%", textAlign: "center" }}>Cant.</th>
                      <th style={{ width: "16%", textAlign: "right" }}>Precio Unit.</th>
                      <th style={{ width: "10%", textAlign: "center" }}>Desc. %</th>
                      <th style={{ width: "14%", textAlign: "right" }}>Subtotal Neto</th>
                      <th style={{ width: "14%", textAlign: "center" }}>Alícuota IVA</th>
                      <th style={{ width: "7%", textAlign: "right" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const net = calculateItemNet(item);
                      return (
                        <tr key={idx}>
                          <td>
                            <div className="stack" style={{ gap: 4 }}>
                              <select
                                value={item.productId ?? ""}
                                onChange={(e) => handleItemProductSelect(idx, e.target.value)}
                                style={{ fontSize: "0.82rem" }}
                              >
                                <option value="">Seleccionar del catálogo...</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.code} - {p.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={item.description}
                                onChange={(e) => {
                                  const next = [...items];
                                  next[idx].description = e.target.value;
                                  setItems(next);
                                }}
                                required
                                placeholder="Descripción del ítem..."
                              />
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="1"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const next = [...items];
                                next[idx].quantity = Math.max(1, parseInt(e.target.value, 10) || 1);
                                setItems(next);
                              }}
                              style={{ textAlign: "center" }}
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.unitPrice}
                              onChange={(e) => {
                                const next = [...items];
                                next[idx].unitPrice = Number(e.target.value);
                                setItems(next);
                              }}
                              style={{ textAlign: "right" }}
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={item.discountPercent}
                              onChange={(e) => {
                                const next = [...items];
                                next[idx].discountPercent = Number(e.target.value);
                                setItems(next);
                              }}
                              style={{ textAlign: "center" }}
                              placeholder="0"
                            />
                          </td>
                          <td style={{ textAlign: "right", fontWeight: "bold" }}>
                            {currency === "USD" ? "USD " : "$ "}
                            {net.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </td>
                          <td>
                            <select
                              value={item.vatRate}
                              onChange={(e) => {
                                const next = [...items];
                                next[idx].vatRate = Number(e.target.value);
                                setItems(next);
                              }}
                              style={{ fontSize: "0.85rem" }}
                            >
                              <option value="21">21.0 %</option>
                              <option value="10.5">10.5 %</option>
                              <option value="27">27.0 %</option>
                              <option value="0">Exento (0%)</option>
                            </select>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn danger"
                              style={{ padding: "4px 8px" }}
                              onClick={() => handleRemoveItem(idx)}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes Card */}
            <div className="card pad">
              <label>
                Condiciones de Pago & Leyendas Fiscales
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="CBU para transferencias bancarias, N° de Orden de Compra del cliente..."
                />
              </label>
            </div>
          </div>

          {/* Right Sticky Totals Sidebar */}
          <div className="card pad" style={{ position: "sticky", top: 20 }}>
            <h3 style={{ margin: "0 0 16px", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
              Resumen de Totales
            </h3>

            <div className="stack" style={{ gap: 10, fontSize: "0.9rem" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted">Subtotal Neto Gravado:</span>
                <strong>
                  {currency === "USD" ? "USD " : "$ "}
                  {subtotalNeto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </strong>
              </div>

              {iva21 > 0 && (
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="muted">IVA 21.0%:</span>
                  <strong>
                    {currency === "USD" ? "USD " : "$ "}
                    {iva21.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              )}

              {iva105 > 0 && (
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="muted">IVA 10.5%:</span>
                  <strong>
                    {currency === "USD" ? "USD " : "$ "}
                    {iva105.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              )}

              {iva27 > 0 && (
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="muted">IVA 27.0%:</span>
                  <strong>
                    {currency === "USD" ? "USD " : "$ "}
                    {iva27.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              )}

              <hr style={{ margin: "8px 0", borderColor: "var(--border)" }} />

              <div className="row" style={{ justifyContent: "space-between", fontSize: "1.25rem", fontWeight: "bold" }}>
                <span>TOTAL:</span>
                <span style={{ color: "#047857" }}>
                  {currency === "USD" ? "USD " : "$ "}
                  {totalFactura.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {currency === "USD" && (
                <div style={{ background: "#f1f5f9", padding: "8px 12px", borderRadius: 6, marginTop: 4 }}>
                  <div className="row" style={{ justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span className="muted">Equiv. ARS (TC ${exchangeRate}):</span>
                    <strong>$ {equivArs.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="stack" style={{ gap: 10, marginTop: 24 }}>
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={(e) => handleSubmit(e, true)}
                style={{ background: "linear-gradient(180deg, #059669, #047857)", width: "100%", padding: 12, fontWeight: "bold" }}
              >
                {saving ? "Emitiendo..." : "⚡ Emitir con ARCA (CAE Directo)"}
              </button>

              <button
                type="submit"
                className="btn ghost"
                disabled={saving}
                style={{ width: "100%" }}
              >
                💾 Guardar como Borrador / Proforma
              </button>

              <Link
                to={orderId ? `/pedidos/${orderId}` : "/facturas"}
                className="btn ghost"
                style={{ width: "100%", textAlign: "center" }}
              >
                Cancelar
              </Link>
            </div>

            <div style={{ marginTop: 16, fontSize: "0.78rem", color: "#64748b", lineHeight: 1.4 }}>
              ℹ️ Al emitir con ARCA, el comprobante se enviará al Web Service de Facturación Electrónica (WSFE v1) obteniendo el CAE oficial y el código QR de verificación fiscal.
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
