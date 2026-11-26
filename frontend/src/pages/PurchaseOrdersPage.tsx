import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseOrder } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";
import { SearchField } from "../components/ui/SearchField";
import { useDebouncedValue } from "../lib/useDebouncedValue";

export function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.listPurchaseOrders(debouncedSearch, statusFilter);
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [debouncedSearch, statusFilter]);

  const totalSpent = orders
    .filter((o) => o.status !== "Cancelled")
    .reduce((acc, o) => acc + o.total * (o.currency === "USD" ? o.exchangeRate : 1), 0);

  const pendingCount = orders.filter((o) => o.status === "Draft" || o.status === "Sent").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Órdenes de Compra a Proveedores</h1>
          <p className="muted">Gestión de adquisiciones, compras formalizadas e ingreso de mercadería</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <ExcelToolbar fileName="ordenes-de-compra" rows={orders} columns={[
            { header: "Número", key: "orderNumber" }, { header: "Proveedor", key: "supplierName" },
            { header: "Fecha", key: "issueDate" }, { header: "Estado", key: "status" },
            { header: "Moneda", key: "currency" }, { header: "Total", key: "total" },
          ]} />
          <Link to="/compras/arca" className="btn">
            📥 Importar de ARCA
          </Link>
          <Link to="/compras/ordenes/nueva" className="btn btn-primary">
            + Nueva Orden de Compra
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad">
          <div className="t-small t-strong t-info t-caps">
            Total Compras Emitidas
          </div>
          <div className="t-strong t-xl" style={{ marginTop: "4px" }}>
            $ {totalSpent.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card pad">
          <div className="t-small t-strong t-warn t-caps">
            Órdenes Pendientes / En Tránsito
          </div>
          <div className="t-strong t-warn t-xl" style={{ marginTop: "4px" }}>
            {pendingCount}
          </div>
        </div>

        <div className="card pad">
          <div className="t-small t-strong t-ok t-caps">
            Total Registradas
          </div>
          <div className="t-strong t-xl" style={{ marginTop: "4px" }}>
            {orders.length}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card filters" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar por número de orden, proveedor o CUIT"
          style={{ flex: "1 1 320px", maxWidth: 520 }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los Estados</option>
          <option value="Draft">Borrador</option>
          <option value="Sent">Enviada a Proveedor</option>
          <option value="PartiallyReceived">Recepción Parcial</option>
          <option value="Received">Recibida Completa</option>
          <option value="Cancelled">Anulada</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="card pad" style={{ marginTop: "16px" }}>
        {loading ? (
          <div className="t-center muted" style={{ padding: "20px" }}>Cargando órdenes de compra...</div>
        ) : orders.length === 0 ? (
          <div className="t-center muted" style={{ padding: "30px" }}>
            No se encontraron órdenes de compra registradas.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>N° Orden</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Moneda</th>
                <th className="t-right">Total</th>
                <th className="t-center">Estado</th>
                <th className="t-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const badgeColor =
                  o.status === "Received"
                    ? { bg: "var(--lc-ok-bg)", text: "var(--lc-ok)" }
                    : o.status === "Sent"
                    ? { bg: "var(--lc-info-bg)", text: "var(--lc-info)" }
                    : o.status === "PartiallyReceived"
                    ? { bg: "var(--lc-warn-bg)", text: "var(--lc-warn)" }
                    : o.status === "Cancelled"
                    ? { bg: "var(--lc-danger-bg)", text: "var(--lc-danger)" }
                    : { bg: "var(--lc-surface-2)", text: "var(--lc-ink-2)" };

                return (
                  <tr key={o.id}>
                    <td className="t-strong t-mono">
                      {o.orderNumber}
                    </td>
                    <td>
                      {new Date(o.issueDate).toLocaleDateString("es-AR")}
                    </td>
                    <td>
                      <div className="t-strong">{o.supplierName}</div>
                      <div className="t-small muted">CUIT: {o.supplierDocument}</div>
                    </td>
                    <td>
                      <span className="t-small t-strong" style={{ padding: "2px 6px", borderRadius: "4px", background: o.currency === "USD" ? "#ecfdf5" : "#f1f5f9", color: o.currency === "USD" ? "#065f46" : "#334155" }}>
                        {o.currency}
                      </span>
                    </td>
                    <td className="t-right t-strong t-mono">
                      {o.currency === "USD" ? "USD " : "$ "}
                      {o.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="t-center">
                      <span className="t-small t-strong" style={{ padding: "4px 10px", borderRadius: "12px", background: badgeColor.bg, color: badgeColor.text }}>
                        {o.status === "Draft" ? "Borrador" : o.status === "Sent" ? "Enviada" : o.status === "PartiallyReceived" ? "Parcial" : o.status === "Received" ? "Recibida" : "Anulada"}
                      </span>
                    </td>
                    <td className="t-right">
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <Link
                          to={`/compras/ordenes/${o.id}/imprimir`}
                          className="btn btn-outline compact"
                          title="Imprimir / Descargar PDF Oficial"
                        >
                          📄 PDF
                        </Link>
                        {o.status === "Received" ? (
                          <span className="t-small t-ok t-strong"
                            title="Mercadería 100% recibida en almacén"
                           style={{ padding: "4px 8px", borderRadius: "6px", background: "rgba(16, 185, 129, 0.15)" }}>
                            ✓ Recibida
                          </span>
                        ) : o.status === "Cancelled" ? null : (
                          <Link
                            to={`/compras/recepciones/nueva?order_id=${o.id}`}
                            className="btn compact"
                            title={o.status === "PartiallyReceived" ? "Recibir saldo restante de mercadería" : "Recibir Mercadería"}
                          >
                            {o.status === "PartiallyReceived" ? "📦 Recibir Saldo" : "📦 Recibir"}
                          </Link>
                        )}
                        {o.status !== "Cancelled" && (
                          <Link
                            to={`/compras/facturas/nueva?order_id=${o.id}`}
                            className="btn compact"
                            title="Cargar Factura Proveedor"
                          >
                            🧾 Facturar
                          </Link>
                        )}
                        {o.status !== "Cancelled" && o.status !== "Received" && (
                          <button
                            type="button"
                            className="btn btn-outline compact danger"
                            title="Anular orden de compra"
                            onClick={() => {
                              if (!window.confirm(`¿Anular la orden ${o.orderNumber}?`)) return;
                              void (async () => {
                                try {
                                  await api.updatePurchaseOrderStatus(o.id, "Cancelled");
                                  await loadData();
                                } catch (err) {
                                  console.error(err);
                                  window.alert(err instanceof Error ? err.message : "No se pudo anular la orden.");
                                }
                              })();
                            }}
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
