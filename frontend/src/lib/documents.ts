/** Tipos de comprobante de venta: A, B, NC_A, ND_B, FCE_A, NC_FCE_A, Proforma… */

export const isFceType = (type: string) => type.includes("FCE_");

/** Letra del comprobante (A, B, C…). */
export const letterOf = (type: string) => (type === "Proforma" ? "" : type.slice(-1));

/** Tipo de la factura sin prefijo de nota: "NC_FCE_A" → "FCE_A". */
export const baseTypeOf = (type: string) => type.replace(/^(NC_|ND_)/, "");

/** Nombre legible del comprobante. */
export function documentLabel(type: string): string {
  if (type === "Proforma") return "Proforma";
  const letter = letterOf(type);
  const fce = isFceType(type);
  const kind = type.startsWith("NC_") ? "Nota de Crédito" : type.startsWith("ND_") ? "Nota de Débito" : "Factura";
  if (!fce) return `${kind} ${letter}`;
  return kind === "Factura" ? `Factura de Crédito Electrónica ${letter}` : `${kind} FCE ${letter}`;
}

/** Comprobantes que se autorizan en ARCA por WSFE. */
export const ARCA_TYPES = ["A", "B", "NC_A", "NC_B", "ND_A", "ND_B",
  "FCE_A", "NC_FCE_A", "ND_FCE_A", "FCE_B", "NC_FCE_B", "ND_FCE_B"];
