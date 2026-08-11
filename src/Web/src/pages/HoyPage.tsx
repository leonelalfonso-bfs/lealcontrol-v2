import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { label, type CustomerSummary, type Lead } from "../api/types";

export function HoyPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listCustomers(), api.listLeads()])
      .then(([page, openLeads]) => {
        setCustomers(page.items);
        setLeads(openLeads);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hoy</h1>
          <div className="muted">El día comercial, sin ruido.</div>
        </div>
        <Link className="btn" to="/clientes/nuevo">Nuevo cliente</Link>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="kpi">
        <div className="card"><span className="muted">Clientes</span><strong>{customers.length}</strong></div>
        <div className="card"><span className="muted">Prospectos abiertos</span><strong>{leads.length}</strong></div>
        <div className="card"><span className="muted">Módulo</span><strong>CRM</strong></div>
      </div>
      <div className="split">
        <section className="card pad">
          <h3>Últimos clientes</h3>
          {customers.slice(0, 6).map((c) => (
            <Link key={c.id} to={`/clientes/${c.id}`} className="list-item">
              <strong>{c.legalName}</strong>
              <div className="muted">{c.documentNumber} · {label(c.taxCondition)}</div>
            </Link>
          ))}
          {customers.length === 0 && <p className="muted">Todavía no hay clientes.</p>}
        </section>
        <section className="card pad">
          <h3>Prospectos para hoy</h3>
          {leads.slice(0, 6).map((l) => (
            <div key={l.id} className="list-item">
              <strong>{l.name}</strong>
              <div className="muted">{label(l.source)} · {l.contactName ?? "sin contacto"}</div>
            </div>
          ))}
          {leads.length === 0 && <p className="muted">No hay prospectos abiertos.</p>}
        </section>
      </div>
    </>
  );
}
