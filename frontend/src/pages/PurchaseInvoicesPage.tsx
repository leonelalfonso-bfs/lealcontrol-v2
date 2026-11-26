import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PurchaseArcaCheck } from "../api/client";
import { type PurchaseInvoice } from "../api/types";
import { type PurchaseReception } from "../api/types";
import { SearchField } from "../components/ui/SearchField";
import { matchesSearch, parseSearch } from "../lib/search";
import { paidOf } from "../lib/purchasePayments";
import { InvoiceCategoriesModal } from "../components/purchases/InvoiceCategoriesModal";

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n || 0);

export function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [receptions, setReceptions] = useState<PurchaseReception[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [categorizing, setCategorizing] = useState<PurchaseInvoice | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");
  const [paymentFilter, setPaymentFilter] = useState<string>("All");
  const [arcaChecks, setArcaChecks] = useState<Record<string, PurchaseArcaCheck>>({});
  const [arcaBusy, setArcaBusy] = useState<string | null>(null);
  const [arcaMsg, setArcaMsg] = useState<string | null>(null);

  const loadArcaChecks = () => api.listPurchaseArcaChecks()
    .then((rows) => setArcaChecks(Object.fromEntries(rows.map((r) => [r.purchaseInvoiceId, r]))))
    .catch(() => setArcaChecks({}));

  const checkOne = async (id: string) => {
    setArcaBusy(id);
    try {
      const r = await api.checkPurchaseInvoiceInArca(id);
      setArcaChecks((prev) => ({ ...prev, [id]: r }));
    } catch (err: any) {
      setError(err.message || "No se pudo constatar en ARCA.");
    } finally {
      setArcaBusy(null);
    }
  };

  // Las del mes anterior y el actual que todavía no quedaron constatadas.
  const checkPending = async () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    setArcaBusy("all");
    setArcaMsg(null);
    try {
      const r = await api.checkPurchaseInvoicesInArca(`${from}T00:00:00Z`, now.toISOString());
      setArcaMsg(r.unavailable
        ? `ARCA no respondió: ${r.unavailable}`
        : r.checked === 0
          ? "✓ No quedan facturas por constatar desde el mes pasado."
          : `✓ ${r.checked} constatadas: ${r.approved} correctas, ${r.rejected} que ARCA no reconoce, ${r.notCheckable} sin CAE o sin CUIT.`);
      await loadArcaChecks();
    } catch (err: any) {
      setError(err.message || "No se pudo constatar en ARCA.");
    } finally {
      setArcaBusy(null);
    }
  };

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
    void loadArcaChecks();
  }, []);

  // Enrich purchase invoices with payment and days calculations
  const enrichedInvoices = useMemo(() => {
    const now = new Date().getTime();

    return invoices.map((inv) => {
      const totalPagado = paidOf(inv, paymentOrders);
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
    const tokens = parseSearch(searchTerm);
    return enrichedInvoices.filter((inv) => {
      const matchSearch = matchesSearch(tokens, inv.formattedNumber, inv.supplierName, inv.supplierDocument);

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
          <button type="button" className="btn btn-outline" disabled={arcaBusy !== null} onClick={() => void checkPending()}
            title="Confirma en ARCA que cada factura del mes pasado y de este mes existe con ese CAE, número, fecha y total">
            {arcaBusy === "all" ? "Constatando…" : "🔎 Constatar en ARCA"}
          </button>
          <Link to="/compras/facturas/nueva" className="btn btn-primary">
            ＋ Cargar Factura Manual
          </Link>
        </div>
      </div>

      {arcaMsg && <div className="alert" style={{ marginBottom: 16 }}>{arcaMsg}</div>}
      {error && (
        <div className="alert t-danger" style={{ marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPIs Summary */}
      <div className="kpi kpi-4" style={{ marginBottom: 20 }}>
        <div className="card">
          <span className="muted">Total Facturas de Compra</span>
          <strong>{invoices.length}</strong>
          <small className="muted t-small" style={{ display: "block", marginTop: 2 }}>
            Comprobantes de proveedores
          </small>
        </div>
        <div className="card">
          <span className="muted">Total Compras (ARS)</span>
          <strong>{money(totalArs, "ARS")}</strong>
          <small className="t-small t-strong" style={{ display: "block", marginTop: 2, color: pendingArs > 0 ? "var(--lc-danger)" : "var(--lc-ok)" }}>
            Pendiente de Pago: {money(pendingArs, "ARS")}
          </small>
        </div>
        <div className="card">
          <span className="muted">Total Compras (USD)</span>
          <strong className="t-info">{money(totalUsd, "USD")}</strong>
          <small className="t-small t-strong" style={{ display: "block", marginTop: 2, color: pendingUsd > 0 ? "var(--lc-danger)" : "var(--lc-ok)" }}>
            Pendiente de Pago: {money(pendingUsd, "USD")}
          </small>
        </div>
        <div className="card">
          <span className="muted">Estado de Pagos</span>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <span className="t-ok t-strong">
              🟢 {enrichedInvoices.filter((i) => i.isPaid).length} Pagadas
            </span>
            <span className="t-danger t-strong">
              🔴 {enrichedInvoices.filter((i) => !i.isPaid).length} Pendientes
            </span>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="card pad toolbar" style={{ marginBottom: 20, justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <SearchField
            value={searchTerm}
            onChange={setSearchTerm}
            resultCount={filteredInvoices.length}
            placeholder="Buscar por número, proveedor o CUIT"
            style={{ flex: "1 1 320px", maxWidth: 520 }}
          />

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{ width: 160 }}
          >
            <option value="All">Todos los Tipos</option>
            <option value="A">Factura A</option>
            <option value="B">Factura B</option>
            <option value="C">Factura C</option>
            <option value="M">Factura M</option>
            <option value="ND_A">Nota de Débito A</option>
            <option value="NC_A">Nota de Crédito A</option>
            <option value="NC_B">Nota de Crédito B</option>
            <option value="TF_A">Tique factura A</option>
            <option value="TF_B">Tique factura B</option>
            <option value="OC_A">Otros comp. RG 1415 (con IVA)</option>
            <option value="OC_B">Otros comp. RG 1415 (sin IVA)</option>
            <option value="X">Compra sin factura (X)</option>
          </select>

          {/* Payment Status Filter */}
          <select className="t-strong"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
           style={{ width: 180 }}>
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
          <p className="pad muted t-center" style={{ padding: 32 }}>
            No se encontraron facturas de compra para los filtros seleccionados.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>N° Comprobante</th>
                  <th>Fecha Emisión</th>
                  <th>Proveedor</th>
                  <th className="t-right">Total</th>
                  <th className="t-center">CAE</th>
                  <th className="t-center">Estado Pago & Días</th>
                  <th className="t-center">Ingreso Stock</th>
                  <th className="t-center">Acciones</th>
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
                     style={{ background: hasInventoryItems && !isReceived ? "rgba(245, 158, 11, 0.03)" : undefined }}>
                      <td>
                        <span className="t-strong t-small t-info" style={{ padding: "3px 8px", borderRadius: "6px", background: "var(--lc-surface-2)" }}>
                          {inv.invoiceType}
                        </span>
                      </td>
                      <td>
                        <Link className="t-strong t-mono t-info"
                          to={`/compras/facturas/${inv.id}`}
                          style={{ textDecoration: "none" }}
                          title="Ver detalle y comprobante completo"
                        >
                          {inv.formattedNumber}
                        </Link>
                      </td>
                      <td>
                        <div>{new Date(inv.issueDate).toLocaleDateString("es-AR")}</div>
                        {inv.imputationPeriod && inv.imputationPeriod.slice(0, 7) !== inv.issueDate.slice(0, 7) && (
                          <small className="t-small t-violet" style={{ display: "block" }}>
                            Imputada a {inv.imputationPeriod.slice(5, 7)}/{inv.imputationPeriod.slice(0, 4)}
                          </small>
                        )}
                        <small className="muted t-small" style={{ color: inv.daysOverdue > 0 ? "#dc2626" : "inherit" }}>
                          Vto: {new Date(inv.dueDate).toLocaleDateString("es-AR")}
                        </small>
                      </td>
                      <td>
                        <div className="t-strong">{inv.supplierName}</div>
                        <div className="t-small muted">CUIT: {inv.supplierDocument}</div>
                      </td>
                      <td className="t-right t-strong t-mono">
                        {money(inv.total, inv.currency)}
                        <div className="muted t-small" style={{ fontWeight: "normal" }}>
                          Neto: {money(inv.subtotal, inv.currency)}
                        </div>
                      </td>
                      <td className="t-center">
                        {inv.cae ? (
                          <span className="t-small t-mono t-ok" style={{ padding: "2px 6px", background: "var(--lc-ok-bg)", borderRadius: "4px" }}>
                            {inv.cae}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        {inv.status !== "Cancelled" && (() => {
                          const check = arcaChecks[inv.id];
                          const label = check?.outcome === "Approved" ? { text: "✓ Constatada en ARCA", color: "var(--lc-ok)" }
                            : check?.outcome === "Rejected" ? { text: "✗ ARCA no la reconoce", color: "var(--lc-danger)" }
                            : check?.outcome === "NotCheckable" ? { text: "No se puede constatar", color: "var(--lc-warn)" }
                            : check?.outcome === "Unavailable" ? { text: "No se pudo consultar", color: "var(--lc-ink-3)" } : null;
                          return (
                            <div className="t-small" style={{ marginTop: 4 }}>
                              {label && <span className="t-strong" title={`${check!.detail} · ${new Date(check!.checkedAt).toLocaleString("es-AR")}`} style={{ color: label.color }}>{label.text}</span>}
                              {check && check.outcome !== "Approved" && (
                                <div className="muted" style={{ maxWidth: 220, margin: "2px auto 0", lineHeight: 1.3 }}>{check.detail}</div>
                              )}
                              {check?.outcome !== "Approved" && (
                                <button type="button" className="btn ghost compact" style={{ marginLeft: 4 }} disabled={arcaBusy !== null} onClick={() => void checkOne(inv.id)}>
                                  {arcaBusy === inv.id ? "…" : check ? "Reintentar" : "Constatar"}
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Estado de Pago y Días sin pagar */}
                      <td className="t-center">
                        {inv.isPaid ? (
                          <div>
                            <span
                              className="badge ok t-ok t-strong"
                             style={{ background: "rgba(16, 185, 129, 0.15)", padding: "4px 8px" }}>
                              🟢 Pagada
                            </span>
                            <div className="muted t-small" style={{ marginTop: 2 }}>
                              ✓ 100% saldada
                            </div>
                          </div>
                        ) : inv.isPartial ? (
                          <div>
                            <span
                              className="badge warn t-warn t-strong"
                             style={{ background: "rgba(245, 158, 11, 0.18)", padding: "4px 8px" }}>
                              🟡 Pago Parcial
                            </span>
                            <div className="t-small t-danger t-strong" style={{ marginTop: 2 }}>
                              Resta: {money(inv.saldoPendiente, inv.currency)}
                            </div>
                            <div className="muted t-small">
                              {inv.daysSinceIssue === 0 ? "Emitida hoy" : `${inv.daysSinceIssue}d sin pagar`}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span
                              className="badge off t-danger t-strong"
                             style={{ background: "rgba(239, 68, 68, 0.12)", padding: "4px 8px" }}>
                              🔴 Pendiente
                            </span>
                            <div className="t-small"
                             style={{ fontWeight: inv.daysOverdue > 0 ? 700 : 500, color: inv.daysOverdue > 0 ? "#dc2626" : "var(--ink-soft)", marginTop: 2 }}>
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
                      <td className="t-center">
                        {inv.status === "Cancelled" ? (
                          <span className="muted t-small">—</span>
                        ) : isReceived ? (
                          <span
                            className="badge ok t-small t-ok t-strong"
                            title="La mercadería ya fue ingresada a stock mediante remito"
                           style={{ padding: "4px 10px", borderRadius: "12px", background: "rgba(16, 185, 129, 0.15)" }}>
                            ✓ Stock Recibido
                          </span>
                        ) : hasInventoryItems ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "5px", alignItems: "center" }}>
                            <span
                              className="badge warn t-small t-warn t-strong"
                             style={{ padding: "2px 8px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.18)" }}>
                              📥 Recepción Pendiente
                            </span>
                            {openRecsForSupplier.length > 0 && (
                              <select className="t-small"
                                defaultValue=""
                                style={{ maxWidth: 180 }}
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
                          <span className="muted t-small">
                            📋 No inventariable
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="t-center">
                        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                          {inv.status !== "Cancelled" && !inv.isPaid && (
                            <Link
                              to={`/finanzas/pagos/nueva?supplierId=${inv.supplierId}`}
                              className="btn compact"
                              title="Emitir orden de pago al proveedor"
                            >
                              💳 Pagar
                            </Link>
                          )}
                          <Link
                            to={`/compras/facturas/${inv.id}`}
                            className="btn btn-outline compact"
                            title="Ver comprobante completo con detalle de renglones y cantidades"
                          >
                            👁️ Ver
                          </Link>
                          {inv.status !== "Cancelled" && (
                            <button
                              type="button"
                              className="btn btn-outline compact"
                              title="Libro IVA Compras y asiento: a qué mes se imputa"
                              onClick={() => {
                                const current = (inv.imputationPeriod ?? inv.issueDate).slice(0, 7);
                                const value = window.prompt("Período de imputación (AAAA-MM):", current);
                                if (!value || value === current) return;
                                if (!/^\d{4}-\d{2}$/.test(value.trim())) return setError("Escribí el período como AAAA-MM, por ejemplo 2026-11.");
                                void (async () => {
                                  try {
                                    await api.setPurchaseImputationPeriod(inv.id, `${value.trim()}-01T00:00:00Z`);
                                    await loadData();
                                  } catch (err: any) {
                                    setError(err.message || "No se pudo cambiar el período.");
                                  }
                                })();
                              }}
                            >
                              📅 Período
                            </button>
                          )}
                          {inv.status !== "Cancelled" && inv.invoiceType !== "X" && (
                            <button
                              type="button"
                              className="btn btn-outline compact"
                              title="Rubro de cada renglón (Producto/Gasto del Libro IVA Compras)"
                              onClick={() => setCategorizing(inv)}
                            >
                              🏷 Rubro{inv.items.length > 0 && inv.items.every((i) => i.expenseCategoryId) ? " ✓" : ""}
                            </button>
                          )}
                          {inv.status !== "Cancelled" && (
                            <button
                              type="button"
                              className="btn btn-outline compact danger"
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
                            <span className="badge off t-small t-danger">
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

      <InvoiceCategoriesModal invoice={categorizing} onClose={() => setCategorizing(null)} onSaved={() => void loadData()} />
    </div>
  );
}
