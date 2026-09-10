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
