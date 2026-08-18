import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { label, type Activity, type Opportunity, type Quote } from "../api/types";
import { EmailComposer } from "../components/EmailComposer";

function money(value?: number | null, currency = "ARS") {
  return value == null ? "Sin monto estimado" : `${currency} $${Number(value).toLocaleString("es-AR")}`;
}

export function OpportunityDetailPage() {
  const [showEmail, setShowEmail] = useState(false);
  const { id } = useParams();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [description, setDescription] = useState("");
  const [type, setType] = useState("Call");
  const [followUp, setFollowUp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    try {
      const [opps, quoteList, customerPage, opportunityActivities] = await Promise.all([
        api.listOpportunities(), api.listQuotes(), api.listCustomers(), api.opportunityTimeline(id)
      ]);
      const found = opps.find((item) => item.id === id) ?? null;
      setOpportunity(found);
      setQuotes(quoteList.filter((quote) => quote.opportunityId === id));
      setActivities(opportunityActivities);
      setCustomers(Object.fromEntries(customerPage.items.map((customer) => [customer.id, customer.legalName])));
      if (!found) setError("No se encontró la oportunidad.");
    } catch (e) { setError((e as Error).message); }
  };

  useEffect(() => { void load(); }, [id]);

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
    setBusy(true); setError(null);
    try {
      await api.logActivity({
        type,
        description: description.trim(),
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        nextFollowUpOn: followUp ? new Date(`${followUp}T12:00:00`).toISOString() : null
      });
      setDescription(""); setFollowUp(""); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const createQuote = async () => {
    if (!opportunity) return;
    setBusy(true); setError(null);
    try {
      const quote = await api.createQuoteFromOpportunity(opportunity.id);
      navigate(`/presupuestos/${quote.id}/editar`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  if (!opportunity) return <div className="card pad">{error ?? "Cargando oportunidad…"}</div>;
  const customerName = opportunity.customerName || (opportunity.customerId ? customers[opportunity.customerId] : null);

  return (
    <div className="opportunity-workspace page-wide">
      <div className="page-head">
        <div><span className="eyebrow">OPORTUNIDAD COMERCIAL</span><h1>{opportunity.title}</h1><p className="muted">{customerName || "Cliente pendiente de vincular"}</p></div>
        <div className="toolbar"><button type="button" className="btn" onClick={() => setShowEmail(true)}>✉ Enviar email</button>{showEmail && <EmailComposer context={{ entityType: "Opportunity", entityId: opportunity.id, subject: `Seguimiento: ${opportunity.title}`, body: `Hola,\n\nEscribimos para continuar con ${opportunity.title}.\n\n` }} onClose={() => setShowEmail(false)} />}<Link className="btn btn-outline" to="/oportunidades">Volver al embudo</Link><Link className="btn btn-outline" to="/crm/ayuda">Ayuda</Link></div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="opportunity-summary card pad">
        <div><span className="muted">Etapa</span><strong>{label(opportunity.stage)}</strong></div>
        <div><span className="muted">Valor esperado</span><strong>{money(opportunity.amount, opportunity.currency)}</strong></div>
        <div><span className="muted">Responsable</span><strong>{opportunity.ownerName || "Sin asignar"}</strong></div>
        <div><span className="muted">Cierre estimado</span><strong>{opportunity.expectedCloseDate ? new Date(opportunity.expectedCloseDate).toLocaleDateString("es-AR") : "Sin fecha"}</strong></div>
        <div><span className="muted">Próxima acción</span><strong>{opportunity.activityBadgeStatus === "Gray" ? "Pendiente de definir" : label(opportunity.activityBadgeStatus)}</strong></div>
      </div>
      <div className="opportunity-layout">
        <div className="stack">
          <section className="card pad">
            <div className="section-head"><div><h2>Propuesta comercial</h2><p className="muted">Presupuestos vinculados a esta negociación.</p></div><button className="btn" type="button" onClick={createQuote} disabled={busy || !opportunity.customerId}>+ Crear presupuesto</button></div>
            {!opportunity.customerId && <div className="hint">Vinculá un cliente antes de preparar la propuesta.</div>}
            {quotes.length === 0 ? <div className="empty-state">Todavía no existe una propuesta.</div> : quotes.map((quote) => <div className="quote-row" key={quote.id}><div><strong>{quote.quoteNumber}</strong><span className="muted"> Revisión {quote.revision} · {label(quote.status)}</span></div><Link to={`/presupuestos/${quote.id}/editar`}>Abrir</Link></div>)}
          </section>
          <section className="card pad">
            <h2>Historial comercial</h2>
            <div className="crm-timeline">{timeline.map((item, index) => <article key={`${item.date}-${index}`} className="timeline-event"><span className={`timeline-dot ${item.tone}`} /><div><strong>{item.title}</strong><p>{item.detail}</p><time>{new Date(item.date).toLocaleString("es-AR")}</time></div></article>)}</div>
          </section>
        </div>
        <aside className="card pad activity-composer">
          <h2>Registrar interacción</h2>
          <p className="muted">Cada llamada, reunión o mensaje explica qué ocurrió y cuál es el próximo paso.</p>
          <form onSubmit={logActivity} className="stack">
            <label>Tipo<select value={type} onChange={(e) => setType(e.target.value)}><option value="Call">Llamada</option><option value="Meeting">Reunión</option><option value="Email">Email</option><option value="WhatsApp">WhatsApp</option><option value="Note">Nota</option></select></label>
            <label>Resultado<textarea required rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué se conversó, respuesta del cliente, objeciones o acuerdos…" /></label>
            <label>Próximo seguimiento<input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></label>
            <button className="btn" disabled={busy || !description.trim()}>Guardar en historial</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
