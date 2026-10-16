/** Importe en letras para el recibo de sueldo: "UN MILLÓN SEISCIENTOS DIECINUEVE MIL ... CON 66/100". */
const UNITS = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE",
  "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIÚN", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO",
  "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const TENS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function belowThousand(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const h = Math.floor(n / 100), rest = n % 100;
  const tens = rest < 30 ? UNITS[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` Y ${UNITS[rest % 10]}` : ""}`;
  return [HUNDREDS[h], tens].filter(Boolean).join(" ");
}

export function amountInWords(amount: number): string {
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const millions = Math.floor(whole / 1_000_000), thousands = Math.floor((whole % 1_000_000) / 1000), units = whole % 1000;
  const parts = [
    millions ? (millions === 1 ? "UN MILLÓN" : `${belowThousand(millions)} MILLONES`) : "",
    thousands ? (thousands === 1 ? "MIL" : `${belowThousand(thousands)} MIL`) : "",
    belowThousand(units)
  ].filter(Boolean);
  return `${parts.length ? parts.join(" ") : "CERO"} CON ${String(cents).padStart(2, "0")}/100`;
}
