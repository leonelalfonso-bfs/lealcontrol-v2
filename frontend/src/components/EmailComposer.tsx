import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { MailAccount } from "../api/types";

export type EmailContext = { entityType: string; entityId: string; to?: string; subject: string; body: string; inReplyTo?: string | null };

export function EmailComposer({ context, onClose, onSent }: { context: EmailContext; onClose: () => void; onSent?: () => void }) {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState(context.to ?? "");
  const [subject, setSubject] = useState(context.subject);
  const [body, setBody] = useState(context.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.listMailAccounts().then((items) => { const active = items.filter((x) => x.isActive); setAccounts(active); setAccountId(active.find((x) => x.isDefaultSender)?.id ?? active[0]?.id ?? ""); }).catch((e: Error) => setError(e.message)); }, []);
  const send = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await api.sendEmail(accountId, { to: to.split(/[,;]+/).map((x) => x.trim()).filter(Boolean), subject, htmlBody: `<div style="font-family:Arial,sans-serif;white-space:pre-line">${body.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</div>`, textBody: body, relatedEntityType: context.entityType, relatedEntityId: context.entityId, inReplyTo: context.inReplyTo ?? null });
      onSent?.(); onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop"><form className="modal-card email-composer" onSubmit={send}>
    <div className="section-head"><div><span className="eyebrow">NUEVO EMAIL</span><h2>Enviar desde Leal Control</h2></div><button type="button" className="icon-button" onClick={onClose}>×</button></div>
    {error && <div className="alert">{error}</div>}{accounts.length === 0 && <div className="alert">Primero conectá una cuenta desde Administración → Cuentas de correo.</div>}
    <label>Desde<select required value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Seleccionar cuenta</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.displayName} &lt;{a.emailAddress}&gt;</option>)}</select></label>
    <label>Para<input required type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@empresa.com" /></label>
    <label>Asunto<input required value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
    <label>Mensaje<textarea required rows={10} value={body} onChange={(e) => setBody(e.target.value)} /></label>
    <div className="email-link-note">El correo quedará vinculado automáticamente con {context.entityType}.</div>
    <div className="toolbar"><button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy || !accountId}>{busy ? "Enviando…" : "Enviar email"}</button></div>
  </form></div>;
}
