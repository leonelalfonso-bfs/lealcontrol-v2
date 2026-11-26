import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { CustomerLocationForm } from "../components/crm/CustomerLocationForm";
import { label, provinces, provinceLabel, type Activity, type Contact, type Conversation, type CustomerDetail, type FiscalRate, type Location, type Opportunity, type Quote } from "../api/types";
import { buildWhatsAppUrl, formatCuitDisplay } from "../lib/arContact";
import { EmailComposer } from "../components/EmailComposer";
import { BcraCreditReportModal } from "../components/BcraCreditReportModal";

type TimelineEntry = {
  id: string;
  at: number;
  kind: "activity" | "conversation" | "opportunity" | "quote";
  title: string;
  body: string;
  meta?: string;
  href?: string;
  openConversationId?: string;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function CustomerDetailPage() {
  const [showEmail, setShowEmail] = useState(false);
  const [showBcraModal, setShowBcraModal] = useState(false);
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [tab, setTab] = useState<"ficha" | "plantas" | "contactos" | "equipos" | "fiscal" | "timeline">("ficha");
  const [customerConversations, setCustomerConversations] = useState<Conversation[]>([]);
  const [timeline, setTimeline] = useState<Activity[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const refresh = () => {
    if (!id) return;
    // La ficha no debe caerse si timeline/oportunidades fallan (p.ej. esquema legacy).
    Promise.allSettled([
      api.getCustomer(id),
      api.timeline(id),
      api.opportunities(id),
      api.listQuotes(),
      api.listConversations({ customerId: id }).catch(() => [] as Conversation[])
    ])
      .then(([c, t, o, q, conv]) => {
        if (c.status === "fulfilled") {
          setCustomer(c.value);
          setEditingLocation(null);
          setEditingContact(null);
        } else {
          setError(c.reason instanceof Error ? c.reason.message : "No se pudo cargar el cliente");
        }
        if (t.status === "fulfilled") setTimeline(t.value);
        else setTimeline([]);
        if (o.status === "fulfilled") setOpps(o.value);
        else setOpps([]);
        if (q.status === "fulfilled") {
          setQuotes(q.value.filter((quote) => quote.customerId === id));
        }
        if (conv.status === "fulfilled") setCustomerConversations(conv.value);
        else setCustomerConversations([]);
        const secondaryErrors = [t, o]
          .filter((r) => r.status === "rejected")
          .map((r) => (r as PromiseRejectedResult).reason instanceof Error
            ? (r as PromiseRejectedResult).reason.message
            : "Error secundario");
        if (secondaryErrors.length > 0 && c.status === "fulfilled") {
          setError(`Ficha cargada. Aviso: ${secondaryErrors[0]}`);
        }
      });
  };

  useEffect(() => { refresh(); }, [id]);

  const nextAction = useMemo(() => {
    const today = startOfDay(new Date());
    const candidates = timeline
      .filter((act) => act.nextFollowUpOn)
      .map((act) => ({
        activity: act,
        day: startOfDay(new Date(`${act.nextFollowUpOn}T12:00:00`))
      }))
      .sort((a, b) => a.day - b.day);
    if (candidates.length === 0) return null;
    const first = candidates[0];
    const tone = first.day < today ? "overdue" : first.day === today ? "today" : "upcoming";
    return { ...first, tone };
  }, [timeline]);

  const story = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...timeline.map((act) => ({
        id: `act-${act.id}`,
        at: new Date(act.occurredAtUtc).getTime() || 0,
        kind: "activity" as const,
        title: act.type,
        body: act.description,
        meta: act.nextFollowUpOn ? `Próxima acción: ${act.nextFollowUpOn}` : undefined
      })),
      ...customerConversations.map((c) => ({
        id: `conv-${c.id}`,
        at: new Date(c.lastMessageAtUtc).getTime() || 0,
        kind: "conversation" as const,
        title: c.channelType,
        body: c.lastMessagePreview || c.participantName || "Conversación",
        meta: c.participantName,
        openConversationId: c.id
      })),
      ...opps.map((opp) => ({
        id: `opp-${opp.id}`,
        at: new Date(opp.createdAtUtc).getTime() || 0,
        kind: "opportunity" as const,
        title: "Oportunidad",
        body: `${opp.title} · ${label(opp.stage)}${opp.amount ? ` · ${opp.currency} $${Number(opp.amount).toLocaleString("es-AR")}` : ""}`,
        meta: opp.lostReason ? `Motivo de pérdida: ${opp.lostReason}` : undefined,
        href: `/oportunidades/${opp.id}`
      })),
      ...quotes.map((quote) => ({
        id: `quote-${quote.id}`,
        at: new Date(quote.updatedAtUtc).getTime() || 0,
        kind: "quote" as const,
        title: "Presupuesto",
        body: `${quote.quoteNumber} · ${label(quote.status)} · ${quote.currency} $${Number(quote.total).toLocaleString("es-AR")}`,
        href: `/presupuestos/${quote.id}/editar`
      }))
    ];
    return entries.sort((a, b) => b.at - a.at);
  }, [timeline, customerConversations, opps, quotes]);

  if (!customer) return error ? <div className="alert">{error}</div> : <div className="card pad t-center" style={{ padding: "40px" }}><p className="muted">Cargando ficha comercial…</p></div>;

  const isPureSupplier = customer.isSupplier && !customer.isCustomer;
  const isBoth = customer.isCustomer && customer.isSupplier;
  const requestedReturnUrl = new URLSearchParams(location.search).get("returnUrl");
  const returnUrl = requestedReturnUrl?.startsWith("/") ? requestedReturnUrl : null;
  const backUrl = returnUrl || (isPureSupplier ? "/proveedores" : "/clientes");
  const editParams = new URLSearchParams();
  if (isPureSupplier) editParams.set("type", "supplier");
  if (returnUrl) editParams.set("returnUrl", returnUrl);
  const editUrl = `/clientes/${customer.id}/editar${editParams.size ? `?${editParams}` : ""}`;
  const waPhone = customer.whatsApp || customer.phone || null;

  const openWhatsApp = async (phone: string, templateText?: string, contactName?: string) => {
    const url = buildWhatsAppUrl(phone, templateText);
    if (!url) {
      setError("Número de WhatsApp inválido.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    try {
      await api.logActivity({
        type: "WhatsApp",
        description: contactName
          ? `WhatsApp a ${contactName}${templateText ? `: ${templateText}` : ""}`
          : `WhatsApp saliente${templateText ? `: ${templateText}` : ""}`,
        customerId: customer.id
      });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const getCalibrationStatusBadge = (nextDueDate?: string | null) => {
    if (!nextDueDate) return <span className="badge muted">Sin fecha</span>;
    const due = new Date(nextDueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return <span className="badge off" style={{ backgroundColor: "var(--lc-danger)", color: "#fff" }}>🔴 Vencido ({Math.abs(diffDays)}d)</span>;
    if (diffDays <= 30) return <span className="badge" style={{ backgroundColor: "var(--lc-warn)", color: "#fff" }}>🟡 Vence en {diffDays}d</span>;
    return <span className="badge" style={{ backgroundColor: "var(--lc-ok)", color: "#fff" }}>🟢 Al día ({due.toLocaleDateString()})</span>;
  };

  return (
    <div className="customer-detail-page">
      {/* Page Header */}
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
            <h1 style={{ margin: 0 }}>{customer.legalName}</h1>
            {isBoth ? (
              <span className="t-info t-small t-strong" style={{ padding: "4px 10px", borderRadius: "12px", background: "var(--lc-info-bg)", border: "1px solid var(--lc-info-bg)" }}>
                🤝 Cliente y Proveedor
              </span>
            ) : isPureSupplier ? (
              <span className="t-warn t-small t-strong" style={{ padding: "4px 10px", borderRadius: "12px", background: "var(--lc-warn-bg)", border: "1px solid var(--lc-warn-bg)" }}>
                🏢 Proveedor Oficial
              </span>
            ) : (
              <span className="t-ok t-small t-strong" style={{ padding: "4px 10px", borderRadius: "12px", background: "var(--lc-ok-bg)", border: "1px solid #a7f3d0" }}>
                👤 Cliente Comercial
              </span>
            )}
            <span style={{ padding: "4px 10px", borderRadius: "12px", background: customer.status === "Active" ? "#f0fdf4" : "#fef2f2", color: customer.status === "Active" ? "#166534" : "#991b1b", fontSize: "0.82rem", fontWeight: "bold", border: `1px solid ${customer.status === "Active" ? "#bbf7d0" : "#fecaca"}` }}>
              {customer.status === "Active" ? "● Activo" : "● Inactivo"}
            </span>
            {customer.addedAutomatically && (
              <>
                <span className="badge warn">Cargado automáticamente</span>
                <button
                  type="button"
                  className="btn ghost compact"
                  onClick={async () => {
                    await api.markCustomerReviewed(customer.id);
                    refresh();
                  }}
                >
                  Marcar como revisado
                </button>
              </>
            )}
          </div>

          <div className="hero-meta">
            <span>CUIT: {formatCuitDisplay(customer.documentNumber)}</span>
            <span>{label(customer.taxCondition)}</span>
            <span>{label(customer.iibbRegime)}</span>
            {customer.creditRating && (
              <span style={{
                padding: "2px 8px",
                borderRadius: "12px",
                background: customer.creditRating === "A" ? "#ecfdf5" : customer.creditRating === "B" ? "#fefce8" : customer.creditRating === "C" ? "#fff7ed" : "#fef2f2",
                color: customer.creditRating === "A" ? "#047857" : customer.creditRating === "B" ? "#854d0e" : customer.creditRating === "C" ? "#9a3412" : "#991b1b",
                fontSize: "0.8rem",
                fontWeight: "bold",
                border: `1px solid ${customer.creditRating === "A" ? "#a7f3d0" : customer.creditRating === "B" ? "#fde68a" : customer.creditRating === "C" ? "#fdba74" : "#fecaca"}`
              }}>
                {customer.creditRating === "A" ? "🟢" : customer.creditRating === "B" ? "🟡" : customer.creditRating === "C" ? "🟠" : "🔴"} Calificación BCRA: {customer.creditRating} (Sit. {customer.bcraWorstSituation || 1})
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => setShowBcraModal(true)}
          >
            🏛️ Informe BCRA
          </button>
          <button type="button" className="btn" onClick={() => setShowEmail(true)}>✉ Email</button>
          {showEmail && <EmailComposer context={{ entityType: "Customer", entityId: customer.id, to: customer.email ?? undefined, subject: `Contacto comercial con ${customer.legalName}`, body: `Hola,\n\n` }} onClose={() => setShowEmail(false)} />}
          <Link to={backUrl} className="btn btn-outline">
            ← Volver a {returnUrl === "/directorio" ? "Directorio" : isPureSupplier ? "Proveedores" : "Clientes"}
          </Link>
          {waPhone && (
            <button className="btn" type="button" onClick={() => openWhatsApp(waPhone)}>
              💬 WhatsApp
            </button>
          )}
          <Link className="btn btn-primary" to={editUrl}>
            ✏️ {isPureSupplier ? "Editar Proveedor" : isBoth ? "Editar Cliente / Proveedor" : "Editar Cliente"}
          </Link>
        </div>
      </div>

      {error && <div className="alert" style={{ marginBottom: "16px" }}>{error}</div>}

      {/* KPI Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isPureSupplier ? "repeat(3, 1fr)" : "repeat(4, 1fr)", gap: "14px", margin: "16px 0 24px 0" }}>
        <div
          className="card pad"
          style={{ cursor: "pointer" }}
          onClick={() => setTab("plantas")}
        >
          <div className="muted t-small t-caps t-strong">
            {isPureSupplier ? "Plantas / Depósitos" : "Plantas / Sucursales"}
          </div>
          <div className="t-strong t-accent" style={{ fontSize: "1.4rem", marginTop: "4px" }}>
            🏢 {customer.locations.length}
          </div>
        </div>

        <div
          className="card pad"
          style={{ cursor: "pointer" }}
          onClick={() => setTab("contactos")}
        >
          <div className="muted t-small t-caps t-strong">
            Contactos Responsables
          </div>
          <div className="t-strong t-accent" style={{ fontSize: "1.4rem", marginTop: "4px" }}>
            👤 {customer.contacts.length}
          </div>
        </div>

        {!isPureSupplier && (
          <div
            className="card pad"
            style={{ cursor: "pointer" }}
            onClick={() => setTab("equipos")}
          >
            <div className="muted t-small t-caps t-strong">
              Parque de Equipos
            </div>
            <div className="t-strong t-accent" style={{ fontSize: "1.4rem", marginTop: "4px" }}>
              ⚖️ {(customer.equipments || []).length}
            </div>
          </div>
        )}

        {!isPureSupplier ? (
          <div
            className="card pad"
            style={{ cursor: "pointer" }}
            onClick={() => setTab("timeline")}
          >
            <div className="muted t-small t-caps t-strong">
              Oportunidades CRM
            </div>
            <div className="t-strong t-info" style={{ fontSize: "1.4rem", marginTop: "4px" }}>
              💼 {opps.length}
            </div>
          </div>
        ) : (
          <div className="card pad">
            <div className="muted t-small t-caps t-strong">
              Comprobantes de Compra
            </div>
            <div className="t-strong t-ok" style={{ marginTop: "8px" }}>
              <Link className="t-ok" to={`/compras/facturas?search=${encodeURIComponent(customer.legalName)}`} style={{ textDecoration: "none" }}>
                📑 Ver Facturas Asociadas →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="tab-row" style={{ marginBottom: "20px" }}>
        <button
          type="button"
          className={`tab-btn ${tab === "ficha" ? "active" : ""}`}
          onClick={() => setTab("ficha")}
        >
          📋 Ficha General
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "plantas" ? "active" : ""}`}
          onClick={() => setTab("plantas")}
        >
          🏢 {isPureSupplier ? "Plantas / Depósitos" : "Plantas"} ({customer.locations.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "contactos" ? "active" : ""}`}
          onClick={() => setTab("contactos")}
        >
          👤 Contactos ({customer.contacts.length})
        </button>
        {!isPureSupplier && (
          <button
            type="button"
            className={`tab-btn ${tab === "equipos" ? "active" : ""}`}
            onClick={() => setTab("equipos")}
          >
            ⚖️ Parque de Equipos ({(customer.equipments || []).length})
          </button>
        )}
        <button
          type="button"
          className={`tab-btn ${tab === "fiscal" ? "active" : ""}`}
          onClick={() => setTab("fiscal")}
        >
          🧾 Datos Fiscales & Retenciones
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "timeline" ? "active" : ""}`}
          onClick={() => setTab("timeline")}
        >
          💬 Historial ({story.length})
        </button>
      </div>

      {nextAction && (
        <div className={`customer-next-action ${nextAction.tone === "overdue" ? "overdue" : nextAction.tone === "today" ? "today" : ""}`}>
          <div>
            <strong>
              {nextAction.tone === "overdue" ? "Próxima acción vencida" : nextAction.tone === "today" ? "Próxima acción para hoy" : "Próxima acción"}
            </strong>
            <span>{nextAction.activity.nextFollowUpOn} · {nextAction.activity.type}: {nextAction.activity.description}</span>
          </div>
          <button type="button" className="btn btn-outline compact" onClick={() => setTab("timeline")}>Ver historial</button>
        </div>
      )}

      {/* Tab 1: Ficha General */}
      {tab === "ficha" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "20px" }}>
          <div className="card pad" style={{ display: "grid", gap: "14px" }}>
            <h3 style={{ margin: "0 0 8px 0" }}>
              Datos Comerciales y de Contacto
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px" }}>
              <span className="muted">Nombre Fantasía:</span>
              <strong>{customer.tradeName || "—"}</strong>

              <span className="muted">Email Principal:</span>
              <span>{customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : "—"}</span>

              <span className="muted">Teléfono Fijo:</span>
              <span>{customer.phone || "—"}</span>

              <span className="muted">WhatsApp:</span>
              <span>
                {customer.whatsApp ? (
                  <button className="t-ok t-strong"
                    type="button"
                    onClick={() => openWhatsApp(customer.whatsApp!)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    💬 {customer.whatsApp}
                  </button>
                ) : "—"}
              </span>

              <span className="muted">Domicilio Fiscal:</span>
              <span>
                {customer.fiscalAddress
                  ? `${customer.fiscalAddress.street}, ${customer.fiscalAddress.city} (${provinceLabel(customer.fiscalAddress.province)}) CP ${customer.fiscalAddress.postalCode}`
                  : "—"}
              </span>

              <span className="muted">Condición Pago:</span>
              <span>{customer.paymentTermsDays ? `${customer.paymentTermsDays} días fecha factura` : "Contado"}</span>

              <span className="muted">Límite Crédito:</span>
              <span>{customer.creditLimit ? `$ ${customer.creditLimit.toLocaleString("es-AR")}` : "Sin límite asignado"}</span>

              {customer.notes && (
                <>
                  <span className="muted">Observaciones:</span>
                  <span className="muted" style={{ fontStyle: "italic" }}>{customer.notes}</span>
                </>
              )}
            </div>
          </div>

          <div className="card pad">
            <h3 style={{ margin: "0 0 12px 0" }}>
              Contactos Destacados
            </h3>
            {customer.contacts.length === 0 ? (
              <p className="muted">No hay contactos registrados todavía.</p>
            ) : (
              customer.contacts.map((c) => {
                const locName = customer.locations.find((l) => l.id === c.locationId)?.name;
                return (
                  <div key={c.id} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--lc-line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <strong>{c.name}</strong>
                        {c.position && <span className="t-small">{c.position}</span>}
                        <span className="muted t-small">({label(c.role)})</span>
                        {c.isPrimary && <span className="badge ok">Principal</span>}
                        {c.addedAutomatically && <span className="badge off">Cargado automáticamente</span>}
                        {locName && <span className="badge off">📌 {locName}</span>}
                      </div>
                      {(c.whatsApp || c.phone) && (
                        <button
                          type="button"
                          onClick={() => openWhatsApp(c.whatsApp || c.phone || "", undefined, c.name)}
                          className="btn btn-outline compact"
                        >
                          💬 WA
                        </button>
                      )}
                    </div>
                    <div className="muted t-small" style={{ marginTop: 4 }}>
                      {c.email && `✉️ ${c.email} `}
                      {c.phone && `📞 ${c.phone}`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Plantas */}
      {tab === "plantas" && (
        <section className="card pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>
              {isPureSupplier ? "Plantas, Talleres y Depósitos de Entrega" : "Plantas y Sucursales de Entrega"}
            </h3>
          </div>

          {customer.locations.map((l) => (
            <div key={l.id} style={{ marginBottom: 12, padding: "14px 16px", borderRadius: 8, border: "1px solid var(--lc-line)", background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>{l.name}</strong> — {l.address.street}, {l.address.city} ({provinceLabel(l.address.province)}) CP {l.address.postalCode}
                  {l.phone && <div className="muted t-small" style={{ marginTop: 2 }}>Teléfono: {l.phone}</div>}
                  {l.notes && <div className="muted t-small" style={{ marginTop: 2 }}>Notas: {l.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline compact"
                    onClick={() => setEditingLocation(l)}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline compact danger"
                    onClick={async () => {
                      if (confirm(`¿Eliminar la planta ${l.name}?`)) {
                        await api.deleteLocation(customer.id, l.id);
                        refresh();
                      }
                    }}
                  >
                    ✕ Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
          {customer.locations.length === 0 && <p className="muted">No hay plantas cargadas.</p>}

          <hr style={{ margin: "24px 0", borderColor: "var(--lc-line)" }} />
          <CustomerLocationForm
            customerId={customer.id}
            initialData={editingLocation}
            onCancel={() => setEditingLocation(null)}
            onSaved={() => void refresh()}
          />
        </section>
      )}

      {/* Tab 3: Contactos */}
      {tab === "contactos" && (
        <section className="card pad">
          <h3 style={{ margin: "0 0 16px 0" }}>
            {isPureSupplier ? "Contactos Comerciales y Técnicos del Proveedor" : "Contactos Responsables del Cliente"}
          </h3>

          {customer.contacts.map((c) => {
            const locName = customer.locations.find((l) => l.id === c.locationId)?.name;
            return (
              <div key={c.id} style={{ marginBottom: 12, padding: "14px 16px", borderRadius: 8, border: "1px solid var(--lc-line)", background: "white" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <strong>{c.name}</strong>
                      {c.position && <span className="t-small">{c.position}</span>}
                      <span className="muted t-small">({label(c.role)})</span>
                      {c.isPrimary && <span className="badge ok">Principal</span>}
                      {c.addedAutomatically && <span className="badge off">Cargado automáticamente</span>}
                      {locName && <span className="badge off">📌 Planta: {locName}</span>}
                    </div>
                    <div className="muted t-small" style={{ marginTop: 4 }}>
                      {c.email && `✉️ Email: ${c.email} `}
                      {c.phone && `| 📞 Tel: ${c.phone} `}
                      {c.whatsApp && `| 💬 WA: ${c.whatsApp}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(c.whatsApp || c.phone) && (
                      <button
                        type="button"
                        className="btn btn-outline compact"
                        onClick={() => openWhatsApp(c.whatsApp || c.phone || "", undefined, c.name)}
                      >
                        💬 WA
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-outline compact"
                      onClick={() => setEditingContact(c)}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline compact danger"
                      onClick={async () => {
                        if (confirm(`¿Eliminar a ${c.name}?`)) {
                          await api.deleteContact(customer.id, c.id);
                          refresh();
                        }
                      }}
                    >
                      ✕ Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {customer.contacts.length === 0 && <p className="muted">No hay contactos cargados.</p>}

          <hr style={{ margin: "24px 0", borderColor: "var(--lc-line)" }} />
          <ContactForm
            customerId={customer.id}
            locations={customer.locations}
            initialData={editingContact}
            onCancel={() => setEditingContact(null)}
            onSaved={refresh}
          />
        </section>
      )}

      {/* Tab 4: Equipos (Solo para clientes o cuentas mixtas) */}
      {!isPureSupplier && tab === "equipos" && (
        <section className="card pad">
          <h3 style={{ margin: "0 0 6px 0" }}>
            Parque Instalado de Equipos / Activos
          </h3>
          <div className="muted" style={{ marginBottom: 16 }}>
            Gestión de balanzas, celdas de carga y activos de metrología del cliente.
          </div>

          {(customer.equipments || []).map((eq) => {
            const locName = customer.locations.find((l) => l.id === eq.locationId)?.name;
            return (
              <div key={eq.id} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid var(--lc-line)", marginBottom: 12, background: "white" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <strong style={{ fontSize: 16 }}>{eq.internalCode}</strong>
                      <span className="badge">{eq.equipmentType}</span>
                      {getCalibrationStatusBadge(eq.nextCalibrationDueDate)}
                    </div>
                    <div className="t-strong" style={{ marginTop: 4 }}>
                      {eq.brand} {eq.model} · S/N: {eq.serialNumber || "—"}
                    </div>
                    {(eq.maxCapacity || eq.divisionScale) && (
                      <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                        Capacidad: {eq.maxCapacity ?? "—"} · Div. Escala: {eq.divisionScale ?? "—"}
                      </div>
                    )}
                    {locName && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>📌 Planta: {locName}</div>}
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline compact danger"
                    onClick={async () => {
                      if (confirm(`¿Eliminar equipo ${eq.internalCode}?`)) {
                        await api.deleteEquipment(customer.id, eq.id);
                        refresh();
                      }
                    }}
                  >
                    ✕ Eliminar
                  </button>
                </div>
              </div>
            );
          })}
          {(customer.equipments || []).length === 0 && (
            <p className="muted">No hay equipos registrados en el parque de este cliente.</p>
          )}

          <hr style={{ margin: "24px 0", borderColor: "var(--lc-line)" }} />
          <h4 style={{ margin: "0 0 12px 0" }}>+ Registrar Nuevo Equipo en Parque</h4>
          <EquipmentForm customerId={customer.id} locations={customer.locations} onCreated={refresh} />
        </section>
      )}

      {/* Tab 5: Fiscal */}
      {tab === "fiscal" && (
        <section className="card pad">
          <h3 style={{ margin: "0 0 16px 0" }}>
            Alícuotas Impositivas y Regímenes Especiales (IIBB / Percepciones)
          </h3>
          {customer.fiscalRates.map((r) => (
            <div key={r.jurisdiction} style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid var(--lc-line)", marginBottom: 10, background: "white", display: "flex", justifyContent: "space-between" }}>
              <strong>{label(r.jurisdiction)}</strong>
              <div className="muted t-strong">
                Perc. {r.perceptionRate}% · Ret. {r.retentionRate}%
                {r.hasPerceptionExclusion && " · Excl. percepción"}
                {r.hasRetentionExclusion && " · Excl. retención"}
              </div>
            </div>
          ))}
          {customer.fiscalRates.length === 0 && (
            <p className="muted">No hay alícuotas personalizadas cargadas (aplica régimen general).</p>
          )}
          <RateForm customerId={customer.id} rates={customer.fiscalRates} onCreated={refresh} />
        </section>
      )}

      {tab === "timeline" && (
        <section className="card pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
            <h3 style={{ margin: 0 }}>
              Historial de la relación
            </h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-outline compact" onClick={() => setShowEmail(true)}>✉️ Email</button>
              <Link className="btn btn-outline compact" to="/comunicaciones">Abrir bandeja</Link>
            </div>
          </div>
          <div className="timeline">
            {story.map((entry) => (
              <div key={entry.id} className={`timeline-item${entry.kind === "conversation" || entry.kind === "opportunity" || entry.kind === "quote" ? " timeline-commercial" : ""}`}>
                <div className="muted t-small">
                  {entry.at ? new Date(entry.at).toLocaleString("es-AR") : "—"} — <strong>{entry.title}</strong>
                </div>
                <div style={{ marginTop: 4 }}>
                  {entry.href ? <Link to={entry.href}>{entry.body}</Link> : entry.body}
                </div>
                {entry.meta && <div className="hint">{entry.meta}</div>}
                {entry.openConversationId && (
                  <button
                    type="button"
                    className="btn btn-outline compact"
                    style={{ marginTop: 8 }}
                    onClick={() => navigate("/comunicaciones", { state: { conversationId: entry.openConversationId } })}
                  >
                    Abrir hilo en la bandeja
                  </button>
                )}
              </div>
            ))}
            {story.length === 0 && <p className="muted">No hay registros comerciales todavía.</p>}
          </div>
          <ActivityForm customerId={customer.id} onCreated={refresh} />
        </section>
      )}

      {/* BCRA Credit Report Modal */}
      <BcraCreditReportModal
        isOpen={showBcraModal}
        cuit={customer.documentNumber}
        customerId={customer.id}
        customerName={customer.legalName}
        onSavedToCustomer={refresh}
        onClose={() => setShowBcraModal(false)}
      />
    </div>
  );
}

function ContactForm({
  customerId,
  locations,
  initialData,
  onCancel,
  onSaved
}: {
  customerId: string;
  locations: Location[];
  initialData: Contact | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [position, setPosition] = useState(initialData?.position ?? "");
  const [role, setRole] = useState(initialData?.role ?? "Commercial");
  const [locationId, setLocationId] = useState(initialData?.locationId ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [whatsApp, setWhatsApp] = useState(initialData?.whatsApp ?? "");
  const [isPrimary, setIsPrimary] = useState(initialData?.isPrimary ?? false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setPosition(initialData.position ?? "");
      setRole(initialData.role);
      setLocationId(initialData.locationId ?? "");
      setEmail(initialData.email ?? "");
      setPhone(initialData.phone ?? "");
      setWhatsApp(initialData.whatsApp ?? "");
      setIsPrimary(initialData.isPrimary);
    } else {
      setName("");
      setPosition("");
      setRole("Commercial");
      setLocationId("");
      setEmail("");
      setPhone("");
      setWhatsApp("");
      setIsPrimary(false);
    }
  }, [initialData]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name,
      position: position.trim() || null,
      role,
      locationId: locationId || null,
      email: email || undefined,
      phone: phone || undefined,
      whatsApp: whatsApp || undefined,
      isPrimary
    };

    if (initialData) {
      await api.updateContact(customerId, initialData.id, body);
    } else {
      await api.addContact(customerId, body);
    }
    onSaved();
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <h4 style={{ margin: 0 }}>{initialData ? "✏️ Editar Contacto" : "+ Registrar Nuevo Contacto"}</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Nombre y Apellido *<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej: Ing. Carlos Gómez" style={{ width: "100%" }} /></label>
        <label>Puesto / Cargo<input value={position} onChange={(e) => setPosition(e.target.value)} maxLength={120} placeholder="Ej: Jefe de Planta, Comprador" style={{ width: "100%" }} /></label>
        <label>Área
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%" }}>
            <option value="Commercial">Comercial / Compras</option>
            <option value="Technical">Técnico / Mantenimiento</option>
            <option value="Administrative">Administración / Pagos</option>
            <option value="Other">Otro</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Planta Asignada
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ width: "100%" }}>
            <option value="">(Todas / General)</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.com" style={{ width: "100%" }} /></label>
        <label>Teléfono<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3415551234" style={{ width: "100%" }} /></label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <label>WhatsApp Directo<input value={whatsApp} onChange={(e) => setWhatsApp(e.target.value)} placeholder="5493415551234" style={{ width: "100%" }} /></label>
        <label style={{ alignItems: "center", gap: 8, marginTop: "24px" }}>
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} style={{ width: 18, height: 18 }} />
          Marcar como Contacto Principal
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {initialData && <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>}
        <button className="btn btn-primary">{initialData ? "Guardar Cambios" : "Agregar Contacto"}</button>
      </div>
    </form>
  );
}

function EquipmentForm({ customerId, locations, onCreated }: { customerId: string; locations: Location[]; onCreated: () => void }) {
  const [internalCode, setInternalCode] = useState("");
  const [equipmentType, setEquipmentType] = useState("Balanza Camionera");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [divisionScale, setDivisionScale] = useState("");
  const [locationId, setLocationId] = useState("");
  const [lastCalibrationDate, setLastCalibrationDate] = useState("");
  const [calibrationIntervalMonths, setCalibrationIntervalMonths] = useState(12);

  const [customKey, setCustomKey] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customAttributes, setCustomAttributes] = useState<Record<string, string>>({});

  const addCustomAttr = () => {
    if (!customKey.trim() || !customValue.trim()) return;
    setCustomAttributes((prev) => ({ ...prev, [customKey.trim()]: customValue.trim() }));
    setCustomKey("");
    setCustomValue("");
  };

  const removeCustomAttr = (key: string) => {
    setCustomAttributes((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.addEquipment(customerId, {
        internalCode,
        equipmentType,
        brand,
        model,
        serialNumber,
        maxCapacity: maxCapacity || undefined,
        divisionScale: divisionScale || undefined,
        locationId: locationId || undefined,
        status: "Active",
        lastCalibrationDate: lastCalibrationDate ? new Date(lastCalibrationDate).toISOString() : undefined,
        calibrationIntervalMonths: calibrationIntervalMonths || undefined,
        customAttributes: Object.keys(customAttributes).length > 0 ? customAttributes : undefined
      });
      setInternalCode("");
      setBrand("");
      setModel("");
      setSerialNumber("");
      setMaxCapacity("");
      setDivisionScale("");
      setLastCalibrationDate("");
      setCustomAttributes({});
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo guardar el equipo.");
    }
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Código Interno / ID<input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} required placeholder="Ej. BAL-001" style={{ width: "100%" }} /></label>
        <label>Tipo de Equipo<input value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)} required placeholder="Ej. Balanza Camionera" style={{ width: "100%" }} /></label>
        <label>Planta Asignada
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ width: "100%" }}>
            <option value="">(Sin planta específica)</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Marca<input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej. Toledo" style={{ width: "100%" }} /></label>
        <label>Modelo<input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ej. 8142" style={{ width: "100%" }} /></label>
        <label>Nro. de Serie<input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} style={{ width: "100%" }} /></label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Capacidad Máx.<input value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="Ej. 60 tn" style={{ width: "100%" }} /></label>
        <label>División de Escala<input value={divisionScale} onChange={(e) => setDivisionScale(e.target.value)} placeholder="Ej. 10 kg" style={{ width: "100%" }} /></label>
        <label>Intervalo Service (meses)<input type="number" value={calibrationIntervalMonths} onChange={(e) => setCalibrationIntervalMonths(Number(e.target.value))} style={{ width: "100%" }} /></label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <label>Último Service / Calibración<input type="date" value={lastCalibrationDate} onChange={(e) => setLastCalibrationDate(e.target.value)} style={{ width: "100%" }} /></label>
      </div>

      <div className="box">
        <strong>+ Atributos Personalizados</strong>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="Nombre del campo" style={{ flex: 1 }} />
          <input value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="Valor" style={{ flex: 1 }} />
          <button type="button" className="btn btn-outline" onClick={addCustomAttr}>+ Añadir</button>
        </div>
        {Object.keys(customAttributes).length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {Object.entries(customAttributes).map(([k, v]) => (
              <span key={k} className="badge" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {k}: {v}
                <button className="t-danger" type="button" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => removeCustomAttr(k)}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-primary" style={{ justifySelf: "start" }}>Guardar Equipo / Activo</button>
    </form>
  );
}

function RateForm({ customerId, rates, onCreated }: { customerId: string; rates: FiscalRate[]; onCreated: () => void }) {
  const [jurisdiction, setJurisdiction] = useState("Arba");
  const [perceptionRate, setPerceptionRate] = useState(3);
  const [retentionRate, setRetentionRate] = useState(1.5);
  const [hasPerceptionExclusion, setHasPerceptionExclusion] = useState(false);
  const [perceptionExclusionExpiresOn, setPerceptionExclusionExpiresOn] = useState("");
  const [hasRetentionExclusion, setHasRetentionExclusion] = useState(false);
  const [retentionExclusionExpiresOn, setRetentionExclusionExpiresOn] = useState("");
  const [exclusionCertificateNumber, setExclusionCertificateNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const existing = rates.find((rate) => rate.jurisdiction === jurisdiction);
    setPerceptionRate(existing?.perceptionRate ?? 3);
    setRetentionRate(existing?.retentionRate ?? 1.5);
    setHasPerceptionExclusion(existing?.hasPerceptionExclusion ?? false);
    setPerceptionExclusionExpiresOn(existing?.perceptionExclusionExpiresOn?.slice(0, 10) ?? "");
    setHasRetentionExclusion(existing?.hasRetentionExclusion ?? false);
    setRetentionExclusionExpiresOn(existing?.retentionExclusionExpiresOn?.slice(0, 10) ?? "");
    setExclusionCertificateNumber(existing?.exclusionCertificateNumber ?? "");
    setError(null);
  }, [jurisdiction, rates]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.upsertRate(customerId, {
        jurisdiction,
        perceptionRate,
        retentionRate,
        hasPerceptionExclusion,
        perceptionExclusionExpiresOn: hasPerceptionExclusion ? perceptionExclusionExpiresOn || null : null,
        hasRetentionExclusion,
        retentionExclusionExpiresOn: hasRetentionExclusion ? retentionExclusionExpiresOn || null : null,
        exclusionCertificateNumber: hasPerceptionExclusion || hasRetentionExclusion
          ? exclusionCertificateNumber.trim() || null : null
      });
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la alícuota.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px", alignItems: "end" }}>
      <label>Jurisdicción
        <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} style={{ width: "100%" }}>
          <option value="Arba">ARBA (Bs.As.)</option>
          <option value="Agip">AGIP (CABA)</option>
          <option value="ApiSantaFe">API Santa Fe</option>
          <option value="DgrCordoba">Rentas Córdoba</option>
          <option value="DgrMendoza">Rentas Mendoza</option>
          <option value="DgrTucuman">Rentas Tucumán</option>
          <option value="DgrEntreRios">Rentas Entre Ríos</option>
          <option value="Ganancias">Ganancias</option>
        </select>
      </label>
      <label>Percepción %<input type="number" step="0.01" value={perceptionRate} onChange={(e) => setPerceptionRate(Number(e.target.value))} style={{ width: "100%" }} /></label>
      <label>Retención %<input type="number" step="0.01" value={retentionRate} onChange={(e) => setRetentionRate(Number(e.target.value))} style={{ width: "100%" }} /></label>
      <label><input type="checkbox" checked={hasPerceptionExclusion} onChange={(e) => setHasPerceptionExclusion(e.target.checked)} /> Excluido de percepción</label>
      {hasPerceptionExclusion && <label>Vencimiento percepción<input type="date" value={perceptionExclusionExpiresOn} onChange={(e) => setPerceptionExclusionExpiresOn(e.target.value)} /></label>}
      <label><input type="checkbox" checked={hasRetentionExclusion} onChange={(e) => setHasRetentionExclusion(e.target.checked)} /> Excluido de retención</label>
      {hasRetentionExclusion && <label>Vencimiento retención<input type="date" value={retentionExclusionExpiresOn} onChange={(e) => setRetentionExclusionExpiresOn(e.target.value)} /></label>}
      {(hasPerceptionExclusion || hasRetentionExclusion) &&
        <label>Número de certificado<input type="text" value={exclusionCertificateNumber} onChange={(e) => setExclusionCertificateNumber(e.target.value)} /></label>}
      {error && <p className="t-danger" role="alert" style={{ gridColumn: "1 / -1", margin: 0 }}>{error}</p>}
      <button className="btn btn-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar alícuota"}</button>
    </form>
  );
}

function ActivityForm({ customerId, onCreated }: { customerId: string; onCreated: () => void }) {
  const [type, setType] = useState("Note");
  const [description, setDescription] = useState("");
  const [nextFollowUpOn, setNextFollowUpOn] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api.logActivity({
      type,
      description,
      customerId,
      nextFollowUpOn: nextFollowUpOn || null
    });
    setDescription("");
    setNextFollowUpOn("");
    onCreated();
  };

  return (
    <form onSubmit={(e) => void submit(e)} style={{ marginTop: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="Note">Nota</option>
          <option value="Call">Llamada</option>
          <option value="Meeting">Reunión</option>
          <option value="Visit">Visita</option>
        </select>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Escribir entrada de chatter…" required style={{ flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ gap: 8, alignItems: "center", margin: 0 }}>
          Próxima acción
          <input type="date" value={nextFollowUpOn} onChange={(e) => setNextFollowUpOn(e.target.value)} />
        </label>
        <button className="btn btn-primary">Publicar</button>
      </div>
    </form>
  );
}
