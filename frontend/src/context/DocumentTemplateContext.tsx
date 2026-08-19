import React, { createContext, useContext, useState } from "react";

export type TemplateStyle = "modern" | "classic" | "compact";

export interface GlobalTemplateSettings {
  templateStyle: TemplateStyle;
  primaryColor: string;
  fontFamily: "inter" | "roboto" | "system";
  showWatermarkDraft: boolean;
}

export interface QuoteTemplateSettings {
  headerTitle: string;
  defaultValidDays: number;
  showTechnicalOffer: boolean;
  showItemDiscounts: boolean;
  showTaxesBreakdown: boolean;
  showSignatures: boolean;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
  customFooterText: string;
}

export interface RemitoTemplateSettings {
  headerTitle: string;
  showRecipientAddress: boolean;
  showCarrierInfo: boolean;
  showDeclaredValue: boolean;
  showSignaturesBox: boolean;
  carrierLegalText: string;
  receptionClause: string;
  customFooterText: string;
}

export interface InvoiceTemplateSettings {
  headerTitle: string;
  showBankingInfo: boolean;
  bankDetails: {
    bankName: string;
    accountType: string;
    cbu: string;
    alias: string;
    accountHolder: string;
    cuit: string;
  };
  paymentInstructions: string;
  showAfipQr: boolean;
  showCaeBox: boolean;
  interestLegalText: string;
  customFooterText: string;
}

export interface PurchaseOrderTemplateSettings {
  headerTitle: string;
  receptionSchedule: string;
  billingInstructions: string;
  supplierTerms: string;
  customFooterText: string;
}

export interface DocumentTemplatesConfig {
  global: GlobalTemplateSettings;
  quote: QuoteTemplateSettings;
  remito: RemitoTemplateSettings;
  invoice: InvoiceTemplateSettings;
  purchaseOrder: PurchaseOrderTemplateSettings;

  // Backwards compatibility helper properties:
  templateStyle: TemplateStyle;
  primaryColor: string;
  showBankingInfo: boolean;
  showSignatures: boolean;
  customFooterText: string;
  bankDetails: {
    bankName: string;
    accountType: string;
    cbu: string;
    alias: string;
  };
}

export const DEFAULT_DOCUMENT_TEMPLATES: DocumentTemplatesConfig = {
  global: {
    templateStyle: "modern",
    primaryColor: "#0d9488",
    fontFamily: "inter",
    showWatermarkDraft: true
  },
  quote: {
    headerTitle: "PRESUPUESTO / COTIZACIÓN",
    defaultValidDays: 15,
    showTechnicalOffer: true,
    showItemDiscounts: true,
    showTaxesBreakdown: true,
    showSignatures: true,
    paymentTerms: "Contado contra entrega / eCheq a 30 días",
    deliveryTerms: "Inmediata / 7 a 10 días hábiles de confirmada la orden",
    warrantyTerms: "12 meses para repuestos y equipos nuevos contra defectos de fabricación",
    customFooterText: "Presupuesto válido por 15 días corridos. Precios sujetos a modificación sin previo aviso. Los valores no incluyen flete salvo expresa mención."
  },
  remito: {
    headerTitle: "REMITO OFICIAL DE ENTREGA",
    showRecipientAddress: true,
    showCarrierInfo: true,
    showDeclaredValue: false,
    showSignaturesBox: true,
    carrierLegalText: "La mercadería viaja por cuenta y orden del comprador. El transporte asume la responsabilidad de la custodia y traslado en las mismas condiciones en que fue despachada.",
    receptionClause: "Recibí conforme la cantidad de bultos y mercaderías detalladas en el presente remito, en perfecto estado de conservación y embalaje.",
    customFooterText: "Documento no válido como factura. Traslado amparado según normativa de transporte vigente."
  },
  invoice: {
    headerTitle: "FACTURA ELECTRÓNICA",
    showBankingInfo: true,
    bankDetails: {
      bankName: "Banco Galicia",
      accountType: "Cuenta Corriente Especial en Pesos",
      cbu: "0070123420000012345678",
      alias: "LEAL.CONTROL.ERP",
      accountHolder: "LEAL CONTROL S.A.",
      cuit: "30-71548962-9"
    },
    paymentInstructions: "Por favor enviar el comprobante de transferencia indicando N° de Factura y Razón Social a: cobranzas@lealcontrol.com",
    showAfipQr: true,
    showCaeBox: true,
    interestLegalText: "El vencimiento de este comprobante opera de pleno derecho en la fecha indicada. La mora devengará intereses punitorios según tasa activa BNA.",
    customFooterText: "Comprobante emitido según normativa de Facturación Electrónica ARCA / AFIP."
  },
  purchaseOrder: {
    headerTitle: "ORDEN DE COMPRA A PROVEEDOR",
    receptionSchedule: "Lunes a Viernes de 07:00 a 16:00 hs en Planta Central.",
    billingInstructions: "Facturar a nombre de LEAL CONTROL S.A. (CUIT 30-71548962-9) y enviar factura en formato PDF y XML a compras@lealcontrol.com indicando el número de esta Orden.",
    supplierTerms: "La aceptación de esta orden de compra implica la conformidad total con los precios, plazos y condiciones de entrega estipuladas.",
    customFooterText: "Orden de compra oficial emitida por el Departamento de Compras y Abastecimiento."
  },

  // Backwards compatibility
  get templateStyle() {
    return this.global.templateStyle;
  },
  get primaryColor() {
    return this.global.primaryColor;
  },
  get showBankingInfo() {
    return this.invoice.showBankingInfo;
  },
  get showSignatures() {
    return this.quote.showSignatures;
  },
  get customFooterText() {
    return this.quote.customFooterText;
  },
  get bankDetails() {
    return {
      bankName: this.invoice.bankDetails.bankName,
      accountType: this.invoice.bankDetails.accountType,
      cbu: this.invoice.bankDetails.cbu,
      alias: this.invoice.bankDetails.alias
    };
  }
};

interface DocumentTemplateContextValue {
  settings: DocumentTemplatesConfig;
  updateGlobal: (partial: Partial<GlobalTemplateSettings>) => void;
  updateQuote: (partial: Partial<QuoteTemplateSettings>) => void;
  updateRemito: (partial: Partial<RemitoTemplateSettings>) => void;
  updateInvoice: (partial: Partial<InvoiceTemplateSettings>) => void;
  updatePurchaseOrder: (partial: Partial<PurchaseOrderTemplateSettings>) => void;
  updateSettings: (partial: Partial<DocumentTemplatesConfig> | any) => void;
  resetSettings: () => void;
}

const DocumentTemplateContext = createContext<DocumentTemplateContextValue | undefined>(undefined);

export const DocumentTemplateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<DocumentTemplatesConfig>(() => {
    try {
      const saved = localStorage.getItem("leal_doc_template_settings_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_DOCUMENT_TEMPLATES,
          ...parsed,
          global: { ...DEFAULT_DOCUMENT_TEMPLATES.global, ...(parsed.global || {}) },
          quote: { ...DEFAULT_DOCUMENT_TEMPLATES.quote, ...(parsed.quote || {}) },
          remito: { ...DEFAULT_DOCUMENT_TEMPLATES.remito, ...(parsed.remito || {}) },
          invoice: { ...DEFAULT_DOCUMENT_TEMPLATES.invoice, ...(parsed.invoice || {}) },
          purchaseOrder: { ...DEFAULT_DOCUMENT_TEMPLATES.purchaseOrder, ...(parsed.purchaseOrder || {}) }
        };
      }
    } catch {
      // fallback
    }
    return DEFAULT_DOCUMENT_TEMPLATES;
  });

  const persist = (updated: DocumentTemplatesConfig) => {
    setSettings(updated);
    try {
      localStorage.setItem("leal_doc_template_settings_v2", JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const updateGlobal = (partial: Partial<GlobalTemplateSettings>) => {
    persist({
      ...settings,
      global: { ...settings.global, ...partial }
    });
  };

  const updateQuote = (partial: Partial<QuoteTemplateSettings>) => {
    persist({
      ...settings,
      quote: { ...settings.quote, ...partial }
    });
  };

  const updateRemito = (partial: Partial<RemitoTemplateSettings>) => {
    persist({
      ...settings,
      remito: { ...settings.remito, ...partial }
    });
  };

  const updateInvoice = (partial: Partial<InvoiceTemplateSettings>) => {
    persist({
      ...settings,
      invoice: { ...settings.invoice, ...partial }
    });
  };

  const updatePurchaseOrder = (partial: Partial<PurchaseOrderTemplateSettings>) => {
    persist({
      ...settings,
      purchaseOrder: { ...settings.purchaseOrder, ...partial }
    });
  };

  const updateSettings = (partial: any) => {
    if (partial.templateStyle || partial.primaryColor) {
      updateGlobal({
        templateStyle: partial.templateStyle || settings.global.templateStyle,
        primaryColor: partial.primaryColor || settings.global.primaryColor
      });
    } else {
      persist({ ...settings, ...partial });
    }
  };

  const resetSettings = () => {
    persist(DEFAULT_DOCUMENT_TEMPLATES);
  };

  return (
    <DocumentTemplateContext.Provider
      value={{
        settings,
        updateGlobal,
        updateQuote,
        updateRemito,
        updateInvoice,
        updatePurchaseOrder,
        updateSettings,
        resetSettings
      }}
    >
      {children}
    </DocumentTemplateContext.Provider>
  );
};

export const useDocumentTemplate = () => {
  const ctx = useContext(DocumentTemplateContext);
  if (!ctx) {
    throw new Error("useDocumentTemplate must be used within DocumentTemplateProvider");
  }
  return ctx;
};
