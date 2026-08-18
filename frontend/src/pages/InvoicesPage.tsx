import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Invoice } from "../api/types";
import { ExcelToolbar, excelDate, excelNumber } from "../components/ExcelTools";

export function InvoicesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.listInvoices(search, statusFilter, typeFilter)
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [search, statusFilter, typeFilter]);

  const handleAuthorizeArca = async (inv: Invoice) => {
    try {
      setAuthorizingId(inv.id);
      setError(null);
      await api.authorizeInvoiceArca(inv.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al autorizar con ARCA");
    } finally {
      setAuthorizingId(null);
    }
  };

  const totalAuthorized = items.filter((i) => i.status === "Authorized").length;
  const totalArs = items.filter((i) => i.currency === "ARS").reduce((s, i) => s + i.total, 0);
  const totalUsd = items.filter((i) => i.currency === "USD").reduce((s, i) => s + i.total, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>📄 Facturación Electrónica ARCA</h1>
          <p className="muted">Comprobantes fiscales autorizados, CAE oficial y QR ARCA</p>
        </div>
        <div className="toolbar"><ExcelToolbar fileName="facturas-venta" rows={items} columns={[{ key: "formattedNumber", header: "Número" }, { key: "customerId", header: "Cliente" }, { key: "issueDate", header: "Fecha" }, { key: "status", header: "Estado" }, { key: "total", header: "Total" }]} /><Link className="btn" to="/facturas/nueva">
          + Nueva Factura
        </Link></div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="kpi kpi-4">
        <div className="card">
          <span className="muted">Total Comprobantes</span>
          <strong>{items.length}</strong>
        </div>
        <div className="card">
          <span className="muted">Autorizadas con CAE (ARCA)</span>
          <strong style={{ color: "#065f46" }}>{totalAuthorized}</strong>
        </div>
        <div className="card">
          <span className="muted">Total Facturado (ARS)</span>
          <strong>$ {totalArs.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
        </div>
        <div className="card">
          <span className="muted">Total Facturado (USD)</span>
          <strong style={{ color: "#2563eb" }}>USD {totalUsd.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
        </div>
      </div>

      <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 12 }}>
          <input
            placeholder="Buscar por N° Comprobante, Cliente, CUIT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 350 }}
          />

          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 170 }}>
            <option value="All">Todos los Tipos</option>
            <option value="A">Factura A</option>
            <option value="B">Factura B</option>
            <option value="C">Factura C</option>
            <option value="M">Factura M</option>
            <option value="NC_A">Nota de Crédito A</option>
            <option value="NC_B">Nota de Crédito B</option>
            <option value="Proforma">Proforma / Interna</option>
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 170 }}>
            <option value="All">Todos los Estados</option>
            <option value="Authorized">🟢 CAE Autorizado</option>
            <option value="Draft">🟡 Borrador</option>
            <option value="Rejected">🔴 Rechazado ARCA</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="pad muted">Cargando comprobantes…</p>
        ) : items.length === 0 ? (
          <p className="pad muted" style={{ textAlign: "center", padding: 32 }}>
            No hay facturas registradas. Hacé clic en <strong>"+ Nueva Factura"</strong> o emití una desde un Pedido/Remito.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo / N° Comprobante</th>
                  <th>Fecha Emisión</th>
                  <th>Cliente / Receptor</th>
                  <th>Moneda</th>
                  <th>Subtotal Neto</th>
                  <th>IVA / Percep.</th>
                  <th>Total Facturado</th>
                  <th>Estado ARCA / CAE</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <strong>Factura {inv.invoiceType}</strong>
                      <div className="muted">{inv.formattedNumber}</div>
                    </td>
                    <td>{new Date(inv.issueDate).toLocaleDateString()}</td>
                    <td>
                      <strong>{inv.customerName}</strong>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>{inv.customerDocument}</div>
                    </td>
                    <td>
                      <span className={`badge ${inv.currency === "USD" ? "prio-high" : "ok"}`}>
                        {inv.currency}
                      </span>
                      {inv.currency === "USD" && (
                        <div className="muted" style={{ fontSize: "0.75rem" }}>TC: ${inv.exchangeRate}</div>
                      )}
                    </td>
                    <td>
                      {inv.currency === "USD" ? "USD " : "$ "}
                      {inv.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <div style={{ fontSize: "0.82rem" }}>
                        IVA: {inv.currency === "USD" ? "USD " : "$ "}
                        {(inv.iva21 + inv.iva105 + inv.iva27).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td>
                      <strong>
                        {inv.currency === "USD" ? "USD " : "$ "}
                        {inv.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </strong>
                    </td>
                    <td>
                      {inv.status === "Authorized" ? (
                        <div>
                          <span className="badge ok">🟢 CAE {inv.cae}</span>
                          {inv.caeDueDate && (
                            <div className="muted" style={{ fontSize: "0.75rem" }}>
                              Vto: {new Date(inv.caeDueDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : inv.status === "Draft" ? (
                        <span className="badge warn">🟡 Borrador</span>
                      ) : (
                        <span className="badge off">🔴 Rechazado</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {inv.status === "Draft" && (
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: "4px 8px", fontSize: "0.8rem", background: "linear-gradient(180deg, #059669, #047857)" }}
                            onClick={() => handleAuthorizeArca(inv)}
                            disabled={authorizingId === inv.id}
                          >
                            {authorizingId === inv.id ? "⌛ ARCA…" : "⚡ CAE ARCA"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                          onClick={() => navigate(`/facturas/${inv.id}/imprimir`)}
                        >
                          🖨️ PDF / QR
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
