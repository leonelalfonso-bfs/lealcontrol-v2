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

export type CustomerDetail = CustomerSummary & {
  iibbRegime: string;
  whatsApp?: string | null;
  fiscalAddress?: Address | null;
  creditLimit?: number | null;
  paymentTermsDays?: number | null;
  notes?: string | null;
  isLargeCompany: boolean;
  fceThreshold?: number | null;
  locations: Location[];
  contacts: Contact[];
  fiscalRates: FiscalRate[];
  createdAtUtc: string;
};

export type CustomerWrite = {
  legalName: string;
  tradeName?: string;
  documentType: string;
  documentNumber: string;
  taxCondition: string;
  iibbRegime: string;
  isCustomer: boolean;
  isSupplier: boolean;
  email?: string;
  phone?: string;
  whatsApp?: string;
  fiscalStreet?: string;
  fiscalCity?: string;
  fiscalProvince?: string;
  fiscalPostalCode?: string;
  creditLimit?: number;
  paymentTermsDays?: number;
  notes?: string;
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type Lead = {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  source: string;
  status: string;
  convertedCustomerId?: string | null;
  createdAtUtc: string;
};

export type Opportunity = {
  id: string;
  title: string;
  customerId?: string | null;
  stage: string;
  amount?: number | null;
  currency?: string | null;
  createdAtUtc: string;
};

export type Activity = {
  id: string;
  type: string;
  description: string;
  occurredAtUtc: string;
  nextFollowUpOn?: string | null;
};

export const provinces = [
  "Caba", "BuenosAires", "Catamarca", "Chaco", "Chubut", "Cordoba", "Corrientes",
  "EntreRios", "Formosa", "Jujuy", "LaPampa", "LaRioja", "Mendoza", "Misiones",
  "Neuquen", "RioNegro", "Salta", "SanJuan", "SanLuis", "SantaCruz", "SantaFe",
  "SantiagoDelEstero", "TierraDelFuego", "Tucuman"
] as const;

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
  Lead: "Lead",
  Qualified: "Calificado",
  Proposal: "Propuesta",
  Negotiation: "Negociación",
  Won: "Ganado",
  Lost: "Perdido",
  Note: "Nota",
  Call: "Llamada",
  Meeting: "Reunión",
  Visit: "Visita",
  Arba: "ARBA",
  Agip: "AGIP"
};

export const label = (value?: string | null) => (value ? labels[value] ?? value : "—");
