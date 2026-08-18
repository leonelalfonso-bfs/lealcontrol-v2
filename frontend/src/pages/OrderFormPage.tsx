import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import {
  provinces,
  type CustomerDetail,
  type CustomerSummary,
  type OrderLineWrite,
  type OrderWrite,
  type Product
} from "../api/types";

export function OrderFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [contactId, setContactId] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD_BILLETE" | "USD_DIVISA">("ARS");
  const [exchangeRateUsdBillete, setExchangeRateUsdBillete] = useState(1510);
  const [exchangeRateUsdDivisa, setExchangeRateUsdDivisa] = useState(1487.5);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState("Contado / 30 días");
  const [paymentMethod, setPaymentMethod] = useState("Transferencia Bancaria");
  const [deliveryTimeDays, setDeliveryTimeDays] = useState(7);
  const [transportation, setTransportation] = useState("Flete a cargo del comprador");
  const [warranty, setWarranty] = useState("6 meses de garantía directa");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineWrite[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  useEffect(() => {
    Promise.all([
      api.listCustomers(),
      api.listProducts(),
      api.getExchangeRates().catch(() => null)
    ])
      .then(([custPage, prodData, rates]) => {
        setCustomers(custPage.items);
        setProducts(prodData);
        if (rates) {
          setExchangeRateUsdBillete(rates.usdBilleteSell);
          setExchangeRateUsdDivisa(rates.usdDivisaSell);
        }
        if (id) {
          return api.getOrder(id).then((ord) => {
            setCustomerId(ord.customerId);
            setLocationId(ord.locationId ?? "");
            setContactId(ord.contactId ?? "");
            setCurrency(ord.currency);
            setExchangeRateUsdBillete(ord.exchangeRateUsdBillete);
            setExchangeRateUsdDivisa(ord.exchangeRateUsdDivisa);
            setDiscountPercent(ord.discountPercent);
            setPaymentTerms(ord.paymentTerms ?? "");
            setPaymentMethod(ord.paymentMethod ?? "");
            setDeliveryTimeDays(ord.deliveryTimeDays ?? 7);
            setTransportation(ord.transportation ?? "");
            setWarranty(ord.warranty ?? "");
            setNotes(ord.notes ?? "");
            setLines(
              ord.lines.map((l) => ({
                productId: l.productId,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                currencyCode: l.currencyCode,
                discountPercent: l.discountPercent,
                taxRate: l.taxRate,
                isOptional: l.isOptional
              }))
            );
          });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (customerId) {
      api.getCustomer(customerId).then((c) => setSelectedCustomer(c)).catch(() => setSelectedCustomer(null));
    } else {
      setSelectedCustomer(null);
    }
  }, [customerId]);

  const addLineItem = () => {
    setLines((prev) => [
      ...prev,
      {
        productId: null,
        description: "",
        quantity: 1,
        unitPrice: 0,
        currencyCode: currency,
        discountPercent: 0,
        taxRate: 21,
        isOptional: false
      }
    ]);
  };

  const updateLine = (index: number, patch: Partial<OrderLineWrite>) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const handleProductSelect = (index: number, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return;

    let price = prod.basePrice;
    let prodCurr = prod.saleCurrency;

    if (currency === "ARS" && prodCurr !== "ARS") {
      const rate = prodCurr === "USD_BILLETE" ? exchangeRateUsdBillete : exchangeRateUsdDivisa;
      price *= rate;
      prodCurr = "ARS";
    }

    updateLine(index, {
      productId: prod.id,
      description: `${prod.name} (${prod.code})`,
      unitPrice: price,
      currencyCode: prodCurr,
      taxRate: prod.taxRate
    });
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError("Por favor seleccioná o creá un cliente.");
      return;
    }
    if (lines.length === 0) {
      setError("El pedido debe contener al menos 1 ítem.");
      return;
    }

    const payload: OrderWrite = {
      customerId,
      locationId: locationId || null,
      contactId: contactId || null,
      currency,
      exchangeRateUsdBillete,
      exchangeRateUsdDivisa,
      discountPercent,
      paymentTerms,
      paymentMethod,
      deliveryTimeDays,
      transportation,
      warranty,
      notes,
      lines
    };

    try {
      setSubmitting(true);
      setError(null);
      if (id) {
        await api.updateOrder(id, payload);
        navigate(`/pedidos/${id}`);
      } else {
        const created = await api.createOrder(payload);
        navigate(`/pedidos/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el pedido");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p>Cargando formulario de pedido…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{id ? "Editar Pedido de Venta" : "Nuevo Pedido de Venta"}</h1>
          <p className="muted">Alta directa de orden de venta comercial</p>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <form onSubmit={submit} className="stack" style={{ gap: 20 }}>
        {/* Customer Selector Section */}
        <div className="card pad">
          <h3>1. Datos del Cliente y Destino</h3>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <label>
              Cliente *
              <div className="row" style={{ gap: 8 }}>
                <select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setLocationId("");
                    setContactId("");
                  }}
                  required
                  style={{ flex: 1 }}
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.legalName} ({c.documentNumber})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ padding: "8px 12px" }}
                  onClick={() => setShowCustomerModal(true)}
                >
                  + Nuevo
                </button>
              </div>
            </label>

            <label>
              Planta / Sucursal de Entrega
              <div className="row" style={{ gap: 8 }}>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  disabled={!selectedCustomer}
                  style={{ flex: 1 }}
                >
                  <option value="">(Planta Central / Sin especificar)</option>
                  {selectedCustomer?.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ padding: "8px 12px" }}
                  disabled={!selectedCustomer}
                  onClick={() => setShowLocationModal(true)}
                >
                  + Planta
                </button>
              </div>
            </label>

            <label>
              Contacto Responsable
              <div className="row" style={{ gap: 8 }}>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  disabled={!selectedCustomer}
                  style={{ flex: 1 }}
                >
                  <option value="">(Sin contacto específico)</option>
                  {selectedCustomer?.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.role})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ padding: "8px 12px" }}
                  disabled={!selectedCustomer}
                  onClick={() => setShowContactModal(true)}
                >
                  + Contacto
                </button>
              </div>
            </label>
          </div>
        </div>

        {/* Currency & Exchange Rate Section */}
        <div className="card pad">
          <h3>2. Moneda y Tasa de Cambio</h3>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <label>
              Moneda del Pedido *
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "ARS" | "USD_BILLETE" | "USD_DIVISA")}
              >
                <option value="ARS">ARS ($ Pesos Argentinos)</option>
                <option value="USD_BILLETE">USD Billete (Dólar Físico)</option>
                <option value="USD_DIVISA">USD Divisa (Dólar Mayorista)</option>
              </select>
            </label>

            <label>
              Cotización USD Billete (BNA)
              <input
                type="number"
                step="0.01"
                value={exchangeRateUsdBillete}
                onChange={(e) => setExchangeRateUsdBillete(Number(e.target.value))}
              />
            </label>

            <label>
              Cotización USD Divisa (BNA)
              <input
                type="number"
                step="0.01"
                value={exchangeRateUsdDivisa}
                onChange={(e) => setExchangeRateUsdDivisa(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <label>
              Descuento Global %
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
              />
            </label>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="card pad">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3>3. Ítems y Servicios del Pedido</h3>
            <button type="button" className="btn ghost" onClick={addLineItem}>
              + Agregar Renglón
            </button>
          </div>

          {lines.length === 0 ? (
            <p className="muted">No agregaste ítems al pedido todavía. Hacé clic en "+ Agregar Renglón".</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "22%" }}>Producto Catálogo</th>
                    <th style={{ width: "35%" }}>Descripción / Renglón</th>
                    <th style={{ width: "10%" }}>Cant.</th>
                    <th style={{ width: "15%" }}>Precio Unit. ({currency})</th>
                    <th style={{ width: "10%" }}>IVA %</th>
                    <th style={{ textAlign: "right" }}>Quitar</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <select
                          value={line.productId ?? ""}
                          onChange={(e) => handleProductSelect(idx, e.target.value)}
                        >
                          <option value="">(Libre / Sin Catálogo)</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} - {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={line.description}
                          onChange={(e) => updateLine(idx, { description: e.target.value })}
                          required
                          placeholder="Descripción detallada del item"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) })}
                          required
                        />
                      </td>
                      <td>
                        <select
                          value={line.taxRate}
                          onChange={(e) => updateLine(idx, { taxRate: Number(e.target.value)} )}
                        >
                          <option value={21}>21%</option>
                          <option value={10.5}>10.5%</option>
                          <option value={27}>27%</option>
                          <option value={0}>0%</option>
                        </select>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn danger"
                          style={{ padding: "4px 8px" }}
                          onClick={() => removeLine(idx)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Commercial Conditions */}
        <div className="card pad">
          <h3>4. Condiciones Comerciales</h3>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <label>
              Forma de Pago
              <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </label>
            <label>
              Método de Pago
              <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
            </label>
            <label>
              Plazo de Entrega (Días)
              <input type="number" value={deliveryTimeDays} onChange={(e) => setDeliveryTimeDays(Number(e.target.value))} />
            </label>
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <label>
              Flete / Transporte
              <input value={transportation} onChange={(e) => setTransportation(e.target.value)} />
            </label>
            <label>
              Garantía
              <input value={warranty} onChange={(e) => setWarranty(e.target.value)} />
            </label>
          </div>
          <label style={{ marginTop: 12 }}>
            Notas u Observaciones Operativas
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instrucciones especiales de despacho..." />
          </label>
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 12 }}>
          <button type="button" className="btn ghost" onClick={() => navigate("/pedidos")}>
            Cancelar
          </button>
          <button className="btn" disabled={submitting}>
            {id ? "Guardar Cambios" : "Crear Pedido de Venta"}
          </button>
        </div>
      </form>

      {/* Inline Creation Modals */}
      {showCustomerModal && (
        <CustomerModal
          onClose={() => setShowCustomerModal(false)}
          onCreated={(newCust) => {
            setCustomers((prev) => [newCust, ...prev]);
            setCustomerId(newCust.id);
            setShowCustomerModal(false);
          }}
        />
      )}

      {showLocationModal && selectedCustomer && (
        <LocationModal
          customerId={selectedCustomer.id}
          onClose={() => setShowLocationModal(false)}
          onCreated={(updatedCust) => {
            setSelectedCustomer(updatedCust);
            const newLoc = updatedCust.locations[updatedCust.locations.length - 1];
            if (newLoc) setLocationId(newLoc.id);
            setShowLocationModal(false);
          }}
        />
      )}

      {showContactModal && selectedCustomer && (
        <ContactModal
          customer={selectedCustomer}
          onClose={() => setShowContactModal(false)}
          onCreated={(updatedCust) => {
            setSelectedCustomer(updatedCust);
            const newCont = updatedCust.contacts[updatedCust.contacts.length - 1];
            if (newCont) setContactId(newCont.id);
            setShowContactModal(false);
          }}
        />
      )}
    </>
  );
}

function CustomerModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (cust: CustomerSummary) => void;
}) {
  const [legalName, setLegalName] = useState("");
  const [documentType] = useState("Cuit");
  const [documentNumber, setDocumentNumber] = useState("");
  const [taxCondition, setTaxCondition] = useState("ResponsableInscripto");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fiscalStreet, setFiscalStreet] = useState("");
  const [fiscalCity, setFiscalCity] = useState("San Lorenzo");
  const [fiscalProvince, setFiscalProvince] = useState("SantaFe");
  const [fiscalPostalCode, setFiscalPostalCode] = useState("2200");
  const [consulting, setConsulting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const consultArca = async () => {
    const clean = documentNumber.replace(/\D/g, "");
    if (!clean || clean.length !== 11) {
      setError("Ingresá un CUIT válido de 11 dígitos para consultar.");
      return;
    }
    try {
      setConsulting(true);
      setError(null);
      setSuccessMsg(null);
      const res = await api.consultArcaCuit(clean);
      if (res) {
        setDocumentNumber(clean);
        setLegalName(res.legalName);
        setTaxCondition(res.taxCondition || "ResponsableInscripto");
        if (res.fiscalStreet) setFiscalStreet(res.fiscalStreet);
        if (res.fiscalCity) setFiscalCity(res.fiscalCity);
        if (res.fiscalProvince) setFiscalProvince(res.fiscalProvince);
        if (res.fiscalPostalCode) setFiscalPostalCode(res.fiscalPostalCode);
        setSuccessMsg(`✓ Importado desde ARCA: ${res.legalName}`);
      }
    } catch (err) {
      setError("No se encontraron datos en ARCA para el CUIT.");
    } finally {
      setConsulting(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createCustomer({
        legalName,
        documentType,
        documentNumber,
        taxCondition,
        iibbRegime: "Local",
        status: "Active",
        isCustomer: true,
        isSupplier: false,
        email,
        phone,
        fiscalAddress: {
          street: fiscalStreet || "Calle Principal 100",
          city: fiscalCity || "San Lorenzo",
          province: fiscalProvince || "SantaFe",
          postalCode: fiscalPostalCode || "2200"
        }
      });
      onCreated({
        id: created.id,
        legalName: created.legalName,
        documentType: created.documentType,
        documentNumber: created.documentNumber,
        taxCondition: created.taxCondition,
        status: created.status,
        isCustomer: created.isCustomer,
        isSupplier: created.isSupplier,
        email: created.email,
        phone: created.phone
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cliente");
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card card pad">
        <h3>+ Alta Rápida de Cliente</h3>
        {error && <div className="alert">{error}</div>}
        {successMsg && <div className="alert ok" style={{ background: "#ecfdf5", border: "1px solid #10b981", color: "#065f46", marginBottom: 12 }}>{successMsg}</div>}
        <form onSubmit={submit} className="stack" style={{ marginTop: 12 }}>
          <div className="grid-2">
            <label>
              CUIT / DNI *
              <div className="row" style={{ gap: 8 }}>
                <input
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  required
                  placeholder="30112233445"
                />
                <button
                  type="button"
                  className="btn"
                  onClick={consultArca}
                  disabled={consulting}
                  style={{ background: "linear-gradient(180deg, #2563eb, #1d4ed8)", color: "#fff", whiteSpace: "nowrap", padding: "0 12px" }}
                >
                  {consulting ? "🔍 ARCA…" : "🔍 ARCA"}
                </button>
              </div>
            </label>
            <label>
              Razón Social *
              <input value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
            </label>
          </div>

          <div className="grid-2">
            <label>
              Condición IVA
              <select value={taxCondition} onChange={(e) => setTaxCondition(e.target.value)}>
                <option value="ResponsableInscripto">Responsable Inscripto</option>
                <option value="Monotributo">Monotributo</option>
                <option value="Exento">Exento</option>
                <option value="ConsumidorFinal">Consumidor Final</option>
              </select>
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>

          <div className="grid-2">
            <label>
              Teléfono
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              Calle / Domicilio Fiscal
              <input value={fiscalStreet} onChange={(e) => setFiscalStreet(e.target.value)} placeholder="San Martin 1234" />
            </label>
          </div>

          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn">Guardar Cliente</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LocationModal({
  customerId,
  onClose,
  onCreated
}: {
  customerId: string;
  onClose: () => void;
  onCreated: (cust: CustomerDetail) => void;
}) {
  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("San Lorenzo");
  const [province, setProvince] = useState("SantaFe");
  const [postalCode, setPostalCode] = useState("2200");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const updated = await api.addLocation(customerId, { name, street, city, province, postalCode });
    onCreated(updated);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card card pad">
        <h3>+ Nueva Planta de Entrega</h3>
        <form onSubmit={submit} className="stack" style={{ marginTop: 12 }}>
          <label>
            Nombre Planta *
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej. Planta Puerto" />
          </label>
          <label>
            Dirección / Calle *
            <input value={street} onChange={(e) => setStreet(e.target.value)} required />
          </label>
          <div className="grid-3">
            <label>
              Ciudad *
              <input value={city} onChange={(e) => setCity(e.target.value)} required />
            </label>
            <label>
              Provincia *
              <select value={province} onChange={(e) => setProvince(e.target.value)}>
                {provinces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              CP *
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required />
            </label>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn">Agregar Planta</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContactModal({
  customer,
  onClose,
  onCreated
}: {
  customer: CustomerDetail;
  onClose: () => void;
  onCreated: (cust: CustomerDetail) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Commercial");
  const [locationId, setLocationId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const updated = await api.addContact(customer.id, {
      name,
      role,
      locationId: locationId || null,
      email,
      phone,
      isPrimary: false
    });
    onCreated(updated);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card card pad">
        <h3>+ Nuevo Contacto</h3>
        <form onSubmit={submit} className="stack" style={{ marginTop: 12 }}>
          <label>
            Nombre y Apellido *
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <div className="grid-2">
            <label>
              Rol
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="Commercial">Comercial / Compras</option>
                <option value="Technical">Técnico / Planta</option>
                <option value="Administrative">Administración</option>
              </select>
            </label>
            <label>
              Planta Vinculada
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">(General / Sin Planta)</option>
                {customer.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid-2">
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Teléfono / Celular
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn">Agregar Contacto</button>
          </div>
        </form>
      </div>
    </div>
  );
}
