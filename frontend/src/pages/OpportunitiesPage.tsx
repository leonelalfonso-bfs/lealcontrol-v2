import { FormEvent, useEffect, useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { label, type CustomerSummary, type Opportunity, type Quote, type TenantUser } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

const pipeline = ["Discovery", "Proposal", "Negotiation", "Won", "Lost"] as const;
type VisualStage = (typeof pipeline)[number];

const stageMeta: Record<VisualStage, { label: string; help: string }> = {
  Discovery: { label: "Relevamiento", help: "Necesidad, alcance y próximo paso" },
  Proposal: { label: "Propuesta", help: "Presupuesto real preparado o enviado" },
  Negotiation: { label: "Negociación", help: "Respuesta, cambios y acuerdos" },
  Won: { label: "Ganada", help: "Aceptación registrada" },
  Lost: { label: "Perdida", help: "Motivo registrado" }
};

function visualStage(stage: string): VisualStage {
  if (stage === "Lead" || stage === "Qualified") return "Discovery";
  return pipeline.includes(stage as VisualStage) ? (stage as VisualStage) : "Discovery";
}

function money(amount?: number | null, currency = "ARS") {
  return amount == null ? "Sin monto" : `${currency} $${Number(amount).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function nextStage(current: VisualStage) {
  if (current === "Discovery") return "Proposal";
  if (current === "Proposal") return "Negotiation";
  return null;
}

type Transition = { opportunity: Opportunity; target: VisualStage; isReversion?: boolean };

export function OpportunitiesPage() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [filter, setFilter] = useState({ priority: "", health: "", owner: "", tag: "" });
  const [form, setForm] = useState({
    title: "",
    amount: "",
    customerId: "",
    ownerName: "",
    expectedCloseDate: "",
    priority: "Normal",
    tags: "",
    need: ""
  });

  const load = async () => {
    try {
      const [opps, quoteList, page, userList] = await Promise.all([
        api.listOpportunities(),
        api.listQuotes(),
        api.listCustomers(),
        api.listTenantUsers().catch(() => [])
      ]);
      setItems(opps || []);
      setQuotes(quoteList || []);
      setCustomers(page?.items || (page as any) || []);
      setUsers((userList || []).filter((u) => u.isActive !== false));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const owners = useMemo(() => [...new Set(items.map((o) => o.ownerName).filter(Boolean) as string[])].sort(), [items]);
  const tags = useMemo(() => [...new Set(items.flatMap((o) => o.tags ?? []))].sort(), [items]);

  const filtered = useMemo(() => items.filter((o) => {
    if (filter.priority && o.priority !== filter.priority) return false;
    if (filter.owner && o.ownerName !== filter.owner) return false;
    if (filter.tag && !o.tags?.includes(filter.tag)) return false;
    if (filter.health === "overdue" && o.activityBadgeStatus !== "Red") return false;
    if (filter.health === "without_next_action" && o.activityBadgeStatus !== "Gray") return false;
    if (filter.health === "needs_attention" && !(o.isRotting || ["Red", "Yellow", "Gray"].includes(o.activityBadgeStatus ?? "Gray"))) return false;
    return true;
  }), [items, filter]);

  // Detector de duplicados en tiempo real
  const duplicateWarning = useMemo(() => {
    if (!form.customerId) return null;
    const existing = items.find(
      (o) => o.customerId === form.customerId && o.stage !== "Won" && o.stage !== "Lost"
    );
    return existing || null;
  }, [form.customerId, items]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.openOpportunity({
        title: form.title.trim(),
        customerId: form.customerId || null,
        amount: form.amount ? Number(form.amount) : null,
        currency: "ARS",
        ownerName: form.ownerName.trim() || null,
        priority: form.priority,
        tags: form.tags.split(/[,;#]+/).map((tag) => tag.trim()).filter(Boolean),
        expectedCloseDate: form.expectedCloseDate ? new Date(`${form.expectedCloseDate}T12:00:00`).toISOString() : null,
        customFields: form.need.trim() ? { necesidad: form.need.trim() } : {}
      });
      setForm({ title: "", amount: "", customerId: "", ownerName: "", expectedCloseDate: "", priority: "Normal", tags: "", need: "" });
      setShowForm(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const requestTransition = (opportunity: Opportunity, target: VisualStage, isReversion = false) => {
    const current = visualStage(opportunity.stage);
    if (current === target) return;
    setTransition({ opportunity, target, isReversion });
  };

  const quoteFor = (id: string) => quotes.find((quote) => quote.opportunityId === id);

  return (
    <div className="opportunities-page page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">PROCESO COMERCIAL</span>
          <h1>Oportunidades</h1>
          <p className="muted">Cada avance registra qué ocurrió y cuál es el próximo paso.</p>
        </div>
        <ExcelToolbar
          fileName="oportunidades"
          rows={items}
          columns={[
            { key: "title", header: "Título" },
            { key: "customerId", header: "Cliente" },
            { key: "stage", header: "Etapa" },
            { key: "amount", header: "Monto" },
            { key: "ownerName", header: "Responsable" },
            { key: "expectedCloseDate", header: "Cierre estimado" }
          ]}
        />
        <div className="toolbar">
          <Link className="btn btn-outline" to="/crm/ayuda">
            ? Ayuda
          </Link>
          <button className="btn" onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Cerrar" : "+ Nueva oportunidad"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert">
          {error}
          <button className="alert-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {showForm && (
        <form className="card pad guided-form" onSubmit={create}>
          <div>
            <h2>Abrir oportunidad</h2>
            <p className="muted">
              Usá esta opción para ventas detectadas directamente. Los prospectos deben calificarse primero.
            </p>
          </div>

          {duplicateWarning && (
            <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef3c7", border: "1px solid #f59e0b", color: "#92400e", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <strong>⚠️ Posible Oportunidad Duplicada:</strong> Ya existe una oportunidad abierta para este cliente: <em>"{duplicateWarning.title}"</em> (en etapa <b>{label(duplicateWarning.stage)}</b>).
              </div>
              <Link to={`/oportunidades/${duplicateWarning.id}`} className="btn btn-outline compact" style={{ background: "#fff", marginLeft: 12 }}>
                Abrir Existente
              </Link>
            </div>
          )}

          <div className="grid-3">
            <label>
              Oportunidad *
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ej. Renovación de balanzas de planta"
              />
            </label>

            <label>
              Cliente *
              <select
                required
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              >
                <option value="">Seleccionar empresa</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.legalName || c.tradeName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Responsable / Vendedor *
              <select
                required
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              >
                <option value="">Seleccionar usuario...</option>
                {users.length > 0 ? (
                  users.map((u) => (
                    <option key={u.id} value={u.fullName || u.email}>
                      👤 {u.fullName || u.email} ({u.role})
                    </option>
                  ))
                ) : (
                  <option value="Administrador">👤 Administrador</option>
                )}
              </select>
            </label>

            <label>
              Necesidad detectada *
              <input
                required
                value={form.need}
                onChange={(e) => setForm({ ...form, need: e.target.value })}
                placeholder="Ej: Calibración anual requerida por auditoría"
              />
            </label>

            <label>
              Monto estimado ($ ARS)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </label>

            <label>
              Cierre estimado
              <input
                type="date"
                value={form.expectedCloseDate}
                onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
              />
            </label>

            <label>
              Prioridad
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="Low">Baja</option>
                <option value="Normal">Normal</option>
                <option value="High">Alta</option>
                <option value="Urgent">Urgente</option>
              </select>
            </label>

            <label>
              Etiquetas
              <input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="licitación, industria, balanzas"
              />
            </label>
          </div>

          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy}>
              Crear en Relevamiento
            </button>
          </div>
        </form>
      )}

      <div className="card filters">
        <label>
          Prioridad
          <select value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}>
            <option value="">Todas</option>
            <option value="Low">Baja</option>
            <option value="Normal">Normal</option>
            <option value="High">Alta</option>
            <option value="Urgent">Urgente</option>
          </select>
        </label>
        <label>
          Responsable
          <select value={filter.owner} onChange={(e) => setFilter({ ...filter, owner: e.target.value })}>
            <option value="">Todos</option>
            {owners.map((owner) => (
              <option key={owner}>{owner}</option>
            ))}
          </select>
        </label>
        <label>
          Etiqueta
          <select value={filter.tag} onChange={(e) => setFilter({ ...filter, tag: e.target.value })}>
            <option value="">Todas</option>
            {tags.map((tag) => (
              <option key={tag}>{tag}</option>
            ))}
          </select>
        </label>
        <label>
          Salud comercial
          <select value={filter.health} onChange={(e) => setFilter({ ...filter, health: e.target.value })}>
            <option value="">Todas</option>
            <option value="needs_attention">Requiere atención</option>
            <option value="overdue">Seguimiento vencido</option>
            <option value="without_next_action">Sin próxima acción</option>
          </select>
        </label>
      </div>

      <div className="pipeline crm-pipeline">
        {pipeline.map((stage) => {
          const column = filtered.filter((opportunity) => visualStage(opportunity.stage) === stage);
          const total = column.reduce((sum, opportunity) => sum + Number(opportunity.amount || 0), 0);
          return (
            <section
              className={`card pad pipeline-col stage-${stage.toLowerCase()}`}
              key={stage}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/opportunity-id") || dragId;
                setDragId(null);
                const opportunity = items.find((item) => item.id === id);
                if (opportunity) requestTransition(opportunity, stage);
              }}
            >
              <header className="pipeline-head">
                <div>
                  <h3>{stageMeta[stage].label}</h3>
                  <p>{stageMeta[stage].help}</p>
                </div>
                <span className="count-badge">{column.length}</span>
              </header>
              <div className="pipeline-total">{money(total || null)}</div>
              <div className="pipeline-cards">
                {column.map((opportunity) => {
                  const quote = quoteFor(opportunity.id);
                  const closed = stage === "Won" || stage === "Lost";
                  return (
                    <article
                      className="opp-card"
                      key={opportunity.id}
                      draggable={!busy && !closed}
                      onDragStart={(event: DragEvent) => {
                        if (closed) return;
                        setDragId(opportunity.id);
                        event.dataTransfer.setData("text/opportunity-id", opportunity.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      style={closed ? { opacity: 0.92 } : undefined}
                    >
                      <Link className="opp-card-title" to={`/oportunidades/${opportunity.id}`}>
                        {opportunity.title}
                      </Link>
                      <strong className="opp-amount">{money(opportunity.amount, opportunity.currency)}</strong>
                      <div className="tag-row">
                        <span className={`badge priority-${opportunity.priority?.toLowerCase()}`}>
                          {label(opportunity.priority)}
                        </span>
                        {opportunity.ownerName && <span className="tag">👤 {opportunity.ownerName}</span>}
                      </div>
                      {quote && (
                        <Link
                          className="proposal-chip"
                          to={closed ? `/presupuestos/${quote.id}/imprimir` : `/presupuestos/${quote.id}/editar`}
                        >
                          Presupuesto {quote.quoteNumber} · {label(quote.status)}
                        </Link>
                      )}
                      <div className={`health-line health-${(opportunity.activityBadgeStatus ?? "Gray").toLowerCase()}`}>
                        {opportunity.activityBadgeStatus === "Gray"
                          ? "Sin próxima acción"
                          : opportunity.activityBadgeStatus === "Red"
                          ? "Seguimiento vencido"
                          : opportunity.activityBadgeStatus === "Yellow"
                          ? "Seguimiento para hoy"
                          : "Próxima acción programada"}
                      </div>
                      {opportunity.lostReason && <div className="loss-reason">Motivo: {opportunity.lostReason}</div>}
                      <div className="card-actions" style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <Link className="btn btn-outline compact" to={`/oportunidades/${opportunity.id}`}>
                          Ficha
                        </Link>
                        {!closed && (
                          <>
                            {nextStage(stage) && (
                              <button className="btn compact" onClick={() => requestTransition(opportunity, nextStage(stage)!)}>
                                Avanzar
                              </button>
                            )}
                            {stage === "Negotiation" && (
                              <button className="btn compact" onClick={() => requestTransition(opportunity, "Won")}>
                                Ganar
                              </button>
                            )}
                            <button className="btn btn-outline compact" onClick={() => requestTransition(opportunity, "Lost")}>
                              Perder
                            </button>
                          </>
                        )}
                        {closed && (
                          <button
                            className="btn btn-outline compact"
                            title="Revertir y reabrir oportunidad con motivo obligatorio"
                            style={{ color: "#d97706", borderColor: "#f59e0b" }}
                            onClick={() => requestTransition(opportunity, "Negotiation", true)}
                          >
                            🔄 Reabrir
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
                {column.length === 0 && <div className="empty-col">Sin oportunidades en esta etapa</div>}
              </div>
            </section>
          );
        })}
      </div>

      {transition && (
        <TransitionDialog
          transition={transition}
          quote={quoteFor(transition.opportunity.id)}
          onClose={() => setTransition(null)}
          onDone={async () => {
            setTransition(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function TransitionDialog({
  transition,
  quote,
  onClose,
  onDone
}: {
  transition: Transition;
  quote?: Quote;
  onClose: () => void;
  onDone: () => void;
}) {
  const [detail, setDetail] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [evidenceType, setEvidenceType] = useState("Presupuesto aceptado");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { opportunity, target, isReversion } = transition;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (target === "Proposal" && !quote && !isReversion) {
      setError("Para avanzar a Propuesta primero debe existir un presupuesto real.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const descriptions: Record<VisualStage, string> = {
        Discovery: isReversion ? `[REVERSIÓN DE ETAPA] Reabierta a Relevamiento: ${detail}` : detail,
        Proposal: isReversion ? `[REVERSIÓN DE ETAPA] Reabierta a Propuesta: ${detail}` : `Propuesta ${quote?.quoteNumber ?? ""}: ${detail}`,
        Negotiation: isReversion ? `[REVERSIÓN DE ETAPA] Reabierta a Negociación: ${detail}` : `Respuesta del cliente / negociación: ${detail}`,
        Won: `${evidenceType}: ${detail}`,
        Lost: `Motivo de pérdida: ${detail}`
      };
      await api.logActivity({
        type: "Note",
        description: descriptions[target],
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        nextFollowUpOn: followUp ? new Date(`${followUp}T12:00:00`).toISOString() : null
      });
      await api.moveOpportunity(opportunity.id, target, target === "Lost" || isReversion ? detail : undefined);
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-card transition-dialog" onSubmit={submit}>
        <div className="section-head">
          <div>
            <span className="eyebrow">{isReversion ? "REVERSIÓN DE ESTADO" : "CAMBIO DE ETAPA"}</span>
            <h2>{isReversion ? `🔄 Revertir / Reabrir a ${stageMeta[target].label}` : `Avanzar a ${stageMeta[target].label}`}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">
          {isReversion
            ? "El motivo de la reversión quedará registrado obligatoriamente en el historial de auditoría comercial."
            : `${stageMeta[target].help}. Esta acción quedará registrada en el historial.`}
        </p>
        {error && <div className="alert">{error}</div>}
        {target === "Proposal" && !quote && !isReversion && (
          <div className="guided-action">
            <strong>Falta la propuesta</strong>
            <p>Creá el presupuesto desde la ficha de la oportunidad, completalo y luego volvé a avanzar.</p>
            <Link className="btn" to={`/oportunidades/${opportunity.id}`}>
              Ir a preparar presupuesto
            </Link>
          </div>
        )}
        {target === "Won" && (
          <label>
            Evidencia de aceptación
            <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}>
              <option>Presupuesto aceptado</option>
              <option>Orden de compra</option>
              <option>Confirmación por email</option>
              <option>Contrato firmado</option>
              <option>Autorización verbal registrada</option>
            </select>
          </label>
        )}
        <label>
          {isReversion
            ? "Motivo de la Reversión / Reapertura (Obligatorio) *"
            : target === "Lost"
            ? "Motivo de pérdida *"
            : target === "Won"
            ? "Referencia o detalle de aceptación *"
            : target === "Negotiation"
            ? "Respuesta, objeciones o condiciones acordadas *"
            : "Qué ocurrió y cómo se envió *"}
          <textarea
            required
            rows={4}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={
              isReversion
                ? "Ej: El cliente solicitó reabrir la negociación para modificar cantidades y plazos de entrega..."
                : ""
            }
          />
        </label>
        {target !== "Won" && target !== "Lost" && (
          <label>
            Próxima acción *
            <input required type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </label>
        )}
        <div className="toolbar">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" disabled={busy || (target === "Proposal" && !quote && !isReversion)}>
            {isReversion ? "Confirmar Reversión" : "Confirmar avance"}
          </button>
        </div>
      </form>
    </div>
  );
}
