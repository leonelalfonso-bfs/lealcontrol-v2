import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { label, type CustomerSummary } from "../api/types";

type DirectoryFilter = "all" | "customers" | "suppliers" | "both";

export function DirectoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CustomerSummary[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (term = search) => {
    setLoading(true);
    api.listCustomers(term)
      .then((page) => setItems(page.items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(""); }, []);

  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter === "customers") return item.isCustomer;
    if (filter === "suppliers") return item.isSupplier;
    if (filter === "both") return item.isCustomer && item.isSupplier;
    return true;
  }), [filter, items]);

  const customers = items.filter((item) => item.isCustomer).length;
  const suppliers = items.filter((item) => item.isSupplier).length;
  const both = items.filter((item) => item.isCustomer && item.isSupplier).length;

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Directorio</h1>
          <p className="muted">Empresas, clientes, proveedores y contactos comerciales en un solo registro.</p>
        </div>
        <div className="toolbar">
          <Link className="btn ghost" to="/clientes/nuevo?type=supplier&returnUrl=/directorio">Nuevo proveedor</Link>
          <Link className="btn" to="/clientes/nuevo?returnUrl=/directorio">Nueva empresa</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="kpi kpi-4">
        <button className={`card directory-kpi ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          <span className="muted">Empresas registradas</span><strong>{items.length}</strong>
        </button>
        <button className={`card directory-kpi ${filter === "customers" ? "active" : ""}`} onClick={() => setFilter("customers")}>
          <span className="muted">Clientes</span><strong>{customers}</strong>
        </button>
        <button className={`card directory-kpi ${filter === "suppliers" ? "active" : ""}`} onClick={() => setFilter("suppliers")}>
          <span className="muted">Proveedores</span><strong>{suppliers}</strong>
        </button>
        <button className={`card directory-kpi ${filter === "both" ? "active" : ""}`} onClick={() => setFilter("both")}>
          <span className="muted">Doble relación</span><strong>{both}</strong>
        </button>
      </div>

      <div className="card pad toolbar" style={{ marginBottom: 18 }}>
        <input
          placeholder="Buscar por empresa, CUIT, email o teléfono"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && load()}
          style={{ maxWidth: 460 }}
        />
        <button type="button" className="btn ghost" onClick={() => load()}>Buscar</button>
        <div className="directory-filter" aria-label="Filtrar directorio">
          {(["all", "customers", "suppliers", "both"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`tab-btn ${filter === option ? "active" : ""}`}
              onClick={() => setFilter(option)}
            >
              {option === "all" ? "Todos" : option === "customers" ? "Clientes" : option === "suppliers" ? "Proveedores" : "Doble relación"}
            </button>
          ))}
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Documento</th>
              <th>Relación</th>
              <th>Condición fiscal</th>
              <th>Contacto</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id} onClick={() => navigate(`/clientes/${item.id}?returnUrl=/directorio`)}>
                <td><strong>{item.legalName}</strong>{item.tradeName && <div className="muted">{item.tradeName}</div>}</td>
                <td>{label(item.documentType)} {item.documentNumber}</td>
                <td>
                  {item.isCustomer && <span className="badge ok">Cliente</span>}
                  {item.isSupplier && <span className="badge warn" style={{ marginLeft: item.isCustomer ? 6 : 0 }}>Proveedor</span>}
                </td>
                <td>{label(item.taxCondition)}</td>
                <td>{item.email ?? item.phone ?? "—"}</td>
                <td><Link className="btn ghost" to={`/clientes/${item.id}?returnUrl=/directorio`} onClick={(event) => event.stopPropagation()}>Ver ficha</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && visibleItems.length === 0 && <p className="pad muted">No hay empresas para este filtro.</p>}
        {loading && <p className="pad muted">Cargando directorio…</p>}
      </div>
    </div>
  );
}
