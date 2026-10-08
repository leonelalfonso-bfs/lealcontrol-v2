import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../api/client";

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
    // Datos bancarios propios de cada empresa: sin valores de ejemplo.
    bankDetails: {
      bankName: "",
      accountType: "",
      cbu: "",
      alias: "",
      accountHolder: "",
      cuit: ""
    },
    paymentInstructions: "",
    showAfipQr: true,
    showCaeBox: true,
    interestLegalText: "El vencimiento de este comprobante opera de pleno derecho en la fecha indicada. La mora devengará intereses punitorios según tasa activa BNA.",
    customFooterText: "Comprobante emitido según normativa de Facturación Electrónica ARCA / AFIP."
  },
  purchaseOrder: {
    headerTitle: "ORDEN DE COMPRA A PROVEEDOR",
    receptionSchedule: "Lunes a Viernes de 07:00 a 16:00 hs en Planta Central.",
    billingInstructions: "Facturar a nombre de la empresa indicada en el encabezado e indicar el número de esta orden en la factura.",
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
  /** Guarda en el servidor los cambios hechos con update*. */
  save: () => Promise<void>;
  /** Hay cambios sin guardar en el servidor. */
  dirty: boolean;
}

const DocumentTemplateContext = createContext<DocumentTemplateContextValue | undefined>(undefined);

// Antes las plantillas vivían solo en el navegador. Ahora se guardan por empresa en el
// servidor; el navegador guarda una copia para mostrar rápido y para migrar lo viejo.
const LEGACY_STORAGE_KEY = "leal_doc_template_settings_v2";
const storageKey = (tenantId: string | undefined) =>
  tenantId ? `${LEGACY_STORAGE_KEY}:${tenantId}` : LEGACY_STORAGE_KEY;

// La clave vieja era compartida por todas las empresas del navegador: se hereda
// el diseño, pero nunca los datos bancarios ni las instrucciones de pago.
function readLegacy(): any | null {
  try {
    const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed?.invoice) {
      const { paymentInstructions: _instructions, ...invoice } = parsed.invoice;
      parsed.invoice = invoice;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readLocal(tenantId: string | undefined): any | null {
  try {
    const saved = tenantId ? localStorage.getItem(storageKey(tenantId)) : null;
    return saved ? JSON.parse(saved) : readLegacy();
  } catch {
    return null;
  }
}

function writeLocal(tenantId: string | undefined, value: DocumentTemplatesConfig) {
  if (!tenantId) return;
  try {
    localStorage.setItem(storageKey(tenantId), JSON.stringify(toStored(value)));
  } catch {
    // sin almacenamiento local: el servidor sigue siendo la fuente
  }
}

/** Solo las secciones: sin los getters de compatibilidad ni los datos bancarios (van en Configuración). */
function toStored(value: DocumentTemplatesConfig) {
  const { bankDetails: _bank, ...invoice } = value.invoice;
  return {
    global: value.global,
    quote: value.quote,
    remito: value.remito,
    invoice,
    purchaseOrder: value.purchaseOrder
  };
}

function merge(parsed: any | null): DocumentTemplatesConfig {
  if (!parsed || typeof parsed !== "object") return DEFAULT_DOCUMENT_TEMPLATES;
  return {
    ...DEFAULT_DOCUMENT_TEMPLATES,
    global: { ...DEFAULT_DOCUMENT_TEMPLATES.global, ...(parsed.global || {}) },
    quote: { ...DEFAULT_DOCUMENT_TEMPLATES.quote, ...(parsed.quote || {}) },
    remito: { ...DEFAULT_DOCUMENT_TEMPLATES.remito, ...(parsed.remito || {}) },
    invoice: {
      ...DEFAULT_DOCUMENT_TEMPLATES.invoice,
      ...(parsed.invoice || {}),
      bankDetails: DEFAULT_DOCUMENT_TEMPLATES.invoice.bankDetails
    },
    purchaseOrder: withoutDemoBilling({ ...DEFAULT_DOCUMENT_TEMPLATES.purchaseOrder, ...(parsed.purchaseOrder || {}) })
  };
}

// Texto de ejemplo que traían las plantillas viejas, con razón social y CUIT de LealControl.
const DEMO_BILLING_PREFIX = "Facturar a nombre de LEAL CONTROL S.A.";
function withoutDemoBilling(po: PurchaseOrderTemplateSettings): PurchaseOrderTemplateSettings {
  return po.billingInstructions?.startsWith(DEMO_BILLING_PREFIX)
    ? { ...po, billingInstructions: DEFAULT_DOCUMENT_TEMPLATES.purchaseOrder.billingInstructions }
    : po;
}

export const DocumentTemplateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tenant, user } = useAuth();
  const tenantId = tenant?.id;
  const [settings, setSettings] = useState<DocumentTemplatesConfig>(() => merge(readLocal(tenantId)));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const local = readLocal(tenantId);
    setSettings(merge(local));
    setDirty(false);
    if (!tenantId || !user) return;
    api.getDocumentTemplates()
      .then(async (server) => {
        if (cancelled) return;
        if (server) {
          const merged = merge(server);
          setSettings(merged);
          writeLocal(tenantId, merged);
          return;
        }
        // Nunca se guardaron en el servidor: se sube lo que tenía este navegador (si es admin).
        if (local) {
          await api.saveDocumentTemplates(toStored(merge(local))).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [tenantId, user]);

  const edit = (updated: DocumentTemplatesConfig) => {
    setSettings(updated);
    setDirty(true);
  };

  const save = async () => {
    const saved = await api.saveDocumentTemplates(toStored(settings));
    const merged = merge(saved);
    setSettings(merged);
    writeLocal(tenantId, merged);
    setDirty(false);
  };

  const updateGlobal = (partial: Partial<GlobalTemplateSettings>) =>
    edit({ ...settings, global: { ...settings.global, ...partial } });

  const updateQuote = (partial: Partial<QuoteTemplateSettings>) =>
    edit({ ...settings, quote: { ...settings.quote, ...partial } });

  const updateRemito = (partial: Partial<RemitoTemplateSettings>) =>
    edit({ ...settings, remito: { ...settings.remito, ...partial } });

  const updateInvoice = (partial: Partial<InvoiceTemplateSettings>) =>
    edit({ ...settings, invoice: { ...settings.invoice, ...partial } });

  const updatePurchaseOrder = (partial: Partial<PurchaseOrderTemplateSettings>) =>
    edit({ ...settings, purchaseOrder: { ...settings.purchaseOrder, ...partial } });

  const updateSettings = (partial: any) => {
    if (partial.templateStyle || partial.primaryColor) {
      updateGlobal({
        templateStyle: partial.templateStyle || settings.global.templateStyle,
        primaryColor: partial.primaryColor || settings.global.primaryColor
      });
    } else {
      edit({ ...settings, ...partial });
    }
  };

  const resetSettings = () => edit(DEFAULT_DOCUMENT_TEMPLATES);

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
        resetSettings,
        save,
        dirty
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
