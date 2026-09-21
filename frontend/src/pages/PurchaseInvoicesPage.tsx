import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseInvoice } from "../api/types";
import { type PurchaseReception } from "../api/types";
import { InvoiceOcrUploadModal } from "../components/InvoiceOcrUploadModal";

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n || 0);

export function PurchaseInvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [receptions, setReceptions] = useState<PurchaseReception[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [paymentFilter, setPaymentFilter] = useState<string>("All");
  const [showOcrModal, setShowOcrModal] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [invData, poData, recData] = await Promise.all([
        api.listPurchaseInvoices(),
        api.listPaymentOrders().catch(() => [] as any[]),
        api.listPurchaseReceptions().catch(() => [] as PurchaseReception[])
      ]);
      setInvoices(invData || []);
      setPaymentOrders(poData || []);
      setReceptions(recData || []);
    } catch (err: any) {
      setError(err.message || "Error al cargar las facturas de compra.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Enrich purchase invoices with payment and days calculations
  const enrichedInvoices = useMemo(() => {
    const now = new Date().getTime();

    return invoices.map((inv) => {
      // Find matching payment orders for this invoice
      const pastPaid = paymentOrders
        .filter((po: any) => po.invoicesSummary && po.invoicesSummary.includes(inv.formattedNumber))
        .reduce((sum: number, po: any) => {
          if (inv.currency === "USD") {
            if (po.currency === "USD") return sum + Number(po.amount);
            if (po.exchangeRate && po.exchangeRate > 0) return sum + (Number(po.amount) / Number(po.exchangeRate));
            if (inv.exchangeRate && inv.exchangeRate > 0) return sum + (Number(po.amount) / Number(inv.exchangeRate));
          }
          return sum + (Number(po.amount) || 0);
        }, 0);

      const totalPagado = pastPaid;
      const saldoPendiente = Math.max(0, inv.total - totalPagado);
      const isPaid = totalPagado >= inv.total - 0.01 && inv.total > 0;
      const isPartial = totalPagado > 0.01 && saldoPendiente > 0.01;
      const isPending = totalPagado <= 0.01;

      const paymentState = isPaid ? "Paid" : isPartial ? "Partial" : "Pending";

      const issueTime = new Date(inv.issueDate).getTime();
      const dueTime = new Date(inv.dueDate).getTime();
      const daysSinceIssue = Math.max(0, Math.floor((now - issueTime) / (1000 * 60 * 60 * 24)));
      const daysOverdue = Math.floor((now - dueTime) / (1000 * 60 * 60 * 24));

      return {
        ...inv,
        totalPagado,
        saldoPendiente,
        paymentState,
        isPaid,
        isPartial,
        isPending,
        daysSinceIssue,
        daysOverdue
      };
    });
  }, [invoices, paymentOrders]);

  const filteredInvoices = useMemo(() => {
    return enrichedInvoices.filter((inv) => {
      const matchSearch =
        searchTerm === "" ||
        inv.formattedNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.supplierDocument.toLowerCase().includes(searchTerm.toLowerCase());

      const matchType = selectedType === "All" || inv.invoiceType === selectedType;
      const matchStatus = selectedStatus === "All" || inv.status === selectedStatus;
      const matchPayment = paymentFilter === "All" || inv.paymentState === paymentFilter;

      return matchSearch && matchType && matchStatus && matchPayment;
    });
  }, [enrichedInvoices, searchTerm, selectedType, selectedStatus, paymentFilter]);

  // Totals calculations — excluir anuladas del volumen
  const activeInvoices = invoices.filter((i) => i.status !== "Cancelled");
  const totalArs = activeInvoices.filter((i) => i.currency === "ARS").reduce((acc, curr) => acc + curr.total, 0);
  const totalUsd = activeInvoices.filter((i) => i.currency === "USD").reduce((acc, curr) => acc + curr.total, 0);
  
  const pendingArs = enrichedInvoices
    .filter((i) => i.currency === "ARS" && !i.isPaid && i.status !== "Cancelled")
    .reduce((s, i) => s + i.saldoPendiente, 0);

  const pendingUsd = enrichedInvoices
    .filter((i) => i.currency === "USD" && !i.isPaid && i.status !== "Cancelled")
    .reduce((s, i) => s + i.saldoPendiente, 0);

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div className="page-head">
        <div>
          <span className="eyebrow">COMPRAS & PROVEEDORES</span>
          <h1>Facturas de Compra</h1>
          <p className="muted">
            Registro fiscal de compras, control de pagos, recepción de stock y vinculación con órdenes de pago.
          </p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setShowOcrModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            📸 Subir PDF / Factura IA (OCR)
          </button>
          <Link to="/compras/facturas/nueva" className="btn btn-primary">
            ＋ Cargar Factura Manual
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#f87171", marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPIs Summary */}
      <div className="kpi kpi-4" style={{ marginBottom: 20 }}>
        <div className="card">
          <span className="muted">Total Facturas de Compra</span>
          <strong>{invoices.length}</strong>
          <small className="muted" style={{ fontSize: "0.75rem", display: "block", marginTop: 2 }}>
            Comprobantes de proveedores
          </small>
        </div>
        <div className="card">
          <span className="muted">Total Compras (ARS)</span>
          <strong style={{ color: "#0f172a" }}>{money(totalArs, "ARS")}</strong>
          <small style={{ fontSize: "0.75rem", display: "block", marginTop: 2, color: pendingArs > 0 ? "#dc2626" : "#059669", fontWeight: 600 }}>
            Pendiente de Pago: {money(pendingArs, "ARS")}
          </small>
        </div>
        <div className="card">
          <span className="muted">Total Compras (USD)</span>
          <strong style={{ color: "#2563eb" }}>{money(totalUsd, "USD")}</strong>
          <small style={{ fontSize: "0.75rem", display: "block", marginTop: 2, color: pendingUsd > 0 ? "#dc2626" : "#059669", fontWeight: 600 }}>
            Pendiente de Pago: {money(pendingUsd, "USD")}
          </small>
        </div>
        <div className="card">
          <span className="muted">Estado de Pagos</span>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <span style={{ color: "#059669", fontWeight: 700, fontSize: "0.9rem" }}>
              🟢 {enrichedInvoices.filter((i) => i.isPaid).length} Pagadas
            </span>
            <span style={{ color: "#dc2626", fontWeight: 700, fontSize: "0.9rem" }}>
              🔴 {enrichedInvoices.filter((i) => !i.isPaid).length} Pendientes
            </span>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Buscar por N° Factura, Proveedor, CUIT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ minWidth: 260 }}
          />

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{ width: 160 }}
          >
            <option value="All">Todos los Tipos</option>
            <option value="Factura A">Factura A</option>
            <option value="Factura B">Factura B</option>
            <option value="Factura C">Factura C</option>
            <option value="Factura M">Factura M</option>
            <option value="Nota de Débito A">Nota de Débito A</option>
            <option value="Nota de Crédito A">Nota de Crédito A</option>
          </select>

          {/* Payment Status Filter */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={{ width: 180, fontWeight: 600 }}
          >
            <option value="All">Todos los Pagos</option>
            <option value="Pending">🔴 Pendientes de Pago</option>
            <option value="Partial">🟡 Pago Parcial</option>
            <option value="Paid">🟢 Pagadas (100%)</option>
          </select>
        </div>

        <button type="button" className="btn btn-outline" onClick={() => void loadData()}>
          🔄 Actualizar
        </button>
      </div>

      {/* Main Table */}
      <div className="card">
        {loading ? (
          <p className="pad muted">Cargando facturas de compra...</p>
        ) : filteredInvoices.length === 0 ? (
          <p className="pad muted" style={{ textAlign: "center", padding: 32 }}>
            No se encontraron facturas de compra para los filtros seleccionados.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ padding: "10px 8px" }}>Tipo</th>
                  <th style={{ padding: "10px 8px" }}>N° Comprobante</th>
                  <th style={{ padding: "10px 8px" }}>Fecha Emisión</th>
                  <th style={{ padding: "10px 8px" }}>Proveedor</th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}>Total</th>
                  <th style={{ padding: "10px 8px", textAlign: "center" }}>CAE</th>
                  <th style={{ padding: "10px 8px", textAlign: "center" }}>Estado Pago & Días</th>
                  <th style={{ padding: "10px 8px", textAlign: "center" }}>Ingreso Stock</th>
                  <th style={{ padding: "10px 8px", textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const hasInventoryItems = inv.items && inv.items.some((i) => !!i.productId);
                  const isReceived = !!inv.purchaseReceptionId;
                  const linkedRecIds = new Set(
                    invoices
                      .filter((i) => i.status !== "Cancelled" && i.purchaseReceptionId)
                      .map((i) => i.purchaseReceptionId as string)
                  );
                  const openRecsForSupplier = receptions.filter(
                    (r) =>
                      r.status !== "Cancelled" &&
                      r.supplierId === inv.supplierId &&
                      !linkedRecIds.has(r.id)
                  );

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
                      <td style={{ padding: "12px 8px" }}>
                        <Link
                          to={`/compras/facturas/${inv.id}`}
                          style={{
                            fontWeight: "bold",
                            fontFamily: "monospace",
                            color: "#0284c7",
                            textDecoration: "none",
                            fontSize: "0.92rem"
                          }}
                          title="Ver detalle y comprobante completo"
                        >
                          {inv.formattedNumber}
                        </Link>
                      </td>
                      <td style={{ padding: "12px 8px", fontSize: "0.88rem" }}>
                        <div>{new Date(inv.issueDate).toLocaleDateString("es-AR")}</div>
                        <small className="muted" style={{ fontSize: "0.75rem", color: inv.daysOverdue > 0 ? "#dc2626" : "inherit" }}>
                          Vto: {new Date(inv.dueDate).toLocaleDateString("es-AR")}
                        </small>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <div style={{ fontWeight: 600 }}>{inv.supplierName}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>CUIT: {inv.supplierDocument}</div>
                      </td>
                      <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "bold", fontFamily: "monospace", color: "#0f172a" }}>
                        {money(inv.total, inv.currency)}
                        <div className="muted" style={{ fontSize: "0.75rem", fontWeight: "normal" }}>
                          Neto: {money(inv.subtotal, inv.currency)}
                        </div>
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

                      {/* Estado de Pago y Días sin pagar */}
                      <td style={{ padding: "12px 8px", textAlign: "center" }}>
                        {inv.isPaid ? (
                          <div>
                            <span
                              className="badge ok"
                              style={{
                                background: "rgba(16, 185, 129, 0.15)",
                                color: "#065f46",
                                fontWeight: 700,
                                padding: "4px 8px"
                              }}
                            >
                              🟢 Pagada
                            </span>
                            <div className="muted" style={{ fontSize: "0.72rem", marginTop: 2 }}>
                              ✓ 100% saldada
                            </div>
                          </div>
                        ) : inv.isPartial ? (
                          <div>
                            <span
                              className="badge warn"
                              style={{
                                background: "rgba(245, 158, 11, 0.18)",
                                color: "#92400e",
                                fontWeight: 700,
                                padding: "4px 8px"
                              }}
                            >
                              🟡 Pago Parcial
                            </span>
                            <div style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 700, marginTop: 2 }}>
                              Resta: {money(inv.saldoPendiente, inv.currency)}
                            </div>
                            <div className="muted" style={{ fontSize: "0.72rem" }}>
                              {inv.daysSinceIssue === 0 ? "Emitida hoy" : `${inv.daysSinceIssue}d sin pagar`}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span
                              className="badge off"
                              style={{
                                background: "rgba(239, 68, 68, 0.12)",
                                color: "#991b1b",
                                fontWeight: 700,
                                padding: "4px 8px"
                              }}
                            >
                              🔴 Pendiente
                            </span>
                            <div
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: inv.daysOverdue > 0 ? 700 : 500,
                                color: inv.daysOverdue > 0 ? "#dc2626" : "var(--ink-soft)",
                                marginTop: 2
                              }}
                            >
                              {inv.daysOverdue > 0
                                ? `⚠️ Vencida hace ${inv.daysOverdue}d`
                                : inv.daysSinceIssue === 0
                                ? "Emitida hoy (0d)"
                                : `${inv.daysSinceIssue}d sin pagar`}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Stock Status */}
                      <td style={{ padding: "12px 8px", textAlign: "center" }}>
                        {inv.status === "Cancelled" ? (
                          <span className="muted" style={{ fontSize: "0.8rem" }}>—</span>
                        ) : isReceived ? (
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
                            {openRecsForSupplier.length > 0 && (
                              <select
                                defaultValue=""
                                style={{ fontSize: "0.75rem", maxWidth: 180, padding: "4px 6px" }}
                                title="Vincular una recepción ya cargada (sin duplicar stock)"
                                onChange={(e) => {
                                  const recId = e.target.value;
                                  if (!recId) return;
                                  void (async () => {
                                    try {
                                      await api.linkPurchaseInvoiceReception(inv.id, recId);
                                      await loadData();
                                    } catch (err: any) {
                                      setError(err.message || "No se pudo vincular la recepción.");
                                    }
                                  })();
                                }}
                              >
                                <option value="">Vincular recepción…</option>
                                {openRecsForSupplier.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.receptionNumber}
                                    {r.supplierRemitoNumber ? ` · ${r.supplierRemitoNumber}` : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                            <Link
                              to={`/compras/recepciones/nueva?invoice_id=${inv.id}`}
                              className="btn compact"
                              style={{
                                fontSize: "0.75rem",
                                padding: "4px 8px",
                                background: openRecsForSupplier.length > 0 ? "#64748b" : "#0284c7",
                                color: "#ffffff",
                                fontWeight: 700,
                                borderRadius: "6px",
                                textDecoration: "none"
                              }}
                              title={
                                openRecsForSupplier.length > 0
                                  ? "Solo si todavía no recibiste: crea una recepción nueva"
                                  : "Registrar remito del proveedor y dar ingreso físico al stock"
                              }
                            >
                              {openRecsForSupplier.length > 0 ? "Nueva recepción" : "📦 Recibir Mercadería"}
                            </Link>
                          </div>
                        ) : (
                          <span className="muted" style={{ fontSize: "0.8rem" }}>
                            📋 No inventariable
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "12px 8px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                          {inv.status !== "Cancelled" && !inv.isPaid && (
                            <Link
                              to={`/finanzas/pagos/nueva?supplierId=${inv.supplierId}`}
                              className="btn compact"
                              style={{
                                fontSize: "0.78rem",
                                padding: "4px 10px",
                                background: "#0284c7",
                                color: "#ffffff",
                                fontWeight: 700,
                                borderRadius: "6px",
                                textDecoration: "none"
                              }}
                              title="Emitir orden de pago al proveedor"
                            >
                              💳 Pagar
                            </Link>
                          )}
                          <Link
                            to={`/compras/facturas/${inv.id}`}
                            className="btn btn-outline compact"
                            style={{
                              fontSize: "0.78rem",
                              padding: "4px 10px",
                              fontWeight: 600,
                              color: "#0284c7",
                              borderColor: "#cbd5e1"
                            }}
                            title="Ver comprobante completo con detalle de renglones y cantidades"
                          >
                            👁️ Ver
                          </Link>
                          {inv.status !== "Cancelled" && (
                            <button
                              type="button"
                              className="btn btn-outline compact"
                              style={{
                                fontSize: "0.78rem",
                                padding: "4px 10px",
                                fontWeight: 600,
                                color: "#991b1b",
                                borderColor: "#fecaca"
                              }}
                              title="Anular factura (deja de impactar cuenta corriente)"
                              onClick={() => {
                                const reason = window.prompt(`¿Anular factura ${inv.formattedNumber}? Motivo (opcional):`, "") ?? undefined;
                                if (reason === undefined) return;
                                void (async () => {
                                  try {
                                    await api.cancelPurchaseInvoice(inv.id, reason || undefined);
                                    await loadData();
                                  } catch (err: any) {
                                    setError(err.message || "No se pudo anular la factura.");
                                  }
                                })();
                              }}
                            >
                              Anular
                            </button>
                          )}
                          {inv.status === "Cancelled" && (
                            <span className="badge off" style={{ fontSize: "0.75rem", color: "#991b1b" }}>
                              Anulada
                            </span>
                          )}
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

      {/* Invoice OCR Modal */}
      <InvoiceOcrUploadModal
        isOpen={showOcrModal}
        onClose={() => setShowOcrModal(false)}
        onApplyInvoice={() => {
          navigate("/compras/facturas/nueva");
        }}
      />
    </div>
  );
}
