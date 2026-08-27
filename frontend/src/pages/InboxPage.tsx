import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { EmailMessage, MailAccount } from "../api/types";
import { EmailComposer } from "../components/EmailComposer";

const emptyLead = "00000000-0000-0000-0000-000000000000";

function normalizeEmailHtml(value: string): string {
  const trimmed = value.trim();
  if (!/&lt;|&gt;|&amp;lt;|&amp;gt;/i.test(trimmed)) return trimmed;
  const holder = document.createElement("textarea");
  holder.innerHTML = trimmed;
  return holder.value;
}

type ChannelType = "all" | "email" | "whatsapp" | "instagram" | "facebook";

function getChannel(msg: EmailMessage): "whatsapp" | "instagram" | "facebook" | "email" {
  if (msg.internetMessageId.startsWith("meta_ig_") || msg.threadKey.startsWith("meta_ig_") || msg.subject.toLowerCase().includes("instagram")) {
    return "instagram";
  }
  if (msg.internetMessageId.startsWith("meta_fb_") || msg.threadKey.startsWith("meta_fb_") || msg.subject.toLowerCase().includes("messenger") || msg.subject.toLowerCase().includes("facebook")) {
    return "facebook";
  }
  if (msg.internetMessageId.startsWith("wa_") || msg.threadKey.startsWith("wa_") || msg.fromAddress.includes("WhatsApp") || msg.toAddresses.includes("WhatsApp") || msg.subject.toLowerCase().includes("whatsapp")) {
    return "whatsapp";
  }
  return "email";
}

export function InboxPage() {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [folder, setFolder] = useState<"Incoming" | "Outgoing" | "All">("Incoming");
  const [selected, setSelected] = useState<EmailMessage | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compose, setCompose] = useState(false);
  const [reply, setReply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelType>("all");

  // Social / WhatsApp Direct Reply State
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // New Message Modal State
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newChannel, setNewChannel] = useState<"whatsapp" | "instagram" | "facebook">("whatsapp");
  const [newRecipient, setNewRecipient] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sendingNew, setSendingNew] = useState(false);

  const load = async () => {
    try {
      // Sync WhatsApp messages in background
      try {
        await api.syncWhatsAppMessages();
      } catch {}

      const [m, a] = await Promise.all([api.listEmails(), api.listMailAccounts()]);
      setMessages(m);
      setAccounts(a);
      if (selected && !m.some((x) => x.id === selected.id)) setSelected(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const visible = useMemo(() => {
    return messages.filter((m) => {
      const matchFolder = folder === "All" || m.direction === folder;
      const ch = getChannel(m);
      const matchChannel = channel === "all" ? true : channel === ch;
      return matchFolder && matchChannel;
    });
  }, [messages, folder, channel]);

  const countEmail = useMemo(() => messages.filter((m) => getChannel(m) === "email").length, [messages]);
  const countWa = useMemo(() => messages.filter((m) => getChannel(m) === "whatsapp").length, [messages]);
  const countIg = useMemo(() => messages.filter((m) => getChannel(m) === "instagram").length, [messages]);
  const countFb = useMemo(() => messages.filter((m) => getChannel(m) === "facebook").length, [messages]);

  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  const handleForceSyncWhatsApp = async () => {
    setBusy(true);
    setError(null);
    setSyncNotification(null);
    try {
      const res = await api.syncWhatsAppMessages();
      await load();
      setSyncNotification(`Sincronización completada: ${res.synced} nuevo(s) mensaje(s) de WhatsApp recibidos.`);
      setTimeout(() => setSyncNotification(null), 5000);
    } catch (e: any) {
      setError("Error al sincronizar WhatsApp: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const syncAll = async () => {
    setBusy(true);
    setError(null);
    try {
      try {
        await api.syncWhatsAppMessages();
      } catch {}
      for (const account of accounts.filter((a) => a.isActive)) await api.syncMailAccount(account.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const deleteSelected = async () => {
    if (!selectedIds.length || !confirm(`¿Eliminar ${selectedIds.length} mensaje(s) solo de Leal Control?`)) return;
    setBusy(true);
    try {
      for (const id of selectedIds) await api.deleteEmail(id);
      setSelectedIds([]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createLead = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const ch = getChannel(selected);
      const isEmail = ch === "email";
      const isWa = ch === "whatsapp";
      await api.captureLead({
        companyName: isEmail
          ? selected.fromAddress.split("@")[1] || "Nuevo contacto"
          : `${ch.toUpperCase()}: ${selected.fromAddress}`,
        contactName: selected.fromAddress,
        email: isEmail ? selected.fromAddress : undefined,
        phone: isWa ? selected.fromAddress.replace(/\D/g, "") : undefined,
        source: isWa ? "WhatsApp" : ch === "instagram" ? "Instagram" : ch === "facebook" ? "Facebook" : "Email",
        description: `Mensaje recibido por ${ch}: ${selected.subject}`,
        notes: selected.bodyPreview
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSendDirectReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !replyText.trim()) return;
    setSendingReply(true);
    const ch = getChannel(selected);

    try {
      if (ch === "whatsapp") {
        const targetPhone = selected.direction === "Incoming" ? selected.fromAddress : selected.toAddresses;
        const res = await api.sendWhatsAppMessage({
          to: targetPhone,
          message: replyText.trim(),
          relatedEntityType: selected.relatedEntityType || undefined,
          relatedEntityId: selected.relatedEntityId || undefined
        });
        if (res.success) {
          setReplyText("");
          await load();
        } else {
          alert("No se pudo enviar el WhatsApp: " + (res.error || "Error"));
        }
      } else if (ch === "instagram" || ch === "facebook") {
        const recipientId = selected.direction === "Incoming"
          ? selected.fromAddress.replace(/^@/, "").replace(/^Usuario FB\s*/i, "")
          : selected.toAddresses.replace(/^@/, "").replace(/^Usuario FB\s*/i, "");
        const res = await api.sendMetaMessage({
          channelType: ch,
          recipientId: recipientId.trim(),
          message: replyText.trim(),
          relatedEntityType: selected.relatedEntityType || undefined,
          relatedEntityId: selected.relatedEntityId || undefined
        });
        if (res.success) {
          setReplyText("");
          await load();
        } else {
          alert(`No se pudo enviar el mensaje de ${ch}: ` + (res.error || "Error"));
        }
      }
    } catch (err: any) {
      alert("Error al responder: " + err.message);
    } finally {
      setSendingReply(false);
    }
  };

  const handleSendNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecipient.trim() || !newMessage.trim()) return;
    setSendingNew(true);

    try {
      if (newChannel === "whatsapp") {
        const res = await api.sendWhatsAppMessage({
          to: newRecipient.trim(),
          message: newMessage.trim()
        });
        if (res.success) {
          setNewRecipient("");
          setNewMessage("");
          setNewModalOpen(false);
          await load();
        } else {
          alert("Error al enviar WhatsApp: " + (res.error || "Error"));
        }
      } else {
        const res = await api.sendMetaMessage({
          channelType: newChannel,
          recipientId: newRecipient.trim(),
          message: newMessage.trim()
        });
        if (res.success) {
          setNewRecipient("");
          setNewMessage("");
          setNewModalOpen(false);
          await load();
        } else {
          alert(`Error al enviar ${newChannel}: ` + (res.error || "Error"));
        }
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSendingNew(false);
    }
  };

  const selectedChannel = selected ? getChannel(selected) : "email";

  return (
    <div className="inbox-page page-wide" style={{ paddingBottom: 40 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">COMUNICACIONES</span>
          <h1>Bandeja Omnicanal</h1>
          <p className="muted">Conversaciones de Email, WhatsApp, Instagram y Facebook unificadas con el CRM.</p>
        </div>
        <div className="toolbar" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={() => void handleForceSyncWhatsApp()} disabled={busy} style={{ color: "#0d9488", borderColor: "#0d9488", fontWeight: 700 }}>
            💬 🔄 Sincronizar WhatsApp
          </button>
          <button className="btn btn-outline" onClick={() => void syncAll()} disabled={busy}>
            🔄 Recibir Correo
          </button>
          <button className="btn btn-outline" onClick={() => setNewModalOpen(true)}>
            💬 Mensaje Directo
          </button>
          <button className="btn btn-primary" onClick={() => setCompose(true)}>
            ✉️ Nuevo Email
          </button>
        </div>
      </div>

      {syncNotification && (
        <div className="alert" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#065f46", borderColor: "#10b981", marginBottom: 12 }}>
          ✓ {syncNotification}
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      {/* Channel Filters */}
      <div className="channel-filter card" style={{ display: "flex", gap: 10, marginBottom: 14, overflowX: "auto" }}>
        <button className={channel === "all" ? "selected" : ""} onClick={() => setChannel("all")}>
          <span>✦</span>
          <b>Todos</b>
          <small>{messages.length}</small>
        </button>
        <button className={channel === "email" ? "selected" : ""} onClick={() => setChannel("email")}>
          <span>✉</span>
          <b>Email</b>
          <small>{countEmail}</small>
        </button>
        <button className={channel === "whatsapp" ? "selected" : ""} onClick={() => setChannel("whatsapp")}>
          <span>💬</span>
          <b>WhatsApp</b>
          <small>{countWa}</small>
        </button>
        <button className={channel === "instagram" ? "selected" : ""} onClick={() => setChannel("instagram")}>
          <span>📸</span>
          <b>Instagram</b>
          <small>{countIg}</small>
        </button>
        <button className={channel === "facebook" ? "selected" : ""} onClick={() => setChannel("facebook")}>
          <span>📘</span>
          <b>Facebook</b>
          <small>{countFb}</small>
        </button>
      </div>

      <div className="inbox-shell card">
        <aside className="inbox-folders">
          <button className={folder === "Incoming" ? "active" : ""} onClick={() => setFolder("Incoming")}>
            <span>📥 Entrada</span>
            <strong>{messages.filter((m) => m.direction === "Incoming").length}</strong>
          </button>
          <button className={folder === "Outgoing" ? "active" : ""} onClick={() => setFolder("Outgoing")}>
            <span>📤 Enviados</span>
            <strong>{messages.filter((m) => m.direction === "Outgoing").length}</strong>
          </button>
          <button className={folder === "All" ? "active" : ""} onClick={() => setFolder("All")}>
            <span>📁 Todos</span>
            <strong>{messages.length}</strong>
          </button>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            <Link to="/comunicaciones/canales" style={{ fontSize: "0.8rem", color: "#0d9488", fontWeight: 700 }}>
              📲 Conectar Canales
            </Link>
            <Link to="/configuracion/correo" style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
              ⚙️ Cuentas de correo
            </Link>
          </div>
        </aside>

        {/* Messages List */}
        <section className="message-list">
          <div className="message-list-toolbar">
            <label>
              <input
                type="checkbox"
                checked={visible.length > 0 && visible.every((m) => selectedIds.includes(m.id))}
                onChange={(e) => setSelectedIds(e.target.checked ? visible.map((m) => m.id) : [])}
              />{" "}
              Seleccionar
            </label>
            {selectedIds.length > 0 && (
              <button className="btn btn-danger compact" onClick={() => void deleteSelected()} disabled={busy}>
                Eliminar seleccionados
              </button>
            )}
          </div>
          {visible.map((message) => {
            const ch = getChannel(message);
            const icon = ch === "whatsapp" ? "💬" : ch === "instagram" ? "📸" : ch === "facebook" ? "📘" : "✉️";
            return (
              <article key={message.id} className={`message-item ${selected?.id === message.id ? "active" : ""}`}>
                <input type="checkbox" checked={selectedIds.includes(message.id)} onChange={() => toggle(message.id)} />
                <button onClick={() => setSelected(message)}>
                  <span className={`direction-dot ${message.direction.toLowerCase()}`} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "0.85rem" }}>{icon}</span>
                      <strong>{message.direction === "Incoming" ? message.fromAddress : message.toAddresses}</strong>
                    </div>
                    <b>{message.subject || `(Mensaje de ${ch})`}</b>
                    <small>{message.bodyPreview.slice(0, 130)}</small>
                  </div>
                  <time>{new Date(message.occurredAtUtc).toLocaleDateString("es-AR")}</time>
                </button>
              </article>
            );
          })}
          {visible.length === 0 && <div className="empty-state">No hay mensajes en esta bandeja.</div>}
        </section>

        {/* Message Reader / Chat View */}
        <section className="message-reader">
          {selected ? (
            <>
              <div className="reader-actions">
                {selectedChannel === "email" && (
                  <button className="btn btn-outline compact" onClick={() => setReply(true)}>
                    ↩ Responder Email
                  </button>
                )}
                {selected.direction === "Incoming" && !selected.relatedEntityId && (
                  <button className="btn compact" onClick={createLead}>
                    ＋ Crear Lead CRM
                  </button>
                )}
                <button
                  className="btn btn-danger compact"
                  onClick={() => {
                    setSelectedIds([selected.id]);
                    void deleteSelected();
                  }}
                >
                  Eliminar
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span
                  className="eyebrow"
                  style={{
                    color:
                      selectedChannel === "whatsapp"
                        ? "#25a56a"
                        : selectedChannel === "instagram"
                        ? "#c24b8d"
                        : selectedChannel === "facebook"
                        ? "#1877f2"
                        : "inherit"
                  }}
                >
                  {selectedChannel === "whatsapp"
                    ? `💬 WHATSAPP ${selected.direction === "Incoming" ? "RECIBIDO" : "ENVIADO"}`
                    : selectedChannel === "instagram"
                    ? `📸 INSTAGRAM DM ${selected.direction === "Incoming" ? "RECIBIDO" : "ENVIADO"}`
                    : selectedChannel === "facebook"
                    ? `📘 FACEBOOK ${selected.direction === "Incoming" ? "RECIBIDO" : "ENVIADO"}`
                    : `✉️ CORREO ${selected.direction === "Incoming" ? "RECIBIDO" : "ENVIADO"}`}
                </span>
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  • {new Date(selected.occurredAtUtc).toLocaleString("es-AR")}
                </span>
              </div>

              <h2 style={{ margin: "6px 0 10px" }}>{selected.subject || `(Mensaje de ${selectedChannel})`}</h2>

              <div className="message-addresses" style={{ background: "rgba(0,0,0,0.02)", padding: 8, borderRadius: 6, marginBottom: 12 }}>
                <strong>De:</strong> {selected.fromAddress}
                <br />
                <strong>Para:</strong> {selected.toAddresses}
              </div>

              {/* Message Content */}
              {selectedChannel !== "email" ? (
                <div
                  style={{
                    background:
                      selectedChannel === "whatsapp"
                        ? selected.direction === "Outgoing"
                          ? "#dcf8c6"
                          : "#f0fdf4"
                        : selectedChannel === "instagram"
                        ? selected.direction === "Outgoing"
                          ? "#fce7f3"
                          : "#fdf2f8"
                        : selected.direction === "Outgoing"
                        ? "#dbeafe"
                        : "#eff6ff",
                    padding: "14px 18px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.06)",
                    fontSize: "0.95rem",
                    lineHeight: 1.5,
                    marginBottom: 16,
                    whiteSpace: "pre-wrap"
                  }}
                >
                  {selected.bodyPreview}
                </div>
              ) : selected.bodyHtml ? (
                <iframe
                  className="message-html"
                  title="Contenido del correo"
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={normalizeEmailHtml(selected.bodyHtml)}
                />
              ) : (
                <div className="message-body">{selected.bodyPreview}</div>
              )}

              {selected.relatedEntityType && (
                <div className="entity-link" style={{ marginTop: 8 }}>
                  🔗 Vinculado con {selected.relatedEntityType}
                </div>
              )}

              {/* Social / WhatsApp Direct Reply Box */}
              {selectedChannel !== "email" && (
                <form
                  onSubmit={handleSendDirectReply}
                  style={{
                    marginTop: 20,
                    padding: 12,
                    borderTop: "1px solid var(--surface-border)",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-end"
                  }}
                >
                  <textarea
                    rows={2}
                    required
                    placeholder={`Escribí una respuesta directa por ${selectedChannel.toUpperCase()}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--surface-border)", resize: "none" }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={sendingReply || !replyText.trim()}
                    style={{ padding: "10px 18px", fontWeight: 700 }}
                  >
                    {sendingReply ? "Enviando..." : "📤 Responder"}
                  </button>
                </form>
              )}

              {reply && (
                <EmailComposer
                  context={{
                    entityType: selected.relatedEntityType || "Email",
                    entityId: selected.relatedEntityId || emptyLead,
                    to: selected.fromAddress,
                    subject: selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`,
                    body: `\n\n--- Mensaje original ---\n${selected.bodyPreview}`,
                    inReplyTo: selected.internetMessageId
                  }}
                  onClose={() => setReply(false)}
                  onSent={load}
                />
              )}
            </>
          ) : (
            <div className="empty-state">Seleccioná un mensaje para leerlo o responder.</div>
          )}
        </section>
      </div>

      {compose && (
        <EmailComposer
          context={{ entityType: "General", entityId: emptyLead, subject: "", body: "" }}
          onClose={() => setCompose(false)}
          onSent={load}
        />
      )}

      {/* Modal for New Social Message */}
      {newModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", display: "flex", alignItems: "center", gap: 8 }}>
                <span>💬</span> Nuevo Mensaje Social
              </h3>
              <button type="button" className="btn ghost compact" onClick={() => setNewModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSendNew} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label>
                Canal de Salida
                <select
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value as any)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                >
                  <option value="whatsapp">💬 WhatsApp</option>
                  <option value="instagram">📸 Instagram Direct</option>
                  <option value="facebook">📘 Facebook Messenger</option>
                </select>
              </label>

              <label>
                {newChannel === "whatsapp"
                  ? "Número de Teléfono *"
                  : newChannel === "instagram"
                  ? "ID de Usuario de Instagram (PSID) *"
                  : "ID de Usuario de Facebook (PSID) *"}
                <input
                  type="text"
                  required
                  placeholder={newChannel === "whatsapp" ? "Ej: 5493415551234" : "Ej: 1234567890"}
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                />
              </label>

              <label>
                Mensaje *
                <textarea
                  rows={4}
                  required
                  placeholder="Escribí el mensaje para el cliente..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
                <button type="button" className="btn ghost" onClick={() => setNewModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={sendingNew || !newRecipient.trim() || !newMessage.trim()}>
                  {sendingNew ? "Enviando..." : "📤 Enviar Mensaje"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
