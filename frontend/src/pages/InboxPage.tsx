import React, { useEffect, useMemo, useState, useRef } from "react";
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

interface ConversationThread {
  key: string;
  channel: "whatsapp" | "instagram" | "facebook" | "email";
  contactTitle: string;
  contactAddress: string;
  lastMessage: EmailMessage;
  messages: EmailMessage[];
  lastOccurredAtUtc: string;
}

export function InboxPage() {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [folder, setFolder] = useState<"Incoming" | "Outgoing" | "All">("Incoming");
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
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

  const [syncNotification, setSyncNotification] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    try {
      try {
        await Promise.all([api.syncWhatsAppMessages(), api.syncMetaMessages()]);
      } catch {}

      const [m, a] = await Promise.all([api.listEmails(), api.listMailAccounts()]);
      setMessages(m);
      setAccounts(a);
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

  // Group messages into Conversation Threads
  const threads = useMemo(() => {
    const map = new Map<string, ConversationThread>();

    for (const m of messages) {
      const ch = getChannel(m);
      let threadKey = m.threadKey;
      if (!threadKey) {
        threadKey = ch === "email" ? m.internetMessageId : m.fromAddress;
      }

      const isIncoming = m.direction === "Incoming";
      const contactAddress = isIncoming ? m.fromAddress : m.toAddresses;

      let contactTitle = contactAddress;
      if (m.subject.startsWith("WhatsApp: ")) {
        contactTitle = m.subject.replace("WhatsApp: ", "").trim();
      } else if (m.subject.startsWith("Instagram DM: ")) {
        contactTitle = m.subject.replace("Instagram DM: ", "").trim();
      } else if (m.subject.startsWith("Messenger: ")) {
        contactTitle = m.subject.replace("Messenger: ", "").trim();
      }

      if (!map.has(threadKey)) {
        map.set(threadKey, {
          key: threadKey,
          channel: ch,
          contactTitle: contactTitle || contactAddress,
          contactAddress: contactAddress,
          lastMessage: m,
          messages: [m],
          lastOccurredAtUtc: m.occurredAtUtc
        });
      } else {
        const thread = map.get(threadKey)!;
        thread.messages.push(m);
        if (new Date(m.occurredAtUtc) > new Date(thread.lastOccurredAtUtc)) {
          thread.lastMessage = m;
          thread.lastOccurredAtUtc = m.occurredAtUtc;
          if (contactTitle && !contactTitle.startsWith("+") && !contactTitle.startsWith("@")) {
            thread.contactTitle = contactTitle;
          }
        }
      }
    }

    // Sort messages within each thread chronologically (oldest -> newest)
    for (const t of map.values()) {
      t.messages.sort((a, b) => new Date(a.occurredAtUtc).getTime() - new Date(b.occurredAtUtc).getTime());
    }

    // Convert to array and sort threads by latest message descending
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastOccurredAtUtc).getTime() - new Date(a.lastOccurredAtUtc).getTime()
    );
  }, [messages]);

  // Filter threads by Folder and Channel
  const visibleThreads = useMemo(() => {
    return threads.filter((t) => {
      const matchChannel = channel === "all" ? true : channel === t.channel;
      const matchFolder =
        folder === "All"
          ? true
          : folder === "Incoming"
          ? t.messages.some((m) => m.direction === "Incoming")
          : t.messages.some((m) => m.direction === "Outgoing");
      return matchChannel && matchFolder;
    });
  }, [threads, folder, channel]);

  // Set default selected thread
  useEffect(() => {
    if (!selectedThreadKey && visibleThreads.length > 0) {
      setSelectedThreadKey(visibleThreads[0].key);
    } else if (selectedThreadKey && !threads.some((t) => t.key === selectedThreadKey)) {
      setSelectedThreadKey(visibleThreads.length > 0 ? visibleThreads[0].key : null);
    }
  }, [visibleThreads, selectedThreadKey, threads]);

  const activeThread = useMemo(() => {
    return threads.find((t) => t.key === selectedThreadKey) || null;
  }, [threads, selectedThreadKey]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeThread?.messages.length, selectedThreadKey]);

  const countEmail = useMemo(() => threads.filter((t) => t.channel === "email").length, [threads]);
  const countWa = useMemo(() => threads.filter((t) => t.channel === "whatsapp").length, [threads]);
  const countIg = useMemo(() => threads.filter((t) => t.channel === "instagram").length, [threads]);
  const countFb = useMemo(() => threads.filter((t) => t.channel === "facebook").length, [threads]);

  const handleForceSyncOmni = async () => {
    setBusy(true);
    setError(null);
    setSyncNotification(null);
    try {
      const [waRes, metaRes] = await Promise.all([
        api.syncWhatsAppMessages().catch(() => ({ synced: 0 })),
        api.syncMetaMessages().catch(() => ({ synced: 0 }))
      ]);
      await load();
      setSyncNotification(`Sincronización completada: ${waRes.synced} de WhatsApp y ${metaRes.synced} de Instagram/Facebook.`);
      setTimeout(() => setSyncNotification(null), 5000);
    } catch (e: any) {
      setError("Error al sincronizar canales: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const syncAll = async () => {
    setBusy(true);
    setError(null);
    try {
      try {
        await Promise.all([api.syncWhatsAppMessages(), api.syncMetaMessages()]);
      } catch {}
      for (const account of accounts.filter((a) => a.isActive)) await api.syncMailAccount(account.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deleteThread = async () => {
    if (!activeThread || !confirm(`¿Eliminar la conversación con "${activeThread.contactTitle}" solo de Leal Control?`)) return;
    setBusy(true);
    try {
      for (const m of activeThread.messages) {
        await api.deleteEmail(m.id);
      }
      setSelectedThreadKey(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createLeadFromThread = async () => {
    if (!activeThread) return;
    setBusy(true);
    setError(null);
    try {
      const ch = activeThread.channel;
      const isEmail = ch === "email";
      const isWa = ch === "whatsapp";
      await api.captureLead({
        companyName: isEmail
          ? activeThread.contactAddress.split("@")[1] || "Nuevo contacto"
          : `${activeThread.contactTitle}`,
        contactName: activeThread.contactTitle,
        email: isEmail ? activeThread.contactAddress : undefined,
        phone: isWa ? activeThread.contactAddress.replace(/\D/g, "") : undefined,
        source: isWa ? "WhatsApp" : ch === "instagram" ? "Instagram" : ch === "facebook" ? "Facebook" : "Email",
        description: `Conversación por ${ch}`,
        notes: activeThread.lastMessage.bodyPreview
      });
      alert("¡Contacto / Lead creado con éxito en el CRM!");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSendDirectReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread || !replyText.trim()) return;
    setSendingReply(true);
    const ch = activeThread.channel;
    const lastMsg = activeThread.lastMessage;

    try {
      if (ch === "whatsapp") {
        const targetPhone = activeThread.contactAddress.replace(/\D/g, "");
        const res = await api.sendWhatsAppMessage({
          to: targetPhone,
          message: replyText.trim(),
          relatedEntityType: lastMsg.relatedEntityType || undefined,
          relatedEntityId: lastMsg.relatedEntityId || undefined
        });
        if (res.success) {
          setReplyText("");
          await load();
        } else {
          alert("No se pudo enviar el WhatsApp: " + (res.error || "Error"));
        }
      } else if (ch === "instagram" || ch === "facebook") {
        const recipientId = activeThread.contactAddress.replace(/^@/, "").replace(/^Usuario FB\s*/i, "").trim();
        const res = await api.sendMetaMessage({
          channelType: ch,
          recipientId: recipientId,
          message: replyText.trim(),
          relatedEntityType: lastMsg.relatedEntityType || undefined,
          relatedEntityId: lastMsg.relatedEntityId || undefined
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

  return (
    <div className="inbox-page page-wide" style={{ paddingBottom: 40 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">COMUNICACIONES</span>
          <h1>Bandeja Omnicanal</h1>
          <p className="muted">Conversaciones y chats de WhatsApp, Instagram, Facebook y Email unificados con el CRM.</p>
        </div>
        <div className="toolbar" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={() => void handleForceSyncOmni()} disabled={busy} style={{ color: "#0d9488", borderColor: "#0d9488", fontWeight: 700 }}>
            💬 📸 🔄 Sincronizar Redes
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
          <small>{threads.length}</small>
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

      <div className="inbox-shell card" style={{ minHeight: "70vh" }}>
        {/* Left Side: Folders & Actions */}
        <aside className="inbox-folders">
          <button className={folder === "Incoming" ? "active" : ""} onClick={() => setFolder("Incoming")}>
            <span>📥 Entrada</span>
            <strong>{threads.filter((t) => t.messages.some((m) => m.direction === "Incoming")).length}</strong>
          </button>
          <button className={folder === "Outgoing" ? "active" : ""} onClick={() => setFolder("Outgoing")}>
            <span>📤 Enviados</span>
            <strong>{threads.filter((t) => t.messages.some((m) => m.direction === "Outgoing")).length}</strong>
          </button>
          <button className={folder === "All" ? "active" : ""} onClick={() => setFolder("All")}>
            <span>📁 Todas</span>
            <strong>{threads.length}</strong>
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

        {/* Middle: Conversation Threads List */}
        <section className="message-list" style={{ maxWidth: 360, minWidth: 300, borderRight: "1px solid var(--surface-border)" }}>
          <div className="message-list-toolbar" style={{ padding: "10px 14px", fontWeight: 700, fontSize: "0.86rem", color: "var(--ink-soft)" }}>
            CONVERSACIONES ({visibleThreads.length})
          </div>
          {visibleThreads.map((t) => {
            const icon = t.channel === "whatsapp" ? "💬" : t.channel === "instagram" ? "📸" : t.channel === "facebook" ? "📘" : "✉️";
            const isActive = selectedThreadKey === t.key;
            return (
              <article
                key={t.key}
                className={`message-item ${isActive ? "active" : ""}`}
                style={{ padding: 0, cursor: "pointer", borderBottom: "1px solid var(--surface-border)" }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedThreadKey(t.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "12px 14px",
                    background: isActive ? "rgba(13, 148, 136, 0.08)" : "transparent",
                    border: "none",
                    textAlign: "left"
                  }}
                >
                  <span style={{ fontSize: "1.3rem", marginTop: 2 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <strong style={{ fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ink)" }}>
                        {t.contactTitle}
                      </strong>
                      <time style={{ fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                        {new Date(t.lastOccurredAtUtc).toLocaleDateString("es-AR", { month: "short", day: "numeric" })}
                      </time>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.lastMessage.direction === "Outgoing" && <span style={{ color: "#0d9488" }}>Tú: </span>}
                      {t.lastMessage.bodyPreview || `[Mensaje de ${t.channel}]`}
                    </div>
                  </div>
                </button>
              </article>
            );
          })}
          {visibleThreads.length === 0 && (
            <div className="empty-state" style={{ padding: 24, textAlign: "center" }}>
              No hay conversaciones en este filtro.
            </div>
          )}
        </section>

        {/* Right: Full Chat / Email Thread View */}
        <section className="message-reader" style={{ display: "flex", flexDirection: "column", height: "100%", padding: 0 }}>
          {activeThread ? (
            <>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--surface-border)",
                  background: "var(--surface)"
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "1.2rem" }}>
                      {activeThread.channel === "whatsapp" ? "💬" : activeThread.channel === "instagram" ? "📸" : activeThread.channel === "facebook" ? "📘" : "✉️"}
                    </span>
                    <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{activeThread.contactTitle}</h2>
                  </div>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    {activeThread.contactAddress} • {activeThread.messages.length} mensaje(s) en el historial
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-outline compact" onClick={createLeadFromThread}>
                    ＋ Crear Lead CRM
                  </button>
                  <button className="btn btn-danger compact" onClick={deleteThread}>
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Chat Messages Body */}
              <div
                style={{
                  flex: 1,
                  padding: 20,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  background: activeThread.channel !== "email" ? "rgba(0,0,0,0.02)" : "inherit"
                }}
              >
                {activeThread.messages.map((m) => {
                  const isOutgoing = m.direction === "Outgoing";
                  const ch = activeThread.channel;

                  if (ch === "email") {
                    return (
                      <div key={m.id} className="card pad" style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: "0.82rem" }}>
                          <div>
                            <strong>De:</strong> {m.fromAddress} <br />
                            <strong>Para:</strong> {m.toAddresses}
                          </div>
                          <span className="muted">{new Date(m.occurredAtUtc).toLocaleString("es-AR")}</span>
                        </div>
                        <h3>{m.subject}</h3>
                        {m.bodyHtml ? (
                          <iframe
                            className="message-html"
                            title="Contenido"
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            srcDoc={normalizeEmailHtml(m.bodyHtml)}
                          />
                        ) : (
                          <div className="message-body">{m.bodyPreview}</div>
                        )}
                      </div>
                    );
                  }

                  // Social Chat Bubble (WhatsApp, Instagram, Facebook)
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: isOutgoing ? "flex-end" : "flex-start",
                        width: "100%"
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "75%",
                          padding: "10px 14px",
                          borderRadius: isOutgoing ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                          background: isOutgoing
                            ? ch === "whatsapp"
                              ? "#dcf8c6"
                              : ch === "instagram"
                              ? "#fce7f3"
                              : "#dbeafe"
                            : "#ffffff",
                          color: isOutgoing && ch === "whatsapp" ? "#064e3b" : "var(--ink)",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          border: isOutgoing ? "none" : "1px solid rgba(0,0,0,0.06)",
                          fontSize: "0.92rem",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap"
                        }}
                      >
                        <div>{m.bodyPreview}</div>
                        <div
                          style={{
                            textAlign: "right",
                            fontSize: "0.7rem",
                            marginTop: 4,
                            opacity: 0.7
                          }}
                        >
                          {new Date(m.occurredAtUtc).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                          {isOutgoing && " ✓✓"}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Reply Box */}
              {activeThread.channel !== "email" ? (
                <form
                  onSubmit={handleSendDirectReply}
                  style={{
                    padding: "14px 20px",
                    borderTop: "1px solid var(--surface-border)",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    background: "var(--surface)"
                  }}
                >
                  <input
                    type="text"
                    required
                    placeholder={`Escribí una respuesta directa por ${activeThread.channel.toUpperCase()} a ${activeThread.contactTitle}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: "1px solid var(--surface-border)", fontSize: "0.9rem" }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={sendingReply || !replyText.trim()}
                    style={{ padding: "10px 20px", borderRadius: 20, fontWeight: 700 }}
                  >
                    {sendingReply ? "Enviando..." : "📤 Enviar"}
                  </button>
                </form>
              ) : (
                <div style={{ padding: 14, borderTop: "1px solid var(--surface-border)", display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-outline" onClick={() => setReply(true)}>
                    ↩ Responder Correo
                  </button>
                </div>
              )}

              {reply && (
                <EmailComposer
                  context={{
                    entityType: activeThread.lastMessage.relatedEntityType || "Email",
                    entityId: activeThread.lastMessage.relatedEntityId || emptyLead,
                    to: activeThread.contactAddress,
                    subject: activeThread.lastMessage.subject.startsWith("Re:") ? activeThread.lastMessage.subject : `Re: ${activeThread.lastMessage.subject}`,
                    body: `\n\n--- Mensaje original ---\n${activeThread.lastMessage.bodyPreview}`,
                    inReplyTo: activeThread.lastMessage.internetMessageId
                  }}
                  onClose={() => setReply(false)}
                  onSent={load}
                />
              )}
            </>
          ) : (
            <div className="empty-state" style={{ margin: "auto", padding: 40, textAlign: "center" }}>
              Seleccioná una conversación de la lista para ver el historial de chat completo.
            </div>
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
