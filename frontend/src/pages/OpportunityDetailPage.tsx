import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { label, type Activity, type Conversation, type CustomerSummary, type Lead, type Opportunity, type Quote, type TenantUser } from "../api/types";
import { EmailComposer } from "../components/EmailComposer";
import { CustomerPicker } from "../components/pickers";

function money(value?: number | null, currency = "ARS") {
  return value == null ? "Sin monto estimado" : `${currency} $${Number(value).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

const pipeline = ["Discovery", "Proposal", "Negotiation", "Won", "Lost"] as const;
type Stage = (typeof pipeline)[number];

const stageLabels: Record<Stage, string> = {
  Discovery: "Por cotizar",
  Proposal: "Presupuestado",
  Negotiation: "En negociación",
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
  const [salesOrders, setSalesOrders] = useState<Array<{ id: string; number: string; status: string; quoteNumber?: string | null; total?: number | null; currency: string; createdAtUtc: string }>>([]);
  const [salesInvoices, setSalesInvoices] = useState<Array<{ id: string; number: string; invoiceType: string; status: string; total?: number | null; currency: string; issueDate: string }>>([]);
  const [customerList, setCustomerList] = useState<CustomerSummary[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [leadInfo, setLeadInfo] = useState<Lead | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);

  // Panel integrado de cambio / reversión de etapa (sin modal flotante)
  const [showStagePanel, setShowStagePanel] = useState(false);
  const [targetStage, setTargetStage] = useState<Stage>("Negotiation");
  const [revertReason, setRevertReason] = useState("");
  const [reverting, setReverting] = useState(false);

  // Panel integrado de edición de datos comerciales
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("ARS");
  const [editOwnerName, setEditOwnerName] = useState("");
  const [editCloseDate, setEditCloseDate] = useState("");
  const [editPriority, setEditPriority] = useState("Normal");

  // Panel integrado para vincular cliente existente o convertir prospecto con ARCA
  const [linkMode, setLinkMode] = useState<"existing" | "convert">("existing");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [convertCuit, setConvertCuit] = useState("");
  const [convertLegalName, setConvertLegalName] = useState("");
  const [convertTaxCondition, setConvertTaxCondition] = useState("ResponsableInscripto");
  const [lookingUpArca, setLookingUpArca] = useState(false);
  const [arcaFeedback, setArcaFeedback] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [type, setType] = useState("Call");
  const [followUp, setFollowUp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const load = async () => {
    if (!id) return;
    try {
      const [opps, quoteList, allCustomers, opportunityActivities, userList, allLeads] = await Promise.all([
        api.listOpportunities(),
        api.listQuotes(),
        api.listAllCustomers(),
        api.opportunityTimeline(id),
        api.listTenantUsers().catch(() => []),
        api.listLeads().catch(() => [])
      ]);
      const found = opps.find((item) => item.id === id) ?? null;
      setOpportunity(found);
      setQuotes(quoteList.filter((quote) => quote.opportunityId === id));
      setActivities(opportunityActivities);
      setCustomerList(allCustomers);
      setCustomers(Object.fromEntries(allCustomers.map((customer) => [customer.id, customer.legalName])));
      setUsers((userList || []).filter((u) => u.isActive !== false));
      const matchedLead = found?.leadId ? allLeads.find((l) => l.id === found.leadId) ?? null : null;
      setLeadInfo(matchedLead);
      if (matchedLead && !found?.customerId) {
        setConvertLegalName((prev) => prev || matchedLead.companyName || matchedLead.name || "");
        const cuitMatch = matchedLead.description?.match(/CUIT\s*([0-9-]{11,13})/i);
        if (cuitMatch) setConvertCuit((prev) => prev || cuitMatch[1].replace(/\D/g, ""));
      }
      if (!found) setError("No se encontró la oportunidad.");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
    // Conversaciones de la bandeja convertidas en esta oportunidad (si la empresa no tiene
    // Comunicaciones, la API responde 404 y la sección no se muestra).
    if (id) api.listConversations({ opportunityId: id }).then(setConversations).catch(() => setConversations([]));
    if (id) {
      api.opportunitySalesChain(id)
        .then((chain) => {
          setSalesOrders(chain.orders || []);
          setSalesInvoices(chain.invoices || []);
        })
        .catch(() => {
          setSalesOrders([]);
          setSalesInvoices([]);
        });
    }
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

  const openEditPanel = () => {
    if (!opportunity) return;
    setEditTitle(opportunity.title);
    setEditAmount(opportunity.amount != null ? String(opportunity.amount) : "");
    setEditCurrency(opportunity.currency || "ARS");
    setEditOwnerName(opportunity.ownerName || "");
    setEditCloseDate(opportunity.expectedCloseDate ? opportunity.expectedCloseDate.slice(0, 10) : "");
    setEditPriority(opportunity.priority || "Normal");
    setShowEditPanel((v) => !v);
    setShowStagePanel(false);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!opportunity || !editTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const matchedUser = users.find((u) => u.fullName === editOwnerName);
      await api.updateOpportunity(opportunity.id, {
        title: editTitle.trim(),
        amount: editAmount.trim() ? Number(editAmount.replace(",", ".")) : null,
        currency: editCurrency,
        ownerName: editOwnerName.trim() || null,
        ownerId: matchedUser?.id ?? null,
        priority: editPriority,
        expectedCloseDate: editCloseDate ? new Date(`${editCloseDate}T12:00:00`).toISOString() : null
      });
      setShowEditPanel(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const attachExistingCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!opportunity || !selectedCustomerId) return;
    setBusy(true);
    setError(null);
    try {
      await api.attachCustomerToOpportunity(opportunity.id, selectedCustomerId);
      setSelectedCustomerId("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const consultArcaForLead = async () => {
    const clean = convertCuit.replace(/\D/g, "");
    if (clean.length !== 11) {
      setError("Ingresá un CUIT de 11 dígitos antes de consultar ARCA.");
      return;
    }
    setLookingUpArca(true);
    setError(null);
    setArcaFeedback(null);
    try {
      const res = await api.consultArcaCuit(clean);
      if (res.legalName) setConvertLegalName(res.legalName);
      if (res.taxCondition && ["ResponsableInscripto", "Monotributo", "Exento", "ConsumidorFinal"].includes(res.taxCondition)) {
        setConvertTaxCondition(res.taxCondition);
      }
      setArcaFeedback(`ARCA confirmó: ${res.legalName} (${label(res.taxCondition)}).`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLookingUpArca(false);
    }
  };

  const convertLeadHere = async (e: FormEvent) => {
    e.preventDefault();
    if (!opportunity?.leadId) return;
    const clean = convertCuit.replace(/\D/g, "");
    if (clean.length !== 11) {
      setError("El CUIT debe contener 11 dígitos numéricos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.convertLead(opportunity.leadId, {
        legalName: convertLegalName.trim(),
        documentType: "Cuit",
        documentNumber: clean,
        taxCondition: convertTaxCondition,
        iibbRegime: "Local",
        isCustomer: true,
        isSupplier: false,
        email: leadInfo?.email ?? undefined,
        phone: leadInfo?.phone ?? undefined
      }, false);
      setArcaFeedback(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
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
      await api.moveOpportunity(
        opportunity.id,
        targetStage === "Discovery" ? "Qualified" : targetStage,
        revertReason.trim(),
        { description: `[CAMBIO / REVERSIÓN DE ETAPA a ${stageLabels[targetStage]}] Motivo: ${revertReason.trim()}` }
      );
      setShowStagePanel(false);
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
  const isClosed = opportunity.stage === "Won" || opportunity.stage === "Lost";

  return (
    <div className="opportunity-workspace page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">OPORTUNIDAD COMERCIAL</span>
          <h1>{opportunity.title}</h1>
          <p className="muted">
            {customerName ? (
              <Link className="t-strong t-accent" to={`/clientes/${opportunity.customerId}`}>
                🏢 {customerName}
              </Link>
            ) : (
              <span className="t-warn">⚠️ Cliente pendiente de vincular</span>
            )}
          </p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn" onClick={() => setShowEmail(true)} disabled={isClosed}>
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
          {!isClosed && (
            <button type="button" className="btn btn-outline" onClick={openEditPanel}>
              ✏️ Editar datos
            </button>
          )}
          {isClosed ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setTargetStage("Negotiation");
                setShowEditPanel(false);
                setShowStagePanel((v) => !v);
              }}
            >
              🔄 Reabrir oportunidad
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setTargetStage("Discovery");
                setShowEditPanel(false);
                setShowStagePanel((v) => !v);
              }}
            >
              🔄 Cambiar Etapa
            </button>
          )}
          <Link className="btn btn-outline" to="/oportunidades">
            Volver al embudo
          </Link>
          <Link className="btn btn-outline" to="/crm/ayuda">
            Ayuda
          </Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {isClosed && (
        <div className="hint t-ok" style={{ background: "var(--lc-ok-bg)", border: "1px solid #34d399", marginBottom: 12 }}>
          Esta oportunidad está <strong>{label(opportunity.stage)}</strong> y quedó bloqueada para edición comercial.
          Podés consultar el historial; para volver a editar usá <strong>Reabrir oportunidad</strong> con un motivo.
        </div>
      )}

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

      {/* Panel integrado: Editar datos comerciales */}
      {showEditPanel && !isClosed && (
        <form onSubmit={saveEdit} className="card pad" style={{ marginBottom: 16 }}>
          <div className="section-head">
            <div>
              <span className="eyebrow">DATOS COMERCIALES</span>
              <h2>Editar oportunidad</h2>
            </div>
            <button type="button" className="btn ghost compact" onClick={() => setShowEditPanel(false)}>Cerrar</button>
          </div>
          <div className="grid-3">
            <label>
              Título *
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required maxLength={150} />
            </label>
            <label>
              Monto estimado
              <input type="number" step="0.01" min="0" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} placeholder="Sin monto" />
            </label>
            <label>
              Moneda
              <select value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label>
              Responsable / Vendedor
              <input list="opp-owners-list" value={editOwnerName} onChange={(e) => setEditOwnerName(e.target.value)} placeholder="Sin asignar" />
              <datalist id="opp-owners-list">
                {users.map((u) => <option key={u.id} value={u.fullName} />)}
              </datalist>
            </label>
            <label>
              Cierre estimado
              <input type="date" value={editCloseDate} onChange={(e) => setEditCloseDate(e.target.value)} />
            </label>
            <label>
              Prioridad
              <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                <option value="Low">Baja</option>
                <option value="Normal">Normal</option>
                <option value="High">Alta</option>
                <option value="Urgent">Urgente</option>
              </select>
            </label>
          </div>
          <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <button type="button" className="btn btn-outline" onClick={() => setShowEditPanel(false)}>Cancelar</button>
            <button className="btn" disabled={busy || !editTitle.trim()}>{busy ? "Guardando…" : "Guardar cambios"}</button>
          </div>
        </form>
      )}

      {/* Panel integrado: Cambiar / Revertir Etapa (sin modal flotante) */}
      {showStagePanel && (
        <section className="card pad" style={{ marginBottom: 16 }}>
          <div className="section-head">
            <div>
              <span className="eyebrow">AUDITORÍA COMERCIAL</span>
              <h2>🔄 {isClosed ? "Reabrir oportunidad" : "Cambiar / Revertir Etapa"}</h2>
            </div>
            <button type="button" className="btn ghost compact" onClick={() => setShowStagePanel(false)}>
              Cerrar
            </button>
          </div>
          <p className="muted t-small">
            Cualquier cambio o retroceso de etapa registra un motivo en el historial comercial de la oportunidad.
          </p>
          <form onSubmit={handleStageReversion} className="stack" style={{ gap: 12, marginTop: 12 }}>
            <div className="grid-2">
              <label>
                Nueva Etapa Destino *
                <select value={targetStage} onChange={(e) => setTargetStage(e.target.value as Stage)} required>
                  <option value="Discovery">1. Por cotizar</option>
                  <option value="Proposal">2. Presupuestado</option>
                  <option value="Negotiation">3. En negociación</option>
                  <option value="Won">4. Ganada</option>
                  <option value="Lost">5. Perdida</option>
                </select>
              </label>
              <label>
                Motivo del cambio *
                <input
                  required
                  value={revertReason}
                  onChange={(e) => setRevertReason(e.target.value)}
                  placeholder="Ej.: El cliente pidió revisar plazos y condiciones…"
                />
              </label>
            </div>
            <div className="toolbar" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowStagePanel(false)}>
                Cancelar
              </button>
              <button className="btn" disabled={reverting || !revertReason.trim()}>
                {reverting ? "Guardando…" : "Confirmar cambio de etapa"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Panel integrado: Vincular cliente existente o convertir prospecto con ARCA */}
      {!opportunity.customerId && !isClosed && (
        <section className="card pad" style={{ marginBottom: 16 }}>
          <div className="section-head">
            <div>
              <span className="eyebrow">CLIENTE PENDIENTE</span>
              <h2>Vincular o dar de alta el cliente para poder presupuestar</h2>
            </div>
            <div className="toolbar">
              <button
                type="button"
                className={linkMode === "existing" ? "btn compact" : "btn ghost compact"}
                onClick={() => setLinkMode("existing")}
              >
                Vincular cliente existente
              </button>
              {opportunity.leadId && (
                <button
                  type="button"
                  className={linkMode === "convert" ? "btn compact" : "btn ghost compact"}
                  onClick={() => setLinkMode("convert")}
                >
                  Convertir prospecto (ARCA)
                </button>
              )}
            </div>
          </div>

          {linkMode === "existing" ? (
            <form onSubmit={attachExistingCustomer} className="toolbar" style={{ marginTop: 10 }}>
              <div style={{ flex: "1 1 320px" }}>
                <CustomerPicker
                  options={customerList}
                  value={selectedCustomerId}
                  onChange={setSelectedCustomerId}
                  placeholder="Buscar cliente existente por razón social o CUIT…"
                />
              </div>
              <button className="btn" disabled={busy || !selectedCustomerId}>
                {busy ? "Vinculando…" : "Vincular cliente"}
              </button>
            </form>
          ) : (
            <form onSubmit={convertLeadHere} className="stack" style={{ gap: 12, marginTop: 10 }}>
              {arcaFeedback && <div className="success-banner">{arcaFeedback}</div>}
              <div className="grid-3">
                <label>
                  CUIT (11 dígitos) *
                  <div className="row" style={{ gap: 6 }}>
                    <input
                      value={convertCuit}
                      onChange={(e) => setConvertCuit(e.target.value)}
                      inputMode="numeric"
                      placeholder="30-12345678-9"
                      required
                    />
                    <button type="button" className="btn btn-outline compact" disabled={lookingUpArca} onClick={() => void consultArcaForLead()}>
                      {lookingUpArca ? "Consultando…" : "ARCA"}
                    </button>
                  </div>
                </label>
                <label>
                  Razón Social *
                  <input value={convertLegalName} onChange={(e) => setConvertLegalName(e.target.value)} required />
                </label>
                <label>
                  Condición Fiscal *
                  <select value={convertTaxCondition} onChange={(e) => setConvertTaxCondition(e.target.value)}>
                    <option value="ResponsableInscripto">Responsable Inscripto</option>
                    <option value="Monotributo">Monotributo</option>
                    <option value="Exento">Exento</option>
                    <option value="ConsumidorFinal">Consumidor Final</option>
                  </select>
                </label>
              </div>
              <div className="toolbar" style={{ justifyContent: "flex-end" }}>
                <button className="btn" disabled={busy || !convertLegalName.trim()}>
                  {busy ? "Creando cliente…" : "Crear cliente y vincular a esta oportunidad"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <div className="opportunity-layout">
        <div className="stack">
          <section className="card pad">
            <div className="section-head">
              <div>
                <h2>Propuesta comercial</h2>
                <p className="muted">Presupuestos vinculados a esta negociación.</p>
              </div>
              <button className="btn" type="button" onClick={createQuote} disabled={busy || !opportunity.customerId || isClosed}>
                + Crear presupuesto
              </button>
            </div>
            {isClosed && (
              <div className="hint muted" style={{ background: "var(--lc-surface-2)", border: "1px solid var(--lc-line-2)" }}>
                No se pueden crear ni editar presupuestos mientras la oportunidad esté cerrada.
              </div>
            )}
            {!opportunity.customerId && !isClosed && (
              <div className="hint t-warn" style={{ background: "var(--lc-warn-bg)", border: "1px solid var(--lc-warn)" }}>
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
                  <Link to={isClosed ? `/presupuestos/${quote.id}/imprimir` : `/presupuestos/${quote.id}/editar`}>
                    {isClosed ? "Ver" : "Abrir"}
                  </Link>
                </div>
              ))
            )}
            {salesOrders.length > 0 && (
              <div className="stack" style={{ gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--lc-line)" }}>
                <strong className="t-small muted">Pedidos de venta</strong>
                {salesOrders.map((ord) => (
                  <div className="quote-row" key={ord.id}>
                    <div>
                      <strong>{ord.number}</strong>
                      <span className="muted">
                        {" "}· {label(ord.status)}
                        {ord.total != null ? ` · ${ord.currency} $${ord.total.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : ""}
                      </span>
                    </div>
                    <Link to={`/pedidos/${ord.id}`}>Ver pedido</Link>
                  </div>
                ))}
              </div>
            )}
            {salesInvoices.length > 0 && (
              <div className="stack" style={{ gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--lc-line)" }}>
                <strong className="t-small muted">Facturas emitidas</strong>
                {salesInvoices.map((inv) => (
                  <div className="quote-row" key={inv.id}>
                    <div>
                      <strong>{inv.invoiceType} {inv.number}</strong>
                      <span className="muted">
                        {" "}· {label(inv.status)}
                        {inv.total != null ? ` · ${inv.currency} $${inv.total.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : ""}
                      </span>
                    </div>
                    <Link to={`/facturas/${inv.id}`}>Ver factura</Link>
                  </div>
                ))}
              </div>
            )}
          </section>
          {conversations.length > 0 && (
            <section className="card pad">
              <h2>Conversaciones</h2>
              <div className="stack" style={{ gap: 8 }}>
                {conversations.map((c) => (
                  <Link key={c.id} to="/comunicaciones" state={{ conversationId: c.id }}
                    className="row" style={{ justifyContent: "space-between", gap: 12, padding: "8px 10px", border: "1px solid var(--lc-line)", borderRadius: 8, textDecoration: "none", color: "inherit" }}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{c.channelType === "email" ? "Correo" : c.channelType} · {c.participantName}</strong>
                      <div className="muted t-small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.lastMessagePreview || "—"}
                      </div>
                    </div>
                    <time className="muted t-small" style={{ whiteSpace: "nowrap" }}>
                      {new Date(c.lastMessageAtUtc).toLocaleString("es-AR")}
                    </time>
                  </Link>
                ))}
              </div>
            </section>
          )}
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
          <p className="muted">
            {isClosed
              ? "La oportunidad está cerrada. El historial queda solo en lectura."
              : "Cada llamada, reunión o mensaje explica qué ocurrió y cuál es el próximo paso."}
          </p>
          {isClosed ? (
            <div className="empty-state">Edición bloqueada en oportunidad ganada/perdida.</div>
          ) : (
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
          )}
        </aside>
      </div>
    </div>
  );
}
