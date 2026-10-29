export type FinanceAccount = {
  id: string;
  name: string;
  currency: string;
  type: string;
  /** Statement = extracto CSV; Manual = carga uno a uno */
  bookingMode?: "Statement" | "Manual" | string;
  balance: number;
  isActive: boolean;
  /** CBU de la cuenta propia, para los lotes de pago por archivo. */
  cbu?: string | null;
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

/** Retención o percepción que le hicieron a la empresa (nota 69, F3). */
export type SufferedTaxRow = {
  source: "Receipt" | "PurchaseInvoice" | "Bank"; sourceId: string; date: string; tax: string; kind: string; jurisdiction?: string | null;
  agentName: string; agentTaxId: string; voucher: string; amount: number; voucherType?: string | null; voucherLetter?: string | null; pointOfSale: number; number: string;
};
export type SufferedTaxes = {
  defaultJurisdiction?: string | null; jurisdictions: Record<string, string>; rows: SufferedTaxRow[]; problems: string[];
  totals: { tax: string; kind: string; jurisdiction?: string | null; jurisdictionName?: string | null; amount: number; count: number }[];
};

/** Transferencia de una orden de pago pendiente de banco que puede ir a un lote (nota 69, F4). */
export type PaymentBatchCandidate = {
  movementId: string; paymentOrderId: string; orderNumber: string; supplierId?: string | null; supplierName: string; supplierTaxId: string;
  amount: number; date: string; cbu?: string | null; problem?: string | null;
};
export type PaymentBatch = {
  id: string; number: number; accountId: string; requestDate: string; consolidated: boolean; total: number; status: "Generated" | "Cancelled";
  createdBy?: string | null; createdAtUtc: string;
  items: { movementId: string; paymentOrderId: string; paymentOrderNumber: string; supplierName: string; supplierTaxId: string; cbu: string; amount: number }[];
};

/** Fondo común de inversión con su tenencia y operaciones (nota 69, F5). */
export type InvestmentFund = {
  id: string; name: string; currency: string; accountId?: string | null; openingUnits: number; openingDate?: string | null; openingCost: number;
  lastUnitValue?: number | null; lastUnitValueDate?: string | null; units: number; contributed: number; valuation?: number | null; result?: number | null;
  operations: { id: string; externalId: string; kind: "Subscription" | "Redemption"; requestDate: string; settlementDate: string; amount: number; units: number; unitValue?: number | null; status: string; inBank?: boolean | null }[];
};

/** Billetera de viáticos de un empleado (cuenta financiera del tipo Billetera). */
export type ExpenseWallet = { id: string; name: string; employeeId: string; isActive: boolean; balance: number; openReports: number; pendingAmount: number };
export type ExpensePolicy = { mealUsd: number; snackUsd: number; lodgingOneUsd: number; lodgingTwoUsd: number };
export type ExpenseCategory = "Lodging" | "Meal" | "Snack" | "Fuel" | "Taxi" | "Hardware" | "VehicleMaintenance" | "Other";
export type ExpenseVoucherType = "A" | "B" | "C" | "Ticket" | "Recibo" | "SinComprobante";
export type ExpenseLine = {
  id: string; date: string; category: ExpenseCategory; categoryName: string; people: number; supplierName: string; supplierTaxId?: string | null;
  voucherType: ExpenseVoucherType; voucherNumber?: string | null; amount: number; liters?: number | null; detail?: string | null;
  purchaseInvoiceId?: string | null; purchaseInvoiceNumber?: string | null; movementId?: string | null; paymentOrderId?: string | null;
};
export type ExpenseLineInput = Omit<ExpenseLine, "id" | "categoryName" | "purchaseInvoiceNumber" | "movementId" | "paymentOrderId">;
/** Rendición de gastos (planilla FS 7.1 901 R2). */
export type ExpenseReport = {
  id: string; number: string; walletAccountId: string; walletName: string; employeeId: string; employeeName: string; weekStart: string;
  vehicleId?: string | null; vehiclePlate?: string | null; serviceOrderId?: string | null; serviceOrderLabel?: string | null; usdRate?: number | null;
  status: "Open" | "Approved"; notes?: string | null; approvedBy?: string | null; approvedAtUtc?: string | null; createdAtUtc: string;
  total: number; advances: { operationDateUtc: string; amount: number; description: string }[]; advancesTotal: number; walletBalance: number; balanceAfter: number;
  policy: ExpensePolicy; problems: string[]; lines: ExpenseLine[];
};
export type ExpenseReportSummary = { id: string; number: string; employeeId: string; employeeName: string; weekStart: string; vehiclePlate?: string | null; serviceOrderLabel?: string | null; status: "Open" | "Approved"; total: number; lines: number };
