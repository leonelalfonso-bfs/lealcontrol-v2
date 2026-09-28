import type { CSSProperties, ReactNode } from "react";
import { label, type CompanySettings } from "../api/types";
import { useDocumentTemplate } from "../context/DocumentTemplateContext";
import "./quoteDocument.css";

export const documentMoney = (value: number) => value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const documentDate = (value: string) => {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  return new Date(value).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
};
export const documentCuit = (raw?: string | null) => {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length === 11 ? `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` : raw || "—";
};

export function CommercialDocument({ id, company, title, eyebrow, number, badge, meta, children }: {
  id: string;
  company: CompanySettings | null;
  title: string;
  eyebrow?: string;
  number: string;
  badge?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const { settings } = useDocumentTemplate();
  const companyName = company?.tradeName?.trim() || company?.legalName || "Empresa";
  const companyAddress = [company?.fiscalStreet, company?.fiscalCity, company?.fiscalProvince].filter(Boolean).join(" · ");
  const style = { "--document-accent": settings.global.primaryColor || "#3975e5" } as CSSProperties;
  return (
    <article id={id} className={`quote-document quote-document--${settings.global.templateStyle} commercial-document`} style={style}>
      <div className="quote-document__rule" />
      <header className="quote-document__masthead quote-document__keep">
        <div className="quote-document__brand">
          {company?.logoUrl ? <img className="quote-document__logo" src={company.logoUrl} alt={companyName} crossOrigin="anonymous" /> :
            <div className="quote-document__monogram">{companyName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>}
          <div className="quote-document__brand-copy">
            <strong>{companyName}</strong>
            {company?.legalName && company.legalName !== companyName && <span>{company.legalName}</span>}
            <span>{[companyAddress, company?.phone, company?.email].filter(Boolean).join(" · ")}</span>
            <span>CUIT {documentCuit(company?.documentNumber)} · {company?.taxCondition ? label(company.taxCondition) : ""}</span>
          </div>
        </div>
        <div className="quote-document__identity">
          {eyebrow && <span className="quote-document__eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
          <div className="quote-document__number">N° {number} {badge && <span>{badge}</span>}</div>
        </div>
      </header>
      {meta}
      {children}
      <footer className="quote-document__footer quote-document__keep">
        <div><strong>{companyName}</strong><span>{company?.website || company?.email || ""}</span></div>
        <span>{title} {number}</span>
      </footer>
    </article>
  );
}

export function CommercialSection({ index, title, description, children }: { index: string; title: string; description?: string; children: ReactNode }) {
  return <section className="quote-document__section">
    <div className="quote-document__section-heading quote-document__keep"><span className="quote-document__section-index">{index}</span><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>
    {children}
  </section>;
}
