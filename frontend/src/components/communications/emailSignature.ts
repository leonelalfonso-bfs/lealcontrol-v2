/** Escapa texto plano para insertarlo de forma segura en HTML de correo. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Construye el bloque HTML de la firma (compatible con Gmail, Outlook, Apple Mail y la bandeja). */
export function buildSignatureHtml(signatureText?: string | null, signatureLogoUrl?: string | null): string {
  const text = (signatureText ?? "").trim();
  const logo = (signatureLogoUrl ?? "").trim();
  if (!text && !logo) return "";

  const lines = text
    ? text.split(/\r?\n/).map((line, idx) => {
        const safe = escapeHtml(line.trim());
        if (!safe) return "<br/>";
        if (idx === 0) return `<div style="font-weight:700;color:#0f172a;font-size:14px;line-height:1.4;">${safe}</div>`;
        return `<div style="color:#475569;font-size:13px;line-height:1.45;">${safe}</div>`;
      }).join("")
    : "";

  const safeLogo = logo && (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(logo) || /^https?:\/\//i.test(logo))
    ? logo
    : "";

  if (safeLogo && lines) {
    return `<div style="margin-top:20px;padding-top:14px;border-top:1px solid #e2e8f0;">
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
    <tr>
      <td style="vertical-align:middle;padding-right:14px;">
        <img src="${safeLogo}" alt="Logo" style="display:block;max-height:58px;max-width:160px;width:auto;height:auto;" />
      </td>
      <td style="vertical-align:middle;border-left:2px solid #cbd5e1;padding-left:14px;">
        ${lines}
      </td>
    </tr>
  </table>
</div>`;
  }

  if (safeLogo) {
    return `<div style="margin-top:20px;padding-top:14px;border-top:1px solid #e2e8f0;">
  <img src="${safeLogo}" alt="Logo" style="display:block;max-height:58px;max-width:160px;width:auto;height:auto;" />
</div>`;
  }

  return `<div style="margin-top:20px;padding-top:14px;border-top:1px solid #e2e8f0;font-family:Arial,Helvetica,sans-serif;">
  ${lines}
</div>`;
}

/** Arma el cuerpo HTML completo del mail saliente con tipografía prolija y firma con logo. */
export function buildEmailHtml(bodyText: string, signatureText?: string | null, signatureLogoUrl?: string | null): string {
  const safeBody = escapeHtml(bodyText.trimEnd()).replace(/\r?\n/g, "<br/>");
  const signatureHtml = buildSignatureHtml(signatureText, signatureLogoUrl);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937;">${safeBody}${signatureHtml}</div>`;
}

/** Envuelve el HTML de un mail entrante con estilos base para que firmas, tablas e imágenes se vean completas y prolijas. */
export function wrapIncomingEmailHtml(rawHtml: string): string {
  let html = rawHtml.trim();
  if (/&lt;|&gt;|&amp;lt;|&amp;gt;/i.test(html)) {
    const holder = document.createElement("textarea");
    holder.innerHTML = html;
    html = holder.value;
  }

  const baseStyle = `<style>
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
  word-break: break-word;
}
body { padding: 14px 16px; box-sizing: border-box; }
img { max-width: 100% !important; height: auto !important; }
table { max-width: 100% !important; }
pre { white-space: pre-wrap; max-width: 100%; }
a { color: #2563eb; }
blockquote {
  border-left: 3px solid #cbd5e1;
  margin: 10px 0;
  padding: 4px 0 4px 12px;
  color: #475569;
}
</style>`;

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseStyle}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseStyle}</head>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8" />${baseStyle}</head><body>${html}</body></html>`;
}

/** Redimensiona un archivo de imagen en el navegador a un data URI liviano (ideal para logos de firma). */
export function readLogoAsDataUrl(file: File, maxWidth = 320, maxHeight = 140): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Elegí un archivo de imagen (PNG, JPG, WebP o GIF)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        if (scale >= 1 && file.size <= 150_000) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
