import type {
  Activity,
  CustomerDetail,
  CustomerSummary,
  CustomerWrite,
  ExchangeRates,
  Lead,
  Opportunity,
  Order,
  OrderStatus,
  OrderWrite,
  Paged,
  Product,
  ProductCategory,
  PipelineReport,
  Quote,
  QuoteWrite
} from "./types";
import type {
  AccountingMapping,
  CostCenter,
  FiscalPeriod,
  GeneralLedgerRow,
  JournalEntry,
  JournalEntryLineWrite,
  LedgerAccount,
  PnlStatement,
  TrialBalance
} from "./types/accounting";
import type {
  BankImportPreviewRow,
  CashFlowProjection,
  CollectionReceiptDetail,
  CollectionReceiptImputationWrite,
  CollectionReceiptLineWrite,
  FinanceAccount,
  FinanceAvailableMovement,
  FinanceConcept,
  FinanceConceptRule,
  FinanceMovementReview,
  FinanceReconciliationResult,
  ReceivedCheque
} from "./types/finance";

const API_BASE = "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const normalToken = typeof window !== "undefined" ? localStorage.getItem("leal_token") : null;
  const superToken = typeof window !== "undefined" ? localStorage.getItem("leal_superadmin_token") : null;
  const isSuperAdminApi = path.startsWith("/api/v1/superadmin");
  const token = isSuperAdminApi ? superToken : (normalToken || superToken);
  const tenantId = typeof window !== "undefined" ? localStorage.getItem("leal_tenant_id") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers ? (options.headers as Record<string, string>) : {})
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (tenantId) {
    headers["X-Tenant-Id"] = tenantId;
  }
  if (typeof window !== "undefined" && localStorage.getItem("leal_presentation_mode") === "1") {
    headers["X-Presentation-Mode"] = "1";
  }
  const userStr = typeof window !== "undefined" ? localStorage.getItem("leal_user") : null;
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      if (u?.id) headers["X-User-Id"] = u.id;
    } catch {}
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `Error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      if (typeof parsed === "string") {
        message = parsed;
      } else {
        message = parsed.detail || parsed.title || parsed.message || message;
      }
    } catch {
      message = errorText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  listFinanceAccounts: () => request<FinanceAccount[]>("/api/v1/finance/accounts"),
  listFinanceConcepts: () => request<FinanceConcept[]>("/api/v1/finance/concepts"),
  createFinanceConcept: (body: object) => request("/api/v1/finance/concepts", { method: "POST", body: JSON.stringify(body) }),
  updateFinanceConcept: (id: string, body: object) => request(`/api/v1/finance/concepts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  listFinanceConceptRules: () => request<FinanceConceptRule[]>("/api/v1/finance/concept-rules"),
  createFinanceConceptRule: (body: object) => request("/api/v1/finance/concept-rules", { method: "POST", body: JSON.stringify(body) }),
  applyFinanceConceptRules: () => request<{ processed: number; suggested: number; pending: number }>("/api/v1/finance/concept-rules/apply", { method: "POST" }),
  listFinanceMovementsForReview: () => request<FinanceMovementReview[]>("/api/v1/finance/movements/review"),
  classifyFinanceMovement: (id: string, body: object) => request(`/api/v1/finance/movements/${id}/classification`, { method: "POST", body: JSON.stringify(body) }),
  createFinanceAccount: (body: { name: string; currency: string; type: string; openingBalance: number }) => request("/api/v1/finance/accounts", { method: "POST", body: JSON.stringify(body) }),
  previewFinanceBankImport: (accountId: string, csvContent: string) => request<BankImportPreviewRow[]>("/api/v1/finance/imports/bank/preview", { method: "POST", body: JSON.stringify({ accountId, csvContent }) }),
  confirmFinanceBankImport: (accountId: string, csvContent: string) => request<{ imported: number; updated?: number; duplicates: number; rejected: number }>("/api/v1/finance/imports/bank/confirm", { method: "POST", body: JSON.stringify({ accountId, csvContent }) }),
  listFinanceMovements: (accountId: string) => request<{ id: string; operationDateUtc: string; kind: string; amount: number; currency: string; description: string; externalReference?: string; transferId?: string; reconciliationStatus: number; linkedEntityType?: string; linkedEntityId?: string }[]>(`/api/v1/finance/accounts/${accountId}/movements`),
    listCollectionAvailableMovements: (accountId?: string, conceptId?: string) => {
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    if (conceptId) params.set("conceptId", conceptId);
    return request<FinanceAvailableMovement[]>(`/api/v1/finance/collections/available-movements?${params.toString()}`);
  },
  listPaymentAvailableMovements: (accountId?: string, conceptId?: string) => {
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    if (conceptId) params.set("conceptId", conceptId);
    return request<FinanceAvailableMovement[]>(`/api/v1/finance/payments/available-movements?${params.toString()}`);
  },
  listFinanceMovementDetails: (accountId: string) => request<{ id: string; operationDateUtc: string; description: string; externalReference?: string; kind: string; amount: number; currency: string; reportedBalance?: number; systemBalance: number; difference?: number; reconciliationStatus: string; stage?: string }[]>(`/api/v1/finance/accounts/${accountId}/movements-detail`),
  reconcileFinanceMovement: (movementId: string, body: { entityType: string; entityId: string }) => request(`/api/v1/finance/movements/${movementId}/reconcile`, { method: "POST", body: JSON.stringify(body) }),
  getFinanceReconciliation: (accountId: string, from?: string, to?: string) => {
    const params = new URLSearchParams({ accountId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return request<FinanceReconciliationResult>(`/api/v1/finance/reconciliation?${params.toString()}`);
  },
  matchFinanceReconciliation: (importedMovementId: string, systemMovementId: string) =>
    request("/api/v1/finance/reconciliation/match", {
      method: "POST",
      body: JSON.stringify({ importedMovementId, systemMovementId })
    }),
  unmatchFinanceReconciliation: (importedMovementId: string) =>
    request("/api/v1/finance/reconciliation/unmatch", {
      method: "POST",
      body: JSON.stringify({ importedMovementId })
    }),
  listReceivedCheques: () => request<ReceivedCheque[]>("/api/v1/finance/echeqs"),
  importReceivedCheques: (csvContent: string) => request<{ imported: number; duplicates: number }>("/api/v1/finance/echeqs/import", { method: "POST", body: JSON.stringify({ csvContent }) }),
  importIssuedCheques: (csvContent: string) => request<{ imported: number; duplicates: number }>("/api/v1/finance/echeqs/import-issued", { method: "POST", body: JSON.stringify({ csvContent }) }),
  createReceivedCheque: (body: object) => request("/api/v1/finance/echeqs", { method: "POST", body: JSON.stringify(body) }),
  useChequeForPayment: (id: string, reference: string) => request(`/api/v1/finance/echeqs/${id}/use-for-payment`, { method: "POST", body: JSON.stringify({ reference }) }),
  listCollectionReceipts: () => request<{ id: string; customerId?: string; accountId?: string; invoiceId?: string; receiptNumber: string; amount: number; currency: string; receiptDateUtc: string; description: string; status: string; linesCount?: number; invoicesCount?: number; invoicesSummary?: string }[]>("/api/v1/finance/collections"),
  getCollectionReceipt: (id: string) => request<CollectionReceiptDetail>(`/api/v1/finance/collections/${id}`),
  createCollectionReceipt: (body: {
    accountId?: string;
    customerId?: string;
    invoiceId?: string;
    movementId?: string;
    chequeId?: string;
    amount: number;
    currency: string;
    invoiceAmount?: number;
    invoiceCurrency?: string;
    invoiceExchangeRate?: number;
    paymentExchangeRate?: number;
    suggestedAdjustmentArs?: number;
    suggestedAdjustmentType?: string;
    receiptDateUtc: string;
    description: string;
    lines?: CollectionReceiptLineWrite[];
    imputations?: CollectionReceiptImputationWrite[];
  }) => request<{ id: string; receiptNumber: string; status: string }>("/api/v1/finance/collections", { method: "POST", body: JSON.stringify(body) }),
  listPaymentOrders: () => request<import("./types").PaymentOrder[]>("/api/v1/finance/payments"),
  getPaymentOrder: (id: string) => request<import("./types").PaymentOrder>(`/api/v1/finance/payments/${id}`),
  createPaymentOrder: (body: import("./types").PaymentOrderWriteRequest) => request<{ id: string; orderNumber: string; status: string }>("/api/v1/finance/payments", { method: "POST", body: JSON.stringify(body) }),
  voidCollectionReceipt: (id: string, reason: string) => request(`/api/v1/finance/collections/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) }),
  voidPaymentOrder: (id: string, reason: string) => request(`/api/v1/finance/payments/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) }),
  bulkClassifyFinanceMovements: (movementIds: string[]) => request<{ confirmed: number }>("/api/v1/finance/movements/classification/bulk", { method: "POST", body: JSON.stringify({ movementIds, confirm: true }) }),
  createFinanceRuleFromMovement: (movementId: string, body: object) => request(`/api/v1/finance/movements/${movementId}/create-rule`, { method: "POST", body: JSON.stringify(body) }),
  financeCashCount: (accountId: string, body: { countedAmount: number; countDateUtc: string; note?: string }) => request(`/api/v1/finance/accounts/${accountId}/cash-count`, { method: "POST", body: JSON.stringify(body) }),
  financeTransfer: (body: { fromAccountId: string; toAccountId: string; amount: number; currency: string; operationDateUtc: string; description: string }) => request("/api/v1/finance/transfers", { method: "POST", body: JSON.stringify(body) }),
  financeCashFlowProjection: (days = 30) => request<CashFlowProjection>(`/api/v1/finance/cash-flow/projection?days=${days}`),
  depositCheque: (id: string, body: { bankAccountId: string; depositDateUtc: string }) => request(`/api/v1/finance/echeqs/${id}/deposit`, { method: "POST", body: JSON.stringify(body) }),
  rejectCheque: (id: string, body: { rejectDateUtc: string; fees?: number; note?: string }) => request(`/api/v1/finance/echeqs/${id}/reject`, { method: "POST", body: JSON.stringify(body) }),
  cancelCheque: (id: string, reason: string) => request(`/api/v1/finance/echeqs/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  listCustomers: (search = "", role = "customer") =>
    request<Paged<CustomerSummary>>(`/api/v1/crm/customers?page=1&pageSize=50&search=${encodeURIComponent(search)}${role ? `&role=${encodeURIComponent(role)}` : ""}`),
  getCustomer: (id: string) => request<CustomerDetail>(`/api/v1/crm/customers/${id}`),
  createCustomer: (body: CustomerWrite) =>
    request<CustomerDetail>("/api/v1/crm/customers", { method: "POST", body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: CustomerWrite) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  updateCustomerBcra: (id: string, body: { creditRating?: string; worstSituation?: number; totalDebt?: number; rejectedChequesCount?: number; recommendation?: string }) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/bcra-sync`, { method: "POST", body: JSON.stringify(body) }),
  addLocation: (id: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/locations`, { method: "POST", body: JSON.stringify(body) }),
  updateLocation: (id: string, locationId: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/locations/${locationId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteLocation: (id: string, locationId: string) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/locations/${locationId}`, { method: "DELETE" }),
  addContact: (id: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/contacts`, { method: "POST", body: JSON.stringify(body) }),
  updateContact: (id: string, contactId: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/contacts/${contactId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteContact: (id: string, contactId: string) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/contacts/${contactId}`, { method: "DELETE" }),
  consultArcaCuit: (cuit: string) =>
    request<import("./types").ArcaCuitResult>(`/api/v1/crm/customers/consult-cuit/${encodeURIComponent(cuit)}`),
  consultArca: (cuit: string) =>
    request<import("./types").ArcaCuitResult>(`/api/v1/crm/customers/consult-cuit/${encodeURIComponent(cuit)}`),
  addEquipment: (id: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/equipments`, { method: "POST", body: JSON.stringify(body) }),
  updateEquipment: (id: string, equipmentId: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/equipments/${equipmentId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteEquipment: (id: string, equipmentId: string) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/equipments/${equipmentId}`, { method: "DELETE" }),
  upsertRate: (id: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/fiscal-rates`, { method: "PUT", body: JSON.stringify(body) }),
  timeline: (id: string) => request<Activity[]>(`/api/v1/crm/customers/${id}/timeline`),
  opportunityTimeline: (id: string) => request<Activity[]>(`/api/v1/crm/opportunities/${id}/timeline`),
  opportunities: (id: string) => request<Opportunity[]>(`/api/v1/crm/customers/${id}/opportunities`),
  logActivity: (body: object) =>
    request<Activity>("/api/v1/crm/activities", { method: "POST", body: JSON.stringify(body) }),
  listFollowUps: () => request<Activity[]>("/api/v1/crm/activities/follow-ups").catch(() => []),
  listLeads: () => request<Lead[]>("/api/v1/crm/leads"),
  captureLead: (body: object) =>
    request<Lead>("/api/v1/crm/leads", { method: "POST", body: JSON.stringify(body) }),
  convertLead: (id: string, body: CustomerWrite) =>
    request<CustomerDetail>(`/api/v1/crm/leads/${id}/convert`, { method: "POST", body: JSON.stringify(body) }),
  listOpportunities: () => request<Opportunity[]>("/api/v1/crm/opportunities"),
  getKanbanBoard: (ownerName?: string) =>
    request<Record<string, Opportunity[]>>(`/api/v1/crm/opportunities/kanban${ownerName ? `?ownerName=${encodeURIComponent(ownerName)}` : ""}`),
  openOpportunity: (body: object) =>
    request<Opportunity>("/api/v1/crm/opportunities", { method: "POST", body: JSON.stringify(body) }),
  moveStage: (id: string, stage: string) =>
    request<Opportunity>(`/api/v1/crm/opportunities/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ stage })
    }),
  moveOpportunity: (id: string, stage: string, reason?: string) =>
    request<Opportunity>(`/api/v1/crm/opportunities/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ stage, lostReason: reason })
    }),
  classifyOpportunity: (id: string, body: object) =>
    request<Opportunity>(`/api/v1/crm/opportunities/${id}/classify`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  createQuoteFromOpportunity: (id: string) =>
    request<Quote>(`/api/v1/sales/quotes/from-opportunity/${id}`, { method: "POST" }),
  markWon: (id: string) =>
    request<Opportunity>(`/api/v1/crm/opportunities/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ stage: "Won" })
    }),
  markLost: (id: string, reason?: string) =>
    request<Opportunity>(`/api/v1/crm/opportunities/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ stage: "Lost", lostReason: reason })
    }),
  listProducts: (search = "", productType = "", categoryId = "", onlyActive = true) => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (productType) params.append("type", productType);
    if (categoryId) params.append("categoryId", categoryId);
    if (!onlyActive) params.append("onlyActive", "false");
    const queryString = params.toString();
    return request<Product[]>(`/api/v1/sales/products${queryString ? `?${queryString}` : ""}`);
  },
  listProductionBoms: (productId?: string) => request<import("./types").ProductionBom[]>(`/api/v1/sales/production/boms${productId ? `?productId=${productId}` : ""}`),
  createProductionBom: (body: object) => request<import("./types").ProductionBom>("/api/v1/sales/production/boms", { method: "POST", body: JSON.stringify(body) }),
  updateProductionBom: (id: string, body: object) => request<import("./types").ProductionBom>(`/api/v1/sales/production/boms/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  listProductionWorkCenters: () => request<import("./types").ProductionWorkCenter[]>("/api/v1/sales/production/work-centers"),
  createProductionWorkCenter: (body: object) => request<import("./types").ProductionWorkCenter>("/api/v1/sales/production/work-centers", { method: "POST", body: JSON.stringify(body) }),
  listProductionRoutes: (productId?: string) => request<import("./types").ProductionRoute[]>(`/api/v1/sales/production/routes${productId ? `?productId=${productId}` : ""}`),
  createProductionRoute: (body: object) => request<import("./types").ProductionRoute>("/api/v1/sales/production/routes", { method: "POST", body: JSON.stringify(body) }),
  updateProductionRoute: (id: string, body: object) => request<import("./types").ProductionRoute>(`/api/v1/sales/production/routes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  listProductionOrders: () => request<import("./types").ProductionOrder[]>("/api/v1/sales/production/orders"),
  createProductionOrder: (body: object) => request<import("./types").ProductionOrder>("/api/v1/sales/production/orders", { method: "POST", body: JSON.stringify(body) }),
  updateProductionOrderStatus: (id: string, status: number) => request<import("./types").ProductionOrder>(`/api/v1/sales/production/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  listProductionExecutions: (id: string) => request<import("./types").ProductionExecutionEntry[]>(`/api/v1/sales/production/orders/${id}/executions`),
  createProductionExecution: (id: string, body: object) => request<import("./types").ProductionExecutionEntry>(`/api/v1/sales/production/orders/${id}/executions`, { method: "POST", body: JSON.stringify(body) }),
  listProductionVariants: (productId?: string) => request<import("./types").ProductionVariant[]>(`/api/v1/sales/production/variants${productId ? `?productId=${productId}` : ""}`),
  createProductionVariant: (body: object) => request<import("./types").ProductionVariant>("/api/v1/sales/production/variants", { method: "POST", body: JSON.stringify(body) }),
  getProductionCost: (productId: string) => request<{ productId: string; bomId: string; version: string; outputQuantity: number; materialCost: number; costPerOutputUnit: number; lines: Array<{ productId: string; quantity: number; scrapPercent: number; unitCost: number; extendedCost: number }> }>(`/api/v1/sales/production/costs/${productId}`),
  getProduct: (id: string) => request<Product>(`/api/v1/sales/products/${id}`),
  createProduct: (body: object) =>
    request<Product>("/api/v1/sales/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id: string, body: object) =>
    request<Product>(`/api/v1/sales/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProduct: (id: string) =>
    request<void>(`/api/v1/sales/products/${id}`, { method: "DELETE" }),
  listCategories: () => request<ProductCategory[]>("/api/v1/sales/categories").catch(() => []),
  createCategory: (body: object) =>
    request<ProductCategory>("/api/v1/sales/categories", { method: "POST", body: JSON.stringify(body) }),
  getExchangeRates: () => request<Omit<ExchangeRates, "usdBilleteSell" | "usdDivisaSell">>("/api/v1/sales/quotes/exchange-rates")
    .then((rates) => ({
      ...rates,
      usdBilleteSell: rates.usdBillete.venta,
      usdDivisaSell: rates.usdDivisa.venta
    })),
  listQuotes: (search = "") =>
    request<Quote[]>(`/api/v1/sales/quotes?search=${encodeURIComponent(search)}`),
  getQuote: (id: string) => request<Quote>(`/api/v1/sales/quotes/${id}`),
  createQuote: (body: QuoteWrite) =>
    request<Quote>("/api/v1/sales/quotes", { method: "POST", body: JSON.stringify(body) }),
  updateQuote: (id: string, body: QuoteWrite) =>
    request<Quote>(`/api/v1/sales/quotes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  acceptQuote: (id: string) =>
    request<Quote>(`/api/v1/sales/quotes/${id}/accept`, { method: "POST" }),
  sendQuote: (id: string) =>
    request<Quote>(`/api/v1/sales/quotes/${id}/send`, { method: "POST" }),
  rejectQuote: (id: string) =>
    request<Quote>(`/api/v1/sales/quotes/${id}/reject`, { method: "POST" }),

  // Orders Methods (Pedidos de Venta)
  listOrders: (search = "", status = "") => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    const queryString = params.toString();
    return request<Order[]>(`/api/v1/sales/orders${queryString ? `?${queryString}` : ""}`);
  },
  getOrder: (id: string) => request<Order>(`/api/v1/sales/orders/${id}`),
  createOrder: (body: OrderWrite) =>
    request<Order>("/api/v1/sales/orders", { method: "POST", body: JSON.stringify(body) }),
  createOrderFromQuote: (quoteId: string) =>
    request<Order>(`/api/v1/sales/orders/from-quote/${quoteId}`, { method: "POST" }),
  updateOrder: (id: string, body: OrderWrite) =>
    request<Order>(`/api/v1/sales/orders/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<Order>(`/api/v1/sales/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),

  pipelineReport: (params?: { ownerName?: string; fromUtc?: string; toUtc?: string }) =>
    request<PipelineReport>(`/api/v1/crm/reports/pipeline${params?.ownerName ? `?ownerName=${encodeURIComponent(params.ownerName)}` : ""}`),

  listMailAccounts: () => request<import("./types").MailAccount[]>("/api/v1/communications/accounts"),
  saveMailAccount: (body: object) => request<{ id: string }>("/api/v1/communications/accounts", { method: "POST", body: JSON.stringify(body) }),
  testMailAccount: (id: string) => request<{ connected: boolean }>(`/api/v1/communications/accounts/${id}/test`, { method: "POST" }),
  syncMailAccount: (id: string) => request<{ received: number }>(`/api/v1/communications/accounts/${id}/sync`, { method: "POST" }),
  listEmails: (entityType?: string, entityId?: string) => { const p = new URLSearchParams(); if(entityType)p.set("entityType",entityType); if(entityId)p.set("entityId",entityId); return request<import("./types").EmailMessage[]>(`/api/v1/communications/messages${p.size?`?${p}`:""}`); },
  listConversations: (opts?: { channel?: string; folder?: string; search?: string; customerId?: string; assignedTo?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (opts?.channel && opts.channel !== "all") p.set("channel", opts.channel);
    if (opts?.folder && opts.folder !== "All") p.set("folder", opts.folder);
    if (opts?.search) p.set("search", opts.search);
    if (opts?.customerId) p.set("customerId", opts.customerId);
    if (opts?.assignedTo) p.set("assignedTo", opts.assignedTo);
    if (opts?.status) p.set("status", opts.status);
    return request<import("./types").Conversation[]>(`/api/v1/communications/conversations${p.size ? `?${p}` : ""}`);
  },
  getConversationMessages: (id: string) => request<import("./types").EmailMessage[]>(`/api/v1/communications/conversations/${id}/messages`),
  linkConversation: (id: string, body: { leadId?: string; customerId?: string }) =>
    request<{ success: boolean; relatedLeadId?: string; relatedCustomerId?: string }>(`/api/v1/communications/conversations/${id}/link`, { method: "POST", body: JSON.stringify(body) }),
  assignConversation: (id: string, userId?: string) =>
    request<{ success: boolean }>(`/api/v1/communications/conversations/${id}/assign`, { method: "POST", body: JSON.stringify({ userId: userId || null }) }),
  setConversationStatus: (id: string, status: string) =>
    request<{ success: boolean }>(`/api/v1/communications/conversations/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  dismissConversationSuggestion: (id: string) =>
    request<{ success: boolean }>(`/api/v1/communications/conversations/${id}/dismiss-suggestion`, { method: "POST" }),
  getSuggestedMatches: (id: string) => request<import("./types").CustomerMatch[]>(`/api/v1/communications/conversations/${id}/suggested-matches`),
  listReplyTemplates: () => request<import("./types").MessageReplyTemplate[]>("/api/v1/communications/templates"),
  saveReplyTemplate: (body: { id?: string; name: string; body: string; channelType?: string }) =>
    request<{ id: string }>("/api/v1/communications/templates", { method: "POST", body: JSON.stringify(body) }),
  deleteReplyTemplate: (id: string) => request<void>(`/api/v1/communications/templates/${id}`, { method: "DELETE" }),
  getCommunicationsNotificationSummary: () =>
    request<{
      unreadTotal: number;
      needsResponseCount: number;
      recent: Array<{
        id: string;
        participantName: string;
        participantId: string;
        channelType: string;
        lastMessagePreview?: string | null;
        unreadCount: number;
        lastMessageAtUtc: string;
        needsResponse: boolean;
      }>;
    }>("/api/v1/communications/notifications/summary"),
  uploadCommunicationMedia: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const tenantId = localStorage.getItem("tenantId") || "";
    const res = await fetch("/api/v1/communications/media/upload", {
      method: "POST",
      headers: { "X-Tenant-Id": tenantId },
      body: form
    });
    if (!res.ok) throw new Error("Error al subir archivo");
    return res.json() as Promise<{ mediaId: string; publicUrl: string }>;
  },
  downloadMessageAttachment: (messageId: string, attachmentId: string) =>
    `/api/v1/communications/messages/${messageId}/attachments/${attachmentId}/download`,
  deleteConversation: (id: string) => request<void>(`/api/v1/communications/conversations/${id}`, { method: "DELETE" }),
  markConversationRead: (id: string) => request<{ success: boolean }>(`/api/v1/communications/conversations/${id}/mark-read`, { method: "POST" }),
  deleteEmail: (id: string) => request<void>(`/api/v1/communications/messages/${id}`, { method: "DELETE" }),
  sendEmail: (accountId: string, body: object) => request<{id:string;messageId:string}>(`/api/v1/communications/accounts/${accountId}/send`, { method:"POST", body:JSON.stringify(body) }),

  // WhatsApp Gateway Methods (Multi-Usuario por Empleado)
  getWhatsAppStatus: (userId?: string) =>
    request<{ available: boolean; state: string; phoneNumber?: string; error?: string; instanceName?: string; userId?: string; isConnected?: boolean }>(
      `/api/v1/communications/whatsapp/status${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`
    ),
  connectWhatsApp: (userId?: string, userName?: string) => {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (userName) params.set("userName", userName);
    const qs = params.toString();
    return request<{ success: boolean; state: string; qrCodeBase64?: string; error?: string; instanceName?: string; userId?: string }>(
      `/api/v1/communications/whatsapp/connect${qs ? `?${qs}` : ""}`,
      { method: "POST" }
    );
  },
  disconnectWhatsApp: (userId?: string) =>
    request<{ success: boolean; instanceName?: string; userId?: string }>(
      `/api/v1/communications/whatsapp/disconnect${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`,
      { method: "POST" }
    ),
  syncWhatsAppMessages: (userId?: string) =>
    request<{ synced: number; total?: number }>(
      `/api/v1/communications/whatsapp/sync${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`,
      { method: "POST" }
    ),
  listTeamWhatsAppLines: () =>
    request<Array<{
      id: string;
      tenantId: string;
      userId?: string;
      userName?: string;
      instanceName: string;
      phoneNumber?: string;
      state: string;
      isConnected: boolean;
      connectedAtUtc?: string;
      lastSyncAtUtc?: string;
      lastError?: string;
    }>>("/api/v1/communications/whatsapp/team-lines"),
  sendWhatsAppMessage: (body: {
    to: string;
    message: string;
    mediaUrl?: string;
    mediaType?: string;
    fileName?: string;
    mediaBase64?: string;
    mimeType?: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
    userId?: string;
    instanceName?: string;
  }) =>
    request<{ success: boolean; messageId?: string; error?: string; instanceUsed?: string }>("/api/v1/communications/whatsapp/send", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  // Meta (Instagram & Facebook) Methods
  getMetaStatus: () =>
    request<{
      facebook: { isConnected: boolean; pageId?: string; pageName?: string; verifyToken: string; connectedAtUtc?: string; lastSyncAtUtc?: string; lastError?: string };
      instagram: { isConnected: boolean; pageId?: string; pageName?: string; instagramAccountId?: string; instagramUsername?: string; verifyToken: string; connectedAtUtc?: string; lastSyncAtUtc?: string; lastError?: string };
    }>("/api/v1/communications/meta/status"),
  configureMeta: (body: { channelType: "facebook" | "instagram"; pageAccessToken: string }) =>
    request<{ success: boolean; pageId?: string; pageName?: string; instagramAccountId?: string; instagramUsername?: string; error?: string }>("/api/v1/communications/meta/config", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  disconnectMeta: (channelType: "facebook" | "instagram") =>
    request<{ success: boolean }>("/api/v1/communications/meta/disconnect", { method: "POST", body: JSON.stringify({ channelType }) }),
  syncMetaMessages: () => request<{ synced: number; channels?: Array<{ channel: string; synced: number; error?: string | null }> }>("/api/v1/communications/meta/sync", { method: "POST" }),
  sendMetaMessage: (body: { channelType: "facebook" | "instagram"; recipientId: string; message: string; mediaUrl?: string; mediaType?: string; relatedEntityType?: string; relatedEntityId?: string }) =>
    request<{ success: boolean; messageId?: string; error?: string }>("/api/v1/communications/meta/send", { method: "POST", body: JSON.stringify(body) }),

  // Company Settings & Users Methods
  getCompanySettings: () => request<import("./types").CompanySettings>("/api/v1/company/settings"),
  updateCompanySettings: (body: import("./types").CompanySettings) =>
    request<import("./types").CompanySettings>("/api/v1/company/settings", { method: "PUT", body: JSON.stringify(body) }),
  uploadArcaCertificate: (body: { certificateCrt: string; certificateKey: string; environment: string; signerCuit: string }) =>
    request<import("./types").CompanySettings>("/api/v1/company/settings/arca-certificate", { method: "POST", body: JSON.stringify(body) }),
  listTenantUsers: () => request<import("./types").TenantUser[]>("/api/v1/company/users"),
  createTenantUser: (body: { fullName: string; email: string; role: string; password?: string; allowedModulesJson?: string }) =>
    request<import("./types").TenantUser>("/api/v1/company/users", { method: "POST", body: JSON.stringify(body) }),
  updateTenantUser: (id: string, body: { fullName: string; role: string; isActive: boolean; password?: string; allowedModulesJson?: string }) =>
    request<import("./types").TenantUser>(`/api/v1/company/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteTenantUser: (id: string) =>
    request<void>(`/api/v1/company/users/${id}`, { method: "DELETE" }),

  // Suppliers Methods (Unified Directory)
  listSuppliers: async (search = ""): Promise<import("./types").Supplier[]> => {
    try {
      const paged = await request<Paged<CustomerSummary>>(`/api/v1/crm/customers?page=1&pageSize=200&search=${encodeURIComponent(search)}&role=supplier`);
      if (paged.items && paged.items.length > 0) {
        return paged.items.map(s => ({
          id: s.id,
          legalName: s.legalName,
          tradeName: s.tradeName,
          documentType: s.documentType,
          documentNumber: s.documentNumber,
          taxCondition: s.taxCondition,
          email: s.email,
          phone: s.phone,
          createdAtUtc: new Date().toISOString()
        }));
      }
      const all = await request<Paged<CustomerSummary>>(`/api/v1/crm/customers?page=1&pageSize=200&search=${encodeURIComponent(search)}`);
      const supps = (all.items || []).filter(x => x.isSupplier);
      const target = supps.length > 0 ? supps : all.items || [];
      return target.map(s => ({
        id: s.id,
        legalName: s.legalName,
        tradeName: s.tradeName,
        documentType: s.documentType,
        documentNumber: s.documentNumber,
        taxCondition: s.taxCondition,
        email: s.email,
        phone: s.phone,
        createdAtUtc: new Date().toISOString()
      }));
    } catch {
      return [];
    }
  },
  getSupplier: async (id: string): Promise<import("./types").Supplier> => {
    const c = await request<CustomerDetail>(`/api/v1/crm/customers/${id}`);
    return {
      id: c.id,
      legalName: c.legalName,
      tradeName: c.tradeName,
      documentType: c.documentType,
      documentNumber: c.documentNumber,
      taxCondition: c.taxCondition,
      email: c.email,
      phone: c.phone,
      createdAtUtc: new Date().toISOString()
    };
  },
  createSupplier: (body: import("./types").SupplierWrite) =>
    request<import("./types").Supplier>("/api/v1/crm/suppliers", { method: "POST", body: JSON.stringify(body) }),
  updateSupplier: (id: string, body: import("./types").SupplierWrite) =>
    request<import("./types").Supplier>(`/api/v1/crm/suppliers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSupplier: (id: string) =>
    request<boolean>(`/api/v1/crm/suppliers/${id}`, { method: "DELETE" }),

  // Inventory & Multi-Warehouse Methods
  listInventory: (search = "", status = "", warehouseId = "") => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    if (warehouseId) params.append("warehouseId", warehouseId);
    const q = params.toString();
    return request<import("./types").StockItem[]>(`/api/v1/sales/inventory${q ? `?${q}` : ""}`);
  },
  adjustStock: (body: {
    productId: string;
    newPhysicalStock: number;
    minimumStock: number;
    warehouseId?: string;
    warehouseName?: string;
    warehouseLocation?: string;
    reasonNotes?: string;
    operatorName?: string;
    serialNumbers?: string;
    lotNumber?: string;
  }) => request<import("./types").StockItem>("/api/v1/sales/inventory/adjust", { method: "POST", body: JSON.stringify(body) }),

  listWarehouses: () => request<import("./types").Warehouse[]>("/api/v1/sales/inventory/warehouses"),
  createWarehouse: (body: { code: string; name: string; type: string; address?: string; assignedTechnicianName?: string }) =>
    request<import("./types").Warehouse>("/api/v1/sales/inventory/warehouses", { method: "POST", body: JSON.stringify(body) }),
  updateWarehouse: (id: string, body: { code: string; name: string; type: string; address?: string; assignedTechnicianName?: string; isActive: boolean }) =>
    request<import("./types").Warehouse>(`/api/v1/sales/inventory/warehouses/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  listStockTransfers: (status = "") => {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<import("./types").StockTransfer[]>(`/api/v1/sales/inventory/transfers${q}`);
  },
  createStockTransfer: (body: {
    originWarehouseId: string;
    destinationWarehouseId: string;
    operatorName?: string;
    notes?: string;
    items: Array<{ productId: string; productCode: string; productName: string; quantity: number; serialNumbers?: string; lotNumber?: string }>;
  }) => request<import("./types").StockTransfer>("/api/v1/sales/inventory/transfers", { method: "POST", body: JSON.stringify(body) }),
  receiveStockTransfer: (id: string, operatorName?: string) =>
    request<import("./types").StockTransfer>(`/api/v1/sales/inventory/transfers/${id}/receive`, { method: "POST", body: JSON.stringify({ operatorName }) }),

  listKardex: (params?: { productId?: string; warehouseId?: string; movementType?: string; search?: string; limit?: number }) => {
    const p = new URLSearchParams();
    if (params?.productId) p.append("productId", params.productId);
    if (params?.warehouseId) p.append("warehouseId", params.warehouseId);
    if (params?.movementType) p.append("movementType", params.movementType);
    if (params?.search) p.append("search", params.search);
    if (params?.limit) p.append("limit", params.limit.toString());
    const q = p.toString();
    return request<import("./types").StockMovement[]>(`/api/v1/sales/inventory/kardex${q ? `?${q}` : ""}`);
  },

  generatePurchaseRequestFromStock: (notes?: string) =>
    request<{ purchaseRequestId: string }>("/api/v1/sales/inventory/reorder-to-purchase-request", { method: "POST", body: JSON.stringify({ notes }) }),

  listProductSuppliers: (productId: string) =>
    request<import("./types").ProductSupplier[]>(`/api/v1/sales/inventory/products/${productId}/suppliers`),
  linkProductSupplier: (body: { productId: string; supplierId: string; supplierProductCode?: string; purchasePrice: number; currency: string; leadTimeDays: number; minimumOrderQuantity: number; isPreferred: boolean }) =>
    request<import("./types").ProductSupplier>("/api/v1/sales/inventory/products/suppliers", { method: "POST", body: JSON.stringify(body) }),

  // Remitos Methods
  listRemitos: (search = "", status = "") => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    const q = params.toString();
    return request<import("./types").Remito[]>(`/api/v1/sales/remitos${q ? `?${q}` : ""}`);
  },
  getRemito: (id: string) => request<import("./types").Remito>(`/api/v1/sales/remitos/${id}`),
  createRemito: (body: import("./types").RemitoWrite) =>
    request<import("./types").Remito>("/api/v1/sales/remitos", { method: "POST", body: JSON.stringify(body) }),

  // Invoices & ARCA Methods
  listInvoices: (search = "", status = "", type = "") => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    if (type) params.append("type", type);
    const q = params.toString();
    return request<import("./types").Invoice[]>(`/api/v1/sales/invoices${q ? `?${q}` : ""}`);
  },
  getInvoice: (id: string) => request<import("./types").Invoice>(`/api/v1/sales/invoices/${id}`),
  createInvoice: (body: import("./types").InvoiceWrite) =>
    request<import("./types").Invoice>("/api/v1/sales/invoices", { method: "POST", body: JSON.stringify(body) }),
  authorizeInvoiceArca: (id: string) =>
    request<import("./types").Invoice>(`/api/v1/sales/invoices/${id}/authorize-arca`, { method: "POST" }),

  // Purchases Methods
  listPurchaseOrders: (search = "", status = "") => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    const q = params.toString();
    return request<import("./types").PurchaseOrder[]>(`/api/v1/purchases/orders${q ? `?${q}` : ""}`);
  },
  getPurchaseOrder: (id: string) => request<import("./types").PurchaseOrder>(`/api/v1/purchases/orders/${id}`),
  createPurchaseOrder: (body: import("./types").PurchaseOrderWrite) =>
    request<import("./types").PurchaseOrder>("/api/v1/purchases/orders", { method: "POST", body: JSON.stringify(body) }),
  updatePurchaseOrderStatus: (id: string, status: string) =>
    request<import("./types").PurchaseOrder>(`/api/v1/purchases/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),

  // Purchase Receptions Methods
  listPurchaseReceptions: (search = "") => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    const q = params.toString();
    return request<import("./types").PurchaseReception[]>(`/api/v1/purchases/receptions${q ? `?${q}` : ""}`);
  },
  getPurchaseReception: (id: string) => request<import("./types").PurchaseReception>(`/api/v1/purchases/receptions/${id}`),
  createPurchaseReception: (body: import("./types").PurchaseReceptionWrite) =>
    request<import("./types").PurchaseReception>("/api/v1/purchases/receptions", { method: "POST", body: JSON.stringify(body) }),

  // Purchase Invoices Methods
  listPurchaseInvoices: (search = "", status = "") => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status && status.toLowerCase() !== "all") params.append("status", status);
    const q = params.toString();
    return request<import("./types").PurchaseInvoice[]>(`/api/v1/purchases/invoices${q ? `?${q}` : ""}`);
  },
  getPurchaseInvoice: (id: string) => request<import("./types").PurchaseInvoice>(`/api/v1/purchases/invoices/${id}`),
  createPurchaseInvoice: (body: import("./types").PurchaseInvoiceWrite) =>
    request<import("./types").PurchaseInvoice>("/api/v1/purchases/invoices", { method: "POST", body: JSON.stringify(body) }),

  // ARCA Mis Comprobantes Recibidos Methods
  listArcaVouchers: (status = "Pending", search = "") => {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (search) params.append("search", search);
    const q = params.toString();
    return request<import("./types").PurchaseArcaVoucher[]>(`/api/v1/purchases/arca/vouchers${q ? `?${q}` : ""}`);
  },
  importArcaCsv: (csvContent: string) =>
    request<import("./types").ImportArcaCsvResult>("/api/v1/purchases/arca/import", { method: "POST", body: JSON.stringify({ csvContent }) }),
  ignoreArcaVoucher: (id: string) =>
    request<boolean>(`/api/v1/purchases/arca/vouchers/${id}/ignore`, { method: "POST" }),

  // Purchase Requests Methods (Requisiciones Internas)
  listPurchaseRequests: (search = "", status = "") => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    const q = params.toString();
    return request<import("./types").PurchaseRequest[]>(`/api/v1/purchases/requests${q ? `?${q}` : ""}`);
  },
  getPurchaseRequest: (id: string) => request<import("./types").PurchaseRequest>(`/api/v1/purchases/requests/${id}`),
  createPurchaseRequest: (body: import("./types").PurchaseRequestWrite) =>
    request<import("./types").PurchaseRequest>("/api/v1/purchases/requests", { method: "POST", body: JSON.stringify(body) }),
  approvePurchaseRequest: (id: string) =>
    request<import("./types").PurchaseRequest>(`/api/v1/purchases/requests/${id}/approve`, { method: "POST" }),
  rejectPurchaseRequest: (id: string, reason: string) =>
    request<import("./types").PurchaseRequest>(`/api/v1/purchases/requests/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  addPurchaseQuotation: (requestId: string, body: import("./types").PurchaseQuotationWrite) =>
    request<import("./types").PurchaseRequest>(`/api/v1/purchases/requests/${requestId}/quotations`, { method: "POST", body: JSON.stringify(body) }),
  selectPurchaseQuotation: (requestId: string, quotationId: string) =>
    request<import("./types").PurchaseRequest>(`/api/v1/purchases/requests/${requestId}/quotations/${quotationId}/select`, { method: "POST" }),
  deletePurchaseQuotation: (requestId: string, quotationId: string) =>
    request<import("./types").PurchaseRequest>(`/api/v1/purchases/requests/${requestId}/quotations/${quotationId}`, { method: "DELETE" }),

  // ==========================================
  // HUMAN RESOURCES (RRHH & LIQUIDACIÃ“N)
  // ==========================================
  getHrDashboardSummary: () =>
    request<import("./types").HrDashboardSummary>("/api/v1/hr/dashboard-summary"),

  listEmployees: (search?: string) => {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    return request<import("./types").Employee[]>(`/api/v1/hr/employees${q}`);
  },
  getEmployee: (id: string) => request<import("./types").Employee>(`/api/v1/hr/employees/${id}`),
  createEmployee: (body: Partial<import("./types").Employee>) =>
    request<import("./types").Employee>("/api/v1/hr/employees", { method: "POST", body: JSON.stringify(body) }),
  updateEmployee: (id: string, body: Partial<import("./types").Employee>) =>
    request<import("./types").Employee>(`/api/v1/hr/employees/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteEmployee: (id: string) =>
    request<void>(`/api/v1/hr/employees/${id}`, { method: "DELETE" }),

  // Organigrama y Puestos
  listPositions: () =>
    request<import("./types").OrganizationPosition[]>("/api/v1/hr/positions"),
  createPosition: (body: Partial<import("./types").OrganizationPosition>) =>
    request<import("./types").OrganizationPosition>("/api/v1/hr/positions", { method: "POST", body: JSON.stringify(body) }),
  updatePosition: (id: string, body: Partial<import("./types").OrganizationPosition>) =>
    request<import("./types").OrganizationPosition>(`/api/v1/hr/positions/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePosition: (id: string) =>
    request<void>(`/api/v1/hr/positions/${id}`, { method: "DELETE" }),

  // Legajo Digital y Documentos
  listEmployeeDocuments: (employeeId: string) =>
    request<import("./types").EmployeeDocument[]>(`/api/v1/hr/employees/${employeeId}/documents`),
  createEmployeeDocument: (employeeId: string, body: Partial<import("./types").EmployeeDocument>) =>
    request<import("./types").EmployeeDocument>(`/api/v1/hr/employees/${employeeId}/documents`, { method: "POST", body: JSON.stringify(body) }),
  updateEmployeeDocument: (id: string, body: Partial<import("./types").EmployeeDocument>) =>
    request<import("./types").EmployeeDocument>(`/api/v1/hr/documents/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteEmployeeDocument: (id: string) =>
    request<void>(`/api/v1/hr/documents/${id}`, { method: "DELETE" }),

  // Manuales de Procedimientos
  listProcedureManuals: (area?: string) => {
    const q = area && area !== "ALL" ? `?area=${encodeURIComponent(area)}` : "";
    return request<import("./types").ProcedureManual[]>(`/api/v1/hr/manuals${q}`);
  },
  createProcedureManual: (body: Partial<import("./types").ProcedureManual>) =>
    request<import("./types").ProcedureManual>("/api/v1/hr/manuals", { method: "POST", body: JSON.stringify(body) }),
  updateProcedureManual: (id: string, body: Partial<import("./types").ProcedureManual>) =>
    request<import("./types").ProcedureManual>(`/api/v1/hr/manuals/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteProcedureManual: (id: string) =>
    request<void>(`/api/v1/hr/manuals/${id}`, { method: "DELETE" }),

  // EPP
  listEmployeeEpps: (employeeId: string) =>
    request<import("./types").EppDelivery[]>(`/api/v1/hr/employees/${employeeId}/epps`),
  createEppDelivery: (body: Partial<import("./types").EppDelivery>) =>
    request<import("./types").EppDelivery>("/api/v1/hr/epps", { method: "POST", body: JSON.stringify(body) }),

  // Payroll
  listPayrollPeriods: () =>
    request<import("./types").PayrollPeriod[]>("/api/v1/hr/payroll/periods"),
  createPayrollPeriod: (body: Partial<import("./types").PayrollPeriod>) =>
    request<import("./types").PayrollPeriod>("/api/v1/hr/payroll/periods", { method: "POST", body: JSON.stringify(body) }),
  calculatePayroll: (periodId: string) =>
    request<{ periodId: string; employeesCalculated: number; totalNetToPay: number }>(`/api/v1/hr/payroll/calculate/${periodId}`, { method: "POST" }),
  listPayrollSlips: (periodId: string) =>
    request<import("./types").PayrollSlip[]>(`/api/v1/hr/payroll/slips/${periodId}`),
  getPayrollSlipDetail: (slipId: string) =>
    request<{ slip: import("./types").PayrollSlip; employee: import("./types").Employee; period: import("./types").PayrollPeriod }>(`/api/v1/hr/payroll/slips/detail/${slipId}`),
  signPayrollSlipByEmployee: (slipId: string) =>
    request<{ message: string; signedAt: string }>(`/api/v1/hr/payroll/slips/${slipId}/sign-employee`, { method: "POST" }),

  // ==========================================
  // FLEET (GESTIÃ“N DE FLOTA)
  // ==========================================
  listVehicles: (search?: string) => {
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    return request<import("./types").Vehicle[]>(`/api/v1/fleet/vehicles${q}`);
  },
  getVehicle: (id: string) => request<import("./types").Vehicle>(`/api/v1/fleet/vehicles/${id}`),
  createVehicle: (body: Partial<import("./types").Vehicle>) =>
    request<import("./types").Vehicle>("/api/v1/fleet/vehicles", { method: "POST", body: JSON.stringify(body) }),
  updateVehicle: (id: string, body: Partial<import("./types").Vehicle>) =>
    request<import("./types").Vehicle>(`/api/v1/fleet/vehicles/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  listVehicleDocuments: (vehicleId: string) =>
    request<import("./types").VehicleDocument[]>(`/api/v1/fleet/vehicles/${vehicleId}/documents`),
  createVehicleDocument: (body: Partial<import("./types").VehicleDocument>) =>
    request<import("./types").VehicleDocument>("/api/v1/fleet/documents", { method: "POST", body: JSON.stringify(body) }),
  listExpiringDocuments: () =>
    request<import("./types").VehicleDocument[]>("/api/v1/fleet/documents/expiring"),

  listDrivers: () => request<import("./types").VehicleDriver[]>("/api/v1/fleet/drivers"),
  createDriver: (body: Partial<import("./types").VehicleDriver>) =>
    request<import("./types").VehicleDriver>("/api/v1/fleet/drivers", { method: "POST", body: JSON.stringify(body) }),

  listMaintenances: (vehicleId?: string) => {
    const q = vehicleId ? `?vehicleId=${vehicleId}` : "";
    return request<import("./types").VehicleMaintenance[]>(`/api/v1/fleet/maintenances${q}`);
  },
  createMaintenance: (body: Partial<import("./types").VehicleMaintenance>) =>
    request<import("./types").VehicleMaintenance>("/api/v1/fleet/maintenances", { method: "POST", body: JSON.stringify(body) }),

  listFuelLogs: (vehicleId?: string) => {
    const q = vehicleId ? `?vehicleId=${vehicleId}` : "";
    return request<import("./types").VehicleFuelLog[]>(`/api/v1/fleet/fuel-logs${q}`);
  },
  createFuelLog: (body: Partial<import("./types").VehicleFuelLog>) =>
    request<import("./types").VehicleFuelLog>("/api/v1/fleet/fuel-logs", { method: "POST", body: JSON.stringify(body) }),

  // Authentication & Multi-Tenancy
  login: (body: { email: string; password: string; tenantId?: string }) =>
    request<import("./types").AuthResponse>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(body) }),
  registerTenant: (body: { companyName: string; cuit?: string; phone?: string; adminFullName?: string; email: string; password: string }) =>
    request<import("./types").AuthResponse>("/api/v1/auth/register-tenant", { method: "POST", body: JSON.stringify(body) }),
  getMe: () =>
    request<{ user: import("./types").UserInfo; tenant: import("./types").TenantInfo; availableTenants: import("./types").TenantInfo[] }>("/api/v1/auth/me"),
  switchTenant: (tenantId: string) =>
    request<import("./types").AuthResponse>("/api/v1/auth/switch-tenant", { method: "POST", body: JSON.stringify({ tenantId }) }),
  listTenants: () =>
    request<import("./types").TenantInfo[]>("/api/v1/auth/tenants"),

  // Grains & Agriculture Brokerage Module
  getGrainDashboard: () =>
    request<import("./types").GrainDashboardData>("/api/v1/grains/dashboard"),
  listGrainContracts: (params?: { search?: string; grainType?: string; harvest?: string; status?: string; pricingMode?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.grainType) q.set("grainType", params.grainType);
    if (params?.harvest) q.set("harvest", params.harvest);
    if (params?.status) q.set("status", params.status);
    if (params?.pricingMode) q.set("pricingMode", params.pricingMode);
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<import("./types").GrainContract[]>(`/api/v1/grains/contracts${query}`);
  },
  getGrainContract: (id: string) =>
    request<{ contract: import("./types").GrainContract; fixations: import("./types").GrainPriceFixation[]; deliveries: import("./types").GrainDelivery[] }>(`/api/v1/grains/contracts/${id}`),
  createGrainContract: (body: Partial<import("./types").GrainContract>) =>
    request<{ id: string; contractNumber: string }>("/api/v1/grains/contracts", { method: "POST", body: JSON.stringify(body) }),
  createGrainFixation: (body: { contractId: string; fixedTons: number; pricePerTon: number; currency?: string; marketReference?: string; fixationDateUtc?: string; notes?: string }) =>
    request<{ id: string; fixationNumber: string }>("/api/v1/grains/fixations", { method: "POST", body: JSON.stringify(body) }),
  createGrainDelivery: (body: { contractId: string; cpeNumber?: string; ctgNumber?: string; truckPlate?: string; trailerPlate?: string; driverName?: string; grossWeightKg: number; tareWeightKg: number; humidityPercentage: number; foreignMatterPercentage: number; damagedPercentage: number; qualityGrade?: string; destinationSiloOrPort?: string }) =>
    request<{ id: string; deliveryNumber: string; commercialNetTons: number }>("/api/v1/grains/deliveries", { method: "POST", body: JSON.stringify(body) }),
  listGrainDeliveries: () =>
    request<import("./types").GrainDelivery[]>("/api/v1/grains/deliveries"),
  listGrainMarketPrices: () =>
    request<import("./types").GrainMarketPrice[]>("/api/v1/grains/market-prices"),

  // SuperAdmin SaaS Management
  superAdminLogin: (body: { email: string; password: string }) =>
    request<{ token: string; user: { id: string; fullName: string; email: string; role: string } }>("/api/v1/superadmin/auth/login", { method: "POST", body: JSON.stringify(body) }),
  getSuperAdminDashboard: () =>
    request<{ totalTenants: number; activeTenants: number; suspendedTenants: number; mrrArs: number; mrrUsd: number; totalStorageMb: number; planBreakdown: any[]; recentTenants: any[] }>("/api/v1/superadmin/dashboard"),
  listSuperAdminTenants: () =>
    request<any[]>("/api/v1/superadmin/tenants"),
  createSuperAdminTenant: (body: { name: string; slug?: string; planCode?: string; adminFullName?: string; adminEmail: string; adminPassword: string; adminPhone?: string; monthlyPriceArs: number; monthlyPriceUsd: number; enabledModulesJson?: string }) =>
    request<{ success: boolean; dbName: string; message: string }>("/api/v1/superadmin/tenants", { method: "POST", body: JSON.stringify(body) }),
  updateSuperAdminTenantStatus: (id: string, body: { status: string; expiresAtUtc?: string; monthlyPriceArs?: number; planCode?: string }) =>
    request<any>(`/api/v1/superadmin/tenants/${id}/status`, { method: "PUT", body: JSON.stringify(body) }),
  updateSuperAdminTenantModules: (id: string, body: { enabledModulesJson?: string; planCode?: string; monthlyPriceArs?: number }) =>
    request<any>(`/api/v1/superadmin/tenants/${id}/modules`, { method: "PUT", body: JSON.stringify(body) }),
  generateSuperAdminPaymentLink: (id: string) =>
    request<{ success: boolean; paymentUrl: string; amount: number; preferenceId?: string; message?: string }>(`/api/v1/superadmin/tenants/${id}/payment-link`, { method: "POST" }),
  listSuperAdminPlans: () =>
    request<any[]>("/api/v1/superadmin/plans"),
  createSuperAdminPlan: (body: { code: string; name: string; priceArs: number; priceUsd: number; maxUsers: number; description?: string; featuresJson?: string; enabledModulesJson?: string }) =>
    request<any>("/api/v1/superadmin/plans", { method: "POST", body: JSON.stringify(body) }),
  updateSuperAdminPlan: (id: string, body: any) =>
    request<any>(`/api/v1/superadmin/plans/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  listSuperAdminDemoRequests: () =>
    request<any[]>("/api/v1/superadmin/demo-requests"),
  updateSuperAdminDemoRequestStatus: (id: string, status: string) =>
    request<any>(`/api/v1/superadmin/demo-requests/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  provisionSuperAdminDemoRequest: (id: string, body: { adminPassword: string; slug?: string; planCode?: string; adminFullName?: string; enabledModulesJson?: string; monthlyPriceArs?: number }) =>
    request<{ success: boolean; dbName: string; message: string; adminEmail?: string; loginUrl?: string }>(`/api/v1/superadmin/demo-requests/${id}/provision`, { method: "POST", body: JSON.stringify(body) }),

  // Accounting Module
  listAccounts: () =>
    request<LedgerAccount[]>("/api/v1/accounting/accounts"),
  createAccount: (body: { code: string; name: string; accountType?: string; level: number; parentCode?: string; isDirectPosting: boolean; currency?: string; adjustsForInflation?: boolean }) =>
    request<LedgerAccount>("/api/v1/accounting/accounts", { method: "POST", body: JSON.stringify(body) }),
  updateAccount: (id: string, body: { code?: string; name: string; accountType?: string; level?: number; parentCode?: string; isDirectPosting: boolean; currency?: string; adjustsForInflation: boolean; isActive: boolean }) =>
    request<LedgerAccount>(`/api/v1/accounting/accounts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAccount: (id: string) =>
    request<void>(`/api/v1/accounting/accounts/${id}`, { method: "DELETE" }),

  // Accounting Mapping (Matriz de Enlace Contable)
  getAccountingMapping: () =>
    request<AccountingMapping>("/api/v1/accounting/mapping"),
  updateAccountingMapping: (body: AccountingMapping) =>
    request<AccountingMapping>("/api/v1/accounting/mapping", { method: "PUT", body: JSON.stringify(body) }),

  listJournalEntries: (params?: { startDate?: string; endDate?: string; sourceModule?: string }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", params.startDate);
    if (params?.endDate) q.set("endDate", params.endDate);
    if (params?.sourceModule) q.set("sourceModule", params.sourceModule);
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<JournalEntry[]>(`/api/v1/accounting/journal-entries${query}`);
  },
  createJournalEntry: (body: { date: string; concept: string; entryType?: string; sourceModule?: string; sourceDocumentId?: string; createdBy?: string; lines: JournalEntryLineWrite[] }) =>
    request<JournalEntry>("/api/v1/accounting/journal-entries", { method: "POST", body: JSON.stringify(body) }),
  getLedger: (accountCodeOrParams?: string | { accountCode?: string; startDate?: string; endDate?: string }, maybeParams?: { startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (typeof accountCodeOrParams === "string") {
      if (accountCodeOrParams) q.set("accountCode", accountCodeOrParams);
      if (maybeParams?.startDate) q.set("startDate", maybeParams.startDate);
      if (maybeParams?.endDate) q.set("endDate", maybeParams.endDate);
    } else if (accountCodeOrParams) {
      if (accountCodeOrParams.accountCode) q.set("accountCode", accountCodeOrParams.accountCode);
      if (accountCodeOrParams.startDate) q.set("startDate", accountCodeOrParams.startDate);
      if (accountCodeOrParams.endDate) q.set("endDate", accountCodeOrParams.endDate);
    }
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<GeneralLedgerRow[]>(`/api/v1/accounting/general-ledger${query}`);
  },
  getTrialBalance: (params?: { startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", params.startDate);
    if (params?.endDate) q.set("endDate", params.endDate);
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<TrialBalance>(`/api/v1/accounting/trial-balance${query}`);
  },
  getPnlStatement: (params?: { year?: number; month?: number }) => {
    const q = new URLSearchParams();
    if (params?.year) q.set("year", params.year.toString());
    if (params?.month) q.set("month", params.month.toString());
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<PnlStatement>(`/api/v1/accounting/pnl-statement${query}`);
  },
  getIncomeStatement: (params?: { startDate?: string; endDate?: string; year?: number; month?: number }) => {
    const q = new URLSearchParams();
    if (params?.year) q.set("year", params.year.toString());
    if (params?.month) q.set("month", params.month.toString());
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<PnlStatement>(`/api/v1/accounting/pnl-statement${query}`);
  },
  getCostCenterPnl: (year?: number) => {
    const q = year ? `?year=${year}` : "";
    return request<Record<string, unknown>>(`/api/v1/accounting/reports/cost-center-pnl${q}`);
  },
  runYearEndClosing: (body: { year: number; closingDate?: string }) =>
    request<JournalEntry>("/api/v1/accounting/year-end-closing", { method: "POST", body: JSON.stringify(body) }),
  autoPostPayroll: (body: { date: string; periodDescription: string; totalGrossSalaries: number; totalEmployerContributions: number; totalNetSalaries: number; totalSocialSecurityToPay: number; costCenterId?: string }) =>
    request<JournalEntry>("/api/v1/accounting/auto-post/payroll", { method: "POST", body: JSON.stringify(body) }),
  listCostCenters: () =>
    request<CostCenter[]>("/api/v1/accounting/cost-centers"),
  createCostCenter: (body: { code: string; name: string; category?: string }) =>
    request<CostCenter>("/api/v1/accounting/cost-centers", { method: "POST", body: JSON.stringify(body) }),
  listFiscalPeriods: () =>
    request<FiscalPeriod[]>("/api/v1/accounting/periods"),
  lockFiscalPeriod: (body: { year: number; month: number; lock: boolean; user?: string }) =>
    request<FiscalPeriod>("/api/v1/accounting/periods/lock", { method: "POST", body: JSON.stringify(body) }),

  // Auto-Posting Triggers
  autoPostInvoice: (body: { invoiceId: string; invoiceNumber: string; customerName: string; date: string; netAmount: number; vatAmount: number; totalAmount: number }) =>
    request<JournalEntry>("/api/v1/accounting/auto-post/invoice", { method: "POST", body: JSON.stringify(body) }),
  autoPostPurchase: (body: { purchaseId: string; invoiceNumber: string; supplierName: string; date: string; netAmount: number; vatAmount: number; totalAmount: number }) =>
    request<JournalEntry>("/api/v1/accounting/auto-post/purchase", { method: "POST", body: JSON.stringify(body) }),
  autoPostReceipt: (body: { receiptId: string; receiptNumber: string; customerName: string; date: string; amount: number; paymentMethod?: string }) =>
    request<JournalEntry>("/api/v1/accounting/auto-post/receipt", { method: "POST", body: JSON.stringify(body) }),

  // Bank Reconciliation
  getTreasuryReconciliation: () =>
    request<{ message: string; financeReconciliationPath: string; rows: Array<{
      code: string; name: string; accountType: string; currency: string;
      ledgerDebit: number; ledgerCredit: number; ledgerBalance: number; role: string;
    }> }>("/api/v1/accounting/treasury-reconciliation"),
  listFinanceAccountMappings: () =>
    request<{ financialAccountId: string; ledgerAccountCode: string; updatedAtUtc: string }[]>(
      "/api/v1/accounting/finance-account-mappings"),
  saveFinanceAccountMappings: (body: { financialAccountId: string; ledgerAccountCode: string }[]) =>
    request("/api/v1/accounting/finance-account-mappings", { method: "PUT", body: JSON.stringify(body) }),

  // ==========================================
  // ASIENTOS MODELOS (PLANTILLAS CONFIGURABLES) & CONTABILIZACIÃ“N EN LOTE
  // ==========================================
  listJournalTemplates: (sourceModule?: string) => {
    const q = sourceModule ? `?sourceModule=${sourceModule}` : "";
    return request<import("./types").JournalTemplate[]>(`/api/v1/accounting/templates${q}`);
  },
  getJournalTemplate: (id: string) =>
    request<import("./types").JournalTemplate>(`/api/v1/accounting/templates/${id}`),
  createJournalTemplate: (body: Partial<import("./types").JournalTemplate>) =>
    request<import("./types").JournalTemplate>("/api/v1/accounting/templates", { method: "POST", body: JSON.stringify(body) }),
  updateJournalTemplate: (id: string, body: Partial<import("./types").JournalTemplate>) =>
    request<import("./types").JournalTemplate>(`/api/v1/accounting/templates/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteJournalTemplate: (id: string) =>
    request<{ message: string }>(`/api/v1/accounting/templates/${id}`, { method: "DELETE" }),
  getAmountSourceVariables: () =>
    request<import("./types").AmountSourceVariableInfo[]>("/api/v1/accounting/templates/variables"),
  getUnpostedDocumentsSummary: () =>
    request<import("./types").UnpostedDocumentsSummary>("/api/v1/accounting/batch-post/pending-summary"),
  previewBatchPosting: (body: { periodStart?: string; periodEnd?: string; modules?: string[]; branchId?: string; currency?: string }) =>
    request<import("./types").BatchPostingPreview>("/api/v1/accounting/batch-post/preview", { method: "POST", body: JSON.stringify(body) }),
  executeBatchPosting: (body: { periodStart?: string; periodEnd?: string; modules?: string[]; branchId?: string; currency?: string; executedBy?: string }) =>
    request<import("./types").BatchPostingExecuteResponse>("/api/v1/accounting/batch-post/execute", { method: "POST", body: JSON.stringify(body) }),
  listBatchRuns: () =>
    request<import("./types").BatchPostingRun[]>("/api/v1/accounting/batch-runs"),
  revertBatchRun: (id: string) =>
    request<{ message: string }>(`/api/v1/accounting/batch-runs/${id}/revert`, { method: "POST" }),

  // ==========================================
  // METROLOGY & QUALITY PROFESSIONAL
  // ==========================================
  getMetrologyDashboard: () =>
    request<{
      equipments: { total: number; active: number; expired: number };
      weights: { total: number; valid: number; expired: number };
      reports: { total: number; recent: import("./types").CalibrationReport[] };
    }>("/api/v1/metrology/dashboard"),

  listMetrologyEquipment: (params?: { search?: string; customerId?: string; status?: string; instructionCode?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.customerId) q.set("customerId", params.customerId);
    if (params?.status) q.set("status", params.status);
    if (params?.instructionCode) q.set("instructionCode", params.instructionCode);
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<import("./types").MetrologyEquipment[]>(`/api/v1/metrology/equipment${query}`);
  },
  getMetrologyEquipment: (id: string) =>
    request<{
      equipment: import("./types").MetrologyEquipment;
      history: import("./types").CalibrationReport[];
    }>(`/api/v1/metrology/equipment/${id}`),
  createMetrologyEquipment: (body: Partial<import("./types").MetrologyEquipment>) =>
    request<import("./types").MetrologyEquipment>("/api/v1/metrology/equipment", { method: "POST", body: JSON.stringify(body) }),
  updateMetrologyEquipment: (id: string, body: Partial<import("./types").MetrologyEquipment>) =>
    request<import("./types").MetrologyEquipment>(`/api/v1/metrology/equipment/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMetrologyEquipment: (id: string) =>
    request<{ message: string }>(`/api/v1/metrology/equipment/${id}`, { method: "DELETE" }),

  listStandardWeights: (params?: { search?: string; status?: string; lot?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.lot) q.set("lot", params.lot);
    const qs = q.toString();
    return request<import("./types").StandardWeight[]>(`/api/v1/metrology/weights${qs ? `?${qs}` : ""}`);
  },
  createStandardWeight: (body: Partial<import("./types").StandardWeight>) =>
    request<import("./types").StandardWeight>("/api/v1/metrology/weights", { method: "POST", body: JSON.stringify(body) }),
  updateStandardWeight: (id: string, body: Partial<import("./types").StandardWeight>) =>
    request<import("./types").StandardWeight>(`/api/v1/metrology/weights/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteStandardWeight: (id: string) =>
    request<{ message: string }>(`/api/v1/metrology/weights/${id}`, { method: "DELETE" }),
  bulkImportStandardWeights: (weights: any[]) =>
    request<{ success: boolean; imported: number; updated: number; total: number; message: string }>("/api/v1/metrology/weights/bulk-import", {
      method: "POST",
      body: JSON.stringify({ weights })
    }),
  bulkUpdateStandardWeightLot: (ids: string[], lotName: string) =>
    request<{ success: boolean; count: number; message: string }>("/api/v1/metrology/weights/bulk-lot", {
      method: "POST",
      body: JSON.stringify({ ids, lotName })
    }),
  clearAllStandardWeights: () =>
    request<{ success: boolean; deleted: number; message: string }>("/api/v1/metrology/weights/clear-all", {
      method: "POST"
    }),
  getStandardWeightHistory: (code: string) =>
    request<import("./types").StandardWeight[]>(`/api/v1/metrology/weights/history?code=${encodeURIComponent(code)}`),

  listMetrologyInstruments: (params?: { kind?: string; status?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.kind) q.set("kind", params.kind);
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return request<import("./types").MetrologyInstrument[]>(`/api/v1/metrology/instruments${qs ? `?${qs}` : ""}`);
  },
  getMetrologyInstrument: (id: string) =>
    request<import("./types").MetrologyInstrument>(`/api/v1/metrology/instruments/${id}`),
  createMetrologyInstrument: (body: Partial<import("./types").MetrologyInstrument>) =>
    request<import("./types").MetrologyInstrument>("/api/v1/metrology/instruments", { method: "POST", body: JSON.stringify(body) }),
  updateMetrologyInstrument: (id: string, body: Partial<import("./types").MetrologyInstrument>) =>
    request<import("./types").MetrologyInstrument>(`/api/v1/metrology/instruments/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMetrologyInstrument: (id: string) =>
    request<void>(`/api/v1/metrology/instruments/${id}`, { method: "DELETE" }),

  calculateMetrologyRules: (body: {
    maxCapacity: number;
    minCapacity: number;
    divisionD: number;
    verificationIntervalE: number;
    accuracyClass: string;
    loadCellsCount: number;
    normative?: string;
    standardApplied?: string;
    platformType?: string;
    tare?: number;
    isInService?: boolean;
  }) =>
    request<{
      linearityPoints: import("./types").MetrologyTestPoint[];
      eccentricityConfig: import("./types").EccentricityConfig;
      repeatabilityConfig: { halfMaxLoad: number; fullMaxLoad: number; emt: number; recommendedRepetitions: number };
      recommendedLinearityPoints?: any[];
      standardApplied?: string;
      errorLimitTerm?: string;
      repeatabilityTerm?: string;
    }>("/api/v1/metrology/calculate-rules", { method: "POST", body: JSON.stringify(body) }),

  listCalibrationReports: (params?: { equipmentId?: string; customerId?: string; instructionCode?: string }) => {
    const q = new URLSearchParams();
    if (params?.equipmentId) q.set("equipmentId", params.equipmentId);
    if (params?.customerId) q.set("customerId", params.customerId);
    if (params?.instructionCode) q.set("instructionCode", params.instructionCode);
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<import("./types").CalibrationReport[]>(`/api/v1/metrology/reports${query}`);
  },
  getCalibrationReport: (id: string) =>
    request<{
      report: import("./types").CalibrationReport;
      equipment?: import("./types").MetrologyEquipment;
      thermometer?: import("./types").MetrologyInstrument | null;
      amendments?: Array<{
        id: string;
        certificateNumber: string;
        reportStatus: string;
        amendmentReason?: string | null;
        createdAtUtc: string;
      }>;
      supersededReport?: { id: string; certificateNumber: string; reportStatus: string } | null;
    }>(`/api/v1/metrology/reports/${id}`),
  saveCalibrationReport: (body: Record<string, unknown>) =>
    request<import("./types").CalibrationReport>("/api/v1/metrology/reports", { method: "POST", body: JSON.stringify(body) }),

  approveCalibrationReport: (id: string) =>
    request<import("./types").CalibrationReport>(`/api/v1/metrology/reports/${id}/approve`, { method: "POST", body: "{}" }),

  /** PG09 R2 — clona informe Issued en borrador de enmienda y marca el original Superseded. */
  amendCalibrationReport: (id: string, body: { amendmentReason: string } & Record<string, unknown>) =>
    request<import("./types").CalibrationReport>(`/api/v1/metrology/reports/${id}/amend`, {
      method: "POST",
      body: JSON.stringify(body)
    }),

  getCalibrationReportSgcTraceability: (id: string) =>
    request<{
      reportId: string;
      certificateNumber: string;
      reportStatus: string;
      instructionCode?: string;
      standardApplied?: string;
      performedBy?: string;
      approvedBy?: string;
      temperatureCelsius?: number;
      thermometer?: {
        id: string;
        code: string;
        kind: string;
        description?: string;
        certificateNumber?: string;
        traceabilityLab?: string;
        calibrationDate?: string | null;
        expirationDate?: string | null;
        status?: string;
      } | null;
      procedures: Array<{ code?: string; displayCode?: string; title?: string; version?: number }>;
      externalDocumentCodes: string[];
      weightsUsed: Array<{ code?: string; certificateNumber?: string; nominalValue?: number; unit?: string }>;
      qualityLinks: {
        tree: string;
        instruction?: string | null;
        procedurePg12: string;
        procedurePg09: string;
        procedurePg16?: string;
      };
    }>(`/api/v1/metrology/reports/${id}/sgc-traceability`),

  // ==========================================
  // Quality (ISO 17025)
  // ==========================================
  getQualityDashboard: () =>
    request<import("./types/quality").QualityDashboard>("/api/v1/quality/dashboard"),

  getQualityAuditTrail: (entityType: string, entityId: string) =>
    request<{
      entityType: string;
      entityId: string;
      rows: import("./types/quality").QualityAuditEventRow[];
    }>(`/api/v1/quality/audit/${encodeURIComponent(entityType)}/${entityId}`),

  getQualityPresentationStatus: () =>
    request<{
      active: boolean;
      sessionId?: string;
      startedAtUtc?: string;
      startedByName?: string;
    }>("/api/v1/quality/presentation/status"),

  startQualityPresentation: () =>
    request<{
      active: boolean;
      sessionId: string;
      startedAtUtc: string;
      startedByName: string;
      resumed?: boolean;
    }>("/api/v1/quality/presentation/start", { method: "POST", body: "{}" }),

  endQualityPresentation: (password: string) =>
    request<{ active: boolean; closed: number }>("/api/v1/quality/presentation/end", {
      method: "POST",
      body: JSON.stringify({ password })
    }),

  getQualityDocumentTree: () =>
    request<import("./types/quality").QualityDocumentTreeNode[]>("/api/v1/quality/documents/tree"),

  createQualityDocument: (body: {
    code: string;
    title: string;
    displayCode?: string;
    type?: "Manual" | "Procedure" | "Instruction" | "RecordTemplate" | "External";
    parentId?: string;
    sortOrder?: number;
    reviewPeriodMonths?: number;
    ownerRole?: string;
    iso17025Clauses?: string;
    recordKind?: string;
    linkedModule?: string;
    externalSource?: string;
    externalUrl?: string;
    changeSummary?: string;
    elaboratedBy?: string;
    elaboratedAt?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    approvedBy?: string;
    approvedAt?: string;
    effectiveFrom?: string;
    publishedFileId?: string;
    sourceFileId?: string;
    versionNumber?: number;
    markCurrent?: boolean;
  }) =>
    request<{ id: string; code: string; displayCode: string; title: string; type: string; status: string }>(
      "/api/v1/quality/documents",
      { method: "POST", body: JSON.stringify(body) }
    ),

  getQualityDocument: (code: string) =>
    request<import("./types/quality").QualityDocumentDetail>(`/api/v1/quality/documents/${encodeURIComponent(code)}`),

  getQualityDocumentListPg01R01: () =>
    request<{ code: string; title: string; generatedAtUtc: string; rows: Array<Record<string, unknown>> }>(
      "/api/v1/quality/records/pg01-r01"
    ),

  getQualityDocumentListPg01R02: () =>
    request<{ code: string; title: string; generatedAtUtc: string; rows: Array<Record<string, unknown>> }>(
      "/api/v1/quality/records/pg01-r02"
    ),

  listQualityMc01R01: () =>
    request<{
      code: string;
      title: string;
      recordKind?: string;
      generatedAtUtc: string;
      rows: import("./types/quality").QualityConfidentialityCommitment[];
    }>("/api/v1/quality/records/mc01-r01"),

  createQualityMc01R01: (body: {
    personName: string;
    personEmail?: string;
    personRole?: string;
    organization?: string;
    signedAt?: string;
    signedFileId?: string;
    notes?: string;
    personUserId?: string;
  }) =>
    request<import("./types/quality").QualityConfidentialityCommitment>("/api/v1/quality/records/mc01-r01", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  cancelQualityMc01R01: (id: string) =>
    request<import("./types/quality").QualityConfidentialityCommitment>(
      `/api/v1/quality/records/mc01-r01/${id}`,
      { method: "DELETE" }
    ),

  listQualityMc01R02: () =>
    request<{
      code: string;
      title: string;
      recordKind?: string;
      generatedAtUtc: string;
      rows: import("./types/quality").QualityConfidentialityCommitment[];
    }>("/api/v1/quality/records/mc01-r02"),

  createQualityMc01R02: (body: {
    personName: string;
    personEmail?: string;
    personRole?: string;
    organization?: string;
    signedAt?: string;
    signedFileId?: string;
    notes?: string;
    personUserId?: string;
  }) =>
    request<import("./types/quality").QualityConfidentialityCommitment>("/api/v1/quality/records/mc01-r02", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  cancelQualityMc01R02: (id: string) =>
    request<import("./types/quality").QualityConfidentialityCommitment>(
      `/api/v1/quality/records/mc01-r02/${id}`,
      { method: "DELETE" }
    ),

  listQualityMc01R03: () =>
    request<{
      code: string;
      title: string;
      recordKind?: string;
      generatedAtUtc: string;
      rows: import("./types/quality").QualityIndicator[];
    }>("/api/v1/quality/records/mc01-r03"),

  createQualityIndicator: (body: {
    name: string;
    objective?: string;
    formula?: string;
    targetValue?: number;
    targetUnit?: string;
    direction?: string;
    responsible?: string;
    frequency?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityIndicator>("/api/v1/quality/records/mc01-r03", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityIndicator: (
    id: string,
    body: {
      name?: string;
      objective?: string;
      formula?: string;
      targetValue?: number;
      targetUnit?: string;
      direction?: string;
      responsible?: string;
      frequency?: string;
      notes?: string;
      status?: string;
    }
  ) =>
    request<import("./types/quality").QualityIndicator>(`/api/v1/quality/records/mc01-r03/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  deactivateQualityIndicator: (id: string) =>
    request<import("./types/quality").QualityIndicator>(`/api/v1/quality/records/mc01-r03/${id}`, {
      method: "DELETE"
    }),

  createQualityIndicatorValue: (
    indicatorId: string,
    body: { period: string; value: number; notes?: string; recordedBy?: string }
  ) =>
    request<import("./types/quality").QualityIndicatorValue>(
      `/api/v1/quality/records/mc01-r03/${indicatorId}/values`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  deleteQualityIndicatorValue: (indicatorId: string, valueId: string) =>
    request<void>(`/api/v1/quality/records/mc01-r03/${indicatorId}/values/${valueId}`, {
      method: "DELETE"
    }),

  listQualityMc01R05: () =>
    request<{
      code: string;
      title: string;
      recordKind?: string;
      generatedAtUtc: string;
      rows: import("./types/quality").QualityInstitutionalNote[];
    }>("/api/v1/quality/records/mc01-r05"),

  createQualityMc01R05: (body: {
    subject: string;
    body?: string;
    issuedBy?: string;
    audience?: string;
    issuedAt?: string;
    fileId?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityInstitutionalNote>("/api/v1/quality/records/mc01-r05", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  cancelQualityMc01R05: (id: string) =>
    request<import("./types/quality").QualityInstitutionalNote>(
      `/api/v1/quality/records/mc01-r05/${id}`,
      { method: "DELETE" }
    ),

  listQualityPg03R01: () =>
    request<{
      code: string;
      title: string;
      recordKind?: string;
      generatedAtUtc: string;
      overdueOpen?: number;
      rows: import("./types/quality").QualityComplaint[];
    }>("/api/v1/quality/records/pg03-r01"),

  getQualityComplaint: (id: string) =>
    request<import("./types/quality").QualityComplaint>(`/api/v1/quality/records/pg03-r01/${id}`),

  createQualityComplaint: (body: {
    partyName: string;
    description: string;
    receivedAt?: string;
    channel?: string;
    partyContact?: string;
    responsible?: string;
    evidenceFileId?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityComplaint>("/api/v1/quality/records/pg03-r01", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityComplaint: (
    id: string,
    body: {
      channel?: string;
      partyName?: string;
      partyContact?: string;
      description?: string;
      isValid?: boolean;
      validatedAt?: string;
      validationNotes?: string;
      investigation?: string;
      actions?: string;
      responsible?: string;
      communicatedAt?: string;
      closedAt?: string;
      linkedNonConformityId?: string;
      evidenceFileId?: string;
      notes?: string;
      status?: string;
    }
  ) =>
    request<import("./types/quality").QualityComplaint>(`/api/v1/quality/records/pg03-r01/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityComplaint: (id: string) =>
    request<import("./types/quality").QualityComplaint>(`/api/v1/quality/records/pg03-r01/${id}`, {
      method: "DELETE"
    }),

  listQualityPg07R01: () =>
    request<{
      code: string;
      title: string;
      recordKind?: string;
      generatedAtUtc: string;
      overdueOpen?: number;
      rows: import("./types/quality").QualityNonConformity[];
    }>("/api/v1/quality/records/pg07-r01"),

  getQualityNonConformity: (id: string) =>
    request<import("./types/quality").QualityNonConformity>(`/api/v1/quality/records/pg07-r01/${id}`),

  createQualityNonConformity: (body: {
    kind: string;
    description: string;
    detectedAt?: string;
    origin?: string;
    immediateAction?: string;
    impactOnPreviousResults?: boolean;
    customerNotified?: boolean;
    responsible?: string;
    dueDate?: string;
    probability?: number;
    impact?: number;
    controls?: string;
    sourceComplaintId?: string;
    evidenceFileId?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityNonConformity>("/api/v1/quality/records/pg07-r01", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityNonConformity: (
    id: string,
    body: {
      kind?: string;
      origin?: string;
      detectedAt?: string;
      description?: string;
      immediateAction?: string;
      impactOnPreviousResults?: boolean;
      customerNotified?: boolean;
      rootCauseMethod?: string;
      rootCause?: string;
      correctiveAction?: string;
      responsible?: string;
      dueDate?: string;
      newDueDate?: string;
      effectivenessCheck?: string;
      effectivenessResult?: string;
      closedAt?: string;
      status?: string;
      probability?: number;
      impact?: number;
      controls?: string;
      residualLevel?: number;
      evidenceFileId?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityNonConformity>(`/api/v1/quality/records/pg07-r01/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityNonConformity: (id: string) =>
    request<import("./types/quality").QualityNonConformity>(`/api/v1/quality/records/pg07-r01/${id}`, {
      method: "DELETE"
    }),

  listQualityPg04: () =>
    request<{
      code: string;
      title: string;
      recordKind?: string;
      generatedAtUtc: string;
      openCount?: number;
      rows: import("./types/quality").QualityInternalAudit[];
    }>("/api/v1/quality/records/pg04"),

  getQualityInternalAudit: (id: string) =>
    request<import("./types/quality").QualityInternalAudit>(`/api/v1/quality/records/pg04/${id}`),

  createQualityInternalAudit: (body: {
    programYear: number;
    plannedDate?: string;
    scope: string;
    clauses?: string;
    auditor: string;
    auditee?: string;
    objectives?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityInternalAudit>("/api/v1/quality/records/pg04", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityInternalAudit: (
    id: string,
    body: {
      programYear?: number;
      plannedDate?: string;
      executedDate?: string;
      scope?: string;
      clauses?: string;
      auditor?: string;
      auditee?: string;
      objectives?: string;
      findingsSummary?: string;
      conclusions?: string;
      recommendations?: string;
      checklistNotes?: string;
      planFileId?: string;
      reportFileId?: string;
      checklistFileId?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityInternalAudit>(`/api/v1/quality/records/pg04/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityInternalAudit: (id: string) =>
    request<import("./types/quality").QualityInternalAudit>(`/api/v1/quality/records/pg04/${id}`, {
      method: "DELETE"
    }),

  getQualityPg06Summary: () =>
    request<import("./types/quality").QualityPg06Summary>("/api/v1/quality/records/pg06"),

  listQualityPg06R01: () =>
    request<{
      code: string;
      title: string;
      openCount?: number;
      rows: import("./types/quality").QualityTrainingPlanItem[];
    }>("/api/v1/quality/records/pg06/r01"),

  createQualityTraining: (body: {
    programYear: number;
    topic: string;
    plannedDate?: string;
    targetRoles?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityTrainingPlanItem>("/api/v1/quality/records/pg06/r01", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityTraining: (
    id: string,
    body: {
      programYear?: number;
      topic?: string;
      targetRoles?: string;
      plannedDate?: string;
      doneDate?: string;
      effectivenessCheck?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityTrainingPlanItem>(`/api/v1/quality/records/pg06/r01/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityTraining: (id: string) =>
    request<import("./types/quality").QualityTrainingPlanItem>(`/api/v1/quality/records/pg06/r01/${id}`, {
      method: "DELETE"
    }),

  listQualityPg06R02: () =>
    request<{
      code: string;
      title: string;
      rows: import("./types/quality").QualityPersonnelAuthorization[];
    }>("/api/v1/quality/records/pg06/r02"),

  getQualityPersonnelAuthorization: (id: string) =>
    request<import("./types/quality").QualityPersonnelAuthorization>(`/api/v1/quality/records/pg06/r02/${id}`),

  createQualityPersonnelAuthorization: (body: {
    userId: string;
    personName: string;
    methodDocumentCode: string;
    methodTitle?: string;
    trainingEvidence?: string;
    supervisedBy?: string;
    validUntil?: string;
    evidenceFileId?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityPersonnelAuthorization>("/api/v1/quality/records/pg06/r02", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityPersonnelAuthorization: (
    id: string,
    body: {
      personName?: string;
      methodDocumentCode?: string;
      methodTitle?: string;
      trainingEvidence?: string;
      supervisedBy?: string;
      validUntil?: string;
      evidenceFileId?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityPersonnelAuthorization>(`/api/v1/quality/records/pg06/r02/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  authorizeQualityPersonnel: (
    id: string,
    body?: { authorizedAt?: string; validUntil?: string; notes?: string }
  ) =>
    request<import("./types/quality").QualityPersonnelAuthorization>(
      `/api/v1/quality/records/pg06/r02/${id}/authorize`,
      { method: "POST", body: JSON.stringify(body || {}) }
    ),

  cancelQualityPersonnelAuthorization: (id: string) =>
    request<import("./types/quality").QualityPersonnelAuthorization>(`/api/v1/quality/records/pg06/r02/${id}`, {
      method: "DELETE"
    }),

  listQualityPg06R03: () =>
    request<{
      code: string;
      title: string;
      rows: import("./types/quality").QualityCompetenceReview[];
    }>("/api/v1/quality/records/pg06/r03"),

  createQualityCompetenceReview: (body: {
    userId: string;
    personName: string;
    reviewYear: number;
    evaluator?: string;
    technicalScore?: number;
    personalScore?: number;
    conclusions?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityCompetenceReview>("/api/v1/quality/records/pg06/r03", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityCompetenceReview: (
    id: string,
    body: {
      personName?: string;
      reviewYear?: number;
      evaluator?: string;
      technicalScore?: number;
      personalScore?: number;
      conclusions?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityCompetenceReview>(`/api/v1/quality/records/pg06/r03/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityCompetenceReview: (id: string) =>
    request<import("./types/quality").QualityCompetenceReview>(`/api/v1/quality/records/pg06/r03/${id}`, {
      method: "DELETE"
    }),

  listQualityPg06R04: () =>
    request<{
      code: string;
      title: string;
      rows: import("./types/quality").QualityRoleAssignment[];
    }>("/api/v1/quality/records/pg06/r04"),

  createQualityRoleAssignment: (body: {
    role: string;
    userId: string;
    personName: string;
    since?: string;
    substituteUserId?: string;
    substituteName?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityRoleAssignment>("/api/v1/quality/records/pg06/r04", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityRoleAssignment: (
    id: string,
    body: {
      role?: string;
      personName?: string;
      substituteUserId?: string;
      substituteName?: string;
      since?: string;
      until?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityRoleAssignment>(`/api/v1/quality/records/pg06/r04/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityRoleAssignment: (id: string) =>
    request<import("./types/quality").QualityRoleAssignment>(`/api/v1/quality/records/pg06/r04/${id}`, {
      method: "DELETE"
    }),

  getQualityPg05Summary: () =>
    request<import("./types/quality").QualityPg05Summary>("/api/v1/quality/records/pg05"),

  listQualityPg05R01: () =>
    request<{
      code: string;
      title: string;
      draftCount?: number;
      approvedCount?: number;
      rows: import("./types/quality").QualitySupplierEvaluation[];
    }>("/api/v1/quality/records/pg05/r01"),

  getQualitySupplierEvaluation: (id: string) =>
    request<import("./types/quality").QualitySupplierEvaluation>(`/api/v1/quality/records/pg05/r01/${id}`),

  createQualityPg05R01: (body: {
    supplierId: string;
    supplierName: string;
    supplierDocument?: string;
    serviceScope?: string;
    evaluatedAt?: string;
    score?: number;
    criteriaNotes?: string;
    strengths?: string;
    weaknesses?: string;
    validUntil?: string;
    evidenceFileId?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualitySupplierEvaluation>("/api/v1/quality/records/pg05/r01", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityPg05R01: (
    id: string,
    body: {
      supplierName?: string;
      supplierDocument?: string;
      serviceScope?: string;
      evaluatedAt?: string;
      score?: number;
      criteriaNotes?: string;
      strengths?: string;
      weaknesses?: string;
      approvedBy?: string;
      approvedAt?: string;
      validUntil?: string;
      evidenceFileId?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualitySupplierEvaluation>(`/api/v1/quality/records/pg05/r01/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityPg05R01: (id: string) =>
    request<import("./types/quality").QualitySupplierEvaluation>(`/api/v1/quality/records/pg05/r01/${id}`, {
      method: "DELETE"
    }),

  listQualityPg05R02: () =>
    request<{
      code: string;
      title: string;
      rows: import("./types/quality").QualityEnabledSupplierRow[];
    }>("/api/v1/quality/records/pg05/r02"),

  listQualityPg05R03: () =>
    request<{
      code: string;
      title: string;
      draftCount?: number;
      rows: import("./types/quality").QualitySupplierPerformanceReview[];
    }>("/api/v1/quality/records/pg05/r03"),

  createQualityPg05R03: (body: {
    supplierId: string;
    supplierName: string;
    evaluationId?: string;
    period?: string;
    reviewDate?: string;
    score?: number;
    qualityScore?: number;
    deliveryScore?: number;
    serviceScore?: number;
    comments?: string;
    reviewedBy?: string;
    evidenceFileId?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualitySupplierPerformanceReview>("/api/v1/quality/records/pg05/r03", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityPg05R03: (
    id: string,
    body: {
      supplierName?: string;
      evaluationId?: string;
      period?: string;
      reviewDate?: string;
      score?: number;
      qualityScore?: number;
      deliveryScore?: number;
      serviceScore?: number;
      comments?: string;
      reviewedBy?: string;
      evidenceFileId?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualitySupplierPerformanceReview>(`/api/v1/quality/records/pg05/r03/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityPg05R03: (id: string) =>
    request<import("./types/quality").QualitySupplierPerformanceReview>(`/api/v1/quality/records/pg05/r03/${id}`, {
      method: "DELETE"
    }),

  listQualityPg08R01: () =>
    request<{
      code: string;
      title: string;
      draftCount?: number;
      completedCount?: number;
      rows: import("./types/quality").QualityManagementReview[];
    }>("/api/v1/quality/records/pg08-r01"),

  getQualityManagementReview: (id: string) =>
    request<import("./types/quality").QualityManagementReview>(`/api/v1/quality/records/pg08-r01/${id}`),

  createQualityManagementReview: (body: {
    programYear: number;
    reviewDate?: string;
    attendees?: string;
    inputsNotes?: string;
    decisions?: string;
    actions?: string;
    followUp?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityManagementReview>("/api/v1/quality/records/pg08-r01", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityManagementReview: (
    id: string,
    body: {
      programYear?: number;
      reviewDate?: string;
      attendees?: string;
      inputsNotes?: string;
      decisions?: string;
      actions?: string;
      followUp?: string;
      evidenceFileId?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityManagementReview>(`/api/v1/quality/records/pg08-r01/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  refreshQualityManagementReviewInputs: (id: string) =>
    request<import("./types/quality").QualityManagementReview>(
      `/api/v1/quality/records/pg08-r01/${id}/refresh-inputs`,
      { method: "POST" }
    ),

  cancelQualityManagementReview: (id: string) =>
    request<import("./types/quality").QualityManagementReview>(`/api/v1/quality/records/pg08-r01/${id}`, {
      method: "DELETE"
    }),

  listQualityPg09R03: () =>
    request<{
      code: string;
      title: string;
      draftCount?: number;
      receivedCount?: number;
      averageOverall?: number | null;
      rows: import("./types/quality").QualitySatisfactionSurvey[];
    }>("/api/v1/quality/records/pg09-r03"),

  getQualitySatisfactionSurvey: (id: string) =>
    request<import("./types/quality").QualitySatisfactionSurvey>(`/api/v1/quality/records/pg09-r03/${id}`),

  createQualitySatisfactionSurvey: (body: {
    customerName: string;
    surveyDate?: string;
    calibrationReportId?: string;
    certificateNumber?: string;
    customerId?: string;
    channel?: string;
    scorePunctuality?: number | null;
    scoreQuality?: number | null;
    scoreCommunication?: number | null;
    scoreOverall?: number | null;
    comments?: string;
    answersJson?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualitySatisfactionSurvey>("/api/v1/quality/records/pg09-r03", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualitySatisfactionSurvey: (
    id: string,
    body: {
      customerName?: string;
      surveyDate?: string;
      calibrationReportId?: string | null;
      certificateNumber?: string;
      customerId?: string | null;
      channel?: string;
      scorePunctuality?: number | null;
      scoreQuality?: number | null;
      scoreCommunication?: number | null;
      scoreOverall?: number | null;
      comments?: string;
      answersJson?: string;
      evidenceFileId?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualitySatisfactionSurvey>(`/api/v1/quality/records/pg09-r03/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualitySatisfactionSurvey: (id: string) =>
    request<import("./types/quality").QualitySatisfactionSurvey>(`/api/v1/quality/records/pg09-r03/${id}`, {
      method: "DELETE"
    }),

  getQualityPg14Summary: () =>
    request<import("./types/quality").QualityPg14Summary>("/api/v1/quality/records/pg14"),

  listQualityPg14R04: () =>
    request<import("./types/quality").QualityPg14R04Response>("/api/v1/quality/records/pg14-r04"),

  listQualityPg14R03: () =>
    request<import("./types/quality").QualityPg14R03Response>("/api/v1/quality/records/pg14-r03"),

  listQualityEquipment: () =>
    request<{
      code: string;
      title: string;
      rows: import("./types/quality").QualityEquipment[];
    }>("/api/v1/quality/records/pg14/equipment"),

  getQualityEquipment: (id: string) =>
    request<import("./types/quality").QualityEquipment>(`/api/v1/quality/records/pg14/equipment/${id}`),

  createQualityEquipment: (body: {
    kind: string;
    code?: string;
    description?: string;
    brand?: string;
    model?: string;
    serialNumber?: string;
    plate?: string;
    parentEquipmentId?: string;
    fleetVehicleId?: string;
    location?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityEquipment>("/api/v1/quality/records/pg14/equipment", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityEquipment: (
    id: string,
    body: {
      kind?: string;
      description?: string;
      brand?: string;
      model?: string;
      serialNumber?: string;
      plate?: string;
      parentEquipmentId?: string | null;
      fleetVehicleId?: string | null;
      location?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityEquipment>(`/api/v1/quality/records/pg14/equipment/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  retireQualityEquipment: (id: string) =>
    request<import("./types/quality").QualityEquipment>(`/api/v1/quality/records/pg14/equipment/${id}`, {
      method: "DELETE"
    }),

  listQualityPg14R05: () =>
    request<{
      code: string;
      title: string;
      draftCount?: number;
      completedCount?: number;
      rows: import("./types/quality").QualityIntermediateCheck[];
    }>("/api/v1/quality/records/pg14/r05"),

  getQualityIntermediateCheck: (id: string) =>
    request<import("./types/quality").QualityIntermediateCheck>(`/api/v1/quality/records/pg14/r05/${id}`),

  createQualityIntermediateCheck: (body: {
    checkDate?: string;
    weightUsed?: string;
    instrument?: string;
    equipmentId?: string;
    readings?: string;
    result?: string;
    responsible?: string;
    evidenceFileId?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityIntermediateCheck>("/api/v1/quality/records/pg14/r05", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityIntermediateCheck: (
    id: string,
    body: {
      checkDate?: string;
      weightUsed?: string;
      instrument?: string;
      equipmentId?: string | null;
      readings?: string;
      result?: string;
      responsible?: string;
      evidenceFileId?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityIntermediateCheck>(`/api/v1/quality/records/pg14/r05/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityIntermediateCheck: (id: string) =>
    request<import("./types/quality").QualityIntermediateCheck>(`/api/v1/quality/records/pg14/r05/${id}`, {
      method: "DELETE"
    }),

  listQualityPg14R06: () =>
    request<{
      code: string;
      title: string;
      activeCount?: number;
      overdueCount?: number;
      rows: import("./types/quality").QualityMaintenancePlanItem[];
    }>("/api/v1/quality/records/pg14/r06"),

  getQualityMaintenancePlanItem: (id: string) =>
    request<import("./types/quality").QualityMaintenancePlanItem>(`/api/v1/quality/records/pg14/r06/${id}`),

  createQualityMaintenancePlanItem: (body: {
    equipmentId: string;
    activity: string;
    frequency?: string;
    nextDue?: string;
    responsible?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityMaintenancePlanItem>("/api/v1/quality/records/pg14/r06", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityMaintenancePlanItem: (
    id: string,
    body: {
      activity?: string;
      frequency?: string;
      nextDue?: string | null;
      lastDone?: string | null;
      responsible?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityMaintenancePlanItem>(`/api/v1/quality/records/pg14/r06/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityMaintenancePlanItem: (id: string) =>
    request<import("./types/quality").QualityMaintenancePlanItem>(`/api/v1/quality/records/pg14/r06/${id}`, {
      method: "DELETE"
    }),

  listQualityEquipmentLogEntries: (params?: { assetSource?: string; assetId?: string }) => {
    const q = new URLSearchParams();
    if (params?.assetSource) q.set("assetSource", params.assetSource);
    if (params?.assetId) q.set("assetId", params.assetId);
    const qs = q.toString();
    return request<import("./types/quality").QualityEquipmentLogListResponse>(
      `/api/v1/quality/records/pg14/r01${qs ? `?${qs}` : ""}`
    );
  },

  getQualityEquipmentLogEntry: (id: string) =>
    request<import("./types/quality").QualityEquipmentLogEntry>(`/api/v1/quality/records/pg14/r01/${id}`),

  createQualityEquipmentLogEntry: (body: {
    assetSource: string;
    assetId: string;
    kind: string;
    eventDate?: string;
    assetCode?: string;
    assetDescription?: string;
    description?: string;
    certificateNumber?: string;
    verdict?: string;
    approvedByTechnicalDirector?: boolean;
    responsible?: string;
    evidenceFileId?: string;
    notes?: string;
  }) =>
    request<import("./types/quality").QualityEquipmentLogEntry>("/api/v1/quality/records/pg14/r01", {
      method: "POST",
      body: JSON.stringify(body)
    }),

  updateQualityEquipmentLogEntry: (
    id: string,
    body: {
      eventDate?: string;
      kind?: string;
      description?: string;
      certificateNumber?: string;
      verdict?: string;
      approvedByTechnicalDirector?: boolean;
      responsible?: string;
      evidenceFileId?: string;
      status?: string;
      notes?: string;
    }
  ) =>
    request<import("./types/quality").QualityEquipmentLogEntry>(`/api/v1/quality/records/pg14/r01/${id}`, {
      method: "PUT",
      body: JSON.stringify(body)
    }),

  cancelQualityEquipmentLogEntry: (id: string) =>
    request<import("./types/quality").QualityEquipmentLogEntry>(`/api/v1/quality/records/pg14/r01/${id}`, {
      method: "DELETE"
    }),

  syncQualityEquipmentLogCalibrations: () =>
    request<{ created: number; skipped: number }>("/api/v1/quality/records/pg14/r01/sync-calibrations", {
      method: "POST"
    }),

  uploadQualityFile: async (file: File, role: "Published" | "Source" = "Published") => {
    const form = new FormData();
    form.append("file", file);
    form.append("role", role);
    const normalToken = typeof window !== "undefined" ? localStorage.getItem("leal_token") : null;
    const tenantId = typeof window !== "undefined" ? localStorage.getItem("leal_tenant_id") : null;
    const headers: Record<string, string> = {};
    if (normalToken) headers.Authorization = `Bearer ${normalToken}`;
    if (tenantId) headers["X-Tenant-Id"] = tenantId;
    const response = await fetch("/api/v1/quality/files", { method: "POST", headers, body: form });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Error (${response.status})`);
    }
    return response.json() as Promise<{ id: string; fileName: string; role: string; sha256: string }>;
  },

  attachQualityFile: (code: string, version: number, body: { fileId: string; role?: "Published" | "Source" }) =>
    request<import("./types/quality").QualityDocumentDetail["versions"][number]>(
      `/api/v1/quality/documents/${encodeURIComponent(code)}/versions/${version}/attach`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  updateQualityVersion: (
    code: string,
    version: number,
    body: {
      changeSummary?: string;
      elaboratedBy?: string;
      elaboratedAt?: string;
      reviewedBy?: string;
      reviewedAt?: string;
      approvedBy?: string;
      approvedAt?: string;
      effectiveFrom?: string;
    }
  ) =>
    request<import("./types/quality").QualityDocumentDetail["versions"][number]>(
      `/api/v1/quality/documents/${encodeURIComponent(code)}/versions/${version}`,
      { method: "PATCH", body: JSON.stringify(body) }
    ),

  createQualityVersion: (
    code: string,
    body: {
      changeSummary?: string;
      elaboratedBy?: string;
      elaboratedAt?: string;
      publishedFileId?: string;
      sourceFileId?: string;
    }
  ) =>
    request<import("./types/quality").QualityDocumentDetail["versions"][number]>(
      `/api/v1/quality/documents/${encodeURIComponent(code)}/versions`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  approveQualityVersion: (
    code: string,
    version: number,
    body?: { approvedBy?: string; approvedAt?: string; reviewedBy?: string }
  ) =>
    request<import("./types/quality").QualityDocumentDetail["versions"][number]>(
      `/api/v1/quality/documents/${encodeURIComponent(code)}/versions/${version}/approve`,
      { method: "POST", body: JSON.stringify(body ?? {}) }
    ),

  /** URL cruda (sin auth). Preferir downloadQualityFile para navegador. */
  downloadQualityFileUrl: (id: string) => `/api/v1/quality/files/${id}`,

  downloadQualityFile: async (id: string): Promise<{ blob: Blob; fileName: string }> => {
    const normalToken = typeof window !== "undefined" ? localStorage.getItem("leal_token") : null;
    const tenantId = typeof window !== "undefined" ? localStorage.getItem("leal_tenant_id") : null;
    const headers: Record<string, string> = {};
    if (normalToken) headers.Authorization = `Bearer ${normalToken}`;
    if (tenantId) headers["X-Tenant-Id"] = tenantId;
    const response = await fetch(`/api/v1/quality/files/${id}`, { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Error al descargar (${response.status})`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
    const fileName = match ? decodeURIComponent(match[1].replace(/"/g, "")) : `quality-${id}`;
    return { blob, fileName };
  },

  openQualityFile: async (id: string, mode: "open" | "download" = "open") => {
    const { blob, fileName } = await api.downloadQualityFile(id);
    const url = URL.createObjectURL(blob);
    if (mode === "download") {
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
};

