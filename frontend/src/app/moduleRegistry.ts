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
  gradient: string;
  glow: string;
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
    icon: "🏠",
    gradient: "linear-gradient(135deg, #38bdf8, #2563eb)",
    glow: "rgba(37, 99, 235, 0.35)",
    title: "PANEL EJECUTIVO ERP",
    defaultPath: "/",
    pathPrefixes: ["/"],
    minimumPlan: "base",
    requiredPermission: "home.read",
    dependencies: [],
    items: [{ path: "/", label: "Dashboard Ejecutivo", icon: "📊", end: true }]
  },
  {
    id: "directorio",
    label: "Directorio",
    icon: "🏢",
    gradient: "linear-gradient(135deg, #818cf8, #4f46e5)",
    glow: "rgba(79, 70, 229, 0.35)",
    title: "EMPRESAS Y CONTACTOS",
    defaultPath: "/directorio",
    pathPrefixes: ["/directorio", "/clientes", "/proveedores"],
    minimumPlan: "base",
    requiredPermission: "directory.read",
    dependencies: [],
    items: [
      { path: "/directorio", label: "Todas las empresas", icon: "🏢" },
      { path: "/clientes", label: "Clientes", icon: "👥" },
      { path: "/proveedores", label: "Proveedores", icon: "🏭" },
      { path: "/directorio/ayuda", label: "Ayuda Directorio", icon: "💡" }
    ]
  },
  {
    id: "crm",
    label: "CRM",
    icon: "🎯",
    gradient: "linear-gradient(135deg, #c084fc, #9333ea)",
    glow: "rgba(147, 51, 234, 0.35)",
    title: "RELACIONES Y OPORTUNIDADES",
    defaultPath: "/crm",
    pathPrefixes: ["/crm", "/prospectos", "/oportunidades", "/reportes"],
    minimumPlan: "comercial",
    requiredPermission: "crm.read",
    dependencies: ["directorio"],
    items: [
      { path: "/crm", label: "Centro de Pendientes", icon: "📌", end: true },
      { path: "/prospectos", label: "Prospectos", icon: "⚡" },
      { path: "/oportunidades", label: "Oportunidades", icon: "📈" },
      { path: "/reportes", label: "Analítica comercial", icon: "📊" },
      { path: "/crm/ayuda", label: "Ayuda CRM", icon: "💡" }
    ]
  },
  {
    id: "comunicaciones",
    label: "Comunicaciones",
    icon: "💬",
    gradient: "linear-gradient(135deg, #38bdf8, #0284c7)",
    glow: "rgba(2, 132, 199, 0.35)",
    title: "COMUNICACIONES & MENSAJERÍA",
    defaultPath: "/comunicaciones",
    pathPrefixes: ["/comunicaciones", "/configuracion/correo"],
    minimumPlan: "comercial",
    requiredPermission: "communications.read",
    dependencies: ["directorio"],
    items: [
      { path: "/comunicaciones", label: "Bandeja de Entrada", icon: "📬" },
      { path: "/comunicaciones/canales", label: "WhatsApp & Redes", icon: "💬" },
      { path: "/comunicaciones/plantillas", label: "Plantillas de respuesta", icon: "📝" },
      { path: "/configuracion/correo", label: "Configurar Casillas de Mail", icon: "⚙️" }
    ]
  },
  {
    id: "ventas",
    label: "Ventas",
    icon: "💼",
    gradient: "linear-gradient(135deg, #34d399, #059669)",
    glow: "rgba(5, 150, 105, 0.35)",
    title: "VENTAS Y FACTURACIÓN",
    defaultPath: "/presupuestos",
    pathPrefixes: ["/presupuestos", "/pedidos", "/remitos", "/facturas", "/ventas"],
    minimumPlan: "comercial",
    requiredPermission: "sales.read",
    dependencies: ["directorio"],
    items: [
      { path: "/presupuestos", label: "Presupuestos", icon: "📑" },
      { path: "/pedidos", label: "Pedidos de venta", icon: "📋" },
      { path: "/remitos", label: "Remitos oficiales", icon: "🚚" },
      { path: "/facturas", label: "Facturación ARCA", icon: "🧾" },
      { path: "/ventas/ayuda", label: "Ayuda Ventas", icon: "💡" }
    ]
  },
  {
    id: "compras",
    label: "Compras",
    icon: "🛒",
    gradient: "linear-gradient(135deg, #fbbf24, #d97706)",
    glow: "rgba(217, 119, 6, 0.35)",
    title: "ABASTECIMIENTO Y COMPRAS",
    defaultPath: "/compras",
    pathPrefixes: ["/compras"],
    minimumPlan: "operaciones",
    requiredPermission: "purchasing.read",
    dependencies: ["directorio"],
    items: [
      { path: "/compras", label: "Centro de control", icon: "📊", end: true },
      { path: "/compras/solicitudes", label: "Solicitudes", icon: "📝" },
      { path: "/compras/ordenes", label: "Órdenes de compra", icon: "📦" },
      { path: "/compras/recepciones", label: "Recepciones", icon: "📥" },
      { path: "/compras/facturas", label: "Facturas proveedor", icon: "🧾" },
      { path: "/compras/arca", label: "Comprobantes ARCA", icon: "🏛️" },
      { path: "/compras/reportes", label: "Evaluación proveedores", icon: "📈" },
      { path: "/compras/ayuda", label: "Ayuda Compras", icon: "💡" }
    ]
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: "📦",
    gradient: "linear-gradient(135deg, #2dd4bf, #0d9488)",
    glow: "rgba(13, 148, 136, 0.35)",
    title: "INVENTARIO Y DEPÓSITOS",
    defaultPath: "/inventario",
    minimumPlan: "operaciones",
    requiredPermission: "inventory.read",
    dependencies: ["directorio"],
    pathPrefixes: ["/inventario", "/productos"],
    items: [
      { path: "/inventario", label: "Stock y depósitos", icon: "📊" },
      { path: "/productos", label: "Catálogo de productos", icon: "🏷️" },
      { path: "/inventario/ayuda", label: "Ayuda Inventario", icon: "💡" }
    ]
  },
  {
    id: "produccion",
    label: "Producción",
    icon: "⚙️",
    gradient: "linear-gradient(135deg, #fb7185, #e11d48)",
    glow: "rgba(225, 29, 72, 0.35)",
    title: "PRODUCCIÓN Y FABRICACIÓN",
    defaultPath: "/produccion",
    pathPrefixes: ["/produccion"],
    minimumPlan: "operaciones",
    requiredPermission: "inventory.read",
    dependencies: ["inventario", "ventas"],
    items: [
      { path: "/produccion/flujo", label: "Flujo de fabricación", icon: "🔄" },
      { path: "/produccion", label: "Maestro de fabricación", icon: "⚙️" },
      { path: "/produccion/ordenes", label: "Órdenes de producción", icon: "📋" },
      { path: "/produccion/costos", label: "Costos de fabricación", icon: "💰" },
      { path: "/produccion/reportes", label: "Reportes de fabricación", icon: "📊" },
      { path: "/produccion/ayuda", label: "Ayuda Producción", icon: "💡" }
    ]
  },
  {
    id: "finanzas",
    label: "Finanzas",
    icon: "💳",
    gradient: "linear-gradient(135deg, #facc15, #10b981)",
    glow: "rgba(16, 185, 129, 0.35)",
    title: "FINANZAS Y TESORERÍA",
    defaultPath: "/finanzas",
    pathPrefixes: ["/finanzas"],
    minimumPlan: "operaciones",
    requiredPermission: "purchasing.read",
    dependencies: ["ventas", "compras"],
    items: [
      { path: "/finanzas", label: "Disponibilidad", icon: "💵" },
      { path: "/finanzas/bancos", label: "Bancos y cajas", icon: "🏦" },
      { path: "/finanzas/cuenta-corriente", label: "Cuentas corrientes", icon: "⚖️" },
      { path: "/finanzas/cobranzas", label: "Recibos de cobro", icon: "🧾" },
      { path: "/finanzas/pagos", label: "Órdenes de pago", icon: "💳" },
      { path: "/finanzas/echeqs", label: "Cartera de cheques", icon: "🎫" },
      { path: "/finanzas/conceptos", label: "Conceptos y reglas", icon: "🏷️" },
      { path: "/finanzas/cashflow", label: "Cash flow", icon: "📈" },
      { path: "/finanzas/ayuda", label: "Ayuda Finanzas", icon: "💡" }
    ]
  },
  {
    id: "rrhh",
    label: "RRHH",
    icon: "👥",
    gradient: "linear-gradient(135deg, #ec4899, #db2777)",
    glow: "rgba(236, 72, 153, 0.35)",
    title: "RECURSOS HUMANOS & ESTRUCTURA",
    defaultPath: "/rrhh",
    pathPrefixes: ["/rrhh"],
    minimumPlan: "operaciones",
    requiredPermission: "administration.read",
    dependencies: [],
    items: [
      { path: "/rrhh", label: "Tablero RRHH", icon: "📊", end: true },
      { path: "/rrhh/empleados", label: "Colaboradores & Legajos", icon: "👤" },
      { path: "/rrhh/organigrama", label: "Organigrama & Puestos", icon: "🏢" },
      { path: "/rrhh/manuales", label: "Manuales de Procedimientos", icon: "📖" },
      { path: "/rrhh/liquidaciones", label: "Liquidación de Sueldos", icon: "💰" },
      { path: "/rrhh/ayuda", label: "Ayuda RRHH", icon: "💡" }
    ]
  },
  {
    id: "flota",
    label: "Flota",
    icon: "🚛",
    gradient: "linear-gradient(135deg, #3b82f6, #0284c7)",
    glow: "rgba(59, 130, 246, 0.35)",
    title: "GESTIÓN DE FLOTA VEHICULAR",
    defaultPath: "/flota",
    pathPrefixes: ["/flota"],
    minimumPlan: "operaciones",
    requiredPermission: "inventory.read",
    dependencies: [],
    items: [
      { path: "/flota", label: "Unidades y vehículos", icon: "🚗", end: true },
      { path: "/flota/combustible", label: "Control de combustible", icon: "⛽" },
      { path: "/flota/ayuda", label: "Ayuda Flota", icon: "💡" }
    ]
  },
  {
    id: "cereales",
    label: "Cereales & Granos",
    icon: "🌾",
    gradient: "linear-gradient(135deg, #f59e0b, #d97706)",
    glow: "rgba(217, 119, 6, 0.35)",
    title: "CORRETAJE & ACOPIO GRANARIO",
    defaultPath: "/cereales",
    pathPrefixes: ["/cereales"],
    minimumPlan: "base",
    requiredPermission: "sales.read",
    dependencies: [],
    items: [
      { path: "/cereales", label: "Tablero Granario", icon: "📊", end: true },
      { path: "/cereales/contratos", label: "Contratos de Granos", icon: "📋" },
      { path: "/cereales/fijaciones", label: "Pizarra & Fijaciones", icon: "⚖️" },
      { path: "/cereales/entregas", label: "Logística CPE & Balanza", icon: "🚚" },
      { path: "/cereales/posicion", label: "Posición & Stock", icon: "🌾" }
    ]
  },
  {
    id: "contabilidad",
    label: "Contabilidad",
    icon: "🏛️",
    gradient: "linear-gradient(135deg, #6366f1, #4338ca)",
    glow: "rgba(99, 102, 241, 0.35)",
    title: "SISTEMA CONTABLE PROFESIONAL & P&L",
    defaultPath: "/contabilidad",
    pathPrefixes: ["/contabilidad"],
    minimumPlan: "base",
    requiredPermission: "administration.read",
    dependencies: [],
    items: [
      { path: "/contabilidad", label: "Tablero P&L", icon: "📊", end: true },
      { path: "/contabilidad/modelos", label: "Asientos Modelos", icon: "⚙️" },
      { path: "/contabilidad/plan-cuentas", label: "Plan de Cuentas", icon: "🌳" },
      { path: "/contabilidad/asientos", label: "Libro Diario", icon: "📖" },
      { path: "/contabilidad/mayor", label: "Libro Mayor", icon: "🔍" },
      { path: "/contabilidad/sumas-saldos", label: "Sumas y Saldos", icon: "⚖️" },
      { path: "/contabilidad/conciliacion", label: "Conciliación tesorería", icon: "🏦" },
      { path: "/contabilidad/portal-estudio", label: "Cierres & IVA Digital", icon: "🏢" }
    ]
  },
  {
    id: "metrologia",
    label: "Metrología Legal",
    icon: "⚖️",
    gradient: "linear-gradient(135deg, #0d9488, #0f766e)",
    glow: "rgba(13, 148, 136, 0.35)",
    title: "LABORATORIO DE ENSAYOS & METROLOGÍA LEGAL",
    defaultPath: "/metrologia",
    pathPrefixes: ["/metrologia"],
    minimumPlan: "base",
    requiredPermission: "home.read",
    dependencies: [],
    items: [
      { path: "/metrologia", label: "Tablero", icon: "📊", end: true },
      { path: "/metrologia/equipos", label: "Gestión de Equipos", icon: "🏢" },
      { path: "/metrologia/patrones", label: "Gestión de Pesas Patrón", icon: "⚖️" },
      { path: "/metrologia/instrumentos", label: "Termómetros / Auxiliares", icon: "🌡️" },
      { path: "/metrologia/ensayos/nuevo", label: "Nuevo Ensayo", icon: "📝" },
      { path: "/metrologia/informes", label: "Informes de Ensayo", icon: "📋" }
    ]
  },
  {
    id: "calidad",
    label: "Calidad",
    icon: "📘",
    gradient: "linear-gradient(135deg, #0369a1, #0e7490)",
    glow: "rgba(3, 105, 161, 0.35)",
    title: "SISTEMA DE GESTIÓN DE CALIDAD · ISO/IEC 17025",
    defaultPath: "/calidad",
    pathPrefixes: ["/calidad"],
    minimumPlan: "base",
    requiredPermission: "home.read",
    dependencies: [],
    items: [
      { path: "/calidad", label: "Tablero SGC", icon: "📊", end: true },
      { path: "/calidad/documentos", label: "Árbol documental", icon: "🌲" },
      { path: "/calidad/registros", label: "Registros operativos", icon: "📋", end: true }
    ]
  },
  {
    id: "administracion",
    label: "Configuración",
    icon: "🛠️",
    gradient: "linear-gradient(135deg, #94a3b8, #475569)",
    glow: "rgba(71, 85, 105, 0.35)",
    title: "ADMINISTRACIÓN DEL SISTEMA",
    defaultPath: "/configuracion",
    pathPrefixes: ["/configuracion"],
    minimumPlan: "base",
    requiredPermission: "administration.read",
    dependencies: [],
    items: [
      { path: "/configuracion", label: "Empresa e integraciones", icon: "🏢", end: true },
      { path: "/configuracion/plantillas", label: "Plantillas de impresión", icon: "📄" },
      { path: "/configuracion/correo", label: "Cuentas de correo", icon: "✉️" },
      { path: "/configuracion/ayuda", label: "Ayuda Configuración", icon: "💡" }
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

export function resolveAllowedModuleIds(userRole: string, allowedModulesJson?: string | string[] | null): string[] {
  if (userRole === "Admin" || userRole === "Administrador") {
    return [
      "inicio", "directorio", "crm", "comunicaciones", "ventas", "compras", "inventario",
      "produccion", "finanzas", "rrhh", "flota", "cereales", "contabilidad", "metrologia", "calidad", "administracion"
    ];
  }

  const moduleMap: Record<string, string[]> = {
    sales: ["ventas"],
    crm: ["crm", "directorio", "comunicaciones"],
    communications: ["comunicaciones"],
    purchases: ["compras"],
    inventory: ["inventario", "produccion"],
    finance: ["finanzas"],
    fleet: ["flota"],
    hr: ["rrhh"],
    grains: ["cereales"],
    accounting: ["contabilidad"],
    metrology: ["metrologia"],
    quality: ["calidad"]
  };

  try {
    const raw = typeof allowedModulesJson === "string"
      ? JSON.parse(allowedModulesJson)
      : allowedModulesJson || [];
    const allowed = ["inicio"];
    (Array.isArray(raw) ? raw : []).forEach((entry: string) => {
      if (moduleMap[entry]) allowed.push(...moduleMap[entry]);
      else allowed.push(entry);
    });
    return allowed;
  } catch {
    return ["inicio", "ventas", "crm", "comunicaciones"];
  }
}

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
