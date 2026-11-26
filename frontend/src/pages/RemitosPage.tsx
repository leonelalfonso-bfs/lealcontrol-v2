import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Remito } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";
import { SearchField } from "../components/ui/SearchField";
import { useDebouncedValue } from "../lib/useDebouncedValue";

export function RemitosPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Remito[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("All");
  const [invoiceFilter, setInvoiceFilter] = useState<"All" | "Pending" | "Invoiced">("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.listRemitos(debouncedSearch, statusFilter === "Pending" || statusFilter === "Invoiced" ? "All" : statusFilter)
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [debouncedSearch, statusFilter]);

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
          <strong className="t-ok">{totalDelivered}</strong>
        </div>
        <div
          className="card"
          style={{ cursor: "pointer" }}
          onClick={() => setInvoiceFilter(invoiceFilter === "Pending" ? "All" : "Pending")}
        >
          <span className="muted">⏳ Pendientes de Facturar</span>
          <strong className="t-warn">{totalPendingInvoice}</strong>
        </div>
        <div
          className="card"
          style={{ cursor: "pointer" }}
          onClick={() => setInvoiceFilter(invoiceFilter === "Invoiced" ? "All" : "Invoiced")}
        >
          <span className="muted">✓ Facturados</span>
          <strong className="t-accent">{totalInvoiced}</strong>
        </div>
      </div>

      <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div className="row" style={{ gap: 12, flex: 1, minWidth: 280 }}>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar por número, cliente o CUIT"
            style={{ flex: "1 1 320px", maxWidth: 520 }}
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
          <p className="pad muted t-center" style={{ padding: 32 }}>
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
                  <th className="t-right">Acciones</th>
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
                          <div className="muted t-small">
                            Desde Pedido
                          </div>
                        )}
                      </td>
                      <td>{new Date(r.issueDate).toLocaleDateString()}</td>
                      <td>
                        <strong>{r.customerName}</strong>
                        <div className="muted t-small">{r.customerDocument}</div>
                      </td>
                      <td>{r.deliveryAddress || "—"}</td>
                      <td>{r.carrierName || "Propio / En Planta"}</td>
                      <td>
                        <strong>{Math.round(r.items.reduce((s, i) => s + i.quantity, 0))} u.</strong>
                        <div className="muted t-small">({r.items.length} artículos)</div>
                      </td>
                      <td>
                        {r.status === "Delivered" && <span className="badge ok">🟢 Entregado</span>}
                        {r.status === "Draft" && <span className="badge warn">🟡 Borrador</span>}
                        {r.status === "Cancelled" && <span className="badge off">🔴 Anulado</span>}
                      </td>
                      <td>
                        {isInvoiced ? (
                          <span
                            className="badge ok t-accent t-strong t-small"
                            style={{ background: "rgba(13, 148, 136, 0.12)" }}
                          >
                            ✓ Factura {r.invoiceNumber || "Emitida"}
                          </span>
                        ) : isDelivered ? (
                          <span
                            className="badge warn t-warn t-strong t-small"
                            style={{ background: "rgba(245, 158, 11, 0.15)" }}
                          >
                            ⏳ Facturación Pendiente
                          </span>
                        ) : (
                          <span className="muted t-small">—</span>
                        )}
                      </td>
                      <td className="t-right">
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          {isDelivered && (
                            <button
                              type="button"
                              className="btn ghost compact"
                              onClick={() => navigate("/remitos/" + r.id + "/devoluciones")}
                              title={isInvoiced ? "Consultar devoluciones anteriores" : "Registrar devolución antes de facturar"}
                            >
                              ↩ Devoluciones
                            </button>
                          )}
                          {!isInvoiced && isDelivered && (
                            <button
                              type="button"
                              className="btn btn-primary compact"
                              onClick={() => navigate(`/facturas/nueva?remito_id=${r.id}`)}
                              title="Emitir Factura de Venta vinculada a este remito"
                            >
                              📄 Facturar Remito
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn ghost compact"
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
