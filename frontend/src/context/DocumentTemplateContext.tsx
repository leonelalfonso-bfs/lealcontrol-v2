import React, { createContext, useContext, useEffect, useState } from "react";

export type TemplateStyle = "modern" | "classic" | "compact";

export interface DocumentTemplateSettings {
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

const DEFAULT_SETTINGS: DocumentTemplateSettings = {
  templateStyle: "modern",
  primaryColor: "#0d9488",
  showBankingInfo: true,
  showSignatures: true,
  customFooterText: "Presupuesto válido por 15 días corridos. Precios sujetos a modificación sin previo aviso. Los valores no incluyen flete salvo expresa mención.",
  bankDetails: {
    bankName: "Banco Galicia",
    accountType: "Cuenta Corriente Especial en Pesos",
    cbu: "0070123420000012345678",
    alias: "LEAL.CONTROL.ERP"
  }
};

interface DocumentTemplateContextValue {
  settings: DocumentTemplateSettings;
  updateSettings: (partial: Partial<DocumentTemplateSettings>) => void;
  resetSettings: () => void;
}

const DocumentTemplateContext = createContext<DocumentTemplateContextValue | undefined>(undefined);

export const DocumentTemplateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<DocumentTemplateSettings>(() => {
    try {
      const saved = localStorage.getItem("leal_doc_template_settings");
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  const updateSettings = (partial: Partial<DocumentTemplateSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      localStorage.setItem("leal_doc_template_settings", JSON.stringify(updated));
      return updated;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem("leal_doc_template_settings", JSON.stringify(DEFAULT_SETTINGS));
  };

  return (
    <DocumentTemplateContext.Provider value={{ settings, updateSettings, resetSettings }}>
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
