export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  level: number;
  parentCode?: string | null;
  isDirectPosting: boolean;
  currency: string;
  adjustsForInflation: boolean;
  isActive: boolean;
};

export type AccountingMapping = {
  salesRevenueAccountCode?: string;
  salesVatDebitAccountCode?: string;
  accountsReceivableAccountCode?: string;
  purchaseExpenseAccountCode?: string;
  purchaseVatCreditAccountCode?: string;
  accountsPayableAccountCode?: string;
  [key: string]: string | undefined;
};

export type JournalEntryLineWrite = {
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string;
};

export type JournalEntry = {
  id: string;
  date: string;
  concept: string;
  entryType?: string;
  sourceModule?: string;
  sourceDocumentId?: string;
  totalDebit?: number;
  totalCredit?: number;
  message?: string;
  entryNumber?: string | number;
  linesCount?: number;
  lines?: Array<{ accountCode: string; accountName?: string; debit: number; credit: number; memo?: string }>;
};

export type GeneralLedgerRow = {
  accountCode: string;
  accountName?: string;
  date: string;
  debit: number;
  credit: number;
  balance?: number;
  memo?: string;
};

export type TrialBalance = {
  rows?: Array<{ accountCode: string; accountName: string; debit: number; credit: number }>;
  totalDebit?: number;
  totalCredit?: number;
};

export type PnlStatement = {
  year?: number;
  month?: number;
  revenue?: number;
  expenses?: number;
  result?: number;
  lines?: Array<{ accountCode: string; accountName: string; amount: number }>;
};

export type CostCenter = {
  id: string;
  code: string;
  name: string;
  category?: string;
};

export type FiscalPeriod = {
  year: number;
  month: number;
  status: string;
};
