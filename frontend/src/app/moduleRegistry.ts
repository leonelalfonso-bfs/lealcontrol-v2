export type PlanTier = "base" | "comercial" | "operaciones" | "empresarial";

export type ModulePermission =
  | "home.read"
  | "directory.read"
  | "crm.read"
  | "sales.read"
  | "purchasing.read"
  | "inventory.read"
  | "analytics.read"
  | "administration.read"
  | "communications.read";

export interface NavigationItem {
  path: string;
  label: string;
  icon: string;
  end?: boolean;
}

export interface ModuleDefinition {
  id: string;
  label: string;
  icon: string;
  title: string;
  defaultPath: string;
  pathPrefixes: string[];
  minimumPlan: PlanTier;
  requiredPermission: ModulePermission;
  dependencies: string[];
  items: NavigationItem[];
}

export interface AccessContext {
  plan: PlanTier;
  permissions: ReadonlySet<ModulePermission>;
}

const planOrder: Record<PlanTier, number> = {
  base: 0,
  comercial: 1,
  operaciones: 2,
  empresarial: 3
};

export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  {
    id: "inicio",
    label: "Inicio",
    icon: "⌂",
    title: "INICIO Y PENDIENTES",
    defaultPath: "/",
    pathPrefixes: ["/"],
    minimumPlan: "base",
    requiredPermission: "home.read",
    dependencies: [],
    items: [{ path: "/", label: "Dashboard general", icon: "⌂", end: true }]
  },
  {
    id: "directorio",
    label: "Directorio",
    icon: "◉",
    title: "EMPRESAS Y CONTACTOS",
    defaultPath: "/directorio",
    pathPrefixes: ["/directorio", "/clientes", "/proveedores"],
    minimumPlan: "base",
    requiredPermission: "directory.read",
    dependencies: [],
    items: [
      { path: "/directorio", label: "Todas las empresas", icon: "◉" },
      { path: "/clientes", label: "Empresas / Clientes", icon: "◉" },
      { path: "/proveedores", label: "Proveedores", icon: "◌" }
    ]
  },
  {
    id: "crm",
    label: "CRM",
    icon: "◇",
    title: "RELACIONES Y OPORTUNIDADES",
    defaultPath: "/prospectos",
    pathPrefixes: ["/prospectos", "/oportunidades", "/crm", "/reportes"],
    minimumPlan: "comercial",
    requiredPermission: "crm.read",
    dependencies: ["directorio"],
    items: [
      { path: "/prospectos", label: "Prospectos", icon: "◇" },
      { path: "/oportunidades", label: "Oportunidades", icon: "↗" },
      { path: "/reportes", label: "Analítica comercial", icon: "▤" },
      { path: "/crm/ayuda", label: "Ayuda CRM", icon: "?" }
    ]
  },
  {
    id: "comunicaciones",
    label: "Correo",
    icon: "@",
    title: "COMUNICACIONES",
    defaultPath: "/comunicaciones",
    pathPrefixes: ["/comunicaciones"],
    minimumPlan: "comercial",
    requiredPermission: "communications.read",
    dependencies: ["directorio"],
    items: [{ path: "/comunicaciones", label: "Bandeja de correo", icon: "@" }, { path: "/comunicaciones/canales", label: "Canales sociales", icon: "◉" }]
  },
  {
    id: "ventas",
    label: "Ventas",
    icon: "↗",
    title: "VENTAS Y FACTURACIÓN",
    defaultPath: "/presupuestos",
    pathPrefixes: ["/presupuestos", "/pedidos", "/remitos", "/facturas"],
    minimumPlan: "comercial",
    requiredPermission: "sales.read",
    dependencies: ["directorio"],
    items: [
      { path: "/presupuestos", label: "Presupuestos", icon: "□" },
      { path: "/pedidos", label: "Pedidos de venta", icon: "≡" },
      { path: "/remitos", label: "Remitos", icon: "→" },
      { path: "/facturas", label: "Facturación ARCA", icon: "#" }
    ]
  },
  {
    id: "compras",
    label: "Compras",
    icon: "↓",
    title: "ABASTECIMIENTO Y COMPRAS",
    defaultPath: "/compras",
    pathPrefixes: ["/compras"],
    minimumPlan: "operaciones",
    requiredPermission: "purchasing.read",
    dependencies: ["directorio"],
    items: [
      { path: "/compras", label: "Centro de control", icon: "⌂", end: true }, { path: "/compras/solicitudes", label: "Solicitudes", icon: "+" },
      { path: "/compras/ordenes", label: "Órdenes de compra", icon: "≡" },
      { path: "/compras/recepciones", label: "Recepciones", icon: "←" },
      { path: "/compras/facturas", label: "Facturas proveedor", icon: "#" },
      { path: "/compras/arca", label: "Comprobantes ARCA", icon: "↓" }, { path: "/compras/reportes", label: "Reportes y evaluación", icon: "▥" }, { path: "/compras/ayuda", label: "Ayuda Compras", icon: "?" }
    ]
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: "▣",
    title: "INVENTARIO Y DEPÓSITOS",
    defaultPath: "/inventario",
    minimumPlan: "operaciones",
    requiredPermission: "inventory.read",
    dependencies: ["directorio"],
    pathPrefixes: ["/inventario", "/productos"],
    items: [{ path: "/inventario", label: "Stock y depósitos", icon: "▣" }, { path: "/productos", label: "Catálogo de productos", icon: "▦" }]
  },
  {
    id: "produccion",
    label: "Producción",
    icon: "⚒",
    title: "PRODUCCIÓN Y FABRICACIÓN",
    defaultPath: "/produccion",
    pathPrefixes: ["/produccion"],
    minimumPlan: "operaciones",
    requiredPermission: "inventory.read",
    dependencies: ["inventario", "ventas"],
    items: [{ path: "/produccion/flujo", label: "Flujo de fabricación", icon: "➜" }, { path: "/produccion", label: "Maestro de fabricación", icon: "⚒" }, { path: "/produccion/ordenes", label: "Órdenes de producción", icon: "▤" }, { path: "/produccion/costos", label: "Costos de fabricación", icon: "$" }, { path: "/produccion/reportes", label: "Reportes de fabricación", icon: "▥" }, { path: "/produccion/ayuda", label: "Ayuda Producción", icon: "?" }]
  },
  {
    id: "finanzas",
    label: "Finanzas",
    icon: "$",
    title: "FINANZAS Y TESORERÍA",
    defaultPath: "/finanzas",
    pathPrefixes: ["/finanzas"],
    minimumPlan: "operaciones",
    requiredPermission: "purchasing.read",
    dependencies: ["ventas", "compras"],
    items: [{ path: "/finanzas", label: "Disponibilidad", icon: "$" }, { path: "/finanzas/bancos", label: "Bancos y cajas", icon: "▣" }, { path: "/finanzas/echeqs", label: "eCheqs", icon: "✓" }, { path: "/finanzas/cuenta-corriente", label: "Cuenta corriente", icon: "◫" }, { path: "/finanzas/cobranzas", label: "Recibos de cobro", icon: "$" }, { path: "/finanzas/cashflow", label: "Cash flow", icon: "↗" }]
  },
  {
    id: "administracion",
    label: "Administración",
    icon: "⚙",
    title: "ADMINISTRACIÓN DEL SISTEMA",
    defaultPath: "/configuracion",
    pathPrefixes: ["/configuracion"],
    minimumPlan: "base",
    requiredPermission: "administration.read",
    dependencies: [],
    items: [
      { path: "/configuracion", label: "Empresa e integraciones", icon: "⚙", end: true },
      { path: "/configuracion/correo", label: "Cuentas de correo", icon: "@" }
    ]
  }
];

export const DEVELOPMENT_ACCESS: AccessContext = {
  plan: "empresarial",
  permissions: new Set<ModulePermission>([
    "home.read",
    "directory.read",
    "crm.read",
    "sales.read",
    "purchasing.read",
    "inventory.read",
    "analytics.read",
    "administration.read",
    "communications.read"
  ])
};

export function canAccessModule(module: ModuleDefinition, access: AccessContext): boolean {
  return planOrder[access.plan] >= planOrder[module.minimumPlan]
    && access.permissions.has(module.requiredPermission);
}

export function visibleModules(access: AccessContext): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((module) => canAccessModule(module, access));
}

export function resolveActiveModule(pathname: string, access: AccessContext): ModuleDefinition {
  const modules = visibleModules(access);
  return modules.find((module) => module.pathPrefixes.some((prefix) => prefix !== "/" && pathname.startsWith(prefix)))
    ?? modules.find((module) => module.id === "inicio")
    ?? modules[0];
}
