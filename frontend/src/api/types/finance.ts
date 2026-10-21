export type FinanceAccount = {
  id: string;
  name: string;
  currency: string;
  type: string;
  /** Statement = extracto CSV; Manual = carga uno a uno */
  bookingMode?: "Statement" | "Manual" | string;
  balance: number;
  isActive: boolean;
};

export type FinanceConcept = {
  id: string;
  code: string;
  name: string;
  direction: string;
  usableIn?: string;
  counterpartyType?: string;
  isActive: boolean;
  requiresCounterparty?: boolean;
  requiresInstrument?: boolean;
  cashFlowCategory?: string;
  journalTemplateCode?: string;
  notes?: string;
};

export type FinanceConceptRule = {
  id: string;
  financialConceptId: string;
  conceptName: string;
  accountId?: string;
  movementKind?: string;
  matchMode: string;
  pattern: string;
  priority: number;
  isActive: boolean;
};

export type FinanceMovementReview = {
  id: string;
  operationDateUtc: string;
  description: string;
  externalReference?: string;
  kind: string;
  amount: number;
  currency: string;
  accountName: string;
  conceptId?: string;
  conceptName?: string;
  classificationStatus: string;
  reconciliationStatus: string | number;
};

export type FinanceAvailableMovement = {
  id: string;
  accountId: string;
  accountName?: string;
  operationDateUtc: string;
  amount: number;
  currency: string;
  description: string;
  conceptId?: string;
  conceptName?: string;
};

export type BankImportPreviewRow = {
  operationDateUtc: string;
  amount: number;
  kind: string;
  description: string;
  externalReference?: string;
  reportedBalance?: number;
  error?: string;
  status?: "new" | "duplicate" | "match" | "ambiguous" | "error" | string;
  matchedSystemMovementId?: string;
  matchedSystemDescription?: string;
  matchedSystemDateUtc?: string;
  matchedSystemExternalReference?: string;
};

export type WithholdingRegime = { id: string; code: string; name: string; nonTaxableAmount: number; rateRegistered: number; rateUnregistered: number; minimumWithholding: number; source: string; isActive: boolean };
export type SupplierWithholdingProfile = { supplierId: string; condition: "Inscripto" | "NoInscripto" | "Monotributo" | "Exento"; regimeCode: string; excludedUntil?: string | null };
export type WithholdingSettings = { isAgent: boolean; agentSince?: string | null; regimes: WithholdingRegime[]; profiles: SupplierWithholdingProfile[] };
export type WithholdingPreview = { applies: false } | { applies: true; code: string; regimeName: string; condition: string; base: number; priorBase: number; priorWithheld: number; rate: number; amount: number; detail: string };
export type Withholding = {
  id: string; paymentOrderId: string; paymentOrderNumber: string; supplierId: string; supplierName: string; supplierTaxId: string; condition: string;
  regimeCode: string; regimeName: string; date: string; paymentAmount: number; base: number; priorBase: number; priorWithheld: number;
  nonTaxableAmount: number; rate: number; amount: number; certificateNumber?: string | null; status: string;
};
export type BankImportSource = { csvContent?: string; fileBase64?: string; fileName?: string };
export type BankImportPreviewResult = {
  /** Banco reconocido por el formato del archivo (Galicia, Santander, BBVA); null si se usó el importador genérico. */
  bank?: string | null;
  requiresMapping?: boolean;
  headers?: string[];
  hasProfile?: boolean;
  profileId?: string;
  rows: BankImportPreviewRow[];
  summary?: {
    total: number;
    valid: number;
    rejected: number;
    duplicates: number;
    systemMatches: number;
    ambiguousMatches: number;
  };
};

export type BankColumnMap = {
  date?: number | null;
  debit?: number | null;
  credit?: number | null;
  amount?: number | null;
  tipo?: number | null;
  description?: number | null;
  reference?: number | null;
  balance?: number | null;
};

export type BankImportProfile = {
  id: string;
  accountId: string;
  name: string;
  delimiter: string;
  dateFormat?: string;
  columnMap: BankColumnMap;
};

export type ReceivedCheque = {
  id: string;
  checkNumber: string;
  amount: number;
  currency: string;
  issuerName?: string;
  bankName?: string;
  dueDateUtc?: string;
  issueDateUtc?: string;
  status: string;
  direction: string;
  notes?: string;
};

export type CollectionReceiptDetail = {
  id: string;
  customerId?: string;
  accountId?: string;
  invoiceId?: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  receiptDateUtc: string;
  description: string;
  status: string;
  lines?: Record<string, unknown>[];
  imputations?: Record<string, unknown>[];
};

export type CollectionReceiptLineWrite = {
  method: string;
  amount: number;
  currency: string;
  accountId?: string | null;
  movementId?: string | null;
  chequeId?: string | null;
  conceptId?: string | null;
  retentionType?: string | null;
  retentionCertificate?: string | null;
  notes?: string | null;
};

export type CollectionReceiptImputationWrite = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  amountImputed: number;
  /** Factura en USD cobrada en pesos: dólares que cancela y cotizaciones de factura y pago. */
  amountUsd?: number;
  invoiceExchangeRate?: number;
  paymentExchangeRate?: number;
};

export type FinanceReconciliationMovement = {
  id: string;
  side?: string;
  operationDateUtc: string;
  kind: string;
  amount: number;
  currency: string;
  description: string;
  externalReference?: string;
  reconciliationStatus: number | string;
  linkedEntityType?: string;
  linkedEntityId?: string;
};

export type FinanceReconciliationMatch = {
  importedMovementId: string;
  systemMovementId: string;
  amount: number;
  importedDescription: string;
  systemDescription: string;
};

export type FinanceReconciliationResult = {
  imported: FinanceReconciliationMovement[];
  system: FinanceReconciliationMovement[];
  suggestedMatches: FinanceReconciliationMatch[];
};

export type CashFlowProjection = {
  availableToday: number;
  horizonDays: number;
  flows: Array<{ date: string; amount: number; label?: string }>;
};

/** Bandeja de conciliación (nota 69, F1b): cada movimiento del extracto sin conciliar con su acción sugerida. */
export type ReconciliationSuggestion =
  | { type: "Match"; systemId: string; label: string; operationDateUtc: string }
  | { type: "MatchMany"; systemIds: string[]; label: string }
  | { type: "Cheque"; chequeId: string; label: string; paymentOrderId?: string | null }
  | { type: "CreatePayment" | "CreateReceipt"; counterpartyId: string }
  | { type: "Classified"; conceptId: string; label: string }
  | { type: "Unknown" };
export type ReconciliationTray = {
  accountId: string;
  pendingSystem: number;
  rows: { id: string; operationDateUtc: string; kind: "Debit" | "Credit" | number; amount: number; description: string; counterpartyTaxId?: string | null; counterpartyName?: string | null; suggestion: ReconciliationSuggestion }[];
};
