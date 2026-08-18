import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { label, type CustomerSummary } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export function SuppliersPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CustomerSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (term = search) => {
    setLoading(true);
    api.listCustomers(term)
      .then((page) => {
        // Filter entities that have isSupplier = true
        const suppliers = page.items.filter((c) => c.isSupplier);
        setItems(suppliers);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load("");
  }, []);

  const totalBoth = items.filter((i) => i.isCustomer && i.isSupplier).length;
  const totalRi = items.filter((i) => i.taxCondition === "ResponsableInscripto").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🏢 Proveedores Comercial</h1>
          <p className="muted">Ficha unificada de registro comercial, fiscal y compras</p>
        </div>
        <div className="toolbar"><ExcelToolbar fileName="proveedores" rows={items} columns={[{ key: "legalName", header: "Razón social" }, { key: "tradeName", header: "Nombre comercial" }, { key: "documentNumber", header: "CUIT" }, { key: "taxCondition", header: "Condición IVA" }, { key: "email", header: "Email" }, { key: "phone", header: "Teléfono" }]} templateColumns={["legalName", "tradeName", "documentType", "documentNumber", "taxCondition", "email", "phone"]} onImport={rows => { void Promise.all(rows.map(row => api.createCustomer({ legalName: String(row.legalName || ""), tradeName: String(row.tradeName || "") || null, documentType: String(row.documentType || "CUIT"), documentNumber: String(row.documentNumber || ""), taxCondition: String(row.taxCondition || "ResponsableInscripto"), iibbRegime: "NoInscripto", isCustomer: false, isSupplier: true, email: String(row.email || "") || null, phone: String(row.phone || "") || null }))).then(() => load()).catch(e => setError(e instanceof Error ? e.message : "Error al importar proveedores.")); }} /><Link className="btn" to="/clientes/nuevo?type=supplier">
          + Nuevo Proveedor
        </Link></div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="kpi kpi-4">
        <div className="card">
          <span className="muted">Total Proveedores</span>
          <strong>{items.length}</strong>
        </div>
        <div className="card">
          <span className="muted">Clientes y Proveedores</span>
          <strong style={{ color: "#2563eb" }}>{totalBoth} (Cuenta Corriente)</strong>
        </div>
        <div className="card">
          <span className="muted">Resp. Inscriptos</span>
          <strong>{totalRi}</strong>
        </div>
        <div className="card">
          <span className="muted">Monotributo / Otros</span>
          <strong>{items.length - totalRi}</strong>
        </div>
      </div>

      <div className="card pad toolbar" style={{ marginBottom: 20 }}>
        <input
          placeholder="Buscar por Razón Social, CUIT, email o teléfono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          style={{ maxWidth: 420 }}
        />
        <button type="button" className="btn ghost" onClick={() => load()}>
          Buscar
        </button>
      </div>

      <div className="card">
        {loading ? (
          <p className="pad muted">Cargando proveedores…</p>
        ) : items.length === 0 ? (
          <p className="pad muted" style={{ textAlign: "center", padding: 32 }}>
            No hay proveedores registrados. Hacé clic en <strong>"+ Nuevo Proveedor"</strong> para dar de alta.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proveedor / Razón Social</th>
                  <th>CUIT / Tipo</th>
                  <th>Condición IVA</th>
                  <th>Rol / Cuenta Corriente</th>
                  <th>Teléfono / Email</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/clientes/${s.id}`}>
                        <strong>🏢 {s.legalName}</strong>
                      </Link>
                    </td>
                    <td>
                      {label(s.documentType)} {s.documentNumber}
                    </td>
                    <td>
                      <span className="badge ok">{label(s.taxCondition)}</span>
                    </td>
                    <td>
                      {s.isCustomer && s.isSupplier ? (
                        <span className="badge ok" style={{ background: "#dbeafe", color: "#1e40af" }} title="Comparte cuenta corriente unificada de cliente y proveedor">
                          🤝 Cliente y Proveedor
                        </span>
                      ) : (
                        <span className="badge ok" style={{ background: "#fef3c7", color: "#92400e" }}>
                          🏢 Proveedor Exclusivo
                        </span>
                      )}
                    </td>
                    <td>
                      {s.phone && <div>📞 {s.phone}</div>}
                      {s.email && <div className="muted" style={{ fontSize: "0.8rem" }}>✉️ {s.email}</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                          onClick={() => navigate(`/clientes/${s.id}`)}
                        >
                          👁️ Ficha
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                          onClick={() => navigate(`/clientes/${s.id}/editar`)}
                        >
                          ✏️ Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
