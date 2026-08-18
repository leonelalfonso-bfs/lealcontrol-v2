/** Digits only. */
export function digitsOnly(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Format AR CUIT as XX-XXXXXXXX-X while typing. */
export function formatCuitDisplay(raw: string): string {
  const d = digitsOnly(raw).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

export function isValidCuitChecksum(raw: string): boolean {
  const digits = digitsOnly(raw);
  if (digits.length !== 11) return false;
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * multipliers[i];
  const remainder = sum % 11;
  let check = 11 - remainder;
  if (check === 11) check = 0;
  else if (check === 10) check = 9;
  return check === Number(digits[10]);
}

/**
 * Build WhatsApp click-to-chat URL (Argentina-friendly).
 * Accepts local numbers (15…) or full international.
 */
export function buildWhatsAppUrl(phone: string, message?: string): string | null {
  let digits = digitsOnly(phone);
  if (digits.length < 8) return null;

  // Strip leading 0 / 15 from AR mobiles when country code missing
  if (digits.startsWith("54")) {
    // ok
  } else if (digits.startsWith("549")) {
    // ok
  } else if (digits.startsWith("15") && digits.length >= 10) {
    digits = "549" + digits.slice(2);
  } else if (digits.length === 10) {
    digits = "54" + digits;
  } else if (digits.length === 8 || digits.length === 9) {
    digits = "549" + digits;
  }

  const base = `https://wa.me/${digits}`;
  if (!message?.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}

export const whatsAppTemplates = [
  {
    id: "followup",
    label: "Seguimiento",
    text: "Hola, te escribo desde Leal Control. ¿Tenés un momento para avanzar con la gestión pendiente?"
  },
  {
    id: "quote",
    label: "Cotización",
    text: "Hola, te comparto la cotización solicitada. Cualquier duda quedo a disposición."
  },
  {
    id: "collection",
    label: "Cobranza",
    text: "Hola, te contacto por el saldo pendiente. ¿Podemos coordinar el pago o enviarte el comprobante?"
  }
] as const;
