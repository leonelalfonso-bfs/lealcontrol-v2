/**
 * Conversión de importes numéricos a palabras en español (formato legal comercial y bancario argentino).
 * Ejemplo: 124500.50 -> "SON PESOS CIENTO VEINTICUATRO MIL QUINIENTOS CON 50/100"
 */

const UNIDADES: string[] = [
  "",
  "UN",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISÉIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
  "VEINTE",
  "VEINTIÚN",
  "VEINTIDÓS",
  "VEINTITRÉS",
  "VEINTICUATRO",
  "VEINTICINCO",
  "VEINTISÉIS",
  "VEINTISIETE",
  "VEINTIOCHO",
  "VEINTINUEVE"
];

const DECENAS: string[] = [
  "",
  "DIEZ",
  "VEINTE",
  "TREINTA",
  "CUARENTA",
  "CINCUENTA",
  "SESENTA",
  "SETENTA",
  "OCHENTA",
  "NOVENTA"
];

const CENTENAS: string[] = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS"
];

function convertGroup(n: number): string {
  let output = "";

  if (n === 100) {
    return "CIEN";
  }

  if (n >= 100) {
    const c = Math.floor(n / 100);
    output += CENTENAS[c] + " ";
    n %= 100;
  }

  if (n <= 29) {
    output += UNIDADES[n];
  } else {
    const d = Math.floor(n / 10);
    const u = n % 10;
    output += DECENAS[d];
    if (u > 0) {
      output += " Y " + UNIDADES[u];
    }
  }

  return output.trim();
}

export function numberToWords(amount: number, currency: string = "ARS"): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return "";
  }

  const absAmount = Math.abs(amount);
  const integerPart = Math.floor(absAmount);
  const decimalPart = Math.round((absAmount - integerPart) * 100);

  let prefix = "";
  if (currency.toUpperCase() === "USD" || currency.toUpperCase() === "USD_DIVISA" || currency.toUpperCase() === "USD_BILLETE") {
    prefix = integerPart === 1 ? "SON DÓLARES ESTADOUNIDENSES" : "SON DÓLARES ESTADOUNIDENSES";
  } else {
    prefix = integerPart === 1 ? "SON PESOS" : "SON PESOS";
  }

  if (integerPart === 0) {
    const centsFormatted = String(decimalPart).padStart(2, "0");
    return `${prefix} CERO CON ${centsFormatted}/100`;
  }

  const millions = Math.floor(integerPart / 1000000);
  const thousands = Math.floor((integerPart % 1000000) / 1000);
  const units = integerPart % 1000;

  const parts: string[] = [];

  // Millones
  if (millions > 0) {
    if (millions === 1) {
      parts.push("UN MILLÓN");
    } else {
      parts.push(convertGroup(millions) + " MILLONES");
    }
  }

  // Miles
  if (thousands > 0) {
    if (thousands === 1) {
      parts.push("MIL");
    } else {
      parts.push(convertGroup(thousands) + " MIL");
    }
  }

  // Unidades
  if (units > 0) {
    parts.push(convertGroup(units));
  }

  const centsFormatted = String(decimalPart).padStart(2, "0");
  const words = parts.join(" ").trim();

  return `${prefix} ${words} CON ${centsFormatted}/100`;
}
