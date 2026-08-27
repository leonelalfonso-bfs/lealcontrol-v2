import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type Invoice } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n || 0);

export function InvoicesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [invList, recList] = await Promise.all([
        api.listInvoices(search, statusFilter, typeFilter),
        api.listCollectionReceipts().catch(() => [] as any[])
      ]);
      setItems(invList);
      setReceipts(recList || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar facturas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search, statusFilter, typeFilter]);

  const handleAuthorizeArca = async (inv: Invoice) => {
    try {
      setAuthorizingId(inv.id);
      setError(null);
      await api.authorizeInvoiceArca(inv.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al autorizar con ARCA");
    } finally {
      setAuthorizingId(null);
    }
  };

  // Enhance invoices with collection and pending status
  const enrichedInvoices = useMemo(() => {
    const now = new Date().getTime();

    return items.map((inv) => {
      // Find receipts matching this invoice
      const pastImputed = receipts
        .filter((r) => r.invoiceId === inv.id || (r.invoicesSummary && r.invoicesSummary.includes(inv.formattedNumber)))
        .reduce((sum, r) => {
          if (inv.currency === "USD") {
            if (r.invoiceAmount && r.invoiceCurrency === "USD") return sum + Number(r.invoiceAmount);
            if (r.currency === "USD") return sum + Number(r.amount);
            if (r.paymentExchangeRate && r.paymentExchangeRate > 0) return sum + (Number(r.amount) / Number(r.paymentExchangeRate));
            if (inv.exchangeRate && inv.exchangeRate > 0) return sum + (Number(r.amount) / Number(inv.exchangeRate));
          }
          return sum + (Number(r.amount) || 0);
        }, 0);

      const totalCobrado = pastImputed;
      const saldoPendiente = Math.max(0, inv.total - totalCobrado);
      const isPaid = totalCobrado >= inv.total - 0.01 && inv.total > 0;
      const isPartial = totalCobrado > 0.01 && saldoPendiente > 0.01;
      const isPending = totalCobrado <= 0.01;

      const paymentState = isPaid ? "Paid" : isPartial ? "Partial" : "Pending";

      // Days calculations
      const issueTime = new Date(inv.issueDate).getTime();
      const dueTime = new Date(inv.dueDate).getTime();
      const daysSinceIssue = Math.max(0, Math.floor((now - issueTime) / (1000 * 60 * 60 * 24)));
      const daysOverdue = Math.floor((now - dueTime) / (1000 * 60 * 60 * 24));

      return {
        ...inv,
        totalCobrado,
        saldoPendiente,
        paymentState,
        isPaid,
        isPartial,
        isPending,
        daysSinceIssue,
        daysOverdue
      };
    });
  }, [items, receipts]);

  // Filtered by payment status
  const filteredInvoices = useMemo(() => {
    if (paymentFilter === "All") return enrichedInvoices;
    return enrichedInvoices.filter((i) => i.paymentState === paymentFilter);
  }, [enrichedInvoices, paymentFilter]);

  const totalAuthorized = items.filter((i) => i.status === "Authorized").length;
  const totalArs = items.filter((i) => i.currency === "ARS").reduce((s, i) => s + i.total, 0);
  const totalUsd = items.filter((i) => i.currency === "USD").reduce((s, i) => s + i.total, 0);

  const pendingArs = enrichedInvoices
    .filter((i) => i.currency === "ARS" && !i.isPaid)
    .reduce((s, i) => s + i.saldoPendiente, 0);

  const pendingUsd = enrichedInvoices
    .filter((i) => i.currency === "USD" && !i.isPaid)
    .reduce((s, i) => s + i.saldoPendiente, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>📄 Facturación Electrónica ARCA</h1>
          <p className="muted">Comprobantes fiscales autorizados, estado de cobranzas y CAE oficial</p>
        </div>
        <div className="toolbar">
          <ExcelToolbar
            fileName="facturas-venta"
            rows={filteredInvoices}
            columns={[
              { key: "formattedNumber", header: "Número" },
              { key: "customerName", header: "Cliente" },
              { key: "customerDocument", header: "CUIT" },
              { key: "issueDate", header: "Fecha Emisión" },
              { key: "dueDate", header: "Vencimiento" },
              { key: "currency", header: "Moneda" },
              { key: "total", header: "Total" },
              { key: "totalCobrado", header: "Total Cobrado" },
              { key: "saldoPendiente", header: "Saldo Pendiente" },
              { key: "paymentState", header: "Estado Cobro" },
              { key: "status", header: "Estado ARCA" }
            ]}
          />
          <Link className="btn" to="/facturas/nueva">
            + Nueva Factura
          </Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="kpi kpi-4">
        <div className="card">
          <span className="muted">Total Comprobantes</span>
          <strong>{items.length}</strong>
          <small className="muted" style={{ fontSize: "0.75rem", display: "block", marginTop: 2 }}>
            {totalAuthorized} autorizadas con CAE
          </small>
        </div>
        <div className="card">
          <span className="muted">Total Facturado (ARS)</span>
          <strong>{money(totalArs, "ARS")}</strong>
          <small style={{ fontSize: "0.75rem", display: "block", marginTop: 2, color: pendingArs > 0 ? "#dc2626" : "#059669", fontWeight: 600 }}>
            Pendiente de Cobro: {money(pendingArs, "ARS")}
          </small>
        </div>
        <div className="card">
          <span className="muted">Total Facturado (USD)</span>
          <strong style={{ color: "#2563eb" }}>{money(totalUsd, "USD")}</strong>
          <small style={{ fontSize: "0.75rem", display: "block", marginTop: 2, color: pendingUsd > 0 ? "#dc2626" : "#059669", fontWeight: 600 }}>
            Pendiente de Cobro: {money(pendingUsd, "USD")}
          </small>
        </div>
        <div className="card">
          <span className="muted">Estado de Cobranzas</span>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <span style={{ color: "#059669", fontWeight: 700, fontSize: "0.9rem" }}>
              🟢 {enrichedInvoices.filter((i) => i.isPaid).length} Cobradas
            </span>
            <span style={{ color: "#dc2626", fontWeight: 700, fontSize: "0.9rem" }}>
              🔴 {enrichedInvoices.filter((i) => !i.isPaid).length} Pendientes
            </span>
          </div>
        </div>
      </div>

      <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por N° Comprobante, Cliente, CUIT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 260 }}
          />

          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 160 }}>
            <option value="All">Todos los Tipos</option>
            <option value="A">Factura A</option>
            <option value="B">Factura B</option>
            <option value="C">Factura C</option>
            <option value="M">Factura M</option>
            <option value="NC_A">Nota de Crédito A</option>
            <option value="NC_B">Nota de Crédito B</option>
            <option value="Proforma">Proforma / Interna</option>
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 160 }}>
            <option value="All">Todos los Estados ARCA</option>
            <option value="Authorized">🟢 CAE Autorizado</option>
            <option value="Draft">🟡 Borrador</option>
            <option value="Rejected">🔴 Rechazado ARCA</option>
          </select>

          {/* Payment Status Filter */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={{ width: 180, fontWeight: 600 }}
          >
            <option value="All">Todos los Cobros</option>
            <option value="Pending">🔴 Pendientes de Cobro</option>
            <option value="Partial">🟡 Cobro Parcial</option>
            <option value="Paid">🟢 Cobradas (100%)</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="pad muted">Cargando comprobantes…</p>
        ) : filteredInvoices.length === 0 ? (
          <p className="pad muted" style={{ textAlign: "center", padding: 32 }}>
            No se encontraron facturas para los filtros seleccionados.
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
                  <th style={{ textAlign: "right" }}>Total Facturado</th>
                  <th style={{ textAlign: "center" }}>Estado ARCA</th>
                  <th style={{ textAlign: "center" }}>Estado Cobro & Días</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <strong>Factura {inv.invoiceType}</strong>
                      <div className="muted" style={{ fontFamily: "monospace", fontWeight: 700 }}>
                        {inv.formattedNumber}
                      </div>
                      {inv.remitoId ? (
                        <div style={{ fontSize: "0.72rem", color: "#0f766e", fontWeight: 600, marginTop: 2 }}>
                          🚚 Desde Remito
                        </div>
                      ) : inv.orderId ? (
                        <div style={{ fontSize: "0.72rem", color: "#4338ca", fontWeight: 600, marginTop: 2 }}>
                          📦 Desde Pedido
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.72rem", color: "#0284c7", fontWeight: 600, marginTop: 2 }}>
                          ⚡ Venta Directa
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{new Date(inv.issueDate).toLocaleDateString("es-AR")}</div>
                      <small className="muted" style={{ fontSize: "0.75rem" }}>
                        Vto: {new Date(inv.dueDate).toLocaleDateString("es-AR")}
                      </small>
                    </td>
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
                    <td style={{ textAlign: "right" }}>
                      <strong style={{ fontSize: "0.95rem" }}>
                        {money(inv.total, inv.currency)}
                      </strong>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        Neto: {money(inv.subtotal, inv.currency)}
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {inv.status === "Authorized" ? (
                        <div>
                          <span className="badge ok">🟢 CAE {inv.cae}</span>
                          {inv.caeDueDate && (
                            <div className="muted" style={{ fontSize: "0.72rem" }}>
                              Vto: {new Date(inv.caeDueDate).toLocaleDateString("es-AR")}
                            </div>
                          )}
                        </div>
                      ) : inv.status === "Draft" ? (
                        <span className="badge warn">🟡 Borrador</span>
                      ) : (
                        <span className="badge off">🔴 Rechazado</span>
                      )}
                    </td>

                    {/* Estado de Cobro y Días sin cobrar */}
                    <td style={{ textAlign: "center" }}>
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
                            🟢 Cobrada
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
                            🟡 Cobro Parcial
                          </span>
                          <div style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 700, marginTop: 2 }}>
                            Resta: {money(inv.saldoPendiente, inv.currency)}
                          </div>
                          <div className="muted" style={{ fontSize: "0.72rem" }}>
                            {inv.daysSinceIssue === 0 ? "Emitida hoy" : `${inv.daysSinceIssue}d sin cobrar`}
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
                              : `${inv.daysSinceIssue}d sin cobrar`}
                          </div>
                        </div>
                      )}
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {!inv.isPaid && (
                          <Link
                            to={`/finanzas/cobranzas?customerId=${inv.customerId}`}
                            className="btn compact"
                            style={{
                              padding: "4px 8px",
                              fontSize: "0.8rem",
                              background: "#0d9488",
                              color: "#ffffff",
                              fontWeight: 700,
                              borderRadius: "6px",
                              textDecoration: "none"
                            }}
                            title="Registrar cobro e imputar factura"
                          >
                            💵 Cobrar
                          </Link>
                        )}
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
