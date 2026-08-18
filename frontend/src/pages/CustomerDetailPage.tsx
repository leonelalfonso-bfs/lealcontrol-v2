import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api/client";
import { label, provinces, type Activity, type Contact, type CustomerDetail, type Location, type Opportunity, type Quote } from "../api/types";
import { buildWhatsAppUrl, formatCuitDisplay } from "../lib/arContact";
import { EmailComposer } from "../components/EmailComposer";

export function CustomerDetailPage() {
  const [showEmail, setShowEmail] = useState(false);
  const { id } = useParams();
  const location = useLocation();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [tab, setTab] = useState<"ficha" | "plantas" | "contactos" | "equipos" | "fiscal" | "timeline">("ficha");
  const [timeline, setTimeline] = useState<Activity[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Edit states
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const refresh = () => {
    if (!id) return;
    Promise.all([api.getCustomer(id), api.timeline(id), api.opportunities(id), api.listQuotes()])
      .then(([c, t, o, q]) => {
        setCustomer(c);
        setTimeline(t);
        setOpps(o);
        setQuotes(q.filter((quote) => quote.customerId === id));
        setEditingLocation(null);
        setEditingContact(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => { refresh(); }, [id]);

  if (!customer) return error ? <div className="alert">{error}</div> : <div className="card pad" style={{ textAlign: "center", padding: "40px" }}><p className="muted">Cargando ficha comercial…</p></div>;

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
    if (diffDays < 0) return <span className="badge off" style={{ backgroundColor: "#ef4444", color: "#fff" }}>🔴 Vencido ({Math.abs(diffDays)}d)</span>;
    if (diffDays <= 30) return <span className="badge" style={{ backgroundColor: "#f59e0b", color: "#fff" }}>🟡 Vence en {diffDays}d</span>;
    return <span className="badge" style={{ backgroundColor: "#10b981", color: "#fff" }}>🟢 Al día ({due.toLocaleDateString()})</span>;
  };

  return (
    <div className="customer-detail-page">
      {/* Page Header */}
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
            <h1 style={{ margin: 0 }}>{customer.legalName}</h1>
            {isBoth ? (
              <span style={{ padding: "4px 10px", borderRadius: "12px", background: "#dbeafe", color: "#1e40af", fontSize: "0.82rem", fontWeight: "bold", border: "1px solid #bfdbfe" }}>
                🤝 Cliente y Proveedor
              </span>
            ) : isPureSupplier ? (
              <span style={{ padding: "4px 10px", borderRadius: "12px", background: "#fef3c7", color: "#92400e", fontSize: "0.82rem", fontWeight: "bold", border: "1px solid #fde68a" }}>
                🏢 Proveedor Oficial
              </span>
            ) : (
              <span style={{ padding: "4px 10px", borderRadius: "12px", background: "#ecfdf5", color: "#065f46", fontSize: "0.82rem", fontWeight: "bold", border: "1px solid #a7f3d0" }}>
                👤 Cliente Comercial
              </span>
            )}
            <span style={{ padding: "4px 10px", borderRadius: "12px", background: customer.status === "Active" ? "#f0fdf4" : "#fef2f2", color: customer.status === "Active" ? "#166534" : "#991b1b", fontSize: "0.82rem", fontWeight: "bold", border: `1px solid ${customer.status === "Active" ? "#bbf7d0" : "#fecaca"}` }}>
              {customer.status === "Active" ? "● Activo" : "● Inactivo"}
            </span>
          </div>

          <div className="hero-meta">
            <span>CUIT: {formatCuitDisplay(customer.documentNumber)}</span>
            <span>{label(customer.taxCondition)}</span>
            <span>{label(customer.iibbRegime)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button type="button" className="btn" onClick={() => setShowEmail(true)}>✉ Email</button>
          {showEmail && <EmailComposer context={{ entityType: "Customer", entityId: customer.id, to: customer.email ?? undefined, subject: `Contacto comercial con ${customer.legalName}`, body: `Hola,\n\n` }} onClose={() => setShowEmail(false)} />}
          <Link to={backUrl} className="btn btn-outline">
            ← Volver a {returnUrl === "/directorio" ? "Directorio" : isPureSupplier ? "Proveedores" : "Clientes"}
          </Link>
          {waPhone && (
            <button className="btn" type="button" onClick={() => openWhatsApp(waPhone)} style={{ background: "#22c55e", color: "white" }}>
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
          style={{ cursor: "pointer", border: tab === "plantas" ? "2px solid var(--primary)" : "1px solid var(--surface-border)" }}
          onClick={() => setTab("plantas")}
        >
          <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: "bold" }}>
            {isPureSupplier ? "Plantas / Depósitos" : "Plantas / Sucursales"}
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "var(--brand-accent)", marginTop: "4px" }}>
            🏢 {customer.locations.length}
          </div>
        </div>

        <div
          className="card pad"
          style={{ cursor: "pointer", border: tab === "contactos" ? "2px solid var(--primary)" : "1px solid var(--surface-border)" }}
          onClick={() => setTab("contactos")}
        >
          <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: "bold" }}>
            Contactos Responsables
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "var(--brand-accent)", marginTop: "4px" }}>
            👤 {customer.contacts.length}
          </div>
        </div>

        {!isPureSupplier && (
          <div
            className="card pad"
            style={{ cursor: "pointer", border: tab === "equipos" ? "2px solid var(--primary)" : "1px solid var(--surface-border)" }}
            onClick={() => setTab("equipos")}
          >
            <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: "bold" }}>
              Parque de Equipos
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "var(--brand-accent)", marginTop: "4px" }}>
              ⚖️ {(customer.equipments || []).length}
            </div>
          </div>
        )}

        {!isPureSupplier ? (
          <div
            className="card pad"
            style={{ cursor: "pointer", border: tab === "timeline" ? "2px solid var(--primary)" : "1px solid var(--surface-border)" }}
            onClick={() => setTab("timeline")}
          >
            <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: "bold" }}>
              Oportunidades CRM
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "#2563eb", marginTop: "4px" }}>
              💼 {opps.length}
            </div>
          </div>
        ) : (
          <div className="card pad">
            <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: "bold" }}>
              Comprobantes de Compra
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: "bold", color: "#047857", marginTop: "8px" }}>
              <Link to={`/compras/facturas?search=${encodeURIComponent(customer.legalName)}`} style={{ textDecoration: "none", color: "#047857" }}>
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
          💬 Historial & Chatter ({timeline.length})
        </button>
      </div>

      {/* Tab 1: Ficha General */}
      {tab === "ficha" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "20px" }}>
          <div className="card pad" style={{ display: "grid", gap: "14px" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              Datos Comerciales y de Contacto
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px", fontSize: "0.92rem" }}>
              <span className="muted">Nombre Fantasía:</span>
              <strong style={{ color: "var(--ink)" }}>{customer.tradeName || "—"}</strong>

              <span className="muted">Email Principal:</span>
              <span>{customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : "—"}</span>

              <span className="muted">Teléfono Fijo:</span>
              <span>{customer.phone || "—"}</span>

              <span className="muted">WhatsApp:</span>
              <span>
                {customer.whatsApp ? (
                  <button
                    type="button"
                    onClick={() => openWhatsApp(customer.whatsApp!)}
                    style={{ background: "none", border: "none", color: "#16a34a", cursor: "pointer", fontWeight: "bold", padding: 0 }}
                  >
                    💬 {customer.whatsApp}
                  </button>
                ) : "—"}
              </span>

              <span className="muted">Domicilio Fiscal:</span>
              <span>
                {customer.fiscalAddress
                  ? `${customer.fiscalAddress.street}, ${customer.fiscalAddress.city} (${customer.fiscalAddress.province}) CP ${customer.fiscalAddress.postalCode}`
                  : "—"}
              </span>

              <span className="muted">Condición Pago:</span>
              <span>{customer.paymentTermsDays ? `${customer.paymentTermsDays} días fecha factura` : "Contado"}</span>

              <span className="muted">Límite Crédito:</span>
              <span>{customer.creditLimit ? `$ ${customer.creditLimit.toLocaleString("es-AR")}` : "Sin límite asignado"}</span>

              {customer.notes && (
                <>
                  <span className="muted">Observaciones:</span>
                  <span style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>{customer.notes}</span>
                </>
              )}
            </div>
          </div>

          <div className="card pad">
            <h3 style={{ margin: "0 0 12px 0", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              Contactos Destacados
            </h3>
            {customer.contacts.length === 0 ? (
              <p className="muted" style={{ fontSize: "0.9rem" }}>No hay contactos registrados todavía.</p>
            ) : (
              customer.contacts.map((c) => {
                const locName = customer.locations.find((l) => l.id === c.locationId)?.name;
                return (
                  <div key={c.id} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--surface-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong>{c.name}</strong>
                        <span className="muted" style={{ fontSize: "0.82rem", marginLeft: "6px" }}>({label(c.role)})</span>
                        {c.isPrimary && <span style={{ marginLeft: "6px", fontSize: "0.75rem", padding: "2px 6px", borderRadius: "8px", background: "#ecfdf5", color: "#065f46", fontWeight: "bold" }}>Principal</span>}
                        {locName && <span style={{ marginLeft: "6px", fontSize: "0.75rem", padding: "2px 6px", borderRadius: "8px", background: "#f1f5f9", color: "#475569" }}>📌 {locName}</span>}
                      </div>
                      {(c.whatsApp || c.phone) && (
                        <button
                          type="button"
                          onClick={() => openWhatsApp(c.whatsApp || c.phone || "", undefined, c.name)}
                          className="btn btn-outline"
                          style={{ padding: "2px 8px", fontSize: "0.78rem" }}
                        >
                          💬 WA
                        </button>
                      )}
                    </div>
                    <div className="muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
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
            <h3 style={{ margin: 0, fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              {isPureSupplier ? "Plantas, Talleres y Depósitos de Entrega" : "Plantas y Sucursales de Entrega"}
            </h3>
          </div>

          {customer.locations.map((l) => (
            <div key={l.id} style={{ marginBottom: 12, padding: "14px 16px", borderRadius: 8, border: "1px solid var(--surface-border)", background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "0.95rem" }}>{l.name}</strong> — {l.address.street}, {l.address.city} ({l.address.province}) CP {l.address.postalCode}
                  {l.phone && <div className="muted" style={{ fontSize: "0.85rem", marginTop: 2 }}>Teléfono: {l.phone}</div>}
                  {l.notes && <div className="muted" style={{ fontSize: "0.85rem", marginTop: 2 }}>Notas: {l.notes}</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                    onClick={() => setEditingLocation(l)}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: "4px 10px", fontSize: "0.8rem", color: "#ef4444" }}
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

          <hr style={{ margin: "24px 0", borderColor: "var(--surface-border)" }} />
          <LocationForm
            customerId={customer.id}
            initialData={editingLocation}
            onCancel={() => setEditingLocation(null)}
            onSaved={refresh}
          />
        </section>
      )}

      {/* Tab 3: Contactos */}
      {tab === "contactos" && (
        <section className="card pad">
          <h3 style={{ margin: "0 0 16px 0", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
            {isPureSupplier ? "Contactos Comerciales y Técnicos del Proveedor" : "Contactos Responsables del Cliente"}
          </h3>

          {customer.contacts.map((c) => {
            const locName = customer.locations.find((l) => l.id === c.locationId)?.name;
            return (
              <div key={c.id} style={{ marginBottom: 12, padding: "14px 16px", borderRadius: 8, border: "1px solid var(--surface-border)", background: "white" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: "0.95rem" }}>{c.name}</strong> ({label(c.role)}) {c.isPrimary && <span style={{ marginLeft: 6, fontSize: "0.75rem", padding: "2px 6px", borderRadius: 6, background: "#ecfdf5", color: "#065f46", fontWeight: "bold" }}>Principal</span>}
                    {locName && <span style={{ marginLeft: 8, fontSize: "0.75rem", padding: "2px 6px", borderRadius: 6, background: "#f1f5f9", color: "#475569" }}>📌 Planta: {locName}</span>}
                    <div className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                      {c.email && `✉️ Email: ${c.email} `}
                      {c.phone && `| 📞 Tel: ${c.phone} `}
                      {c.whatsApp && `| 💬 WA: ${c.whatsApp}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(c.whatsApp || c.phone) && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: "4px 10px", fontSize: "0.8rem", color: "#16a34a" }}
                        onClick={() => openWhatsApp(c.whatsApp || c.phone || "", undefined, c.name)}
                      >
                        💬 WA
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                      onClick={() => setEditingContact(c)}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ padding: "4px 10px", fontSize: "0.8rem", color: "#ef4444" }}
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

          <hr style={{ margin: "24px 0", borderColor: "var(--surface-border)" }} />
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
          <h3 style={{ margin: "0 0 6px 0", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
            Parque Instalado de Equipos / Activos
          </h3>
          <div className="muted" style={{ marginBottom: 16, fontSize: "0.88rem" }}>
            Gestión de balanzas, celdas de carga y activos de metrología del cliente.
          </div>

          {(customer.equipments || []).map((eq) => {
            const locName = customer.locations.find((l) => l.id === eq.locationId)?.name;
            return (
              <div key={eq.id} style={{ padding: "14px 16px", borderRadius: 8, border: "1px solid var(--surface-border)", marginBottom: 12, background: "white" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <strong style={{ fontSize: 16 }}>{eq.internalCode}</strong>
                      <span className="badge">{eq.equipmentType}</span>
                      {getCalibrationStatusBadge(eq.nextCalibrationDueDate)}
                    </div>
                    <div style={{ marginTop: 4, fontWeight: 600 }}>
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
                    className="btn btn-outline"
                    style={{ padding: "4px 10px", fontSize: "0.8rem", color: "#ef4444" }}
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

          <hr style={{ margin: "24px 0", borderColor: "var(--surface-border)" }} />
          <h4 style={{ margin: "0 0 12px 0" }}>+ Registrar Nuevo Equipo en Parque</h4>
          <EquipmentForm customerId={customer.id} locations={customer.locations} onCreated={refresh} />
        </section>
      )}

      {/* Tab 5: Fiscal */}
      {tab === "fiscal" && (
        <section className="card pad">
          <h3 style={{ margin: "0 0 16px 0", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
            Alícuotas Impositivas y Regímenes Especiales (IIBB / Percepciones)
          </h3>
          {customer.fiscalRates.map((r) => (
            <div key={r.jurisdiction} style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid var(--surface-border)", marginBottom: 10, background: "white", display: "flex", justifyContent: "space-between" }}>
              <strong>{label(r.jurisdiction)}</strong>
              <div className="muted" style={{ fontWeight: 600 }}>Perc. {r.perceptionRate}% · Ret. {r.retentionRate}%</div>
            </div>
          ))}
          {customer.fiscalRates.length === 0 && (
            <p className="muted" style={{ fontSize: "0.9rem" }}>No hay alícuotas personalizadas cargadas (aplica régimen general).</p>
          )}
          <RateForm customerId={customer.id} onCreated={refresh} />
        </section>
      )}

      {/* Tab 6: Timeline & Chatter */}
      {tab === "timeline" && (
        <section className="card pad">
          <h3 style={{ margin: "0 0 16px 0", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
            Historial comercial completo
          </h3>
          <div className="timeline">
            {timeline.map((act) => (
              <div key={act.id} className="timeline-item">
                <div className="muted" style={{ fontSize: "0.82rem" }}>
                  {new Date((act as unknown as { createdAtUtc?: string; occurredAtUtc?: string }).createdAtUtc || (act as unknown as { createdAtUtc?: string; occurredAtUtc?: string }).occurredAtUtc || Date.now()).toLocaleString()} — <strong>{act.type}</strong>
                </div>
                <div style={{ marginTop: 4 }}>{act.description}</div>
              </div>
            ))}
            {opps.map((opp) => (
              <div key={`opp-${opp.id}`} className="timeline-item timeline-commercial">
                <div className="muted" style={{ fontSize: "0.82rem" }}>{new Date(opp.createdAtUtc).toLocaleString("es-AR")} — <strong>Oportunidad</strong></div>
                <div style={{ marginTop: 4 }}><Link to={`/oportunidades/${opp.id}`}>{opp.title}</Link> · {label(opp.stage)} · {opp.amount ? `${opp.currency} $${Number(opp.amount).toLocaleString("es-AR")}` : "Sin monto"}</div>
                {opp.lostReason && <div className="hint">Motivo de pérdida: {opp.lostReason}</div>}
              </div>
            ))}
            {quotes.map((quote) => (
              <div key={`quote-${quote.id}`} className="timeline-item timeline-commercial">
                <div className="muted" style={{ fontSize: "0.82rem" }}>{new Date(quote.updatedAtUtc).toLocaleString("es-AR")} — <strong>Presupuesto</strong></div>
                <div style={{ marginTop: 4 }}><Link to={`/presupuestos/${quote.id}/editar`}>{quote.quoteNumber}</Link> · {label(quote.status)} · {quote.currency} $${Number(quote.total).toLocaleString("es-AR")}</div>
              </div>
            ))}
            {timeline.length === 0 && opps.length === 0 && quotes.length === 0 && <p className="muted" style={{ fontSize: "0.9rem" }}>No hay registros comerciales todavía.</p>}
          </div>
          <ActivityForm customerId={customer.id} onCreated={refresh} />
        </section>
      )}
    </div>
  );
}

function LocationForm({
  customerId,
  initialData,
  onCancel,
  onSaved
}: {
  customerId: string;
  initialData: Location | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [street, setStreet] = useState(initialData?.address.street ?? "");
  const [city, setCity] = useState(initialData?.address.city ?? "San Lorenzo");
  const [province, setProvince] = useState(initialData?.address.province ?? "SantaFe");
  const [postalCode, setPostalCode] = useState(initialData?.address.postalCode ?? "2200");
  const [phone, setPhone] = useState(initialData?.phone ?? "");

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setStreet(initialData.address.street);
      setCity(initialData.address.city);
      setProvince(initialData.address.province);
      setPostalCode(initialData.address.postalCode);
      setPhone(initialData.phone ?? "");
    } else {
      setName("");
      setStreet("");
      setCity("San Lorenzo");
      setProvince("SantaFe");
      setPostalCode("2200");
      setPhone("");
    }
  }, [initialData]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { name, street, city, province, postalCode, phone: phone || undefined };
    if (initialData) {
      await api.updateLocation(customerId, initialData.id, body);
    } else {
      await api.addLocation(customerId, body);
    }
    onSaved();
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <h4 style={{ margin: 0 }}>{initialData ? "✏️ Editar Planta / Sucursal" : "+ Registrar Nueva Planta / Sucursal"}</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <label>Nombre de la Planta / Depósito *<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej. Planta San Lorenzo" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Calle y Número *<input value={street} onChange={(e) => setStreet(e.target.value)} required placeholder="Av. Interurbana 4500" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Ciudad *<input value={city} onChange={(e) => setCity(e.target.value)} required style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Provincia *
          <select value={province} onChange={(e) => setProvince(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }}>
            {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Código Postal *<input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      </div>
      <label>Teléfono Directo de Planta<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3414123456" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {initialData && <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>}
        <button className="btn btn-primary">{initialData ? "Guardar Cambios" : "Agregar Planta"}</button>
      </div>
    </form>
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
  const [role, setRole] = useState(initialData?.role ?? "Commercial");
  const [locationId, setLocationId] = useState(initialData?.locationId ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [whatsApp, setWhatsApp] = useState(initialData?.whatsApp ?? "");
  const [isPrimary, setIsPrimary] = useState(initialData?.isPrimary ?? false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setRole(initialData.role);
      setLocationId(initialData.locationId ?? "");
      setEmail(initialData.email ?? "");
      setPhone(initialData.phone ?? "");
      setWhatsApp(initialData.whatsApp ?? "");
      setIsPrimary(initialData.isPrimary);
    } else {
      setName("");
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <label>Nombre y Apellido *<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej: Ing. Carlos Gómez" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Rol / Función
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }}>
            <option value="Commercial">Comercial / Compras</option>
            <option value="Technical">Técnico / Mantenimiento</option>
            <option value="Administrative">Administración / Pagos</option>
            <option value="Other">Otro</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Planta Asignada
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }}>
            <option value="">(Todas / General)</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.com" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Teléfono<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3415551234" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <label>WhatsApp Directo<input value={whatsApp} onChange={(e) => setWhatsApp(e.target.value)} placeholder="5493415551234" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "24px" }}>
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
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Código Interno / ID<input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} required placeholder="Ej. BAL-001" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Tipo de Equipo<input value={equipmentType} onChange={(e) => setEquipmentType(e.target.value)} required placeholder="Ej. Balanza Camionera" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Planta Asignada
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }}>
            <option value="">(Sin planta específica)</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Marca<input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej. Toledo" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Modelo<input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ej. 8142" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Nro. de Serie<input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
        <label>Capacidad Máx.<input value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="Ej. 60 tn" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>División de Escala<input value={divisionScale} onChange={(e) => setDivisionScale(e.target.value)} placeholder="Ej. 10 kg" style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
        <label>Intervalo Service (meses)<input type="number" value={calibrationIntervalMonths} onChange={(e) => setCalibrationIntervalMonths(Number(e.target.value))} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <label>Último Service / Calibración<input type="date" value={lastCalibrationDate} onChange={(e) => setLastCalibrationDate(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      </div>

      <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px dashed var(--surface-border)" }}>
        <strong>+ Atributos Personalizados</strong>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="Nombre del campo" style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} />
          <input value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="Valor" style={{ flex: 1, padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} />
          <button type="button" className="btn btn-outline" onClick={addCustomAttr}>+ Añadir</button>
        </div>
        {Object.keys(customAttributes).length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {Object.entries(customAttributes).map(([k, v]) => (
              <span key={k} className="badge" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {k}: {v}
                <button type="button" style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }} onClick={() => removeCustomAttr(k)}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-primary" style={{ justifySelf: "start" }}>Guardar Equipo / Activo</button>
    </form>
  );
}

function RateForm({ customerId, onCreated }: { customerId: string; onCreated: () => void }) {
  const [jurisdiction, setJurisdiction] = useState("Arba");
  const [perceptionRate, setPerceptionRate] = useState(3);
  const [retentionRate, setRetentionRate] = useState(1.5);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api.upsertRate(customerId, {
      jurisdiction,
      perceptionRate,
      retentionRate,
      hasPerceptionExclusion: false,
      hasRetentionExclusion: false
    });
    onCreated();
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "12px", alignItems: "end" }}>
      <label>Jurisdicción
        <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }}>
          <option value="Arba">ARBA (Bs.As.)</option>
          <option value="Agip">AGIP (CABA)</option>
          <option value="SantaFe">API Santa Fe</option>
          <option value="Cordoba">Rentas Córdoba</option>
        </select>
      </label>
      <label>Percepción %<input type="number" step="0.01" value={perceptionRate} onChange={(e) => setPerceptionRate(Number(e.target.value))} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      <label>Retención %<input type="number" step="0.01" value={retentionRate} onChange={(e) => setRetentionRate(Number(e.target.value))} style={{ width: "100%", padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }} /></label>
      <button className="btn btn-primary">Guardar Alícuota</button>
    </form>
  );
}

function ActivityForm({ customerId, onCreated }: { customerId: string; onCreated: () => void }) {
  const [type, setType] = useState("Note");
  const [description, setDescription] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api.logActivity({ type, description, customerId });
    setDescription("");
    onCreated();
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 16, display: "flex", gap: "10px" }}>
      <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: "8px", borderRadius: 6, border: "1px solid var(--surface-border)" }}>
        <option value="Note">Nota</option>
        <option value="Call">Llamada</option>
        <option value="Meeting">Reunión</option>
        <option value="Visit">Visita</option>
      </select>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Escribir entrada de chatter…" required style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--surface-border)" }} />
      <button className="btn btn-primary">Publicar</button>
    </form>
  );
}
