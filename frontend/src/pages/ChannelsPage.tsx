import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Channel = "Instagram" | "Facebook";

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

// Instagram y Facebook quedan para la segunda etapa de Comunicaciones (API oficial de Meta).
export const SOCIAL_CHANNELS_ENABLED = false;

export function ChannelsPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<Channel | null>(null);

  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaSyncMsg, setMetaSyncMsg] = useState<string | null>(null);

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
  const [testChannel, setTestChannel] = useState<"facebook" | "instagram">("instagram");
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("Hola! Este es un mensaje de prueba enviado desde Leal Control ERP.");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const webhookUrl = `${window.location.origin}/api/communications/meta/webhook`;

  const checkStatus = async () => {
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
      {!embedded && (
        <div className="page-head">
          <div>
            <span className="eyebrow">COMUNICACIONES</span>
            <h1>Redes sociales</h1>
            <p className="muted">Conectá Instagram y Facebook para recibir los mensajes en la bandeja.</p>
          </div>
        </div>
      )}

      {/* Channels Grid */}
      <div className="channel-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
        {/* Instagram y Facebook: segunda etapa, junto con la API oficial de Meta. */}
        {SOCIAL_CHANNELS_ENABLED && (<>
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
        </>)}
      </div>

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
                <span>{testChannel === "instagram" ? "📸" : "📘"}</span> Probar Envío de Mensaje ({testChannel.toUpperCase()})
              </h3>
              <button type="button" className="btn ghost compact" onClick={() => setTestModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTestMessage} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label>
                {testChannel === "instagram"
                  ? "ID de Usuario o PSID de Instagram *"
                  : "ID de Usuario o PSID de Facebook *"}
                <input
                  type="text"
                  required
                  placeholder="Ej: 1234567890"
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
