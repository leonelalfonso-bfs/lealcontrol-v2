const ALLOWED = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "H2", "H3", "SPAN", "DIV"]);

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function sanitizeRichText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const clean = (node: Node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (!ALLOWED.has(el.tagName)) {
        const parent = el.parentNode;
        while (el.firstChild) parent?.insertBefore(el.firstChild, el);
        parent?.removeChild(el);
        clean(node);
        return;
      }
      const fontSize = el.style.fontSize;
      [...el.attributes].forEach((attr) => el.removeAttribute(attr.name));
      if ((el.tagName === "SPAN" || el.tagName === "DIV") && /^\d+(?:\.\d+)?(?:px|pt)$/.test(fontSize)) {
        el.style.fontSize = fontSize;
      }
      clean(el);
    });
  };
  clean(doc.body);
  return doc.body.innerHTML.trim();
}

export function plainToRich(value: string): string {
  const text = value.trim();
  if (!text) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return sanitizeRichText(text);
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeText(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function richTextIsEmpty(value: string): boolean {
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text.length === 0;
}
