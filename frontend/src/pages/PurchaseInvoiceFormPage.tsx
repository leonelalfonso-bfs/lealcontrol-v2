import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { InvoiceOcrUploadModal } from "../components/InvoiceOcrUploadModal";
import { type InvoiceOcrResult } from "../api/automationApi";
import { type Product, type PurchaseArcaVoucher, type PurchaseOrder, type PurchaseReception, type Supplier } from "../api/types";

interface InvoiceRow {
  productId?: string;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);

export function PurchaseInvoiceFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const arcaIdParam = searchParams.get("arca_id");
  const orderIdParam = searchParams.get("order_id");
  const receptionIdParam = searchParams.get("reception_id");

  const [showOcrModal, setShowOcrModal] = useState(false);
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
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [currency, setCurrency] = useState("ARS");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [iibbPerception, setIibbPerception] = useState(0);
  const [ivaPerception, setIvaPerception] = useState(0);
  const [otherTaxes, setOtherTaxes] = useState(0);
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
        const [sups, prods, receptions, invoices] = await Promise.all([
          api.listSuppliers().catch(() => []),
          api.listProducts().catch(() => []),
          api.listPurchaseReceptions().catch(() => []),
          api.listPurchaseInvoices().catch(() => [])
        ]);
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
      { code: "COMPRA", description: "", quantity: 1, unitPrice: 0, vatRate: 21 }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotalNeto = items.reduce((acc, it) => acc + it.quantity * it.unitPrice, 0);
  const iva21 = items.filter((it) => Math.abs(it.vatRate - 21) < 0.1).reduce((acc, it) => acc + it.quantity * it.unitPrice * 0.21, 0);
  const iva105 = items.filter((it) => Math.abs(it.vatRate - 10.5) < 0.1).reduce((acc, it) => acc + it.quantity * it.unitPrice * 0.105, 0);
  const iva27 = items.filter((it) => Math.abs(it.vatRate - 27) < 0.1).reduce((acc, it) => acc + it.quantity * it.unitPrice * 0.27, 0);
  const totalIva = iva21 + iva105 + iva27;
  const grandTotal = subtotalNeto + totalIva + Number(iibbPerception) + Number(ivaPerception) + Number(otherTaxes);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName || !supplierDocument) {
      setError("Por favor indique el proveedor y su CUIT.");
      return;
    }
    const pos = Number(pointOfSale);
    const invNum = Number(invoiceNumber);
    if (!Number.isFinite(pos) || pos < 1 || !Number.isFinite(invNum) || invNum < 1) {
      setError("Indicá el punto de venta y el número de factura del comprobante (sin valores por defecto).");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        invoiceType,
        pointOfSale: pos,
        invoiceNumber: invNum,
        purchaseOrderId: purchaseOrderId || null,
        purchaseReceptionId: purchaseReceptionId || null,
        supplierId: selectedSupplierId || "00000000-0000-0000-0000-000000000000",
        supplierName,
        supplierDocument,
        supplierTaxCondition,
        issueDate: new Date(issueDate).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        currency,
        exchangeRate: Number(exchangeRate),
        iibbPerception: Number(iibbPerception),
        ivaPerception: Number(ivaPerception),
        otherTaxes: Number(otherTaxes),
        cae: cae || null,
        caeDueDate: caeDueDate ? new Date(caeDueDate).toISOString() : null,
        notes,
        arcaVoucherId: arcaVoucherId || null,
        items: items.map((it) => ({
          productId: it.productId || null,
          code: it.code || "ITEM",
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          vatRate: Number(it.vatRate)
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

  const handleApplyOcr = (res: InvoiceOcrResult) => {
    if (res.invoiceType) setInvoiceType(res.invoiceType);
    if (res.pointOfSale) setPointOfSale(res.pointOfSale);
    if (res.invoiceNumber) setInvoiceNumber(res.invoiceNumber);
    if (res.supplierName) setSupplierName(res.supplierName);
    if (res.supplierCuit) setSupplierDocument(res.supplierCuit);
    if (res.issueDate) setIssueDate(res.issueDate);
    if (res.dueDate) setDueDate(res.dueDate);
    if (res.cae) setCae(res.cae);
    if (res.caeDueDate) setCaeDueDate(res.caeDueDate);
    if (res.currency) setCurrency(res.currency);
    if (res.exchangeRate) setExchangeRate(res.exchangeRate);
    if (res.iibbPerception) setIibbPerception(res.iibbPerception);

    // Match supplier by CUIT
    const cleanCuit = (res.supplierCuit || "").replace(/\D/g, "");
    if (cleanCuit) {
      const matched = suppliers.find((s) => s.documentNumber.replace(/\D/g, "") === cleanCuit);
      if (matched) {
        setSelectedSupplierId(matched.id);
      }
    }

    // Items
    if (res.items && res.items.length > 0) {
      setItems(res.items.map((it) => ({
        code: it.code || "ITEM",
        description: it.description,
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        vatRate: Number(it.vatRate) || 21
      })));
    }
  };

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center" }}>Cargando formulario de factura...</div>;
  }

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Registrar Factura de Proveedor</h1>
          <p className="muted">Carga de comprobante fiscal, cómputo de IVA Crédito y Cuenta por Pagar</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={() => setShowOcrModal(true)}
            className="btn btn-outline"
            style={{ background: "#eff6ff", color: "#1e40af", borderColor: "#3b82f6", fontWeight: 700 }}
          >
            📷 Extraer con IA (Foto / PDF)
          </button>
          <Link to="/compras/facturas" className="btn btn-outline">
            ← Volver
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", marginBottom: "16px", border: "1px solid #f87171" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px", alignItems: "start" }}>
          {/* Main Info Card */}
          <div className="card pad">
            <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              1. Cabecera del Comprobante & Datos Fiscales
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Tipo de Comprobante *
                </label>
                <select
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                >
                  <option value="A">Factura A (01)</option>
                  <option value="B">Factura B (06)</option>
                  <option value="C">Factura C (11)</option>
                  <option value="M">Factura M (51)</option>
                  <option value="NC_A">Nota de Crédito A (03)</option>
                  <option value="NC_B">Nota de Crédito B (08)</option>
                  <option value="ND_A">Nota de Débito A (02)</option>
                  <option value="ND_B">Nota de Débito B (07)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Pto. Venta *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="Ej: 4"
                  value={pointOfSale}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPointOfSale(v === "" ? "" : parseInt(v, 10) || "");
                  }}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", textAlign: "center", fontFamily: "monospace" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Número de Factura *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="Ej: 12345"
                  value={invoiceNumber}
                  onChange={(e) => {
                    const v = e.target.value;
                    setInvoiceNumber(v === "" ? "" : parseInt(v, 10) || "");
                  }}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)", fontFamily: "monospace" }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Proveedor *
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                >
                  <option value="">-- Seleccionar Proveedor Registrado --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.legalName || s.tradeName} ({s.documentNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Razón Social / Emisor *
                </label>
                <input
                  type="text"
                  required
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                Recepción ya ingresada (evita duplicar stock)
              </label>
              <select
                value={purchaseReceptionId || ""}
                onChange={(e) => handleReceptionChange(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
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
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: "4px", marginBottom: 0 }}>
                Si la mercadería ya entró por remito, vinculá esa recepción. No vuelvas a recibir.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  CUIT Emisor *
                </label>
                <input
                  type="text"
                  required
                  value={supplierDocument}
                  onChange={(e) => setSupplierDocument(e.target.value)}
                  placeholder="30xxxxxxxx"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Fecha de Emisión *
                </label>
                <input
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Fecha Vencimiento *
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
                >
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
            </div>

            {/* Items Table */}
            <h3 style={{ marginTop: "24px", marginBottom: "12px", fontSize: "1.05rem", color: "var(--brand-accent)" }}>
              2. Detalle de Conceptos Facturados & IVA
            </h3>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", fontSize: "0.82rem", color: "var(--ink-soft)", textAlign: "left" }}>
                    <th style={{ width: "28%", padding: "8px 4px" }}>Catálogo / Insumo</th>
                    <th style={{ width: "28%", padding: "8px 4px" }}>Descripción / Detalle Factura</th>
                    <th style={{ width: "9%", padding: "8px 4px", textAlign: "center" }}>Cant.</th>
                    <th style={{ width: "14%", padding: "8px 4px", textAlign: "right" }}>Precio Neto U.</th>
                    <th style={{ width: "11%", padding: "8px 4px", textAlign: "center" }}>Alícuota IVA</th>
                    <th style={{ width: "10%", padding: "8px 4px", textAlign: "right" }}>Subtotal</th>
                    <th style={{ width: "4%", padding: "8px 4px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                      <td style={{ padding: "8px 4px" }}>
                        <select
                          value={it.productId || ""}
                          onChange={(e) => handleProductSelect(idx, e.target.value)}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.83rem" }}
                        >
                          <option value="">✍️ (Ítem / Concepto libre)</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.code}] {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <input
                          type="text"
                          required
                          value={it.description}
                          onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                          placeholder="Concepto o descripción..."
                          style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                        />
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          required
                          value={it.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", parseInt(e.target.value, 10) || 1)}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", textAlign: "center", fontSize: "0.85rem" }}
                        />
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={it.unitPrice}
                          onChange={(e) => handleItemChange(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", textAlign: "right", fontFamily: "monospace", fontSize: "0.85rem" }}
                        />
                      </td>
                      <td style={{ padding: "8px 4px" }}>
                        <select
                          value={it.vatRate}
                          onChange={(e) => handleItemChange(idx, "vatRate", parseFloat(e.target.value))}
                          style={{ width: "100%", padding: "6px 4px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.82rem" }}
                        >
                          <option value="21">21.0%</option>
                          <option value="10.5">10.5%</option>
                          <option value="27">27.0%</option>
                          <option value="0">0% (Exento)</option>
                        </select>
                      </td>
                      <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600, fontSize: "0.85rem" }}>
                        {money(it.quantity * it.unitPrice)}
                      </td>
                      <td style={{ padding: "8px 4px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "1.1rem" }}
                          title="Eliminar este concepto"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" onClick={addItemRow} className="btn btn-outline" style={{ fontSize: "0.85rem" }}>
              + Agregar Concepto
            </button>
          </div>

          {/* Totals & Perceptions Sidebar */}
          <div>
            <div className="card pad" style={{ position: "sticky", top: "80px" }}>
              <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "1.05rem" }}>Totales & Percepciones</h3>

              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.88rem" }}>
                <span className="muted">Neto Gravado:</span>
                <span style={{ fontFamily: "monospace", fontWeight: "bold" }}>
                  $ {subtotalNeto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {iva21 > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.88rem" }}>
                  <span className="muted">IVA 21%:</span>
                  <span style={{ fontFamily: "monospace", color: "#047857" }}>
                    $ {iva21.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {iva105 > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.88rem" }}>
                  <span className="muted">IVA 10.5%:</span>
                  <span style={{ fontFamily: "monospace", color: "#047857" }}>
                    $ {iva105.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {iva27 > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.88rem" }}>
                  <span className="muted">IVA 27%:</span>
                  <span style={{ fontFamily: "monospace", color: "#047857" }}>
                    $ {iva27.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "8px", marginTop: "8px", marginBottom: "8px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "2px" }}>
                  Percepción Ingresos Brutos (IIBB)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={iibbPerception}
                  onChange={(e) => setIibbPerception(parseFloat(e.target.value) || 0)}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", textAlign: "right", fontFamily: "monospace" }}
                />
              </div>

              <div style={{ marginBottom: "8px" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "2px" }}>
                  Percepción IVA / Ganancias / Otros
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={otherTaxes}
                  onChange={(e) => setOtherTaxes(parseFloat(e.target.value) || 0)}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", textAlign: "right", fontFamily: "monospace" }}
                />
              </div>

              <div style={{ borderTop: "2px solid var(--surface-border)", paddingTop: "10px", display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>Total Factura:</span>
                <span style={{ fontWeight: "bold", fontSize: "1.2rem", color: "#047857", fontFamily: "monospace" }}>
                  $ {grandTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {purchaseReceptionId && (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid #6ee7b7",
                    color: "#065f46",
                    fontSize: "0.85rem",
                    fontWeight: 600
                  }}
                >
                  Stock ya vinculado a recepción — no se pedirá recibir de nuevo
                </div>
              )}

              {/* CAE Field */}
              <div style={{ marginBottom: "12px", background: "#f8fafc", padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "bold", marginBottom: "2px" }}>
                  CAE / CAI Autorización ARCA
                </label>
                <input
                  type="text"
                  placeholder="Número de CAE..."
                  value={cae}
                  onChange={(e) => setCae(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontFamily: "monospace", fontSize: "0.85rem" }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ width: "100%", padding: "12px", fontSize: "1rem", fontWeight: "bold" }}
              >
                {submitting ? "Guardando Factura..." : "💾 Registrar en Cuentas por Pagar"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Invoice OCR Modal */}
      <InvoiceOcrUploadModal
        isOpen={showOcrModal}
        onClose={() => setShowOcrModal(false)}
        onApplyInvoice={handleApplyOcr}
      />
    </div>
  );
}
