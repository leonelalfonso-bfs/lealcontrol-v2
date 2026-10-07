/**
 * Regla única de búsqueda del sistema (la misma que SearchText en el backend):
 * - sin distinguir mayúsculas ni acentos ("metalurgica" encuentra "Metalúrgica");
 * - varias palabras en cualquier orden, y todas deben aparecer ("sur metal");
 * - números con 3 dígitos o más se comparan solo por dígitos (CUIT y teléfono con o sin guiones).
 */

const ACCENT_FROM = "áàäâãéèëêíìïîóòöôõúùüûñç";
const ACCENT_TO = "aaaaaeeeeiiiiooooouuuunc";

export function foldSearch(value: string | null | undefined): string {
  if (!value) return "";
  let out = "";
  for (const ch of value.toLowerCase()) {
    const index = ACCENT_FROM.indexOf(ch);
    out += index >= 0 ? ACCENT_TO[index] : ch;
  }
  return out;
}

const digitsOf = (value: string) => value.replace(/\D+/g, "");

export type SearchToken = { text: string; digits: string };

export function parseSearch(query: string | null | undefined): SearchToken[] {
  if (!query) return [];
  const seen = new Set<string>();
  return query
    .split(/\s+/)
    .map((word) => ({ text: foldSearch(word.trim()), digits: digitsOf(word) }))
    .filter((token) => {
      if (!token.text || seen.has(token.text)) return false;
      seen.add(token.text);
      return true;
    });
}

/** true si cada palabra de la búsqueda aparece en alguno de los campos. */
export function matchesSearch(query: string | SearchToken[], ...fields: Array<string | number | null | undefined>): boolean {
  const tokens = typeof query === "string" ? parseSearch(query) : query;
  if (tokens.length === 0) return true;
  const texts = fields.filter((f) => f !== null && f !== undefined && f !== "").map((f) => String(f));
  const folded = texts.map(foldSearch);
  const digits = texts.map(digitsOf).filter((d) => d.length > 0);
  return tokens.every(
    (token) =>
      folded.some((text) => text.includes(token.text)) ||
      (token.digits.length >= 3 && digits.some((d) => d.includes(token.digits)))
  );
}

/** Filtra una lista con la regla común. `fields` devuelve los textos buscables de cada ítem. */
export function filterBySearch<T>(items: readonly T[], query: string, fields: (item: T) => Array<string | number | null | undefined>): T[] {
  const tokens = parseSearch(query);
  if (tokens.length === 0) return [...items];
  return items.filter((item) => matchesSearch(tokens, ...fields(item)));
}

/**
 * Parte un texto en tramos para resaltar las coincidencias (insensible a acentos).
 * Devuelve [{ text, match }] conservando el texto original.
 */
export function highlightSearch(text: string, query: string | SearchToken[]): Array<{ text: string; match: boolean }> {
  const tokens = typeof query === "string" ? parseSearch(query) : query;
  if (!text || tokens.length === 0) return [{ text, match: false }];
  const folded = foldSearch(text);
  const marks = new Array<boolean>(text.length).fill(false);
  for (const token of tokens) {
    let from = 0;
    while (token.text && from <= folded.length) {
      const at = folded.indexOf(token.text, from);
      if (at < 0) break;
      for (let i = at; i < at + token.text.length; i++) marks[i] = true;
      from = at + token.text.length;
    }
    // CUIT/teléfono: la coincidencia por dígitos ignora guiones y espacios del texto.
    if (token.digits.length >= 3) {
      const positions: number[] = [];
      for (let i = 0; i < text.length; i++) if (text[i] >= "0" && text[i] <= "9") positions.push(i);
      const digits = positions.map((i) => text[i]).join("");
      let at = digits.indexOf(token.digits);
      while (at >= 0) {
        const start = positions[at];
        const end = positions[at + token.digits.length - 1];
        for (let i = start; i <= end; i++) marks[i] = true;
        at = digits.indexOf(token.digits, at + token.digits.length);
      }
    }
  }
  const parts: Array<{ text: string; match: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], match: marks[i] });
  }
  return parts;
}
