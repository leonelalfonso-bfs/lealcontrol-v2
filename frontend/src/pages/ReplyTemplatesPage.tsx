import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { MessageReplyTemplate } from "../api/types";

const CHANNELS = [
  { value: "", label: "Todos los canales" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "email", label: "Email" }
];

const emptyForm = { id: "", name: "", body: "", channelType: "" };

export function ReplyTemplatesPage() {
  const [templates, setTemplates] = useState<MessageReplyTemplate[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.listReplyTemplates()
      .then(setTemplates)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.saveReplyTemplate({
        id: form.id || undefined,
        name: form.name.trim(),
        body: form.body,
        channelType: form.channelType || undefined
      });
      setMessage(form.id ? "Plantilla actualizada." : "Plantilla creada.");
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (t: MessageReplyTemplate) => {
    setForm({ id: t.id, name: t.name, body: t.body, channelType: t.channelType || "" });
    setMessage(null);
    setError(null);
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla de respuesta?")) return;
    setBusy(true);
    try {
      await api.deleteReplyTemplate(id);
      setMessage("Plantilla eliminada.");
      if (form.id === id) setForm(emptyForm);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-wide" style={{ paddingBottom: 40 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">COMUNICACIONES</span>
          <h1>Plantillas de respuesta rápida</h1>
          <p className="muted">
            Mensajes predefinidos para WhatsApp, Instagram, Facebook y email. Se usan desde la bandeja omnicanal.
          </p>
        </div>
        <Link className="btn btn-outline" to="/comunicaciones">
          ← Volver a la bandeja
        </Link>
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && <div className="alert">{error}</div>}

      <div className="mail-layout">
        <section className="card pad">
          <div className="section-head">
            <div>
              <h2>Plantillas guardadas</h2>
              <p className="muted">{templates.length} plantilla(s) disponibles para el equipo.</p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {templates.map((t) => (
              <article
                key={t.id}
                style={{
                  padding: 14,
                  border: "1px solid var(--surface-border)",
                  borderRadius: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start"
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <strong>{t.name}</strong>
                    {t.channelType && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          background: "var(--surface-muted)",
                          padding: "2px 8px",
                          borderRadius: 10,
                          color: "var(--ink-soft)"
                        }}
                      >
                        {t.channelType}
                      </span>
                    )}
                  </div>
                  <div
                    className="muted"
                    style={{
                      fontSize: "0.85rem",
                      whiteSpace: "pre-wrap",
                      maxHeight: 80,
                      overflow: "hidden"
                    }}
                  >
                    {t.body}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button type="button" className="btn btn-outline compact" disabled={busy} onClick={() => edit(t)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn-danger compact" disabled={busy} onClick={() => void remove(t.id)}>
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
            {templates.length === 0 && (
              <div className="empty-state">Todavía no hay plantillas. Creá la primera con el formulario de la derecha.</div>
            )}
          </div>
        </section>

        <form className="card pad" onSubmit={save}>
          <h2>{form.id ? "Editar plantilla" : "Nueva plantilla"}</h2>
          <p className="muted">Ejemplos: datos bancarios, horarios de atención, seguimiento de cotización.</p>

          <label>
            Nombre *
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Datos bancarios"
            />
          </label>

          <label>
            Canal (opcional)
            <select
              value={form.channelType}
              onChange={(e) => setForm({ ...form, channelType: e.target.value })}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
            >
              {CHANNELS.map((c) => (
                <option key={c.value || "all"} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Contenido del mensaje *
            <textarea
              required
              rows={8}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Escribí el texto que querés reutilizar..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--surface-border)", fontFamily: "inherit" }}
            />
          </label>

          <div className="toolbar">
            <button type="submit" className="btn" disabled={busy}>
              {form.id ? "Guardar cambios" : "Crear plantilla"}
            </button>
            {form.id && (
              <button type="button" className="btn btn-outline" onClick={() => setForm(emptyForm)}>
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
