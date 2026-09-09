import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { exportToExcel, type ExcelColumn } from "../components/ExcelTools";
import type { CustomerSummary, Invoice, PurchaseInvoice } from "../api/types";

type TabMode = "customers" | "suppliers" | "dual";

type Receipt = {
  id: string;
  customerId?: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  invoiceId?: string;
  invoiceAmount?: number;
  invoiceCurrency?: string;
  invoiceExchangeRate?: number;
  paymentExchangeRate?: number;
  suggestedAdjustmentArs?: number;
  suggestedAdjustmentType?: string;
  receiptDateUtc: string;
  description?: string;
  invoicesSummary?: string;
  status?: string;
  voidReason?: string | null;
  voidedAtUtc?: string | null;
};

type PaymentOrder = {
  id: string;
  supplierId?: string | null;
  orderNumber: string;
  amount: number;
  currency?: string;
  exchangeRate?: number;
  paymentDateUtc: string;
  notes?: string;
  status?: string;
  voidReason?: string | null;
  voidedAtUtc?: string | null;
};

type LedgerItem = {
  date: string;
  type: string;
  number: string;
  description: string;
  originalAmount?: string;
  debit: number;
  credit: number;
  balance: number;
  source: "sale" | "purchase" | "collection" | "payment" | "adjustment" | "void";
  muted?: boolean;
};

const isActiveDoc = (status?: string | null) =>
  (status || "").toLowerCase() !== "voided";

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n || 0);

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
      setReceipts((rList || []) as Receipt[]);
      setPaymentOrders((pList || []) as PaymentOrder[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la información financiera.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Compute stats per entity with exact USD/ARS exchange rates
  const accountRows = useMemo(() => {
    return entities.map((entity) => {
      const isCust = entity.isCustomer;
      const isSupp = entity.isSupplier;

      // Customer calculations (Receivables) — excluir anulados (igual que facturas Cancelled)
      const custInvoices = salesInvoices.filter((i) => i.customerId === entity.id && i.status !== "Cancelled");
      const custReceipts = receipts.filter((r) => r.customerId === entity.id && isActiveDoc(r.status));

      // Billed sales in ARS (converting USD at invoice issuance rate)
      const billedSalesArs = custInvoices.reduce((s, i) => {
        const rate = i.exchangeRate && i.exchangeRate > 0 ? i.exchangeRate : 1;
        return s + (i.currency === "USD" ? (i.total || 0) * rate : (i.total || 0));
      }, 0);

      // Billed sales in USD
      const billedSalesUsd = custInvoices.filter((i) => i.currency === "USD").reduce((s, i) => s + (i.total || 0), 0);

      // Collected sales in ARS
      const collectedSalesArs = custReceipts.reduce((s, r) => {
        if (r.currency === "USD") {
          const rate = r.invoiceExchangeRate || r.paymentExchangeRate || 1;
          return s + (r.amount || 0) * rate;
        }
        return s + (r.amount || 0);
      }, 0);

      // Collected sales in USD
      const collectedSalesUsd = custReceipts.reduce((s, r) => {
        if (r.invoiceAmount && r.invoiceCurrency === "USD") return s + Number(r.invoiceAmount);
        if (r.currency === "USD") return s + Number(r.amount);
        if (r.paymentExchangeRate && r.paymentExchangeRate > 0) return s + (Number(r.amount) / Number(r.paymentExchangeRate));
        return s;
      }, 0);

      // Balances
      const receivableBalanceUsd = Math.max(0, billedSalesUsd - collectedSalesUsd);
      const receivableBalanceArs = billedSalesArs - (collectedSalesArs - (custReceipts.reduce((sum, r) => sum + (r.suggestedAdjustmentArs || 0), 0)));

      // Supplier calculations (Payables) — excluir OP anuladas
      const suppInvoices = purchaseInvoices.filter((p) => p.supplierId === entity.id && p.status !== "Cancelled");
      const suppPayments = paymentOrders.filter((po) => po.supplierId === entity.id && isActiveDoc(po.status));

      const billedPurchasesArs = suppInvoices.reduce((s, p) => {
        const rate = p.exchangeRate && p.exchangeRate > 0 ? p.exchangeRate : 1;
        return s + (p.currency === "USD" ? (p.total || 0) * rate : (p.total || 0));
      }, 0);

      const billedPurchasesUsd = suppInvoices.filter((p) => p.currency === "USD").reduce((s, p) => s + (p.total || 0), 0);

      const paidPurchasesArs = suppPayments.reduce((s, po) => {
        const rate = po.exchangeRate && po.exchangeRate > 0 ? po.exchangeRate : 1;
        return s + (po.currency === "USD" ? (po.amount || 0) * rate : (po.amount || 0));
      }, 0);

      const paidPurchasesUsd = suppPayments.filter((po) => po.currency === "USD").reduce((s, po) => s + (po.amount || 0), 0);

      const payableBalanceUsd = Math.max(0, billedPurchasesUsd - paidPurchasesUsd);
      const payableBalanceArs = billedPurchasesArs - paidPurchasesArs;

      // Dual Net Balance in ARS
      const netBalance = receivableBalanceArs - payableBalanceArs;

      return {
        entity,
        isCust,
        isSupp,
        isDual: isCust && isSupp,
        // Sales
        custInvoicesCount: custInvoices.length,
        billedSalesArs,
        billedSalesUsd,
        collectedSalesArs,
        collectedSalesUsd,
        receivableBalance: receivableBalanceArs,
        receivableBalanceUsd,
        // Purchases
        suppInvoicesCount: suppInvoices.length,
        billedPurchasesArs,
        billedPurchasesUsd,
        paidPurchasesArs,
        paidPurchasesUsd,
        payableBalance: payableBalanceArs,
        payableBalanceUsd,
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
        if (onlyWithBalance && Math.abs(row.receivableBalance) <= 0.01 && row.receivableBalanceUsd <= 0.01) return false;
        return true;
      }

      if (tab === "suppliers") {
        if (!row.isSupp) return false;
        if (onlyWithBalance && Math.abs(row.payableBalance) <= 0.01 && row.payableBalanceUsd <= 0.01) return false;
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
  const totalReceivablesArs = useMemo(
    () => accountRows.filter((r) => r.isCust).reduce((s, r) => s + r.receivableBalance, 0),
    [accountRows]
  );
  const totalReceivablesUsd = useMemo(
    () => accountRows.filter((r) => r.isCust).reduce((s, r) => s + r.receivableBalanceUsd, 0),
    [accountRows]
  );
  const totalPayablesArs = useMemo(
    () => accountRows.filter((r) => r.isSupp).reduce((s, r) => s + r.payableBalance, 0),
    [accountRows]
  );
  const totalPayablesUsd = useMemo(
    () => accountRows.filter((r) => r.isSupp).reduce((s, r) => s + r.payableBalanceUsd, 0),
    [accountRows]
  );

  const netGlobalBalance = totalReceivablesArs - totalPayablesArs;
  const dualCount = useMemo(() => accountRows.filter((r) => r.isDual).length, [accountRows]);

  // Generate Chronological Ledger for selected entity
  const ledgerHistory = useMemo(() => {
    if (!ledgerEntity) return [];

    const history: Array<{
      date: string;
      type: string;
      number: string;
      description: string;
      originalAmount?: string;
      debit: number;
      credit: number;
      source: LedgerItem["source"];
      muted?: boolean;
    }> = [];

    // Sales invoices (Debit to customer: + Deuda del cliente)
    salesInvoices
      .filter((i) => i.customerId === ledgerEntity.id && i.status !== "Cancelled")
      .forEach((i) => {
        const isUsd = i.currency === "USD";
        const rate = i.exchangeRate && i.exchangeRate > 0 ? i.exchangeRate : 1;
        const debitArs = isUsd ? (i.total || 0) * rate : (i.total || 0);

        history.push({
          date: i.issueDate,
          type: `Factura Venta (${i.invoiceType || "B"}${isUsd ? " USD" : ""})`,
          number: `${String(i.pointOfSale).padStart(4, "0")}-${String(i.invoiceNumber).padStart(8, "0")}`,
          description: isUsd ? `Factura en USD @ TC $${rate.toLocaleString("es-AR")}` : i.notes || "Facturación de venta",
          originalAmount: isUsd ? money(i.total, "USD") : undefined,
          debit: debitArs,
          credit: 0,
          source: "sale"
        });
      });

    // Collection receipts: activos impactan saldo; anulados se muestran + contra-asiento
    receipts
      .filter((r) => r.customerId === ledgerEntity.id)
      .forEach((r) => {
        const isUsd = r.currency === "USD";
        const rate = r.invoiceExchangeRate || r.paymentExchangeRate || 1;
        const creditArs = isUsd ? (r.amount || 0) * rate : (r.amount || 0);
        const voided = !isActiveDoc(r.status);

        history.push({
          date: r.receiptDateUtc,
          type: voided ? `Recibo de Cobro ANULADO (${r.currency})` : `Recibo de Cobro (${r.currency})`,
          number: r.receiptNumber,
          description: voided
            ? `Anulado${r.voidReason ? `: ${r.voidReason}` : ""}`
            : r.description || "Cobranza recibida",
          originalAmount: isUsd ? money(r.amount, "USD") : undefined,
          debit: 0,
          credit: creditArs,
          source: "collection",
          muted: voided
        });

        if (voided) {
          history.push({
            date: r.voidedAtUtc || r.receiptDateUtc,
            type: "Anulación de cobro",
            number: r.receiptNumber,
            description: r.voidReason || "Reversa por anulación del recibo",
            originalAmount: isUsd ? money(r.amount, "USD") : undefined,
            debit: creditArs,
            credit: 0,
            source: "void",
            muted: true
          });
        } else if (r.suggestedAdjustmentArs && r.suggestedAdjustmentArs > 0.01) {
          history.push({
            date: r.receiptDateUtc,
            type: "Diferencia de Cambio (ND)",
            number: `Ajuste TC ${r.receiptNumber}`,
            description: `Diferencia de cambio al cobro: TC $${r.paymentExchangeRate} vs TC $${r.invoiceExchangeRate}`,
            debit: r.suggestedAdjustmentArs,
            credit: 0,
            source: "adjustment"
          });
        }
      });

    // Purchase invoices (Credit to supplier: + Deuda nuestra con el proveedor)
    purchaseInvoices
      .filter((p) => p.supplierId === ledgerEntity.id && p.status !== "Cancelled")
      .forEach((p) => {
        const isUsd = p.currency === "USD";
        const rate = p.exchangeRate && p.exchangeRate > 0 ? p.exchangeRate : 1;
        const creditArs = isUsd ? (p.total || 0) * rate : (p.total || 0);

        history.push({
          date: p.issueDate,
          type: `Factura Compra (${p.invoiceType || "A"}${isUsd ? " USD" : ""})`,
          number: `${String(p.pointOfSale).padStart(4, "0")}-${String(p.invoiceNumber).padStart(8, "0")}`,
          description: isUsd ? `Factura Proveedor USD @ TC $${rate.toLocaleString("es-AR")}` : p.notes || "Factura de proveedor",
          originalAmount: isUsd ? money(p.total, "USD") : undefined,
          debit: 0,
          credit: creditArs,
          source: "purchase"
        });
      });

    // Payment orders: activos impactan; anulados + contra-asiento
    paymentOrders
      .filter((po) => po.supplierId === ledgerEntity.id)
      .forEach((po) => {
        const isUsd = po.currency === "USD";
        const rate = po.exchangeRate && po.exchangeRate > 0 ? po.exchangeRate : 1;
        const debitArs = isUsd ? (po.amount || 0) * rate : (po.amount || 0);
        const voided = !isActiveDoc(po.status);

        history.push({
          date: po.paymentDateUtc,
          type: voided ? `Orden de Pago ANULADA (${po.currency || "ARS"})` : `Orden de Pago (${po.currency || "ARS"})`,
          number: po.orderNumber,
          description: voided
            ? `Anulada${po.voidReason ? `: ${po.voidReason}` : ""}`
            : po.notes || "Pago emitido a proveedor",
          originalAmount: isUsd ? money(po.amount, "USD") : undefined,
          debit: debitArs,
          credit: 0,
          source: "payment",
          muted: voided
        });

        if (voided) {
          history.push({
            date: po.voidedAtUtc || po.paymentDateUtc,
            type: "Anulación de pago",
            number: po.orderNumber,
            description: po.voidReason || "Reversa por anulación de la OP",
            originalAmount: isUsd ? money(po.amount, "USD") : undefined,
            debit: 0,
            credit: debitArs,
            source: "void",
            muted: true
          });
        }
      });

    // Sort by date ascending
    history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let running = 0;
    const computed: LedgerItem[] = [];

    for (const item of history) {
      if (item.source === "sale" || item.source === "adjustment") running += item.debit;
      else if (item.source === "collection") running -= item.credit;
      else if (item.source === "purchase") running -= item.credit;
      else if (item.source === "payment") running += item.debit;
      else if (item.source === "void") {
        // Reversa: débito reabre deuda cliente; crédito reabre deuda proveedor
        running += item.debit;
        running -= item.credit;
      }

      computed.push({
        ...item,
        balance: running
      });
    }

    return computed;
  }, [ledgerEntity, salesInvoices, purchaseInvoices, receipts, paymentOrders]);

  const handleExportAccountsExcel = () => {
    const columns: ExcelColumn<any>[] = [
      { key: "tradeName", header: "Razón Social / Fantasía", value: (r) => r.entity.tradeName || r.entity.legalName },
      { key: "cuit", header: "CUIT", value: (r) => r.entity.documentNumber || "" },
      { key: "saldoArs", header: "Saldo Pendiente ARS", value: (r) => tab === "customers" ? r.receivableBalance : tab === "suppliers" ? r.payableBalance : r.netBalance },
      { key: "saldoUsd", header: "Saldo Pendiente USD", value: (r) => tab === "customers" ? r.receivableBalanceUsd : tab === "suppliers" ? r.payableBalanceUsd : 0 }
    ];
    void exportToExcel(`cuentas-corrientes-${tab}`, filteredRows, columns);
  };

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Encabezado */}
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS & TESORERÍA</span>
          <h1>Cuentas Corrientes</h1>
          <p className="muted">
            Gestión integral de saldos a cobrar, deudas a proveedores y posición bi-monetaria (ARS / USD).
          </p>
        </div>
        <div className="toolbar">
          <Link className="btn btn-outline" to="/finanzas/cobranzas">
            💵 Recibos de Cobro
          </Link>
          <Link className="btn btn-outline" to="/finanzas/pagos/nueva">
            💳 Órdenes de Pago
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#f87171", marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* KPIs Globales */}
      <div className="kpi kpi-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <span className="muted">Total a Cobrar Clientes (ARS)</span>
          <strong style={{ fontSize: "1.4rem", color: "#059669" }}>{money(totalReceivablesArs)}</strong>
          {totalReceivablesUsd > 0.01 && (
            <small style={{ display: "block", color: "#2563eb", fontWeight: 700, marginTop: 2 }}>
              + {money(totalReceivablesUsd, "USD")}
            </small>
          )}
        </div>
        <div className="card">
          <span className="muted">Total a Pagar Proveedores (ARS)</span>
          <strong style={{ fontSize: "1.4rem", color: "#dc2626" }}>{money(totalPayablesArs)}</strong>
          {totalPayablesUsd > 0.01 && (
            <small style={{ display: "block", color: "#2563eb", fontWeight: 700, marginTop: 2 }}>
              + {money(totalPayablesUsd, "USD")}
            </small>
          )}
        </div>
        <div className="card">
          <span className="muted">Posición Neta ARS</span>
          <strong
            style={{
              fontSize: "1.4rem",
              color: netGlobalBalance >= 0 ? "#059669" : "#dc2626"
            }}
          >
            {netGlobalBalance >= 0 ? `+${money(netGlobalBalance)}` : money(netGlobalBalance)}
          </strong>
          <small className="muted" style={{ display: "block", marginTop: 2, fontSize: "0.75rem" }}>
            {netGlobalBalance >= 0 ? "Superávit a favor" : "Déficit / Deuda neta"}
          </small>
        </div>
        <div className="card">
          <span className="muted">Cuentas Mixtas (Dual)</span>
          <strong style={{ fontSize: "1.4rem" }}>{dualCount}</strong>
          <small className="muted" style={{ display: "block", marginTop: 2, fontSize: "0.75rem" }}>
            Clientes que son proveedores
          </small>
        </div>
      </div>

      {/* Pestañas de Navegación */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`tab-btn ${tab === "customers" ? "active" : ""}`}
          onClick={() => setTab("customers")}
        >
          👤 Clientes (A Cobrar)
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "suppliers" ? "active" : ""}`}
          onClick={() => setTab("suppliers")}
        >
          🏢 Proveedores (A Pagar)
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === "dual" ? "active" : ""}`}
          onClick={() => setTab("dual")}
        >
          🔄 Cuentas Mixtas (Compensación)
        </button>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <section className="card pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flex: "1 1 300px" }}>
            <input
              type="text"
              placeholder="Buscar por Razón Social, Nombre Fantasía o CUIT..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: "100%", maxWidth: 420, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={onlyWithBalance}
                onChange={(e) => setOnlyWithBalance(e.target.checked)}
              />
              Solo cuentas con saldo pendiente
            </label>
          </div>

          <div className="toolbar" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline compact"
              onClick={handleExportAccountsExcel}
              disabled={filteredRows.length === 0}
            >
              📥 Descargar Excel
            </button>
          </div>
        </div>
      </section>

      {/* Tabla Principal */}
      <section className="card pad">
        {loading ? (
          <div style={{ textAlign: "center", padding: 30 }} className="muted">
            Cargando cuentas corrientes y saldos...
          </div>
        ) : tab === "customers" ? (
          /* TABLA CLIENTES */
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente / Razón Social</th>
                  <th>CUIT</th>
                  <th style={{ textAlign: "right" }}>Facturado (ARS)</th>
                  <th style={{ textAlign: "right" }}>Cobrado (ARS)</th>
                  <th style={{ textAlign: "right" }}>Saldo Pendiente</th>
                  <th style={{ textAlign: "center" }}>Estado</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No se encontraron clientes con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
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
                      <td style={{ textAlign: "right" }}>
                        {money(row.billedSalesArs)}
                        {row.billedSalesUsd > 0.01 && (
                          <small className="muted" style={{ display: "block", fontSize: "0.72rem", color: "#2563eb" }}>
                            ({money(row.billedSalesUsd, "USD")})
                          </small>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {money(row.collectedSalesArs)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong
                          style={{
                            fontSize: "0.95rem",
                            color: row.receivableBalance > 0.01 || row.receivableBalanceUsd > 0.01 ? "#dc2626" : "#059669"
                          }}
                        >
                          {money(row.receivableBalance)}
                        </strong>
                        {row.receivableBalanceUsd > 0.01 && (
                          <span
                            style={{
                              display: "inline-block",
                              marginLeft: 6,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "#dbeafe",
                              color: "#1e40af",
                              fontSize: "0.75rem",
                              fontWeight: 700
                            }}
                          >
                            {money(row.receivableBalanceUsd, "USD")}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {row.receivableBalance > 0.01 || row.receivableBalanceUsd > 0.01 ? (
                          <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#991b1b" }}>
                            🔴 Con Saldo Deudor
                          </span>
                        ) : (
                          <span className="badge ok" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#065f46" }}>
                            🟢 Al Día
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div className="toolbar" style={{ justifyContent: "center", gap: 6 }}>
                          <button
                            className="btn btn-outline compact"
                            onClick={() => setLedgerEntity(row.entity)}
                            title="Ver mayor de movimientos"
                          >
                            👁️ Mayor
                          </button>
                          <Link
                            className="btn compact"
                            to={`/finanzas/cobranzas?customerId=${row.entity.id}`}
                            title="Registrar cobro"
                          >
                            💵 Cobrar
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : tab === "suppliers" ? (
          /* TABLA PROVEEDORES */
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proveedor / Razón Social</th>
                  <th>CUIT</th>
                  <th style={{ textAlign: "right" }}>Facturado (ARS)</th>
                  <th style={{ textAlign: "right" }}>Pagado (ARS)</th>
                  <th style={{ textAlign: "right" }}>Saldo a Pagar</th>
                  <th style={{ textAlign: "center" }}>Estado</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No se encontraron proveedores con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
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
                      <td style={{ textAlign: "right" }}>
                        {money(row.billedPurchasesArs)}
                        {row.billedPurchasesUsd > 0.01 && (
                          <small className="muted" style={{ display: "block", fontSize: "0.72rem", color: "#2563eb" }}>
                            ({money(row.billedPurchasesUsd, "USD")})
                          </small>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {money(row.paidPurchasesArs)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong
                          style={{
                            fontSize: "0.95rem",
                            color: row.payableBalance > 0.01 || row.payableBalanceUsd > 0.01 ? "#dc2626" : "#059669"
                          }}
                        >
                          {money(row.payableBalance)}
                        </strong>
                        {row.payableBalanceUsd > 0.01 && (
                          <span
                            style={{
                              display: "inline-block",
                              marginLeft: 6,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "#dbeafe",
                              color: "#1e40af",
                              fontSize: "0.75rem",
                              fontWeight: 700
                            }}
                          >
                            {money(row.payableBalanceUsd, "USD")}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {row.payableBalance > 0.01 || row.payableBalanceUsd > 0.01 ? (
                          <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#991b1b" }}>
                            🔴 Pendiente de Pago
                          </span>
                        ) : (
                          <span className="badge ok" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#065f46" }}>
                            🟢 Saldado
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div className="toolbar" style={{ justifyContent: "center", gap: 6 }}>
                          <button
                            className="btn btn-outline compact"
                            onClick={() => setLedgerEntity(row.entity)}
                            title="Ver mayor de movimientos"
                          >
                            👁️ Mayor
                          </button>
                          <Link
                            className="btn compact"
                            to={`/finanzas/pagos/nueva?supplierId=${row.entity.id}`}
                            title="Emitir orden de pago"
                          >
                            💳 Pagar
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* TABLA DUAL */
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entidad Mixta (Cliente / Proveedor)</th>
                  <th>CUIT</th>
                  <th style={{ textAlign: "right" }}>Crédito (A Cobrar)</th>
                  <th style={{ textAlign: "right" }}>Débito (A Pagar)</th>
                  <th style={{ textAlign: "right" }}>Posición Neta</th>
                  <th style={{ textAlign: "center" }}>Situación</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No se encontraron entidades mixtas con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
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
                              className="btn btn-outline compact"
                              onClick={() => setLedgerEntity(row.entity)}
                              title="Ver mayor unificado"
                            >
                              👁️ Mayor
                            </button>
                            <Link
                              className="btn btn-outline compact"
                              to={`/finanzas/cobranzas?customerId=${row.entity.id}`}
                              title="Cobrar"
                            >
                              💵 Cobrar
                            </Link>
                            <Link
                              className="btn compact"
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

      {/* Modal de Mayor de Cuenta Corriente */}
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
                <span className="eyebrow">EXTRACTO HISTÓRICO · MAYOR DE CUENTA CORRIENTE</span>
                <h2 style={{ margin: 0 }}>
                  {ledgerEntity.tradeName || ledgerEntity.legalName}
                </h2>
                <p className="muted" style={{ margin: "2px 0 0 0" }}>
                  CUIT: {ledgerEntity.documentNumber || "Sin CUIT"} · {ledgerEntity.isCustomer ? "Cliente " : ""}{ledgerEntity.isSupplier ? "Proveedor" : ""}
                </p>
              </div>
              <button className="btn btn-outline compact" onClick={() => setLedgerEntity(null)}>
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
                    <th>Descripción / TC</th>
                    <th style={{ textAlign: "right" }}>Débito (+)</th>
                    <th style={{ textAlign: "right" }}>Crédito (−)</th>
                    <th style={{ textAlign: "right" }}>Saldo Acumulado (ARS)</th>
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
                      <tr key={idx} style={item.muted ? { opacity: 0.65 } : undefined}>
                        <td>{new Date(item.date).toLocaleDateString("es-AR")}</td>
                        <td>
                          <strong>{item.type}</strong>
                        </td>
                        <td>
                          <code style={item.muted ? { textDecoration: "line-through" } : undefined}>{item.number}</code>
                        </td>
                        <td>
                          {item.description}
                          {item.originalAmount && (
                            <span style={{ display: "block", color: "#2563eb", fontSize: "0.75rem", fontWeight: 700 }}>
                              Original: {item.originalAmount}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", color: item.debit > 0 ? "#059669" : "inherit" }}>
                          {item.debit > 0 ? money(item.debit) : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: item.credit > 0 ? "#dc2626" : "inherit" }}>
                          {item.credit > 0 ? money(item.credit) : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: item.balance > 0 ? "#dc2626" : item.balance < 0 ? "#059669" : "inherit" }}>
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
                <Link className="btn btn-outline compact" to={`/finanzas/cobranzas?customerId=${ledgerEntity.id}`}>
                  💵 Registrar Cobranza
                </Link>
              )}
              {ledgerEntity.isSupplier && (
                <Link className="btn compact" to={`/finanzas/pagos/nueva?supplierId=${ledgerEntity.id}`}>
                  💳 Emitir Orden de Pago
                </Link>
              )}
              <button className="btn btn-outline compact" onClick={() => setLedgerEntity(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
