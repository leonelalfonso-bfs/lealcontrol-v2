import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseOrder } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.listPurchaseOrders(search, statusFilter);
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, statusFilter]);

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
            { header: "Número", key: "number" }, { header: "Proveedor", key: "supplierName" },
            { header: "Fecha", key: "issueDate" }, { header: "Estado", key: "status" },
            { header: "Moneda", key: "currency" }, { header: "Total", key: "total" },
          ]} />
          <Link to="/compras/arca" className="btn" style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", color: "white" }}>
            📥 Importar de ARCA
          </Link>
          <Link to="/compras/ordenes/nueva" className="btn btn-primary">
            + Nueva Orden de Compra
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(2, 132, 199, 0.05))" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: "bold", color: "#0369a1", textTransform: "uppercase" }}>
            Total Compras Emitidas
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "bold", marginTop: "4px" }}>
            $ {totalSpent.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.05))" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: "bold", color: "#b45309", textTransform: "uppercase" }}>
            Órdenes Pendientes / En Tránsito
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "bold", marginTop: "4px", color: "#b45309" }}>
            {pendingCount}
          </div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.05))" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: "bold", color: "#047857", textTransform: "uppercase" }}>
            Total Registradas
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "bold", marginTop: "4px" }}>
            {orders.length}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card filters" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar por N° de orden, proveedor o CUIT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
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
          <div style={{ padding: "20px", textAlign: "center", color: "var(--ink-soft)" }}>Cargando órdenes de compra...</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: "var(--ink-soft)" }}>
            No se encontraron órdenes de compra registradas.
          </div>
        ) : (
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                <th style={{ padding: "10px 8px" }}>N° Orden</th>
                <th style={{ padding: "10px 8px" }}>Fecha</th>
                <th style={{ padding: "10px 8px" }}>Proveedor</th>
                <th style={{ padding: "10px 8px" }}>Moneda</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Total</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Estado</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const badgeColor =
                  o.status === "Received"
                    ? { bg: "#ecfdf5", text: "#047857" }
                    : o.status === "Sent"
                    ? { bg: "#eff6ff", text: "#1d4ed8" }
                    : o.status === "PartiallyReceived"
                    ? { bg: "#fffbeb", text: "#b45309" }
                    : o.status === "Cancelled"
                    ? { bg: "#fef2f2", text: "#b91c1c" }
                    : { bg: "#f1f5f9", text: "#475569" };

                return (
                  <tr key={o.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <td style={{ padding: "12px 8px", fontWeight: "bold", fontFamily: "monospace" }}>
                      {o.orderNumber}
                    </td>
                    <td style={{ padding: "12px 8px", fontSize: "0.9rem" }}>
                      {new Date(o.issueDate).toLocaleDateString("es-AR")}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ fontWeight: 600 }}>{o.supplierName}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>CUIT: {o.supplierDocument}</div>
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", background: o.currency === "USD" ? "#ecfdf5" : "#f1f5f9", color: o.currency === "USD" ? "#065f46" : "#334155" }}>
                        {o.currency}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "bold", fontFamily: "monospace" }}>
                      {o.currency === "USD" ? "USD " : "$ "}
                      {o.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      <span style={{ padding: "4px 10px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "bold", background: badgeColor.bg, color: badgeColor.text }}>
                        {o.status === "Draft" ? "Borrador" : o.status === "Sent" ? "Enviada" : o.status === "PartiallyReceived" ? "Parcial" : o.status === "Received" ? "Recibida" : "Anulada"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        <Link
                          to={`/compras/ordenes/${o.id}/imprimir`}
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                          title="Imprimir / Descargar PDF Oficial"
                        >
                          📄 PDF
                        </Link>
                        {o.status === "Received" ? (
                          <span
                            style={{
                              fontSize: "0.78rem",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "#065f46",
                              fontWeight: 700
                            }}
                            title="Mercadería 100% recibida en almacén"
                          >
                            ✓ Recibida
                          </span>
                        ) : o.status === "Cancelled" ? null : (
                          <Link
                            to={`/compras/recepciones/nueva?order_id=${o.id}`}
                            className="btn"
                            style={{
                              padding: "4px 8px",
                              fontSize: "0.82rem",
                              background: o.status === "PartiallyReceived" ? "#f59e0b" : "#10b981",
                              color: "white"
                            }}
                            title={o.status === "PartiallyReceived" ? "Recibir saldo restante de mercadería" : "Recibir Mercadería"}
                          >
                            {o.status === "PartiallyReceived" ? "📦 Recibir Saldo" : "📦 Recibir"}
                          </Link>
                        )}
                        {o.status !== "Cancelled" && (
                          <Link
                            to={`/compras/facturas/nueva?order_id=${o.id}`}
                            className="btn"
                            style={{ padding: "4px 8px", fontSize: "0.82rem", background: "#3b82f6", color: "white" }}
                            title="Cargar Factura Proveedor"
                          >
                            🧾 Facturar
                          </Link>
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
