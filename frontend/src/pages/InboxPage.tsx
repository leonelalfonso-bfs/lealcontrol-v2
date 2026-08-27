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

function isWhatsApp(msg: EmailMessage): boolean {
  return msg.internetMessageId.startsWith("wa_") || msg.threadKey.startsWith("wa_") || msg.fromAddress.includes("WhatsApp") || msg.toAddresses.includes("WhatsApp");
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
  const [channel, setChannel] = useState<"all" | "email" | "whatsapp">("all");

  // WhatsApp Direct Reply State
  const [waReplyText, setWaReplyText] = useState("");
  const [sendingWaReply, setSendingWaReply] = useState(false);

  // New WhatsApp Message Modal State
  const [newWaModalOpen, setNewWaModalOpen] = useState(false);
  const [newWaPhone, setNewWaPhone] = useState("");
  const [newWaMessage, setNewWaMessage] = useState("");
  const [sendingNewWa, setSendingNewWa] = useState(false);

  const load = () =>
    Promise.all([api.listEmails(), api.listMailAccounts()])
      .then(([m, a]) => {
        setMessages(m);
        setAccounts(a);
        if (selected && !m.some((x) => x.id === selected.id)) setSelected(null);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    return messages.filter((m) => {
      const matchFolder = folder === "All" || m.direction === folder;
      const isWa = isWhatsApp(m);
      const matchChannel =
        channel === "all" ? true : channel === "whatsapp" ? isWa : !isWa;
      return matchFolder && matchChannel;
    });
  }, [messages, folder, channel]);

  const countEmail = useMemo(() => messages.filter((m) => !isWhatsApp(m)).length, [messages]);
  const countWa = useMemo(() => messages.filter((m) => isWhatsApp(m)).length, [messages]);

  const syncAll = async () => {
    setBusy(true);
    setError(null);
    try {
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
      const isWa = isWhatsApp(selected);
      await api.captureLead({
        companyName: isWa ? `Contacto ${selected.fromAddress}` : selected.fromAddress.split("@")[1] || "Nuevo contacto",
        contactName: selected.fromAddress,
        email: isWa ? undefined : selected.fromAddress,
        phone: isWa ? selected.fromAddress.replace(/\D/g, "") : undefined,
        source: isWa ? "WhatsApp" : "Email",
        description: `Mensaje recibido: ${selected.subject}`,
        notes: selected.bodyPreview
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSendWaReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !waReplyText.trim()) return;
    setSendingWaReply(true);
    try {
      const targetPhone = selected.direction === "Incoming" ? selected.fromAddress : selected.toAddresses;
      const res = await api.sendWhatsAppMessage({
        to: targetPhone,
        message: waReplyText.trim(),
        relatedEntityType: selected.relatedEntityType || undefined,
        relatedEntityId: selected.relatedEntityId || undefined
      });
      if (res.success) {
        setWaReplyText("");
        await load();
      } else {
        alert("No se pudo enviar la respuesta por WhatsApp: " + (res.error || "Error desconocido"));
      }
    } catch (err: any) {
      alert("Error al responder por WhatsApp: " + err.message);
    } finally {
      setSendingWaReply(false);
    }
  };

  const handleSendNewWa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWaPhone.trim() || !newWaMessage.trim()) return;
    setSendingNewWa(true);
    try {
      const res = await api.sendWhatsAppMessage({
        to: newWaPhone.trim(),
        message: newWaMessage.trim()
      });
      if (res.success) {
        setNewWaPhone("");
        setNewWaMessage("");
        setNewWaModalOpen(false);
        await load();
      } else {
        alert("Error al enviar WhatsApp: " + (res.error || "Error del gateway"));
      }
    } catch (err: any) {
      alert("Error al enviar: " + err.message);
    } finally {
      setSendingNewWa(false);
    }
  };

  return (
    <div className="inbox-page page-wide" style={{ paddingBottom: 40 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">COMUNICACIONES</span>
          <h1>Bandeja Omnicanal</h1>
          <p className="muted">Conversaciones comerciales y operativas vinculadas con CRM y comprobantes.</p>
        </div>
        <div className="toolbar" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={() => void syncAll()} disabled={busy}>
            🔄 Recibir Correo
          </button>
          <button className="btn btn-outline" onClick={() => setNewWaModalOpen(true)}>
            💬 Nuevo WhatsApp
          </button>
          <button className="btn btn-primary" onClick={() => setCompose(true)}>
            ✉️ Nuevo Email
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* Channel Filters */}
      <div className="channel-filter card" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
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
        <button className="channel-disabled" disabled title="Próximamente">
          <span>📸</span>
          <b>Instagram</b>
          <small>Próximo</small>
        </button>
        <button className="channel-disabled" disabled title="Próximamente">
          <span>📘</span>
          <b>Facebook</b>
          <small>Próximo</small>
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
              📲 Conectar WhatsApp
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
            const isWa = isWhatsApp(message);
            return (
              <article key={message.id} className={`message-item ${selected?.id === message.id ? "active" : ""}`}>
                <input type="checkbox" checked={selectedIds.includes(message.id)} onChange={() => toggle(message.id)} />
                <button onClick={() => setSelected(message)}>
                  <span className={`direction-dot ${message.direction.toLowerCase()}`} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "0.8rem" }}>{isWa ? "💬" : "✉️"}</span>
                      <strong>{message.direction === "Incoming" ? message.fromAddress : message.toAddresses}</strong>
                    </div>
                    <b>{message.subject || (isWa ? "Mensaje de WhatsApp" : "(sin asunto)")}</b>
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
                {!isWhatsApp(selected) && (
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
                <span className="eyebrow" style={{ color: isWhatsApp(selected) ? "#25a56a" : "inherit" }}>
                  {isWhatsApp(selected)
                    ? selected.direction === "Incoming"
                      ? "💬 WHATSAPP RECIBIDO"
                      : "💬 WHATSAPP ENVIADO"
                    : selected.direction === "Incoming"
                    ? "✉️ CORREO RECIBIDO"
                    : "✉️ CORREO ENVIADO"}
                </span>
                <span className="muted" style={{ fontSize: "0.75rem" }}>
                  • {new Date(selected.occurredAtUtc).toLocaleString("es-AR")}
                </span>
              </div>

              <h2 style={{ margin: "6px 0 10px" }}>{selected.subject || "(Mensaje de WhatsApp)"}</h2>

              <div className="message-addresses" style={{ background: "rgba(0,0,0,0.02)", padding: 8, borderRadius: 6, marginBottom: 12 }}>
                <strong>De:</strong> {selected.fromAddress}
                <br />
                <strong>Para:</strong> {selected.toAddresses}
              </div>

              {/* Message Content */}
              {isWhatsApp(selected) ? (
                <div
                  style={{
                    background: selected.direction === "Outgoing" ? "#dcf8c6" : "#f0fdf4",
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

              {/* WhatsApp Quick Reply Box */}
              {isWhatsApp(selected) && (
                <form
                  onSubmit={handleSendWaReply}
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
                    placeholder="Escribí una respuesta directa de WhatsApp..."
                    value={waReplyText}
                    onChange={(e) => setWaReplyText(e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--surface-border)", resize: "none" }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={sendingWaReply || !waReplyText.trim()}
                    style={{ padding: "10px 18px", fontWeight: 700 }}
                  >
                    {sendingWaReply ? "Enviando..." : "📤 Enviar"}
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

      {/* Modal for New WhatsApp Message */}
      {newWaModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", display: "flex", alignItems: "center", gap: 8 }}>
                <span>💬</span> Nuevo Mensaje de WhatsApp
              </h3>
              <button type="button" className="btn ghost compact" onClick={() => setNewWaModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSendNewWa} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label>
                Número de Teléfono Destinatario *
                <input
                  type="text"
                  required
                  placeholder="Ej: 5493415551234"
                  value={newWaPhone}
                  onChange={(e) => setNewWaPhone(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                />
              </label>

              <label>
                Mensaje *
                <textarea
                  rows={4}
                  required
                  placeholder="Escribí el mensaje para el cliente..."
                  value={newWaMessage}
                  onChange={(e) => setNewWaMessage(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
                <button type="button" className="btn ghost" onClick={() => setNewWaModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={sendingNewWa || !newWaPhone.trim() || !newWaMessage.trim()}>
                  {sendingNewWa ? "Enviando..." : "📤 Enviar WhatsApp"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
