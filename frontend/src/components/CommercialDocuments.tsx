import { currencyMeta, label, type CompanySettings, type CustomerDetail, type Order, type PurchaseOrder, type Remito, type Supplier } from "../api/types";
import { DEFAULT_DOCUMENT_TEMPLATES, useDocumentTemplate } from "../context/DocumentTemplateContext";
import { CommercialDocument, CommercialSection, documentCuit, documentDate, documentMoney } from "./CommercialDocumentParts";

function Recipient({ heading, name, document, address, meta }: { heading: string; name: string; document?: string | null; address?: string; meta: { label: string; value: string }[] }) {
  return <section className="quote-document__recipient quote-document__keep">
    <div><span className="quote-document__field-label">{heading}</span><h2>{name}</h2>{document && <p>CUIT {documentCuit(document)}</p>}{address && <p>{address}</p>}</div>
    <div className="quote-document__recipient-meta">{meta.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
  </section>;
}

function Conditions({ entries }: { entries: { label: string; value?: string | null }[] }) {
  return <div className="quote-document__condition-grid">{entries.filter((entry) => entry.value).map((entry) => <div key={entry.label}><span>{entry.label}</span><strong>{entry.value}</strong></div>)}</div>;
}

function Notes({ text }: { text?: string | null }) {
  return text ? <aside className="quote-document__notes quote-document__keep"><strong>Observaciones</strong><p>{text}</p></aside> : null;
}

function Signatures({ left, right }: { left: string; right: string }) {
  return <div className="quote-document__signatures quote-document__keep"><div>{left}</div><div>{right}</div></div>;
}

export function OrderDocument({ order, customer, company }: { order: Order; customer: CustomerDetail | null; company: CompanySettings | null }) {
  const curr = currencyMeta[order.currency] ?? { label: order.currency, symbol: "$", detail: "" };
  const discount = order.subtotal * order.discountPercent / 100;
  const tax = Math.max(0, order.total - order.subtotal + discount);
  const location = customer?.locations.find((item) => item.id === order.locationId);
  const contact = customer?.contacts.find((item) => item.id === order.contactId);
  return <CommercialDocument id="order-pdf-sheet" company={company} title="Pedido de venta" eyebrow="CONFIRMACIÓN COMERCIAL" number={order.orderNumber} badge={label(order.status)}
    meta={<Recipient heading="CLIENTE" name={customer?.legalName || "Cliente"} document={customer?.documentNumber}
      address={[customer?.fiscalAddress?.street, customer?.fiscalAddress?.city, customer?.fiscalAddress?.province].filter(Boolean).join(" · ")}
      meta={[{ label: "EMISIÓN", value: documentDate(order.createdAtUtc) }, { label: "MONEDA", value: curr.label }, { label: "ORIGEN", value: order.quoteNumber ? `Presupuesto ${order.quoteNumber}` : "Pedido directo" }]} />}>
    <CommercialSection index="01" title="Detalle del pedido" description="Productos y servicios confirmados">
      <table className="quote-document__items"><thead><tr><th>ÍTEM / DESCRIPCIÓN</th><th>CANT.</th><th>PRECIO UNIT.</th><th>DESC.</th><th>IVA</th><th>IMPORTE</th></tr></thead><tbody>
        {order.lines.map((line, index) => <tr key={line.id}><td><span className="quote-document__item-index">{String(index + 1).padStart(2, "0")}</span><strong>{line.description}</strong>{line.isOptional && <small>OPCIONAL · no incluido en el total</small>}</td>
          <td>{line.quantity.toLocaleString("es-AR")}</td><td>{documentMoney(line.unitPrice)}</td><td>{line.discountPercent ? `${line.discountPercent}%` : "—"}</td><td>{line.taxRate}%</td><td className="quote-document__item-total">{line.isOptional ? "—" : documentMoney(line.lineSubtotal)}</td></tr>)}
      </tbody></table>
    </CommercialSection>
    <section className="quote-document__closing quote-document__keep"><div className="quote-document__closing-note"><span className="quote-document__field-label">ESTADO DEL PEDIDO</span><p>{label(order.status)}</p><small>Los ítems opcionales no integran el importe total.</small></div>
      <div className="quote-document__totals"><div><span>Subtotal neto</span><strong>{curr.symbol} {documentMoney(order.subtotal)}</strong></div>{discount > 0 && <div><span>Descuento {order.discountPercent}%</span><strong>− {curr.symbol} {documentMoney(discount)}</strong></div>}<div><span>IVA</span><strong>{curr.symbol} {documentMoney(tax)}</strong></div><div className="quote-document__grand-total"><span>Total</span><strong>{curr.symbol} {documentMoney(order.total)}</strong></div></div>
    </section>
    <CommercialSection index="02" title="Condiciones y entrega" description="Datos para preparar el despacho y la facturación"><Conditions entries={[
      { label: "ENTREGA / DESTINO", value: location ? [location.name, location.address.street, location.address.city].filter(Boolean).join(" · ") : "Domicilio fiscal" },
      { label: "PLAZO DE ENTREGA", value: order.deliveryTimeText || (order.deliveryTimeDays ? `${order.deliveryTimeDays} días` : "A coordinar") },
      { label: "CONDICIONES DE PAGO", value: order.paymentTerms || "A convenir" }, { label: "MEDIO DE PAGO", value: order.paymentMethod || "A convenir" },
      { label: "TRANSPORTE", value: order.transportation || "A coordinar" }, { label: "GARANTÍA", value: order.warranty || "A convenir" },
      { label: "CONTACTO", value: contact?.name }
    ]} /></CommercialSection>
    <Notes text={order.notes} />
  </CommercialDocument>;
}

export function RemitoDocument({ remito, customer, company }: { remito: Remito; customer: CustomerDetail | null; company: CompanySettings | null }) {
  const { settings } = useDocumentTemplate();
  return <CommercialDocument id="remito-pdf-sheet" company={company} title="Remito" eyebrow={settings.remito.headerTitle} number={remito.remitoNumber} badge="R · COD. 91"
    meta={<Recipient heading="DESTINATARIO" name={remito.customerName || customer?.legalName || "Cliente"} document={remito.customerDocument || customer?.documentNumber}
      address={settings.remito.showRecipientAddress ? [customer?.fiscalAddress?.street, customer?.fiscalAddress?.city, customer?.fiscalAddress?.province].filter(Boolean).join(" · ") : ""}
      meta={[{ label: "EMISIÓN", value: documentDate(remito.issueDate) }, { label: "ENTREGA", value: documentDate(remito.deliveryDate) }, { label: "ESTADO", value: label(remito.status) }]} />}>
    <CommercialSection index="01" title="Detalle de entrega" description="Mercadería y cantidades despachadas"><table className="quote-document__items commercial-document__delivery-items"><thead><tr><th>ÍTEM / DESCRIPCIÓN</th><th>CÓDIGO</th><th>CANT.</th><th>UNIDAD</th></tr></thead><tbody>
      {remito.items.map((item, index) => <tr key={item.id}><td><span className="quote-document__item-index">{String(index + 1).padStart(2, "0")}</span><strong>{item.description}</strong></td><td>{item.code || "—"}</td><td>{item.quantity.toLocaleString("es-AR")}</td><td>{item.unitMeasure || "u"}</td></tr>)}
    </tbody></table></CommercialSection>
    <CommercialSection index="02" title="Entrega y recepción" description="Destino y datos de traslado"><Conditions entries={[
      { label: "LUGAR DE ENTREGA", value: remito.deliveryAddress || "Domicilio fiscal del cliente" },
      ...(settings.remito.showCarrierInfo ? [{ label: "TRANSPORTE / CHOFER", value: remito.carrierName }, { label: "LICENCIA / DOMINIO", value: remito.driverLicense }] : []),
      { label: "PEDIDO DE ORIGEN", value: remito.orderId ? "Pedido asociado" : undefined }, { label: "FACTURA", value: remito.invoiceNumber }
    ]} /></CommercialSection>
    <Notes text={remito.notes} />
    <div className="commercial-document__legal quote-document__keep"><p>{settings.remito.carrierLegalText}</p><p>{settings.remito.receptionClause}</p></div>
    {settings.remito.showSignaturesBox && <Signatures left="Entregó · firma y aclaración" right="Recibió conforme · firma, aclaración y fecha" />}
    <p className="commercial-document__notice quote-document__keep">{settings.remito.customFooterText}</p>
  </CommercialDocument>;
}

export function PurchaseOrderDocument({ order, supplier, company }: { order: PurchaseOrder; supplier: Supplier | null; company: CompanySettings | null }) {
  const { settings } = useDocumentTemplate();
  const symbol = order.currency === "USD" ? "USD" : "$";
  const billingInstructions = settings.purchaseOrder.billingInstructions === DEFAULT_DOCUMENT_TEMPLATES.purchaseOrder.billingInstructions
    ? `Facturar a nombre de ${company?.legalName || "la empresa emisora"} (CUIT ${documentCuit(company?.documentNumber)}) e indicar el número de esta orden en el comprobante.`
    : settings.purchaseOrder.billingInstructions;
  return <CommercialDocument id="purchase-order-pdf-sheet" company={company} title="Orden de compra" eyebrow={settings.purchaseOrder.headerTitle} number={order.orderNumber} badge={label(order.status)}
    meta={<Recipient heading="PROVEEDOR" name={order.supplierName || supplier?.legalName || "Proveedor"} document={order.supplierDocument || supplier?.documentNumber}
      address={supplier?.address ? [supplier.address.street, supplier.address.city, supplier.address.province].filter(Boolean).join(" · ") : ""}
      meta={[{ label: "EMISIÓN", value: documentDate(order.issueDate) }, { label: "ENTREGA", value: order.expectedDeliveryDate ? documentDate(order.expectedDeliveryDate) : "A coordinar" }, { label: "MONEDA", value: order.currency }]} />}>
    <CommercialSection index="01" title="Productos y servicios" description="Detalle de lo solicitado al proveedor"><table className="quote-document__items"><thead><tr><th>ÍTEM / DESCRIPCIÓN</th><th>CANT.</th><th>PRECIO UNIT.</th><th>DESC.</th><th>IVA</th><th>IMPORTE</th></tr></thead><tbody>
      {order.items.map((item, index) => <tr key={item.id}><td><span className="quote-document__item-index">{String(index + 1).padStart(2, "0")}</span><strong>{item.description}</strong>{item.code && <small>Código {item.code}</small>}</td><td>{item.quantity.toLocaleString("es-AR")}</td><td>{documentMoney(item.unitPrice)}</td><td>{item.discountPercent ? `${item.discountPercent}%` : "—"}</td><td>{item.taxRate}%</td><td className="quote-document__item-total">{documentMoney(item.total)}</td></tr>)}
    </tbody></table></CommercialSection>
    <section className="quote-document__closing quote-document__keep"><div className="quote-document__closing-note"><span className="quote-document__field-label">ORDEN EMITIDA EN</span><p>{order.currency}</p>{order.currency === "USD" && order.exchangeRate > 0 && <small>Tipo de cambio de referencia: ARS {documentMoney(order.exchangeRate)} por USD</small>}</div>
      <div className="quote-document__totals"><div><span>Subtotal neto</span><strong>{symbol} {documentMoney(order.subtotal)}</strong></div><div><span>IVA</span><strong>{symbol} {documentMoney(order.taxAmount)}</strong></div><div className="quote-document__grand-total"><span>Total</span><strong>{symbol} {documentMoney(order.total)}</strong></div></div>
    </section>
    <CommercialSection index="02" title="Condiciones de compra" description="Información de recepción y facturación"><Conditions entries={[
      { label: "DESTINO", value: order.deliveryAddress || "Planta central" }, { label: "PAGO", value: order.paymentTerms || "A convenir" }, { label: "MEDIO DE PAGO", value: order.paymentMethod || "A convenir" },
      { label: "HORARIO DE RECEPCIÓN", value: settings.purchaseOrder.receptionSchedule }, { label: "INSTRUCCIONES DE FACTURACIÓN", value: billingInstructions }
    ]} /></CommercialSection>
    <Notes text={order.notes} />
    <div className="commercial-document__legal quote-document__keep">{settings.purchaseOrder.supplierTerms}</div>
    <Signatures left="Autorizó · compras / gerencia" right="Aceptó · proveedor y fecha" />
    <p className="commercial-document__notice quote-document__keep">{settings.purchaseOrder.customFooterText}</p>
  </CommercialDocument>;
}
