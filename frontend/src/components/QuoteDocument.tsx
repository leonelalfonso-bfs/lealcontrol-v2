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

function sentenceCase(value: string) {
  const text = value.trim().toLocaleLowerCase("es-AR");
  return text ? text.charAt(0).toLocaleUpperCase("es-AR") + text.slice(1) : "";
}

function optionalAmount(line: { quantity: number; unitPrice: number; discountPercent: number; lineSubtotal: number }) {
  if (line.lineSubtotal > 0) return line.lineSubtotal;
  return Math.round(line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100) * 100) / 100;
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
  const includedLines = quote.lines.filter((line) => !line.isOptional);
  const taxRates = [...new Set(includedLines.map((line) => line.taxRate))];
  const taxLabel = taxRates.length === 1 ? `IVA ${taxRates[0]}%` : "IVA";
  const date = new Date(quote.createdAtUtc).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const exchangeRate = quote.currency === "USD_BILLETE" ? quote.exchangeRateUsdBillete
    : quote.currency === "USD_DIVISA" ? quote.exchangeRateUsdDivisa : 0;
  const technicalItems = quote.lines.map((line, index) => {
    const product = (line.productId && productsMap[line.productId]) || productsMap[line.description.toUpperCase()];
    return { line, index, product, detail: (line.technicalDetail || product?.detailedDescription || "").trim() };
  }).filter((item) => Boolean(item.detail && !richTextIsEmpty(item.detail)) || Boolean(item.product?.imagePath));
  const showTechnical = includeTechnicalOffer && settings.quote.showTechnicalOffer && technicalItems.length > 0;
  const inlineTechnical = showTechnical && technicalItems.length <= 2 && technicalItems.every((item) => !item.product?.imagePath && item.detail.length <= 180);
  const contactLine = [companyAddress, company?.phone, company?.email].filter(Boolean).join("  ·  ");
  const footerText = settings.quote.customFooterText.replace(
    /(presupuesto válido por )\d+( días corridos)/i,
    (_match, before: string, after: string) => `${before}${quote.validDays}${after}`
  );

  return (
    <article id="quote-pdf-sheet" className={`quote-document quote-sheet quote-document--${settings.templateStyle}`} style={sheetStyle}>
      {quote.status === "Cancelled" && <div className="quote-document__cancelled">ANULADO</div>}
      <header className="qs-head">
        <div className="qs-top">
          <div className="qs-brand">
            {company?.logoUrl ? (
              <img className="qs-logo" src={company.logoUrl} alt={companyName} crossOrigin="anonymous" />
            ) : (
              <div className="qs-mark">{companyName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
            )}
            <div className="qs-brand-text">
              <strong>{company?.logoUrl && company.legalName && company.legalName !== companyName ? company.legalName : companyName}</strong>
              {!company?.logoUrl && company?.legalName && company.legalName !== companyName && <em>{company.legalName}</em>}
            </div>
          </div>
          <div className="qs-doc">
            <span>{settings.quote.headerTitle || "Presupuesto"}</span>
            <b>{quote.quoteNumber}</b>
            <small>Revisión {quote.revision} · {date}</small>
          </div>
        </div>
        {(contactLine || company?.documentNumber) && (
          <p className="qs-meta">
            {contactLine}
            {contactLine && company?.documentNumber ? <br /> : null}
            {company?.documentNumber ? <>CUIT {formatCuit(company.documentNumber)} · {label(company.taxCondition)}</> : null}
          </p>
        )}
      </header>

      <section className="qs-for">
        <div>
          <span>Para</span>
          <strong>{customer?.legalName || "Cliente"}</strong>
          <p>CUIT {formatCuit(customer?.documentNumber)} · {label(customer?.taxCondition)}</p>
          {customerAddress && <p>{customerAddress}</p>}
          {assignedContact && <p>Atención: {assignedContact.name}</p>}
        </div>
        <dl>
          <div><dt>Vigencia</dt><dd>{quote.validDays} días</dd></div>
          <div><dt>Moneda</dt><dd>{curr.label}</dd></div>
        </dl>
      </section>

      <table className="qs-items">
          <thead><tr>
            <th>Descripción</th><th>Cant.</th><th>Precio</th>
            {settings.quote.showItemDiscounts && <th>DESC.</th>}
            {settings.quote.showTaxesBreakdown && <th>IVA</th>}
            <th>Importe</th>
          </tr></thead>
          <tbody>
            {quote.lines.map((line, index) => (
              <tr key={line.id} className={line.isOptional ? "qs-opt" : undefined}>
                <td>
                  <div className="qs-line">
                    <span className="qs-n">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{quoteItemTitle(line.description)}</strong>
                      {line.isOptional && <small>Opcional · no incluido en el total</small>}
                      {inlineTechnical && technicalItems.find((item) => item.line.id === line.id)?.detail && (
                        <div className="quote-document__inline-tech" dangerouslySetInnerHTML={{ __html: plainToRich(technicalItems.find((item) => item.line.id === line.id)!.detail) }} />
                      )}
                    </div>
                  </div>
                </td>
                <td>{line.quantity.toLocaleString("es-AR")}</td>
                <td>{money(line.unitPrice)}</td>
                {settings.quote.showItemDiscounts && <td>{line.discountPercent ? `${line.discountPercent}%` : "—"}</td>}
                {settings.quote.showTaxesBreakdown && <td>{line.taxRate}%</td>}
                <td className={line.isOptional ? "qs-muted" : "quote-document__item-total"}>{money(line.isOptional ? optionalAmount(line) : line.lineSubtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

      <section className="qs-sum">
        <p>{sentenceCase(numberToWords(total, quote.currency))}.</p>
        <div className="qs-totals">
          <div><span>Subtotal</span><strong>{curr.symbol} {money(subtotal)}</strong></div>
          {quote.discountPercent > 0 && <div><span>Descuento {quote.discountPercent}%</span><strong>− {curr.symbol} {money(discount)}</strong></div>}
          <div><span>{taxLabel}</span><strong>{curr.symbol} {money(tax)}</strong></div>
          <div className="qs-grand"><span>Total</span><strong>{curr.symbol} {money(total)}</strong></div>
        </div>
      </section>

      {exchangeRate > 0 && (
        <aside className="quote-document__exchange quote-document__keep">
          <strong>Referencia cambiaria · {curr.label}</strong>
          <span>ARS {money(exchangeRate)} por USD. La conversión final en pesos se define al momento de la facturación o cobro.</span>
        </aside>
      )}

      <section className="qs-terms">
        <div><span>Entrega</span><strong>{quote.deliveryTimeText || (quote.deliveryTimeDays ? `${quote.deliveryTimeDays} días hábiles` : settings.quote.deliveryTerms)}</strong></div>
        <div><span>Pago</span><strong>{quote.paymentTerms || settings.quote.paymentTerms}</strong></div>
        <div><span>Medio</span><strong>{quote.paymentMethod || "A convenir"}</strong></div>
        <div><span>Garantía</span><strong>{quote.warranty || settings.quote.warrantyTerms}</strong></div>
        <div><span>Destino</span><strong>{deliveryLocation?.name || "Domicilio fiscal"}{deliveryAddress ? ` · ${deliveryAddress}` : ""}</strong></div>
        <div><span>Transporte</span><strong>{quote.transportation || "A coordinar"}</strong></div>
      </section>

      {quote.notes && <aside className="quote-document__notes quote-document__keep"><strong>Observaciones</strong><p>{quote.notes}</p></aside>}

      {settings.quote.showSignatures && (
        <div className="quote-document__signatures quote-document__keep"><div>Responsable / asesor técnico</div><div>Aceptación del cliente</div></div>
      )}
      <footer className="qs-foot">
        <span>{companyName}{company?.website ? ` · ${company.website}` : company?.email ? ` · ${company.email}` : ""}</span>
        <span>{footerText}</span>
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
