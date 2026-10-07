import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import {
  type CustomerDetail,
  type CustomerSummary,
  type ExchangeRates,
  type Invoice,
  type InvoiceWrite,
  type Order,
  type OrderLine,
  type ProductSummary,
  type RemitoItem
} from "../api/types";
import { CustomerPicker, ProductPicker } from "../components/pickers";
import { isFceType, letterOf } from "../lib/documents";

interface FormInvoiceItem {
  productId?: string;
  remitoItemId?: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
}

function combinedDiscount(linePercent: number, orderPercent: number) {
  return Math.round((100 - (100 - linePercent) * (100 - orderPercent) / 100) * 10000) / 10000;
}

function orderLineForRemito(item: RemitoItem, order: Order): OrderLine | null {
  const description = item.description.replace(/\s*\(S\/N:.*\)\s*$/i, "").trim().toLocaleLowerCase();
  const sameDescription = (line: OrderLine) => line.description.trim().toLocaleLowerCase() === description;
  const byProduct = item.productId ? order.lines.filter((line) => line.productId === item.productId) : [];
  const matches = byProduct.length ? byProduct : order.lines.filter(sameDescription);
  const exact = matches.filter(sameDescription);
  const candidates = exact.length ? exact : matches;
  if (!candidates.length) return null;
  const first = candidates[0];
  return candidates.every((line) => line.unitPrice === first.unitPrice && line.discountPercent === first.discountPercent && line.taxRate === first.taxRate)
    ? first : null;
}

// IVA en centavos con el mismo redondeo que el servidor (Math.Round de .NET: mitad al par).
function vatCents(netCents: number, rate: number): number {
  const tenths = Math.round(rate * 10);
  const numerator = netCents * tenths;
  const quotient = Math.floor(numerator / 1000);
  const remainder = numerator - quotient * 1000;
  if (remainder * 2 > 1000) return quotient + 1;
  if (remainder * 2 < 1000) return quotient;
  return quotient % 2 === 0 ? quotient : quotient + 1;
}

// Neto (centavos) cuyo neto + IVA da exactamente el bruto pedido, o null si no existe.
function exactNet(grossCents: number, rate: number): number | null {
  const guess = Math.round(grossCents / (1 + rate / 100));
  for (let delta = -3; delta <= 3; delta++) {
    const net = guess + delta;
    if (net > 0 && net + vatCents(net, rate) === grossCents) return net;
  }
  return null;
}

// Reparte la diferencia de cambio (importe final, con IVA) en la misma proporción por alícuota
// que la factura original. Los renglones suman exactamente la diferencia, al centavo.
function splitDifference(total: number, original: Invoice): FormInvoiceItem[] {
  const groups = new Map<number, number>();
  for (const item of original.items) groups.set(item.vatRate, (groups.get(item.vatRate) ?? 0) + item.total);
  const base = [...groups.values()].reduce((a, b) => a + b, 0) || 1;
  const rates = [...groups.keys()].sort((a, b) => b - a);
  const totalCents = Math.round(total * 100);
  let assigned = 0;
  const lines: FormInvoiceItem[] = [];
  const line = (rate: number, netCents: number): FormInvoiceItem => ({
    code: "DIF-CAMBIO",
    description: rate ? `Diferencia de cambio (gravado ${rate}%)` : "Diferencia de cambio (exento)",
    quantity: 1,
    unitPrice: netCents / 100,
    discountPercent: 0,
    vatRate: rate
  });
  rates.forEach((rate, index) => {
    const gross = index === rates.length - 1
      ? totalCents - assigned
      : Math.round(totalCents * (groups.get(rate)! / base));
    if (gross <= 0) return;
    assigned += gross;
    const net = exactNet(gross, rate);
    if (net !== null) {
      lines.push(line(rate, net));
    } else {
      // Ese bruto no es alcanzable con un solo renglón: un centavo neto aparte (sin IVA por redondeo).
      lines.push(line(rate, exactNet(gross - 1, rate) ?? Math.round((gross - 1) / (1 + rate / 100))));
      lines.push(line(rate, 1));
    }
  });
  return lines;
}

// Un emisor Responsable Inscripto emite A a inscriptos y monotributistas, y B al resto.
const letterFor = (taxCondition: string) =>
  taxCondition === "ResponsableInscripto" || taxCondition === "Monotributo" ? "A" : "B";

export function InvoiceFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const orderId = queryParams.get("order_id");
  const remitoId = queryParams.get("remito_id");
  // Nota de crédito (NC) o débito (ND) generada desde una factura autorizada.
  const sourceInvoiceId = queryParams.get("origen");
  const noteKind = queryParams.get("nota") === "ND" ? "ND" : "NC";
  // Nota por la diferencia de cambio de una imputación de cobro (factura en USD cobrada en pesos).
  const differenceImputationId = queryParams.get("dif");

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
  const [fiscalConcept, setFiscalConcept] = useState<number>(0);
  const [serviceFrom, setServiceFrom] = useState<string>("");
  const [serviceTo, setServiceTo] = useState<string>("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [rateSource, setRateSource] = useState<"arca" | "divisas" | "billetes" | "manual">("divisas");
  const [arcaRateInfo, setArcaRateInfo] = useState<string | null>(null);
  // RG 5616: si se cobra en la misma moneda extranjera, la cotización es la oficial de ARCA.
  const [paidInForeignCurrency, setPaidInForeignCurrency] = useState(false);
  // Cotización BNA vendedor pactada para cancelar en pesos (día hábil anterior al pago).
  const [exchangeRateType, setExchangeRateType] = useState<"Divisa" | "Billete">("Divisa");
  const [differenceInfo, setDifferenceInfo] = useState<string | null>(null);
  // Factura de Crédito Electrónica: CBU/alias donde cobra la empresa (de Configuración) y modalidad.
  const [fceCbu, setFceCbu] = useState("");
  const [fceAlias, setFceAlias] = useState("");
  const [fceTransferMode, setFceTransferMode] = useState<"SCA" | "ADC">("SCA");
  const [fceCancellation, setFceCancellation] = useState(false);
  useEffect(() => {
    api.getCompanySettings().then((c) => {
      setFceCbu((c?.bankCbu ?? "").replace(/\D+/g, ""));
      setFceAlias(c?.bankAlias ?? "");
    }).catch(() => undefined);
  }, []);
  const [exchangeRate, setExchangeRate] = useState<number>(1.0);
  const [advancePercent, setAdvancePercent] = useState<number>(100);
  const [notes, setNotes] = useState<string>("");
  const [sourceRemitoNumber, setSourceRemitoNumber] = useState<string>("");
  const [returnedItemCount, setReturnedItemCount] = useState(0);
  const [sourceOrderId, setSourceOrderId] = useState<string>("");
  const [pricingWarning, setPricingWarning] = useState<string | null>(null);
  const [associatedInvoice, setAssociatedInvoice] = useState<Invoice | null>(null);
  const [restockItems, setRestockItems] = useState(true);

  const [items, setItems] = useState<FormInvoiceItem[]>([
    { productId: undefined, code: "SERV-01", description: "Servicio / Producto", quantity: 1, unitPrice: 10000, discountPercent: 0, vatRate: 21.0 }
  ]);

  // Load initial reference data
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [customerList, prodList, rates] = await Promise.all([
          api.listAllCustomers(),
          api.listProducts().catch(() => []),
          api.getExchangeRates().catch(() => null)
        ]);

        setCustomers(customerList);
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

        if (sourceInvoiceId) {
          const original = await api.getInvoice(sourceInvoiceId);
          const letter = original.invoiceType.replace(/^(NC_|ND_)/, "");
          setAssociatedInvoice(original);
          setInvoiceType(`${noteKind}_${letter}`);
          setPointOfSale(original.pointOfSale);
          setCustomerId(original.customerId);
          setCustomerName(original.customerName);
          setCustomerDocument(original.customerDocument);
          setCustomerTaxCondition(original.customerTaxCondition);
          setCustomerAddress(original.customerAddress ?? "");
          setFiscalConcept(original.fiscalConcept);
          setServiceFrom(original.serviceFrom?.slice(0, 10) ?? "");
          setServiceTo(original.serviceTo?.slice(0, 10) ?? "");
          setCurrency(original.currency === "USD" ? "USD" : "ARS");
          setPaidInForeignCurrency(Boolean(original.paidInForeignCurrency));
          setExchangeRate(original.exchangeRate || 1);
          setRateSource(original.paidInForeignCurrency ? "arca" : "manual");
          setExchangeRateType(original.exchangeRateType === "Billete" ? "Billete" : "Divisa");
          setNotes(`${noteKind === "NC" ? "Nota de crédito" : "Nota de débito"} sobre Factura ${letter} ${original.formattedNumber}`);
          if (differenceImputationId) {
            const imp = await api.getCollectionImputation(differenceImputationId);
            const diff = Math.abs(imp.exchangeDifferenceArs ?? 0);
            const label = `Diferencia de cambio s/ Factura ${letter} ${original.formattedNumber} · ${imp.receiptNumber}: ` +
              `USD ${(imp.amountUsd ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })} a TC $ ${(imp.paymentExchangeRate ?? 0).toLocaleString("es-AR")} ` +
              `vs TC $ ${(imp.invoiceExchangeRate ?? 0).toLocaleString("es-AR")}`;
            setCurrency("ARS");
            setExchangeRate(1);
            setPaidInForeignCurrency(false);
            setNotes(label);
            setDifferenceInfo(label);
            setItems(splitDifference(diff, original));
          } else
          setItems(noteKind === "NC"
            ? original.items.map((item) => ({
                productId: item.productId ?? undefined,
                code: item.code,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discountPercent: 0,
                vatRate: item.vatRate
              }))
            : [{ code: "AJUSTE", description: "Ajuste / recargo", quantity: 1, unitPrice: 0, discountPercent: 0, vatRate: 21 }]);
        }

        if (orderId) {
          const order = await api.getOrder(orderId);
          if (order) {
            let custDetail: CustomerDetail | null = null;
            if (order.customerId && order.customerId !== "00000000-0000-0000-0000-000000000000") {
              custDetail = await api.getCustomer(order.customerId).catch(() => null);
            }

            const foundName = custDetail?.legalName || customerList.find((c) => c.id === order.customerId)?.legalName || "";
            const foundDoc = custDetail?.documentNumber || customerList.find((c) => c.id === order.customerId)?.documentNumber || "";
            const foundTax = custDetail?.taxCondition || customerList.find((c) => c.id === order.customerId)?.taxCondition || "ResponsableInscripto";

            setCustomerId(order.customerId);
            setCustomerName(foundName);
            setCustomerDocument(foundDoc);
            setCustomerTaxCondition(foundTax);
            setCustomerDetail(custDetail);

            setInvoiceType(letterFor(foundTax));

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
            const orderRate = order.currency === "USD_BILLETE" ? order.exchangeRateUsdBillete : order.exchangeRateUsdDivisa;
            setCurrency(isUsd ? "USD" : "ARS");
            setRateSource(order.currency === "USD_BILLETE" ? "billetes" : "divisas");
            setExchangeRate(isUsd ? (orderRate || defaultRate) : 1.0);
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
                    unitPrice: i.unitPrice ?? 0,
                    discountPercent: combinedDiscount(i.discountPercent || 0, order.discountPercent || 0),
                    vatRate: i.taxRate ?? 21.0
                  };
                })
              );
            }
          }
        } else if (remitoId) {
          const remito = await api.getRemito(remitoId);
          if (remito) {
            if (remito.invoiceId) throw new Error("Este remito ya fue facturado.");
            setSourceRemitoNumber(remito.remitoNumber);
            let custDetail: CustomerDetail | null = null;
            if (remito.customerId) {
              custDetail = await api.getCustomer(remito.customerId).catch(() => null);
            }
            setCustomerDetail(custDetail);

            const foundTax = custDetail?.taxCondition || "ResponsableInscripto";
            setCustomerId(remito.customerId);
            setCustomerName(custDetail?.legalName || remito.customerName);
            setCustomerDocument(custDetail?.documentNumber || remito.customerDocument);
            setCustomerTaxCondition(foundTax);
            setInvoiceType(letterFor(foundTax));
            setCustomerAddress(remito.deliveryAddress || "");
            setNotes(`Emitida a partir del Remito de Entrega N° ${remito.remitoNumber}`);

            const linkedOrder = remito.orderId ? await api.getOrder(remito.orderId) : null;
            if (linkedOrder && linkedOrder.customerId !== remito.customerId) {
              throw new Error("El cliente del remito no coincide con el pedido vinculado. Revisá el origen antes de facturar.");
            }
            if (linkedOrder) {
              setSourceOrderId(linkedOrder.id);
              const isUsd = linkedOrder.currency !== "ARS";
              const orderRate = linkedOrder.currency === "USD_BILLETE"
                ? linkedOrder.exchangeRateUsdBillete : linkedOrder.exchangeRateUsdDivisa;
              setCurrency(isUsd ? "USD" : "ARS");
              setRateSource(linkedOrder.currency === "USD_BILLETE" ? "billetes" : "divisas");
              setExchangeRate(isUsd ? (orderRate || defaultRate) : 1.0);
            }

            const previousReturns = await api.listRemitoReturns(remito.id);
            const returned = new Map<string, number>();
            for (const record of previousReturns) for (const item of record.items) {
              returned.set(item.remitoItemId, (returned.get(item.remitoItemId) ?? 0) + item.quantity);
            }
            const remitoItems = (remito.items || [])
              .map((i) => ({ ...i, billableQty: Math.max(0, i.quantity - (returned.get(i.id) ?? 0)) }))
              .filter((i) => i.billableQty > 0);
            setReturnedItemCount((remito.items || []).filter((i) => (returned.get(i.id) ?? 0) > 0).length);
            if (remitoItems.length > 0) {
              let unmatched = 0;
              setItems(remitoItems.map((i) => {
                const prod = prodList.find((p) => (i.productId && p.id === i.productId) || (i.code && p.code.toLowerCase() === i.code.toLowerCase()));
                const orderLine = linkedOrder ? orderLineForRemito(i, linkedOrder) : null;
                if (!orderLine) unmatched++;
                return {
                  productId: i.productId ?? prod?.id ?? undefined,
                  remitoItemId: i.id,
                  code: i.code || prod?.code || "ITEM",
                  description: i.description || prod?.name || "Ítem despachado",
                  quantity: i.billableQty,
                  unitPrice: orderLine?.unitPrice ?? 0,
                  discountPercent: orderLine ? combinedDiscount(orderLine.discountPercent || 0, linkedOrder?.discountPercent || 0) : 0,
                  vatRate: orderLine?.taxRate ?? prod?.taxRate ?? 21.0
                };
              }));
              if (unmatched) setPricingWarning(`${unmatched} ítem(s) del remito no tienen un precio identificable en el pedido. Completá y verificá precio e IVA antes de facturar.`);
            } else {
              setItems([]);
              setPricingWarning("Todos los ítems del remito fueron devueltos. No queda saldo para facturar.");
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
  }, [orderId, remitoId, sourceInvoiceId, noteKind, differenceImputationId]);

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
      setInvoiceType(letterFor(taxCond));

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

  // Cotización oficial de ARCA (BNA divisa vendedor del día hábil anterior) para la fecha de emisión.
  useEffect(() => {
    if (currency !== "USD" || rateSource !== "arca") return;
    let cancelled = false;
    api.getArcaExchangeRate(issueDate)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setExchangeRate(r.rate);
          const d = r.rateDate;
          const env = r.production ? "" : " · ARCA homologación (datos de prueba)";
          setArcaRateInfo((d.length === 8 ? `Cotización ARCA del ${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : "Cotización ARCA vigente") + env);
        } else {
          setArcaRateInfo(r.detail || "No se pudo obtener la cotización de ARCA.");
        }
      })
      .catch(() => !cancelled && setArcaRateInfo("No se pudo obtener la cotización de ARCA."));
    return () => { cancelled = true; };
  }, [currency, rateSource, issueDate]);

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
    if (newCurrency === "USD") setRateSource("arca");
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

  // ¿Este cliente debe recibir Factura de Crédito Electrónica MiPyMEs por este importe? (consulta ARCA)
  const [fceCheck, setFceCheck] = useState<{ ok: boolean; obligated: boolean; minimumAmount: number; required: boolean; detail: string } | null>(null);
  const fceCuit = customerDocument.replace(/\D+/g, "");
  const fceTotal = Math.round(totalFactura * 100) / 100;
  useEffect(() => {
    if (fceCuit.length !== 11 || fceTotal <= 0 || associatedInvoice || invoiceType === "Proforma") {
      setFceCheck(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.getFceObligation(fceCuit, issueDate, fceTotal, currency === "USD" ? exchangeRate || 1 : 1)
        .then((r) => !cancelled && setFceCheck(r))
        .catch(() => !cancelled && setFceCheck(null));
    }, 700);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [fceCuit, fceTotal, issueDate, currency, exchangeRate, associatedInvoice, invoiceType]);
  const equivArs = currency === "USD" ? totalFactura * (exchangeRate || 1) : totalFactura;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError("Por favor seleccioná un cliente para guardar el borrador.");
      return;
    }

    if (remitoId && items.length === 0) {
      setError("No quedan ítems del remito para facturar.");
      return;
    }
    if (remitoId && items.some((item) => item.unitPrice <= 0)) {
      setError("Revisá los precios del remito: todos los ítems deben tener un precio unitario mayor que cero antes de facturar.");
      return;
    }

    if (fiscalConcept === 0) {
      setError("Seleccioná si se facturan productos, servicios o ambos.");
      return;
    }
    if ((invoiceType === "FCE_A" || invoiceType === "FCE_B") && fceCbu.replace(/\D+/g, "").length !== 22) {
      setError("La Factura de Crédito Electrónica requiere el CBU de 22 dígitos donde cobra la empresa.");
      return;
    }
    if ((fiscalConcept === 2 || fiscalConcept === 3) &&
        (!serviceFrom || !serviceTo || serviceTo < serviceFrom || dueDate < issueDate)) {
      setError("Indicá un período válido del servicio y un vencimiento no anterior a la emisión.");
      return;
    }

    const payload: InvoiceWrite = {
      invoiceType,
      pointOfSale,
      issueDate,
      orderId: orderId || sourceOrderId || undefined,
      remitoId: remitoId || undefined,
      customerId,
      customerName,
      customerDocument,
      customerTaxCondition,
      customerAddress,
      dueDate,
      fiscalConcept,
      serviceFrom: fiscalConcept === 2 || fiscalConcept === 3 ? serviceFrom : undefined,
      serviceTo: fiscalConcept === 2 || fiscalConcept === 3 ? serviceTo : undefined,
      currency,
      exchangeRate: currency === "USD" ? exchangeRate : 1.0,
      paidInForeignCurrency: currency === "USD" && paidInForeignCurrency,
      // El dólar pactado sale de la cotización elegida; solo con TC manual se elige aparte.
      exchangeRateType: currency !== "USD" ? undefined
        : rateSource === "billetes" ? "Billete"
        : rateSource === "manual" ? exchangeRateType
        : "Divisa",
      exchangeDifferenceImputationId: differenceImputationId || undefined,
      ...(isFceType(invoiceType) ? {
        fceCbu: fceCbu || undefined,
        fceAlias: fceAlias || undefined,
        fceTransferMode,
        fceCancellation: invoiceType.startsWith("NC_") || invoiceType.startsWith("ND_") ? fceCancellation : undefined
      } : {}),
      associatedInvoiceId: associatedInvoice?.id,
      restockItems: noteKind === "NC" ? restockItems : undefined,
      notes,
      items: items.map((i) => ({
        productId: i.productId,
        remitoItemId: i.remitoItemId,
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
          <h1>📄 {orderId ? "Preparar borrador desde Pedido" : remitoId ? "Preparar borrador desde Remito" : "Preparar borrador de factura"}</h1>
          <p className="muted">
            Este formulario guarda un borrador interno; todavía no autoriza el comprobante en ARCA.
          </p>
        </div>
        <Link className="btn ghost" to={orderId ? `/pedidos/${orderId}` : "/facturas"}>
          ← Volver
        </Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {pricingWarning && <div className="alert">{pricingWarning}</div>}
      {remitoId && returnedItemCount > 0 && <div className="card pad" style={{ background: "#eff6ff" }}>
        ↩ {returnedItemCount} ítem(s) tienen devoluciones confirmadas. Se facturan solo las cantidades efectivamente utilizadas.
      </div>}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem", alignItems: "start" }}>
          {/* Main Column */}
          <div className="stack" style={{ gap: 20 }}>
            {fceCheck && (
              <div className="card pad" role="status" style={{
                background: fceCheck.required ? "#fffbeb" : "#f8fafc",
                border: `1px solid ${fceCheck.required ? "#f59e0b" : "#e2e8f0"}`
              }}>
                {!fceCheck.ok ? (
                  <span className="muted">No se pudo verificar en ARCA si corresponde Factura de Crédito Electrónica: {fceCheck.detail}</span>
                ) : fceCheck.required && isFceType(invoiceType) ? (
                  <span>✓ Corresponde Factura de Crédito Electrónica y es lo que estás emitiendo.</span>
                ) : fceCheck.required ? (
                  <>
                    <strong>Corresponde Factura de Crédito Electrónica MiPyMEs (FCE).</strong>
                    <div style={{ fontSize: "0.88rem", marginTop: 4 }}>
                      ARCA informa que este cliente está obligado a recibir FCE desde {fceCheck.minimumAmount.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}, y esta factura supera ese monto.
                    </div>
                    <button type="button" className="btn compact" style={{ marginTop: 8 }}
                      onClick={() => setInvoiceType(`FCE_${letterOf(invoiceType) === "B" ? "B" : "A"}`)}>
                      Cambiar a Factura de Crédito Electrónica
                    </button>
                  </>
                ) : isFceType(invoiceType) && !invoiceType.startsWith("NC_") && !invoiceType.startsWith("ND_") ? (
                  <>
                    <strong style={{ color: "#92400e" }}>
                      {fceCheck.obligated
                        ? `Por este importe corresponde factura común: este cliente recibe FCE desde ${fceCheck.minimumAmount.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}.`
                        : "Este cliente no está obligado a recibir Factura de Crédito Electrónica: corresponde factura común."}
                    </strong>
                    <div>
                      <button type="button" className="btn compact" style={{ marginTop: 8 }}
                        onClick={() => setInvoiceType(letterOf(invoiceType) === "B" ? "B" : "A")}>
                        Cambiar a factura común
                      </button>
                    </div>
                  </>
                ) : fceCheck.obligated ? (
                  <span className="muted">
                    Este cliente recibe FCE desde {fceCheck.minimumAmount.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}; por este importe corresponde factura común.
                  </span>
                ) : (
                  <span className="muted">Verificado en ARCA: este cliente no está obligado a recibir Factura de Crédito Electrónica.</span>
                )}
              </div>
            )}
            {associatedInvoice ? (
              <div className="card pad" style={{ background: "#f8fafc", border: "1px solid #cbd5e1" }}>
                <strong>
                  {noteKind === "NC" ? "Nota de crédito" : "Nota de débito"} sobre Factura{" "}
                  {associatedInvoice.invoiceType.replace(/^(NC_|ND_)/, "")} {associatedInvoice.formattedNumber}
                </strong>
                {differenceInfo && (
                  <div style={{ fontSize: "0.85rem", color: "#0f766e", marginTop: 4, fontWeight: 600 }}>{differenceInfo}</div>
                )}
                <div style={{ fontSize: "0.85rem", color: "#475569", marginTop: 4 }}>
                  {associatedInvoice.customerName} · Total original {associatedInvoice.currency === "USD" ? "USD" : "$"}{" "}
                  {associatedInvoice.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}.{" "}
                  {noteKind === "NC"
                    ? "Quitá los ítems que no se acreditan o ajustá cantidades y precios para una nota parcial."
                    : "Cargá el recargo, interés o diferencia de precio a debitar."}
                </div>
                {noteKind === "NC" && !differenceImputationId && (
                  <label style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start", gap: 8, alignItems: "center", marginTop: 8, fontSize: "0.88rem" }}>
                    <input type="checkbox" checked={restockItems} onChange={(e) => setRestockItems(e.target.checked)} style={{ width: "auto" }} />
                    Es una devolución: reingresar los productos al stock
                  </label>
                )}
              </div>
            ) : sourceRemitoNumber ? (
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
                  <strong>Venta Directa / Mostrador:</strong> Al guardar este borrador, el stock de los productos inventariables se descontará automáticamente del depósito.
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
                  <CustomerPicker
                    value={customerId}
                    onChange={(id) => handleCustomerChange(id)}
                    options={customers}
                    disabled={Boolean(associatedInvoice)}
                    required
                  />
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
                  Concepto fiscal *
                  <select value={fiscalConcept} onChange={(e) => setFiscalConcept(Number(e.target.value))} required>
                    <option value={0}>— Elegí un concepto —</option>
                    <option value={1}>Productos</option>
                    <option value={2}>Servicios</option>
                    <option value={3}>Productos y servicios</option>
                  </select>
                </label>
                {(fiscalConcept === 2 || fiscalConcept === 3) && <>
                  <label>
                    Servicio desde *
                    <input type="date" value={serviceFrom} onChange={(e) => setServiceFrom(e.target.value)} required />
                  </label>
                  <label>
                    Servicio hasta *
                    <input type="date" min={serviceFrom || undefined} value={serviceTo} onChange={(e) => setServiceTo(e.target.value)} required />
                  </label>
                </>}
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
                    disabled={Boolean(associatedInvoice)}
                    required
                  >
                    <option value="A">Factura A (Resp. Inscripto / Monotributo)</option>
                    <option value="B">Factura B (Cons. Final / Exento)</option>
                    <option value="C">Factura C (Emisor Monotributo)</option>
                    <option value="M">Factura M (Régimen Retención)</option>
                    <option value="FCE_A">Factura de Crédito Electrónica A (MiPyMEs)</option>
                    <option value="FCE_B">Factura de Crédito Electrónica B (MiPyMEs)</option>
                    {associatedInvoice && <>
                      <option value="NC_A">Nota de Crédito A</option>
                      <option value="NC_B">Nota de Crédito B</option>
                      <option value="ND_A">Nota de Débito A</option>
                      <option value="ND_B">Nota de Débito B</option>
                      <option value="NC_FCE_A">Nota de Crédito FCE A</option>
                      <option value="ND_FCE_A">Nota de Débito FCE A</option>
                      <option value="NC_FCE_B">Nota de Crédito FCE B</option>
                      <option value="ND_FCE_B">Nota de Débito FCE B</option>
                    </>}
                    <option value="Proforma">Factura Proforma / Interna</option>
                  </select>
                </label>

                {isFceType(invoiceType) && !invoiceType.startsWith("NC_") && !invoiceType.startsWith("ND_") && (
                  <>
                    <label>
                      CBU de cobro (FCE) *
                      <input value={fceCbu} inputMode="numeric" maxLength={22} placeholder="22 dígitos"
                        onChange={(e) => setFceCbu(e.target.value.replace(/\D+/g, ""))} />
                      <span className="muted" style={{ fontSize: "0.78rem" }}>Debe estar registrado en ARCA a nombre de la empresa.</span>
                    </label>
                    <label>
                      Alias (opcional)
                      <input value={fceAlias} maxLength={20} onChange={(e) => setFceAlias(e.target.value)} />
                    </label>
                    <label>
                      Transferencia de la FCE
                      <select value={fceTransferMode} onChange={(e) => setFceTransferMode(e.target.value as "SCA" | "ADC")}>
                        <option value="SCA">Sistema de Circulación Abierta (SCA)</option>
                        <option value="ADC">Agente de Depósito Colectivo (ADC)</option>
                      </select>
                    </label>
                  </>
                )}
                {isFceType(invoiceType) && (invoiceType.startsWith("NC_") || invoiceType.startsWith("ND_")) && (
                  <label style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={fceCancellation} onChange={(e) => setFceCancellation(e.target.checked)} style={{ width: "auto" }} />
                    Es de anulación: el cliente rechazó la Factura de Crédito en ARCA
                  </label>
                )}

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
                          const src = e.target.value as "arca" | "divisas" | "billetes" | "manual";
                          setRateSource(src);
                          if (src === "billetes") setExchangeRateType("Billete");
                          if (src === "divisas" || src === "arca") setExchangeRateType("Divisa");
                          if (src === "divisas" && exchangeRates?.usdDivisaSell) setExchangeRate(exchangeRates.usdDivisaSell);
                          if (src === "billetes" && exchangeRates?.usdBilleteSell) setExchangeRate(exchangeRates.usdBilleteSell);
                        }}
                      >
                        <option value="arca">Oficial ARCA (BNA divisa, día hábil anterior)</option>
                        <option value="divisas" disabled={paidInForeignCurrency}>Dólar Divisa BNA (Mayorista Comercial)</option>
                        <option value="billetes" disabled={paidInForeignCurrency}>Dólar Billete BNA (Minorista)</option>
                        <option value="manual" disabled={paidInForeignCurrency}>Manual (Personalizado)</option>
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
                        readOnly={rateSource === "arca"}
                        required
                      />
                      {rateSource === "arca" && arcaRateInfo && <span className="muted" style={{ fontSize: "0.78rem" }}>{arcaRateInfo}</span>}
                    </label>
                  </div>
                  <label style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start", gap: 8, alignItems: "center", marginTop: 10, fontSize: "0.85rem" }}>
                    <input
                      type="checkbox"
                      checked={paidInForeignCurrency}
                      onChange={(e) => {
                        setPaidInForeignCurrency(e.target.checked);
                        if (e.target.checked) setRateSource("arca");
                      }}
                      style={{ width: "auto" }}
                    />
                    Se cobra en dólares (el cliente paga en USD). ARCA exige la cotización oficial.
                  </label>
                  {!paidInForeignCurrency && rateSource === "manual" && (
                    <label style={{ fontSize: "0.85rem", marginTop: 8 }}>
                      Cotización pactada para cobrar en pesos
                      <select value={exchangeRateType} onChange={(e) => setExchangeRateType(e.target.value as "Divisa" | "Billete")}>
                        <option value="Divisa">Dólar divisa BNA vendedor, día hábil anterior al pago</option>
                        <option value="Billete">Dólar billete BNA vendedor, día hábil anterior al pago</option>
                      </select>
                    </label>
                  )}
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
                {!remitoId && <button type="button" className="btn ghost" onClick={handleAddItem}>
                  + Agregar Fila
                </button>}
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
                              <ProductPicker
                                aria-label={`Producto del renglón ${idx + 1}`}
                                value={item.productId ?? ""}
                                onChange={(id) => handleItemProductSelect(idx, id)}
                                products={products}
                                disabled={Boolean(remitoId)}
                                placeholder="Elegir del catálogo"
                              />
                              <input
                                value={item.description}
                                onChange={(e) => {
                                  const next = [...items];
                                  next[idx].description = e.target.value;
                                  setItems(next);
                                }}
                                required
                                readOnly={Boolean(remitoId)}
                                placeholder="Descripción del ítem..."
                              />
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.0001"
                              min="0.0001"
                              value={item.quantity}
                              readOnly={Boolean(remitoId)}
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
                              step="0.0001"
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
                            {!remitoId && <button
                              type="button"
                              className="btn danger"
                              style={{ padding: "4px 8px" }}
                              onClick={() => handleRemoveItem(idx)}
                            >
                              ✕
                            </button>}
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
                type="submit"
                className="btn ghost"
                disabled={saving}
                style={{ width: "100%" }}
              >
                💾 Guardar borrador
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
              Este botón guarda un borrador interno. Todavía no solicita CAE ni autoriza el comprobante en ARCA.
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
