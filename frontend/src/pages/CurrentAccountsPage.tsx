import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CustomerSummary, Invoice, PurchaseInvoice, PaymentOrder } from "../api/types";

type Receipt = {
  id: string;
  customerId?: string;
  amount: number;
  currency: string;
  receiptDateUtc: string;
  receiptNumber: string;
  description: string;
};

type TabMode = "customers" | "suppliers" | "dual";

type LedgerItem = {
  date: string;
  type: string;
  number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  source: "sale" | "purchase" | "collection" | "payment";
};

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);

export function CurrentAccountsPage() {
  const [tab, setTab] = useState<TabMode>("customers");
  const [entities, setEntities] = useState<CustomerSummary[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<Invoice[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [query, setQuery] = useState("");
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected entity for Ledger (Mayor de Cuenta Corriente)
  const [ledgerEntity, setLedgerEntity] = useState<CustomerSummary | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, sInv, pInv, rList, pList] = await Promise.all([
        api.listCustomers("", ""), // all directory entities (customers, suppliers, both)
        api.listInvoices("", ""),
        api.listPurchaseInvoices("", "").catch(() => [] as PurchaseInvoice[]),
        api.listCollectionReceipts().catch(() => [] as Receipt[]),
        api.listPaymentOrders().catch(() => [] as PaymentOrder[])
      ]);

      setEntities(cRes.items || []);
      setSalesInvoices(sInv || []);
      setPurchaseInvoices(pInv || []);
      setReceipts(rList || []);
      setPaymentOrders(pList || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la información financiera.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Compute stats per entity
  const accountRows = useMemo(() => {
    return entities.map((entity) => {
      const isCust = entity.isCustomer;
      const isSupp = entity.isSupplier;

      // Customer calculations (Receivables)
      const custInvoices = salesInvoices.filter((i) => i.customerId === entity.id);
      const custReceipts = receipts.filter((r) => r.customerId === entity.id);
      const billedSales = custInvoices.reduce((s, i) => s + (i.total || 0), 0);
      const collectedSales = custReceipts.reduce((s, r) => s + (r.amount || 0), 0);
      const receivableBalance = billedSales - collectedSales;

      // Supplier calculations (Payables)
      const suppInvoices = purchaseInvoices.filter((p) => p.supplierId === entity.id);
      const suppPayments = paymentOrders.filter((po) => po.supplierId === entity.id);
      const billedPurchases = suppInvoices.reduce((s, p) => s + (p.total || 0), 0);
      const paidPurchases = suppPayments.reduce((s, po) => s + (po.amount || 0), 0);
      const payableBalance = billedPurchases - paidPurchases;

      // Dual Net Balance
      // (What they owe us - What we owe them)
      const netBalance = receivableBalance - payableBalance;

      return {
        entity,
        isCust,
        isSupp,
        isDual: isCust && isSupp,
        // Sales
        custInvoicesCount: custInvoices.length,
        billedSales,
        collectedSales,
        receivableBalance,
        // Purchases
        suppInvoicesCount: suppInvoices.length,
        billedPurchases,
        paidPurchases,
        payableBalance,
        // Net
        netBalance
      };
    });
  }, [entities, salesInvoices, purchaseInvoices, receipts, paymentOrders]);

  // Filtered rows depending on active tab
  const filteredRows = useMemo(() => {
    const q = query.toLowerCase().trim();

    return accountRows.filter((row) => {
      const nameMatch =
        (row.entity.tradeName || "").toLowerCase().includes(q) ||
        (row.entity.legalName || "").toLowerCase().includes(q) ||
        (row.entity.documentNumber || "").toLowerCase().includes(q);

      if (!nameMatch) return false;

      if (tab === "customers") {
        if (!row.isCust) return false;
        if (onlyWithBalance && Math.abs(row.receivableBalance) <= 0.01) return false;
        return true;
      }

      if (tab === "suppliers") {
        if (!row.isSupp) return false;
        if (onlyWithBalance && Math.abs(row.payableBalance) <= 0.01) return false;
        return true;
      }

      if (tab === "dual") {
        if (!row.isDual) return false;
        if (onlyWithBalance && Math.abs(row.netBalance) <= 0.01) return false;
        return true;
      }

      return true;
    });
  }, [accountRows, tab, query, onlyWithBalance]);

  // Global KPI totals
  const totalReceivables = useMemo(
    () => accountRows.filter((r) => r.isCust).reduce((s, r) => s + r.receivableBalance, 0),
    [accountRows]
  );
  const totalPayables = useMemo(
    () => accountRows.filter((r) => r.isSupp).reduce((s, r) => s + r.payableBalance, 0),
    [accountRows]
  );
  const netGlobalBalance = totalReceivables - totalPayables;
  const dualCount = useMemo(() => accountRows.filter((r) => r.isDual).length, [accountRows]);

  // Generate Chronological Ledger for selected entity
  const ledgerHistory = useMemo(() => {
    if (!ledgerEntity) return [];

    const history: Array<{
      date: string;
      type: string;
      number: string;
      description: string;
      debit: number;
      credit: number;
      source: "sale" | "purchase" | "collection" | "payment";
    }> = [];

    // Sales invoices (Debit to customer: + Deuda del cliente)
    salesInvoices
      .filter((i) => i.customerId === ledgerEntity.id)
      .forEach((i) => {
        history.push({
          date: i.issueDate || i.createdAtUtc,
          type: `Factura Venta (${i.invoiceType || "B"})`,
          number: `${String(i.pointOfSale).padStart(4, "0")}-${String(i.invoiceNumber).padStart(8, "0")}`,
          description: i.notes || "Facturación de venta",
          debit: i.total,
          credit: 0,
          source: "sale"
        });
      });

    // Collection receipts (Credit to customer: - Deuda del cliente)
    receipts
      .filter((r) => r.customerId === ledgerEntity.id)
      .forEach((r) => {
        history.push({
          date: r.receiptDateUtc,
          type: "Recibo de Cobro",
          number: r.receiptNumber,
          description: r.description || "Cobranza recibida",
          debit: 0,
          credit: r.amount,
          source: "collection"
        });
      });

    // Purchase invoices (Credit to supplier: + Deuda nuestra con el proveedor)
    purchaseInvoices
      .filter((p) => p.supplierId === ledgerEntity.id)
      .forEach((p) => {
        history.push({
          date: p.issueDate || p.createdAtUtc,
          type: `Factura Compra (${p.invoiceType || "A"})`,
          number: `${String(p.pointOfSale).padStart(4, "0")}-${String(p.invoiceNumber).padStart(8, "0")}`,
          description: p.notes || "Factura de proveedor",
          debit: 0,
          credit: p.total,
          source: "purchase"
        });
      });

    // Payment orders (Debit to supplier: - Deuda nuestra con el proveedor)
    paymentOrders
      .filter((po) => po.supplierId === ledgerEntity.id)
      .forEach((po) => {
        history.push({
          date: po.paymentDateUtc || po.createdAtUtc,
          type: "Orden de Pago",
          number: po.orderNumber,
          description: po.notes || "Pago emitido a proveedor",
          debit: po.amount,
          credit: 0,
          source: "payment"
        });
      });

    // Sort by date ascending
    history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let running = 0;
    const computed: LedgerItem[] = [];

    for (const item of history) {
      if (item.source === "sale") running += item.debit;
      else if (item.source === "collection") running -= item.credit;
      else if (item.source === "purchase") running -= item.credit; // Payable increases liability
      else if (item.source === "payment") running += item.debit; // Payment reduces liability

      computed.push({
        ...item,
        balance: running
      });
    }

    return computed;
  }, [ledgerEntity, salesInvoices, purchaseInvoices, receipts, paymentOrders]);

  return (
    <div className="page-wide">
      {/* Header */}
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · GESTIÓN COMERCIAL Y TESORERÍA</span>
          <h1>Cuentas Corrientes Unificadas</h1>
          <p className="muted">
            Monitoreo en tiempo real de saldos a cobrar (clientes), a pagar (proveedores) y compensación dual.
          </p>
        </div>
        <div className="toolbar" style={{ gap: 10 }}>
          <button className="btn btn-outline" onClick={() => void loadData()} disabled={loading}>
            ↻ Actualizar
          </button>
          <Link className="btn btn-outline" to="/finanzas/cobranzas">
            💵 + Registrar Cobro
          </Link>
          <Link className="btn" to="/finanzas/pagos/nueva">
            💳 + Emitir Orden de Pago
          </Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* KPI Cards */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="card pad" style={{ borderLeft: "4px solid #10b981" }}>
          <span className="muted" style={{ fontSize: "0.82rem", textTransform: "uppercase", fontWeight: 700 }}>
            👥 Total a Cobrar (Clientes)
          </span>
          <h2 style={{ margin: "6px 0 0 0", color: "#059669", fontSize: "1.6rem" }}>
            {money(totalReceivables)}
          </h2>
          <small className="muted">
            {accountRows.filter((r) => r.isCust && r.receivableBalance > 0).length} clientes con saldo a favor
          </small>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #ef4444" }}>
          <span className="muted" style={{ fontSize: "0.82rem", textTransform: "uppercase", fontWeight: 700 }}>
            🏢 Total a Pagar (Proveedores)
          </span>
          <h2 style={{ margin: "6px 0 0 0", color: "#dc2626", fontSize: "1.6rem" }}>
            {money(totalPayables)}
          </h2>
          <small className="muted">
            {accountRows.filter((r) => r.isSupp && r.payableBalance > 0).length} proveedores con facturas adeudadas
          </small>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #3b82f6" }}>
          <span className="muted" style={{ fontSize: "0.82rem", textTransform: "uppercase", fontWeight: 700 }}>
            🔀 Posición Neta Comercial
          </span>
          <h2
            style={{
              margin: "6px 0 0 0",
              color: netGlobalBalance >= 0 ? "#059669" : "#dc2626",
              fontSize: "1.6rem"
            }}
          >
            {money(netGlobalBalance)}
          </h2>
          <small className="muted">
            {dualCount} entidades con perfil dual (Cliente + Proveedor)
          </small>
        </div>
      </div>

      {/* Main Container */}
      <section className="card pad">
        {/* Navigation Tabs */}
        <div className="toolbar" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--border, #e2e8f0)", paddingBottom: 14, marginBottom: 16 }}>
          <div className="segmented" style={{ display: "flex", gap: 6 }}>
            <button
              className={`btn btn-sm ${tab === "customers" ? "primary" : "ghost"}`}
              onClick={() => setTab("customers")}
              style={{ fontWeight: tab === "customers" ? 700 : 500 }}
            >
              👥 Clientes ({accountRows.filter((r) => r.isCust).length})
            </button>
            <button
              className={`btn btn-sm ${tab === "suppliers" ? "primary" : "ghost"}`}
              onClick={() => setTab("suppliers")}
              style={{ fontWeight: tab === "suppliers" ? 700 : 500 }}
            >
              🏢 Proveedores ({accountRows.filter((r) => r.isSupp).length})
            </button>
            <button
              className={`btn btn-sm ${tab === "dual" ? "primary" : "ghost"}`}
              onClick={() => setTab("dual")}
              style={{ fontWeight: tab === "dual" ? 700 : 500 }}
            >
              🔀 Cuentas Duales / Compensación ({dualCount})
            </button>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onlyWithBalance}
              onChange={(e) => setOnlyWithBalance(e.target.checked)}
            />
            <span style={{ fontSize: "0.88rem" }}>Solo con saldo pendiente</span>
          </label>
        </div>

        {/* Filter / Search Bar */}
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <label style={{ flex: 1, minWidth: 280 }}>
            Buscar por razón social, nombre de fantasía o CUIT
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej.: Transportes del Sur, 30-71123456-9..."
            />
          </label>
        </div>

        {/* Tables */}
        {tab === "customers" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente / Razón Social</th>
                  <th>CUIT / Doc</th>
                  <th style={{ textAlign: "center" }}>Comprobantes</th>
                  <th style={{ textAlign: "right" }}>Facturado</th>
                  <th style={{ textAlign: "right" }}>Cobrado</th>
                  <th style={{ textAlign: "right" }}>Saldo a Cobrar</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      {loading ? "Cargando cuentas corrientes..." : "No se encontraron clientes para los filtros aplicados."}
                    </td>
                  </tr>
                ) : (
                  filteredRows
                    .sort((a, b) => b.receivableBalance - a.receivableBalance)
                    .map((row) => {
                      const hasBalance = row.receivableBalance > 0.01;
                      return (
                        <tr
                          key={row.entity.id}
                          style={{
                            background: hasBalance ? "rgba(245, 158, 11, 0.03)" : undefined
                          }}
                        >
                          <td>
                            <strong>{row.entity.tradeName || row.entity.legalName}</strong>
                            {row.isDual && (
                              <span
                                className="badge ok"
                                style={{
                                  marginLeft: 8,
                                  fontSize: "0.7rem",
                                  background: "#dbeafe",
                                  color: "#1e40af"
                                }}
                              >
                                🔀 Dual (Prov)
                              </span>
                            )}
                            <small className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                              {row.entity.legalName && row.entity.legalName !== row.entity.tradeName ? row.entity.legalName : ""}
                            </small>
                          </td>
                          <td>
                            <code>{row.entity.documentNumber || "Sin CUIT"}</code>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span className="badge">{row.custInvoicesCount} fct</span>
                          </td>
                          <td style={{ textAlign: "right" }}>{money(row.billedSales)}</td>
                          <td style={{ textAlign: "right", color: "#059669" }}>{money(row.collectedSales)}</td>
                          <td style={{ textAlign: "right" }}>
                            <strong
                              style={{
                                color: row.receivableBalance > 0.01 ? "#d97706" : "#059669",
                                fontSize: "0.95rem"
                              }}
                            >
                              {money(row.receivableBalance)}
                            </strong>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div className="toolbar" style={{ justifyContent: "center", gap: 6 }}>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => setLedgerEntity(row.entity)}
                                title="Ver extracto y mayor cronológico de cuenta corriente"
                              >
                                👁️ Mayor
                              </button>
                              <Link
                                className="btn btn-sm"
                                to={`/finanzas/cobranzas?customerId=${row.entity.id}`}
                                title="Registrar cobranza para este cliente"
                              >
                                💵 Cobrar
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "suppliers" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proveedor / Razón Social</th>
                  <th>CUIT / Doc</th>
                  <th style={{ textAlign: "center" }}>Facturas Compra</th>
                  <th style={{ textAlign: "right" }}>Total Comprado</th>
                  <th style={{ textAlign: "right" }}>Total Pagado</th>
                  <th style={{ textAlign: "right" }}>Saldo Adeudado</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      {loading ? "Cargando cuentas corrientes..." : "No se encontraron proveedores para los filtros aplicados."}
                    </td>
                  </tr>
                ) : (
                  filteredRows
                    .sort((a, b) => b.payableBalance - a.payableBalance)
                    .map((row) => {
                      const hasDebt = row.payableBalance > 0.01;
                      return (
                        <tr
                          key={row.entity.id}
                          style={{
                            background: hasDebt ? "rgba(239, 68, 68, 0.03)" : undefined
                          }}
                        >
                          <td>
                            <strong>{row.entity.tradeName || row.entity.legalName}</strong>
                            {row.isDual && (
                              <span
                                className="badge ok"
                                style={{
                                  marginLeft: 8,
                                  fontSize: "0.7rem",
                                  background: "#dbeafe",
                                  color: "#1e40af"
                                }}
                              >
                                🔀 Dual (Cli)
                              </span>
                            )}
                            <small className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                              {row.entity.legalName && row.entity.legalName !== row.entity.tradeName ? row.entity.legalName : ""}
                            </small>
                          </td>
                          <td>
                            <code>{row.entity.documentNumber || "Sin CUIT"}</code>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span className="badge">{row.suppInvoicesCount} fct</span>
                          </td>
                          <td style={{ textAlign: "right" }}>{money(row.billedPurchases)}</td>
                          <td style={{ textAlign: "right", color: "#059669" }}>{money(row.paidPurchases)}</td>
                          <td style={{ textAlign: "right" }}>
                            <strong
                              style={{
                                color: row.payableBalance > 0.01 ? "#dc2626" : "#059669",
                                fontSize: "0.95rem"
                              }}
                            >
                              {money(row.payableBalance)}
                            </strong>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div className="toolbar" style={{ justifyContent: "center", gap: 6 }}>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => setLedgerEntity(row.entity)}
                                title="Ver extracto y mayor cronológico de compras y pagos"
                              >
                                👁️ Mayor
                              </button>
                              <Link
                                className="btn btn-sm"
                                to={`/finanzas/pagos/nueva?supplierId=${row.entity.id}`}
                                title="Emitir Orden de Pago a este proveedor"
                              >
                                💳 Pagar
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "dual" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entidad (Cliente + Proveedor)</th>
                  <th>CUIT</th>
                  <th style={{ textAlign: "right" }}>A Cobrar (+)</th>
                  <th style={{ textAlign: "right" }}>A Pagar (−)</th>
                  <th style={{ textAlign: "right" }}>Saldo Neto Consolidado</th>
                  <th style={{ textAlign: "center" }}>Situación</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      {loading ? "Cargando..." : "No se registraron entidades con perfil dual (cliente y proveedor a la vez)."}
                    </td>
                  </tr>
                ) : (
                  filteredRows
                    .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance))
                    .map((row) => {
                      const net = row.netBalance;
                      return (
                        <tr key={row.entity.id}>
                          <td>
                            <strong>{row.entity.tradeName || row.entity.legalName}</strong>
                            <small className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                              {row.entity.legalName}
                            </small>
                          </td>
                          <td>
                            <code>{row.entity.documentNumber || "Sin CUIT"}</code>
                          </td>
                          <td style={{ textAlign: "right", color: "#059669", fontWeight: 600 }}>
                            {money(row.receivableBalance)}
                          </td>
                          <td style={{ textAlign: "right", color: "#dc2626", fontWeight: 600 }}>
                            {money(row.payableBalance)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <strong
                              style={{
                                fontSize: "1rem",
                                color: net > 0.01 ? "#059669" : net < -0.01 ? "#dc2626" : "#64748b"
                              }}
                            >
                              {net > 0 ? `+${money(net)}` : money(net)}
                            </strong>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {net > 0.01 ? (
                              <span className="badge ok" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#065f46" }}>
                                🟢 A cobrar neto
                              </span>
                            ) : net < -0.01 ? (
                              <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#991b1b" }}>
                                🔴 A pagar neto
                              </span>
                            ) : (
                              <span className="badge">⚖️ Saldada / Equilibrada</span>
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div className="toolbar" style={{ justifyContent: "center", gap: 6 }}>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => setLedgerEntity(row.entity)}
                                title="Ver mayor unificado"
                              >
                                👁️ Mayor
                              </button>
                              <Link
                                className="btn btn-outline btn-sm"
                                to={`/finanzas/cobranzas?customerId=${row.entity.id}`}
                                title="Cobrar"
                              >
                                💵 Cobrar
                              </Link>
                              <Link
                                className="btn btn-sm"
                                to={`/finanzas/pagos/nueva?supplierId=${row.entity.id}`}
                                title="Pagar"
                              >
                                💳 Pagar
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal / Drawer de Mayor de Cuenta Corriente */}
      {ledgerEntity && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20
          }}
        >
          <div
            className="card pad"
            style={{
              width: "100%",
              maxWidth: 980,
              maxHeight: "90vh",
              overflowY: "auto",
              backgroundColor: "var(--surface, #ffffff)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              borderRadius: 8
            }}
          >
            <div className="toolbar" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--border, #e2e8f0)", paddingBottom: 12 }}>
              <div>
                <span className="eyebrow">ESTRACTO HISTÓRICO · MAYOR DE CUENTA CORRIENTE</span>
                <h2 style={{ margin: 0 }}>
                  {ledgerEntity.tradeName || ledgerEntity.legalName}
                </h2>
                <p className="muted" style={{ margin: "2px 0 0 0" }}>
                  CUIT: {ledgerEntity.documentNumber || "Sin CUIT"} · {ledgerEntity.isCustomer ? "Cliente " : ""}{ledgerEntity.isSupplier ? "Proveedor" : ""}
                </p>
              </div>
              <button className="btn btn-outline" onClick={() => setLedgerEntity(null)}>
                ✕ Cerrar
              </button>
            </div>

            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo Comprobante</th>
                    <th>Número</th>
                    <th>Descripción / Notas</th>
                    <th style={{ textAlign: "right" }}>Débito (+)</th>
                    <th style={{ textAlign: "right" }}>Crédito (−)</th>
                    <th style={{ textAlign: "right" }}>Saldo Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                        No hay movimientos históricos registrados para esta entidad.
                      </td>
                    </tr>
                  ) : (
                    ledgerHistory.map((item, idx) => (
                      <tr key={idx}>
                        <td>{new Date(item.date).toLocaleDateString("es-AR")}</td>
                        <td>
                          <strong>{item.type}</strong>
                        </td>
                        <td>
                          <code>{item.number}</code>
                        </td>
                        <td>{item.description}</td>
                        <td style={{ textAlign: "right", color: item.debit > 0 ? "#059669" : "inherit" }}>
                          {item.debit > 0 ? money(item.debit) : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: item.credit > 0 ? "#dc2626" : "inherit" }}>
                          {item.credit > 0 ? money(item.credit) : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>
                          {money(item.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 20, gap: 10 }}>
              {ledgerEntity.isCustomer && (
                <Link className="btn btn-outline" to={`/finanzas/cobranzas?customerId=${ledgerEntity.id}`}>
                  💵 Registrar Cobranza
                </Link>
              )}
              {ledgerEntity.isSupplier && (
                <Link className="btn" to={`/finanzas/pagos/nueva?supplierId=${ledgerEntity.id}`}>
                  💳 Emitir Orden de Pago
                </Link>
              )}
              <button className="btn btn-outline" onClick={() => setLedgerEntity(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
