import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { label, type Activity, type Opportunity, type Quote, type TenantUser } from "../api/types";
import { EmailComposer } from "../components/EmailComposer";

function money(value?: number | null, currency = "ARS") {
  return value == null ? "Sin monto estimado" : `${currency} $${Number(value).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

const pipeline = ["Discovery", "Proposal", "Negotiation", "Won", "Lost"] as const;
type Stage = (typeof pipeline)[number];

const stageLabels: Record<Stage, string> = {
  Discovery: "Relevamiento",
  Proposal: "Propuesta",
  Negotiation: "Negociación",
  Won: "Ganada",
  Lost: "Perdida"
};

export function OpportunityDetailPage() {
  const [showEmail, setShowEmail] = useState(false);
  const { id } = useParams();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<TenantUser[]>([]);

  // Stage change / Reversion Modal State
  const [showStageModal, setShowStageModal] = useState(false);
  const [targetStage, setTargetStage] = useState<Stage>("Negotiation");
  const [revertReason, setRevertReason] = useState("");
  const [reverting, setReverting] = useState(false);

  const [description, setDescription] = useState("");
  const [type, setType] = useState("Call");
  const [followUp, setFollowUp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const [opps, quoteList, customerPage, opportunityActivities, userList] = await Promise.all([
        api.listOpportunities(),
        api.listQuotes(),
        api.listCustomers(),
        api.opportunityTimeline(id),
        api.listTenantUsers().catch(() => [])
      ]);
      const found = opps.find((item) => item.id === id) ?? null;
      setOpportunity(found);
      setQuotes(quoteList.filter((quote) => quote.opportunityId === id));
      setActivities(opportunityActivities);
      setCustomers(Object.fromEntries((customerPage.items || []).map((customer) => [customer.id, customer.legalName])));
      setUsers((userList || []).filter((u) => u.isActive !== false));
      if (!found) setError("No se encontró la oportunidad.");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const timeline = useMemo(() => {
    if (!opportunity) return [];
    const events = [
      { date: opportunity.createdAtUtc, title: "Oportunidad creada", detail: `Ingresó en ${label(opportunity.stage)}`, tone: "info" },
      ...activities.map((activity) => ({ date: activity.occurredAtUtc, title: label(activity.type), detail: activity.description, tone: "neutral" })),
      ...quotes.map((quote) => ({ date: quote.updatedAtUtc ?? quote.createdAtUtc, title: `Presupuesto ${quote.quoteNumber}`, detail: `${label(quote.status)} · revisión ${quote.revision}`, tone: "proposal" }))
    ];
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [opportunity, activities, quotes]);

  const logActivity = async (event: FormEvent) => {
    event.preventDefault();
    if (!opportunity || !description.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.logActivity({
        type,
        description: description.trim(),
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        nextFollowUpOn: followUp ? new Date(`${followUp}T12:00:00`).toISOString() : null
      });
      setDescription("");
      setFollowUp("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const createQuote = async () => {
    if (!opportunity) return;
    setBusy(true);
    setError(null);
    try {
      const quote = await api.createQuoteFromOpportunity(opportunity.id);
      navigate(`/presupuestos/${quote.id}/editar`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleStageReversion = async (e: FormEvent) => {
    e.preventDefault();
    if (!opportunity || !revertReason.trim()) return;
    setReverting(true);
    setError(null);
    try {
      await api.logActivity({
        type: "Note",
        description: `[CAMBIO / REVERSIÓN DE ETAPA a ${stageLabels[targetStage]}] Motivo: ${revertReason.trim()}`,
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        nextFollowUpOn: null
      });
      await api.moveOpportunity(opportunity.id, targetStage, targetStage === "Lost" ? revertReason.trim() : undefined);
      setShowStageModal(false);
      setRevertReason("");
      await load();
    } catch (err: any) {
      setError(err?.message || "Error al cambiar etapa.");
    } finally {
      setReverting(false);
    }
  };

  if (!opportunity) return <div className="card pad">{error ?? "Cargando oportunidad…"}</div>;
  const customerName = opportunity.customerName || (opportunity.customerId ? customers[opportunity.customerId] : null);

  return (
    <div className="opportunity-workspace page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">OPORTUNIDAD COMERCIAL</span>
          <h1>{opportunity.title}</h1>
          <p className="muted">
            {customerName ? (
              <Link to={`/clientes/${opportunity.customerId}`} style={{ fontWeight: 600, color: "#0d9488" }}>
                🏢 {customerName}
              </Link>
            ) : (
              <span style={{ color: "#f59e0b" }}>⚠️ Cliente pendiente de vincular</span>
            )}
          </p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" onClick={() => setShowEmail(true)}>
            ✉ Enviar email
          </button>
          {showEmail && (
            <EmailComposer
              context={{
                entityType: "Opportunity",
                entityId: opportunity.id,
                subject: `Seguimiento: ${opportunity.title}`,
                body: `Hola,\n\nEscribimos para continuar con ${opportunity.title}.\n\n`
              }}
              onClose={() => setShowEmail(false)}
            />
          )}
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: "#d97706", borderColor: "#f59e0b" }}
            onClick={() => {
              setTargetStage(opportunity.stage === "Won" || opportunity.stage === "Lost" ? "Negotiation" : "Discovery");
              setShowStageModal(true);
            }}
          >
            🔄 Revertir / Cambiar Etapa
          </button>
          <Link className="btn btn-outline" to="/oportunidades">
            Volver al embudo
          </Link>
          <Link className="btn btn-outline" to="/crm/ayuda">
            Ayuda
          </Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="opportunity-summary card pad">
        <div>
          <span className="muted">Etapa Actual</span>
          <strong>{label(opportunity.stage)}</strong>
        </div>
        <div>
          <span className="muted">Valor esperado</span>
          <strong>{money(opportunity.amount, opportunity.currency)}</strong>
        </div>
        <div>
          <span className="muted">Responsable / Vendedor</span>
          <strong>👤 {opportunity.ownerName || "Sin asignar"}</strong>
        </div>
        <div>
          <span className="muted">Cierre estimado</span>
          <strong>{opportunity.expectedCloseDate ? new Date(opportunity.expectedCloseDate).toLocaleDateString("es-AR") : "Sin fecha"}</strong>
        </div>
        <div>
          <span className="muted">Próxima acción</span>
          <strong>{opportunity.activityBadgeStatus === "Gray" ? "Pendiente de definir" : label(opportunity.activityBadgeStatus)}</strong>
        </div>
      </div>

      {/* Modal: Cambiar / Revertir Etapa con Motivo Obligatorio */}
      {showStageModal && (
        <div className="modal-backdrop" onClick={() => setShowStageModal(false)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div>
                <span className="eyebrow">AUDITORÍA COMERCIAL</span>
                <h2>🔄 Revertir / Cambiar Etapa</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowStageModal(false)}>
                ×
              </button>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Cualquier retroceso o cambio de estado exige un motivo detallado que quedará registrado en el historial de la oportunidad.
            </p>

            <form onSubmit={handleStageReversion} className="stack" style={{ gap: 14, marginTop: 12 }}>
              <label>
                Nueva Etapa Destino *
                <select value={targetStage} onChange={(e) => setTargetStage(e.target.value as Stage)} required>
                  <option value="Discovery">1. Relevamiento</option>
                  <option value="Proposal">2. Propuesta</option>
                  <option value="Negotiation">3. Negociación</option>
                  <option value="Won">4. Ganada</option>
                  <option value="Lost">5. Perdida</option>
                </select>
              </label>

              <label>
                Motivo Obligatorio de la Reversión / Cambio *
                <textarea
                  required
                  rows={4}
                  value={revertReason}
                  onChange={(e) => setRevertReason(e.target.value)}
                  placeholder="Ej: El cliente solicitó reabrir la negociación para modificar plazos y alcances..."
                />
              </label>

              <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowStageModal(false)}>
                  Cancelar
                </button>
                <button className="btn" disabled={reverting || !revertReason.trim()}>
                  {reverting ? "Guardando..." : "Confirmar Cambio de Etapa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="opportunity-layout">
        <div className="stack">
          <section className="card pad">
            <div className="section-head">
              <div>
                <h2>Propuesta comercial</h2>
                <p className="muted">Presupuestos vinculados a esta negociación.</p>
              </div>
              <button className="btn" type="button" onClick={createQuote} disabled={busy || !opportunity.customerId}>
                + Crear presupuesto
              </button>
            </div>
            {!opportunity.customerId && (
              <div className="hint" style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #f59e0b" }}>
                ⚠️ Vinculá un cliente antes de preparar la propuesta formal.
              </div>
            )}
            {quotes.length === 0 ? (
              <div className="empty-state">Todavía no existe una propuesta presupuestaria.</div>
            ) : (
              quotes.map((quote) => (
                <div className="quote-row" key={quote.id}>
                  <div>
                    <strong>{quote.quoteNumber}</strong>
                    <span className="muted">
                      {" "}
                      Revisión {quote.revision} · {label(quote.status)}
                    </span>
                  </div>
                  <Link to={`/presupuestos/${quote.id}/editar`}>Abrir</Link>
                </div>
              ))
            )}
          </section>
          <section className="card pad">
            <h2>Historial comercial</h2>
            <div className="crm-timeline">
              {timeline.map((item, index) => (
                <article key={`${item.date}-${index}`} className="timeline-event">
                  <span className={`timeline-dot ${item.tone}`} />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <time>{new Date(item.date).toLocaleString("es-AR")}</time>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
        <aside className="card pad activity-composer">
          <h2>Registrar interacción</h2>
          <p className="muted">Cada llamada, reunión o mensaje explica qué ocurrió y cuál es el próximo paso.</p>
          <form onSubmit={logActivity} className="stack">
            <label>
              Tipo
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="Call">Llamada</option>
                <option value="Meeting">Reunión</option>
                <option value="Email">Email</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Note">Nota interna</option>
              </select>
            </label>
            <label>
              Resultado
              <textarea
                required
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Qué se conversó, respuesta del cliente, objeciones o acuerdos…"
              />
            </label>
            <label>
              Próximo seguimiento
              <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </label>
            <button className="btn" disabled={busy || !description.trim()}>
              Guardar en historial
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
