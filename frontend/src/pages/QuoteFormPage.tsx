import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import {
  provinces,
  type CustomerDetail,
  type CustomerSummary,
  type CustomerWrite,
  type ExchangeRates,
  type Product,
  type QuoteLineWrite,
  type QuoteWrite
} from "../api/types";
import { digitsOnly, formatCuitDisplay, isValidCuitChecksum } from "../lib/arContact";

interface FormQuoteLine extends QuoteLineWrite {
  nativeCurrency: string;
  nativeUnitPrice: number;
}

export const QuoteFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<CustomerDetail | null>(null);
  const [productsCatalog, setProductsCatalog] = useState<Product[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      nativeCurrency: "ARS",
      nativeUnitPrice: 0
    }
  ]);

  // Modals visibility
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [showNewLocationModal, setShowNewLocationModal] = useState(false);
  const [showNewContactModal, setShowNewContactModal] = useState(false);

  // Full Customer Form State
  const [newCustLegalName, setNewCustLegalName] = useState("");
  const [newCustTradeName, setNewCustTradeName] = useState("");
  const [newCustDocType, setNewCustDocType] = useState("Cuit");
  const [newCustDocNumber, setNewCustDocNumber] = useState("");
  const [newCustTaxCond, setNewCustTaxCond] = useState("ResponsableInscripto");
  const [newCustIibb, setNewCustIibb] = useState("ConvenioMultilateral");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustWhatsApp, setNewCustWhatsApp] = useState("");
  const [newCustStreet, setNewCustStreet] = useState("");
  const [newCustCity, setNewCustCity] = useState("");
  const [newCustProvince, setNewCustProvince] = useState("SantaFe");
  const [newCustPostalCode, setNewCustPostalCode] = useState("");
  const [newCustIsCustomer, setNewCustIsCustomer] = useState(true);
  const [newCustIsSupplier, setNewCustIsSupplier] = useState(false);
  const [newCustNotes, setNewCustNotes] = useState("");
  const [consultingArca, setConsultingArca] = useState(false);

  // Full Location Form State
  const [newLocName, setNewLocName] = useState("");
  const [newLocStreet, setNewLocStreet] = useState("");
  const [newLocCity, setNewLocCity] = useState("");
  const [newLocProvince, setNewLocProvince] = useState<string>("SantaFe");
  const [newLocPostalCode, setNewLocPostalCode] = useState("");
  const [newLocPhone, setNewLocPhone] = useState("");
  const [newLocNotes, setNewLocNotes] = useState("");

  // Full Contact Form State
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
        const [custData, prodsData, ratesData] = await Promise.all([
          api.listCustomers(""),
          api.listProducts(),
          api.getExchangeRates().catch(() => null)
        ]);

        setCustomers(custData.items);
        setProductsCatalog(prodsData);
        if (ratesData) setRates(ratesData);

        if (isEditing && id) {
          const q = await api.getQuote(id);
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

  // Consult ARCA API
  const handleConsultArcaModal = async () => {
    const cleanCuit = digitsOnly(newCustDocNumber);
    if (cleanCuit.length !== 11) {
      alert("Ingresá un CUIT válido de 11 dígitos para consultar en ARCA.");
      return;
    }

    setConsultingArca(true);
    try {
      const res = await api.consultArcaCuit(cleanCuit);
      setNewCustLegalName(res.legalName || newCustLegalName);
      if (res.tradeName) setNewCustTradeName(res.tradeName);
      if (res.taxCondition) setNewCustTaxCond(res.taxCondition);
      if (res.fiscalStreet) setNewCustStreet(res.fiscalStreet);
      if (res.fiscalCity) setNewCustCity(res.fiscalCity);
      if (res.fiscalProvince) setNewCustProvince(res.fiscalProvince);
      if (res.fiscalPostalCode) setNewCustPostalCode(res.fiscalPostalCode);
    } catch (e) {
      alert("Error al consultar ARCA: " + (e as Error).message);
    } finally {
      setConsultingArca(false);
    }
  };

  // Full Customer Creation
  const handleCreateCustomerFull = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustLegalName.trim() || !newCustDocNumber.trim()) {
      alert("Por favor completá Razón Social y CUIT/Documento.");
      return;
    }

    if (newCustDocType === "Cuit" && !isValidCuitChecksum(digitsOnly(newCustDocNumber))) {
      alert("El CUIT ingresado no es válido.");
      return;
    }

    try {
      const body: CustomerWrite = {
        legalName: newCustLegalName.trim(),
        tradeName: newCustTradeName.trim() || undefined,
        documentType: newCustDocType,
        documentNumber: digitsOnly(newCustDocNumber),
        taxCondition: newCustTaxCond,
        iibbRegime: newCustIibb,
        isCustomer: newCustIsCustomer,
        isSupplier: newCustIsSupplier,
        email: newCustEmail.trim() || undefined,
        phone: newCustPhone.trim() ? digitsOnly(newCustPhone) : undefined,
        whatsApp: newCustWhatsApp.trim() ? digitsOnly(newCustWhatsApp) : undefined,
        fiscalStreet: newCustStreet.trim() || undefined,
        fiscalCity: newCustCity.trim() || undefined,
        fiscalProvince: newCustProvince || undefined,
        fiscalPostalCode: newCustPostalCode.trim() || undefined,
        notes: newCustNotes.trim() || undefined
      };

      const newCust = await api.createCustomer(body);
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
      setShowNewCustomerModal(false);
      
      // Reset form
      setNewCustLegalName("");
      setNewCustTradeName("");
      setNewCustDocNumber("");
      setNewCustEmail("");
      setNewCustPhone("");
      setNewCustWhatsApp("");
      setNewCustStreet("");
      setNewCustCity("");
      setNewCustNotes("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al crear cliente completo");
    }
  };

  // Full Location Creation
  const handleCreateLocationFull = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      alert("Seleccioná un cliente primero.");
      return;
    }
    if (!newLocName.trim() || !newLocStreet.trim()) {
      alert("Por favor completá Nombre de Planta y Calle.");
      return;
    }

    try {
      const body = {
        name: newLocName.trim(),
        street: newLocStreet.trim(),
        city: newLocCity.trim() || "San Lorenzo",
        province: newLocProvince,
        postalCode: newLocPostalCode.trim() || "2200",
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
      setNewLocPhone("");
      setNewLocNotes("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al crear planta");
    }
  };

  // Full Contact Creation (with Location Association)
  const handleCreateContactFull = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      alert("Seleccioná un cliente primero.");
      return;
    }
    if (!newConName.trim()) {
      alert("Por favor completá el Nombre del Contacto.");
      return;
    }
    if (!newConEmail.trim() && !newConPhone.trim() && !newConWhatsApp.trim()) {
      alert("Cargá al menos una vía de contacto (Email, Teléfono o WhatsApp).");
      return;
    }

    try {
      const body = {
        name: newConName.trim(),
        role: newConRole,
        locationId: newConLocationId || null,
        email: newConEmail.trim() || undefined,
        phone: newConPhone.trim() ? digitsOnly(newConPhone) : undefined,
        whatsApp: newConWhatsApp.trim() ? digitsOnly(newConWhatsApp) : undefined,
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
      setNewConLocationId("");
      setNewConNotes("");
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
        taxRate: prod.taxRate
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

      const body: QuoteWrite = {
        customerId,
        locationId: locationId || null,
        contactId: contactId || null,
        opportunityId,
        currency,
        exchangeRateUsdBillete: rates?.usdBillete.venta ?? 1510.00,
        exchangeRateUsdDivisa: rates?.usdDivisa.venta ?? 1487.50,
        discountPercent: Number(discountPercent) || 0,
        validDays: Number(validDays) || 15,
        paymentTerms: paymentTerms.trim() || null,
        paymentMethod: paymentMethod.trim() || null,
        deliveryTimeDays: Number(deliveryTimeDays) || null,
        transportation: transportation.trim() || null,
        warranty: warranty.trim() || null,
        notes: notes.trim() || null,
        ownerName: ownerName.trim() || null,
        lines: lines.map((l) => ({
          productId: l.productId || null,
          description: l.description.trim(),
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || 0,
          discountPercent: Number(l.discountPercent) || 0,
          taxRate: Number(l.taxRate) || 21,
          isOptional: Boolean(l.isOptional)
        }))
      };

      let savedQuote;
      if (isEditing && id) {
        savedQuote = await api.updateQuote(id, body);
      } else {
        savedQuote = await api.createQuote(body);
      }

      if (acceptImmediately && savedQuote?.id) {
        await api.acceptQuote(savedQuote.id);
      }

      navigate("/presupuestos");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar el presupuesto");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card pad" style={{ textAlign: "center", padding: "48px" }}>
        <div className="muted">Cargando presupuesto comercial...</div>
      </div>
    );
  }

  return (
    <>
      {/* Header clean */}
      <div className="page-head">
        <div>
          <h1>{isEditing ? "Editar Presupuesto Comercial" : "Nuevo Presupuesto Comercial"}</h1>
          <div className="muted">
            Cotización técnica, selección de plantas, precios en 3 monedas y pase a Pedido de Venta
          </div>
        </div>
        <div className="toolbar">
          {isEditing && id && (
            <button
              type="button"
              onClick={() => navigate(`/presupuestos/${id}/imprimir`)}
              className="btn ghost"
              style={{ background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6" }}
            >
              📄 Vista Impresión / PDF
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

      {error && <div className="alert">{error}</div>}

      <form onSubmit={(e) => handleSubmit(e, false)} className="stack">
        {/* Card 1: Cliente, Plantas & Contactos */}
        <section className="card pad stack">
          <h3>Información del Cliente & Punto de Entrega</h3>

          <div className="grid-3">
            <label>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Cliente *</span>
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(true)}
                  style={{ fontSize: "0.75rem", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}
                >
                  + Nuevo Cliente
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Planta / Sucursal de Entrega</span>
                {customerId && (
                  <button
                    type="button"
                    onClick={() => setShowNewLocationModal(true)}
                    style={{ fontSize: "0.75rem", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Contacto Asignado</span>
                {customerId && (
                  <button
                    type="button"
                    onClick={() => setShowNewContactModal(true)}
                    style={{ fontSize: "0.75rem", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", fontWeight: "bold" }}
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
            <button
              type="button"
              onClick={handleAddLine}
              className="btn ghost"
            >
              + Agregar Renglón
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>Catálogo / Descripción</th>
                  <th style={{ width: "16%" }}>Moneda Nativa / Precio Origen</th>
                  <th style={{ width: "10%", textAlign: "center" }}>Cant.</th>
                  <th style={{ width: "15%", textAlign: "right" }}>Precio U. ({currency})</th>
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
                        <select
                          value={line.productId ?? ""}
                          onChange={(e) => handleSelectProductForLine(idx, e.target.value)}
                          style={{ fontSize: "0.82rem" }}
                        >
                          <option value="">-- Cargar desde Catálogo (Opcional) --</option>
                          {productsCatalog.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.code}] {p.name} ({p.saleCurrency} ${p.basePrice})
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          required
                          placeholder="Descripción detallada del artículo o servicio..."
                          value={line.description}
                          onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                        />
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
                        step="0.01"
                        min="0.01"
                        required
                        value={line.quantity}
                        onChange={(e) => handleLineChange(idx, "quantity", Number(e.target.value))}
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
                      {currency} ${line.lineSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        disabled={lines.length === 1}
                        className="btn danger"
                        style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Box */}
          <div className="card pad stack" style={{ background: "rgba(0,0,0,0.03)", maxWidth: "380px", marginLeft: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="muted">Subtotal Renglones:</span>
              <strong style={{ fontFamily: "monospace" }}>{currency} ${subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="muted">Descuento Global %:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                style={{ width: "80px", textAlign: "right" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: "8px", fontSize: "1.1rem" }}>
              <strong>Total Propuesta:</strong>
              <strong style={{ color: "var(--primary)", fontFamily: "monospace" }}>
                {currency} ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </div>
        </section>

        {/* Card 4: Condiciones Comerciales */}
        <section className="card pad stack">
          <h3>Condiciones Comerciales de Leal Control</h3>

          <div className="grid-2">
            <label>
              Forma de Pago
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
                placeholder="Ej: Transferencia Bancaria, E-Cheq"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
            </label>

            <label>
              Plazo de Entrega (Días Hábiles)
              <input
                type="number"
                min="1"
                value={deliveryTimeDays}
                onChange={(e) => setDeliveryTimeDays(Number(e.target.value))}
              />
            </label>

            <label>
              Transporte / Flete
              <input
                type="text"
                placeholder="Ej: Flete a cargo del comprador"
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
            Cancelar
          </button>
          
          <button
            type="submit"
            disabled={saving}
            className="btn ghost"
          >
            {saving ? "Guardando..." : "Guardar Borrador"}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={(e) => handleSubmit(e, true)}
            className="btn"
            style={{ background: "linear-gradient(180deg, #1aaa97, #128c7e)" }}
          >
            ✓ Aceptar Presupuesto & Ganar Oportunidad
          </button>
        </div>
      </form>

      {/* FULL Modal: Complete Customer Creation */}
      {showNewCustomerModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "720px", maxHeight: "90vh", overflowY: "auto", background: "white" }}>
            <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: "12px" }}>
              <h2 style={{ margin: 0 }}>Alta Completa de Nuevo Cliente</h2>
              <div className="muted">Ficha completa de cliente con datos fiscales, ARCA y domicilio</div>
            </div>

            <form onSubmit={handleCreateCustomerFull} className="stack">
              <div className="grid-2">
                <label>
                  Razón Social *
                  <input type="text" required placeholder="Ej. Acme Industrias S.A." value={newCustLegalName} onChange={(e) => setNewCustLegalName(e.target.value)} />
                </label>
                <label>
                  Nombre Fantasía
                  <input type="text" placeholder="Opcional" value={newCustTradeName} onChange={(e) => setNewCustTradeName(e.target.value)} />
                </label>
              </div>

              <div className="grid-3">
                <label>
                  Tipo Doc.
                  <select value={newCustDocType} onChange={(e) => setNewCustDocType(e.target.value)}>
                    <option value="Cuit">Cuit</option>
                    <option value="Dni">Dni</option>
                    <option value="Pasaporte">Pasaporte</option>
                    <option value="Cdi">Cdi</option>
                  </select>
                </label>
                <label>
                  Número Doc. / CUIT *
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="text"
                      required
                      placeholder="30-71234567-8"
                      value={newCustDocType === "Cuit" ? formatCuitDisplay(newCustDocNumber) : newCustDocNumber}
                      onChange={(e) => setNewCustDocNumber(e.target.value)}
                    />
                    {newCustDocType === "Cuit" && (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={consultingArca}
                        onClick={handleConsultArcaModal}
                        style={{ whiteSpace: "nowrap", padding: "0 10px", fontSize: "0.8rem" }}
                      >
                        {consultingArca ? "..." : "🔍 ARCA"}
                      </button>
                    )}
                  </div>
                </label>
                <label>
                  Condición IVA
                  <select value={newCustTaxCond} onChange={(e) => setNewCustTaxCond(e.target.value)}>
                    <option value="ResponsableInscripto">Responsable Inscripto</option>
                    <option value="Monotributo">Monotributo</option>
                    <option value="Exento">Exento</option>
                    <option value="ConsumidorFinal">Consumidor Final</option>
                  </select>
                </label>
              </div>

              <div className="grid-3">
                <label>
                  Régimen IIBB
                  <select value={newCustIibb} onChange={(e) => setNewCustIibb(e.target.value)}>
                    <option value="ConvenioMultilateral">Convenio Multilateral</option>
                    <option value="Local">Local</option>
                    <option value="Exento">Exento</option>
                  </select>
                </label>
                <label>Email Fiscal <input type="email" placeholder="compras@empresa.com" value={newCustEmail} onChange={(e) => setNewCustEmail(e.target.value)} /></label>
                <label>Teléfono Principal <input type="text" placeholder="3415551234" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} /></label>
              </div>

              <div className="grid-2">
                <label>WhatsApp Directo <input type="text" placeholder="5493415551234" value={newCustWhatsApp} onChange={(e) => setNewCustWhatsApp(e.target.value)} /></label>
                <label>Calle Fiscal <input type="text" placeholder="San Martin 1234" value={newCustStreet} onChange={(e) => setNewCustStreet(e.target.value)} /></label>
              </div>

              <div className="grid-3">
                <label>Ciudad <input type="text" placeholder="San Lorenzo" value={newCustCity} onChange={(e) => setNewCustCity(e.target.value)} /></label>
                <label>
                  Provincia
                  <select value={newCustProvince} onChange={(e) => setNewCustProvince(e.target.value)}>
                    {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label>CP <input type="text" placeholder="2200" value={newCustPostalCode} onChange={(e) => setNewCustPostalCode(e.target.value)} /></label>
              </div>

              <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                <label style={{ flexDirection: "row", gap: "8px", cursor: "pointer" }}>
                  <input type="checkbox" checked={newCustIsCustomer} onChange={(e) => setNewCustIsCustomer(e.target.checked)} />
                  <span>Es Cliente</span>
                </label>
                <label style={{ flexDirection: "row", gap: "8px", cursor: "pointer" }}>
                  <input type="checkbox" checked={newCustIsSupplier} onChange={(e) => setNewCustIsSupplier(e.target.checked)} />
                  <span>Es Proveedor</span>
                </label>
              </div>

              <label>
                Notas / Observaciones
                <textarea rows={2} placeholder="Notas internas sobre el cliente..." value={newCustNotes} onChange={(e) => setNewCustNotes(e.target.value)} />
              </label>

              <div className="toolbar" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                <button type="button" className="btn ghost" onClick={() => setShowNewCustomerModal(false)}>Cancelar</button>
                <button type="submit" className="btn">Crear Cliente Completo & Seleccionar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL Modal: Complete Location/Plant Creation */}
      {showNewLocationModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "620px", maxHeight: "90vh", overflowY: "auto", background: "white" }}>
            <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: "12px" }}>
              <h2 style={{ margin: 0 }}>Alta Completa de Planta / Sucursal</h2>
              <div className="muted">Registrar nuevo domicilio de entrega para {selectedCustomerDetail?.legalName}</div>
            </div>

            <form onSubmit={handleCreateLocationFull} className="stack">
              <label>
                Nombre de Planta / Sucursal *
                <input type="text" required placeholder="Ej: Planta Industrial San Lorenzo / Depósito N° 2" value={newLocName} onChange={(e) => setNewLocName(e.target.value)} />
              </label>
              <label>
                Dirección / Calle y Número *
                <input type="text" required placeholder="Ej: Av. Interurbana 4500" value={newLocStreet} onChange={(e) => setNewLocStreet(e.target.value)} />
              </label>

              <div className="grid-3">
                <label>Ciudad * <input type="text" required placeholder="San Lorenzo" value={newLocCity} onChange={(e) => setNewLocCity(e.target.value)} /></label>
                <label>
                  Provincia *
                  <select value={newLocProvince} onChange={(e) => setNewLocProvince(e.target.value)}>
                    {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label>CP * <input type="text" required placeholder="2200" value={newLocPostalCode} onChange={(e) => setNewLocPostalCode(e.target.value)} /></label>
              </div>

              <label>
                Teléfono Directo de Planta
                <input type="text" placeholder="Ej: 3414123456" value={newLocPhone} onChange={(e) => setNewLocPhone(e.target.value)} />
              </label>

              <label>
                Notas / Recepción de Cargas
                <textarea rows={2} placeholder="Horarios de descarga, portón de ingreso..." value={newLocNotes} onChange={(e) => setNewLocNotes(e.target.value)} />
              </label>

              <div className="toolbar" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                <button type="button" className="btn ghost" onClick={() => setShowNewLocationModal(false)}>Cancelar</button>
                <button type="submit" className="btn">Crear Planta Completa & Seleccionar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL Modal: Complete Contact Creation with Plant Binding */}
      {showNewContactModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "620px", maxHeight: "90vh", overflowY: "auto", background: "white" }}>
            <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: "12px" }}>
              <h2 style={{ margin: 0 }}>Alta Completa de Contacto</h2>
              <div className="muted">Asignación de responsable comercial, técnico o de pagos para {selectedCustomerDetail?.legalName}</div>
            </div>

            <form onSubmit={handleCreateContactFull} className="stack">
              <div className="grid-2">
                <label>
                  Nombre y Apellido *
                  <input type="text" required placeholder="Ej: Ing. Carlos Gómez" value={newConName} onChange={(e) => setNewConName(e.target.value)} />
                </label>
                <label>
                  Rol / Función
                  <select value={newConRole} onChange={(e) => setNewConRole(e.target.value)}>
                    <option value="Commercial">Comercial / Compras</option>
                    <option value="Technical">Técnico / Mantenimiento</option>
                    <option value="Administrative">Administración / Pagos</option>
                    <option value="Other">Otro</option>
                  </select>
                </label>
              </div>

              <label>
                Vincular a Planta / Sucursal del Cliente
                <select value={newConLocationId} onChange={(e) => setNewConLocationId(e.target.value)}>
                  <option value="">(General / Casa Central - Todas las plantas)</option>
                  {selectedCustomerDetail?.locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      📌 {loc.name} ({loc.address.city})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid-3">
                <label>Email Directo <input type="email" placeholder="carlos@cliente.com" value={newConEmail} onChange={(e) => setNewConEmail(e.target.value)} /></label>
                <label>Teléfono <input type="text" placeholder="3415551234" value={newConPhone} onChange={(e) => setNewConPhone(e.target.value)} /></label>
                <label>WhatsApp Directo <input type="text" placeholder="5493415551234" value={newConWhatsApp} onChange={(e) => setNewConWhatsApp(e.target.value)} /></label>
              </div>

              <label style={{ flexDirection: "row", gap: "8px", cursor: "pointer", height: "30px", alignItems: "center" }}>
                <input type="checkbox" checked={newConIsPrimary} onChange={(e) => setNewConIsPrimary(e.target.checked)} />
                <span>Marcar como Contacto Principal del Cliente</span>
              </label>

              <label>
                Observaciones / Notas del Contacto
                <textarea rows={2} placeholder="Comentarios sobre disponibilidades, horario de atención..." value={newConNotes} onChange={(e) => setNewConNotes(e.target.value)} />
              </label>

              <div className="toolbar" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                <button type="button" className="btn ghost" onClick={() => setShowNewContactModal(false)}>Cancelar</button>
                <button type="submit" className="btn">Crear Contacto Completo & Seleccionar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
