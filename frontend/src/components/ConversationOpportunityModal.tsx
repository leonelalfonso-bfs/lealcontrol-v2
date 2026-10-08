import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Conversation, CustomerMatch } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { CustomerPicker } from "./pickers";
import { QuickCustomerModal } from "./QuickCustomerModal";

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Correo",
  instagram: "Instagram",
  facebook: "Facebook"
};

type Props = {
  conversation: Conversation;
  channel: string;
  displayName: string;
  /** Texto del último mensaje recibido, para la necesidad. */
  lastIncomingText?: string;
  onClose: () => void;
  onCreated: (opportunityId: string) => void;
};

/**
 * Convierte una conversación en una oportunidad del CRM: elige (o crea) el cliente, crea la
 * oportunidad con el mensaje como necesidad y deja la conversación vinculada a las dos.
 */
export function ConversationOpportunityModal({ conversation, channel, displayName, lastIncomingText, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const channelLabel = CHANNEL_LABEL[channel] ?? "Mensaje";
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [customerId, setCustomerId] = useState(conversation.relatedCustomerId ?? "");
  const [title, setTitle] = useState(`Consulta por ${channelLabel} — ${displayName}`);
  const [need, setNeed] = useState((lastIncomingText || conversation.lastMessagePreview || "").slice(0, 1000));
  const [amount, setAmount] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getSuggestedMatches(conversation.id)
      .then((found) => {
        if (cancelled) return;
        setMatches(found);
        if (!conversation.relatedCustomerId && found.length === 1) setCustomerId(found[0].id);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [conversation.id, conversation.relatedCustomerId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) {
      setError("Elegí el cliente, o crealo, para poder seguir la oportunidad.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const opportunity = await api.openOpportunity({
        title: title.trim(),
        customerId,
        amount: amount ? Number(amount) : null,
        currency: "ARS",
        ownerId: user?.id ?? null,
        ownerName: user?.fullName ?? null,
        priority: "Normal",
        tags: [channelLabel],
        customFields: { ...(need.trim() ? { necesidad: need.trim() } : {}), origen: channelLabel }
      });
      await api.linkConversation(conversation.id, { customerId, opportunityId: opportunity.id });
      setCreated(opportunity.id);
      onCreated(opportunity.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la oportunidad.");
    } finally {
      setBusy(false);
    }
  };

  if (creatingCustomer !== null) {
    return (
      <QuickCustomerModal
        isOpen
        initialName={creatingCustomer || displayName}
        onClose={() => setCreatingCustomer(null)}
        onSuccess={(customer) => {
          setCustomerId(customer.id);
          setCreatingCustomer(null);
        }}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card card pad" style={{ maxWidth: 560, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        {created ? (
          <div className="stack" style={{ gap: 12 }}>
            <h3 style={{ margin: 0 }}>Oportunidad creada</h3>
            <p className="muted" style={{ margin: 0 }}>
              La conversación quedó vinculada al cliente y a la oportunidad. Desde la oportunidad seguís con el presupuesto.
            </p>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>Seguir en la bandeja</button>
              <Link className="btn" to={`/oportunidades/${created}`}>Abrir oportunidad</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
            <div>
              <h3 style={{ margin: 0 }}>Convertir en oportunidad</h3>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                {channelLabel} de <strong>{displayName}</strong>. La conversación queda dentro de la oportunidad.
              </p>
            </div>

            <label>
              Cliente *
              <CustomerPicker
                value={customerId}
                onChange={(id) => setCustomerId(id)}
                onCreate={(query) => setCreatingCustomer(query)}
                placeholder="Elegir o crear cliente…"
              />
            </label>
            {matches.length > 0 && (
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: -6 }}>
                <span className="muted" style={{ fontSize: "0.8rem" }}>Coincide por teléfono o correo:</span>
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`btn compact ${customerId === m.id ? "" : "btn-outline"}`}
                    onClick={() => setCustomerId(m.id)}
                  >
                    {m.tradeName || m.legalName}
                  </button>
                ))}
              </div>
            )}

            <label>
              Título *
              <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </label>

            <label>
              Qué necesita
              <textarea rows={3} value={need} onChange={(e) => setNeed(e.target.value)} maxLength={1000} />
            </label>

            <label>
              Importe estimado (opcional)
              <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" />
            </label>

            {error && <div className="alert">{error}</div>}

            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancelar</button>
              <button className="btn" disabled={busy || !title.trim()}>{busy ? "Creando…" : "Crear oportunidad"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
