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

const API_BASE = "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const normalToken = typeof window !== "undefined" ? localStorage.getItem("leal_token") : null;
  const superToken = typeof window !== "undefined" ? localStorage.getItem("leal_superadmin_token") : null;
  const token = normalToken || superToken;
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

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `Error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.detail || parsed.title || parsed.message || message;
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
  listFinanceAccounts: () => request<{ id: string; name: string; currency: string; type: string; balance: number; isActive: boolean }[]>("/api/v1/finance/accounts"),
  listFinanceConcepts: () => request<any[]>("/api/v1/finance/concepts"),
  createFinanceConcept: (body: object) => request("/api/v1/finance/concepts", { method: "POST", body: JSON.stringify(body) }),
  updateFinanceConcept: (id: string, body: object) => request(`/api/v1/finance/concepts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  listFinanceConceptRules: () => request<any[]>("/api/v1/finance/concept-rules"),
  createFinanceConceptRule: (body: object) => request("/api/v1/finance/concept-rules", { method: "POST", body: JSON.stringify(body) }),
  applyFinanceConceptRules: () => request<{ processed: number; suggested: number; pending: number }>("/api/v1/finance/concept-rules/apply", { method: "POST" }),
  listFinanceMovementsForReview: () => request<any[]>("/api/v1/finance/movements/review"),
  classifyFinanceMovement: (id: string, body: object) => request(`/api/v1/finance/movements/${id}/classification`, { method: "POST", body: JSON.stringify(body) }),
  createFinanceAccount: (body: { name: string; currency: string; type: string; openingBalance: number }) => request("/api/v1/finance/accounts", { method: "POST", body: JSON.stringify(body) }),
  previewFinanceBankImport: (accountId: string, csvContent: string) => request<{ operationDateUtc: string; amount: number; kind: string; description: string; externalReference?: string; error?: string }[]>("/api/v1/finance/imports/bank/preview", { method: "POST", body: JSON.stringify({ accountId, csvContent }) }),
  confirmFinanceBankImport: (accountId: string, csvContent: string) => request<{ imported: number; duplicates: number; rejected: number }>("/api/v1/finance/imports/bank/confirm", { method: "POST", body: JSON.stringify({ accountId, csvContent }) }),
  listFinanceMovements: (accountId: string) => request<{ id: string; operationDateUtc: string; kind: string; amount: number; currency: string; description: string; externalReference?: string; transferId?: string; reconciliationStatus: number; linkedEntityType?: string; linkedEntityId?: string }[]>(`/api/v1/finance/accounts/${accountId}/movements`),
  listCollectionAvailableMovements: (accountId: string) => request<any[]>(`/api/v1/finance/collections/available-movements?accountId=${encodeURIComponent(accountId)}`),
  listFinanceMovementDetails: (accountId: string) => request<{ id: string; operationDateUtc: string; description: string; externalReference?: string; kind: string; amount: number; currency: string; reportedBalance?: number; systemBalance: number; difference?: number; reconciliationStatus: string; stage?: string }[]>(`/api/v1/finance/accounts/${accountId}/movements-detail`),
  reconcileFinanceMovement: (movementId: string, body: { entityType: string; entityId: string }) => request(`/api/v1/finance/movements/${movementId}/reconcile`, { method: "POST", body: JSON.stringify(body) }),
  listReceivedCheques: () => request<any[]>("/api/v1/finance/echeqs"),
  importReceivedCheques: (csvContent: string) => request<{ imported: number; duplicates: number }>("/api/v1/finance/echeqs/import", { method: "POST", body: JSON.stringify({ csvContent }) }),
  importIssuedCheques: (csvContent: string) => request<{ imported: number; duplicates: number }>("/api/v1/finance/echeqs/import-issued", { method: "POST", body: JSON.stringify({ csvContent }) }),
  createReceivedCheque: (body: any) => request("/api/v1/finance/echeqs", { method: "POST", body: JSON.stringify(body) }),
  useChequeForPayment: (id: string, reference: string) => request(`/api/v1/finance/echeqs/${id}/use-for-payment`, { method: "POST", body: JSON.stringify({ reference }) }),
  listCollectionReceipts: () => request<{ id: string; customerId?: string; accountId?: string; invoiceId?: string; receiptNumber: string; amount: number; currency: string; receiptDateUtc: string; description: string; status: string; linesCount?: number; invoicesCount?: number; invoicesSummary?: string }[]>("/api/v1/finance/collections"),
  getCollectionReceipt: (id: string) => request<any>(`/api/v1/finance/collections/${id}`),
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
    lines?: any[];
    imputations?: any[];
  }) => request<{ id: string; receiptNumber: string; status: string }>("/api/v1/finance/collections", { method: "POST", body: JSON.stringify(body) }),
  listPaymentOrders: () => request<import("./types").PaymentOrder[]>("/api/v1/finance/payments"),
  getPaymentOrder: (id: string) => request<import("./types").PaymentOrder>(`/api/v1/finance/payments/${id}`),
  createPaymentOrder: (body: import("./types").PaymentOrderWriteRequest) => request<{ id: string; orderNumber: string; status: string }>("/api/v1/finance/payments", { method: "POST", body: JSON.stringify(body) }),
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
  deleteEmail: (id: string) => request<void>(`/api/v1/communications/messages/${id}`, { method: "DELETE" }),
  sendEmail: (accountId: string, body: object) => request<{id:string;messageId:string}>(`/api/v1/communications/accounts/${accountId}/send`, { method:"POST", body:JSON.stringify(body) }),

  // WhatsApp Gateway Methods
  getWhatsAppStatus: () => request<{ available: boolean; state: string; phoneNumber?: string; error?: string }>("/api/v1/communications/whatsapp/status"),
  connectWhatsApp: () => request<{ success: boolean; state: string; qrCodeBase64?: string; error?: string }>("/api/v1/communications/whatsapp/connect", { method: "POST" }),
  disconnectWhatsApp: () => request<{ success: boolean }>("/api/v1/communications/whatsapp/disconnect", { method: "POST" }),
  syncWhatsAppMessages: () => request<{ synced: number }>("/api/v1/communications/whatsapp/sync", { method: "POST" }),
  sendWhatsAppMessage: (body: { to: string; message: string; mediaUrl?: string; mediaType?: string; fileName?: string; relatedEntityType?: string; relatedEntityId?: string }) =>
    request<{ success: boolean; messageId?: string; error?: string }>("/api/v1/communications/whatsapp/send", { method: "POST", body: JSON.stringify(body) }),

  // Meta (Instagram & Facebook) Methods
  getMetaStatus: () =>
    request<{
      facebook: { isConnected: boolean; pageId?: string; pageName?: string; verifyToken: string; connectedAtUtc?: string };
      instagram: { isConnected: boolean; pageId?: string; pageName?: string; instagramAccountId?: string; instagramUsername?: string; verifyToken: string; connectedAtUtc?: string };
    }>("/api/v1/communications/meta/status"),
  configureMeta: (body: { channelType: "facebook" | "instagram"; pageAccessToken: string }) =>
    request<{ success: boolean; pageId?: string; pageName?: string; instagramAccountId?: string; instagramUsername?: string; error?: string }>("/api/v1/communications/meta/config", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  disconnectMeta: (channelType: "facebook" | "instagram") =>
    request<{ success: boolean }>("/api/v1/communications/meta/disconnect", { method: "POST", body: JSON.stringify({ channelType }) }),
  syncMetaMessages: () => request<{ synced: number }>("/api/v1/communications/meta/sync", { method: "POST" }),
  sendMetaMessage: (body: { channelType: "facebook" | "instagram"; recipientId: string; message: string; relatedEntityType?: string; relatedEntityId?: string }) =>
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
    if (status) params.append("status", status);
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
  // HUMAN RESOURCES (RRHH & LIQUIDACIÓN)
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
  // FLEET (GESTIÓN DE FLOTA)
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

  // Accounting Module
  listAccounts: () =>
    request<any[]>("/api/v1/accounting/accounts"),
  createAccount: (body: { code: string; name: string; accountType?: string; level: number; parentCode?: string; isDirectPosting: boolean; currency?: string; adjustsForInflation?: boolean }) =>
    request<any>("/api/v1/accounting/accounts", { method: "POST", body: JSON.stringify(body) }),
  updateAccount: (id: string, body: { code?: string; name: string; accountType?: string; level?: number; parentCode?: string; isDirectPosting: boolean; currency?: string; adjustsForInflation: boolean; isActive: boolean }) =>
    request<any>(`/api/v1/accounting/accounts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAccount: (id: string) =>
    request<any>(`/api/v1/accounting/accounts/${id}`, { method: "DELETE" }),

  // Accounting Mapping (Matriz de Enlace Contable)
  getAccountingMapping: () =>
    request<any>("/api/v1/accounting/mapping"),
  updateAccountingMapping: (body: any) =>
    request<any>("/api/v1/accounting/mapping", { method: "PUT", body: JSON.stringify(body) }),

  listJournalEntries: (params?: { startDate?: string; endDate?: string; sourceModule?: string }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", params.startDate);
    if (params?.endDate) q.set("endDate", params.endDate);
    if (params?.sourceModule) q.set("sourceModule", params.sourceModule);
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<any[]>(`/api/v1/accounting/journal-entries${query}`);
  },
  createJournalEntry: (body: { date: string; concept: string; entryType?: string; sourceModule?: string; sourceDocumentId?: string; createdBy?: string; lines: any[] }) =>
    request<any>("/api/v1/accounting/journal-entries", { method: "POST", body: JSON.stringify(body) }),
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
    return request<any[]>(`/api/v1/accounting/general-ledger${query}`);
  },
  getTrialBalance: (params?: { startDate?: string; endDate?: string }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", params.startDate);
    if (params?.endDate) q.set("endDate", params.endDate);
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<any>(`/api/v1/accounting/trial-balance${query}`);
  },
  getPnlStatement: (params?: { year?: number; month?: number }) => {
    const q = new URLSearchParams();
    if (params?.year) q.set("year", params.year.toString());
    if (params?.month) q.set("month", params.month.toString());
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<any>(`/api/v1/accounting/pnl-statement${query}`);
  },
  getIncomeStatement: (params?: { startDate?: string; endDate?: string; year?: number; month?: number }) => {
    const q = new URLSearchParams();
    if (params?.year) q.set("year", params.year.toString());
    if (params?.month) q.set("month", params.month.toString());
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<any>(`/api/v1/accounting/pnl-statement${query}`);
  },
  getCostCenterPnl: (year?: number) => {
    const q = year ? `?year=${year}` : "";
    return request<any>(`/api/v1/accounting/reports/cost-center-pnl${q}`);
  },
  runYearEndClosing: (body: { year: number; closingDate?: string }) =>
    request<any>("/api/v1/accounting/year-end-closing", { method: "POST", body: JSON.stringify(body) }),
  autoPostPayroll: (body: { date: string; periodDescription: string; totalGrossSalaries: number; totalEmployerContributions: number; totalNetSalaries: number; totalSocialSecurityToPay: number; costCenterId?: string }) =>
    request<any>("/api/v1/accounting/auto-post/payroll", { method: "POST", body: JSON.stringify(body) }),
  listCostCenters: () =>
    request<any[]>("/api/v1/accounting/cost-centers"),
  createCostCenter: (body: { code: string; name: string; category?: string }) =>
    request<any>("/api/v1/accounting/cost-centers", { method: "POST", body: JSON.stringify(body) }),
  listFiscalPeriods: () =>
    request<any[]>("/api/v1/accounting/periods"),
  lockFiscalPeriod: (body: { year: number; month: number; lock: boolean; user?: string }) =>
    request<any>("/api/v1/accounting/periods/lock", { method: "POST", body: JSON.stringify(body) }),

  // Auto-Posting Triggers
  autoPostInvoice: (body: { invoiceId: string; invoiceNumber: string; customerName: string; date: string; netAmount: number; vatAmount: number; totalAmount: number }) =>
    request<any>("/api/v1/accounting/auto-post/invoice", { method: "POST", body: JSON.stringify(body) }),
  autoPostPurchase: (body: { purchaseId: string; invoiceNumber: string; supplierName: string; date: string; netAmount: number; vatAmount: number; totalAmount: number }) =>
    request<any>("/api/v1/accounting/auto-post/purchase", { method: "POST", body: JSON.stringify(body) }),
  autoPostReceipt: (body: { receiptId: string; receiptNumber: string; customerName: string; date: string; amount: number; paymentMethod?: string }) =>
    request<any>("/api/v1/accounting/auto-post/receipt", { method: "POST", body: JSON.stringify(body) }),

  // Bank Reconciliation
  listBankStatements: () =>
    request<any[]>("/api/v1/accounting/bank-statements"),
  getBankStatement: (id: string) =>
    request<any>(`/api/v1/accounting/bank-statements/${id}`),
  uploadBankStatement: (body: { bankName?: string; accountNumber?: string; currency?: string; periodStartDate?: string; periodEndDate?: string; initialBalance?: number; finalBalance?: number; lines: any[] }) =>
    request<any>("/api/v1/accounting/bank-statements/upload", { method: "POST", body: JSON.stringify(body) }),
  autoMatchBankStatement: (id: string) =>
    request<{ message: string; totalReconciled: number; statementStatus: string }>(`/api/v1/accounting/bank-statements/${id}/auto-match`, { method: "POST" }),
  quickPostBankFee: (lineId: string, feeType: "BankFee" | "TaxLey25413") =>
    request<any>(`/api/v1/accounting/bank-statements/lines/${lineId}/quick-post`, { method: "POST", body: JSON.stringify({ feeType }) }),

  // ==========================================
  // ASIENTOS MODELOS (PLANTILLAS CONFIGURABLES) & CONTABILIZACIÓN EN LOTE
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

  listMetrologyEquipment: (params?: { search?: string; customerId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.customerId) q.set("customerId", params.customerId);
    if (params?.status) q.set("status", params.status);
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

  listCalibrationReports: (params?: { equipmentId?: string; customerId?: string }) => {
    const q = new URLSearchParams();
    if (params?.equipmentId) q.set("equipmentId", params.equipmentId);
    if (params?.customerId) q.set("customerId", params.customerId);
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<import("./types").CalibrationReport[]>(`/api/v1/metrology/reports${query}`);
  },
  getCalibrationReport: (id: string) =>
    request<{
      report: import("./types").CalibrationReport;
      equipment?: import("./types").MetrologyEquipment;
    }>(`/api/v1/metrology/reports/${id}`),
  saveCalibrationReport: (body: Record<string, unknown>) =>
    request<import("./types").CalibrationReport>("/api/v1/metrology/reports", { method: "POST", body: JSON.stringify(body) })
};
