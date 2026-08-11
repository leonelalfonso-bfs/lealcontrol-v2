import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { label, provinces, type Activity, type CustomerDetail, type Opportunity } from "../api/types";

export function CustomerDetailPage() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [tab, setTab] = useState<"ficha" | "plantas" | "contactos" | "fiscal" | "timeline">("ficha");
  const [timeline, setTimeline] = useState<Activity[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const refresh = () => {
    if (!id) return;
    Promise.all([api.getCustomer(id), api.timeline(id), api.opportunities(id)])
      .then(([c, t, o]) => {
        setCustomer(c);
        setTimeline(t);
        setOpps(o);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => { refresh(); }, [id]);

  if (!customer) return error ? <div className="alert">{error}</div> : <p>Cargando…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{customer.legalName}</h1>
          <div className="hero-meta">
            <span>{label(customer.documentType)} {customer.documentNumber}</span>
            <span>{label(customer.taxCondition)}</span>
            <span>{label(customer.iibbRegime)}</span>
            <span className={customer.status === "Active" ? "badge" : "badge off"}>{label(customer.status)}</span>
          </div>
        </div>
        <Link className="btn ghost" to={`/clientes/${customer.id}/editar`}>Editar</Link>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="tabs">
        {(["ficha", "plantas", "contactos", "fiscal", "timeline"] as const).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "ficha" && (
        <div className="split">
          <section className="card pad">
            <p><strong>Fantasía:</strong> {customer.tradeName ?? "—"}</p>
            <p><strong>Email:</strong> {customer.email ?? "—"}</p>
            <p><strong>Teléfono:</strong> {customer.phone ?? "—"}</p>
            <p><strong>WhatsApp:</strong> {customer.whatsApp ?? "—"}</p>
            <p><strong>Domicilio fiscal:</strong> {customer.fiscalAddress
              ? `${customer.fiscalAddress.street}, ${customer.fiscalAddress.city}, ${customer.fiscalAddress.province}`
              : "—"}</p>
            <p><strong>Crédito:</strong> {customer.creditLimit ?? "—"} · {customer.paymentTermsDays ?? "—"} días</p>
          </section>
          <section className="card pad">
            <h3>Oportunidades</h3>
            {opps.map((o) => (
              <div key={o.id} className="list-item">
                <strong>{o.title}</strong>
                <div className="muted">{label(o.stage)} · {o.amount ? `$${o.amount}` : "sin monto"}</div>
              </div>
            ))}
            {opps.length === 0 && <p className="muted">Sin oportunidades todavía.</p>}
            <NewOpportunity customerId={customer.id} onCreated={refresh} />
          </section>
        </div>
      )}

      {tab === "plantas" && (
        <section className="card pad">
          {customer.locations.map((l) => (
            <div key={l.id} className="list-item">
              <strong>{l.name}</strong>
              <div className="muted">{l.address.street}, {l.address.city} · jurisdicción {l.address.province}</div>
            </div>
          ))}
          <LocationForm customerId={customer.id} onCreated={refresh} />
        </section>
      )}

      {tab === "contactos" && (
        <section className="card pad">
          {customer.contacts.map((c) => (
            <div key={c.id} className="list-item">
              <strong>{c.name}</strong> {c.isPrimary && <span className="badge">Principal</span>}
              <div className="muted">{label(c.role)} · {c.email ?? c.phone ?? c.whatsApp}</div>
            </div>
          ))}
          <ContactForm customerId={customer.id} onCreated={refresh} />
        </section>
      )}

      {tab === "fiscal" && (
        <section className="card pad">
          {customer.fiscalRates.map((r) => (
            <div key={r.jurisdiction} className="list-item">
              <strong>{label(r.jurisdiction)}</strong>
              <div className="muted">Perc. {r.perceptionRate}% · Ret. {r.retentionRate}%</div>
            </div>
          ))}
          <RateForm customerId={customer.id} onCreated={refresh} />
        </section>
      )}

      {tab === "timeline" && (
        <section className="card pad">
          <form onSubmit={async (e) => {
            e.preventDefault();
            await api.logActivity({ type: "Note", description: note, customerId: customer.id });
            setNote("");
            refresh();
          }} className="toolbar" style={{ marginBottom: 16 }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Agregar nota al hilo…" />
            <button className="btn">Registrar</button>
          </form>
          {timeline.map((a) => (
            <div key={a.id} className="list-item">
              <strong>{label(a.type)}</strong>
              <div>{a.description}</div>
              <div className="muted">{new Date(a.occurredAtUtc).toLocaleString("es-AR")}</div>
            </div>
          ))}
          {timeline.length === 0 && <p className="muted">Todavía no hay actividad.</p>}
        </section>
      )}
    </>
  );
}

function LocationForm({ customerId, onCreated }: { customerId: string; onCreated: () => void }) {
  const [name, setName] = useState("Planta");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("SantaFe");
  const [postalCode, setPostalCode] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api.addLocation(customerId, { name, street, city, province, postalCode });
    setStreet(""); setCity(""); setPostalCode("");
    onCreated();
  };

  return (
    <form onSubmit={submit} className="grid-2" style={{ marginTop: 16 }}>
      <label>Nombre planta<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Calle<input value={street} onChange={(e) => setStreet(e.target.value)} required /></label>
      <label>Ciudad<input value={city} onChange={(e) => setCity(e.target.value)} required /></label>
      <label>Provincia
        <select value={province} onChange={(e) => setProvince(e.target.value)}>
          {provinces.map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <label>CP<input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required /></label>
      <button className="btn" style={{ alignSelf: "end" }}>Agregar planta</button>
    </form>
  );
}

function ContactForm({ customerId, onCreated }: { customerId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api.addContact(customerId, { name, role: "Commercial", email, phone, isPrimary: false });
    setName(""); setEmail(""); setPhone("");
    onCreated();
  };

  return (
    <form onSubmit={submit} className="grid-3" style={{ marginTop: 16 }}>
      <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Teléfono<input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <button className="btn">Agregar contacto</button>
    </form>
  );
}

function RateForm({ customerId, onCreated }: { customerId: string; onCreated: () => void }) {
  const [jurisdiction, setJurisdiction] = useState("Arba");
  const [perceptionRate, setPerceptionRate] = useState(3);
  const [retentionRate, setRetentionRate] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api.upsertRate(customerId, {
      jurisdiction, perceptionRate, retentionRate,
      hasPerceptionExclusion: false, hasRetentionExclusion: false
    });
    onCreated();
  };

  return (
    <form onSubmit={submit} className="grid-3" style={{ marginTop: 16 }}>
      <label>Jurisdicción
        <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
          <option>Arba</option><option>Agip</option><option>ApiSantaFe</option><option>DgrCordoba</option><option>Ganancias</option>
        </select>
      </label>
      <label>Percepción %<input type="number" step="0.01" value={perceptionRate} onChange={(e) => setPerceptionRate(Number(e.target.value))} /></label>
      <label>Retención %<input type="number" step="0.01" value={retentionRate} onChange={(e) => setRetentionRate(Number(e.target.value))} /></label>
      <button className="btn">Guardar alícuota</button>
    </form>
  );
}

function NewOpportunity({ customerId, onCreated }: { customerId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await api.openOpportunity({ title, customerId, currency: "ARS" });
    setTitle("");
    onCreated();
  };
  return (
    <form onSubmit={submit} className="toolbar" style={{ marginTop: 12 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva oportunidad" required />
      <button className="btn ghost">Abrir</button>
    </form>
  );
}
