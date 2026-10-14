/**
 * Día calendario en Argentina (yyyy-mm-dd). `new Date().toISOString()` da el día en UTC, que
 * después de las 21 h ya es mañana: no usarlo para fechas por defecto de comprobantes.
 */
export function todayAr(): string {
  return addDaysAr(0);
}

export function addDaysAr(days: number): string {
  const base = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return base.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

/** Primer y último día (yyyy-mm-dd) del mes en Argentina; `monthsBack` = 1 es el mes anterior. */
export function monthRangeAr(monthsBack = 0): { from: string; to: string } {
  const [y, m] = todayAr().split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 - monthsBack, 1));
  const last = new Date(Date.UTC(y, m - monthsBack, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}
