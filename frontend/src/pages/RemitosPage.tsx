import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Remito } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export function RemitosPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Remito[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [invoiceFilter, setInvoiceFilter] = useState<"All" | "Pending" | "Invoiced">("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.listRemitos(search, statusFilter === "Pending" || statusFilter === "Invoiced" ? "All" : statusFilter)
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [search, statusFilter]);

  const filteredItems = items.filter((r) => {
    if (invoiceFilter === "Pending") {
      return !r.invoiceId && r.status === "Delivered";
    }
    if (invoiceFilter === "Invoiced") {
      return !!r.invoiceId;
    }
    return true;
  });

  const totalDelivered = items.filter((i) => i.status === "Delivered").length;
  const totalPendingInvoice = items.filter((i) => i.status === "Delivered" && !i.invoiceId).length;
  const totalInvoiced = items.filter((i) => !!i.invoiceId).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🚚 Remitos de Entrega y Despacho</h1>
          <p className="muted">Comprobantes oficiales de traslado y entrega de mercadería</p>
        </div>
        <div className="toolbar">
          <ExcelToolbar
            fileName="remitos"
            rows={filteredItems}
            columns={[
              { key: "remitoNumber", header: "Número" },
              { key: "customerName", header: "Cliente" },
              { key: "status", header: "Estado" },
              { key: "invoiceNumber", header: "Factura" },
              { key: "issueDate", header: "Fecha" }
            ]}
          />
          <Link className="btn" to="/remitos/nuevo">
            + Nuevo Remito
          </Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="kpi kpi-4">
        <div className="card">
          <span className="muted">Total Remitos</span>
          <strong>{items.length}</strong>
        </div>
        <div className="card">
          <span className="muted">Entregados / Despachados</span>
          <strong style={{ color: "#065f46" }}>{totalDelivered}</strong>
        </div>
        <div
          className="card"
          style={{
            cursor: "pointer",
            border: invoiceFilter === "Pending" ? "2px solid #f59e0b" : "1px solid var(--surface-border)",
            background: invoiceFilter === "Pending" ? "rgba(245, 158, 11, 0.05)" : "inherit"
          }}
          onClick={() => setInvoiceFilter(invoiceFilter === "Pending" ? "All" : "Pending")}
        >
          <span className="muted">⏳ Pendientes de Facturar</span>
          <strong style={{ color: "#d97706" }}>{totalPendingInvoice}</strong>
        </div>
        <div
          className="card"
          style={{
            cursor: "pointer",
            border: invoiceFilter === "Invoiced" ? "2px solid #0d9488" : "1px solid var(--surface-border)",
            background: invoiceFilter === "Invoiced" ? "rgba(13, 148, 136, 0.05)" : "inherit"
          }}
          onClick={() => setInvoiceFilter(invoiceFilter === "Invoiced" ? "All" : "Invoiced")}
        >
          <span className="muted">✓ Facturados</span>
          <strong style={{ color: "#0d9488" }}>{totalInvoiced}</strong>
        </div>
      </div>

      <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div className="row" style={{ gap: 12, flex: 1, minWidth: 280 }}>
          <input
            placeholder="Buscar por N° Remito, Cliente, CUIT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 360, width: "100%" }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 170 }}
          >
            <option value="All">Todos los Estados</option>
            <option value="Delivered">🟢 Entregado</option>
            <option value="Draft">🟡 Borrador</option>
            <option value="Cancelled">🔴 Anulado</option>
          </select>

          <select
            value={invoiceFilter}
            onChange={(e) => setInvoiceFilter(e.target.value as any)}
            style={{ width: 200 }}
          >
            <option value="All">Todos (Facturados y Pend.)</option>
            <option value="Pending">⏳ Solo Pendientes de Facturar</option>
            <option value="Invoiced">✓ Solo Facturados</option>
          </select>
        </div>

        {invoiceFilter !== "All" && (
          <button
            type="button"
            className="btn ghost compact"
            onClick={() => setInvoiceFilter("All")}
          >
            ✕ Limpiar filtro facturación
          </button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <p className="pad muted">Cargando remitos…</p>
        ) : filteredItems.length === 0 ? (
          <p className="pad muted" style={{ textAlign: "center", padding: 32 }}>
            No se encontraron remitos con los filtros aplicados. Hacé clic en <strong>"+ Nuevo Remito"</strong> para registrar una entrega.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N° Remito</th>
                  <th>Fecha Emisión</th>
                  <th>Cliente / Destinatario</th>
                  <th>Dirección de Entrega</th>
                  <th>Transportista</th>
                  <th>Bultos / Cant.</th>
                  <th>Estado Entrega</th>
                  <th>Estado Facturación</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((r) => {
                  const isInvoiced = !!r.invoiceId;
                  const isDelivered = r.status === "Delivered";

                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>🚚 {r.remitoNumber}</strong>
                        {r.orderId && (
                          <div className="muted" style={{ fontSize: "0.72rem" }}>
                            Desde Pedido
                          </div>
                        )}
                      </td>
                      <td>{new Date(r.issueDate).toLocaleDateString()}</td>
                      <td>
                        <strong>{r.customerName}</strong>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>{r.customerDocument}</div>
                      </td>
                      <td>{r.deliveryAddress || "—"}</td>
                      <td>{r.carrierName || "Propio / En Planta"}</td>
                      <td>
                        <strong>{Math.round(r.items.reduce((s, i) => s + i.quantity, 0))} u.</strong>
                        <div className="muted" style={{ fontSize: "0.75rem" }}>({r.items.length} artículos)</div>
                      </td>
                      <td>
                        {r.status === "Delivered" && <span className="badge ok">🟢 Entregado</span>}
                        {r.status === "Draft" && <span className="badge warn">🟡 Borrador</span>}
                        {r.status === "Cancelled" && <span className="badge off">🔴 Anulado</span>}
                      </td>
                      <td>
                        {isInvoiced ? (
                          <span
                            className="badge ok"
                            style={{
                              background: "rgba(13, 148, 136, 0.12)",
                              color: "#0f766e",
                              fontWeight: 700,
                              fontSize: "0.78rem"
                            }}
                          >
                            ✓ Factura {r.invoiceNumber || "Emitida"}
                          </span>
                        ) : isDelivered ? (
                          <span
                            className="badge warn"
                            style={{
                              background: "rgba(245, 158, 11, 0.15)",
                              color: "#b45309",
                              fontWeight: 700,
                              fontSize: "0.78rem"
                            }}
                          >
                            ⏳ Facturación Pendiente
                          </span>
                        ) : (
                          <span className="muted" style={{ fontSize: "0.78rem" }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          {!isInvoiced && isDelivered && (
                            <button
                              type="button"
                              className="btn btn-primary compact"
                              style={{ padding: "4px 10px", fontSize: "0.8rem", fontWeight: 700 }}
                              onClick={() => navigate(`/facturas/nueva?remito_id=${r.id}`)}
                              title="Emitir Factura de Venta vinculada a este remito"
                            >
                              📄 Facturar Remito
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn ghost compact"
                            style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                            onClick={() => navigate(`/remitos/${r.id}/imprimir`)}
                          >
                            🖨️ Imprimir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
