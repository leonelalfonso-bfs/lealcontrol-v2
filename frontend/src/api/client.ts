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
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    },
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
  createFinanceAccount: (body: { name: string; currency: string; type: string; openingBalance: number }) => request("/api/v1/finance/accounts", { method: "POST", body: JSON.stringify(body) }),
  previewFinanceBankImport: (accountId: string, csvContent: string) => request<{ operationDateUtc: string; amount: number; kind: string; description: string; externalReference?: string; error?: string }[]>("/api/v1/finance/imports/bank/preview", { method: "POST", body: JSON.stringify({ accountId, csvContent }) }),
  confirmFinanceBankImport: (accountId: string, csvContent: string) => request<{ imported: number; duplicates: number; rejected: number }>("/api/v1/finance/imports/bank/confirm", { method: "POST", body: JSON.stringify({ accountId, csvContent }) }),
  listFinanceMovements: (accountId: string) => request<{ id: string; operationDateUtc: string; kind: string; amount: number; currency: string; description: string; externalReference?: string; transferId?: string; reconciliationStatus: number; linkedEntityType?: string; linkedEntityId?: string }[]>(`/api/v1/finance/accounts/${accountId}/movements`),
  listFinanceMovementDetails: (accountId: string) => request<{ id: string; operationDateUtc: string; description: string; externalReference?: string; kind: string; amount: number; currency: string; reportedBalance?: number; systemBalance: number; difference?: number; reconciliationStatus: string; stage?: string }[]>(`/api/v1/finance/accounts/${accountId}/movements-detail`),
  reconcileFinanceMovement: (movementId: string, body: { entityType: string; entityId: string }) => request(`/api/v1/finance/movements/${movementId}/reconcile`, { method: "POST", body: JSON.stringify(body) }),
  listReceivedCheques: () => request<any[]>("/api/v1/finance/echeqs"),
  importReceivedCheques: (csvContent: string) => request<{ imported: number; duplicates: number }>("/api/v1/finance/echeqs/import", { method: "POST", body: JSON.stringify({ csvContent }) }),
  importIssuedCheques: (csvContent: string) => request<{ imported: number; duplicates: number }>("/api/v1/finance/echeqs/import-issued", { method: "POST", body: JSON.stringify({ csvContent }) }),
  createReceivedCheque: (body: any) => request("/api/v1/finance/echeqs", { method: "POST", body: JSON.stringify(body) }),
  useChequeForPayment: (id: string, reference: string) => request(`/api/v1/finance/echeqs/${id}/use-for-payment`, { method: "POST", body: JSON.stringify({ reference }) }),
  listCollectionReceipts: () => request<{ id: string; receiptNumber: string; amount: number; currency: string; receiptDateUtc: string; description: string; status: string }[]>("/api/v1/finance/collections"),
  createCollectionReceipt: (body: { accountId: string; customerId?: string; invoiceId?: string; movementId?: string; chequeId?: string; amount: number; currency: string; invoiceAmount?: number; invoiceCurrency?: string; invoiceExchangeRate?: number; paymentExchangeRate?: number; suggestedAdjustmentArs?: number; suggestedAdjustmentType?: string; receiptDateUtc: string; description: string }) => request("/api/v1/finance/collections", { method: "POST", body: JSON.stringify(body) }),
  listCustomers: (search = "") =>
    request<Paged<CustomerSummary>>(`/api/v1/crm/customers?page=1&pageSize=50&search=${encodeURIComponent(search)}`),
  getCustomer: (id: string) => request<CustomerDetail>(`/api/v1/crm/customers/${id}`),
  createCustomer: (body: CustomerWrite) =>
    request<CustomerDetail>("/api/v1/crm/customers", { method: "POST", body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: CustomerWrite) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
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
    request<Opportunity>(`/api/v1/crm/opportunities/${id}/stage`, {
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
    request<Opportunity>(`/api/v1/crm/opportunities/${id}/win`, { method: "POST" }),
  markLost: (id: string, reason?: string) =>
    request<Opportunity>(`/api/v1/crm/opportunities/${id}/loss-reason`, {
      method: "POST",
      body: JSON.stringify({ reason })
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

  // Company Settings & Users Methods
  getCompanySettings: () => request<import("./types").CompanySettings>("/api/v1/company/settings"),
  updateCompanySettings: (body: import("./types").CompanySettings) =>
    request<import("./types").CompanySettings>("/api/v1/company/settings", { method: "PUT", body: JSON.stringify(body) }),
  uploadArcaCertificate: (body: { certificateCrt: string; certificateKey: string; environment: string; signerCuit: string }) =>
    request<import("./types").CompanySettings>("/api/v1/company/settings/arca-certificate", { method: "POST", body: JSON.stringify(body) }),
  listTenantUsers: () => request<import("./types").TenantUser[]>("/api/v1/company/users"),
  createTenantUser: (body: { fullName: string; email: string; role: string }) =>
    request<import("./types").TenantUser>("/api/v1/company/users", { method: "POST", body: JSON.stringify(body) }),

  // Suppliers Methods
  listSuppliers: (search = "") => request<import("./types").Supplier[]>(`/api/v1/crm/suppliers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  getSupplier: (id: string) => request<import("./types").Supplier>(`/api/v1/crm/suppliers/${id}`),
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
    request<import("./types").PurchaseRequest>(`/api/v1/purchases/requests/${requestId}/quotations/${quotationId}`, { method: "DELETE" })
};
