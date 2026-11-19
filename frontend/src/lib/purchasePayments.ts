import type { PurchaseInvoice } from "../api/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Lo pagado de una factura de compra: lo imputado a esa factura (por id) en órdenes de pago vigentes.
 * Las órdenes viejas sin imputación por id cuentan por número de factura y proveedor.
 */
export function paidOf(inv: PurchaseInvoice, paymentOrders: any[]): number {
  const activeOrders = paymentOrders.filter((po: any) => !["voided", "cancelled", "anulado"].includes(String(po.status || "").toLowerCase()));
  const imputed = activeOrders
    .flatMap((po: any) => po.imputations ?? [])
    .filter((imp: any) => imp.invoiceId === inv.id)
    .reduce((sum: number, imp: any) => sum + (Number(imp.amount) || 0), 0);
  return imputed + activeOrders
    .filter((po: any) => !po.imputations?.length && po.invoicesSummary && po.invoicesSummary.includes(inv.formattedNumber) && po.supplierId === inv.supplierId)
    .reduce((sum: number, po: any) => {
      if (inv.currency === "USD") {
        if (po.currency === "USD") return sum + Number(po.amount);
        if (po.exchangeRate && po.exchangeRate > 0) return sum + Number(po.amount) / Number(po.exchangeRate);
        if (inv.exchangeRate && inv.exchangeRate > 0) return sum + Number(po.amount) / Number(inv.exchangeRate);
      }
      return sum + (Number(po.amount) || 0);
    }, 0);
}

/** Saldo pendiente de pago (nunca negativo). */
export const pendingOf = (inv: PurchaseInvoice, paymentOrders: any[]) => Math.max(0, Math.round((inv.total - paidOf(inv, paymentOrders)) * 100) / 100);
