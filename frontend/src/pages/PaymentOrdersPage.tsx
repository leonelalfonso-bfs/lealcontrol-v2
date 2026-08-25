import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { PaymentOrder } from "../api/types";

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);

export function PaymentOrdersPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listPaymentOrders();
      setOrders(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las órdenes de pago.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredOrders = orders.filter((o) => {
    const q = query.toLowerCase().trim();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.supplierName.toLowerCase().includes(q) ||
      (o.supplierTaxId && o.supplierTaxId.includes(q)) ||
      (o.notes && o.notes.toLowerCase().includes(q))
    );
  });

  const totalPaid = orders.reduce((sum, o) => sum + (o.amount || 0), 0);

  return (
    <div className="page-wide">
      {/* Header */}
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · TESORERÍA & COMPRAS</span>
          <h1>Órdenes de Pago a Proveedores</h1>
          <p className="muted">
            Registro, cancelación de facturas de compra y emisión de órdenes de pago con cheques, transferencias y retenciones.
          </p>
        </div>
        <div className="toolbar" style={{ gap: 10 }}>
          <button className="btn btn-outline" onClick={() => void loadData()} disabled={loading}>
            ↻ Actualizar
          </button>
          <Link className="btn btn-outline" to="/finanzas/cuenta-corriente">
            🏢 Cuentas Corrientes
          </Link>
          <Link className="btn" to="/finanzas/pagos/nueva">
            💳 + Nueva Orden de Pago
          </Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* Summary KPI Cards */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="card pad" style={{ borderLeft: "4px solid #10b981" }}>
          <span className="muted" style={{ fontSize: "0.82rem", textTransform: "uppercase", fontWeight: 700 }}>
            Total Pagos Emitidos
          </span>
          <h2 style={{ margin: "6px 0 0 0", color: "#059669", fontSize: "1.6rem" }}>
            {money(totalPaid)}
          </h2>
          <small className="muted">{orders.length} órdenes registradas</small>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #3b82f6" }}>
          <span className="muted" style={{ fontSize: "0.82rem", textTransform: "uppercase", fontWeight: 700 }}>
            Proveedores Abonados
          </span>
          <h2 style={{ margin: "6px 0 0 0", color: "#2563eb", fontSize: "1.6rem" }}>
            {new Set(orders.map((o) => o.supplierName)).size}
          </h2>
          <small className="muted">Destinatarios únicos de pagos</small>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #f59e0b" }}>
          <span className="muted" style={{ fontSize: "0.82rem", textTransform: "uppercase", fontWeight: 700 }}>
            Acceso Rápido
          </span>
          <div style={{ marginTop: 8 }}>
            <Link className="btn btn-sm" to="/finanzas/pagos/nueva" style={{ width: "100%", textAlign: "center" }}>
              + Cargar Pago a Proveedor
            </Link>
          </div>
        </div>
      </div>

      {/* Orders List Card */}
      <section className="card pad">
        <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <label style={{ flex: 1, minWidth: 280 }}>
            Buscar orden de pago
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Número de OP, proveedor, CUIT o concepto..."
            />
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Número OP</th>
                <th>Fecha de Pago</th>
                <th>Proveedor</th>
                <th>CUIT</th>
                <th>Facturas Imputadas</th>
                <th style={{ textAlign: "right" }}>Importe Total</th>
                <th>Estado</th>
                <th style={{ textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    {loading
                      ? "Cargando órdenes de pago..."
                      : "No se encontraron órdenes de pago registradas."}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong style={{ color: "#2563eb" }}>{o.orderNumber}</strong>
                    </td>
                    <td>{new Date(o.paymentDateUtc).toLocaleDateString("es-AR")}</td>
                    <td>
                      <strong>{o.supplierName}</strong>
                      {o.notes && (
                        <small className="muted" style={{ display: "block", fontSize: "0.76rem" }}>
                          {o.notes}
                        </small>
                      )}
                    </td>
                    <td>
                      <code>{o.supplierTaxId || "—"}</code>
                    </td>
                    <td>
                      {o.invoicesCount && o.invoicesCount > 0 ? (
                        <span className="badge" title={o.invoicesSummary || ""}>
                          📄 {o.invoicesCount} {o.invoicesCount === 1 ? "factura" : "facturas"}
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: "0.8rem" }}>
                          Pago a cuenta
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "#059669" }}>
                      {money(o.amount, o.currency)}
                    </td>
                    <td>
                      <span
                        className="badge ok"
                        style={{
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#065f46",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 12,
                          fontSize: "0.78rem"
                        }}
                      >
                        ✓ {o.status === "Confirmed" ? "Confirmada" : o.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="toolbar" style={{ justifyContent: "center", gap: 6 }}>
                        <Link
                          className="btn btn-outline btn-sm"
                          to={`/finanzas/pagos/${o.id}/imprimir`}
                          title="Ver / Imprimir Comprobante Oficial de Orden de Pago"
                        >
                          🖨️ Imprimir OP
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
