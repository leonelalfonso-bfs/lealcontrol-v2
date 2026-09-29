import type { CSSProperties } from "react";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import { currencyMeta, label, type CompanySettings, type Contact, type CustomerDetail, type Location, type Product, type Quote } from "../api/types";
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

function optionalAmount(line: { quantity: number; unitPrice: number; discountPercent: number; lineSubtotal: number }) {
  if (line.lineSubtotal > 0) return line.lineSubtotal;
  return Math.round(line.quantity * line.unitPrice * (1 - (line.discountPercent || 0) / 100) * 100) / 100;
}

export function QuoteDocument({ quote, company, customer, deliveryLocation, assignedContact, productsMap, includeTechnicalOffer }: Props) {
  const { settings } = useDocumentTemplate();
  const accent = settings.primaryColor || "#3a82f6";
  const sheetStyle = { "--document-accent": accent } as CSSProperties;
  const companyName = company?.tradeName?.trim() || company?.legalName || "Empresa";
  const letterName = company?.legalName?.trim() || companyName;
  const docTitle = (settings.quote.headerTitle || "Presupuesto").split("/")[0].trim() || "Presupuesto";
  const placeLine = [company?.fiscalStreet, company?.fiscalCity, company?.fiscalProvince].filter(Boolean).join(" - ");
  const phoneLine = [company?.phone, company?.whatsApp]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(" // ");
  const reachLine = [company?.email, phoneLine, company?.website].filter(Boolean).join(" | ");
  const customerCity = [customer?.fiscalAddress?.city, customer?.fiscalAddress?.province].filter(Boolean).join(", ");
  const deliveryAddress = deliveryLocation?.address?.street
    ? [deliveryLocation.address.street, deliveryLocation.address.city, deliveryLocation.address.province].filter(Boolean).join(" - ")
    : "";
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
  const amount = (value: number) => `${quote.currency.startsWith("USD") ? "USD" : curr.symbol} ${money(value)}`;
  const footerText = settings.quote.customFooterText.replace(
    /(presupuesto válido por )\d+( días corridos)/i,
    (_match, before: string, after: string) => `${before}${quote.validDays}${after}`
  );
  const masthead = (
    <header className="qs-head">
      <div className="qs-top">
        {company?.logoUrl ? (
          <img className="qs-logo" src={company.logoUrl} alt={companyName} crossOrigin="anonymous" />
        ) : (
          <div className="qs-mark">{companyName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>
        )}
        <div className="qs-brand-text">
          <strong>{letterName}</strong>
          {placeLine && <span>{placeLine}</span>}
          {company?.documentNumber && <span>CUIT: {formatCuit(company.documentNumber)}</span>}
          {reachLine && <span>{reachLine}</span>}
        </div>
        <div className="qs-doc">
          <span>{docTitle}</span>
          <b>N° {quote.quoteNumber}</b>
          <small>Fecha: {date}{quote.revision > 0 ? ` · Rev. ${quote.revision}` : ""}</small>
        </div>
        {/* El logo secundario (acreditación) todavía no está en los datos de la empresa. */}
        <div className="qs-seal" />
      </div>
    </header>
  );
  const clientCard = (
    <section className="qs-for">
      <div>
        <span>Cliente / destinatario (datos fiscales)</span>
        <strong>{customer?.legalName || "Cliente"}</strong>
        <p>CUIT: {formatCuit(customer?.documentNumber)}</p>
        <p>IVA: {label(customer?.taxCondition)}</p>
        {customer?.fiscalAddress?.street && <p>{customer.fiscalAddress.street}</p>}
        {customerCity && <p>{customerCity}</p>}
        {assignedContact && <p>Atención: {assignedContact.name}</p>}
      </div>
      <div className="qs-delivery">
        <span>Lugar de entrega / atención</span>
        <strong>{deliveryLocation?.name || "Dirección fiscal"}</strong>
        <p>{deliveryAddress || "Se entrega en el domicilio fiscal del cliente."}</p>
      </div>
    </section>
  );
  const sheetFooter = (
    <footer className="qs-foot">
      <span>Este presupuesto tiene una validez de {quote.validDays} días.</span>
      {footerText && <span className="qs-legal">{footerText}</span>}
    </footer>
  );
  const technicalArticles = technicalItems.map(({ line, index, product, detail }) => (
    <article key={line.id}>
      <h3>{index + 1}. {quoteItemTitle(line.description)}</h3>
      {product?.imagePath && <img src={product.imagePath} alt={line.description} crossOrigin="anonymous" />}
      {detail && <div className="quote-tech-html" dangerouslySetInnerHTML={{ __html: plainToRich(detail) }} />}
    </article>
  ));

  return (
    <article id="quote-pdf-sheet" className={`quote-document quote-sheet quote-document--${settings.templateStyle}`} style={sheetStyle}>
      {quote.status === "Cancelled" && <div className="quote-document__cancelled">ANULADO</div>}
      {masthead}
      {clientCard}

      {inlineTechnical && (
        <section className="qs-tech">
          <div className="qs-banner">Oferta técnica</div>
          {technicalArticles}
        </section>
      )}

      <div className="qs-banner">Oferta comercial</div>
      <table className="qs-items">
          <thead><tr>
            <th className="qs-col-item">Ítem</th>
            <th className="qs-col-desc">Descripción</th>
            <th>Cant.</th>
            <th>Precio u.</th>
            {settings.quote.showItemDiscounts && <th>Desc.</th>}
            {settings.quote.showTaxesBreakdown && <th>IVA</th>}
            <th>Total</th>
          </tr></thead>
          <tbody>
            {quote.lines.map((line, index) => (
              <tr key={line.id} className={line.isOptional ? "qs-opt" : undefined}>
                <td className="qs-col-item">{index + 1}</td>
                <td className="qs-col-desc">
                  <strong>{quoteItemTitle(line.description)}</strong>
                  {line.isOptional && <small>Opcional · no incluido en el total</small>}
                </td>
                <td>{line.quantity.toLocaleString("es-AR")}</td>
                <td>{money(line.unitPrice)}</td>
                {settings.quote.showItemDiscounts && <td>{line.discountPercent}%</td>}
                {settings.quote.showTaxesBreakdown && <td>{line.taxRate}%</td>}
                <td className={line.isOptional ? "qs-muted" : "quote-document__item-total"}>{money(line.isOptional ? optionalAmount(line) : line.lineSubtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

      <section className="qs-sum">
        <div><span>Subtotal {curr.label}</span><strong>{amount(subtotal)}</strong></div>
        {quote.discountPercent > 0 && <div><span>Descuento {quote.discountPercent}%</span><strong>− {amount(discount)}</strong></div>}
        <div><span>{taxLabel}</span><strong>{amount(tax)}</strong></div>
        <div className="qs-grand"><span>Total {curr.label}</span><strong>{amount(total)}</strong></div>
      </section>

      {exchangeRate > 0 && (
        <aside className="quote-document__exchange quote-document__keep">
          <strong>Tipo de cambio de referencia: $ {money(exchangeRate)} — {curr.label} (cotización vendedor).</strong>
          <span>Los importes en dólares se cotizan según la tasa de referencia indicada. El valor final en pesos se definirá al momento de la facturación o el cobro.</span>
        </aside>
      )}

      <section className="qs-terms">
        <div className="qs-terms-title">Condiciones comerciales</div>
        <div className="qs-terms-grid">
          <p><span>Plazo de entrega:</span> {quote.deliveryTimeText || (quote.deliveryTimeDays ? `${quote.deliveryTimeDays} días` : settings.quote.deliveryTerms)}</p>
          <p><span>Forma de pago:</span> {quote.paymentMethod || "A convenir"}</p>
          <p><span>Condiciones de pago:</span> {quote.paymentTerms || settings.quote.paymentTerms}</p>
          <p><span>Transporte:</span> {quote.transportation || "—"}</p>
          <p className="qs-wide"><span>Garantía:</span> {quote.warranty || settings.quote.warrantyTerms}</p>
        </div>
      </section>

      {quote.notes && <aside className="quote-document__notes quote-document__keep"><strong>Observaciones</strong><p>{quote.notes}</p></aside>}

      {settings.quote.showSignatures && (
        <div className="quote-document__signatures quote-document__keep"><div>Responsable / asesor técnico</div><div>Aceptación del cliente</div></div>
      )}
      {sheetFooter}

      {showTechnical && !inlineTechnical && (
        <section className="qs-appendix">
          {masthead}
          {clientCard}
          <div className="qs-banner">Oferta técnica</div>
          <div className="qs-tech">{technicalArticles}</div>
          {sheetFooter}
        </section>
      )}
    </article>
  );
}
