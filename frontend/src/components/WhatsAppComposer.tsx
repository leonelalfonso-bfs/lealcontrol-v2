import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildPdfAttachment, entityLabel, type EmailContext } from "./EmailComposer";

type Props = {
  context: Omit<EmailContext, "subject" | "to"> & { phone?: string | null };
  onClose: () => void;
  onSent?: () => void;
};

/**
 * Envía el documento (PDF) por WhatsApp desde la línea del usuario conectado. El envío queda
 * en la conversación del cliente en la bandeja.
 */
export function WhatsAppComposer({ context, onClose, onSent }: Props) {
  const { user } = useAuth();
  const [to, setTo] = useState(context.phone ?? "");
  const [message, setMessage] = useState(context.body);
  const [attachDocument, setAttachDocument] = useState(Boolean(context.documentPdf));
  const [connected, setConnected] = useState<boolean | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getWhatsAppStatus(user?.id)
      .then((status) => {
        const ok = Boolean(status.isConnected) || ["open", "connected"].includes((status.state || "").toLowerCase());
        setConnected(ok);
        setLine(status.phoneNumber ?? null);
      })
      .catch(() => setConnected(false));
  }, [user?.id]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const digits = to.replace(/\D/g, "");
    if (digits.length < 8) {
      setError("Cargá el número con código de área, por ejemplo 341 555 1234 (o 549341…).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pdf = attachDocument && context.documentPdf
        ? await buildPdfAttachment(context.documentPdf.elementId, context.documentPdf.fileName)
        : null;
      const result = await api.sendWhatsAppMessage({
        to: digits,
        message,
        ...(pdf
          ? { mediaBase64: pdf.contentBase64, mediaType: "document", mimeType: pdf.contentType, fileName: pdf.fileName }
          : {}),
        relatedEntityType: context.entityType,
        relatedEntityId: context.entityId
      });
      if (!result.success) throw new Error(result.error || "WhatsApp no confirmó el envío.");
      onSent?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar por WhatsApp.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal-card email-composer" onSubmit={(event) => void send(event)}>
        <div className="section-head">
          <div><span className="eyebrow">WHATSAPP</span><h2>Enviar por WhatsApp</h2></div>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        {error && <div className="alert">{error}</div>}
        {connected === false && (
          <div className="alert">
            Tu WhatsApp no está conectado. Conectalo en{" "}
            <Link to="/configuracion/comunicaciones?canal=mensajeria">Configuración → Comunicaciones</Link>.
          </div>
        )}
        {connected && (
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            Sale desde tu WhatsApp{line ? ` (${line})` : ""}.
          </div>
        )}
        <label>Para (celular del cliente)
          <input required value={to} onChange={(e) => setTo(e.target.value)} placeholder="341 555 1234" inputMode="tel" />
        </label>
        <label>Mensaje<textarea required rows={8} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        {context.documentPdf && (
          <label className="email-attach-row">
            <input type="checkbox" checked={attachDocument} onChange={(e) => setAttachDocument(e.target.checked)} />
            Adjuntar PDF ({context.documentPdf.fileName})
          </label>
        )}
        <div className="email-link-note">El envío queda en la conversación del cliente y registrado en {entityLabel(context.entityType)}.</div>
        <div className="toolbar">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={busy || connected === false}>{busy ? "Enviando…" : "Enviar por WhatsApp"}</button>
        </div>
      </form>
    </div>
  );
}
