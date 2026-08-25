import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseInvoice } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";
import { InvoiceOcrUploadModal } from "../components/InvoiceOcrUploadModal";

export function PurchaseInvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [showOcrModal, setShowOcrModal] = useState(false);

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

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const hasInventoryItems = inv.items && inv.items.some((i) => !!i.productId);
      const isReceived = !!inv.purchaseReceptionId;

      if (stockStatusFilter === "pending") {
        return hasInventoryItems && !isReceived;
      }
      if (stockStatusFilter === "received") {
        return isReceived;
      }
      if (stockStatusFilter === "services") {
        return !hasInventoryItems;
      }
      return true;
    });
  }, [invoices, stockStatusFilter]);

  const pendingReceptionCount = useMemo(() => {
    return invoices.filter(
      (inv) =>
        inv.status !== "Cancelled" &&
        inv.items &&
        inv.items.some((i) => !!i.productId) &&
        !inv.purchaseReceptionId
    ).length;
  }, [invoices]);

  const totalPayable = invoices
    .filter((i) => i.status !== "Cancelled")
    .reduce((acc, i) => acc + i.total * (i.currency === "USD" ? i.exchangeRate : 1), 0);

  const totalIvaCredit = invoices
    .filter((i) => i.status !== "Cancelled")
    .reduce((acc, i) => acc + (i.iva21 + i.iva105 + i.iva27) * (i.currency === "USD" ? i.exchangeRate : 1), 0);

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      <div className="page-head">
        <div>
          <h1>Facturas de Proveedores (Libro IVA Compras)</h1>
          <p className="muted">Registro fiscal de comprobantes recibidos, IVA Crédito Fiscal, Cuentas por Pagar e Ingreso de Stock</p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowOcrModal(true)}
            className="btn"
            style={{ background: "linear-gradient(135deg, #1e40af, #3b82f6)", color: "white", fontWeight: 700 }}
          >
            📷 Cargar con IA (Foto / PDF)
          </button>
          <Link to="/compras/arca" className="btn" style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", color: "white" }}>
            📥 Importador ARCA
          </Link>
          <div className="toolbar">
            <ExcelToolbar
              fileName="facturas-proveedor"
              rows={invoices}
              columns={[
                { key: "formattedNumber", header: "Número" },
                { key: "supplierName", header: "Proveedor" },
                { key: "supplierDocument", header: "CUIT" },
                { key: "issueDate", header: "Fecha Emisión" },
                { key: "dueDate", header: "Fecha Vencimiento" },
                { key: "currency", header: "Moneda" },
                { key: "subtotal", header: "Neto Gravado" },
                { key: "total", header: "Total Factura" },
                {
                  key: "receptionStatus",
                  header: "Estado Recepción Stock",
                  value: (row) =>
                    row.purchaseReceptionId
                      ? "Mercadería Recibida"
                      : row.items?.some((i) => i.productId)
                      ? "Recepción Pendiente"
                      : "No inventariable"
                },
                { key: "status", header: "Estado Pago" }
              ]}
            />
            <Link to="/compras/facturas/nueva" className="btn btn-primary">
              + Cargar Factura Manual
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(220, 38, 38, 0.05))", borderLeft: "4px solid #ef4444" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: "bold", color: "#b91c1c", textTransform: "uppercase" }}>
            Total Cuentas por Pagar
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold", marginTop: "4px", color: "#b91c1c" }}>
            $ {totalPayable.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.05))", borderLeft: "4px solid #10b981" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: "bold", color: "#047857", textTransform: "uppercase" }}>
            IVA Crédito Fiscal Acumulado
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold", marginTop: "4px", color: "#047857" }}>
            $ {totalIvaCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="card pad" style={{ background: pendingReceptionCount > 0 ? "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.06))" : "rgba(241, 245, 249, 0.6)", borderLeft: pendingReceptionCount > 0 ? "4px solid #f59e0b" : "4px solid #94a3b8" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: "bold", color: pendingReceptionCount > 0 ? "#92400e" : "#475569", textTransform: "uppercase" }}>
            📥 Recepciones de Stock Pendientes
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold", marginTop: "4px", color: pendingReceptionCount > 0 ? "#b45309" : "#334155" }}>
            {pendingReceptionCount} {pendingReceptionCount === 1 ? "factura" : "facturas"}
          </div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(2, 132, 199, 0.05))", borderLeft: "4px solid #0284c7" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: "bold", color: "#0369a1", textTransform: "uppercase" }}>
            Facturas Registradas
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold", marginTop: "4px" }}>
            {invoices.length}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card filters" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Buscar por N° factura, proveedor o CUIT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: "220px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
        />

        <select
          value={stockStatusFilter}
          onChange={(e) => setStockStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", fontWeight: 600 }}
        >
          <option value="all">📦 Todos los estados de stock</option>
          <option value="pending">📥 Recepción Pendiente ({pendingReceptionCount})</option>
          <option value="received">✓ Con Mercadería Recibida</option>
          <option value="services">📋 Solo Servicios / No inventariable</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
        >
          <option value="">Todos los Estados de Pago</option>
          <option value="Recorded">Registrada / Pendiente de Pago</option>
          <option value="Paid">Pagada</option>
          <option value="Cancelled">Anulada</option>
        </select>
      </div>

      {/* Invoices Table */}
      <div className="card pad" style={{ marginTop: "16px" }}>
        {loading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--ink-soft)" }}>Cargando facturas de compra...</div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: "var(--ink-soft)" }}>
            No se encontraron facturas de proveedores con los filtros aplicados.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                  <th style={{ padding: "10px 8px", textAlign: "center" }}>Ingreso de Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const ivaTotal = inv.iva21 + inv.iva105 + inv.iva27;
                  const hasInventoryItems = inv.items && inv.items.some((i) => !!i.productId);
                  const isReceived = !!inv.purchaseReceptionId;

                  return (
                    <tr
                      key={inv.id}
                      style={{
                        borderBottom: "1px solid rgba(0,0,0,0.04)",
                        background: hasInventoryItems && !isReceived ? "rgba(245, 158, 11, 0.03)" : undefined
                      }}
                    >
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
                      <td style={{ padding: "12px 8px", textAlign: "center" }}>
                        {isReceived ? (
                          <span
                            className="badge ok"
                            style={{
                              fontSize: "0.78rem",
                              padding: "4px 10px",
                              borderRadius: "12px",
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "#065f46",
                              fontWeight: 700
                            }}
                            title="La mercadería ya fue ingresada a stock mediante remito"
                          >
                            ✓ Stock Recibido
                          </span>
                        ) : hasInventoryItems ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "5px", alignItems: "center" }}>
                            <span
                              className="badge warn"
                              style={{
                                fontSize: "0.75rem",
                                padding: "2px 8px",
                                borderRadius: "10px",
                                background: "rgba(245, 158, 11, 0.18)",
                                color: "#92400e",
                                fontWeight: 700
                              }}
                            >
                              📥 Recepción Pendiente
                            </span>
                            <Link
                              to={`/compras/recepciones/nueva?invoice_id=${inv.id}`}
                              className="btn compact"
                              style={{
                                fontSize: "0.75rem",
                                padding: "4px 8px",
                                background: "#0284c7",
                                color: "#ffffff",
                                fontWeight: 700,
                                borderRadius: "6px",
                                textDecoration: "none"
                              }}
                              title="Registrar remito del proveedor y dar ingreso físico al stock"
                            >
                              📦 Recibir Mercadería
                            </Link>
                          </div>
                        ) : (
                          <span className="muted" style={{ fontSize: "0.8rem" }}>
                            📋 No inventariable
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice OCR Modal */}
      <InvoiceOcrUploadModal
        isOpen={showOcrModal}
        onClose={() => setShowOcrModal(false)}
        onApplyInvoice={(res) => {
          navigate("/compras/facturas/nueva");
        }}
      />
    </div>
  );
}
