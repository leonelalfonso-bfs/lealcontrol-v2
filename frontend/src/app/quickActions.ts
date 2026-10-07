import type { IconName } from "../components/ui/Icon";

export type QuickAction = {
  id: string;
  /** Qué se crea, en singular: "Presupuesto", "Cliente"… */
  label: string;
  /** Texto de la acción con su género correcto: "Nueva factura", "Nuevo cliente". */
  title: string;
  path: string;
  /** Módulo que tiene que estar habilitado para ofrecer la acción. */
  moduleId: string;
  glyph: IconName;
  /** Palabras extra para el buscador ⌘K. */
  keywords?: string;
};

/** Altas frecuentes: menú "Nuevo" de la barra superior y sección "Crear" del buscador ⌘K. */
export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: "quote", title: "Nuevo presupuesto", label: "Presupuesto", path: "/presupuestos/nuevo", moduleId: "ventas", glyph: "document", keywords: "cotizacion oferta" },
  { id: "invoice", title: "Nueva factura", label: "Factura", path: "/facturas/nueva", moduleId: "ventas", glyph: "receipt", keywords: "arca cae comprobante" },
  { id: "order", title: "Nuevo pedido de venta", label: "Pedido de venta", path: "/pedidos/nuevo", moduleId: "ventas", glyph: "filePlus" },
  { id: "remito", title: "Nuevo remito", label: "Remito", path: "/remitos/nuevo", moduleId: "ventas", glyph: "truck", keywords: "entrega" },
  { id: "customer", title: "Nuevo cliente", label: "Cliente", path: "/clientes/nuevo", moduleId: "directorio", glyph: "building", keywords: "empresa cuit" },
  { id: "supplier", title: "Nuevo proveedor", label: "Proveedor", path: "/proveedores/nuevo", moduleId: "directorio", glyph: "building" },
  { id: "product", title: "Nuevo producto", label: "Producto", path: "/productos/nuevo", moduleId: "inventario", glyph: "package", keywords: "articulo servicio catalogo" },
  { id: "purchase-order", title: "Nueva orden de compra", label: "Orden de compra", path: "/compras/ordenes/nueva", moduleId: "compras", glyph: "cart" },
  { id: "purchase-invoice", title: "Nueva factura de proveedor", label: "Factura de proveedor", path: "/compras/facturas/nueva", moduleId: "compras", glyph: "receipt" },
  { id: "collection", title: "Nuevo recibo de cobro", label: "Recibo de cobro", path: "/finanzas/cobranzas", moduleId: "finanzas", glyph: "wallet", keywords: "cobranza" },
  { id: "payment", title: "Nueva orden de pago", label: "Orden de pago", path: "/finanzas/pagos/nueva", moduleId: "finanzas", glyph: "wallet", keywords: "pago proveedor" },
  { id: "calibration", title: "Nuevo ensayo de metrología", label: "Ensayo de metrología", path: "/metrologia/ensayos/nuevo", moduleId: "metrologia", glyph: "scale", keywords: "calibracion balanza informe" }
];

export function allowedQuickActions(allowedModuleIds: readonly string[]): QuickAction[] {
  return QUICK_ACTIONS.filter((action) => allowedModuleIds.includes(action.moduleId));
}
