import type { CSSProperties } from "react";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { currencyMeta, label, type CompanySettings, type Contact, type CustomerDetail, type Location, type Product, type Quote } from "../api/types";
import { numberToWords } from "../utils/numberToWords";
import { plainToRich, richTextIsEmpty } from "../utils/richText";
import "./quoteDocument.css";

type Props = {
  quote: Quote;
  company: CompanySettings | null;
  customer: CustomerDetail | null;
  deliveryLocation: Location | null;
  assignedContact: Contact | null;
  productsMap: Record<string, Product>;
  includeTechnicalOffer: boolean;
};

const money = (value: number) => value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function quoteItemTitle(description: string) {
  return description.replace(/^\s*\[[^\]]+\]\s*/, "").trim() || description;
}

function formatCuit(raw?: string | null) {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length === 11 ? `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` : raw || "—";
}

export function QuoteDocument({ quote, company, customer, deliveryLocation, assignedContact, productsMap, includeTechnicalOffer }: Props) {
  const { settings } = useDocumentTemplate();
  const accent = settings.primaryColor || "#3975e5";
  const sheetStyle = { "--document-accent": accent } as CSSProperties;
  const companyName = company?.tradeName?.trim() || company?.legalName || "Empresa";
  const companyAddress = [company?.fiscalStreet, company?.fiscalCity, company?.fiscalProvince].filter(Boolean).join(" · ");
  const customerAddress = [
    customer?.fiscalAddress?.street,
    customer?.fiscalAddress?.city,
    customer?.fiscalAddress?.province
  ].filter(Boolean).join(" · ");
  const deliveryAddress = deliveryLocation?.address?.street
    ? [deliveryLocation.address.street, deliveryLocation.address.city, deliveryLocation.address.province].filter(Boolean).join(" · ")
    : customerAddress;
  const curr = currencyMeta[quote.currency] ?? { label: quote.currency, detail: "", symbol: "$" };
  const subtotal = quote.subtotal;
  const discount = Math.round(subtotal * quote.discountPercent) / 100;
  const net = subtotal - discount;
  const tax = Math.max(0, Math.round((quote.total - net) * 100) / 100);
  const total = quote.total;
  const date = new Date(quote.createdAtUtc).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const exchangeRate = quote.currency === "USD_BILLETE" ? quote.exchangeRateUsdBillete
    : quote.currency === "USD_DIVISA" ? quote.exchangeRateUsdDivisa : 0;
  const technicalItems = quote.lines.map((line, index) => {
    const product = (line.productId && productsMap[line.productId]) || productsMap[line.description.toUpperCase()];
    return { line, index, product, detail: (line.technicalDetail || product?.detailedDescription || "").trim() };
  }).filter((item) => Boolean(item.detail && !richTextIsEmpty(item.detail)) || Boolean(item.product?.imagePath));
  const showTechnical = includeTechnicalOffer && settings.quote.showTechnicalOffer && technicalItems.length > 0;
  const inlineTechnical = showTechnical && technicalItems.length <= 2 && technicalItems.every((item) => !item.product?.imagePath && item.detail.length <= 180);
  const footerText = settings.quote.customFooterText.replace(
    /(presupuesto válido por )\d+( días corridos)/i,
    (_match, before: string, after: string) => `${before}${quote.validDays}${after}`
  );

  return (
    <article id="quote-pdf-sheet" className={`quote-document quote-document--${settings.templateStyle}`} style={sheetStyle}>
      {quote.status === "Cancelled" && <div className="quote-document__cancelled">ANULADO</div>}
      <header className="quote-document__masthead">
        <div className="quote-document__brand">
          {company?.logoUrl ? (
            <img className="quote-document__logo" src={company.logoUrl} alt={companyName} crossOrigin="anonymous" />
          ) : (
            <div className="quote-document__monogram">{companyName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
          )}
          <div className="quote-document__brand-copy">
            <strong>{companyName}</strong>
            {company?.legalName && company.legalName !== companyName && <span>{company.legalName}</span>}
            <span>{[companyAddress, company?.phone, company?.email].filter(Boolean).join("  ·  ")}</span>
            <span>CUIT {formatCuit(company?.documentNumber)} · {label(company?.taxCondition)}</span>
          </div>
        </div>
        <div className="quote-document__identity">
          <span className="quote-document__eyebrow">{settings.quote.headerTitle || "PROPUESTA COMERCIAL"}</span>
          <h1>Presupuesto</h1>
          <div className="quote-document__number">N° {quote.quoteNumber} <span>R{quote.revision}</span></div>
        </div>
      </header>

      <section className="quote-document__recipient quote-document__keep">
        <div>
          <span className="quote-document__field-label">PREPARADO PARA</span>
          <h2>{customer?.legalName || "Cliente"}</h2>
          <p>CUIT {formatCuit(customer?.documentNumber)} · {label(customer?.taxCondition)}</p>
          {customerAddress && <p>{customerAddress}</p>}
          {assignedContact && <p><strong>Atención:</strong> {assignedContact.name}</p>}
        </div>
        <div className="quote-document__recipient-meta">
          <div><span>EMISIÓN</span><strong>{date}</strong></div>
          <div><span>VIGENCIA</span><strong>{quote.validDays} días corridos</strong></div>
          <div><span>MONEDA</span><strong>{curr.label}</strong></div>
        </div>
      </section>

      <section className="quote-document__section">
        <div className="quote-document__section-heading quote-document__keep">
          <span className="quote-document__section-index">01</span>
          <div><h2>Propuesta económica</h2><p>Detalle de equipos y servicios cotizados</p></div>
        </div>
        <table className="quote-document__items">
          <thead><tr>
            <th>ÍTEM / DESCRIPCIÓN</th><th>CANT.</th><th>PRECIO UNIT.</th>
            {settings.quote.showItemDiscounts && <th>DESC.</th>}
            {settings.quote.showTaxesBreakdown && <th>IVA</th>}
            <th>IMPORTE</th>
          </tr></thead>
          <tbody>
            {quote.lines.map((line, index) => (
              <tr key={line.id}>
                <td>
                  <span className="quote-document__item-index">{String(index + 1).padStart(2, "0")}</span><strong>{quoteItemTitle(line.description)}</strong>
                  {line.isOptional && <small>OPCIONAL · no incluido en el total</small>}
                  {inlineTechnical && technicalItems.find((item) => item.line.id === line.id)?.detail && (
                    <div className="quote-document__inline-tech" dangerouslySetInnerHTML={{ __html: plainToRich(technicalItems.find((item) => item.line.id === line.id)!.detail) }} />
                  )}
                </td>
                <td>{line.quantity.toLocaleString("es-AR")}</td>
                <td>{money(line.unitPrice)}</td>
                {settings.quote.showItemDiscounts && <td>{line.discountPercent ? `${line.discountPercent}%` : "—"}</td>}
                {settings.quote.showTaxesBreakdown && <td>{line.taxRate}%</td>}
                <td className="quote-document__item-total">{line.isOptional ? "—" : money(line.lineSubtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="quote-document__closing quote-document__keep">
        <div className="quote-document__closing-note">
          <span className="quote-document__field-label">IMPORTE TOTAL</span>
          <p>{numberToWords(total, quote.currency)}</p>
          <small>Importes expresados en {curr.label.toLowerCase()}. Los ítems opcionales se cotizan por separado.</small>
        </div>
        <div className="quote-document__totals">
          <div><span>Subtotal neto</span><strong>{curr.symbol} {money(subtotal)}</strong></div>
          {quote.discountPercent > 0 && <div><span>Descuento {quote.discountPercent}%</span><strong>− {curr.symbol} {money(discount)}</strong></div>}
          <div><span>IVA</span><strong>{curr.symbol} {money(tax)}</strong></div>
          <div className="quote-document__grand-total"><span>Total</span><strong>{curr.symbol} {money(total)}</strong></div>
        </div>
      </section>

      {exchangeRate > 0 && (
        <aside className="quote-document__exchange quote-document__keep">
          <strong>Referencia cambiaria · {curr.label}</strong>
          <span>ARS {money(exchangeRate)} por USD. La conversión final en pesos se define al momento de la facturación o cobro.</span>
        </aside>
      )}

      <section className="quote-document__section quote-document__conditions">
        <div className="quote-document__section-heading"><span className="quote-document__section-index">02</span><div><h2>Condiciones de la propuesta</h2><p>Información para coordinar la compra y la entrega</p></div></div>
        <div className="quote-document__condition-grid">
          <div><span>PLAZO DE ENTREGA</span><strong>{quote.deliveryTimeText || (quote.deliveryTimeDays ? `${quote.deliveryTimeDays} días hábiles` : settings.quote.deliveryTerms)}</strong></div>
          <div><span>CONDICIONES DE PAGO</span><strong>{quote.paymentTerms || settings.quote.paymentTerms}</strong></div>
          <div><span>MEDIO DE PAGO</span><strong>{quote.paymentMethod || "A convenir"}</strong></div>
          <div><span>GARANTÍA</span><strong>{quote.warranty || settings.quote.warrantyTerms}</strong></div>
          <div><span>ENTREGA / DESTINO</span><strong>{deliveryLocation?.name || "Domicilio fiscal"}{deliveryAddress ? ` · ${deliveryAddress}` : ""}</strong></div>
          <div><span>TRANSPORTE</span><strong>{quote.transportation || "A coordinar"}</strong></div>
        </div>
      </section>

      {quote.notes && <aside className="quote-document__notes quote-document__keep"><strong>Observaciones</strong><p>{quote.notes}</p></aside>}

      {settings.quote.showSignatures && (
        <div className="quote-document__signatures quote-document__keep"><div>Responsable / asesor técnico</div><div>Aceptación del cliente</div></div>
      )}
      <footer className="quote-document__footer quote-document__keep">
        <div><strong>{companyName}</strong><span>{company?.website || company?.email || ""}</span></div>
        <p>{footerText}</p>
        <span>Presupuesto {quote.quoteNumber} · R{quote.revision}</span>
      </footer>

      {showTechnical && !inlineTechnical && (
        <section className="quote-document__section quote-document__technical quote-document__appendix">
          <div className="quote-document__appendix-masthead quote-document__keep">
            <span>ANEXO TÉCNICO · PRESUPUESTO {quote.quoteNumber} / R{quote.revision}</span>
            <strong>{companyName}</strong>
          </div>
          <div className="quote-document__section-heading quote-document__keep"><span className="quote-document__section-index">03</span><div><h2>Detalle técnico</h2><p>Especificaciones de los ítems cotizados para {customer?.legalName || "el cliente"}</p></div></div>
          {technicalItems.map(({ line, index, product, detail }) => (
            <div className="quote-document__technical-item" key={line.id}>
              <h3><span>{String(index + 1).padStart(2, "0")}</span>{quoteItemTitle(line.description)}</h3>
              {product?.imagePath && <img src={product.imagePath} alt={line.description} crossOrigin="anonymous" />}
              {detail && <div className="quote-tech-html" dangerouslySetInnerHTML={{ __html: plainToRich(detail) }} />}
            </div>
          ))}
          <div className="quote-document__appendix-footer">{companyName} · Presupuesto {quote.quoteNumber} · Anexo técnico</div>
        </section>
      )}
    </article>
  );
}
