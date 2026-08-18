import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { EmailComposer } from "../components/EmailComposer";
import { currencyLabels, label, type CustomerDetail, type Order, type OrderStatus } from "../api/types";

export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const ord = await api.getOrder(id);
      setOrder(ord);
      if (ord.customerId && ord.customerId !== "00000000-0000-0000-0000-000000000000") {
        const cust = await api.getCustomer(ord.customerId).catch(() => null);
        setCustomer(cust);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el detalle del pedido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const changeStatus = async (newStatus: OrderStatus) => {
    if (!order) return;
    try {
      setUpdatingStatus(true);
      const updated = await api.updateOrderStatus(order.id, newStatus);
      setOrder(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el estado");
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) return <p>Cargando detalle del pedido…</p>;
  if (error || !order) return <div className="alert">{error || "Pedido no encontrado"}</div>;

  const location = customer?.locations.find((l) => l.id === order.locationId);
  const contact = customer?.contacts.find((c) => c.id === order.contactId);

  const isUsd = order.currency !== "ARS";
  const currLabel = currencyLabels[order.currency] ?? order.currency;
  const rate = order.currency === "USD_DIVISA" ? (order.exchangeRateUsdDivisa || 1487.5) : (order.exchangeRateUsdBillete || 1510);
  const totalArsEquivalent = order.total * rate;
  const flow: OrderStatus[] = ["Draft", "Confirmed", "InPreparation", "Dispatched", "Delivered", "Invoiced"];
  const currentIndex = flow.indexOf(order.status);
  const nextStatus = currentIndex >= 0 && currentIndex < flow.length - 1 ? flow[currentIndex + 1] : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <h1>Pedido de Venta #{order.orderNumber}</h1>
            <span className="badge ok" style={{ fontSize: "0.9rem", padding: "6px 14px" }}>
              {label(order.status)}
            </span>
            {isUsd && (
              <span className="badge warn" style={{ fontSize: "0.9rem", padding: "6px 14px" }}>
                💵 {currLabel} (TC: ${rate})
              </span>
            )}
          </div>
          <p className="muted">
            Creado el {new Date(order.createdAtUtc).toLocaleDateString("es-AR")}
            {order.quoteNumber && ` · Origen Cotización #${order.quoteNumber}`}
          </p>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn" onClick={() => setShowEmail(true)}>✉ Enviar por email</button>
          {showEmail && <EmailComposer context={{ entityType: "Order", entityId: order.id, to: contact?.email || customer?.email || undefined, subject: `Pedido de venta ${order.orderNumber}`, body: `Hola,\n\nCompartimos la confirmación del pedido de venta ${order.orderNumber}, por un total de ${currLabel} ${order.total.toLocaleString("es-AR")}.\n\nSaludos.\n` }} onClose={() => setShowEmail(false)} />}
          <Link className="btn" to={`/remitos/nuevo?order_id=${order.id}`} style={{ background: "linear-gradient(180deg, #2563eb, #1d4ed8)" }}>
            🚚 Generar Remito
          </Link>
          <Link className="btn" to={`/facturas/nueva?order_id=${order.id}`} style={{ background: "linear-gradient(180deg, #059669, #047857)" }}>
            📄 Emitir Factura
          </Link>
          <button
            type="button"
            className="btn ghost"
            onClick={() => window.print()}
          >
            🖨️ Imprimir
          </button>
          <Link className="btn ghost" to={`/pedidos/${order.id}/editar`}>
            ✏️ Editar
          </Link>
        </div>
      </div>

      {/* Progress Stepper Bar */}
      <div className="card pad" style={{ marginBottom: 24, background: "#ffffff" }}>
        <h4 style={{ margin: "0 0 12px" }}>Progreso y Estado del Pedido</h4>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {flow.map((st, index) => (
            <div
              key={st}
              className={`sales-step ${order.status === st ? "active" : ""} ${currentIndex > index ? "complete" : ""}`}
              style={{ flex: 1 }}
            >
              <span>{currentIndex > index ? "✓" : index + 1}</span>{label(st)}
            </div>
          ))}
        </div>
        <div className="toolbar" style={{ marginTop: 14 }}>
          {nextStatus && order.status !== "Cancelled" && <button type="button" className="btn" disabled={updatingStatus} onClick={() => changeStatus(nextStatus)}>Avanzar a {label(nextStatus)}</button>}
          {(["Draft", "Confirmed", "InPreparation"] as OrderStatus[]).includes(order.status) && <button type="button" className="btn danger" disabled={updatingStatus} onClick={() => { if (confirm("¿Cancelar este pedido? La acción quedará cerrada.")) changeStatus("Cancelled"); }}>Cancelar pedido</button>}
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <section className="card pad">
          <h3>Cliente y Domicilio Fiscal</h3>
          {customer ? (
            <>
              <p style={{ fontSize: 16 }}>
                <strong>{customer.legalName}</strong>
              </p>
              <p className="muted">
                {label(customer.documentType)}: {customer.documentNumber}
              </p>
              <p className="muted">Condición IVA: {label(customer.taxCondition)}</p>
              {customer.fiscalAddress && (
                <p className="muted">
                  Domicilio: {customer.fiscalAddress.street}, {customer.fiscalAddress.city} ({customer.fiscalAddress.province})
                </p>
              )}
            </>
          ) : (
            <p className="muted">Cargando cliente…</p>
          )}
        </section>

        <section className="card pad">
          <h3>Planta de Entrega</h3>
          {location ? (
            <>
              <p style={{ fontSize: 16 }}>
                <strong>📌 {location.name}</strong>
              </p>
              <p className="muted">
                {location.address.street}, {location.address.city} ({location.address.province})
              </p>
              {location.phone && <p className="muted">Teléfono Planta: {location.phone}</p>}
            </>
          ) : (
            <p className="muted">Sin planta de entrega específica (Planta Central)</p>
          )}
        </section>

        <section className="card pad">
          <h3>Contacto Responsable</h3>
          {contact ? (
            <>
              <p style={{ fontSize: 16 }}>
                <strong>👤 {contact.name}</strong>
              </p>
              <p className="muted">Rol: {label(contact.role)}</p>
              {contact.phone && <p className="muted">Teléfono: {contact.phone}</p>}
              {contact.email && <p className="muted">Email: {contact.email}</p>}
            </>
          ) : (
            <p className="muted">Sin contacto específico asignado</p>
          )}
        </section>
      </div>

      {/* Line Items Table */}
      <section className="card pad" style={{ marginBottom: 24 }}>
        <h3>Detalle de Ítems del Pedido ({currLabel})</h3>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Cant.</th>
                <th>Precio Unit. ({isUsd ? "U$D" : "ARS $"})</th>
                <th>Dto %</th>
                <th>IVA %</th>
                <th style={{ textAlign: "right" }}>Subtotal ({isUsd ? "U$D" : "ARS $"})</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.description}
                    {l.isOptional && <span className="muted" style={{ marginLeft: 6 }}>(OPCIONAL)</span>}
                  </td>
                  <td>{l.quantity}</td>
                  <td>
                    {isUsd ? "U$D " : "ARS $"}
                    {l.unitPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                  <td>{l.discountPercent}%</td>
                  <td>{l.taxRate}%</td>
                  <td style={{ textAlign: "right" }}>
                    <strong>
                      {isUsd ? "U$D " : "ARS $"}
                      {l.lineSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totals & Financial Summary */}
      <div className="split">
        <section className="card pad">
          <h3>Condiciones Comerciales y Logísticas</h3>
          <p><strong>Forma de Pago:</strong> {order.paymentTerms ?? "Contado / A convenir"}</p>
          <p><strong>Método de Pago:</strong> {order.paymentMethod ?? "Transferencia Bancaria"}</p>
          <p><strong>Plazo de Entrega:</strong> {order.deliveryTimeDays ? `${order.deliveryTimeDays} días` : "Inmediata"}</p>
          <p><strong>Transporte / Flete:</strong> {order.transportation ?? "A cargo del comprador"}</p>
          <p><strong>Garantía:</strong> {order.warranty ?? "6 meses"}</p>
          {order.notes && <p><strong>Notas Operativas:</strong> {order.notes}</p>}
        </section>

        <section className="card pad" style={{ background: "#ffffff" }}>
          <h3>Resumen de Importes ({currLabel})</h3>
          <div className="stack" style={{ gap: 8, fontSize: "1.05rem", marginTop: 16 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>Subtotal Neto:</span>
              <span>
                {isUsd ? "U$D " : "ARS $"}
                {order.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {order.discountPercent > 0 && (
              <div className="row" style={{ justifyContent: "space-between", color: "#d97706" }}>
                <span>Descuento Global ({order.discountPercent}%):</span>
                <span>
                  -{isUsd ? "U$D " : "ARS $"}
                  {(order.subtotal * (order.discountPercent / 100)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <hr style={{ borderColor: "var(--line)", margin: "8px 0" }} />
            <div className="row" style={{ justifyContent: "space-between", fontSize: "1.3rem", fontWeight: 700 }}>
              <span>TOTAL PEDIDO:</span>
              <span style={{ color: "var(--primary)" }}>
                {isUsd ? "U$D " : "ARS $"}
                {order.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {isUsd && (
              <div className="muted" style={{ fontSize: "0.85rem", marginTop: 8, background: "#f8fafc", padding: 10, borderRadius: 6 }}>
                Equivalente estimado en pesos: <strong>ARS ${totalArsEquivalent.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong> (Tipo de cambio BNA de referencia: ${rate} ARS)
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
