import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { ARCA_TYPES, documentLabel } from "../lib/documents";
import { type Invoice } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionsContext";
import { SearchField } from "../components/ui/SearchField";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { withCollections } from "../lib/receivables";

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n || 0);

// Fechas fiscales guardadas a medianoche UTC: se muestra el día calendario, sin correrlo por zona horaria.
const civilDate = (value?: string | null) => {
  const [y, m, d] = (value ?? "").slice(0, 10).split("-");
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : "—";
};


export function InvoicesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Autorizar en ARCA, consultar y ajustar la cotización: Ventas en nivel Aprobar (perfil del usuario).
  const { can } = usePermissions();
  const canAuthorize = can("sales", "Approve");
  const canEditSales = can("sales", "Edit");
  const canCollect = can("finance", "Edit");
  const [items, setItems] = useState<Invoice[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fiscalEnabled, setFiscalEnabled] = useState(false);
  const [fiscalAttempts, setFiscalAttempts] = useState<Record<string, { status: string; voucherNumber: number; rejectionDetail?: string | null }>>({});
  const [busyInvoice, setBusyInvoice] = useState<string | null>(null);
  // Borrador en USD cuya cotización no coincide con la oficial de ARCA.
  const [rateFix, setRateFix] = useState<Invoice | null>(null);
  const fiscalBusy = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const [invList, recList, fiscal] = await Promise.all([
        api.listInvoices(debouncedSearch, statusFilter, typeFilter),
        api.listCollectionReceipts().catch(() => [] as any[]),
        canAuthorize ? api.getInvoiceFiscalStatus() : Promise.resolve({ enabled: false, attempts: [] })
      ]);
      setItems(invList);
      setReceipts(recList || []);
      setFiscalEnabled(fiscal.enabled);
      setFiscalAttempts(Object.fromEntries(fiscal.attempts.map((a) => [a.invoiceId, a])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar facturas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [debouncedSearch, statusFilter, typeFilter, canAuthorize]);

  const authorize = async (invoice: Invoice) => {
    if (fiscalBusy.current || !canAuthorize) return;
    const consulting = ["Pending", "Unknown"].includes(fiscalAttempts[invoice.id]?.status || "");
    if (!consulting && !fiscalEnabled) return;
    if (!consulting && !window.confirm(
      `Solicitar autorización ARCA para ${invoice.customerName}, por ${money(invoice.total, invoice.currency)}. Esta acción puede emitir un comprobante fiscal. ¿Continuar?`
    )) return;
    fiscalBusy.current = true;
    setBusyInvoice(invoice.id);
    setError(null);
    setNotice(null);
    try {
      const confirmed = consulting
        ? await api.recoverInvoiceArca(invoice.id)
        : await api.authorizeInvoiceArca(invoice.id);
      setItems((current) => current.map((item) => item.id === confirmed.id ? confirmed : item));
      await load();
      setNotice(`Comprobante ${confirmed.formattedNumber} confirmado en ARCA. CAE: ${confirmed.cae}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo confirmar el comprobante.";
      await load();
      setError(message);
      setRateFix(invoice.currency !== "ARS" && message.includes("Cotización ARCA") ? invoice : null);
    } finally {
      fiscalBusy.current = false;
      setBusyInvoice(null);
    }
  };

  // Enhance invoices with collection and pending status
  const enrichedInvoices = useMemo(() => withCollections(items, receipts), [items, receipts]);

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
          <h1>📄 Facturas</h1>
          <p className="muted">Guardá el borrador y solicitá su autorización cuando la emisión esté habilitada. Los envíos sin confirmar se consultan con el mismo número reservado.</p>
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

      {error && <div className="alert" role="alert">
        {error}
        {rateFix && (
          <button type="button" className="btn" style={{ marginLeft: 12 }} disabled={busyInvoice !== null}
            onClick={async () => {
              try {
                const updated = await api.applyArcaExchangeRate(rateFix.id);
                setRateFix(null);
                setError(null);
                await load();
                setNotice(`Cotización actualizada a la oficial de ARCA ($ ${updated.exchangeRate.toLocaleString("es-AR")}). Ya podés autorizar ${updated.formattedNumber}.`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "No se pudo actualizar la cotización.");
              }
            }}>
            Usar cotización ARCA
          </button>
        )}
      </div>}
      {notice && <div className="alert" role="status">{notice}</div>}

      <div className="kpi kpi-4">
        <div className="card">
          <span className="muted">Total Comprobantes</span>
          <strong>{items.length}</strong>
          <small className="muted t-small" style={{ display: "block", marginTop: 2 }}>
            {totalAuthorized} marcadas autorizadas · verificar CAE en ARCA
          </small>
        </div>
        <div className="card">
          <span className="muted">Total Facturado (ARS)</span>
          <strong>{money(totalArs, "ARS")}</strong>
          <small className="t-small t-strong" style={{ display: "block", marginTop: 2, color: pendingArs > 0 ? "var(--lc-danger)" : "var(--lc-ok)" }}>
            Pendiente de Cobro: {money(pendingArs, "ARS")}
          </small>
        </div>
        <div className="card">
          <span className="muted">Total Facturado (USD)</span>
          <strong className="t-info">{money(totalUsd, "USD")}</strong>
          <small className="t-small t-strong" style={{ display: "block", marginTop: 2, color: pendingUsd > 0 ? "var(--lc-danger)" : "var(--lc-ok)" }}>
            Pendiente de Cobro: {money(pendingUsd, "USD")}
          </small>
        </div>
        <div className="card">
          <span className="muted">Estado de Cobranzas</span>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <span className="t-ok t-strong">
              🟢 {enrichedInvoices.filter((i) => i.isPaid).length} Cobradas
            </span>
            <span className="t-danger t-strong">
              🔴 {enrichedInvoices.filter((i) => !i.isPaid).length} Pendientes
            </span>
          </div>
        </div>
      </div>

      <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar por número, cliente o CUIT"
            style={{ flex: "1 1 320px", maxWidth: 520 }}
          />

          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 160 }}>
            <option value="All">Todos los Tipos</option>
            <option value="A">Factura A</option>
            <option value="B">Factura B</option>
            <option value="C">Factura C</option>
            <option value="M">Factura M</option>
            <option value="NC_A">Nota de Crédito A</option>
            <option value="NC_B">Nota de Crédito B</option>
            <option value="ND_A">Nota de Débito A</option>
            <option value="ND_B">Nota de Débito B</option>
            <option value="FCE_A">Factura de Crédito Electrónica A</option>
            <option value="FCE_B">Factura de Crédito Electrónica B</option>
            <option value="NC_FCE_A">Nota de Crédito FCE A</option>
            <option value="ND_FCE_A">Nota de Débito FCE A</option>
            <option value="Proforma">Proforma / Interna</option>
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 160 }}>
            <option value="All">Todos los Estados ARCA</option>
            <option value="Authorized">Marcadas autorizadas</option>
            <option value="Draft">🟡 Borrador</option>
            <option value="Rejected">🔴 Rechazado ARCA</option>
          </select>

          {/* Payment Status Filter */}
          <select className="t-strong"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={{ width: 180 }}
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
          <p className="pad muted t-center" style={{ padding: 32 }}>
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
                  <th className="t-right">Total Facturado</th>
                  <th className="t-center">Estado ARCA</th>
                  <th className="t-center">Estado Cobro & Días</th>
                  <th className="t-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <strong>{documentLabel(inv.invoiceType)}</strong>
                      <div className="muted t-mono t-strong">
                        {inv.formattedNumber}
                      </div>
                      {inv.remitoId ? (
                        <div className="t-small t-accent t-strong" style={{ marginTop: 2 }}>
                          🚚 Desde Remito
                        </div>
                      ) : inv.orderId ? (
                        <div className="t-small t-strong" style={{ color: "#4338ca", marginTop: 2 }}>
                          📦 Desde Pedido
                        </div>
                      ) : (
                        <div className="t-small t-info t-strong" style={{ marginTop: 2 }}>
                          ⚡ Venta Directa
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{civilDate(inv.issueDate)}</div>
                      <small className="muted t-small">
                        Vto: {civilDate(inv.dueDate)}
                      </small>
                    </td>
                    <td>
                      <strong>{inv.customerName}</strong>
                      <div className="muted t-small">{!inv.customerDocument || inv.customerDocument === "0" ? "Sin identificar" : inv.customerDocument}</div>
                    </td>
                    <td>
                      <span className={`badge ${inv.currency === "USD" ? "prio-high" : "ok"}`}>
                        {inv.currency}
                      </span>
                      {inv.currency === "USD" && (
                        <div className="muted t-small">TC: ${inv.exchangeRate}</div>
                      )}
                    </td>
                    <td className="t-right">
                      <strong>
                        {money(inv.total, inv.currency)}
                      </strong>
                      <div className="muted t-small">
                        Neto: {money(inv.subtotal, inv.currency)}
                      </div>
                    </td>
                    <td className="t-center">
                      {inv.status === "Authorized" ? (
                        <div>
                          <span className="badge">CAE registrado: {inv.cae} · verificar en ARCA</span>
                          {inv.caeDueDate && (
                            <div className="muted t-small">
                              Vto: {civilDate(inv.caeDueDate)}
                            </div>
                          )}
                        </div>
                      ) : inv.status === "Draft" ? (
                        <div>
                          <span className="badge warn">🟡 Borrador</span>
                          {fiscalAttempts[inv.id] && (
                            <div className="muted t-small">
                              {fiscalAttempts[inv.id].status === "Reserved" ? "Reserva sin enviar" :
                                fiscalAttempts[inv.id].status === "Rejected" ? "Solicitud rechazada · requiere revisión" :
                                  ["Pending", "Unknown"].includes(fiscalAttempts[inv.id].status)
                                    ? "Envío sin confirmar · consultar ARCA" : "Reserva fiscal · requiere revisión"}
                              {" · N° "}{fiscalAttempts[inv.id].voucherNumber}
                              {fiscalAttempts[inv.id].status === "Rejected" && fiscalAttempts[inv.id].rejectionDetail && (
                                <span className="t-danger" style={{ display: "block", maxWidth: 360, whiteSpace: "normal" }}>
                                  {fiscalAttempts[inv.id].rejectionDetail}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="badge off">🔴 Rechazado</span>
                      )}
                    </td>

                    {/* Estado de Cobro y Días sin cobrar */}
                    <td className="t-center">
                      {inv.isPaid ? (
                        <div>
                          <span
                            className="badge ok t-ok t-strong"
                            style={{ background: "rgba(16, 185, 129, 0.15)", padding: "4px 8px" }}
                          >
                            🟢 Cobrada
                          </span>
                          <div className="muted t-small" style={{ marginTop: 2 }}>
                            ✓ 100% saldada
                          </div>
                        </div>
                      ) : inv.isPartial ? (
                        <div>
                          <span
                            className="badge warn t-warn t-strong"
                            style={{ background: "rgba(245, 158, 11, 0.18)", padding: "4px 8px" }}
                          >
                            🟡 Cobro Parcial
                          </span>
                          <div className="t-small t-danger t-strong" style={{ marginTop: 2 }}>
                            Resta: {money(inv.saldoPendiente, inv.currency)}
                          </div>
                          <div className="muted t-small">
                            {inv.daysSinceIssue === 0 ? "Emitida hoy" : `${inv.daysSinceIssue}d sin cobrar`}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span
                            className="badge off t-danger t-strong"
                            style={{ background: "rgba(239, 68, 68, 0.12)", padding: "4px 8px" }}
                          >
                            🔴 Pendiente
                          </span>
                          <div className="t-small"
                            style={{ fontWeight: inv.daysOverdue > 0 ? 700 : 500, color: inv.daysOverdue > 0 ? "#dc2626" : "var(--ink-soft)", marginTop: 2 }}
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

                    <td className="t-right">
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {canCollect && !inv.isPaid && !inv.invoiceType.startsWith("NC") && (
                          <Link
                            to={`/finanzas/cobranzas?customerId=${inv.customerId}`}
                            className="btn compact"
                            title="Registrar cobro e imputar factura"
                          >
                            💵 Cobrar
                          </Link>
                        )}
                        {inv.status === "Draft" && canAuthorize &&
                          (fiscalEnabled || ["Pending", "Unknown"].includes(fiscalAttempts[inv.id]?.status || "")) &&
                          fiscalAttempts[inv.id]?.status !== "Rejected" &&
                          (ARCA_TYPES.includes(inv.invoiceType) &&
                            inv.fiscalConcept > 0 && ["ARS", "USD"].includes(inv.currency) ||
                            ["Pending", "Unknown"].includes(fiscalAttempts[inv.id]?.status || "")) && (
                          <button type="button" className="btn" disabled={busyInvoice !== null}
                            onClick={() => void authorize(inv)}>
                            {busyInvoice === inv.id ? "Procesando…" :
                              ["Pending", "Unknown"].includes(fiscalAttempts[inv.id]?.status || "")
                                ? "Consultar ARCA" : "Autorizar ARCA"}
                          </button>
                        )}
                        {canEditSales && ["Authorized", "Draft"].includes(inv.status) && ["A", "B", "ND_A", "ND_B", "FCE_A", "FCE_B", "ND_FCE_A", "ND_FCE_B"].includes(inv.invoiceType) && (
                          <>
                            <Link className="btn ghost compact" title="Nota de crédito sobre esta factura"
                              to={`/facturas/nueva?nota=NC&origen=${inv.id}`}>NC</Link>
                            <Link className="btn ghost compact" title="Nota de débito sobre esta factura"
                              to={`/facturas/nueva?nota=ND&origen=${inv.id}`}>ND</Link>
                          </>
                        )}
                        {inv.status === "Draft" && fiscalAttempts[inv.id]?.status === "Rejected" && (
                          <Link className="btn compact" to={`/facturas/nueva?copiar=${inv.id}`}
                            title="Abre el comprobante para corregirlo; al guardarlo se anula este borrador rechazado">
                            Corregir y reintentar
                          </Link>
                        )}
                        {inv.status === "Draft" && canAuthorize && !fiscalEnabled && (
                          <span className="muted">Emisión ARCA deshabilitada</span>
                        )}
                        <button
                          type="button"
                          className="btn ghost compact"
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
