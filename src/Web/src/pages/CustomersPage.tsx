import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { label, type CustomerSummary } from "../api/types";

export function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = (term = search) => {
    api.listCustomers(term)
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => { load(""); }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clientes</h1>
          <div className="muted">{total} en este tenant</div>
        </div>
        <Link className="btn" to="/clientes/nuevo">Nuevo cliente</Link>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <input
          placeholder="Buscar por razón social, CUIT, email o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          style={{ maxWidth: 420 }}
        />
        <button className="btn ghost" onClick={() => load()}>Buscar</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Documento</th>
              <th>IVA</th>
              <th>Contacto</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/clientes/${c.id}`)}>
                <td>
                  <strong>{c.legalName}</strong>
                  {c.tradeName && <div className="muted">{c.tradeName}</div>}
                </td>
                <td>{label(c.documentType)} {c.documentNumber}</td>
                <td>{label(c.taxCondition)}</td>
                <td>{c.email ?? c.phone ?? "—"}</td>
                <td><span className={c.status === "Active" ? "badge" : "badge off"}>{label(c.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="pad muted">No hay resultados.</p>}
      </div>
    </>
  );
}
