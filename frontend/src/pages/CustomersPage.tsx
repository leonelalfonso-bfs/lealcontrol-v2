import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { label, type CustomerSummary } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = (term = search) => {
    api.listCustomers(term, "customer")
      .then((page) => {
        setItems(page.items);
        setTotal(page.total ?? 0);
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
        <div className="toolbar"><ExcelToolbar fileName="clientes" rows={items} columns={[{ key: "legalName", header: "Razón social" }, { key: "tradeName", header: "Nombre comercial" }, { key: "documentNumber", header: "Documento" }, { key: "email", header: "Email" }, { key: "phone", header: "Teléfono" }, { key: "status", header: "Estado" }]} templateColumns={["legalName", "tradeName", "documentType", "documentNumber", "taxCondition", "email", "phone"]} onImport={rows => { void Promise.all(rows.map(row => api.createCustomer({ legalName: String(row.legalName || row.RazónSocial || ""), tradeName: String(row.tradeName || "") || null, documentType: String(row.documentType || "CUIT"), documentNumber: String(row.documentNumber || ""), taxCondition: String(row.taxCondition || "ConsumidorFinal"), iibbRegime: "NoInscripto", isCustomer: true, isSupplier: false, email: String(row.email || "") || null, phone: String(row.phone || "") || null }))).then(() => load()).catch(e => setError(e instanceof Error ? e.message : "Error al importar clientes.")); }} /><Link className="btn" to="/clientes/nuevo">Nuevo cliente</Link></div>
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
