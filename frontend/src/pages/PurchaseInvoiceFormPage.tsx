import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { type ExpenseCategory, type Product, type PurchaseArcaVoucher, type PurchaseOrder, type PurchaseReception, type Supplier } from "../api/types";
import { CustomerPicker, ProductPicker } from "../components/pickers";
import { ExpenseCategoriesModal } from "../components/purchases/ExpenseCategoriesModal";

import { todayAr, addDaysAr } from "../lib/dates";
interface InvoiceRow {
  productId?: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  expenseCategoryId?: string;
}

/** Importe de un tributo de la factura (percepciones, impuestos internos, municipales…). */
function TaxInput({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <label>
        {label}
        <input className="t-right t-mono"
          type="number"
          step="0.01"
          value={disabled ? 0 : value === 0 ? "" : value}
          placeholder="0,00"
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
         style={{ width: "100%", fontWeight: "normal" }}/>
      </label>
    </div>
  );
}

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);

export function PurchaseInvoiceFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const arcaIdParam = searchParams.get("arca_id");
  const orderIdParam = searchParams.get("order_id");
  const receptionIdParam = searchParams.get("reception_id");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [availableReceptions, setAvailableReceptions] = useState<PurchaseReception[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invoiceType, setInvoiceType] = useState("A");
  const [pointOfSale, setPointOfSale] = useState<number | "">("");
  const [invoiceNumber, setInvoiceNumber] = useState<number | "">("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierDocument, setSupplierDocument] = useState("");
  const [supplierTaxCondition, setSupplierTaxCondition] = useState("ResponsableInscripto");
  const [issueDate, setIssueDate] = useState(todayAr());
  // Período de imputación (AAAA-MM): el mes de la factura o, si Contabilidad lo cerró, el primer mes abierto.
  const [imputationPeriod, setImputationPeriod] = useState("");
  const [lockedMonths, setLockedMonths] = useState<string[]>([]);
  useEffect(() => {
    if (!issueDate) return;
    void api.getPurchaseImputationPeriod(issueDate)
      .then((r) => { setImputationPeriod(r.period.slice(0, 7)); setLockedMonths(r.lockedMonths); })
      .catch(() => setImputationPeriod(issueDate.slice(0, 7)));
  }, [issueDate]);
  const [dueDate, setDueDate] = useState(addDaysAr(30));
  const [currency, setCurrency] = useState("ARS");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [iibbPerception, setIibbPerception] = useState(0);
  const [ivaPerception, setIvaPerception] = useState(0);
  const [otherTaxes, setOtherTaxes] = useState(0);
  const [gananciasPerception, setGananciasPerception] = useState(0);
  const [internalTaxes, setInternalTaxes] = useState(0);
  const [municipalTaxes, setMunicipalTaxes] = useState(0);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [cae, setCae] = useState("");
  const [caeDueDate, setCaeDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [arcaVoucherId, setArcaVoucherId] = useState<string | null>(arcaIdParam);
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(orderIdParam);
  const [purchaseReceptionId, setPurchaseReceptionId] = useState<string | null>(receptionIdParam);

  const [items, setItems] = useState<InvoiceRow[]>([
    { code: "COMPRA", description: "Insumos / Servicios Generales", quantity: 1, unitPrice: 0, vatRate: 21 }
  ]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [sups, prods, receptions, invoices, cats] = await Promise.all([
          api.listSuppliers().catch(() => []),
          api.listProducts().catch(() => []),
          api.listPurchaseReceptions().catch(() => []),
          api.listPurchaseInvoices().catch(() => []),
          api.listExpenseCategories().catch(() => [])
        ]);
        setCategories(cats);
        setSuppliers(sups);
        setProducts(prods);

        const linkedReceptionIds = new Set(
          invoices
            .filter((inv) => inv.status !== "Cancelled" && inv.purchaseReceptionId)
            .map((inv) => inv.purchaseReceptionId as string)
        );
        const openReceptions = receptions.filter(
          (r) => r.status !== "Cancelled" && !linkedReceptionIds.has(r.id)
        );
        setAvailableReceptions(openReceptions);

        // Pre-fill from ARCA Voucher
        if (arcaIdParam) {
          try {
            const vouchers = await api.listArcaVouchers("All");
            const v = vouchers.find((x) => x.id === arcaIdParam);
            if (v) {
              setInvoiceType(v.invoiceLetter || "A");
              setPointOfSale(v.pointOfSale);
              setInvoiceNumber(v.voucherNumber);
              setSupplierName(v.issuerName);
              setSupplierDocument(v.issuerCuit);
              setCurrency(v.currencyCode || "ARS");
              setExchangeRate(v.exchangeRate || 1);
              setIssueDate(new Date(v.issueDate).toISOString().split("T")[0]);
              setCae(v.cae || "");
              setOtherTaxes(v.otherTaxes || 0);

              // Auto-match supplier by CUIT
              const matchedSup = sups.find((s) => s.documentNumber.replace(/\D/g, "") === v.issuerCuit.replace(/\D/g, ""));
              if (matchedSup) {
                setSelectedSupplierId(matchedSup.id);
                setSupplierTaxCondition(matchedSup.taxCondition || "ResponsableInscripto");
              }

              // Set default line matching net and VAT
              const net = v.netAmount > 0 ? v.netAmount : v.totalAmount - (v.vatAmount || 0);
              const calculatedVatRate = net > 0 && v.vatAmount > 0 ? Math.round((v.vatAmount / net) * 100 * 10) / 10 : 21;

              setItems([
                {
                  code: "ARCA",
                  description: `Comprobante ${v.voucherType} ${v.formattedNumber} - ${v.issuerName}`,
                  quantity: 1,
                  unitPrice: net,
                  vatRate: calculatedVatRate >= 10 ? calculatedVatRate : 21
                }
              ]);
            }
          } catch {
            // ignore
          }
        } else if (receptionIdParam) {
          const rec =
            openReceptions.find((r) => r.id === receptionIdParam) ||
            receptions.find((r) => r.id === receptionIdParam);
          if (rec) {
            setPurchaseReceptionId(rec.id);
            setSelectedSupplierId(rec.supplierId);
            setSupplierName(rec.supplierName);
            const matchedSup = sups.find((s) => s.id === rec.supplierId);
            if (matchedSup) {
              setSupplierDocument(matchedSup.documentNumber || "");
              setSupplierTaxCondition(matchedSup.taxCondition || "ResponsableInscripto");
            }
            if (rec.purchaseOrderId) setPurchaseOrderId(rec.purchaseOrderId);
            if (rec.items && rec.items.length > 0) {
              setItems(
                rec.items.map((it) => ({
                  productId: it.productId || undefined,
                  code: it.code,
                  description: it.description,
                  quantity: it.quantity,
                  unitPrice: 0,
                  vatRate: 21
                }))
              );
            }
          }
        } else if (orderIdParam) {
          try {
            const ord = await api.getPurchaseOrder(orderIdParam);
            setPurchaseOrderId(ord.id);
            setSelectedSupplierId(ord.supplierId);
            setSupplierName(ord.supplierName);
            setSupplierDocument(ord.supplierDocument);
            setCurrency(ord.currency);
            setExchangeRate(ord.exchangeRate);
            if (ord.items && ord.items.length > 0) {
              setItems(
                ord.items.map((it) => ({
                  productId: it.productId || undefined,
                  code: it.code,
                  description: it.description,
                  quantity: it.quantity,
                  unitPrice: it.unitPrice,
                  vatRate: it.taxRate || 21
                }))
              );
            }
            const openForOrder = openReceptions.find((r) => r.purchaseOrderId === orderIdParam);
            if (openForOrder) setPurchaseReceptionId(openForOrder.id);
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [arcaIdParam, orderIdParam, receptionIdParam]);

  const receptionsForSupplier = availableReceptions.filter(
    (r) => !selectedSupplierId || r.supplierId === selectedSupplierId
  );

  const handleReceptionChange = (recId: string) => {
    if (!recId) {
      setPurchaseReceptionId(null);
      return;
    }
    const rec = availableReceptions.find((r) => r.id === recId);
    if (!rec) return;
    setPurchaseReceptionId(rec.id);
    setSelectedSupplierId(rec.supplierId);
    setSupplierName(rec.supplierName);
    const matchedSup = suppliers.find((s) => s.id === rec.supplierId);
    if (matchedSup) {
      setSupplierDocument(matchedSup.documentNumber || "");
      setSupplierTaxCondition(matchedSup.taxCondition || "ResponsableInscripto");
    }
    if (rec.purchaseOrderId) setPurchaseOrderId(rec.purchaseOrderId);
    const isDefaultCompraRow =
      items.length === 1 &&
      items[0].code === "COMPRA" &&
      Number(items[0].unitPrice) === 0;
    if (isDefaultCompraRow && rec.items && rec.items.length > 0) {
      setItems(
        rec.items.map((it) => ({
          productId: it.productId || undefined,
          code: it.code,
          description: it.description,
          quantity: it.quantity,
          unitPrice: 0,
          vatRate: 21
        }))
      );
    }
  };

  const handleSupplierChange = (supId: string) => {
    setSelectedSupplierId(supId);
    const sup = suppliers.find((s) => s.id === supId);
    if (sup) {
      setSupplierName(sup.legalName || sup.tradeName || "");
      setSupplierDocument(sup.documentNumber || "");
      setSupplierTaxCondition(sup.taxCondition || "ResponsableInscripto");
    }
    if (purchaseReceptionId) {
      const rec = availableReceptions.find((r) => r.id === purchaseReceptionId);
      if (rec && rec.supplierId !== supId) {
        setPurchaseReceptionId(null);
      }
    }
  };

  const handleProductSelect = (index: number, prodId: string) => {
    const updated = [...items];
    if (!prodId) {
      updated[index] = {
        ...updated[index],
        productId: undefined,
        code: "COMPRA",
        description: updated[index].description || "Insumos / Servicios Generales"
      };
    } else {
      const p = products.find((x) => x.id === prodId);
      if (p) {
        updated[index] = {
          ...updated[index],
          productId: p.id,
          code: p.code,
          description: p.name,
          unitPrice: (p as any).costPrice || (p as any).price || updated[index].unitPrice || 0,
          vatRate: (p as any).vatRate || updated[index].vatRate || 21
        };
      }
    }
    setItems(updated);
  };

  const handleItemChange = (index: number, field: keyof InvoiceRow, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([
      ...items,
      { code: "COMPRA", description: "", quantity: 1, unitPrice: 0, vatRate: 21, expenseCategoryId: items[items.length - 1]?.expenseCategoryId }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  // Compra sin factura (X): no es fiscal, va sin IVA, percepciones ni CAE.
  const isX = invoiceType === "X";
  const vatOf = (it: { vatRate: number }) => (isX ? 0 : it.vatRate);
  const subtotalNeto = items.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
  const iva21 = items.filter((it) => Math.abs(vatOf(it) - 21) < 0.1).reduce((acc, it) => acc + it.quantity * it.unitPrice * 0.21, 0);
  const iva105 = items.filter((it) => Math.abs(vatOf(it) - 10.5) < 0.1).reduce((acc, it) => acc + it.quantity * it.unitPrice * 0.105, 0);
  const iva27 = items.filter((it) => Math.abs(vatOf(it) - 27) < 0.1).reduce((acc, it) => acc + it.quantity * it.unitPrice * 0.27, 0);
  const totalIva = iva21 + iva105 + iva27;
  const taxes = Number(iibbPerception) + Number(ivaPerception) + Number(gananciasPerception) + Number(internalTaxes) + Number(municipalTaxes) + Number(otherTaxes);
  const grandTotal = subtotalNeto + totalIva + (isX ? 0 : taxes);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName || !supplierDocument) {
      setError("Por favor indique el proveedor y su CUIT.");
      return;
    }
    const pos = Number(pointOfSale);
    const invNum = Number(invoiceNumber);
    if (!isX && (!Number.isFinite(pos) || pos < 1 || !Number.isFinite(invNum) || invNum < 1)) {
      setError("Indicá el punto de venta y el número de factura del comprobante (sin valores por defecto).");
      return;
    }
    const badLine = items.findIndex((it) => !(it.quantity > 0));
    if (badLine >= 0) {
      setError(`Revisá la cantidad del renglón ${badLine + 1}: tiene que ser mayor a cero.`);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        invoiceType,
        pointOfSale: Number.isFinite(pos) ? pos : 0,
        invoiceNumber: Number.isFinite(invNum) ? invNum : 0,
        purchaseOrderId: purchaseOrderId || null,
        purchaseReceptionId: purchaseReceptionId || null,
        supplierId: selectedSupplierId || "00000000-0000-0000-0000-000000000000",
        supplierName,
        supplierDocument,
        supplierTaxCondition,
        issueDate: new Date(issueDate).toISOString(),
        imputationPeriod: imputationPeriod ? `${imputationPeriod}-01T00:00:00Z` : null,
        dueDate: new Date(dueDate).toISOString(),
        currency,
        exchangeRate: Number(exchangeRate),
        iibbPerception: isX ? 0 : Number(iibbPerception),
        ivaPerception: isX ? 0 : Number(ivaPerception),
        otherTaxes: isX ? 0 : Number(otherTaxes),
        gananciasPerception: isX ? 0 : Number(gananciasPerception),
        internalTaxes: isX ? 0 : Number(internalTaxes),
        municipalTaxes: isX ? 0 : Number(municipalTaxes),
        cae: isX ? null : cae || null,
        caeDueDate: caeDueDate ? new Date(caeDueDate).toISOString() : null,
        notes,
        arcaVoucherId: arcaVoucherId || null,
        items: items.map((it) => ({
          productId: it.productId || null,
          code: it.code || "ITEM",
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          vatRate: vatOf(it),
          expenseCategoryId: it.expenseCategoryId || null
        }))
      };

      await api.createPurchaseInvoice(payload);
      navigate("/compras/facturas");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar la factura");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="t-center" style={{ padding: "40px" }}>Cargando formulario de factura...</div>;
  }

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Registrar Factura de Proveedor</h1>
          <p className="muted">Carga de comprobante fiscal, cómputo de IVA Crédito y Cuenta por Pagar</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/compras/facturas" className="btn btn-outline">
            ← Volver
          </Link>
        </div>
      </div>

      {error && (
        <div className="t-danger alert" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px", alignItems: "start" }}>
          {/* Main Info Card */}
          <div className="card pad">
            <h3 className="t-accent" style={{ marginBottom: "16px" }}>
              1. Cabecera del Comprobante & Datos Fiscales
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label>
                  Tipo de Comprobante *
                </label>
                <select
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="A">Factura A (01)</option>
                  <option value="B">Factura B (06)</option>
                  <option value="C">Factura C (11)</option>
                  <option value="M">Factura M (51)</option>
                  <option value="NC_A">Nota de Crédito A (03)</option>
                  <option value="NC_B">Nota de Crédito B (08)</option>
                  <option value="ND_A">Nota de Débito A (02)</option>
                  <option value="ND_B">Nota de Débito B (07)</option>
                  <option value="TF_A">Tique factura A (081)</option>
                  <option value="TF_B">Tique factura B (082)</option>
                  <option value="OC_A">Otros comp. RG 1415, con IVA (099)</option>
                  <option value="OC_B">Otros comp. RG 1415, sin IVA (099)</option>
                  <option value="X">Compra sin factura (X)</option>
                </select>
                {isX && (
                  <small className="muted" style={{ display: "block", marginTop: 4 }}>
                    No es fiscal: sin IVA ni CAE, no va al Libro IVA. Número opcional (si lo dejás vacío se numera solo).
                  </small>
                )}
              </div>

              <div>
                <label>
                  Pto. Venta *
                </label>
                <input className="t-center t-mono"
                  type="number"
                  min="1"
                  required
                  placeholder="Ej: 4"
                  value={pointOfSale}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPointOfSale(v === "" ? "" : parseInt(v, 10) || "");
                  }}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label>
                  Número de Factura *
                </label>
                <input className="t-mono"
                  type="number"
                  min="1"
                  required
                  placeholder="Ej: 12345"
                  value={invoiceNumber}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInvoiceNumber(v === "" ? "" : parseInt(v, 10) || "");
                  }}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label>
                  Proveedor *
                </label>
                <CustomerPicker
                  role="supplier"
                  value={selectedSupplierId}
                  onChange={(id) => handleSupplierChange(id)}
                  options={suppliers}
                />
              </div>

              <div>
                <label>
                  Razón Social / Emisor *
                </label>
                <input
                  type="text"
                  required
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>
                Recepción ya ingresada (evita duplicar stock)
              </label>
              <select
                value={purchaseReceptionId || ""}
                onChange={(e) => handleReceptionChange(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">— Sin vincular —</option>
                {receptionsForSupplier.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.receptionNumber}
                    {r.supplierRemitoNumber ? ` · Remito ${r.supplierRemitoNumber}` : ""}
                    {` · ${new Date(r.receptionDate).toLocaleDateString("es-AR")}`}
                  </option>
                ))}
              </select>
              <p className="muted t-small" style={{ marginTop: "4px", marginBottom: 0 }}>
                Si la mercadería ya entró por remito, vinculá esa recepción. No vuelvas a recibir.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label>
                  CUIT Emisor *
                </label>
                <input
                  type="text"
                  required
                  value={supplierDocument}
                  onChange={(e) => setSupplierDocument(e.target.value)}
                  placeholder="30xxxxxxxx"
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label>
                  Fecha de Emisión *
                </label>
                <input
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label>
                  Período de imputación
                </label>
                <input
                  type="month"
                  value={imputationPeriod}
                  min={issueDate.slice(0, 7)}
                  onChange={(e) => setImputationPeriod(e.target.value)}
                  style={{ width: "100%" }}
                />
                <small className="muted" style={{ display: "block", marginTop: 4 }}>
                  {lockedMonths.includes(issueDate.slice(0, 7))
                    ? `El mes de la factura está cerrado: va al Libro IVA y al asiento de ${imputationPeriod.split("-").reverse().join("/")}.`
                    : lockedMonths.includes(imputationPeriod)
                      ? "Ese mes está cerrado en Contabilidad: elegí uno abierto."
                      : "Libro IVA Compras y asiento."}
                </small>
              </div>

              <div>
                <label>
                  Fecha Vencimiento *
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label>
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
            </div>

            {/* Items Table */}
            <h3 className="t-accent" style={{ marginBottom: "12px" }}>
              2. Detalle de Conceptos Facturados & IVA
            </h3>

            <div style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 860, marginBottom: "12px" }}>
                <thead>
                  <tr>
                    <th style={{ width: "18%" }}>Catálogo / Insumo</th>
                    <th style={{ width: "18%" }}>Descripción / Detalle Factura</th>
                    <th className="t-center" style={{ width: "10%" }}>Cant.</th>
                    <th className="t-right" style={{ width: "18%" }}>Precio Neto U.</th>
                    <th className="t-center" style={{ width: "10%" }}>Alícuota IVA</th>
                    <th style={{ width: "14%" }}>
                      Rubro{" "}
                      <button type="button" className="btn ghost" onClick={() => setCategoriesOpen(true)} title="Administrar rubros">
                        ⚙
                      </button>
                    </th>
                    <th className="t-right" style={{ width: "14%" }}>Subtotal</th>
                    <th style={{ width: "4%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        <ProductPicker
                          aria-label={`Producto del renglón ${idx + 1}`}
                          value={it.productId || ""}
                          onChange={(id) => handleProductSelect(idx, id)}
                          products={products}
                          price="cost"
                          placeholder="Ítem / Concepto libre"
                        />
                      </td>
                      <td>
                        <input className="t-small"
                          type="text"
                          required
                          value={it.description}
                          onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                          placeholder="Concepto o descripción..."
                         style={{ width: "100%" }}/>
                      </td>
                      <td>
                        <input className="t-center t-small"
                          type="number"
                          step="any"
                          min="0"
                          required
                          inputMode="decimal"
                          // Vacío mientras se escribe (antes volvía solo a 1 y no se podía borrar); admite decimales.
                          value={it.quantity === 0 ? "" : it.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
                         style={{ width: "100%" }}/>
                      </td>
                      <td>
                        <input className="t-right t-mono t-small"
                          type="number"
                          step="any"
                          min="0"
                          required
                          inputMode="decimal"
                          placeholder="0,00"
                          // Vacío mientras se escribe (antes quedaba un 0 adelante del importe).
                          value={it.unitPrice === 0 ? "" : it.unitPrice}
                          onChange={(e) => handleItemChange(idx, "unitPrice", e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
                         style={{ width: "100%" }}/>
                      </td>
                      <td>
                        <select className="t-small"
                          value={vatOf(it)}
                          disabled={isX}
                          onChange={(e) => handleItemChange(idx, "vatRate", parseFloat(e.target.value))}
                         style={{ width: "100%" }}>
                          <option value="21">21.0%</option>
                          <option value="10.5">10.5%</option>
                          <option value="27">27.0%</option>
                          <option value="0">0% (Exento)</option>
                        </select>
                      </td>
                      <td>
                        <select className="t-small"
                          aria-label={`Rubro del renglón ${idx + 1}`}
                          value={it.expenseCategoryId || ""}
                          onChange={(e) => handleItemChange(idx, "expenseCategoryId", e.target.value || undefined)}
                          style={{ width: "100%" }}
                        >
                          <option value="">—</option>
                          {categories.filter((c) => c.isActive || c.id === it.expenseCategoryId).map((c) => (
                            <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="t-right t-strong t-small">
                        {money(it.quantity * it.unitPrice)}
                      </td>
                      <td className="t-center">
                        <button className="t-danger"
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          title="Eliminar este concepto"
                         style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.1rem" }}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" onClick={addItemRow} className="btn btn-outline">
              + Agregar Concepto
            </button>
          </div>

          {/* Totals & Perceptions Sidebar */}
          <div>
            <div className="card pad" style={{ position: "sticky", top: "80px" }}>
              <h3 style={{ marginBottom: "16px" }}>Totales & Percepciones</h3>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span className="muted">Neto Gravado:</span>
                <span className="t-mono t-strong">
                  $ {subtotalNeto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {iva21 > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span className="muted">IVA 21%:</span>
                  <span className="t-mono t-ok">
                    $ {iva21.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {iva105 > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span className="muted">IVA 10.5%:</span>
                  <span className="t-mono t-ok">
                    $ {iva105.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {iva27 > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span className="muted">IVA 27%:</span>
                  <span className="t-mono t-ok">
                    $ {iva27.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "8px", marginTop: "8px" }}>
                <TaxInput label="Percepción IVA" value={ivaPerception} onChange={setIvaPerception} disabled={isX} />
                <TaxInput label="Percepción Ingresos Brutos (IIBB)" value={iibbPerception} onChange={setIibbPerception} disabled={isX} />
                <TaxInput label="Percepción Ganancias" value={gananciasPerception} onChange={setGananciasPerception} disabled={isX} />
                <TaxInput label="Impuestos internos" value={internalTaxes} onChange={setInternalTaxes} disabled={isX} />
                <TaxInput label="Impuestos municipales" value={municipalTaxes} onChange={setMunicipalTaxes} disabled={isX} />
                <TaxInput label="Otros tributos" value={otherTaxes} onChange={setOtherTaxes} disabled={isX} />
              </div>

              <div style={{ borderTop: "2px solid var(--surface-border)", paddingTop: "10px", display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                <span className="t-strong" style={{ fontSize: "1.1rem" }}>Total Factura:</span>
                <span className="t-strong t-ok t-mono" style={{ fontSize: "1.2rem" }}>
                  $ {grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {purchaseReceptionId && (
                <div className="t-ok t-small t-strong"
                 style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.12)", border: "1px solid #6ee7b7" }}>
                  Stock ya vinculado a recepción — no se pedirá recibir de nuevo
                </div>
              )}

              {/* CAE Field */}
              {!isX && <div className="box" style={{ marginBottom: "12px" }}>
                <label>
                  CAE / CAI Autorización ARCA
                </label>
                <input className="t-mono t-small"
                  type="text"
                  placeholder="Número de CAE..."
                  value={cae}
                  onChange={(e) => setCae(e.target.value)}
                 style={{ width: "100%" }}/>
              </div>}

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
               style={{ width: "100%" }}>
                {submitting ? "Guardando Factura..." : "💾 Registrar en Cuentas por Pagar"}
              </button>
            </div>
          </div>
        </div>
      </form>

      <ExpenseCategoriesModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} categories={categories} onChange={setCategories} />
    </div>
  );
}
