import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

type Channel = "WhatsApp" | "Instagram" | "Facebook";

export function ChannelsPage() {
  const [expanded, setExpanded] = useState<Channel | null>(null);

  // WhatsApp Gateway State
  const [waStatus, setWaStatus] = useState<"loading" | "connected" | "disconnected" | "connecting" | "offline">("loading");
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Test Message Modal State
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Hola! Este es un mensaje de prueba enviado desde Leal Control ERP.");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const pollRef = useRef<number | null>(null);

  const checkStatus = async () => {
    try {
      const res = await api.getWhatsAppStatus();
      if (!res.available) {
        setWaStatus("offline");
      } else if (res.state === "open" || res.state === "connected") {
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
  };

  useEffect(() => {
    void checkStatus();
    const interval = window.setInterval(() => {
      void checkStatus();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenQrModal = async () => {
    setQrModalOpen(true);
    setQrLoading(true);
    setQrError(null);
    setQrCodeBase64(null);

    try {
      const res = await api.connectWhatsApp();
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

    // Start fast polling while modal is open
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await api.getWhatsAppStatus();
        if (s.state === "open" || s.state === "connected") {
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

  const handleDisconnect = async () => {
    if (!confirm("¿Está seguro de que desea desconectar la cuenta de WhatsApp de Leal Control?")) return;
    setDisconnecting(true);
    try {
      await api.disconnectWhatsApp();
      await checkStatus();
    } catch (err: any) {
      alert("Error al desconectar: " + err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) return;
    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await api.sendWhatsAppMessage({
        to: testPhone.trim(),
        message: testMessage.trim()
      });
      if (res.success) {
        setTestResult({ ok: true, msg: "¡Mensaje de WhatsApp enviado con éxito!" });
      } else {
        setTestResult({ ok: false, msg: res.error || "No se pudo enviar el mensaje." });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message || "Error al enviar mensaje." });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="channels-page page-wide" style={{ paddingBottom: 50 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">COMUNICACIONES</span>
          <h1>Canales Sociales & Mensajería</h1>
          <p className="muted">
            Conectá los canales donde tus clientes ya conversan y gestioná todo desde una sola bandeja omnicanal.
          </p>
        </div>
      </div>

      {/* Intro Banner */}
      <div className="card pad channel-intro">
        <div>
          <span className="eyebrow">BANDEJA OMNICANAL</span>
          <h2>Una conversación, un historial</h2>
          <p className="muted">
            Cada mensaje se vincula automáticamente con una empresa, contacto, prospecto u oportunidad del CRM, sin importar si llegó por email o WhatsApp.
          </p>
        </div>
        <span className="channel-orbit">✉　💬　📸　📘</span>
      </div>

      {/* Channels Grid */}
      <div className="channel-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
        {/* 1. WHATSAPP CARD (ACTIVE GATEWAY) */}
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
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>WhatsApp Business</h2>
                <span
                  className="channel-status"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.8rem",
                    fontWeight: 700,
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
            Atención comercial, respuesta de consultas y envío directo de presupuestos, remitos y facturas desde WhatsApp Web con código QR ($0 costo).
          </p>

          {waStatus === "connected" ? (
            <div style={{ background: "rgba(0,0,0,0.03)", padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: "0.82rem", marginBottom: 6 }}>
                <strong>Línea vinculada:</strong> {waPhone ? `+${waPhone}` : "Dispositivo principal conectado"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <Link to="/comunicaciones" className="btn btn-primary compact">
                  📬 Ir a la Bandeja
                </Link>
                <button
                  type="button"
                  className="btn btn-outline compact"
                  onClick={() => {
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
                  onClick={handleDisconnect}
                >
                  {disconnecting ? "Desconectando..." : "Desconectar"}
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
                <span>📲</span> Conectar WhatsApp con Código QR
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
              {expanded === "WhatsApp" ? "▲ Ocultar cómo funciona" : "▼ ¿Cómo funciona la conexión QR?"}
            </button>
            {expanded === "WhatsApp" && (
              <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.4 }}>
                <ol style={{ paddingLeft: 18, margin: 0 }}>
                  <li>Hacés clic en "Conectar con Código QR".</li>
                  <li>Abrís WhatsApp en tu teléfono → <strong>Dispositivos vinculados</strong> → <strong>Vincular dispositivo</strong>.</li>
                  <li>Escaneás el QR en pantalla y quedás conectado al instante sin ningún trámite con Meta.</li>
                </ol>
              </div>
            )}
          </div>
        </article>

        {/* 2. INSTAGRAM DIRECT */}
        <article className="card pad channel-card" style={{ opacity: 0.9 }}>
          <div className="channel-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="channel-icon" style={{ fontSize: "1.8rem", color: "#c24b8d" }}>
                📸
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Instagram Direct</h2>
                <span className="channel-status" style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Preparado para conectar (Meta Graph API)
                </span>
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: "0.86rem", marginBottom: 14 }}>
            Mensajes directos de cuentas comerciales vinculadas a Meta. 100% gratuito e ilimitado.
          </p>
          <button
            type="button"
            className="btn btn-outline"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => alert("La conexión con Instagram Direct requiere vincular la página comercial en Meta Developers.")}
          >
            📘 Conectar con Facebook / Meta
          </button>
        </article>

        {/* 3. FACEBOOK MESSENGER */}
        <article className="card pad channel-card" style={{ opacity: 0.9 }}>
          <div className="channel-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="channel-icon" style={{ fontSize: "1.8rem", color: "#477cc8" }}>
                📘
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Facebook Messenger</h2>
                <span className="channel-status" style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Preparado para conectar (Meta Graph API)
                </span>
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: "0.86rem", marginBottom: 14 }}>
            Messenger de páginas de fans de la empresa, integrado en el mismo historial del CRM.
          </p>
          <button
            type="button"
            className="btn btn-outline"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => alert("La conexión con Facebook Messenger requiere permisos de página comercial en Meta Developers.")}
          >
            📘 Conectar con Facebook / Meta
          </button>
        </article>
      </div>

      {/* QR Code Modal */}
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

      {/* Test Message Modal */}
      {testModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", display: "flex", alignItems: "center", gap: 8 }}>
                <span>💬</span> Probar Envío de WhatsApp
              </h3>
              <button type="button" className="btn ghost compact" onClick={() => setTestModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTestMessage} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label>
                Número de Celular Destinatario *
                <input
                  type="text"
                  required
                  placeholder="Ej: 5493415551234 (con código de país y área)"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                />
                <small className="muted">En Argentina incluir 549 seguido de la característica y número sin el 15.</small>
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
                <button type="submit" className="btn btn-primary" disabled={sendingTest || !testPhone.trim()}>
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
