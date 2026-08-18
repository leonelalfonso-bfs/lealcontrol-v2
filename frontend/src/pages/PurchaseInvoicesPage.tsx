import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseInvoice } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await api.listPurchaseInvoices(search, statusFilter);
        setInvoices(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [search, statusFilter]);

  const totalPayable = invoices
    .filter((i) => i.status !== "Cancelled")
    .reduce((acc, i) => acc + i.total * (i.currency === "USD" ? i.exchangeRate : 1), 0);

  const totalIvaCredit = invoices
    .filter((i) => i.status !== "Cancelled")
    .reduce((acc, i) => acc + (i.iva21 + i.iva105 + i.iva27) * (i.currency === "USD" ? i.exchangeRate : 1), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Facturas de Proveedores (Libro IVA Compras)</h1>
          <p className="muted">Registro fiscal de comprobantes recibidos, IVA Crédito Fiscal y Cuentas por Pagar</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/compras/arca" className="btn" style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", color: "white" }}>
            📥 Importador ARCA
          </Link>
        <div className="toolbar"><ExcelToolbar fileName="facturas-proveedor" rows={invoices} columns={[{ key: "formattedNumber", header: "Número" }, { key: "supplierName", header: "Proveedor" }, { key: "issueDate", header: "Fecha" }, { key: "currency", header: "Moneda" }, { key: "total", header: "Total" }, { key: "status", header: "Estado" }]} /><Link to="/compras/facturas/nueva" className="btn btn-primary">
            + Cargar Factura Manual
        </Link></div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(220, 38, 38, 0.05))" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: "bold", color: "#b91c1c", textTransform: "uppercase" }}>
            Total Cuentas por Pagar
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "bold", marginTop: "4px", color: "#b91c1c" }}>
            $ {totalPayable.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.05))" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: "bold", color: "#047857", textTransform: "uppercase" }}>
            IVA Crédito Fiscal Acumulado
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "bold", marginTop: "4px", color: "#047857" }}>
            $ {totalIvaCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(2, 132, 199, 0.05))" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: "bold", color: "#0369a1", textTransform: "uppercase" }}>
            Facturas Registradas
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "bold", marginTop: "4px" }}>
            {invoices.length}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card filters" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar por N° factura, proveedor o CUIT..."
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
          <option value="Recorded">Registrada / Pendiente de Pago</option>
          <option value="Paid">Pagada</option>
          <option value="Cancelled">Anulada</option>
        </select>
      </div>

      {/* Invoices Table */}
      <div className="card pad" style={{ marginTop: "16px" }}>
        {loading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--ink-soft)" }}>Cargando facturas de compra...</div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: "var(--ink-soft)" }}>
            No se encontraron facturas de proveedores registradas.
          </div>
        ) : (
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                <th style={{ padding: "10px 8px" }}>Tipo</th>
                <th style={{ padding: "10px 8px" }}>N° Comprobante</th>
                <th style={{ padding: "10px 8px" }}>Emisión</th>
                <th style={{ padding: "10px 8px" }}>Vencimiento</th>
                <th style={{ padding: "10px 8px" }}>Proveedor</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Neto Grav.</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>IVA</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Total</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>CAE</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const ivaTotal = inv.iva21 + inv.iva105 + inv.iva27;
                return (
                  <tr key={inv.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <td style={{ padding: "12px 8px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: "6px", fontWeight: "bold", fontSize: "0.82rem", background: "#f1f5f9", color: "#0284c7" }}>
                        {inv.invoiceType}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: "bold", fontFamily: "monospace" }}>
                      {inv.formattedNumber}
                    </td>
                    <td style={{ padding: "12px 8px", fontSize: "0.9rem" }}>
                      {new Date(inv.issueDate).toLocaleDateString("es-AR")}
                    </td>
                    <td style={{ padding: "12px 8px", fontSize: "0.9rem", color: "#b91c1c" }}>
                      {new Date(inv.dueDate).toLocaleDateString("es-AR")}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <div style={{ fontWeight: 600 }}>{inv.supplierName}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>CUIT: {inv.supplierDocument}</div>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontFamily: "monospace" }}>
                      {inv.currency === "USD" ? "USD " : "$ "}
                      {inv.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontFamily: "monospace", color: "#047857" }}>
                      {inv.currency === "USD" ? "USD " : "$ "}
                      {ivaTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "bold", fontFamily: "monospace", color: "#0f172a" }}>
                      {inv.currency === "USD" ? "USD " : "$ "}
                      {inv.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      {inv.cae ? (
                        <span style={{ fontSize: "0.8rem", fontFamily: "monospace", padding: "2px 6px", background: "#ecfdf5", color: "#047857", borderRadius: "4px" }}>
                          ✓ {inv.cae}
                        </span>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
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
