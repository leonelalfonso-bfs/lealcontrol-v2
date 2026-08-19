import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { automationApi, type ActionLink, type ChatMessage } from "../api/automationApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ActionLink[];
  timestamp: Date;
}

const QUICK_QUESTIONS = [
  "¿Cómo cargo un nuevo presupuesto?",
  "¿Cómo paso un presupuesto a factura?",
  "¿Cómo doy de alta un cliente con ARCA y BCRA?",
  "¿Cómo cargo una balanza o equipo técnico?",
  "¿Cómo importo facturas de proveedores desde ARCA?"
];

export function AskLealAssistantModal({ isOpen, onClose }: Props) {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "¡Hola! 👋 Soy tu **Asistente Experto de LEAL Control ERP**.\n\nPuedo explicarte paso a paso cómo realizar cualquier tarea en el sistema (ventas, presupuestos, facturación con CAE, alta con ARCA/BCRA, compras, taller o stock) o guiarte a la pantalla adecuada.\n\n¿En qué te puedo ayudar hoy?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (questionText?: string) => {
    const textToSend = questionText || input.trim();
    if (!textToSend || loading) return;

    const userMsg: MessageItem = {
      id: "u-" + Date.now(),
      role: "user",
      content: textToSend,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Build history for API
      const historyForApi: ChatMessage[] = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          content: m.content
        }));

      const res = await automationApi.askLeal(textToSend, historyForApi);

      const assistantMsg: MessageItem = {
        id: "a-" + Date.now(),
        role: "assistant",
        content: res.answer,
        actions: res.suggestedActions,
        timestamp: new Date()
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: MessageItem = {
        id: "err-" + Date.now(),
        role: "assistant",
        content: "⚠️ " + (err?.message || "Ocurrió un error al procesar tu consulta. Por favor probá de nuevo."),
        timestamp: new Date()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        background: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "flex-end"
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          height: "100%",
          background: "var(--surface)",
          boxShadow: "-8px 0 30px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          position: "relative"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.5rem" }}>🤖</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Preguntale a LEAL</span>
                <span style={{ fontSize: "0.68rem", background: "#0d9488", color: "#fff", padding: "2px 8px", borderRadius: "12px", fontWeight: 700 }}>
                  IA Copilot
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Ayudante y guía paso a paso del ERP
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              cursor: "pointer",
              fontSize: "1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            ×
          </button>
        </div>

        {/* Quick Questions Pill Bar */}
        <div style={{
          padding: "10px 16px",
          background: "var(--surface-muted)",
          borderBottom: "1px solid var(--surface-border)",
          overflowX: "auto",
          whiteSpace: "nowrap",
          display: "flex",
          gap: "8px"
        }}>
          {QUICK_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(q)}
              disabled={loading}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--surface-border)",
                color: "var(--ink)",
                fontSize: "0.75rem",
                padding: "4px 10px",
                borderRadius: "14px",
                cursor: "pointer",
                fontWeight: 600,
                flexShrink: 0
              }}
            >
              💬 {q}
            </button>
          ))}
        </div>

        {/* Message Conversation Area */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px"
        }}>
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: isUser ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isUser ? "flex-end" : "flex-start"
                }}
              >
                <div
                  style={{
                    background: isUser ? "linear-gradient(135deg, #0d9488, #0f766e)" : "var(--surface-card, #f8fafc)",
                    color: isUser ? "#ffffff" : "var(--ink)",
                    padding: "12px 16px",
                    borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    border: isUser ? "none" : "1px solid var(--surface-border)",
                    fontSize: "0.88rem",
                    lineHeight: "1.5",
                    whiteSpace: "pre-wrap",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
                  }}
                >
                  {msg.content}
                </div>

                {/* Suggested Action Buttons */}
                {msg.actions && msg.actions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                    {msg.actions.map((act, aIdx) => (
                      <Link
                        key={aIdx}
                        to={act.url}
                        onClick={onClose}
                        style={{
                          background: "#0f172a",
                          color: "#ffffff",
                          textDecoration: "none",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          padding: "6px 12px",
                          borderRadius: "8px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        <span>{act.icon || "👉"}</span>
                        <span>{act.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div style={{
              alignSelf: "flex-start",
              background: "var(--surface-muted)",
              padding: "10px 16px",
              borderRadius: "16px 16px 16px 4px",
              fontSize: "0.84rem",
              color: "var(--ink-soft)",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span>🤖</span>
              <span>Consultando a LEAL Inteligencia...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          style={{
            padding: "14px 16px",
            borderTop: "1px solid var(--surface-border)",
            background: "var(--surface)",
            display: "flex",
            gap: "8px",
            alignItems: "center"
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Preguntale cómo hacer algo en el ERP..."
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--surface-border)",
              fontSize: "0.88rem",
              background: "var(--surface-input, #fff)",
              color: "var(--ink)",
              outline: "none"
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn"
            style={{
              background: "linear-gradient(135deg, #0d9488, #0f766e)",
              color: "#ffffff",
              fontWeight: 700,
              padding: "10px 16px",
              borderRadius: "8px",
              fontSize: "0.88rem",
              cursor: "pointer",
              border: "none"
            }}
          >
            Enviar 🚀
          </button>
        </form>
      </div>
    </div>
  );
}
