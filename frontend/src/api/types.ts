export type CustomerSummary = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  documentType: string;
  documentNumber: string;
  taxCondition: string;
  status: string;
  isCustomer: boolean;
  isSupplier: boolean;
  email?: string | null;
  phone?: string | null;
};

export type Address = {
  street: string;
  city: string;
  province: string;
  postalCode: string;
};

export type Location = {
  id: string;
  name: string;
  address: Address;
  phone?: string | null;
  notes?: string | null;
};

export type Contact = {
  id: string;
  name: string;
  role: string;
  locationId?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsApp?: string | null;
  isPrimary: boolean;
  notes?: string | null;
};

export type FiscalRate = {
  jurisdiction: string;
  perceptionRate: number;
  retentionRate: number;
  hasPerceptionExclusion: boolean;
  perceptionExclusionExpiresOn?: string | null;
  hasRetentionExclusion: boolean;
  retentionExclusionExpiresOn?: string | null;
  exclusionCertificateNumber?: string | null;
};

export type Equipment = {
  id: string;
  internalCode: string;
  equipmentType: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  maxCapacity?: string | null;
  divisionScale?: string | null;
  locationId?: string | null;
  status: string;
  lastCalibrationDate?: string | null;
  nextCalibrationDueDate?: string | null;
  calibrationIntervalMonths?: number | null;
  notes?: string | null;
  customAttributes?: Record<string, string> | null;
};

export type EquipmentWrite = {
  internalCode: string;
  equipmentType: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  maxCapacity?: string | null;
  divisionScale?: string | null;
  locationId?: string | null;
  status: string;
  lastCalibrationDate?: string | null;
  nextCalibrationDueDate?: string | null;
  calibrationIntervalMonths?: number | null;
  notes?: string | null;
  customAttributes?: Record<string, string> | null;
};

export type CustomerDetail = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  documentType: string;
  documentNumber: string;
  taxCondition: string;
  iibbRegime: string;
  iibbNumber?: string | null;
  status: string;
  isCustomer: boolean;
  isSupplier: boolean;
  email?: string | null;
  phone?: string | null;
  whatsApp?: string | null;
  website?: string | null;
  notes?: string | null;
  creditLimit?: number | null;
  paymentTermsDays?: number | null;
  fiscalAddress?: Address | null;
  locations: Location[];
  contacts: Contact[];
  fiscalRates: FiscalRate[];
  equipments: Equipment[];
};

export type CustomerWrite = {
  legalName: string;
  tradeName?: string | null;
  documentType: string;
  documentNumber: string;
  taxCondition: string;
  iibbRegime: string;
  iibbNumber?: string | null;
  status?: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  email?: string | null;
  phone?: string | null;
  whatsApp?: string | null;
  website?: string | null;
  notes?: string | null;
  creditLimit?: number | null;
  paymentTermsDays?: number | null;
  fiscalAddress?: Address | null;
  fiscalStreet?: string | null;
  fiscalCity?: string | null;
  fiscalProvince?: string | null;
  fiscalPostalCode?: string | null;
};

export type Paged<T> = {
  items: T[];
  totalCount: number;
  total?: number;
  page: number;
  pageSize: number;
};

export type ArcaCuitResult = {
  cuit: string;
  legalName: string;
  tradeName?: string | null;
  taxCondition: string;
  iibbRegime: string;
  iibbNumber?: string | null;
  fiscalAddress?: Address | null;
  fiscalStreet?: string | null;
  fiscalCity?: string | null;
  fiscalProvince?: string | null;
  fiscalPostalCode?: string | null;
  isMonotributo: boolean;
  isExento: boolean;
};

export type Activity = {
  id: string;
  type: string;
  description: string;
  customerId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  occurredAtUtc: string;
  nextFollowUpOn?: string | null;
};

export type PipelineReport = {
  openCount: number;
  openAmount: number;
  wonCount: number;
  wonAmount: number;
  lostCount: number;
  lostAmount: number;
  winRate: number;
  byStage: { stage: string; count: number; amount: number }[];
  byOwner: {
    ownerName: string;
    openCount: number;
    openAmount: number;
    wonCount: number;
    wonAmount: number;
    lostCount: number;
    lostAmount: number;
  }[];
  lostReasons: { reason: string; count: number; amount: number }[];
};

export type QuoteLine = {
  id: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  isOptional: boolean;
  lineSubtotal: number;
};

export type Quote = {
  id: string;
  quoteNumber: string;
  revision: number;
  customerId: string;
  locationId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  status: "Draft" | "Sent" | "Accepted" | "Ordered" | "Rejected" | "Expired";
  currency: "ARS" | "USD_BILLETE" | "USD_DIVISA";
  exchangeRateUsdBillete: number;
  exchangeRateUsdDivisa: number;
  discountPercent: number;
  subtotal: number;
  total: number;
  validDays: number;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  deliveryTimeDays?: number | null;
  transportation?: string | null;
  warranty?: string | null;
  notes?: string | null;
  ownerName?: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  lines: QuoteLine[];
};

export type QuoteLineWrite = {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  isOptional: boolean;
};

export type QuoteWrite = {
  customerId: string;
  locationId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  currency: string;
  exchangeRateUsdBillete: number;
  exchangeRateUsdDivisa: number;
  discountPercent: number;
  validDays: number;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  deliveryTimeDays?: number | null;
  transportation?: string | null;
  warranty?: string | null;
  notes?: string | null;
  ownerName?: string | null;
  lines: QuoteLineWrite[];
};

export type OrderStatus = "Draft" | "Confirmed" | "InPreparation" | "Dispatched" | "Delivered" | "Invoiced" | "Cancelled";

export type OrderLine = {
  id: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  currencyCode: string;
  discountPercent: number;
  taxRate: number;
  isOptional: boolean;
  lineSubtotal: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  quoteId?: string | null;
  quoteNumber?: string | null;
  customerId: string;
  locationId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  status: OrderStatus;
  currency: "ARS" | "USD_BILLETE" | "USD_DIVISA";
  exchangeRateUsdBillete: number;
  exchangeRateUsdDivisa: number;
  discountPercent: number;
  subtotal: number;
  total: number;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  deliveryTimeDays?: number | null;
  transportation?: string | null;
  warranty?: string | null;
  notes?: string | null;
  ownerName?: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  lines: OrderLine[];
};

export type OrderLineWrite = {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  currencyCode: string;
  discountPercent: number;
  taxRate: number;
  isOptional: boolean;
};

export type OrderWrite = {
  customerId: string;
  locationId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  quoteId?: string | null;
  quoteNumber?: string | null;
  currency: string;
  exchangeRateUsdBillete: number;
  exchangeRateUsdDivisa: number;
  discountPercent: number;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  deliveryTimeDays?: number | null;
  transportation?: string | null;
  warranty?: string | null;
  notes?: string | null;
  ownerName?: string | null;
  lines: OrderLineWrite[];
};

export type ProductCategory = {
  id: string;
  name: string;
  description?: string | null;
  parentCategoryId?: string | null;
};

export type Product = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  detailedDescription?: string | null;
  type: "DirectSale" | "Product" | "Service" | "Kit" | "Manufactured" | "Consumable" | "SparePart" | "RawMaterial" | string;
  categoryId?: string | null;
  categoryName?: string | null;
  imagePath?: string | null;
  saleCurrency: "ARS" | "USD_BILLETE" | "USD_DIVISA";
  basePrice: number;
  purchaseCurrency: "ARS" | "USD_BILLETE" | "USD_DIVISA";
  costPrice: number;
  taxRate: number;
  salesAccountingCode?: string | null;
  purchaseAccountingCode?: string | null;
  trackStock: boolean;
  stock: number;
  minStock: number;
  baseUnit: string;
  hasSerialNumber: boolean;
  trackLot: boolean;
  isActive: boolean;
  customAttributes?: Record<string, string> | null;
  createdAtUtc: string;
  updatedAtUtc: string;
};
export type ProductionBomLine = { id: string; productionBomId: string; componentProductId: string; quantity: number; unit: string; scrapPercent: number; appliesToVariant?: string | null; isOptional: boolean; sortOrder: number };
export type ProductionBom = { id: string; tenantId: string; productId: string; version: string; name: string; description?: string | null; outputQuantity: number; outputUnit: string; isActive: boolean; validFromUtc?: string | null; validToUtc?: string | null; lines: ProductionBomLine[] };
export type ProductionWorkCenter = { id: string; tenantId: string; code: string; name: string; description?: string | null; capacityHoursPerDay: number; isActive: boolean; createdAtUtc: string; updatedAtUtc: string };
export type ProductionOperation = { id: string; productionRouteId: string; workCenterId: string; sequence: number; code: string; name: string; setupMinutes: number; runMinutesPerUnit: number; isQualityCheckpoint: boolean };
export type ProductionRoute = { id: string; tenantId: string; productId: string; version: string; name: string; isActive: boolean; operations: ProductionOperation[] };
export type ProductionOrder = { id: string; tenantId: string; number: string; productId: string; bomId?: string | null; plannedQuantity: number; producedQuantity: number; scrappedQuantity: number; unit: string; status: number; plannedStartUtc?: string | null; plannedEndUtc?: string | null; notes?: string | null; createdAtUtc: string; updatedAtUtc: string };
export type ProductionExecutionEntry = { id: string; tenantId: string; productionOrderId: string; productId: string; quantity: number; unit: string; type: number; lotNumber?: string | null; serialNumbers?: string | null; notes?: string | null; createdAtUtc: string };
export type ProductionVariant = { id: string; tenantId: string; productId: string; code: string; name: string; attributesJson?: string | null; isActive: boolean; createdAtUtc: string; updatedAtUtc: string };

export type ProductWrite = {
  code: string;
  name: string;
  description?: string | null;
  detailedDescription?: string | null;
  type: "DirectSale" | "Product" | "Service" | "Kit" | "Manufactured" | "SparePart" | "RawMaterial";
  categoryId?: string | null;
  imagePath?: string | null;
  saleCurrency: "ARS" | "USD_BILLETE" | "USD_DIVISA";
  basePrice: number;
  purchaseCurrency: "ARS" | "USD_BILLETE" | "USD_DIVISA";
  costPrice: number;
  taxRate: number;
  salesAccountingCode?: string | null;
  purchaseAccountingCode?: string | null;
  trackStock: boolean;
  minStock: number;
  baseUnit: string;
  hasSerialNumber: boolean;
  trackLot: boolean;
  customAttributes?: Record<string, string> | null;
};

export type CurrencyRate = {
  code: string;
  name: string;
  source: string;
  compra: number;
  venta: number;
  updatedAtUtc: string;
};

export type ExchangeRates = {
  usdBillete: CurrencyRate;
  usdDivisa: CurrencyRate;
  fetchedAtUtc: string;
  usdBilleteSell: number;
  usdDivisaSell: number;
};

export type Lead = {
  id: string;
  companyName: string;
  contactName?: string | null;
  name?: string | null;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
  status: string;
  notes?: string | null;
  createdAtUtc: string;
};

export type Opportunity = {
  id: string;
  title: string;
  customerId?: string | null;
  customerName?: string | null;
  amount?: number | null;
  currency: string;
  stage: string;
  priority: string;
  ownerName?: string | null;
  probability: number;
  expectedCloseDate?: string | null;
  lossReason?: string | null;
  lostReason?: string | null;
  tags: string[];
  lastActivityOn?: string | null;
  activityStatus?: "Green" | "Yellow" | "Red" | "Gray";
  activityBadgeStatus?: "Green" | "Yellow" | "Red" | "Gray";
  isRotting?: boolean;
  customFields?: Record<string, string>;
  createdAtUtc: string;
  updatedAtUtc: string;
};

export const provinces = [
  "BuenosAires", "CapitalFederal", "Catamarca", "Chaco", "Chubut",
  "Cordoba", "Corrientes", "EntreRios", "Formosa", "Jujuy",
  "LaPampa", "LaRioja", "Mendoza", "Misiones", "Neuquen",
  "RioNegro", "Salta", "SanJuan", "SanLuis", "SantaCruz", "SantaFe",
  "SantiagoDelEstero", "TierraDelFuego", "Tucuman"
] as const;

export const currencyLabels: Record<string, string> = {
  ARS: "ARS $",
  USD_BILLETE: "U$D Billete",
  USD_DIVISA: "U$D Divisa"
};

export const currencyMeta: Record<string, { label: string; detail: string; symbol: string }> = {
  ARS: { label: "ARS", detail: "Pesos argentinos", symbol: "$" },
  USD_BILLETE: { label: "USD Billete", detail: "Dólar billete", symbol: "U$D" },
  USD_DIVISA: { label: "USD Divisa", detail: "Dólar divisa", symbol: "U$D" }
};

export const productTypeLabels: Record<string, string> = {
  DirectSale: "Venta Directa",
  Product: "Venta Directa",
  Service: "Servicio Intangible",
  Kit: "Producto Ensamblado",
  Manufactured: "Producto Fabricado",
  Consumable: "Producto Fabricado",
  SparePart: "Repuesto Técnico",
  RawMaterial: "Materia Prima"
};

export const productTypeMeta: Record<string, { label: string; icon: string; badgeClass: string; movesStock: boolean; description: string }> = {
  DirectSale: { label: "Venta Directa", icon: "🛍️", badgeClass: "ok", movesStock: true, description: "Mercadería de reventa que se compra y vende sin transformación" },
  Product: { label: "Venta Directa", icon: "🛍️", badgeClass: "ok", movesStock: true, description: "Mercadería de reventa que se compra y vende sin transformación" },
  Service: { label: "Servicio Intangible", icon: "🛠️", badgeClass: "off", movesStock: false, description: "Horas de mano de obra, calibraciones y fletes sin control de stock" },
  Kit: { label: "Producto Ensamblado", icon: "🧩", badgeClass: "warn", movesStock: true, description: "Producto armado a partir de componentes o kits comerciales" },
  Manufactured: { label: "Producto Fabricado", icon: "🏭", badgeClass: "ok", movesStock: true, description: "Elaborado mediante orden de producción y lista de materiales" },
  Consumable: { label: "Producto Fabricado", icon: "🏭", badgeClass: "ok", movesStock: true, description: "Elaborado mediante orden de producción y lista de materiales" },
  SparePart: { label: "Repuesto Técnico", icon: "🔧", badgeClass: "warn", movesStock: true, description: "Piezas e insumos utilizados en reparaciones y órdenes de trabajo" },
  RawMaterial: { label: "Materia Prima", icon: "🧱", badgeClass: "off", movesStock: true, description: "Insumos base consumidos en el proceso de fabricación" }
};

export const labels: Record<string, string> = {
  ResponsableInscripto: "Responsable Inscripto",
  Monotributo: "Monotributo",
  Exento: "Exento",
  ConsumidorFinal: "Consumidor Final",
  ConvenioMultilateral: "Convenio multilateral",
  Local: "Local",
  NoInscripto: "No inscripto",
  Active: "Activo",
  Inactive: "Inactivo",
  Open: "Abierto",
  Converted: "Convertido",
  Archived: "Archivado",
  Cuit: "CUIT",
  Dni: "DNI",
  Commercial: "Comercial",
  Technical: "Técnico",
  Administrative: "Administrativo",
  Manual: "Manual",
  Phone: "Teléfono",
  WhatsApp: "WhatsApp",
  Email: "Email",
  WalkIn: "Visita",
  Catalog: "Catálogo",
  Other: "Otro",
  Low: "Baja",
  Normal: "Normal",
  High: "Alta",
  Urgent: "Urgente",
  Lead: "Lead",
  Qualified: "Calificado",
  Proposal: "Propuesta",
  Negotiation: "Negociación",
  Won: "Ganado",
  Lost: "Perdido",
  Draft: "Borrador",
  Sent: "Enviado",
  Accepted: "Aceptado / Ganado",
  Ordered: "Pedido de Venta",
  Rejected: "Rechazado",
  Expired: "Vencido",
  Confirmed: "Confirmado",
  InPreparation: "En Preparación",
  Dispatched: "Despachado",
  Delivered: "Entregado",
  Invoiced: "Facturado",
  Cancelled: "Cancelado",
  Note: "Nota",
  Call: "Llamada",
  Meeting: "Reunión",
  Visit: "Visita",
  Arba: "ARBA",
  Agip: "AGIP"
};

export const label = (value?: string | null) => (value ? labels[value] ?? value : "—");

export type CompanySettings = {
  legalName: string;
  tradeName?: string | null;
  documentType: string;
  documentNumber: string;
  taxCondition: string;
  iibbRegime: string;
  iibbNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsApp?: string | null;
  website?: string | null;
  fiscalStreet?: string | null;
  fiscalCity?: string | null;
  fiscalProvince?: string | null;
  fiscalPostalCode?: string | null;
  logoUrl?: string | null;
  hasArcaCertificate: boolean;
  arcaEnvironment: string;
  arcaSignerCuit?: string | null;
  bankName?: string | null;
  bankCbu?: string | null;
  bankAlias?: string | null;
  defaultQuoteValidDays: number;
  defaultDeliveryDays: number;
  defaultWarranty?: string | null;
  defaultPaymentTerms?: string | null;
};

export type TenantUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAtUtc: string;
};

export type ProductSummary = Product;

export type Supplier = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  documentType: string;
  documentNumber: string;
  taxCondition: string;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
  fiscalStreet?: string | null;
  fiscalCity?: string | null;
  fiscalProvince?: string | null;
  fiscalPostalCode?: string | null;
  address?: Address | null;
  paymentTerms?: string | null;
  paymentTermsDays?: number | null;
  notes?: string | null;
  createdAtUtc: string;
};

export type SupplierWrite = Omit<Supplier, "id" | "createdAtUtc">;

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: "MainWarehouse" | "Workshop" | "MobileUnit" | "Scrap";
  address?: string | null;
  assignedTechnicianName?: string | null;
  isActive: boolean;
  createdAtUtc: string;
};

export type StockItem = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  warehouseId?: string | null;
  warehouseName: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  incomingStock: number;
  forecastedStock: number;
  minimumStock: number;
  reorderPoint: number;
  warehouseLocation?: string | null;
  status: "StockOK" | "LowStock" | "OutStock";
  unitCostArs: number;
  unitCostUsd: number;
  priceArs: number;
  priceUsd: number;
  updatedAtUtc: string;
};

export type StockTransferItem = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  serialNumbers?: string | null;
  lotNumber?: string | null;
};

export type StockTransfer = {
  id: string;
  transferNumber: string;
  originWarehouseId: string;
  originWarehouseName: string;
  destinationWarehouseId: string;
  destinationWarehouseName: string;
  status: "Draft" | "InTransit" | "Received" | "Cancelled";
  operatorName?: string | null;
  dispatchedAtUtc?: string | null;
  receivedAtUtc?: string | null;
  notes?: string | null;
  items: StockTransferItem[];
  createdAtUtc: string;
};

export type StockMovement = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  warehouseId?: string | null;
  warehouseName: string;
  movementType: string;
  quantity: number;
  previousPhysicalStock: number;
  newPhysicalStock: number;
  unitCostArs?: number | null;
  unitCostUsd?: number | null;
  serialNumbers?: string | null;
  lotNumber?: string | null;
  referenceType?: string | null;
  referenceNumber?: string | null;
  operatorName?: string | null;
  notes?: string | null;
  createdAtUtc: string;
};

export type ProductSupplier = {
  id: string;
  productId: string;
  supplierId: string;
  supplierName: string;
  supplierProductCode?: string | null;
  purchasePrice: number;
  currency: string;
  leadTimeDays: number;
  minimumOrderQuantity: number;
  isPreferred: boolean;
  createdAtUtc: string;
};

export type RemitoItem = {
  id: string;
  productId?: string | null;
  code: string;
  description: string;
  quantity: number;
  unitMeasure: string;
};

export type Remito = {
  id: string;
  remitoNumber: string;
  orderId?: string | null;
  customerId: string;
  customerName: string;
  customerDocument: string;
  deliveryAddress?: string | null;
  issueDate: string;
  deliveryDate: string;
  carrierName?: string | null;
  driverLicense?: string | null;
  status: string;
  notes?: string | null;
  items: RemitoItem[];
  createdAtUtc: string;
};

export type RemitoWrite = {
  orderId?: string | null;
  customerId: string;
  customerName: string;
  customerDocument: string;
  deliveryAddress?: string | null;
  deliveryDate: string;
  carrierName?: string | null;
  driverLicense?: string | null;
  notes?: string | null;
  items: Array<{
    productId?: string | null;
    code: string;
    description: string;
    quantity: number;
    unitMeasure: string;
  }>;
};

export type InvoiceItem = {
  id: string;
  productId?: string | null;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  netSubtotal: number;
  vatAmount: number;
  total: number;
};

export type Invoice = {
  id: string;
  invoiceType: string;
  pointOfSale: number;
  invoiceNumber: number;
  formattedNumber: string;
  orderId?: string | null;
  remitoId?: string | null;
  customerId: string;
  customerName: string;
  customerDocument: string;
  customerTaxCondition: string;
  customerAddress?: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: number;
  subtotal: number;
  iva21: number;
  iva105: number;
  iva27: number;
  exemptAmount: number;
  iibbPerception: number;
  total: number;
  cae?: string | null;
  caeDueDate?: string | null;
  qrUrl?: string | null;
  status: string;
  afipRawResponse?: string | null;
  notes?: string | null;
  items: InvoiceItem[];
  createdAtUtc: string;
};

export type InvoiceWrite = {
  invoiceType: string;
  pointOfSale: number;
  orderId?: string | null;
  remitoId?: string | null;
  customerId: string;
  customerName: string;
  customerDocument: string;
  customerTaxCondition: string;
  customerAddress?: string | null;
  dueDate: string;
  currency: string;
  exchangeRate: number;
  notes?: string | null;
  items: Array<{
    productId?: string | null;
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
  }>;
};

// Purchases Types
export type PurchaseOrderItem = {
  id: string;
  productId?: string | null;
  code: string;
  description: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  netSubtotal: number;
  total: number;
};

export type PurchaseOrder = {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  supplierDocument: string;
  issueDate: string;
  expectedDeliveryDate?: string | null;
  currency: string;
  exchangeRate: number;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  deliveryAddress?: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: "Draft" | "Sent" | "PartiallyReceived" | "Received" | "Cancelled";
  notes?: string | null;
  createdAtUtc: string;
  items: PurchaseOrderItem[];
};

export type PurchaseOrderWrite = {
  supplierId: string;
  supplierName: string;
  supplierDocument: string;
  expectedDeliveryDate?: string | null;
  currency: string;
  exchangeRate: number;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  deliveryAddress?: string | null;
  notes?: string | null;
  items: Array<{
    productId?: string | null;
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxRate: number;
  }>;
};

export type PurchaseReceptionItem = {
  id: string;
  productId?: string | null;
  code: string;
  description: string;
  quantity: number;
  unitMeasure: string;
  serialNumber?: string | null;
};

export type PurchaseReception = {
  id: string;
  receptionNumber: string;
  purchaseOrderId?: string | null;
  supplierId: string;
  supplierName: string;
  supplierRemitoNumber: string;
  receptionDate: string;
  warehouseLocation: string;
  receivedBy?: string | null;
  notes?: string | null;
  createdAtUtc: string;
  items: PurchaseReceptionItem[];
};

export type PurchaseReceptionWrite = {
  purchaseOrderId?: string | null;
  supplierId: string;
  supplierName: string;
  supplierRemitoNumber: string;
  receptionDate: string;
  warehouseLocation: string;
  receivedBy?: string | null;
  notes?: string | null;
  items: Array<{
    productId?: string | null;
    code: string;
    description: string;
    quantity: number;
    unitMeasure: string;
    serialNumber?: string | null;
  }>;
};

export type PurchaseInvoiceItem = {
  id: string;
  productId?: string | null;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  netSubtotal: number;
  vatAmount: number;
  total: number;
};

export type PurchaseInvoice = {
  id: string;
  invoiceType: string;
  pointOfSale: number;
  invoiceNumber: number;
  formattedNumber: string;
  purchaseOrderId?: string | null;
  purchaseReceptionId?: string | null;
  supplierId: string;
  supplierName: string;
  supplierDocument: string;
  supplierTaxCondition: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: number;
  subtotal: number;
  iva21: number;
  iva105: number;
  iva27: number;
  exemptAmount: number;
  iibbPerception: number;
  ivaPerception: number;
  otherTaxes: number;
  total: number;
  cae?: string | null;
  caeDueDate?: string | null;
  status: string;
  notes?: string | null;
  createdAtUtc: string;
  items: PurchaseInvoiceItem[];
};

export type PurchaseInvoiceWrite = {
  invoiceType: string;
  pointOfSale: number;
  invoiceNumber: number;
  purchaseOrderId?: string | null;
  purchaseReceptionId?: string | null;
  supplierId: string;
  supplierName: string;
  supplierDocument: string;
  supplierTaxCondition: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: number;
  iibbPerception: number;
  ivaPerception: number;
  otherTaxes: number;
  cae?: string | null;
  caeDueDate?: string | null;
  notes?: string | null;
  arcaVoucherId?: string | null;
  items: Array<{
    productId?: string | null;
    code: string;
    description: string;
    quantity: number;
    unitPrice: number;
    vatRate: number;
  }>;
};

export type PurchaseArcaVoucher = {
  id: string;
  issueDate: string;
  voucherType: string;
  voucherTypeCode: number;
  invoiceLetter: string;
  pointOfSale: number;
  voucherNumber: number;
  formattedNumber: string;
  cae?: string | null;
  issuerDocType: string;
  issuerCuit: string;
  issuerName: string;
  currencyCode: string;
  exchangeRate: number;
  netAmount: number;
  exemptAmount: number;
  vatAmount: number;
  otherTaxes: number;
  totalAmount: number;
  supplierId?: string | null;
  purchaseInvoiceId?: string | null;
  importBatch: string;
  status: "Pending" | "Registered" | "Ignored";
  createdAtUtc: string;
};

export type ImportArcaCsvResult = {
  batchId: string;
  totalProcessed: number;
  imported: number;
  skipped: number;
  linked: number;
  message: string;
};

export type PurchaseRequestItem = {
  id: string;
  productId?: string | null;
  code: string;
  description: string;
  quantity: number;
  unitMeasure: string;
  estimatedUnitPrice: number;
  notes?: string | null;
};

export type PurchaseQuotation = {
  id: string;
  purchaseRequestId: string;
  supplierId: string;
  supplierName: string;
  supplierQuoteRef?: string | null;
  issueDate: string;
  currency: string;
  exchangeRate: number;
  netAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  deliveryTime?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  attachmentBase64?: string | null;
  attachmentFileName?: string | null;
  isSelected: boolean;
  createdAtUtc: string;
};

export type PurchaseQuotationWrite = {
  supplierId: string;
  supplierName: string;
  supplierQuoteRef?: string | null;
  issueDate: string;
  currency: string;
  exchangeRate: number;
  netAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  deliveryTime?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  attachmentBase64?: string | null;
  attachmentFileName?: string | null;
};

export type PurchaseRequest = {
  id: string;
  requestNumber: string;
  requestedBy: string;
  department: string;
  priority: "Low" | "Normal" | "High" | "Urgent";
  requiredDate?: string | null;
  reason: string;
  status: "Pending" | "Approved" | "Ordered" | "Rejected" | "Cancelled";
  rejectionReason?: string | null;
  purchaseOrderId?: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  items: PurchaseRequestItem[];
  quotations: PurchaseQuotation[];
};

export type PurchaseRequestWrite = {
  requestedBy: string;
  department: string;
  priority: string;
  requiredDate?: string | null;
  reason: string;
  items: Array<{
    productId?: string | null;
    code: string;
    description: string;
    quantity: number;
    unitMeasure: string;
    estimatedUnitPrice: number;
    notes?: string | null;
  }>;
};


export type MailAccount = {
  id: string; displayName: string; emailAddress: string; provider: string; authMode: string;
  imapHost: string; imapPort: number; imapUseSsl: boolean; smtpHost: string; smtpPort: number; smtpUseSsl: boolean;
  username: string; isActive: boolean; isDefaultSender: boolean; lastSyncAtUtc?: string | null; lastError?: string | null; hasSecret: boolean;
};
export type EmailMessage = { id:string; mailAccountId:string; internetMessageId:string; inReplyTo?:string|null; threadKey:string; direction:"Incoming"|"Outgoing"; subject:string; fromAddress:string; toAddresses:string; bodyPreview:string; bodyHtml?:string|null; occurredAtUtc:string; relatedEntityType?:string|null; relatedEntityId?:string|null };
