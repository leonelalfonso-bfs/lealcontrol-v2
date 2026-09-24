import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import {
  provinces,
  type CustomerDetail,
  type CustomerSummary,
  type ExchangeRates,
  type Product,
  type ProductCategory,
  type QuoteLineWrite,
  type QuoteWrite
} from "../api/types";
import { QuickCustomerModal } from "../components/QuickCustomerModal";
import { QuickProductModal } from "../components/QuickProductModal";

interface FormQuoteLine extends QuoteLineWrite {
  nativeCurrency: string;
  nativeUnitPrice: number;
  technicalDetail?: string | null;
}

export const QuoteFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<CustomerDetail | null>(null);
  const [productsCatalog, setProductsCatalog] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<string>("");
  const [quoteNumber, setQuoteNumber] = useState<string>("");

  // Form Fields
  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [contactId, setContactId] = useState("");
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("ARS");
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [validDays, setValidDays] = useState<number>(15);
  const [paymentTerms, setPaymentTerms] = useState("50% anticipo, saldo contra entrega");
  const [paymentMethod, setPaymentMethod] = useState("Transferencia Bancaria");
  const [deliveryTimeDays, setDeliveryTimeDays] = useState<number>(15);
  const [transportation, setTransportation] = useState("Flete a cargo del comprador");
  const [warranty, setWarranty] = useState("12 meses de garantía oficial");
  const [notes, setNotes] = useState("");
  const [ownerName, setOwnerName] = useState("");

  // Line items
  const [lines, setLines] = useState<FormQuoteLine[]>([
    {
      productId: null,
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      taxRate: 21,
      isOptional: false,
      technicalDetail: "",
      nativeCurrency: "ARS",
      nativeUnitPrice: 0
    }
  ]);

  // Quick Modals Visibility
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false);
  const [showQuickProductModal, setShowQuickProductModal] = useState(false);
  const [quickProductLineIndex, setQuickProductLineIndex] = useState<number | null>(null);
  const [technicalLineIndex, setTechnicalLineIndex] = useState<number | null>(null);
  const [technicalDraft, setTechnicalDraft] = useState("");

  // Secondary Mini Modals for existing customer (Plant/Contact)
  const [showNewLocationModal, setShowNewLocationModal] = useState(false);
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [newLocName, setNewLocName] = useState("");
  const [newLocStreet, setNewLocStreet] = useState("");
  const [newLocCity, setNewLocCity] = useState("");
  const [newLocProvince, setNewLocProvince] = useState<string>("SantaFe");
  const [newLocPostalCode, setNewLocPostalCode] = useState("");
  const [newLocPhone, setNewLocPhone] = useState("");
  const [newLocNotes, setNewLocNotes] = useState("");

  const [newConName, setNewConName] = useState("");
  const [newConRole, setNewConRole] = useState("Commercial");
  const [newConLocationId, setNewConLocationId] = useState("");
  const [newConEmail, setNewConEmail] = useState("");
  const [newConPhone, setNewConPhone] = useState("");
  const [newConWhatsApp, setNewConWhatsApp] = useState("");
  const [newConIsPrimary, setNewConIsPrimary] = useState(false);
  const [newConNotes, setNewConNotes] = useState("");

  const convertCurrency = (
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): number => {
    if (!amount || fromCurrency === toCurrency) return amount;

    const rateBillete = rates?.usdBillete.venta ?? 1510.00;
    const rateDivisa = rates?.usdDivisa.venta ?? 1487.50;

    let inArs = amount;
    if (fromCurrency === "USD_BILLETE") {
      inArs = amount * rateBillete;
    } else if (fromCurrency === "USD_DIVISA") {
      inArs = amount * rateDivisa;
    }

    if (toCurrency === "ARS") {
      return Math.round(inArs * 100) / 100;
    } else if (toCurrency === "USD_BILLETE") {
      return Math.round((inArs / rateBillete) * 100) / 100;
    } else if (toCurrency === "USD_DIVISA") {
      return Math.round((inArs / rateDivisa) * 100) / 100;
    }

    return amount;
  };

  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        const [custData, prodsData, catsData, ratesData] = await Promise.all([
          api.listCustomers(""),
          api.listProducts(),
          api.listCategories().catch(() => [] as ProductCategory[]),
          api.getExchangeRates().catch(() => null)
        ]);

        setCustomers(custData.items);
        setProductsCatalog(prodsData);
        setCategories(catsData);
        if (ratesData) setRates(ratesData);

        if (isEditing && id) {
          const q = await api.getQuote(id);
          setQuoteStatus(q.status);
          setQuoteNumber(q.quoteNumber);
          setCustomerId(q.customerId);
          setLocationId(q.locationId ?? "");
          setContactId(q.contactId ?? "");
          setOpportunityId(q.opportunityId ?? null);
          setCurrency(q.currency);
          setDiscountPercent(q.discountPercent);
          setValidDays(q.validDays);
          setPaymentTerms(q.paymentTerms ?? "");
          setPaymentMethod(q.paymentMethod ?? "");
          setDeliveryTimeDays(q.deliveryTimeDays ?? 15);
          setTransportation(q.transportation ?? "");
          setWarranty(q.warranty ?? "");
          setNotes(q.notes ?? "");
          setOwnerName(q.ownerName ?? "");

          if (q.lines && q.lines.length > 0) {
            setLines(
              q.lines.map((l) => ({
                productId: l.productId ?? null,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountPercent: l.discountPercent,
                taxRate: l.taxRate,
                isOptional: l.isOptional,
                technicalDetail: l.technicalDetail ?? "",
                nativeCurrency: q.currency,
                nativeUnitPrice: l.unitPrice
              }))
            );
          }
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al inicializar formulario");
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, [id, isEditing]);

  // When customer changes, load customer details for plants/contacts
  useEffect(() => {
    if (!customerId) {
      setSelectedCustomerDetail(null);
      return;
    }

    api.getCustomer(customerId)
      .then((detail) => {
        setSelectedCustomerDetail(detail);
        if (!isEditing) {
          const primaryContact = detail.contacts.find((c) => c.isPrimary) || detail.contacts[0];
          if (primaryContact) setContactId(primaryContact.id);
          if (detail.locations.length > 0) setLocationId(detail.locations[0].id);
        }
      })
      .catch((err) => console.error("Error al cargar detalle del cliente", err));
  }, [customerId, isEditing]);

  // Customer created from QuickCustomerModal
  const handleCustomerCreated = (
    newCust: CustomerDetail,
    defaultLocationId?: string,
    defaultContactId?: string
  ) => {
    setCustomers((prev) => [
      {
        id: newCust.id,
        legalName: newCust.legalName,
        tradeName: newCust.tradeName,
        documentType: newCust.documentType,
        documentNumber: newCust.documentNumber,
        taxCondition: newCust.taxCondition,
        status: newCust.status,
        isCustomer: newCust.isCustomer,
        isSupplier: newCust.isSupplier
      },
      ...prev
    ]);
    setCustomerId(newCust.id);
    setSelectedCustomerDetail(newCust);
    if (defaultLocationId) setLocationId(defaultLocationId);
    if (defaultContactId) setContactId(defaultContactId);
  };

  // Product created from QuickProductModal
  const handleProductCreated = (newProd: Product) => {
    setProductsCatalog((prev) => [newProd, ...prev]);

    const targetIdx = quickProductLineIndex;
    if (targetIdx !== null && targetIdx >= 0 && targetIdx < lines.length) {
      handleSelectProductForLine(targetIdx, newProd.id);
    } else {
      // Append as a new line
      const convertedPrice = convertCurrency(
        newProd.basePrice,
        newProd.saleCurrency,
        currency
      );
      setLines((prev) => [
        ...prev,
        {
          productId: newProd.id,
          description: `[${newProd.code}] ${newProd.name}`,
          quantity: 1,
          unitPrice: convertedPrice,
          discountPercent: 0,
          taxRate: newProd.taxRate,
          isOptional: false,
          nativeCurrency: newProd.saleCurrency,
          nativeUnitPrice: newProd.basePrice
        }
      ]);
    }
  };

  // Plant / Location Creation for existing customer
  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) return;
    if (!newLocName.trim()) return;

    try {
      const body = {
        name: newLocName.trim(),
        address: {
          street: newLocStreet.trim() || selectedCustomerDetail?.fiscalAddress?.street || "Calle Principal",
          city: newLocCity.trim() || selectedCustomerDetail?.fiscalAddress?.city || "San Lorenzo",
          province: newLocProvince || "SantaFe",
          postalCode: newLocPostalCode.trim() || "2200",
          country: "Argentina"
        },
        phone: newLocPhone.trim() || undefined,
        notes: newLocNotes.trim() || undefined
      };

      const updatedCust = await api.addLocation(customerId, body);
      setSelectedCustomerDetail(updatedCust);

      const newlyCreatedLoc = updatedCust.locations.find((l) => l.name === newLocName.trim()) || updatedCust.locations[updatedCust.locations.length - 1];
      if (newlyCreatedLoc) {
        setLocationId(newlyCreatedLoc.id);
      }

      setShowNewLocationModal(false);
      setNewLocName("");
      setNewLocStreet("");
      setNewLocCity("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al crear planta");
    }
  };

  // Contact Creation for existing customer
  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) return;
    if (!newConName.trim()) return;

    try {
      const body = {
        name: newConName.trim(),
        role: newConRole,
        locationId: newConLocationId || null,
        email: newConEmail.trim() || undefined,
        phone: newConPhone.trim() || undefined,
        whatsApp: newConWhatsApp.trim() || undefined,
        isPrimary: newConIsPrimary || selectedCustomerDetail?.contacts.length === 0,
        notes: newConNotes.trim() || undefined
      };

      const updatedCust = await api.addContact(customerId, body);
      setSelectedCustomerDetail(updatedCust);

      const newlyCreatedCon = updatedCust.contacts.find((c) => c.name === newConName.trim()) || updatedCust.contacts[updatedCust.contacts.length - 1];
      if (newlyCreatedCon) {
        setContactId(newlyCreatedCon.id);
      }

      setShowNewContactModal(false);
      setNewConName("");
      setNewConEmail("");
      setNewConPhone("");
      setNewConWhatsApp("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al crear contacto");
    }
  };

  const handleQuoteCurrencyChange = (newCurrency: string) => {
    setCurrency(newCurrency);
    setLines((prev) =>
      prev.map((line) => {
        const converted = convertCurrency(line.nativeUnitPrice, line.nativeCurrency, newCurrency);
        return {
          ...line,
          unitPrice: converted
        };
      })
    );
  };

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        productId: null,
        description: "",
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        taxRate: 21,
        isOptional: false,
        nativeCurrency: currency,
        nativeUnitPrice: 0
      }
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: keyof FormQuoteLine, val: unknown) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };

      if (field === "nativeCurrency" || field === "nativeUnitPrice") {
        const line = copy[index];
        line.unitPrice = convertCurrency(line.nativeUnitPrice, line.nativeCurrency, currency);
      } else if (field === "unitPrice") {
        const line = copy[index];
        line.nativeUnitPrice = Number(val) || 0;
        line.nativeCurrency = currency;
      }

      return copy;
    });
  };

  const handleSelectProductForLine = (index: number, prodId: string) => {
    if (!prodId) {
      handleLineChange(index, "productId", null);
      return;
    }

    const prod = productsCatalog.find((p) => p.id === prodId);
    if (!prod) return;

    const prodNativeCurrency = prod.saleCurrency || "ARS";
    const prodNativePrice = prod.basePrice || 0;
    const convertedUnitPrice = convertCurrency(prodNativePrice, prodNativeCurrency, currency);

    setLines((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        productId: prod.id,
        description: `[${prod.code}] ${prod.name}`,
        nativeCurrency: prodNativeCurrency,
        nativeUnitPrice: prodNativePrice,
        unitPrice: convertedUnitPrice,
        taxRate: prod.taxRate,
        technicalDetail: copy[index].technicalDetail?.trim()
          ? copy[index].technicalDetail
          : (prod.detailedDescription ?? "")
      };
      return copy;
    });
  };

  // Calculations
  const calculatedLines = lines.map((l) => {
    const gross = l.quantity * l.unitPrice;
    const discounted = gross * (1 - l.discountPercent / 100);
    return { ...l, lineSubtotal: l.isOptional ? 0 : Math.round(discounted * 100) / 100 };
  });

  const subtotal = calculatedLines.reduce((acc, curr) => acc + curr.lineSubtotal, 0);
  const totalAfterHeaderDiscount = subtotal * (1 - discountPercent / 100);
  const total = Math.round(totalAfterHeaderDiscount * 100) / 100;

  const handleSubmit = async (e: React.FormEvent, acceptImmediately = false) => {
    e.preventDefault();
    if (!customerId) {
      setError("Debe seleccionar un cliente para generar el presupuesto.");
      return;
    }

    if (lines.some((l) => !l.description.trim() || l.quantity <= 0)) {
      setError("Todas las líneas deben tener descripción y cantidad mayor a cero.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload: QuoteWrite = {
        customerId,
        locationId: locationId || null,
        contactId: contactId || null,
        opportunityId,
        currency,
        exchangeRateUsdBillete: rates?.usdBillete.venta ?? 1510,
        exchangeRateUsdDivisa: rates?.usdDivisa.venta ?? 1487.5,
        discountPercent,
        validDays,
        paymentTerms,
        paymentMethod,
        deliveryTimeDays,
        transportation,
        warranty,
        notes,
        ownerName,
        lines: lines.map((l) => ({
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
          taxRate: l.taxRate,
          isOptional: l.isOptional,
          technicalDetail: l.technicalDetail?.trim() ? l.technicalDetail.trim() : null
        }))
      };

      const saved = isEditing && id
        ? await api.updateQuote(id, payload)
        : await api.createQuote(payload);

      if (acceptImmediately) {
        const hasOptional = (saved.lines || []).some((line) => line.isOptional);
        if (hasOptional && !confirm("Hay ítems opcionales. El pedido se arma con los obligatorios. Si preferís elegirlos, cancelá y usá Convertir a Pedido en el listado.")) {
          navigate("/presupuestos");
          return;
        }
        const order = await api.createOrderFromQuote(saved.id, []);
        navigate(`/pedidos/${order.id}`);
        return;
      }

      const quoteId = saved?.id || id;
      if (!quoteId) {
        setError("El presupuesto se guardó, pero no llegó el identificador. Volvé al listado y abrilo de nuevo.");
        return;
      }
      navigate(`/presupuestos/${quoteId}/imprimir`, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar presupuesto");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card pad" style={{ textAlign: "center" }}>Cargando presupuesto...</div>;
  }

  return (
    <div className="stack">
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2>{isEditing ? "Editar Presupuesto Comercial" : "Nuevo Presupuesto Comercial & Oferta Técnica"}</h2>
          <div className="muted">
            Cotización oficial con cálculo multimoneda BNA y anexos técnicos configurables
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {isEditing && id && quoteStatus !== "Cancelled" && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (!confirm(`¿Anular el presupuesto ${quoteNumber || ""}? Queda registrado como anulado.`)) return;
                void api.cancelQuote(id).then(() => navigate("/presupuestos")).catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Error al anular el presupuesto");
                });
              }}
            >
              Anular
            </button>
          )}
          {isEditing && id && quoteStatus !== "Cancelled" && (
            <button
              type="button"
              className="btn ghost"
              style={{ color: "#b91c1c" }}
              onClick={() => {
                if (!confirm(`¿Eliminar el presupuesto ${quoteNumber || ""}? No se puede recuperar.`)) return;
                void api.deleteQuote(id).then(() => navigate("/presupuestos")).catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Error al eliminar el presupuesto");
                });
              }}
            >
              Eliminar
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/presupuestos")}
            className="btn ghost"
          >
            Volver al Listado
          </button>
        </div>
      </div>

      {quoteStatus === "Cancelled" && (
        <div className="alert">Este presupuesto está anulado. Podés eliminarlo si ya no lo necesitás en el listado.</div>
      )}
      {quoteStatus === "Ordered" && (
        <div className="alert">Este presupuesto ya es un pedido de venta. Si ese pedido se cancela, el presupuesto vuelve a poder editarse.</div>
      )}

      {error && <div className="alert">{error}</div>}

      <form onSubmit={(e) => handleSubmit(e, false)} className="stack">
        {/* Card 1: Cliente, Plantas & Contactos */}
        <section className="card pad stack">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Información del Cliente & Punto de Entrega</h3>
            <button
              type="button"
              onClick={() => setShowQuickCustomerModal(true)}
              className="btn btn-primary"
              style={{ padding: "6px 14px", fontSize: "0.82rem", background: "#0d9488" }}
            >
              + Nuevo Cliente Completo
            </button>
          </div>

          <div className="grid-3">
            <label>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span>Cliente *</span>
                <button
                  type="button"
                  onClick={() => setShowQuickCustomerModal(true)}
                  style={{ fontSize: "0.76rem", color: "#0d9488", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
                >
                  + Alta Rápida
                </button>
              </div>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Seleccionar Cliente...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName ? `${c.tradeName} (${c.legalName})` : c.legalName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span>Planta / Destino de Entrega</span>
                {customerId && (
                  <button
                    type="button"
                    onClick={() => setShowNewLocationModal(true)}
                    style={{ fontSize: "0.76rem", color: "#0d9488", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
                  >
                    + Nueva Planta
                  </button>
                )}
              </div>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                disabled={!selectedCustomerDetail}
              >
                <option value="">Planta Principal / Casa Central</option>
                {selectedCustomerDetail?.locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.address.city}, {loc.address.province})
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span>Contacto Asignado</span>
                {customerId && (
                  <button
                    type="button"
                    onClick={() => setShowNewContactModal(true)}
                    style={{ fontSize: "0.76rem", color: "#0d9488", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
                  >
                    + Nuevo Contacto
                  </button>
                )}
              </div>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={!selectedCustomerDetail}
              >
                <option value="">Sin Contacto Asignado</option>
                {selectedCustomerDetail?.contacts.map((con) => (
                  <option key={con.id} value={con.id}>
                    {con.name} ({con.role}) {con.locationId ? "📌 Planta" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Credit Scoring & Terms Suggestion Banner */}
          {selectedCustomerDetail && (
            <div style={{
              marginTop: "10px",
              padding: "10px 14px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px",
              background: selectedCustomerDetail.creditRating === "A" ? "#ecfdf5" : selectedCustomerDetail.creditRating === "B" ? "#fefce8" : selectedCustomerDetail.creditRating === "C" ? "#fff7ed" : selectedCustomerDetail.creditRating === "D" ? "#fef2f2" : "#f8fafc",
              border: `1px solid ${selectedCustomerDetail.creditRating === "A" ? "#10b981" : selectedCustomerDetail.creditRating === "B" ? "#eab308" : selectedCustomerDetail.creditRating === "C" ? "#f97316" : selectedCustomerDetail.creditRating === "D" ? "#ef4444" : "#e2e8f0"}`
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.3rem" }}>
                  {selectedCustomerDetail.creditRating === "A" ? "🟢" : selectedCustomerDetail.creditRating === "B" ? "🟡" : selectedCustomerDetail.creditRating === "C" ? "🟠" : selectedCustomerDetail.creditRating === "D" ? "🔴" : "🏛️"}
                </span>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#0f172a" }}>
                    {selectedCustomerDetail.creditRating
                      ? `Evaluación Crediticia BCRA: Calificación ${selectedCustomerDetail.creditRating} (Sit. ${selectedCustomerDetail.bcraWorstSituation || 1})`
                      : "Sin informe BCRA registrado en ficha"}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: "2px" }}>
                    {selectedCustomerDetail.creditRecommendation || "Podés consultar su calificación crediticia en la ficha del cliente."}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {selectedCustomerDetail.creditRating === "A" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTerms("30 días fecha factura");
                      setPaymentMethod("Transferencia Bancaria / eCheq");
                    }}
                    className="btn"
                    style={{ fontSize: "0.75rem", padding: "5px 10px", background: "#059669", color: "white", fontWeight: 700 }}
                  >
                    ✓ Aplicar Cta. Cte. (30d)
                  </button>
                )}
                {selectedCustomerDetail.creditRating === "B" && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTerms("50% anticipo, saldo contra entrega");
                      setPaymentMethod("Transferencia Bancaria");
                    }}
                    className="btn"
                    style={{ fontSize: "0.75rem", padding: "5px 10px", background: "#d97706", color: "white", fontWeight: 700 }}
                  >
                    ✓ Aplicar Anticipo 50%
                  </button>
                )}
                {(selectedCustomerDetail.creditRating === "C" || selectedCustomerDetail.creditRating === "D") && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentTerms("100% Contado Anticipado");
                      setPaymentMethod("Transferencia Anticipada");
                    }}
                    className="btn"
                    style={{ fontSize: "0.75rem", padding: "5px 10px", background: "#dc2626", color: "white", fontWeight: 700 }}
                  >
                    ⚠️ Exigir Pago Contado
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Card 2: Moneda & Cotización DolarApi Live */}
        <section className="card pad stack">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Moneda Principal del Presupuesto & Cotizaciones Live DolarApi (BNA)</h3>
            {rates && (
              <div style={{ display: "flex", gap: "12px", fontSize: "0.8rem" }}>
                <span className="badge ok">BNA Billete: <strong>${rates.usdBillete.venta}</strong></span>
                <span className="badge warn">BNA Divisa: <strong>${rates.usdDivisa.venta}</strong></span>
              </div>
            )}
          </div>

          <div className="grid-3">
            <label>
              Moneda del Presupuesto *
              <select
                value={currency}
                onChange={(e) => handleQuoteCurrencyChange(e.target.value)}
              >
                <option value="ARS">Pesos ($ ARS)</option>
                <option value="USD_BILLETE">Dólar Billete (BNA Vendedor)</option>
                <option value="USD_DIVISA">Dólar Divisa (BNA Mayorista Vendedor)</option>
              </select>
            </label>

            <label>
              Validez de Oferta (Días) *
              <input
                type="number"
                min="1"
                value={validDays}
                onChange={(e) => setValidDays(Number(e.target.value))}
              />
            </label>

            <label>
              Responsable Comercial
              <input
                type="text"
                placeholder="Ej: Leonel Alfonso"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </label>
          </div>
        </section>

        {/* Card 3: Renglones del Presupuesto */}
        <section className="card pad stack">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3>Detalle de Ítems / Renglones de la Cotización</h3>
              <div className="muted">
                Seleccioná productos del catálogo (se convierten automáticamente a la moneda del presupuesto) o agregá ítems libres
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setQuickProductLineIndex(null);
                  setShowQuickProductModal(true);
                }}
                className="btn btn-outline"
                style={{ fontSize: "0.82rem", padding: "6px 12px", background: "rgba(13, 148, 136, 0.08)", color: "#0d9488", borderColor: "#0d9488", fontWeight: 700 }}
              >
                + Crear Producto Nuevo
              </button>
              <button
                type="button"
                onClick={handleAddLine}
                className="btn ghost"
              >
                + Agregar Renglón
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>Catálogo / Descripción</th>
                  <th style={{ width: "16%" }}>Moneda Nativa / Precio Origen</th>
                  <th style={{ width: "10%", textAlign: "center" }}>Cant.</th>
                  <th style={{ width: "14%", textAlign: "right" }}>Precio U. ({currency})</th>
                  <th style={{ width: "8%", textAlign: "center" }}>Desc. %</th>
                  <th style={{ width: "8%", textAlign: "center" }}>IVA %</th>
                  <th style={{ width: "6%", textAlign: "center" }}>Opcional</th>
                  <th style={{ width: "12%", textAlign: "right" }}>Subtotal</th>
                  <th style={{ width: "4%" }}></th>
                </tr>
              </thead>
              <tbody>
                {calculatedLines.map((line, idx) => (
                  <tr key={idx} style={{ opacity: line.isOptional ? 0.6 : 1 }}>
                    <td>
                      <div className="stack" style={{ gap: "4px" }}>
                        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                          <select
                            value={line.productId ?? ""}
                            onChange={(e) => handleSelectProductForLine(idx, e.target.value)}
                            style={{ fontSize: "0.82rem", flex: 1 }}
                          >
                            <option value="">-- Cargar desde Catálogo (Opcional) --</option>
                            {productsCatalog.map((p) => (
                              <option key={p.id} value={p.id}>
                                [{p.code}] {p.name} ({p.saleCurrency} ${p.basePrice})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickProductLineIndex(idx);
                              setShowQuickProductModal(true);
                            }}
                            title="Crear un producto nuevo con foto y asignarlo a este renglón"
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              background: "#0d9488",
                              color: "#ffffff",
                              border: "none",
                              fontWeight: 800,
                              cursor: "pointer",
                              fontSize: "0.85rem"
                            }}
                          >
                            +
                          </button>
                        </div>

                        <input
                          type="text"
                          required
                          placeholder="Descripción comercial del ítem..."
                          value={line.description}
                          onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setTechnicalLineIndex(idx);
                            setTechnicalDraft(line.technicalDetail ?? "");
                          }}
                          style={{
                            alignSelf: "flex-start",
                            background: "none",
                            border: "none",
                            color: "#2563eb",
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            cursor: "pointer",
                            padding: 0
                          }}
                        >
                          {line.technicalDetail?.trim() ? "Editar detalle técnico (cargado)" : "Editar detalle técnico"}
                        </button>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <select
                          value={line.nativeCurrency}
                          onChange={(e) => handleLineChange(idx, "nativeCurrency", e.target.value)}
                          style={{ fontSize: "0.78rem", width: "95px" }}
                        >
                          <option value="ARS">$ ARS</option>
                          <option value="USD_BILLETE">u$s Billete</option>
                          <option value="USD_DIVISA">u$s Divisa</option>
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.nativeUnitPrice}
                          onChange={(e) => handleLineChange(idx, "nativeUnitPrice", Number(e.target.value))}
                          style={{ textAlign: "right", fontFamily: "monospace", fontSize: "0.82rem" }}
                        />
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        required
                        value={line.quantity}
                        onChange={(e) => handleLineChange(idx, "quantity", Math.max(1, parseInt(e.target.value, 10) || 1))}
                        style={{ textAlign: "center" }}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={line.unitPrice}
                        onChange={(e) => handleLineChange(idx, "unitPrice", Number(e.target.value))}
                        style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={line.discountPercent}
                        onChange={(e) => handleLineChange(idx, "discountPercent", Number(e.target.value))}
                        style={{ textAlign: "center" }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <select
                        value={line.taxRate}
                        onChange={(e) => handleLineChange(idx, "taxRate", Number(e.target.value))}
                        style={{ textAlign: "center" }}
                      >
                        <option value={21}>21%</option>
                        <option value={10.5}>10.5%</option>
                        <option value={0}>0%</option>
                        <option value={27}>27%</option>
                      </select>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={line.isOptional}
                        onChange={(e) => handleLineChange(idx, "isOptional", e.target.checked)}
                        title="Marcar como renglón opcional (no suma al total por defecto)"
                        style={{ width: "18px", height: "18px" }}
                      />
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                      {line.isOptional ? <span className="muted">(Opcional)</span> : `${currency} $${line.lineSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        disabled={lines.length === 1}
                        style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem" }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
            <div className="card pad stack" style={{ width: "340px", background: "var(--surface-muted)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Subtotal Renglones:</span>
                <strong style={{ fontFamily: "monospace" }}>{currency} ${subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Descuento General %:</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  style={{ width: "80px", textAlign: "right" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--surface-border)", paddingTop: "8px", fontSize: "1.1rem", color: "var(--primary)" }}>
                <strong>TOTAL PRESUPUESTO:</strong>
                <strong style={{ fontFamily: "monospace" }}>{currency} ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* Card 4: Condiciones Comerciales */}
        <section className="card pad stack">
          <h3>Condiciones Comerciales, Entrega & Garantía</h3>

          <div className="grid-3">
            <label>
              Plazo de Entrega (Días Hábiles)
              <input
                type="number"
                min="0"
                value={deliveryTimeDays}
                onChange={(e) => setDeliveryTimeDays(Number(e.target.value))}
              />
            </label>

            <label>
              Condición de Pago
              <input
                type="text"
                placeholder="Ej: 50% anticipo, 50% contra entrega"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </label>

            <label>
              Medio de Pago
              <input
                type="text"
                placeholder="Ej: Transferencia Bancaria"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </label>
          </div>

          <div className="grid-3">
            <label>
              Transporte / Flete
              <input
                type="text"
                placeholder="Ej: Flete por cuenta del cliente"
                value={transportation}
                onChange={(e) => setTransportation(e.target.value)}
              />
            </label>

            <label style={{ gridColumn: "span 2" }}>
              Garantía Oficial
              <input
                type="text"
                placeholder="Ej: 12 meses de garantía oficial por defectos de fabricación"
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
              />
            </label>
          </div>

          <label>
            Observaciones & Clausulado Comercial
            <textarea
              rows={3}
              placeholder="Notas comerciales adicionales para el presupuesto..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </section>

        {/* Actions Footer */}
        <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: "16px" }}>
          <button
            type="button"
            onClick={() => navigate("/presupuestos")}
            className="btn ghost"
          >
            Volver
          </button>
          
          <button
            type="submit"
            disabled={saving || quoteStatus === "Cancelled" || quoteStatus === "Ordered"}
            className="btn ghost"
          >
            {saving ? "Guardando..." : "Guardar Borrador"}
          </button>

          <button
            type="button"
            disabled={saving || quoteStatus === "Cancelled" || quoteStatus === "Ordered"}
            onClick={(e) => handleSubmit(e, true)}
            className="btn"
            style={{ background: "linear-gradient(180deg, #1aaa97, #128c7e)" }}
          >
            Guardar y convertir a pedido
          </button>
        </div>
      </form>

      {technicalLineIndex !== null && (
        <div className="modal-backdrop" onClick={() => setTechnicalLineIndex(null)}>
          <div className="modal-card" style={{ maxWidth: 760, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <span className="eyebrow">OFERTA TÉCNICA</span>
                <h2>Detalle técnico del ítem</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setTechnicalLineIndex(null)}>×</button>
            </div>
            <p className="muted" style={{ fontSize: "0.88rem" }}>
              Este texto sale en la primera hoja, como oferta técnica. La hoja siguiente es la oferta comercial, con precios.
              Podés escribir todo el alcance, las especificaciones y las condiciones técnicas.
            </p>
            <textarea
              rows={18}
              value={technicalDraft}
              onChange={(e) => setTechnicalDraft(e.target.value)}
              placeholder="Alcance de obra, especificaciones, materiales, exclusiones, plazos técnicos..."
              style={{ width: "100%", minHeight: 320, marginTop: 12 }}
            />
            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn ghost" onClick={() => setTechnicalLineIndex(null)}>Cerrar</button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  handleLineChange(technicalLineIndex, "technicalDetail", technicalDraft);
                  setTechnicalLineIndex(null);
                }}
              >
                Guardar detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK CUSTOMER MODAL */}
      <QuickCustomerModal
        isOpen={showQuickCustomerModal}
        onClose={() => setShowQuickCustomerModal(false)}
        onSuccess={handleCustomerCreated}
        mode="customer"
      />

      {/* QUICK PRODUCT MODAL */}
      <QuickProductModal
        isOpen={showQuickProductModal}
        onClose={() => {
          setShowQuickProductModal(false);
          setQuickProductLineIndex(null);
        }}
        onSuccess={handleProductCreated}
        categories={categories}
      />

      {/* Mini Modal: Nueva Planta para Cliente Seleccionado */}
      {showNewLocationModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "520px", background: "white" }}>
            <h3 style={{ margin: 0 }}>Nueva Planta / Destino para {selectedCustomerDetail?.tradeName || selectedCustomerDetail?.legalName}</h3>
            <form onSubmit={handleCreateLocation} className="stack">
              <label>Nombre de la Planta * <input type="text" required placeholder="Ej: Planta Sur, Silo 4" value={newLocName} onChange={(e) => setNewLocName(e.target.value)} /></label>
              <label>Calle / Ruta <input type="text" placeholder="Ruta 11 km 320" value={newLocStreet} onChange={(e) => setNewLocStreet(e.target.value)} /></label>
              <div className="grid-2">
                <label>Ciudad <input type="text" placeholder="Rosario" value={newLocCity} onChange={(e) => setNewLocCity(e.target.value)} /></label>
                <label>
                  Provincia
                    <select value={newLocProvince} onChange={(e) => setNewLocProvince(e.target.value)}>
                      {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowNewLocationModal(false)} className="btn ghost">Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: "#0d9488" }}>Guardar Planta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mini Modal: Nuevo Contacto para Cliente Seleccionado */}
      {showNewContactModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "520px", background: "white" }}>
            <h3 style={{ margin: 0 }}>Nuevo Contacto para {selectedCustomerDetail?.tradeName || selectedCustomerDetail?.legalName}</h3>
            <form onSubmit={handleCreateContact} className="stack">
              <div className="grid-2">
                <label>Nombre Completo * <input type="text" required placeholder="Ing. Juan Pérez" value={newConName} onChange={(e) => setNewConName(e.target.value)} /></label>
                <label>
                  Cargo
                  <select value={newConRole} onChange={(e) => setNewConRole(e.target.value)}>
                    <option value="Commercial">Compras / Comercial</option>
                    <option value="Technical">Técnico / Mantenimiento</option>
                    <option value="Administrative">Administración / Pagos</option>
                    <option value="Executive">Dirección / Gerencia</option>
                  </select>
                </label>
              </div>
              <div className="grid-2">
                <label>Email <input type="email" placeholder="jperez@empresa.com" value={newConEmail} onChange={(e) => setNewConEmail(e.target.value)} /></label>
                <label>WhatsApp / Teléfono <input type="text" placeholder="341-5551234" value={newConWhatsApp} onChange={(e) => setNewConWhatsApp(e.target.value)} /></label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowNewContactModal(false)} className="btn ghost">Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: "#0d9488" }}>Guardar Contacto</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
