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
  status?: string | null;
  /** Importe imputado a cada factura (en la moneda de la factura). */
  /** amount está en la moneda del recibo; amountUsd son los dólares que cancela en una factura USD. */
  imputations?: Array<{ invoiceId: string; amount: number; amountUsd?: number | null }> | null;
};

const VOIDED = ["voided", "cancelled", "anulado"];

export type InvoiceCollection<T extends Invoice = Invoice> = T & {
  totalCobrado: number;
  /** Notas de crédito autorizadas asociadas a la factura. */
  totalAcreditado: number;
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
  const credits = new Map<string, number>();
  for (const note of invoices) {
    // Las notas por diferencia de cambio se cancelan con el cobro que las origina: no acreditan la factura.
    if (note.invoiceType.startsWith("NC") && note.status === "Authorized" && note.associatedInvoiceId &&
        !note.exchangeDifferenceImputationId) {
      credits.set(note.associatedInvoiceId, (credits.get(note.associatedInvoiceId) ?? 0) + note.total);
    }
  }
  return invoices.map((inv) => {
    const isCreditNote = inv.invoiceType.startsWith("NC");
    const isExchangeDifference = Boolean(inv.exchangeDifferenceImputationId);
    // Solo cuenta lo imputado a esta factura por id. El número formateado no sirve para
    // imputar: Factura A, B y las notas pueden compartir 0001-00000001.
    const active = receipts.filter((r) => !VOIDED.includes((r.status || "").toLowerCase()));
    const imputed = active
      .flatMap((r) => (r.imputations ?? []).map((imp) => ({ imp, r })))
      .filter(({ imp }) => imp.invoiceId === inv.id)
      .reduce((sum, { imp, r }) => {
        if (inv.currency !== "USD" || (r.currency || "ARS") === "USD") return sum + (Number(imp.amount) || 0);
        // Factura en dólares cobrada en pesos: lo que cancela son los USD de la imputación.
        if (imp.amountUsd) return sum + Number(imp.amountUsd);
        const rate = Number(r.paymentExchangeRate) || Number(inv.exchangeRate) || 1;
        return sum + (Number(imp.amount) || 0) / rate;
      }, 0);
    const totalCobrado = imputed + active
      .filter((r) => !r.imputations?.length && r.invoiceId === inv.id)
      .reduce((sum, r) => {
        if (inv.currency === "USD") {
          if (r.invoiceAmount && r.invoiceCurrency === "USD") return sum + Number(r.invoiceAmount);
          if (r.currency === "USD") return sum + Number(r.amount);
          if (r.paymentExchangeRate && r.paymentExchangeRate > 0) return sum + Number(r.amount) / Number(r.paymentExchangeRate);
          if (inv.exchangeRate && inv.exchangeRate > 0) return sum + Number(r.amount) / Number(inv.exchangeRate);
        }
        return sum + (Number(r.amount) || 0);
      }, 0);

    // Una nota de crédito no es un saldo a cobrar: descuenta el de su factura original.
    const totalAcreditado = isCreditNote ? 0 : credits.get(inv.id) ?? 0;
    const settled = isCreditNote || isExchangeDifference;
    const saldoPendiente = settled ? 0 : Math.max(0, inv.total - totalCobrado - totalAcreditado);
    const isPaid = settled || (saldoPendiente <= 0.01 && inv.total > 0);
    const isPartial = !isPaid && totalCobrado + totalAcreditado > 0.01;
    const isPending = !isPaid && !isPartial;
    const paymentState: InvoiceCollection["paymentState"] = isPaid ? "Paid" : isPartial ? "Partial" : "Pending";

    return {
      ...inv,
      totalCobrado,
      totalAcreditado,
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
