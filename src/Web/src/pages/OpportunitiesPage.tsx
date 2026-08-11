import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { label, type Opportunity } from "../api/types";

const stages = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

export function OpportunitiesPage() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listOpportunities().then(setItems).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  const move = async (id: string, stage: string) => {
    await api.moveOpportunity(id, stage);
    load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Embudo</h1>
          <div className="muted">Oportunidades del CRM. El presupuesto va a vivir en Ventas.</div>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(160px, 1fr))", gap: 10, overflowX: "auto" }}>
        {stages.map((stage) => (
          <section key={stage} className="card pad">
            <h3>{label(stage)}</h3>
            {items.filter((o) => o.stage === stage).map((o) => (
              <article key={o.id} className="list-item">
                <strong>{o.title}</strong>
                <div className="muted">{o.amount ? `$${o.amount}` : "sin monto"}</div>
                {o.customerId && <Link to={`/clientes/${o.customerId}`}>Ver cliente</Link>}
                <select value={o.stage} onChange={(e) => move(o.id, e.target.value)}>
                  {stages.map((s) => <option key={s}>{s}</option>)}
                </select>
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
