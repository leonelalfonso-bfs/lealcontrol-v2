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
