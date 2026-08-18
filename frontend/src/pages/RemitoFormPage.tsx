import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type CustomerDetail, type CustomerSummary, type ProductSummary, type RemitoWrite } from "../api/types";

interface RemitoLineItem {
  productId?: string;
  code: string;
  description: string;
  orderedQty?: number;
  deliveredQty?: number;
  pendingQty?: number;
  quantity: number;
  unitMeasure: string;
  serialNumber?: string;
}

export function RemitoFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const orderId = queryParams.get("order_id");

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [remitoNumber, setRemitoNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerDocument, setCustomerDocument] = useState("");
  const [locationId, setLocationId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);
  const [warehouse, setWarehouse] = useState("Depósito Central");
  const [carrierName, setCarrierName] = useState("");
  const [driverLicense, setDriverLicense] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<RemitoLineItem[]>([
    { productId: undefined, code: "ITEM-01", description: "Mercadería general", quantity: 1, unitMeasure: "u" }
  ]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [custPage, prodList] = await Promise.all([
          api.listCustomers().catch(() => ({ items: [], total: 0, page: 1, pageSize: 50 })),
          api.listProducts().catch(() => [])
        ]);

        setCustomers(custPage.items);
        setProducts(prodList);

        if (orderId) {
          const order = await api.getOrder(orderId).catch(() => null);
          if (order) {
            setOrderNumber(order.orderNumber);
            let custDetail: CustomerDetail | null = null;
            if (order.customerId && order.customerId !== "00000000-0000-0000-0000-000000000000") {
              custDetail = await api.getCustomer(order.customerId).catch(() => null);
            }

            const foundName = custDetail?.legalName || custPage.items.find((c) => c.id === order.customerId)?.legalName || "";
            const foundDoc = custDetail?.documentNumber || custPage.items.find((c) => c.id === order.customerId)?.documentNumber || "";

            setCustomerId(order.customerId);
            setCustomerName(foundName);
            setCustomerDocument(foundDoc);
            setCustomerDetail(custDetail);

            let delivAddress = "";
            if (custDetail) {
              if (order.locationId) {
                const loc = custDetail.locations.find((l) => l.id === order.locationId);
                if (loc) {
                  setLocationId(loc.id);
                  delivAddress = `${loc.name} - ${loc.address.street}, ${loc.address.city}, ${loc.address.province}`;
                }
              }
              if (!delivAddress && custDetail.fiscalAddress?.street) {
                delivAddress = `${custDetail.fiscalAddress.street}, ${custDetail.fiscalAddress.city}, ${custDetail.fiscalAddress.province}`;
              }
            }
            setDeliveryAddress(delivAddress);
            setCarrierName(order.transportation || "");
            setNotes(`Generado desde Pedido N° ${order.orderNumber}${order.notes ? ` · ${order.notes}` : ""}`);

            const orderLines = order.lines || [];
            if (orderLines.length > 0) {
              setItems(
                orderLines.map((i) => {
                  const prod = prodList.find((p) => p.id === i.productId);
                  return {
                    productId: i.productId ?? undefined,
                    code: prod?.code || "ITEM",
                    description: i.description || prod?.name || "Mercadería",
                    orderedQty: i.quantity,
                    deliveredQty: 0,
                    pendingQty: i.quantity,
                    quantity: i.quantity,
                    unitMeasure: prod?.baseUnit || "u"
                  };
                })
              );
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos del remito");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [orderId]);

  const handleCustomerChange = async (newCustId: string) => {
    const c = customers.find((x) => x.id === newCustId);
    if (!c) return;

    setCustomerId(c.id);
    setCustomerName(c.legalName);
    setCustomerDocument(c.documentNumber);

    try {
      const detail = await api.getCustomer(newCustId);
      setCustomerDetail(detail);
      if (detail.fiscalAddress?.street) {
        setDeliveryAddress(`${detail.fiscalAddress.street}, ${detail.fiscalAddress.city}, ${detail.fiscalAddress.province}`);
      }
    } catch {
      // fallback
    }
  };

  const handleLocationChange = (locId: string) => {
    setLocationId(locId);
    if (!locId && customerDetail?.fiscalAddress?.street) {
      setDeliveryAddress(`${customerDetail.fiscalAddress.street}, ${customerDetail.fiscalAddress.city}, ${customerDetail.fiscalAddress.province}`);
      return;
    }
    const loc = customerDetail?.locations.find((l) => l.id === locId);
    if (loc) {
      setDeliveryAddress(`${loc.name} - ${loc.address.street}, ${loc.address.city}, ${loc.address.province}`);
    }
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { productId: undefined, code: "", description: "", quantity: 1, unitMeasure: "u" }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemProductSelect = (index: number, prodId: string) => {
    const p = products.find((x) => x.id === prodId);
    if (!p) return;
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        productId: p.id,
        code: p.code,
        description: p.name,
        unitMeasure: p.baseUnit || "u"
      };
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setError("Por favor seleccioná un cliente para emitir el remito.");
      return;
    }

    const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    if (totalQty <= 0) {
      setError("Debe remitir al menos un ítem con cantidad mayor a cero.");
      return;
    }

    const payload: RemitoWrite = {
      orderId: orderId || undefined,
      customerId,
      customerName,
      customerDocument,
      deliveryAddress,
      deliveryDate,
      carrierName: carrierName ? `${carrierName}${technicianName ? ` (Técnico: ${technicianName})` : ""}` : technicianName,
      driverLicense,
      notes: notes ? `${notes}${warehouse ? ` · Egreso: ${warehouse}` : ""}` : `Egreso: ${warehouse}`,
      items: items.filter((i) => i.quantity > 0).map((i) => ({
        productId: i.productId,
        code: i.code || "ITEM",
        description: i.serialNumber ? `${i.description} (S/N: ${i.serialNumber})` : i.description,
        quantity: i.quantity,
        unitMeasure: i.unitMeasure || "u"
      }))
    };

    try {
      setSaving(true);
      setError(null);
      const res = await api.createRemito(payload);
      navigate(`/remitos/${res.id}/imprimir`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al emitir el remito");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="pad muted">Cargando formulario de remito…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🚚 {orderId ? `Generar Remito desde Pedido #${orderNumber || orderId}` : "Nuevo Remito de Entrega"}</h1>
          <p className="muted">Comprobante oficial R para respaldo y traslado de mercadería con control de stock</p>
        </div>
        <Link className="btn ghost" to={orderId ? `/pedidos/${orderId}` : "/remitos"}>
          ← Volver
        </Link>
      </div>

      {error && <div className="alert">{error}</div>}

      <form onSubmit={handleSubmit} className="stack" style={{ gap: 20 }}>
        {/* General Info Card */}
        <div className="card pad">
          <h3 style={{ margin: "0 0 16px", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            1. Información del Remito y Destino
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
              Planta / Destino de Entrega
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
              Fecha de Entrega *
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="grid-4" style={{ marginTop: 14 }}>
            <label>
              Depósito de Egreso
              <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
                <option value="Depósito Central">Depósito Central</option>
                <option value="Taller de Calibración">Taller de Calibración</option>
                <option value="Móvil Técnico / Vehículo">Móvil Técnico / Vehículo</option>
                <option value="Depósito de Repuestos">Depósito de Repuestos</option>
              </select>
            </label>

            <label>
              Técnico Asignado (Opcional)
              <input
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                placeholder="Ej: Marcelo Gómez..."
              />
            </label>

            <label>
              Transportista / Chofer
              <input
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="Transporte Propio / Expreso..."
              />
            </label>

            <label>
              Patente / Dominio
              <input
                value={driverLicense}
                onChange={(e) => setDriverLicense(e.target.value)}
                placeholder="AB 123 CD"
              />
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <label>
              Dirección de Descarga en Planta
              <input
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Ruta 11 Km 320, Portón 3, San Lorenzo..."
              />
            </label>
          </div>
        </div>

        {/* Items Table Card */}
        <div className="card pad">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>2. Ítems a Remitir</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                Ajustá las cantidades a entregar en esta ocasión. Si algún ítem no se despacha hoy, poné la cantidad en 0.
              </p>
            </div>
            <button type="button" className="btn ghost" onClick={handleAddItem}>
              + Agregar Ítem Manual
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "25%" }}>Catálogo / Código</th>
                  <th style={{ width: "35%" }}>Descripción / Detalle Mercadería & Números de Serie</th>
                  {orderId && <th style={{ width: "10%", textAlign: "center" }}>Cant. Pedida</th>}
                  <th style={{ width: "14%", textAlign: "center" }}>A Remitir</th>
                  <th style={{ width: "10%" }}>Unidad</th>
                  <th style={{ width: "6%", textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
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
                          value={item.code}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx].code = e.target.value;
                            setItems(next);
                          }}
                          placeholder="Código..."
                          style={{ fontSize: "0.82rem" }}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="stack" style={{ gap: 4 }}>
                        <input
                          value={item.description}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx].description = e.target.value;
                            setItems(next);
                          }}
                          required
                          placeholder="Descripción detallada de la mercadería..."
                        />
                        <input
                          value={item.serialNumber ?? ""}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx].serialNumber = e.target.value;
                            setItems(next);
                          }}
                          placeholder="Números de serie / lote (opcional, ej: S/N 847291)..."
                          style={{ fontSize: "0.8rem", color: "#2563eb" }}
                        />
                      </div>
                    </td>
                    {orderId && (
                      <td style={{ textAlign: "center", fontWeight: "bold", color: "#64748b" }}>
                        {item.orderedQty ?? item.quantity}
                      </td>
                    )}
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.quantity}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx].quantity = Number(e.target.value);
                          setItems(next);
                        }}
                        style={{ textAlign: "center", fontWeight: "bold", fontSize: "1rem" }}
                        required
                      />
                    </td>
                    <td>
                      <input
                        value={item.unitMeasure}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx].unitMeasure = e.target.value;
                          setItems(next);
                        }}
                        style={{ textAlign: "center" }}
                      />
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes Card */}
        <div className="card pad">
          <label>
            Observaciones & Condiciones de Entrega
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Horario de recepción, precintos, requisitos de seguridad en planta..."
            />
          </label>
        </div>

        {/* Submit Actions */}
        <div className="row" style={{ justifyContent: "flex-end", gap: 12, marginBottom: 40 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => navigate(orderId ? `/pedidos/${orderId}` : "/remitos")}
          >
            Cancelar
          </button>
          <button
            className="btn"
            disabled={saving}
            style={{ background: "linear-gradient(180deg, #2563eb, #1d4ed8)", padding: "10px 24px", fontSize: "1rem" }}
          >
            {saving ? "Emitiendo Remito…" : "🚚 Generar y Guardar Remito"}
          </button>
        </div>
      </form>
    </>
  );
}
