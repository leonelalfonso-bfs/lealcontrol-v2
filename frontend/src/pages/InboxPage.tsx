import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Conversation, ConversationActivity, ConversationNote, ConversationTag, CustomerMatch, CustomerSummary, EmailMessage, MailAccount, MessageReplyTemplate, TenantUser } from "../api/types";
import { EmailComposer } from "../components/EmailComposer";
import { MessageAttachments } from "../components/MessageAttachments";
import { AudioRecorderButton } from "../components/AudioRecorderButton";
import {
  consumePendingConversationOpen,
  setActiveConversationForNotifications
} from "../lib/communicationsNotifications";

const emptyLead = "00000000-0000-0000-0000-000000000000";

function normalizeEmailHtml(value: string): string {
  const trimmed = value.trim();
  if (!/&lt;|&gt;|&amp;lt;|&amp;gt;/i.test(trimmed)) return trimmed;
  const holder = document.createElement("textarea");
  holder.innerHTML = trimmed;
  return holder.value;
}

type ChannelType = "all" | "email" | "whatsapp" | "instagram" | "facebook";

function isOwnBrand(name: string): boolean {
  if (!name) return true;
  const n = name.toLowerCase().trim();
  return (
    n.includes("oficial") ||
    n === "usuario" ||
    n === "desconocido" ||
    n === "whatsapp oficial"
  );
}

function formatThreadDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function getConversationChannel(c: Conversation): "whatsapp" | "instagram" | "facebook" | "email" {
  const ct = (c.channelType || "").toLowerCase();
  if (ct === "whatsapp" || ct === "instagram" || ct === "facebook" || ct === "email") return ct;
  return "email";
}

function channelLabel(ch: string): string {
  if (ch === "whatsapp") return "WhatsApp";
  if (ch === "instagram") return "Instagram";
  if (ch === "facebook") return "Facebook";
  return "Email";
}

function isConversationUnlinked(c: Conversation): boolean {
  return !c.relatedLeadId && !c.relatedCustomerId;
}

export function InboxPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeMessages, setActiveMessages] = useState<EmailMessage[]>([]);
  const [activeNotes, setActiveNotes] = useState<ConversationNote[]>([]);
  const [activeActivities, setActiveActivities] = useState<ConversationActivity[]>([]);
  const [activeTags, setActiveTags] = useState<ConversationTag[]>([]);
  const [tagText, setTagText] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [folder, setFolder] = useState<"Mine" | "Incoming" | "Outgoing" | "All" | "NeedsResponse" | "Unassigned">("Mine");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [templates, setTemplates] = useState<MessageReplyTemplate[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [suggestedMatches, setSuggestedMatches] = useState<CustomerMatch[]>([]);
  const [pendingAudio, setPendingAudio] = useState<{ base64: string; mimeType: string; fileName: string } | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
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
  const [channelCounts, setChannelCounts] = useState({ email: 0, whatsapp: 0, instagram: 0, facebook: 0 });
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(() => new Set());
  const [linkCustomerOpen, setLinkCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);
  const [customerSearchBusy, setCustomerSearchBusy] = useState(false);
  const [linkedCustomerName, setLinkedCustomerName] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const selectedConversationIdRef = useRef<string | null>(null);

  const loadConversations = async () => {
    try {
      const folderParam = folder === "All" || folder === "Mine" ? undefined : folder;
      const searchParam = searchDebounced || undefined;
      const [c, countsSource, a] = await Promise.all([
        api.listConversations({
          channel: channel === "all" ? undefined : channel,
          folder: folderParam,
          search: searchParam
        }),
        api.listConversations({ folder: folderParam, search: searchParam }),
        api.listMailAccounts()
      ]);
      setConversations(c);
      setChannelCounts({
        email: countsSource.filter((x) => getConversationChannel(x) === "email").length,
        whatsapp: countsSource.filter((x) => getConversationChannel(x) === "whatsapp").length,
        instagram: countsSource.filter((x) => getConversationChannel(x) === "instagram").length,
        facebook: countsSource.filter((x) => getConversationChannel(x) === "facebook").length
      });
      setAccounts(a);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const loadActiveMessages = async (conversationId: string) => {
    try {
      const msgs = await api.getConversationMessages(conversationId);
      if (selectedConversationIdRef.current !== conversationId) return;
      setActiveMessages(msgs);
      try {
        const notes = await api.getConversationNotes(conversationId);
        if (selectedConversationIdRef.current === conversationId) setActiveNotes(notes);
      } catch (e) {
        if (selectedConversationIdRef.current === conversationId) {
          setActiveNotes([]);
          setError((e as Error).message);
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const loadActiveActivities = async (conversationId: string) => {
    try {
      const activities = await api.getConversationActivities(conversationId);
      if (selectedConversationIdRef.current === conversationId) setActiveActivities(activities);
    } catch (e) {
      if (selectedConversationIdRef.current === conversationId) setError((e as Error).message);
    }
  };

  const syncChannels = async () => {
    try {
      const [waRes, metaRes] = await Promise.all([
        api.syncWhatsAppMessages().catch(() => ({ synced: 0 })),
        api.syncMetaMessages().catch(() => ({ synced: 0, channels: [] }))
      ]);

      const metaErrors = (metaRes.channels || [])
        .filter((c) => c.error)
        .map((c) => `${c.channel}: ${c.error}`)
        .join(" | ");

      if (metaErrors) {
        setSyncNotification(`Sync: ${waRes.synced} WA, ${metaRes.synced} Meta. Advertencias: ${metaErrors}`);
      } else if (waRes.synced > 0 || metaRes.synced > 0) {
        setSyncNotification(`Sincronización: ${waRes.synced} WhatsApp, ${metaRes.synced} Instagram/Facebook.`);
      }

      await loadConversations();
      if (selectedConversationId) {
        await loadActiveMessages(selectedConversationId);
      }
    } catch {
      // sync errors are non-blocking
    }
  };

  useEffect(() => {
    const state = location.state as { conversationId?: string } | null;
    const pending = consumePendingConversationOpen();
    const id = state?.conversationId || pending;
    if (id) setSelectedConversationId(id);
  }, [location.state]);

  useEffect(() => {
    setActiveConversationForNotifications(selectedConversationId);
  }, [selectedConversationId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ conversationId: string }>).detail;
      if (detail?.conversationId) setSelectedConversationId(detail.conversationId);
    };
    window.addEventListener("leal:open-conversation", handler);
    return () => window.removeEventListener("leal:open-conversation", handler);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void loadConversations();
    void syncChannels();
    void api.listReplyTemplates().then(setTemplates).catch(() => setTemplates([]));
    void api.listTenantUsers().then(setTenantUsers).catch(() => setTenantUsers([]));
    const syncInterval = window.setInterval(() => void syncChannels(), 60000);
    const refreshInterval = window.setInterval(() => void loadConversations(), 15000);
    return () => {
      clearInterval(syncInterval);
      clearInterval(refreshInterval);
    };
  }, [channel, folder, searchDebounced]);

  const visibleConversations = useMemo(() => {
    let list = conversations;
    if (folder === "Mine") {
      const userHex = user?.id ? user.id.replace(/-/g, "").toLowerCase() : "";
      list = list.filter(
        (c) => c.assignedToUserId === user?.id || (userHex && c.threadKey?.toLowerCase().includes(userHex))
      );
    }
    return list;
  }, [conversations, folder, user?.id]);

  useEffect(() => {
    if (!selectedConversationId && visibleConversations.length > 0) {
      setSelectedConversationId(visibleConversations[0].id);
    } else if (selectedConversationId && !visibleConversations.some((c) => c.id === selectedConversationId)) {
      setSelectedConversationId(visibleConversations.length > 0 ? visibleConversations[0].id : null);
    }
  }, [visibleConversations, selectedConversationId]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
    setActiveMessages([]);
    setActiveNotes([]);
    setActiveActivities([]);
    setActiveTags([]);
    if (selectedConversationId) {
      void loadActiveMessages(selectedConversationId);
      void loadActiveActivities(selectedConversationId);
      void api.getConversationTags(selectedConversationId)
        .then((tags) => {
          if (selectedConversationIdRef.current === selectedConversationId) setActiveTags(tags);
        })
        .catch((e: Error) => {
          if (selectedConversationIdRef.current === selectedConversationId) setError(e.message);
        });
    }
    setNoteText("");
    setTagText("");
  }, [selectedConversationId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  useEffect(() => {
    if (!activeConversation?.relatedCustomerId) {
      setLinkedCustomerName(null);
      return;
    }
    void api.getCustomer(activeConversation.relatedCustomerId)
      .then((c) => setLinkedCustomerName(c.tradeName || c.legalName))
      .catch(() => setLinkedCustomerName(null));
  }, [activeConversation?.relatedCustomerId]);

  useEffect(() => {
    if (!linkCustomerOpen) return;
    const timer = window.setTimeout(() => {
      setCustomerSearchBusy(true);
      void api.listCustomers(customerSearch)
        .then((r) => setCustomerResults(r.items || []))
        .catch(() => setCustomerResults([]))
        .finally(() => setCustomerSearchBusy(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch, linkCustomerOpen]);

  useEffect(() => {
    if (!selectedConversationId) {
      setSuggestedMatches([]);
      return;
    }
    void api.getSuggestedMatches(selectedConversationId).then(setSuggestedMatches).catch(() => setSuggestedMatches([]));
  }, [selectedConversationId]);

  const getConversationDisplayName = (c: Conversation): string => {
    if (c.participantName && !isOwnBrand(c.participantName)) return c.participantName;
    if (c.participantEmail) return c.participantEmail;
    if (c.participantPhone) return `+${c.participantPhone}`;
    const ch = getConversationChannel(c);
    if (ch === "instagram") return "Contacto de Instagram";
    if (ch === "facebook") return "Contacto de Facebook";
    if (ch === "whatsapp") return "Contacto de WhatsApp";
    return c.participantId || "Contacto";
  };

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeMessages.length, activeNotes.length, activeActivities.length, selectedConversationId]);

  const countEmail = channelCounts.email;
  const countWa = channelCounts.whatsapp;
  const countIg = channelCounts.instagram;
  const countFb = channelCounts.facebook;

  const handleForceSyncOmni = async () => {
    setBusy(true);
    setError(null);
    setSyncNotification(null);
    try {
      await syncChannels();
      setTimeout(() => setSyncNotification(null), 8000);
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
      await syncChannels();
      for (const account of accounts.filter((a) => a.isActive)) await api.syncMailAccount(account.id);
      await loadConversations();
      if (selectedConversationId) await loadActiveMessages(selectedConversationId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deleteThread = async () => {
    if (!activeConversation) return;
    const name = getConversationDisplayName(activeConversation);
    if (!confirm(`¿Eliminar la conversación con "${name}" solo de Leal Control?`)) return;
    setBusy(true);
    try {
      await api.deleteConversation(activeConversation.id);
      setSelectedConversationId(null);
      await loadConversations();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createLeadFromThread = async () => {
    if (!activeConversation) return;
    setBusy(true);
    setError(null);
    try {
      const ch = getConversationChannel(activeConversation);
      const isEmail = ch === "email";
      const isWa = ch === "whatsapp";
      const name = getConversationDisplayName(activeConversation);
      const lead = await api.captureLead({
        name: isEmail ? (activeConversation.participantEmail?.split("@")[1] || name) : name,
        contactName: name,
        email: isEmail ? activeConversation.participantEmail || activeConversation.participantId : undefined,
        phone: isWa ? activeConversation.participantPhone || activeConversation.participantId.replace(/^lid_/, "") : undefined,
        source: isWa ? "WhatsApp" : ch === "instagram" ? "Instagram" : ch === "facebook" ? "Facebook" : "Email",
        description: `Conversación por ${ch}: ${activeConversation.lastMessagePreview || ""}`,
        assignedTo: null
      });
      await api.linkConversation(activeConversation.id, { leadId: lead.id });
      setDismissedSuggestions((prev) => new Set(prev).add(activeConversation.id));
      alert("¡Contacto / Lead creado con éxito en el CRM!");
      await loadConversations();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const linkCustomerToThread = async (customerId: string) => {
    if (!activeConversation) return;
    setBusy(true);
    setError(null);
    try {
      await api.linkConversation(activeConversation.id, { customerId });
      setLinkCustomerOpen(false);
      setCustomerSearch("");
      setDismissedSuggestions((prev) => new Set(prev).add(activeConversation.id));
      await loadConversations();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const dismissSuggestion = async (conversationId: string) => {
    setDismissedSuggestions((prev) => new Set(prev).add(conversationId));
    try {
      await api.dismissConversationSuggestion(conversationId);
      await loadConversations();
    } catch { /* ignore */ }
  };

  const openLinkCustomerModal = () => {
    setCustomerSearch("");
    setCustomerResults([]);
    setLinkCustomerOpen(true);
  };

  const showLeadSuggestion =
    !!activeConversation &&
    isConversationUnlinked(activeConversation) &&
    activeConversation.hasIncoming &&
    !activeConversation.suggestionDismissed &&
    !dismissedSuggestions.has(activeConversation.id);

  const handleSendDirectReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversation || (!replyText.trim() && !pendingAudio)) return;
    setSendingReply(true);
    const ch = getConversationChannel(activeConversation);
    const lastMsg = activeMessages[activeMessages.length - 1];

    try {
      const participantId = activeConversation.participantId;
      if (ch === "whatsapp") {
        const targetPhone = participantId.replace(/^lid_/, "");
        const res = pendingAudio
          ? await api.sendWhatsAppMessage({
              to: targetPhone,
              message: replyText.trim(),
              mediaBase64: pendingAudio.base64,
              mediaType: "audio",
              mimeType: pendingAudio.mimeType,
              fileName: pendingAudio.fileName,
              relatedEntityType: lastMsg?.relatedEntityType || undefined,
              relatedEntityId: lastMsg?.relatedEntityId || undefined,
              userId: user?.id
            })
          : await api.sendWhatsAppMessage({
              to: targetPhone,
              message: replyText.trim(),
              relatedEntityType: lastMsg?.relatedEntityType || undefined,
              relatedEntityId: lastMsg?.relatedEntityId || undefined,
              userId: user?.id
            });
        if (res.success) {
          setReplyText("");
          setPendingAudio(null);
          await syncChannels();
        } else {
          alert("No se pudo enviar el WhatsApp: " + (res.error || "Error"));
        }
      } else if (ch === "instagram" || ch === "facebook") {
        let mediaUrl: string | undefined;
        if (pendingAudio) {
          const blob = await (await fetch(`data:${pendingAudio.mimeType};base64,${pendingAudio.base64}`)).blob();
          const file = new File([blob], pendingAudio.fileName, { type: pendingAudio.mimeType });
          const uploaded = await api.uploadCommunicationMedia(file);
          mediaUrl = `${window.location.origin}${uploaded.publicUrl}`;
        }
        const res = await api.sendMetaMessage({
          channelType: ch,
          recipientId: participantId,
          message: replyText.trim() || "🎤 Nota de voz",
          mediaUrl,
          mediaType: "audio",
          relatedEntityType: lastMsg?.relatedEntityType || undefined,
          relatedEntityId: lastMsg?.relatedEntityId || undefined
        });
        if (res.success) {
          setReplyText("");
          setPendingAudio(null);
          await syncChannels();
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
          message: newMessage.trim(),
          userId: user?.id
        });
        if (res.success) {
          setNewRecipient("");
          setNewMessage("");
          setNewModalOpen(false);
          await loadConversations();
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
          await loadConversations();
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

  const changeStatus = async (conversationId: string, status: string) => {
    try {
      setError(null);
      await api.setConversationStatus(conversationId, status);
      await Promise.all([loadConversations(), loadActiveActivities(conversationId)]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const changeAssignment = async (conversationId: string, userId?: string) => {
    try {
      setError(null);
      await api.assignConversation(conversationId, userId);
      await Promise.all([loadConversations(), loadActiveActivities(conversationId)]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedConversationId || !noteText.trim() || savingNote) return;
    const conversationId = selectedConversationId;
    setSavingNote(true);
    try {
      const note = await api.addConversationNote(conversationId, noteText.trim());
      if (selectedConversationIdRef.current === conversationId) {
        setActiveNotes((current) => [...current, note]);
        setNoteText("");
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingNote(false);
    }
  };

  const addTag = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedConversationId || !tagText.trim() || tagBusy) return;
    const conversationId = selectedConversationId;
    setTagBusy(true);
    try {
      const tag = await api.addConversationTag(conversationId, tagText.trim());
      if (selectedConversationIdRef.current === conversationId) {
        setActiveTags((current) => current.some((x) => x.id === tag.id) ? current : [...current, tag].sort((a, b) => a.name.localeCompare(b.name)));
        setConversations((current) => current.map((c) => c.id === conversationId
          ? { ...c, tags: Array.from(new Set([...(c.tags || []), tag.name])).sort() }
          : c));
        setTagText("");
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTagBusy(false);
    }
  };

  const removeTag = async (tagId: string) => {
    if (!selectedConversationId || tagBusy) return;
    const conversationId = selectedConversationId;
    const removedTagName = activeTags.find((tag) => tag.id === tagId)?.name;
    setTagBusy(true);
    try {
      await api.deleteConversationTag(conversationId, tagId);
      if (selectedConversationIdRef.current === conversationId)
        setActiveTags((current) => current.filter((x) => x.id !== tagId));
      setConversations((current) => current.map((c) => c.id === conversationId
        ? { ...c, tags: (c.tags || []).filter((name) => name !== removedTagName) }
        : c));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTagBusy(false);
    }
  };

  const timeline = useMemo(() => [
    ...activeMessages.map((message) => ({ kind: "message" as const, id: message.id, at: message.occurredAtUtc, message })),
    ...activeNotes.map((note) => ({ kind: "note" as const, id: note.id, at: note.createdAtUtc, note })),
    ...activeActivities.map((activity) => ({ kind: "activity" as const, id: activity.id, at: activity.occurredAtUtc, activity }))
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime() || a.id.localeCompare(b.id)), [activeMessages, activeNotes, activeActivities]);

  const activeDisplayName = activeConversation ? getConversationDisplayName(activeConversation) : "";

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
          <small>{conversations.length}</small>
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
          <button className={folder === "Mine" ? "active" : ""} onClick={() => setFolder("Mine")}>
            <span>👤 Mis Chats</span>
            <strong>
              {
                conversations.filter((c) => {
                  const userHex = user?.id ? user.id.replace(/-/g, "").toLowerCase() : "";
                  return c.assignedToUserId === user?.id || (userHex && c.threadKey?.toLowerCase().includes(userHex));
                }).length
              }
            </strong>
          </button>
          <button className={folder === "Incoming" ? "active" : ""} onClick={() => setFolder("Incoming")}>
            <span>📥 Entrada</span>
            <strong>{conversations.filter((c) => c.hasIncoming !== false).length}</strong>
          </button>
          <button className={folder === "Outgoing" ? "active" : ""} onClick={() => setFolder("Outgoing")}>
            <span>📤 Enviados</span>
            <strong>{conversations.filter((c) => c.hasOutgoing !== false).length}</strong>
          </button>
          <button className={folder === "All" ? "active" : ""} onClick={() => setFolder("All")}>
            <span>📁 Todas</span>
            <strong>{conversations.length}</strong>
          </button>
          <button className={folder === "NeedsResponse" ? "active" : ""} onClick={() => setFolder("NeedsResponse")}>
            <span>⏰ SLA</span>
            <strong>{conversations.filter((c) => c.needsResponse).length}</strong>
          </button>
          <button className={folder === "Unassigned" ? "active" : ""} onClick={() => setFolder("Unassigned")}>
            <span>👤 Sin asignar</span>
            <strong>{conversations.filter((c) => !c.assignedToUserId).length}</strong>
          </button>
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            <Link to="/comunicaciones/canales" style={{ fontSize: "0.8rem", color: "#0d9488", fontWeight: 700 }}>
              📲 Conectar Canales
            </Link>
            <Link to="/comunicaciones/plantillas" style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
              📝 Plantillas de respuesta
            </Link>
            <Link to="/configuracion/correo" style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
              ⚙️ Cuentas de correo
            </Link>
          </div>
        </aside>

        {/* Middle: Conversation Threads List */}
        <section className="message-list" style={{ maxWidth: 360, minWidth: 300, borderRight: "1px solid var(--surface-border)", display: "flex", flexDirection: "column" }}>
          <div className="message-list-toolbar" style={{ padding: "12px 16px", fontWeight: 700, fontSize: "0.86rem", color: "var(--ink-soft)", borderBottom: "1px solid var(--surface-border)" }}>
            CONVERSACIONES ({visibleConversations.length})
          </div>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--surface-border)" }}>
            <input
              type="search"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--surface-border)" }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
          {visibleConversations.map((c) => {
            const ch = getConversationChannel(c);
            const icon = ch === "whatsapp" ? "💬" : ch === "instagram" ? "📸" : ch === "facebook" ? "📘" : "✉️";
            const isActive = selectedConversationId === c.id;
            const displayName = getConversationDisplayName(c);

            return (
              <div
                key={c.id}
                onClick={() => setSelectedConversationId(c.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--surface-border)",
                  background: isActive ? "rgba(13, 148, 136, 0.08)" : "transparent",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                  borderLeft: isActive ? "4px solid #0d9488" : "4px solid transparent"
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.03)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Avatar Badge */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.3rem",
                    background:
                      ch === "whatsapp"
                        ? "#dcfce7"
                        : ch === "instagram"
                        ? "#fce7f3"
                        : ch === "facebook"
                        ? "#dbeafe"
                        : "#f1f5f9",
                    flexShrink: 0
                  }}
                >
                  {icon}
                </div>

                {/* Content info */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "0.92rem",
                        color: "var(--ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "180px"
                      }}
                    >
                      {displayName}
                    </span>
                    <span style={{ fontSize: "0.74rem", color: "var(--ink-soft)", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {formatThreadDate(c.lastMessageAtUtc)}
                    </span>
                    {c.unreadCount > 0 && (
                      <span style={{ background: "#0d9488", color: "white", borderRadius: 10, padding: "1px 6px", fontSize: "0.7rem", fontWeight: 700 }}>
                        {c.unreadCount}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "0.82rem", color: "var(--ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.lastMessagePreview || `[Mensaje de ${ch}]`}
                  </div>
                  {c.assignedToUserId && (
                    <div style={{ fontSize: "0.72rem", color: "#0d9488", fontWeight: 600, marginTop: 2 }}>
                      👤 {tenantUsers.find((u) => u.id === c.assignedToUserId)?.fullName || "Asignado"}
                    </div>
                  )}
                  {c.relatedLeadId && (
                    <div style={{ fontSize: "0.72rem", color: "#0d9488", fontWeight: 600, marginTop: 2 }}>✓ Lead vinculado</div>
                  )}
                  {c.relatedCustomerId && (
                    <div style={{ fontSize: "0.72rem", color: "#2563eb", fontWeight: 600, marginTop: 2 }}>✓ Cliente vinculado</div>
                  )}
                  {c.needsResponse && (
                    <div style={{ fontSize: "0.72rem", color: "#dc2626", fontWeight: 600, marginTop: 2 }}>⏰ Requiere respuesta</div>
                  )}
                  {!!c.tags?.length && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {c.tags.map((tag) => <span key={tag} style={{ background: "#e0f2fe", color: "#075985", borderRadius: 10, padding: "2px 6px", fontSize: "0.7rem" }}>{tag}</span>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {visibleConversations.length === 0 && (
            <div className="empty-state" style={{ padding: 24, textAlign: "center" }}>
              No hay conversaciones en este filtro.
            </div>
          )}
          </div>
        </section>

        {/* Right: Full Chat / Email Thread View */}
        <section className="message-reader" style={{ display: "flex", flexDirection: "column", height: "100%", padding: 0 }}>
          {activeConversation ? (
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
                      {getConversationChannel(activeConversation) === "whatsapp" ? "💬" : getConversationChannel(activeConversation) === "instagram" ? "📸" : getConversationChannel(activeConversation) === "facebook" ? "📘" : "✉️"}
                    </span>
                    <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{activeDisplayName}</h2>
                  </div>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    {activeConversation.participantId} • {activeMessages.length} mensaje(s) en el historial
                    {activeConversation.relatedLeadId ? " • Lead vinculado" : ""}
                    {activeConversation.relatedCustomerId ? " • Cliente vinculado" : ""}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {isConversationUnlinked(activeConversation) && (
                    <>
                      <button className="btn btn-outline compact" onClick={createLeadFromThread} disabled={busy}>
                        ＋ Crear Lead CRM
                      </button>
                      <button className="btn btn-outline compact" onClick={openLinkCustomerModal} disabled={busy}>
                        🔗 Vincular cliente
                      </button>
                    </>
                  )}
                  {activeConversation.relatedCustomerId && (
                    <Link className="btn btn-outline compact" to={`/clientes/${activeConversation.relatedCustomerId}`}>
                      Ver cliente
                    </Link>
                  )}
                  <button className="btn btn-danger compact" onClick={deleteThread}>
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Ficha de contacto */}
              <div
                style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--surface-border)",
                  background: "var(--surface)",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                  fontSize: "0.82rem"
                }}
              >
                <div>
                  <div className="muted" style={{ fontSize: "0.72rem", marginBottom: 2 }}>Canal</div>
                  <strong>{channelLabel(getConversationChannel(activeConversation))}</strong>
                </div>
                {(activeConversation.participantPhone || getConversationChannel(activeConversation) === "whatsapp") && (
                  <div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginBottom: 2 }}>Teléfono</div>
                    <strong>{activeConversation.participantPhone || activeConversation.participantId.replace(/^lid_/, "")}</strong>
                  </div>
                )}
                {(activeConversation.participantEmail || getConversationChannel(activeConversation) === "email") && (
                  <div>
                    <div className="muted" style={{ fontSize: "0.72rem", marginBottom: 2 }}>Email</div>
                    <strong>{activeConversation.participantEmail || activeConversation.participantId}</strong>
                  </div>
                )}
                <div>
                  <div className="muted" style={{ fontSize: "0.72rem", marginBottom: 2 }}>Estado CRM</div>
                  {activeConversation.relatedCustomerId ? (
                    <Link to={`/clientes/${activeConversation.relatedCustomerId}`} style={{ color: "#2563eb", fontWeight: 600 }}>
                      Cliente: {linkedCustomerName || "vinculado"}
                    </Link>
                  ) : activeConversation.relatedLeadId ? (
                    <Link to="/prospectos" style={{ color: "#0d9488", fontWeight: 600 }}>
                      Lead vinculado
                    </Link>
                  ) : (
                    <span style={{ color: "var(--ink-soft)" }}>Sin vincular</span>
                  )}
                </div>
                <div>
                  <div className="muted" style={{ fontSize: "0.72rem", marginBottom: 2 }}>Estado</div>
                  <select
                    value={activeConversation.status || "open"}
                    onChange={(e) => void changeStatus(activeConversation.id, e.target.value)}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--surface-border)", fontSize: "0.82rem" }}
                  >
                    <option value="open">Abierta</option>
                    <option value="pending">Pendiente</option>
                    <option value="resolved">Resuelta</option>
                    <option value="archived">Archivada</option>
                  </select>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: "0.72rem", marginBottom: 2 }}>Asignado a</div>
                  <select
                    value={activeConversation.assignedToUserId || ""}
                    onChange={(e) => void changeAssignment(activeConversation.id, e.target.value || undefined)}
                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--surface-border)", fontSize: "0.82rem", maxWidth: 160 }}
                  >
                    <option value="">Sin asignar</option>
                    {tenantUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.fullName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--surface-border)", background: "var(--surface)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>Etiquetas</strong>
                {activeTags.map((tag) => (
                  <span key={tag.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 12, background: "#e0f2fe", color: "#075985", fontSize: "0.78rem", fontWeight: 600 }}>
                    {tag.name}
                    <button type="button" aria-label={`Quitar etiqueta ${tag.name}`} title="Quitar etiqueta" disabled={tagBusy} onClick={() => void removeTag(tag.id)} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 700 }}>×</button>
                  </span>
                ))}
                <form onSubmit={addTag} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input aria-label="Nueva etiqueta" placeholder="Nueva etiqueta" value={tagText} onChange={(e) => setTagText(e.target.value)} maxLength={32} style={{ width: 125, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--surface-border)", fontSize: "0.78rem" }} />
                  <button type="submit" className="btn btn-outline compact" disabled={tagBusy || !tagText.trim()}>Agregar</button>
                </form>
              </div>

              {/* Sugerencia suave — nunca crea lead automáticamente */}
              {showLeadSuggestion && (
                <div
                  style={{
                    margin: "0 20px",
                    marginTop: 12,
                    padding: "12px 16px",
                    borderRadius: 8,
                    background: "#fffbeb",
                    border: "1px solid #fcd34d",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <strong style={{ fontSize: "0.88rem" }}>¿Registrar este contacto en el CRM?</strong>
                    <div className="muted" style={{ fontSize: "0.8rem", marginTop: 2 }}>
                      Este contacto escribió por {channelLabel(getConversationChannel(activeConversation))}. Podés crear un lead o vincular un cliente existente.
                    </div>
                    {suggestedMatches.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className="muted" style={{ fontSize: "0.75rem" }}>¿Es alguno de estos clientes?</span>
                        {suggestedMatches.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="btn ghost compact"
                            style={{ justifyContent: "flex-start", padding: "4px 8px" }}
                            onClick={() => void linkCustomerToThread(m.id)}
                          >
                            🔗 {m.tradeName || m.legalName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn compact" onClick={createLeadFromThread} disabled={busy}>
                      Crear lead
                    </button>
                    <button className="btn btn-outline compact" onClick={openLinkCustomerModal} disabled={busy}>
                      Vincular cliente
                    </button>
                    <button className="btn ghost compact" onClick={() => void dismissSuggestion(activeConversation.id)}>
                      Ahora no
                    </button>
                  </div>
                </div>
              )}

              {/* Chat Messages Body */}
              <div
                style={{
                  flex: 1,
                  padding: 20,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  background: getConversationChannel(activeConversation) !== "email" ? "rgba(0,0,0,0.02)" : "inherit"
                }}
              >
                {timeline.map((item) => {
                  if (item.kind === "activity") {
                    const activity = item.activity;
                    const actor = tenantUsers.find((u) => u.id === activity.actorUserId)?.fullName || "Operador";
                    const statusName = (value?: string | null) => ({ open: "Abierta", pending: "Pendiente", resolved: "Resuelta", archived: "Archivada" }[value || ""] || value || "Sin estado");
                    const assigneeName = (value?: string | null) => value
                      ? tenantUsers.find((u) => u.id === value)?.fullName || "Otro usuario"
                      : "Sin asignar";
                    const detail = activity.kind === "status"
                      ? `Estado: ${statusName(activity.previousValue)} → ${statusName(activity.currentValue)}`
                      : `Asignación: ${assigneeName(activity.previousValue)} → ${assigneeName(activity.currentValue)}`;
                    return (
                      <div key={item.id} style={{ alignSelf: "center", maxWidth: "85%", padding: "6px 12px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--ink-soft)", fontSize: "0.76rem", textAlign: "center" }}>
                        {detail} · {actor} · {new Date(item.at).toLocaleString("es-AR")}
                      </div>
                    );
                  }
                  if (item.kind === "note") {
                    const author = tenantUsers.find((u) => u.id === item.note.authorUserId)?.fullName || "Operador";
                    return (
                      <div key={item.id} style={{ alignSelf: "center", width: "min(100%, 620px)", padding: "12px 16px", borderRadius: 10, background: "#fff7dd", border: "1px solid #edcd79", color: "#493b17", whiteSpace: "pre-wrap" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: 5 }}>
                          📝 Nota interna · {author} · {new Date(item.at).toLocaleString("es-AR")}
                        </div>
                        {item.note.body}
                      </div>
                    );
                  }
                  const m = item.message;
                  const isOutgoing = m.direction === "Outgoing";
                  const ch = getConversationChannel(activeConversation);

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
                        <MessageAttachments messageId={m.id} attachments={m.attachments} bodyPreview={m.bodyPreview} />
                      </div>
                    );
                  }

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
                        <MessageAttachments messageId={m.id} attachments={m.attachments} bodyPreview={m.bodyPreview} />
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

              <form onSubmit={saveNote} style={{ padding: "10px 20px", borderTop: "1px solid var(--surface-border)", background: "#fffaf0", display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  aria-label="Nota interna"
                  placeholder="Escribir nota interna (no se envía al cliente)"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  maxLength={4000}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #edcd79" }}
                />
                <button type="submit" className="btn btn-outline" disabled={savingNote || !noteText.trim()}>
                  {savingNote ? "Guardando..." : "Guardar nota"}
                </button>
              </form>

              {getConversationChannel(activeConversation) !== "email" ? (
                <form
                  onSubmit={handleSendDirectReply}
                  style={{
                    padding: "14px 20px",
                    borderTop: "1px solid var(--surface-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    background: "var(--surface)"
                  }}
                >
                  {pendingAudio && (
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      🎤 Nota de voz lista para enviar{" "}
                      <button type="button" className="btn ghost compact" onClick={() => setPendingAudio(null)}>Quitar</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {templates.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const t = templates.find((x) => x.id === e.target.value);
                          if (t) setReplyText(t.body);
                          e.target.value = "";
                        }}
                        style={{ maxWidth: 140, padding: "8px", borderRadius: 8, border: "1px solid var(--surface-border)" }}
                      >
                        <option value="">Plantilla</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    )}
                    <AudioRecorderButton
                      disabled={sendingReply}
                      onRecorded={(base64, mimeType, fileName) => setPendingAudio({ base64, mimeType, fileName })}
                    />
                    <input
                      type="text"
                      placeholder={`Responder por ${channelLabel(getConversationChannel(activeConversation))}...`}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: "1px solid var(--surface-border)", fontSize: "0.9rem" }}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={sendingReply || (!replyText.trim() && !pendingAudio)}
                      style={{ padding: "10px 20px", borderRadius: 20, fontWeight: 700 }}
                    >
                      {sendingReply ? "Enviando..." : "📤"}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ padding: 14, borderTop: "1px solid var(--surface-border)", display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-outline" onClick={() => setReply(true)}>
                    ↩ Responder Correo
                  </button>
                </div>
              )}

              {reply && activeMessages.length > 0 && (
                <EmailComposer
                  context={{
                    entityType: activeMessages[activeMessages.length - 1].relatedEntityType || "Email",
                    entityId: activeMessages[activeMessages.length - 1].relatedEntityId || emptyLead,
                    to: activeConversation.participantEmail || activeConversation.participantId,
                    subject: activeMessages[activeMessages.length - 1].subject.startsWith("Re:") ? activeMessages[activeMessages.length - 1].subject : `Re: ${activeMessages[activeMessages.length - 1].subject}`,
                    body: `\n\n--- Mensaje original ---\n${activeMessages[activeMessages.length - 1].bodyPreview}`,
                    inReplyTo: activeMessages[activeMessages.length - 1].internetMessageId
                  }}
                  onClose={() => setReply(false)}
                  onSent={async () => { await loadConversations(); if (selectedConversationId) await loadActiveMessages(selectedConversationId); }}
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
          onSent={loadConversations}
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

      {/* Modal vincular cliente existente */}
      {linkCustomerOpen && activeConversation && (
        <div className="modal-backdrop" onClick={() => setLinkCustomerOpen(false)}>
          <div className="modal-card card pad" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem" }}>Vincular cliente existente</h3>
              <button type="button" className="btn ghost compact" onClick={() => setLinkCustomerOpen(false)}>
                ✕
              </button>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              Buscá un cliente del CRM para asociarlo a la conversación con {activeDisplayName}.
            </p>
            <input
              type="search"
              placeholder="Buscar por nombre, CUIT o razón social..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              autoFocus
              style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid var(--surface-border)", marginBottom: 12 }}
            />
            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {customerSearchBusy && <div className="muted" style={{ padding: 12, textAlign: "center" }}>Buscando...</div>}
              {!customerSearchBusy && customerResults.length === 0 && (
                <div className="muted" style={{ padding: 12, textAlign: "center" }}>
                  {customerSearch.trim() ? "No se encontraron clientes." : "Escribí para buscar clientes."}
                </div>
              )}
              {customerResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void linkCustomerToThread(c.id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "1px solid var(--surface-border)",
                    borderRadius: 6
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{c.tradeName || c.legalName}</div>
                  {c.documentNumber && <div className="muted" style={{ fontSize: "0.78rem" }}>{c.documentType}: {c.documentNumber}</div>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
