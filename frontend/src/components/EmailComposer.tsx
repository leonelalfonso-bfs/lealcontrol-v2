import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { CommercialCircuitReport, MailAccount } from "../api/types";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { buildEmailHtml, buildSignatureHtml } from "./communications/emailSignature";

export type EmailAttachmentPayload = {
  fileName: string;
  contentType: string;
  contentBase64: string;
};

export type EmailContext = {
  entityType: string;
  entityId: string;
  conversationId?: string;
  to?: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  /** Genera el PDF del documento al enviar (marcado por defecto). */
  documentPdf?: { elementId: string; fileName: string };
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ENTITY_LABELS: Record<string, string> = {
  Invoice: "la factura",
  Quote: "el presupuesto",
  Order: "el pedido",
  Remito: "el remito",
  Customer: "la ficha del cliente",
  AccountStatement: "la cuenta corriente del cliente"
};

export const entityLabel = (entityType: string) => ENTITY_LABELS[entityType] ?? "el documento";

export async function buildPdfAttachment(elementId: string, fileName: string): Promise<EmailAttachmentPayload> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("No se encontró el documento para adjuntar.");
  const html2pdf = await loadHtml2Pdf();
  const worker = html2pdf().set({
    margin: [8, 10, 8, 10],
    image: { type: "jpeg", quality: 0.92 },
    html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "var(--lc-surface)", windowWidth: 794 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"] }
  }).from(element);
  const pdf = await worker.toPdf().get("pdf");
  const dataUri = pdf.output("datauristring") as string;
  const contentBase64 = dataUri.split(",")[1] || "";
  if (!contentBase64) throw new Error("No se pudo generar el PDF del documento.");
  const size = Math.ceil((contentBase64.length * 3) / 4);
  if (size > MAX_ATTACHMENT_BYTES) throw new Error("El PDF supera el tope de 10 MB.");
  return { fileName, contentType: "application/pdf", contentBase64 };
}

export function EmailComposer({ context, onClose, onSent }: { context: EmailContext; onClose: () => void; onSent?: () => void }) {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState(context.to ?? "");
  const [subject, setSubject] = useState(context.subject);
  const [body, setBody] = useState(context.body);
  const [attachDocument, setAttachDocument] = useState(Boolean(context.documentPdf));
  const [circuit, setCircuit] = useState<CommercialCircuitReport | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listMailAccounts().then((items) => {
      const active = items.filter((x) => x.isActive);
      setAccounts(active);
      setAccountId(active.find((x) => x.isDefaultSender)?.id ?? active[0]?.id ?? "");
    }).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!context.conversationId) return;
    api.getCommercialCheck(context.conversationId).then(setCircuit).catch(() => setCircuit(null));
  }, [context.conversationId]);

  const suggestReply = async () => {
    if (!context.conversationId) return;
    setDrafting(true);
    setError(null);
    setDraftNote(null);
    try {
      const res = await api.generateAiReplyDraft(context.conversationId);
      if (res.circuit) setCircuit(res.circuit);
      if (res.ok && res.body) {
        setBody(res.body);
        setDraftNote("Borrador armado con el estado real del circuito. Revisalo y editalo antes de enviar.");
      } else {
        setError(res.error || "No se pudo generar el borrador.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const signature = selectedAccount?.signature?.trim() || "";
  const signatureLogoUrl = selectedAccount?.signatureLogoUrl?.trim() || "";

  const withSignature = (text: string) => {
    if (!signature) return text;
    const marker = `--\n${signature}`;
    if (text.includes(marker) || text.trimEnd().endsWith(signature)) return text;
    const trimmed = text.trimEnd();
    return trimmed ? `${trimmed}\n\n${marker}` : marker;
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const attachments: EmailAttachmentPayload[] = [];
      if (attachDocument && context.documentPdf) {
        attachments.push(await buildPdfAttachment(context.documentPdf.elementId, context.documentPdf.fileName));
      }
      const finalText = withSignature(body);
      const htmlBody = buildEmailHtml(body, signature, signatureLogoUrl);
      await api.sendEmail(accountId, {
        to: to.split(/[,;]+/).map((x) => x.trim()).filter(Boolean),
        subject,
        htmlBody,
        textBody: finalText,
        relatedEntityType: context.entityType,
        relatedEntityId: context.entityId,
        inReplyTo: context.inReplyTo ?? null,
        attachments: attachments.length ? attachments : undefined
      });
      onSent?.();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal-card email-composer" onSubmit={(event) => void send(event)}>
        <div className="section-head">
          <div><span className="eyebrow">NUEVO EMAIL</span><h2>Enviar desde Leal Control</h2></div>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        {error && <div className="alert">{error}</div>}
        {accounts.length === 0 && <div className="alert">Primero conectá una casilla en <a href="/configuracion/comunicaciones">Configuración → Comunicaciones</a>.</div>}
        <label>Desde
          <select required value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Seleccionar cuenta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.displayName} &lt;{a.emailAddress}&gt;</option>)}
          </select>
        </label>
        <label>Para<input required type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@empresa.com" /></label>
        <label>Asunto<input required value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        {circuit && (
          <div className="card pad" style={{ background: "var(--lc-surface-2)", gap: 6, display: "grid" }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <strong className="t-small">Estado del circuito comercial</strong>
              <span className={`badge ${circuit.isComplete ? "ok" : "warn"}`}>
                {circuit.isComplete ? "Al día" : `${circuit.missingItems.length} pendiente${circuit.missingItems.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <div className="muted t-small">
              {circuit.customer ? `Cliente: ${circuit.customer.name}` : circuit.lead ? `Prospecto: ${circuit.lead.name}` : "Sin cliente vinculado"}
              {circuit.opportunity ? ` · Oportunidad: ${circuit.opportunity.stageLabel}` : ""}
              {circuit.quotes.length > 0
                ? ` · Último presupuesto: ${circuit.quotes[0].number} (Rev. ${circuit.quotes[0].revision}, ${circuit.quotes[0].statusLabel})`
                : " · Sin presupuesto"}
            </div>
            {circuit.missingItems.length > 0 && (
              <ul className="t-small" style={{ margin: "2px 0 0 16px", padding: 0 }}>
                {circuit.missingItems.slice(0, 3).map((item) => (
                  <li key={item.code}>{item.text}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className="t-small t-strong">Mensaje</span>
          {context.conversationId && (
            <button type="button" className="btn btn-outline compact" disabled={drafting || busy} onClick={() => void suggestReply()}>
              {drafting ? "Armando borrador…" : "✨ Sugerir respuesta (IA)"}
            </button>
          )}
        </div>
        {draftNote && <div className="success-banner" style={{ margin: 0 }}>{draftNote}</div>}
        <textarea required rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        {(signature || signatureLogoUrl) && (
          <div className="card pad" style={{ background: "white", marginTop: -4 }}>
            <div className="muted t-small" style={{ marginBottom: 4 }}>
              Firma que se agregará al enviar ({selectedAccount?.displayName}):
            </div>
            <div dangerouslySetInnerHTML={{ __html: buildSignatureHtml(signature, signatureLogoUrl) }} />
          </div>
        )}
        {context.documentPdf && (
          <label className="email-attach-row">
            <input type="checkbox" checked={attachDocument} onChange={(e) => setAttachDocument(e.target.checked)} />
            Adjuntar PDF del documento ({context.documentPdf.fileName})
          </label>
        )}
        <div className="email-link-note">El correo queda registrado en {entityLabel(context.entityType)}.</div>
        <div className="toolbar">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={busy || !accountId}>{busy ? "Enviando…" : "Enviar email"}</button>
        </div>
      </form>
    </div>
  );
}
