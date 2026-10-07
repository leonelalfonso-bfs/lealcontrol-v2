import type { Invoice } from "../api/types";

/** Recibo de cobro con lo necesario para imputarlo a facturas. */
export type ReceiptForImputation = {
  invoiceId?: string | null;
  invoicesSummary?: string | null;
  amount: number;
  currency?: string | null;
  invoiceAmount?: number | null;
  invoiceCurrency?: string | null;
  paymentExchangeRate?: number | null;
};

export type InvoiceCollection<T extends Invoice = Invoice> = T & {
  totalCobrado: number;
  saldoPendiente: number;
  paymentState: "Paid" | "Partial" | "Pending";
  isPaid: boolean;
  isPartial: boolean;
  isPending: boolean;
  daysSinceIssue: number;
  daysOverdue: number;
};

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Cobrado y saldo de cada factura según los recibos imputados (por id o por número en el resumen).
 * Misma regla que usa Facturación; también la usa el tablero "Hoy".
 */
export function withCollections<T extends Invoice>(invoices: readonly T[], receipts: readonly ReceiptForImputation[]): InvoiceCollection<T>[] {
  const now = Date.now();
  return invoices.map((inv) => {
    const totalCobrado = receipts
      .filter((r) => r.invoiceId === inv.id || (r.invoicesSummary && r.invoicesSummary.includes(inv.formattedNumber)))
      .reduce((sum, r) => {
        if (inv.currency === "USD") {
          if (r.invoiceAmount && r.invoiceCurrency === "USD") return sum + Number(r.invoiceAmount);
          if (r.currency === "USD") return sum + Number(r.amount);
          if (r.paymentExchangeRate && r.paymentExchangeRate > 0) return sum + Number(r.amount) / Number(r.paymentExchangeRate);
          if (inv.exchangeRate && inv.exchangeRate > 0) return sum + Number(r.amount) / Number(inv.exchangeRate);
        }
        return sum + (Number(r.amount) || 0);
      }, 0);

    const saldoPendiente = Math.max(0, inv.total - totalCobrado);
    const isPaid = totalCobrado >= inv.total - 0.01 && inv.total > 0;
    const isPartial = totalCobrado > 0.01 && saldoPendiente > 0.01;
    const isPending = totalCobrado <= 0.01;
    const paymentState: InvoiceCollection["paymentState"] = isPaid ? "Paid" : isPartial ? "Partial" : "Pending";

    return {
      ...inv,
      totalCobrado,
      saldoPendiente,
      paymentState,
      isPaid,
      isPartial,
      isPending,
      daysSinceIssue: Math.max(0, Math.floor((now - new Date(inv.issueDate).getTime()) / DAY_MS)),
      daysOverdue: Math.floor((now - new Date(inv.dueDate).getTime()) / DAY_MS)
    };
  });
}
