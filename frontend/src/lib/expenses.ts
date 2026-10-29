import type { ExpenseCategory, ExpenseLine, ExpensePolicy, ExpenseVoucherType } from "../api/types/finance";

/** Categorías de la planilla de rendición FS 7.1 901 R2, en su orden. */
export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  Lodging: "Hospedaje", Meal: "Comida", Snack: "Refrigerio", Fuel: "Combustible", Taxi: "Taxis / Remises",
  Hardware: "Ferretería", VehicleMaintenance: "Mantenimiento vehículo", Other: "Otros"
};

export const EXPENSE_VOUCHERS: Record<ExpenseVoucherType, string> = {
  A: "Factura A", B: "Factura B", C: "Factura C", Ticket: "Ticket", Recibo: "Recibo", SinComprobante: "Sin comprobante"
};

/** Tope en pesos del renglón según la política (por persona), o null si la categoría no tiene. */
export function expenseLimitArs(policy: ExpensePolicy, line: Pick<ExpenseLine, "category" | "people">, usdRate: number): number | null {
  const people = Math.max(1, line.people);
  if (line.category === "Meal") return policy.mealUsd * people * usdRate;
  if (line.category === "Snack") return policy.snackUsd * people * usdRate;
  if (line.category === "Lodging") return (people >= 2 ? policy.lodgingTwoUsd + policy.lodgingOneUsd * (people - 2) : policy.lodgingOneUsd) * usdRate;
  return null;
}
