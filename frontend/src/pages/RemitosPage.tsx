import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Remito } from "../api/types";
import { ExcelToolbar, excelDate } from "../components/ExcelTools";

export function RemitosPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Remito[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.listRemitos(search, statusFilter)
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [search, statusFilter]);

  const totalDelivered = items.filter((i) => i.status === "Delivered").length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🚚 Remitos de Entrega y Despacho</h1>
          <p className="muted">Comprobantes oficiales de traslado y entrega de mercadería</p>
        </div>
        <div className="toolbar"><ExcelToolbar fileName="remitos" rows={items} columns={[{ key: "remitoNumber", header: "Número" }, { key: "customerId", header: "Cliente" }, { key: "status", header: "Estado" }, { key: "issueDate", header: "Fecha" }]} /><Link className="btn" to="/remitos/nuevo">
          + Nuevo Remito
        </Link></div>
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
        <div className="card">
          <span className="muted">Borradores / En Preparación</span>
          <strong>{items.filter((i) => i.status === "Draft").length}</strong>
        </div>
        <div className="card">
          <span className="muted">Total Ítems Despachados</span>
          <strong>{items.reduce((sum, r) => sum + r.items.reduce((isum, i) => isum + i.quantity, 0), 0)} u.</strong>
        </div>
      </div>

      <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 12 }}>
          <input
            placeholder="Buscar por N° Remito, Cliente, CUIT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 380 }}
          />

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 200 }}>
            <option value="All">Todos los Estados</option>
            <option value="Delivered">🟢 Entregado</option>
            <option value="Draft">🟡 Borrador</option>
            <option value="Cancelled">🔴 Anulado</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="pad muted">Cargando remitos…</p>
        ) : items.length === 0 ? (
          <p className="pad muted" style={{ textAlign: "center", padding: 32 }}>
            No hay remitos registrados. Hacé clic en <strong>"+ Nuevo Remito"</strong> o generá uno desde un Pedido de Venta.
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
                  <th>Bultos / Cantidad</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>🚚 {r.remitoNumber}</strong>
                    </td>
                    <td>{new Date(r.issueDate).toLocaleDateString()}</td>
                    <td>
                      <strong>{r.customerName}</strong>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>{r.customerDocument}</div>
                    </td>
                    <td>{r.deliveryAddress || "—"}</td>
                    <td>{r.carrierName || "Propio / En Planta"}</td>
                    <td>
                      <strong>{r.items.reduce((s, i) => s + i.quantity, 0)} u.</strong>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>({r.items.length} artículos)</div>
                    </td>
                    <td>
                      {r.status === "Delivered" && <span className="badge ok">🟢 Entregado</span>}
                      {r.status === "Draft" && <span className="badge warn">🟡 Borrador</span>}
                      {r.status === "Cancelled" && <span className="badge off">🔴 Anulado</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                          onClick={() => navigate(`/remitos/${r.id}/imprimir`)}
                        >
                          🖨️ Imprimir
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
