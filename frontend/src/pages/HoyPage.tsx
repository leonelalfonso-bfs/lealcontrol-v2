import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { label, type Activity, type CustomerSummary, type Lead, type Opportunity } from "../api/types";

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function money(amount?: number | null, currency?: string | null) {
  if (amount == null) return "Sin monto";
  return `${currency ?? "ARS"} $${amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function HoyPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [followUps, setFollowUps] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Opportunity | null>(null);
  const [activityType, setActivityType] = useState("Call");
  const [activityDescription, setActivityDescription] = useState("");
  const [dueAt, setDueAt] = useState(todayInputValue);
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([api.listAllCustomers(""), api.listLeads(), api.listOpportunities(), api.listFollowUps()])
      .then(([allCustomers, openLeads, openOpportunities, activities]) => {
        setCustomers(allCustomers || []);
        setLeads(openLeads || []);
        setOpportunities(openOpportunities || []);
        setFollowUps(activities || []);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => { load(); }, []);

  const buckets = useMemo(() => {
    const todayStart = startOfLocalDay().getTime();
    const todayEnd = endOfLocalDay().getTime();
    const overdue: Activity[] = [];
    const today: Activity[] = [];
    const upcoming: Activity[] = [];

    for (const activity of followUps) {
      if (!activity.nextFollowUpOn) continue;
      const at = new Date(activity.nextFollowUpOn).getTime();
      if (at < todayStart) overdue.push(activity);
      else if (at <= todayEnd) today.push(activity);
      else upcoming.push(activity);
    }

    const activeOpportunities = opportunities.filter((opportunity) => !["Won", "Lost"].includes(opportunity.stage));
    const toQuote = activeOpportunities.filter((opportunity) => opportunity.stage === "Lead" || opportunity.stage === "Qualified");
    const withoutNextAction = activeOpportunities.filter((opportunity) => opportunity.activityBadgeStatus === "Gray");
    const rotting = activeOpportunities.filter((opportunity) => opportunity.isRotting);
    const pastCloseDate = activeOpportunities.filter((opportunity) =>
      opportunity.expectedCloseDate && new Date(opportunity.expectedCloseDate).getTime() < todayStart
    );
    const autoAddedCustomers = customers.filter((c) => c.addedAutomatically);

    return { overdue, today, upcoming, toQuote, withoutNextAction, rotting, pastCloseDate, autoAddedCustomers };
  }, [followUps, opportunities, customers]);

  const linkFor = (activity: Activity) => {
    if (activity.opportunityId) return `/oportunidades/${activity.opportunityId}`;
    if (activity.customerId) return `/clientes/${activity.customerId}?returnUrl=/crm`;
    if (activity.leadId) return "/prospectos";
    return null;
  };

  const openSchedule = (opportunity: Opportunity) => {
    setScheduleFor(opportunity);
    setActivityType("Call");
    setActivityDescription(`Seguimiento: ${opportunity.title}`);
    setDueAt(todayInputValue());
  };

  const scheduleFollowUp = async (event: FormEvent) => {
    event.preventDefault();
    if (!scheduleFor) return;
    setSaving(true);
    setError(null);
    try {
      await api.logActivity({
        type: activityType,
        description: activityDescription.trim(),
        opportunityId: scheduleFor.id,
        customerId: scheduleFor.customerId ?? null,
        nextFollowUpOn: new Date(dueAt).toISOString(),
        dueDate: new Date(dueAt).toISOString()
      });
      setScheduleFor(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo programar el seguimiento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">CRM · CENTRO DE CONTROL</span>
          <h1>Tablero de CRM</h1>
          <div className="muted">Para cotizar, seguimientos vencidos, oportunidades sin próximo paso y clientes a revisar.</div>
        </div>
        <div className="toolbar">
          <Link className="btn ghost" to="/prospectos">Nuevo prospecto</Link>
          <Link className="btn ghost" to="/oportunidades">Oportunidades</Link>
          <Link className="btn" to="/clientes/nuevo?returnUrl=/crm">Nueva empresa</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="kpi kpi-4">
        <Link className="card" to="/oportunidades" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="muted">Para cotizar</span>
          <strong>{buckets.toQuote.length}</strong>
        </Link>
        <div className="card"><span className="muted">Seguimientos vencidos</span><strong>{buckets.overdue.length}</strong></div>
        <div className="card"><span className="muted">Sin próxima acción</span><strong>{buckets.withoutNextAction.length}</strong></div>
        <div className="card"><span className="muted">Frías / cierre vencido</span><strong>{buckets.rotting.length + buckets.pastCloseDate.length}</strong></div>
      </div>

      {buckets.toQuote.length > 0 && (
        <section className="card pad" style={{ marginBottom: 18 }}>
          <div className="section-head">
            <div>
              <h2>Para cotizar ({buckets.toQuote.length})</h2>
              <p className="muted">Oportunidades en etapa inicial listas para armar presupuesto.</p>
            </div>
            <Link className="btn btn-outline compact" to="/oportunidades">Ver embudo →</Link>
          </div>
          {buckets.toQuote.slice(0, 8).map((opp) => (
            <div className="production-setup-row" key={opp.id} style={{ cursor: "default" }}>
              <Link to={`/oportunidades/${opp.id}`} style={{ textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}>
                <strong>{opp.title}</strong>
                <small>{opp.customerName ?? "Sin empresa"} · {label(opp.stage)} · {money(opp.amount, opp.currency)}</small>
              </Link>
              <div style={{ display: "flex", gap: 6 }}>
                {opp.customerId && (
                  <Link className="btn btn-outline compact" to={`/presupuestos/nuevo?opportunityId=${opp.id}`}>
                    Cotizar →
                  </Link>
                )}
                <button type="button" className="btn ghost compact" onClick={() => openSchedule(opp)}>
                  + Seguimiento
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {(buckets.overdue.length > 0 || buckets.withoutNextAction.length > 0 || buckets.rotting.length > 0 || buckets.pastCloseDate.length > 0) && (
        <section className="card pad" style={{ marginBottom: 18 }}>
          <h3>Requiere atención</h3>
          <div className="split hoy-grid">
            <FollowSection title="Seguimientos vencidos" items={buckets.overdue} tone="warn" linkFor={linkFor} />
            <OpportunityAttention title="Sin próxima acción" items={buckets.withoutNextAction} onSchedule={openSchedule} />
            <OpportunityAttention title="Oportunidades frías" items={buckets.rotting} onSchedule={openSchedule} tone="warn" />
            <OpportunityAttention title="Fecha estimada vencida" items={buckets.pastCloseDate} onSchedule={openSchedule} tone="warn" />
          </div>
        </section>
      )}

      <div className="split hoy-grid">
        <section className="card pad">
          <h3>Agenda comercial</h3>
          <FollowSection title="Para hoy" items={buckets.today} linkFor={linkFor} />
          <FollowSection title="Próximas" items={buckets.upcoming.slice(0, 8)} linkFor={linkFor} />
          {followUps.length === 0 && <p className="muted">No hay actividades planificadas. Programá el siguiente paso desde una oportunidad.</p>}
        </section>

        <div className="stack">
          {buckets.autoAddedCustomers.length > 0 && (
            <section className="card pad">
              <div className="section-head">
                <div>
                  <h3>Clientes a revisar ({buckets.autoAddedCustomers.length})</h3>
                  <p className="muted">Dados de alta automáticamente — revisá datos fiscales antes de facturar.</p>
                </div>
                <Link className="btn btn-outline compact" to="/directorio">Directorio →</Link>
              </div>
              {buckets.autoAddedCustomers.slice(0, 6).map((customer) => (
                <Link key={customer.id} to={`/clientes/${customer.id}?returnUrl=/crm`} className="list-item">
                  <strong>{customer.tradeName || customer.legalName}</strong>
                  <div className="muted">{customer.documentNumber} · {label(customer.taxCondition)}</div>
                </Link>
              ))}
            </section>
          )}
          <section className="card pad">
            <h3>Prospectos para calificar ({leads.length})</h3>
            {leads.slice(0, 6).map((lead) => (
              <Link key={lead.id} to="/prospectos" className="list-item">
                <strong>{lead.name || lead.companyName}</strong>
                <div className="muted">{label(lead.source)} · {lead.contactName ?? "sin contacto"}</div>
              </Link>
            ))}
            {leads.length === 0 && <p className="muted">No hay prospectos abiertos.</p>}
          </section>
          <section className="card pad">
            <h3>Empresas recientes</h3>
            {customers.slice(0, 6).map((customer) => (
              <Link key={customer.id} to={`/clientes/${customer.id}?returnUrl=/crm`} className="list-item">
                <strong>{customer.tradeName || customer.legalName}</strong>
                <div className="muted">{customer.documentNumber} · {label(customer.taxCondition)}</div>
              </Link>
            ))}
            {customers.length === 0 && <p className="muted">Todavía no hay empresas registradas.</p>}
          </section>
        </div>
      </div>

      {scheduleFor && (
        <form className="card pad" style={{ marginTop: 18 }} onSubmit={scheduleFollowUp}>
          <div className="page-head" style={{ marginBottom: 14 }}>
            <div><h3 style={{ margin: 0 }}>Programar próximo paso</h3><div className="muted">{scheduleFor.title} · {scheduleFor.customerName ?? "Sin empresa asociada"}</div></div>
            <button type="button" className="btn ghost" onClick={() => setScheduleFor(null)}>Cancelar</button>
          </div>
          <div className="grid-3">
            <label>Tipo<select value={activityType} onChange={(event) => setActivityType(event.target.value)}><option value="Call">Llamada</option><option value="Meeting">Reunión</option><option value="Visit">Visita</option><option value="WhatsApp">WhatsApp</option></select></label>
            <label>Fecha y hora<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label>
            <label>Acción a realizar<input value={activityDescription} onChange={(event) => setActivityDescription(event.target.value)} required /></label>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="btn" disabled={saving}>{saving ? "Programando…" : "Programar seguimiento"}</button></div>
        </form>
      )}
    </div>
  );
}

function FollowSection({ title, items, tone, linkFor }: { title: string; items: Activity[]; tone?: "warn"; linkFor: (activity: Activity) => string | null }) {
  if (items.length === 0) return null;
  return <div className="follow-block"><div className="follow-title"><span className={tone === "warn" ? "badge warn" : "badge"}>{title} ({items.length})</span></div>{items.map((activity) => {
    const href = linkFor(activity);
    const body = <><strong>{activity.description}</strong><div className="muted">{label(activity.type)} · {formatWhen(activity.nextFollowUpOn)}</div></>;
    return href ? <Link key={activity.id} to={href} className="list-item">{body}</Link> : <div key={activity.id} className="list-item">{body}</div>;
  })}</div>;
}

function OpportunityAttention({ title, items, onSchedule, tone }: { title: string; items: Opportunity[]; onSchedule: (opportunity: Opportunity) => void; tone?: "warn" }) {
  if (items.length === 0) return null;
  return <div className="follow-block"><div className="follow-title"><span className={tone === "warn" ? "badge warn" : "badge"}>{title} ({items.length})</span></div>{items.slice(0, 6).map((opportunity) => <div key={opportunity.id} className="list-item"><Link to={`/oportunidades/${opportunity.id}`} style={{ textDecoration: "none", color: "inherit" }}><strong>{opportunity.title}</strong></Link><div className="muted">{opportunity.customerName ?? "Sin empresa"} · {label(opportunity.stage)} · {money(opportunity.amount, opportunity.currency)}</div><button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={() => onSchedule(opportunity)}>Programar siguiente paso</button></div>)}</div>;
}
