import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { MailAccount } from "../api/types";

type Provider = "Custom" | "Gmail" | "Microsoft" | "Yahoo";
const presets: Record<Provider, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; authMode: string }> = {
  Gmail: { imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465, authMode: "AppPassword" },
  Microsoft: { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587, authMode: "OAuth2" },
  Yahoo: { imapHost: "imap.mail.yahoo.com", imapPort: 993, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, authMode: "AppPassword" },
  Custom: { imapHost: "", imapPort: 993, smtpHost: "", smtpPort: 587, authMode: "Password" }
};

const empty = { id: "", displayName: "", emailAddress: "", provider: "Custom" as Provider, authMode: "Password", imapHost: "", imapPort: 993, imapUseSsl: true, smtpHost: "", smtpPort: 587, smtpUseSsl: true, username: "", secret: "", isActive: true, isDefaultSender: false };

export function MailSettingsPage() {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.listMailAccounts().then(setAccounts).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);

  const chooseProvider = (provider: Provider) => {
    const preset = presets[provider];
    setForm({ ...form, provider, ...preset, secret: "" });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      await api.saveMailAccount({ id: form.id || null, settings: { displayName: form.displayName, emailAddress: form.emailAddress, provider: form.provider, authMode: form.authMode, imapHost: form.imapHost, imapPort: Number(form.imapPort), imapUseSsl: form.imapUseSsl, smtpHost: form.smtpHost, smtpPort: Number(form.smtpPort), smtpUseSsl: form.smtpUseSsl, username: form.username || null, isActive: form.isActive, isDefaultSender: form.isDefaultSender }, secret: form.secret || null });
      setMessage("Casilla guardada de forma segura."); setForm(empty); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const action = async (account: MailAccount, kind: "test" | "sync") => {
    setBusy(true); setError(null); setMessage(null);
    try {
      if (kind === "test") { await api.testMailAccount(account.id); setMessage(`Conexión correcta con ${account.emailAddress}.`); }
      else { const result = await api.syncMailAccount(account.id); setMessage(`Sincronización terminada: ${result.received} mensajes nuevos.`); }
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const edit = (account: MailAccount) => {
    setError(null); setMessage(null);
    setForm({
      id: account.id, displayName: account.displayName, emailAddress: account.emailAddress,
      provider: account.provider as Provider,
      authMode: account.provider === "Gmail" ? "AppPassword" : account.authMode,
      imapHost: account.imapHost, imapPort: account.imapPort, imapUseSsl: account.imapUseSsl,
      smtpHost: account.smtpHost, smtpPort: account.smtpPort, smtpUseSsl: account.smtpUseSsl,
      username: account.username || account.emailAddress, secret: "", isActive: account.isActive,
      isDefaultSender: account.isDefaultSender
    });
  };

  return <div className="mail-settings page-wide">
    <div className="page-head"><div><span className="eyebrow">COMUNICACIONES</span><h1>Cuentas de correo</h1><p className="muted">Conectá casillas para enviar propuestas y registrar respuestas en CRM y Ventas.</p></div></div>
    {message && <div className="success-banner">{message}</div>}{error && <div className="alert">{error}</div>}
    <div className="mail-layout">
      <section className="card pad"><div className="section-head"><div><h2>Casillas conectadas</h2><p className="muted">Cada empresa puede usar varias cuentas y elegir un remitente principal.</p></div></div>
        <div className="mail-account-list">{accounts.map((account) => <article className="mail-account-card" key={account.id}><div className={`provider-mark provider-${account.provider.toLowerCase()}`}>{account.provider.slice(0,1)}</div><div className="mail-account-main"><strong>{account.displayName}</strong><span>{account.emailAddress}</span><small>{account.provider} · {account.authMode}{account.lastSyncAtUtc ? ` · Sincronizado ${new Date(account.lastSyncAtUtc).toLocaleString("es-AR")}` : ""}</small>{account.lastError && <small className="mail-error">{account.lastError}</small>}</div><div className="mail-account-actions"><button className="btn btn-outline compact" disabled={busy} onClick={() => edit(account)}>Editar</button><button className="btn btn-outline compact" disabled={busy} onClick={() => void action(account, "test")}>Probar</button><button className="btn compact" disabled={busy} onClick={() => void action(account, "sync")}>Recibir</button></div></article>)}{accounts.length === 0 && <div className="empty-state">Todavía no hay cuentas conectadas.</div>}</div>
      </section>
      <form className="card pad mail-account-form" onSubmit={save}><h2>Agregar cuenta</h2><p className="muted">Elegí el proveedor. Los datos del servidor se completan automáticamente.</p>
        <div className="provider-picker">{(["Gmail","Microsoft","Yahoo","Custom"] as Provider[]).map((provider) => <button type="button" key={provider} className={form.provider === provider ? "active" : ""} onClick={() => chooseProvider(provider)}>{provider === "Custom" ? "Corporativo" : provider}</button>)}</div>
        {form.provider === "Gmail" && <div className="oauth-notice"><strong>Gmail requiere una contraseña de aplicación</strong><span>No ingreses tu contraseña habitual. Activá la verificación en dos pasos en Google, creá una contraseña de aplicación y pegá aquí sus 16 caracteres.</span></div>}
        {form.provider === "Microsoft" && <div className="oauth-notice"><strong>Microsoft requiere conexión OAuth</strong><span>La contraseña normal puede ser rechazada. La conexión con Microsoft se habilitará mediante autorización segura de la cuenta.</span></div>}
        <div className="grid-2"><label>Nombre visible *<input required value={form.displayName} onChange={(e) => setForm({...form,displayName:e.target.value})} placeholder="Equipo Comercial" /></label><label>Email *<input required type="email" value={form.emailAddress} onChange={(e) => setForm({...form,emailAddress:e.target.value,username:e.target.value})} /></label></div>
        <label>Usuario<input value={form.username} onChange={(e) => setForm({...form,username:e.target.value})} placeholder="Normalmente el email completo" /></label>
        <label>{form.authMode === "OAuth2" ? "Token OAuth" : form.authMode === "AppPassword" ? "Contraseña de aplicación" : "Contraseña"}<input type="password" required={!form.id} value={form.secret} onChange={(e) => setForm({...form,secret:e.target.value.replace(/\s/g, "")})} autoComplete="new-password" placeholder={form.id ? "Dejar vacío para conservar la actual" : form.provider === "Gmail" ? "16 caracteres generados por Google" : ""} /></label>
        <div className="grid-2"><label>Servidor IMAP<input required value={form.imapHost} onChange={(e) => setForm({...form,imapHost:e.target.value})} /></label><label>Puerto IMAP<input required type="number" value={form.imapPort} onChange={(e) => setForm({...form,imapPort:Number(e.target.value)})} /></label><label>Servidor SMTP<input required value={form.smtpHost} onChange={(e) => setForm({...form,smtpHost:e.target.value})} /></label><label>Puerto SMTP<input required type="number" value={form.smtpPort} onChange={(e) => setForm({...form,smtpPort:Number(e.target.value)})} /></label></div>
        <div className="row"><label className="check-label"><input type="checkbox" checked={form.isDefaultSender} onChange={(e) => setForm({...form,isDefaultSender:e.target.checked})} /> Remitente principal</label><label className="check-label"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({...form,isActive:e.target.checked})} /> Cuenta activa</label></div>
        <div className="toolbar"><button className="btn" disabled={busy}>{form.id ? "Guardar cambios" : "Guardar cuenta cifrada"}</button>{form.id && <button type="button" className="btn btn-outline" onClick={() => setForm(empty)}>Cancelar edición</button>}</div>
      </form>
    </div>
  </div>;
}
