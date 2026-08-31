import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Channel = "WhatsApp" | "Instagram" | "Facebook";

export interface TeamWhatsAppLine {
  id: string;
  tenantId: string;
  userId?: string;
  userName?: string;
  instanceName: string;
  phoneNumber?: string;
  state: string;
  isConnected: boolean;
  connectedAtUtc?: string;
  lastSyncAtUtc?: string;
  lastError?: string;
}

interface MetaStatusData {
  facebook: { isConnected: boolean; pageId?: string; pageName?: string; verifyToken: string; connectedAtUtc?: string; lastSyncAtUtc?: string; lastError?: string };
  instagram: { isConnected: boolean; pageId?: string; pageName?: string; instagramAccountId?: string; instagramUsername?: string; verifyToken: string; connectedAtUtc?: string; lastSyncAtUtc?: string; lastError?: string };
}

function isMetaTokenExpired(err?: string | null): boolean {
  if (!err) return false;
  const e = err.toLowerCase();
  return e.includes("token expiró") || e.includes("session has expired") || e.includes("code\":190") || e.includes("validating access token");
}

function MetaReconnectBanner({
  channel,
  lastError,
  onReconnect
}: {
  channel: "facebook" | "instagram";
  lastError?: string;
  onReconnect: (ch: "facebook" | "instagram") => void;
}) {
  if (!lastError) return null;
  const expired = isMetaTokenExpired(lastError);
  return (
    <div style={{ fontSize: "0.78rem", color: "#b45309", margin: "6px 0", fontWeight: 600, background: "rgba(251,191,36,0.15)", padding: 8, borderRadius: 6 }}>
      <div>⚠️ {lastError}</div>
      {expired && (
        <button
          type="button"
          className="btn btn-primary compact"
          style={{ marginTop: 8 }}
          onClick={() => onReconnect(channel)}
        >
          🔑 Reconectar con token nuevo
        </button>
      )}
    </div>
  );
}

export function ChannelsPage() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<Channel | null>(null);

  // WhatsApp Gateway State (Línea del Usuario Actual)
  const [waStatus, setWaStatus] = useState<"loading" | "connected" | "disconnected" | "connecting" | "offline">("loading");
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [waSyncing, setWaSyncing] = useState(false);
  const [waSyncMsg, setWaSyncMsg] = useState<string | null>(null);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaSyncMsg, setMetaSyncMsg] = useState<string | null>(null);

  // WhatsApp Gateway State (Líneas del Equipo)
  const [teamLines, setTeamLines] = useState<TeamWhatsAppLine[]>([]);

  const handleForceMetaSync = async () => {
    setMetaSyncing(true);
    setMetaSyncMsg(null);
    try {
      const res = await api.syncMetaMessages();
      const errors = (res.channels || []).filter((c) => c.error).map((c) => `${c.channel}: ${c.error}`);
      if (errors.length > 0) {
        setMetaSyncMsg(`⚠️ ${errors.join(" | ")}`);
      } else {
        setMetaSyncMsg(`✓ Sincronizados ${res.synced} mensajes.`);
      }
      await checkStatus();
      setTimeout(() => setMetaSyncMsg(null), 8000);
    } catch (err: any) {
      setMetaSyncMsg(`⚠️ ${err.message}`);
    } finally {
      setMetaSyncing(false);
    }
  };

  // Meta (Instagram & Facebook) State
  const [metaStatus, setMetaStatus] = useState<MetaStatusData | null>(null);
  const [metaModalChannel, setMetaModalChannel] = useState<"facebook" | "instagram" | null>(null);
  const [metaAuthMode, setMetaAuthMode] = useState<"token" | "oauth">("token");
  const [metaAppIdInput, setMetaAppIdInput] = useState("");
  const [metaTokenInput, setMetaTokenInput] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Test Message Modal State
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testChannel, setTestChannel] = useState<"whatsapp" | "facebook" | "instagram">("whatsapp");
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("Hola! Este es un mensaje de prueba enviado desde Leal Control ERP.");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const pollRef = useRef<number | null>(null);

  const webhookUrl = `${window.location.origin}/api/communications/meta/webhook`;

  const checkStatus = async () => {
    try {
      const res = await api.getWhatsAppStatus(user?.id);
      if (!res.available) {
        setWaStatus("offline");
      } else if (res.state === "open" || res.state === "connected" || res.isConnected) {
        setWaStatus("connected");
        setWaPhone(res.phoneNumber || null);
        if (qrModalOpen) setQrModalOpen(false);
      } else if (res.state === "connecting") {
        setWaStatus("connecting");
      } else {
        setWaStatus("disconnected");
        setWaPhone(null);
      }
    } catch {
      setWaStatus("offline");
    }

    try {
      const lines = await api.listTeamWhatsAppLines();
      setTeamLines(lines);
    } catch {
      // ignore
    }

    try {
      const m = await api.getMetaStatus();
      setMetaStatus(m);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void checkStatus();
    const interval = window.setInterval(() => {
      void checkStatus();
    }, 6000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const handleOpenQrModal = async () => {
    setQrModalOpen(true);
    setQrLoading(true);
    setQrError(null);
    setQrCodeBase64(null);

    try {
      const res = await api.connectWhatsApp(user?.id, user?.fullName);
      if (res.success && res.qrCodeBase64) {
        setQrCodeBase64(res.qrCodeBase64);
        setWaStatus("connecting");
      } else if (res.state === "open" || res.state === "connected") {
        setWaStatus("connected");
        setQrModalOpen(false);
      } else {
        setQrError(res.error || "No se pudo obtener el código QR.");
      }
    } catch (err: any) {
      setQrError(err.message || "Error al conectar con el gateway de WhatsApp.");
    } finally {
      setQrLoading(false);
    }

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await api.getWhatsAppStatus(user?.id);
        if (s.state === "open" || s.state === "connected" || s.isConnected) {
          setWaStatus("connected");
          setWaPhone(s.phoneNumber || null);
          setQrModalOpen(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {}
    }, 2500);
  };

  const handleCloseQrModal = () => {
    setQrModalOpen(false);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleForceWaSync = async () => {
    setWaSyncing(true);
    setWaSyncMsg(null);
    try {
      const res = await api.syncWhatsAppMessages(user?.id);
      setWaSyncMsg(`✓ Sincronizados ${res.synced} nuevos mensajes.`);
      setTimeout(() => setWaSyncMsg(null), 4000);
    } catch (err: any) {
      setWaSyncMsg(`⚠️ ${err.message}`);
    } finally {
      setWaSyncing(false);
    }
  };

  const handleDisconnectWa = async () => {
    if (!confirm("¿Está seguro de que desea desconectar su cuenta de WhatsApp de Leal Control?")) return;
    setDisconnecting(true);
    try {
      await api.disconnectWhatsApp(user?.id);
      await checkStatus();
    } catch (err: any) {
      alert("Error al desconectar: " + (err.message || "Error"));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleOpenMetaConfig = (ch: "facebook" | "instagram") => {
    setMetaModalChannel(ch);
    setMetaTokenInput("");
    setMetaError(null);
    setMetaAuthMode("token");
  };

  const handleMetaOAuthLogin = () => {
    const appId = metaAppIdInput.trim();
    if (!appId) {
      alert("Por favor ingresá tu Meta App ID para iniciar sesión con Facebook.");
      return;
    }
    const redirectUri = window.location.href.split("#")[0];
    const scope = "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging,instagram_basic,instagram_manage_messages";
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=token`;
    
    const popup = window.open(authUrl, "FacebookLogin", "width=600,height=700");
    if (!popup) {
      alert("Por favor permití las ventanas emergentes en tu navegador para iniciar sesión con Facebook.");
    }
  };

  const handleSaveMetaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaModalChannel || !metaTokenInput.trim()) return;
    setSavingMeta(true);
    setMetaError(null);
    try {
      const res = await api.configureMeta({
        channelType: metaModalChannel,
        pageAccessToken: metaTokenInput.trim()
      });
      if (res.success) {
        setMetaModalChannel(null);
        await checkStatus();
        alert(`¡Canal ${metaModalChannel === "instagram" ? "Instagram Direct" : "Facebook Messenger"} conectado con éxito!`);
      } else {
        setMetaError(res.error || "No se pudo conectar con Meta.");
      }
    } catch (err: any) {
      setMetaError(err.message || "Error de conexión con Meta API.");
    } finally {
      setSavingMeta(false);
    }
  };

  const handleDisconnectMeta = async (ch: "facebook" | "instagram") => {
    if (!confirm(`¿Desconectar ${ch === "instagram" ? "Instagram Direct" : "Facebook Messenger"} de Leal Control?`)) return;
    try {
      await api.disconnectMeta(ch);
      await checkStatus();
    } catch (err: any) {
      alert("Error al desconectar: " + err.message);
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) return;
    setSendingTest(true);
    setTestResult(null);

    try {
      if (testChannel === "whatsapp") {
        const res = await api.sendWhatsAppMessage({
          to: testRecipient.trim(),
          message: testMessage.trim(),
          userId: user?.id
        });
        if (res.success) {
          setTestResult({ ok: true, msg: "¡Mensaje de WhatsApp enviado con éxito!" });
        } else {
          setTestResult({ ok: false, msg: res.error || "No se pudo enviar el mensaje." });
        }
      } else {
        const res = await api.sendMetaMessage({
          channelType: testChannel,
          recipientId: testRecipient.trim(),
          message: testMessage.trim()
        });
        if (res.success) {
          setTestResult({ ok: true, msg: `¡Mensaje de ${testChannel === "instagram" ? "Instagram" : "Facebook"} enviado con éxito!` });
        } else {
          setTestResult({ ok: false, msg: res.error || "No se pudo enviar el mensaje." });
        }
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message || "Error al enviar mensaje." });
    } finally {
      setSendingTest(false);
    }
  };

  const igConnected = metaStatus?.instagram?.isConnected;
  const fbConnected = metaStatus?.facebook?.isConnected;

  return (
    <div className="channels-page page-wide" style={{ paddingBottom: 50 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">COMUNICACIONES</span>
          <h1>Canales Sociales & Mensajería</h1>
          <p className="muted">
            Conectá WhatsApp, Instagram y Facebook para gestionar todas las conversaciones en una sola bandeja omnicanal con costo $0 por mensaje.
          </p>
        </div>
      </div>

      {/* Intro Banner */}
      <div className="card pad channel-intro">
        <div>
          <span className="eyebrow">BANDEJA OMNICANAL</span>
          <h2>Una conversación, un historial</h2>
          <p className="muted">
            Cada mensaje entrante por WhatsApp, Instagram Direct o Facebook Messenger se vincula automáticamente con la ficha del cliente y oportunidad en el CRM.
          </p>
        </div>
        <span className="channel-orbit">✉　💬　📸　📘</span>
      </div>

      {/* Channels Grid */}
      <div className="channel-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
        {/* 1. WHATSAPP CARD (ACTIVE GATEWAY - MULTI-USUARIO) */}
        <article
          className="card pad channel-card"
          style={{
            borderLeft: `4px solid ${waStatus === "connected" ? "#10b981" : "#0d9488"}`,
            background: waStatus === "connected" ? "rgba(16, 185, 129, 0.02)" : "inherit"
          }}
        >
          <div className="channel-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="channel-icon" style={{ fontSize: "1.8rem", color: "#25a56a" }}>
                💬
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Mi WhatsApp Corporativo</h2>
                <div style={{ fontSize: "0.76rem", color: "var(--ink-soft)" }}>
                  Asociado a: <strong>{user?.fullName || "Tu usuario"}</strong>
                </div>
                <span
                  className="channel-status"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    marginTop: 4,
                    color: waStatus === "connected" ? "#047857" : waStatus === "connecting" ? "#d97706" : "#64748b"
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: waStatus === "connected" ? "#10b981" : waStatus === "connecting" ? "#f59e0b" : "#94a3b8"
                    }}
                  />
                  {waStatus === "loading"
                    ? "Verificando..."
                    : waStatus === "connected"
                    ? "Conectado"
                    : waStatus === "connecting"
                    ? "Esperando escaneo QR..."
                    : waStatus === "offline"
                    ? "Gateway no iniciado"
                    : "Desconectado"}
                </span>
              </div>
            </div>

            {waStatus === "connected" && (
              <span className="badge ok" style={{ fontSize: "0.76rem", padding: "3px 8px" }}>
                ACTIVO
              </span>
            )}
          </div>

          <p className="muted" style={{ fontSize: "0.86rem", marginBottom: 14 }}>
            Conectá tu propio teléfono para atender y responder a tus clientes desde tu WhatsApp personal o corporativo ($0 costo).
          </p>

          {waStatus === "connected" ? (
            <div style={{ background: "rgba(0,0,0,0.03)", padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: "0.82rem", marginBottom: 6 }}>
                <strong>Tu número vinculado:</strong> {waPhone ? `+${waPhone}` : "Dispositivo conectado"}
              </div>
              {waSyncMsg && (
                <div style={{ fontSize: "0.78rem", color: "#065f46", margin: "6px 0", fontWeight: 600 }}>
                  {waSyncMsg}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <Link to="/comunicaciones" className="btn btn-primary compact">
                  📬 Ir a Mis Chats
                </Link>
                <button
                  type="button"
                  className="btn btn-outline compact"
                  onClick={handleForceWaSync}
                  disabled={waSyncing}
                >
                  {waSyncing ? "Sincronizando..." : "🔄 Sincronizar mi línea"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline compact"
                  onClick={() => {
                    setTestChannel("whatsapp");
                    setTestRecipient(waPhone ? `+${waPhone}` : "");
                    setTestModalOpen(true);
                    setTestResult(null);
                  }}
                >
                  ✉️ Probar Envío
                </button>
                <button
                  type="button"
                  className="btn ghost compact"
                  style={{ color: "#dc2626" }}
                  disabled={disconnecting}
                  onClick={handleDisconnectWa}
                >
                  {disconnecting ? "Desconectando..." : "Desconectar mi línea"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", gap: 8, padding: "10px 16px", fontWeight: 700 }}
                onClick={handleOpenQrModal}
              >
                <span>📲</span> Conectar mi WhatsApp con Código QR
              </button>
            </div>
          )}

          <div style={{ marginTop: 12, borderTop: "1px dashed var(--surface-border)", paddingTop: 8 }}>
            <button
              type="button"
              className="btn ghost compact"
              style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}
              onClick={() => setExpanded(expanded === "WhatsApp" ? null : "WhatsApp")}
            >
              {expanded === "WhatsApp" ? "▲ Ocultar ayuda" : "▼ ¿Cómo funciona la conexión QR?"}
            </button>
            {expanded === "WhatsApp" && (
              <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.4 }}>
                <ol style={{ paddingLeft: 18, margin: 0 }}>
                  <li>Hacés clic en "Conectar con Código QR".</li>
                  <li>Abrís WhatsApp en tu teléfono → <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong>.</li>
                  <li>Escaneás el QR en pantalla y quedás conectado al instante sin intermediarios ni costos por mensaje.</li>
                </ol>
              </div>
            )}
          </div>
        </article>

        {/* 2. INSTAGRAM DIRECT CARD */}
        <article
          className="card pad channel-card"
          style={{
            borderLeft: `4px solid ${igConnected ? "#e1306c" : "#c24b8d"}`,
            background: igConnected ? "rgba(225, 48, 108, 0.02)" : "inherit"
          }}
        >
          <div className="channel-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="channel-icon" style={{ fontSize: "1.8rem", color: "#c24b8d" }}>
                📸
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Instagram Direct</h2>
                <span
                  className="channel-status"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: igConnected ? "#047857" : "#64748b"
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: igConnected ? "#10b981" : "#94a3b8"
                    }}
                  />
                  {igConnected
                    ? `Conectado (@${metaStatus?.instagram?.instagramUsername || "Instagram"})`
                    : "Preparado para conectar"}
                </span>
              </div>
            </div>

            {igConnected && (
              <span className="badge ok" style={{ fontSize: "0.76rem", padding: "3px 8px" }}>
                ACTIVO
              </span>
            )}
          </div>

          <p className="muted" style={{ fontSize: "0.86rem", marginBottom: 14 }}>
            Mensajes directos de Instagram Business. Es un canal independiente de Facebook Messenger: conectalo solo si usás IG Direct.
          </p>

          {igConnected ? (
            <div style={{ background: "rgba(0,0,0,0.03)", padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: "0.82rem", marginBottom: 6 }}>
                <strong>Cuenta vinculada:</strong> @{metaStatus?.instagram?.instagramUsername || "Instagram Oficial"}
                <br />
                <strong>Página FB:</strong> {metaStatus?.instagram?.pageName || "Página vinculada"}
                {metaStatus?.instagram?.lastSyncAtUtc && (
                  <>
                    <br />
                    <strong>Última sync:</strong> {new Date(metaStatus.instagram.lastSyncAtUtc).toLocaleString("es-AR")}
                  </>
                )}
              </div>
              {metaStatus?.instagram?.lastError && (
                <MetaReconnectBanner
                  channel="instagram"
                  lastError={metaStatus.instagram.lastError}
                  onReconnect={handleOpenMetaConfig}
                />
              )}
              {metaSyncMsg && (
                <div style={{ fontSize: "0.78rem", color: "#065f46", margin: "6px 0", fontWeight: 600 }}>
                  {metaSyncMsg}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <Link to="/comunicaciones" className="btn btn-primary compact">
                  📬 Ir a la Bandeja
                </Link>
                <button
                  type="button"
                  className="btn btn-outline compact"
                  onClick={handleForceMetaSync}
                  disabled={metaSyncing}
                >
                  {metaSyncing ? "Sincronizando..." : "🔄 Forzar Sincronización"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline compact"
                  onClick={() => {
                    setTestChannel("instagram");
                    setTestRecipient("");
                    setTestModalOpen(true);
                    setTestResult(null);
                  }}
                >
                  ✉️ Probar Envío
                </button>
                <button
                  type="button"
                  className="btn ghost compact"
                  style={{ color: "#dc2626" }}
                  onClick={() => handleDisconnectMeta("instagram")}
                >
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              {metaStatus?.instagram?.lastError && (
                <MetaReconnectBanner
                  channel="instagram"
                  lastError={metaStatus.instagram.lastError}
                  onReconnect={handleOpenMetaConfig}
                />
              )}
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", gap: 8, padding: "10px 16px", fontWeight: 700, background: "linear-gradient(135deg, #e1306c, #833ab4)" }}
                onClick={() => handleOpenMetaConfig("instagram")}
              >
                <span>📸</span> Conectar Instagram Direct
              </button>
            </div>
          )}

          <div style={{ marginTop: 12, borderTop: "1px dashed var(--surface-border)", paddingTop: 8 }}>
            <button
              type="button"
              className="btn ghost compact"
              style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}
              onClick={() => setExpanded(expanded === "Instagram" ? null : "Instagram")}
            >
              {expanded === "Instagram" ? "▲ Ocultar requisitos" : "▼ Requisitos para conectar"}
            </button>
            {expanded === "Instagram" && (
              <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.4 }}>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  <li>Tu cuenta de Instagram debe ser Comercial o Creador.</li>
                  <li>Debe estar vinculada a tu Página de Facebook.</li>
                  <li>En Instagram: <em>Configuración → Privacidad → Mensajes → Permitir acceso a los mensajes</em>.</li>
                </ul>
              </div>
            )}
          </div>
        </article>

        {/* 3. FACEBOOK MESSENGER CARD */}
        <article
          className="card pad channel-card"
          style={{
            borderLeft: `4px solid ${fbConnected ? "#1877f2" : "#477cc8"}`,
            background: fbConnected ? "rgba(24, 119, 242, 0.02)" : "inherit"
          }}
        >
          <div className="channel-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="channel-icon" style={{ fontSize: "1.8rem", color: "#477cc8" }}>
                📘
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Facebook Messenger</h2>
                <span
                  className="channel-status"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: fbConnected ? "#047857" : "#64748b"
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: fbConnected ? "#10b981" : "#94a3b8"
                    }}
                  />
                  {fbConnected
                    ? `Conectado (${metaStatus?.facebook?.pageName || "Página"})`
                    : "Preparado para conectar"}
                </span>
              </div>
            </div>

            {fbConnected && (
              <span className="badge ok" style={{ fontSize: "0.76rem", padding: "3px 8px" }}>
                ACTIVO
              </span>
            )}
          </div>

          <p className="muted" style={{ fontSize: "0.86rem", marginBottom: 14 }}>
            Messenger de tu Página de Facebook. Canal separado de Instagram: conectalo aunque no uses IG Direct.
          </p>

          {fbConnected ? (
            <div style={{ background: "rgba(0,0,0,0.03)", padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: "0.82rem", marginBottom: 6 }}>
                <strong>Página vinculada:</strong> {metaStatus?.facebook?.pageName || "Página Oficial"}
                <br />
                <strong>Page ID:</strong> {metaStatus?.facebook?.pageId || "-"}
                {metaStatus?.facebook?.lastSyncAtUtc && (
                  <>
                    <br />
                    <strong>Última sync:</strong> {new Date(metaStatus.facebook.lastSyncAtUtc).toLocaleString("es-AR")}
                  </>
                )}
              </div>
              {metaStatus?.facebook?.lastError && (
                <MetaReconnectBanner
                  channel="facebook"
                  lastError={metaStatus.facebook.lastError}
                  onReconnect={handleOpenMetaConfig}
                />
              )}
              {metaSyncMsg && (
                <div style={{ fontSize: "0.78rem", color: "#065f46", margin: "6px 0", fontWeight: 600 }}>
                  {metaSyncMsg}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <Link to="/comunicaciones" className="btn btn-primary compact">
                  📬 Ir a la Bandeja
                </Link>
                <button
                  type="button"
                  className="btn btn-outline compact"
                  onClick={handleForceMetaSync}
                  disabled={metaSyncing}
                >
                  {metaSyncing ? "Sincronizando..." : "🔄 Forzar Sincronización"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline compact"
                  onClick={() => {
                    setTestChannel("facebook");
                    setTestRecipient("");
                    setTestModalOpen(true);
                    setTestResult(null);
                  }}
                >
                  ✉️ Probar Envío
                </button>
                <button
                  type="button"
                  className="btn ghost compact"
                  style={{ color: "#dc2626" }}
                  onClick={() => handleDisconnectMeta("facebook")}
                >
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              {metaStatus?.facebook?.lastError && (
                <MetaReconnectBanner
                  channel="facebook"
                  lastError={metaStatus.facebook.lastError}
                  onReconnect={handleOpenMetaConfig}
                />
              )}
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", gap: 8, padding: "10px 16px", fontWeight: 700, background: "#1877f2" }}
                onClick={() => handleOpenMetaConfig("facebook")}
              >
                <span>📘</span> Conectar Facebook Messenger
              </button>
            </div>
          )}

          <div style={{ marginTop: 12, borderTop: "1px dashed var(--surface-border)", paddingTop: 8 }}>
            <button
              type="button"
              className="btn ghost compact"
              style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}
              onClick={() => setExpanded(expanded === "Facebook" ? null : "Facebook")}
            >
              {expanded === "Facebook" ? "▲ Ocultar requisitos" : "▼ Requisitos para conectar"}
            </button>
            {expanded === "Facebook" && (
              <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.4 }}>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  <li>Página de Facebook comercial de la empresa.</li>
                  <li>Acceso de administrador a la Página comercial.</li>
                </ul>
              </div>
            )}
          </div>
        </article>
      </div>

      {/* Team WhatsApp Lines Section */}
      <div className="card pad" style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div>
            <span className="eyebrow">EQUIPO COMERCIAL & ATENCIÓN</span>
            <h3 style={{ margin: 0, fontSize: "1.15rem" }}>👥 Líneas de WhatsApp del Equipo</h3>
            <p className="muted" style={{ fontSize: "0.84rem", margin: "4px 0 0 0" }}>
              Cada colaborador de la empresa puede escanear su propio WhatsApp para atender a sus clientes de forma personalizada.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline compact"
            onClick={checkStatus}
          >
            🔄 Actualizar estados
          </button>
        </div>

        <div className="table-responsive">
          <table className="table" style={{ width: "100%", fontSize: "0.88rem" }}>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Número de WhatsApp</th>
                <th>Estado</th>
                <th>Conectado Desde</th>
                <th>Última Sincronización</th>
              </tr>
            </thead>
            <tbody>
              {teamLines.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "20px", color: "var(--ink-soft)" }}>
                    Aún no hay líneas registradas en el equipo. Conectá tu propio WhatsApp arriba para activarla.
                  </td>
                </tr>
              ) : (
                teamLines.map((line) => {
                  const isMe = line.userId === user?.id;
                  return (
                    <tr key={line.id} style={{ background: isMe ? "rgba(13, 148, 136, 0.04)" : "inherit" }}>
                      <td>
                        <strong>{line.userName || (isMe ? `${user?.fullName} (Tú)` : "Línea Corporativa")}</strong>
                        {isMe && (
                          <span className="badge info" style={{ marginLeft: 6, fontSize: "0.7rem", padding: "1px 6px" }}>
                            Tu línea
                          </span>
                        )}
                      </td>
                      <td>
                        {line.phoneNumber ? (
                          <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#047857" }}>+{line.phoneNumber}</span>
                        ) : (
                          <span className="muted" style={{ fontSize: "0.8rem" }}>Sin número detectado</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${line.isConnected ? "ok" : line.state === "connecting" ? "warn" : "neutral"}`}
                          style={{ fontSize: "0.75rem" }}
                        >
                          {line.isConnected ? "🟢 ACTIVO" : line.state === "connecting" ? "🟡 CONECTANDO" : "⚪ DESCONECTADO"}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                        {line.connectedAtUtc ? new Date(line.connectedAtUtc).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                        {line.lastSyncAtUtc ? new Date(line.lastSyncAtUtc).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR Code Modal for WhatsApp */}
      {qrModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 460, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", display: "flex", alignItems: "center", gap: 8 }}>
                <span>📱</span> Vincular WhatsApp Web
              </h3>
              <button type="button" className="btn ghost compact" onClick={handleCloseQrModal} style={{ fontSize: "1.2rem" }}>
                ✕
              </button>
            </div>

            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 16 }}>
              Abrí WhatsApp en tu celular → Menú <strong>(⋮)</strong> o Configuración → <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong> y apuntá la cámara a este código QR:
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 260,
                background: "#ffffff",
                borderRadius: 12,
                padding: 16,
                border: "2px dashed #cbd5e1",
                marginBottom: 16
              }}
            >
              {qrLoading ? (
                <div style={{ color: "#0d9488", fontWeight: 700 }}>
                  <div className="spinner" style={{ margin: "0 auto 10px" }} />
                  Generando Código QR seguro...
                </div>
              ) : qrError ? (
                <div style={{ color: "#dc2626", fontSize: "0.85rem", padding: 10 }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>⚠️</div>
                  <strong>{qrError}</strong>
                  <div style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-outline compact" onClick={handleOpenQrModal}>
                      Reintentar
                    </button>
                  </div>
                </div>
              ) : qrCodeBase64 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <img
                    src={qrCodeBase64.startsWith("data:") ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`}
                    alt="Código QR de WhatsApp"
                    style={{ width: 230, height: 230, objectFit: "contain" }}
                  />
                  <small className="muted" style={{ marginTop: 8, fontSize: "0.75rem" }}>
                    🔄 Actualización en vivo activa
                  </small>
                </div>
              ) : (
                <span className="muted">No se pudo cargar el código QR.</span>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button type="button" className="btn btn-outline compact" onClick={handleOpenQrModal} disabled={qrLoading}>
                🔄 Regenerar QR
              </button>
              <button type="button" className="btn ghost" onClick={handleCloseQrModal}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meta (Facebook / Instagram) Clean Configuration Modal */}
      {metaModalChannel && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", display: "flex", alignItems: "center", gap: 8 }}>
                <span>{metaModalChannel === "instagram" ? "📸" : "📘"}</span> Conectar {metaModalChannel === "instagram" ? "Instagram Direct" : "Facebook Messenger"}
              </h3>
              <button type="button" className="btn ghost compact" onClick={() => setMetaModalChannel(null)}>
                ✕
              </button>
            </div>

            {/* Mode Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: "1px solid var(--surface-border)", paddingBottom: 8 }}>
              <button
                type="button"
                className={`btn compact ${metaAuthMode === "token" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setMetaAuthMode("token")}
              >
                🔑 Token de Página (Recomendado)
              </button>
              <button
                type="button"
                className={`btn compact ${metaAuthMode === "oauth" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setMetaAuthMode("oauth")}
              >
                🌐 Iniciar con Facebook
              </button>
            </div>

            {metaAuthMode === "token" ? (
              <form onSubmit={handleSaveMetaConfig} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p className="muted" style={{ fontSize: "0.84rem", margin: 0 }}>
                  Pegá el Token de Acceso de tu Página de Facebook (asociada a Instagram). Leal Control detectará automáticamente el nombre de tu Página y tu cuenta de Instagram:
                </p>

                <label style={{ fontSize: "0.84rem" }}>
                  <strong>Page Access Token (EAA...): *</strong>
                  <textarea
                    rows={3}
                    required
                    placeholder="Pegá aquí el Token de Acceso de Página..."
                    value={metaTokenInput}
                    onChange={(e) => setMetaTokenInput(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)", fontSize: "0.82rem", marginTop: 4 }}
                  />
                </label>

                {metaError && (
                  <div className="alert alert-danger" style={{ fontSize: "0.82rem", padding: "8px 12px" }}>
                    {metaError}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                  <button type="button" className="btn ghost" onClick={() => setMetaModalChannel(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingMeta || !metaTokenInput.trim()}>
                    {savingMeta ? "Validando y Conectando..." : "💾 Guardar y Conectar"}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p className="muted" style={{ fontSize: "0.84rem", margin: 0 }}>
                  Ingresá el <strong>App ID</strong> de tu aplicación de Meta Developers para abrir la ventana de autorización:
                </p>

                <label style={{ fontSize: "0.84rem" }}>
                  <strong>Meta App ID: *</strong>
                  <input
                    type="text"
                    placeholder="Ej: 123456789012345"
                    value={metaAppIdInput}
                    onChange={(e) => setMetaAppIdInput(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)", fontSize: "0.85rem", marginTop: 4 }}
                  />
                </label>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleMetaOAuthLogin}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    fontWeight: 700,
                    justifyContent: "center",
                    background: "#1877f2",
                    color: "#ffffff"
                  }}
                >
                  🟦 Continuar con Facebook
                </button>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <button type="button" className="btn ghost" onClick={() => setMetaModalChannel(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Test Message Modal */}
      {testModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", display: "flex", alignItems: "center", gap: 8 }}>
                <span>{testChannel === "whatsapp" ? "💬" : testChannel === "instagram" ? "📸" : "📘"}</span> Probar Envío de Mensaje ({testChannel.toUpperCase()})
              </h3>
              <button type="button" className="btn ghost compact" onClick={() => setTestModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTestMessage} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label>
                {testChannel === "whatsapp"
                  ? "Número de Celular Destinatario *"
                  : testChannel === "instagram"
                  ? "ID de Usuario o PSID de Instagram *"
                  : "ID de Usuario o PSID de Facebook *"}
                <input
                  type="text"
                  required
                  placeholder={testChannel === "whatsapp" ? "Ej: 5493415551234" : "Ej: 1234567890"}
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                />
              </label>

              <label>
                Mensaje de Prueba
                <textarea
                  rows={3}
                  required
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                />
              </label>

              {testResult && (
                <div
                  className={`alert ${testResult.ok ? "" : "alert-danger"}`}
                  style={{
                    background: testResult.ok ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    color: testResult.ok ? "#065f46" : "#b91c1c",
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: "0.85rem"
                  }}
                >
                  {testResult.msg}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
                <button type="button" className="btn ghost" onClick={() => setTestModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={sendingTest || !testRecipient.trim()}>
                  {sendingTest ? "Enviando..." : "📤 Enviar Mensaje"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
