import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseQuotation, type PurchaseRequest, type Supplier } from "../api/types";

export function PurchaseRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [request, setRequest] = useState<PurchaseRequest | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State for uploading/adding supplier quotation
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierQuoteRef, setSupplierQuoteRef] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [currency, setCurrency] = useState("ARS");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [netAmount, setNetAmount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(21);
  const [deliveryTime, setDeliveryTime] = useState("Inmediata");
  const [paymentTerms, setPaymentTerms] = useState("30 días fecha factura");
  const [notes, setNotes] = useState("");
  const [attachmentBase64, setAttachmentBase64] = useState<string | null>(null);
  const [attachmentFileName, setAttachmentFileName] = useState<string | null>(null);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [req, sups] = await Promise.all([
        api.getPurchaseRequest(id),
        api.listSuppliers().catch(() => [])
      ]);
      setRequest(req);
      setSuppliers(sups);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleSupplierChange = (supId: string) => {
    setSelectedSupplierId(supId);
    const sup = suppliers.find((s) => s.id === supId);
    if (sup) {
      setSupplierName(sup.legalName || sup.tradeName || "");
      if (sup.paymentTerms) setPaymentTerms(sup.paymentTerms);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("El archivo no puede superar los 10 MB.");
      return;
    }

    setAttachmentFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const calculatedTaxAmount = Math.round((netAmount * (taxPercent / 100)) * 100) / 100;
  const calculatedTotalAmount = Math.round((netAmount + calculatedTaxAmount) * 100) / 100;

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedSupplierId) {
      alert("Por favor seleccione un proveedor.");
      return;
    }

    try {
      setSubmittingQuote(true);
      const payload = {
        supplierId: selectedSupplierId,
        supplierName,
        supplierQuoteRef: supplierQuoteRef.trim() || null,
        issueDate: new Date(issueDate).toISOString(),
        currency,
        exchangeRate: Number(exchangeRate || 1),
        netAmount: Number(netAmount || 0),
        taxPercent: Number(taxPercent || 0),
        taxAmount: calculatedTaxAmount,
        totalAmount: calculatedTotalAmount,
        deliveryTime: deliveryTime.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        notes: notes.trim() || null,
        attachmentBase64,
        attachmentFileName
      };

      const updated = await api.addPurchaseQuotation(id, payload);
      setRequest(updated);
      setShowQuoteModal(false);

      // Reset quote modal fields
      setSelectedSupplierId("");
      setSupplierName("");
      setSupplierQuoteRef("");
      setNetAmount(0);
      setNotes("");
      setAttachmentBase64(null);
      setAttachmentFileName(null);
    } catch (err: unknown) {
      alert("Error al guardar presupuesto: " + (err instanceof Error ? err.message : "Desconocido"));
    } finally {
      setSubmittingQuote(false);
    }
  };

  const handleSelectQuotation = async (quoteId: string) => {
    if (!id) return;
    try {
      const updated = await api.selectPurchaseQuotation(id, quoteId);
      setRequest(updated);
    } catch (err: unknown) {
      alert("Error al seleccionar presupuesto: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  const handleDeleteQuotation = async (quoteId: string) => {
    if (!id || !confirm("¿Está seguro de eliminar esta cotización?")) return;
    try {
      const updated = await api.deletePurchaseQuotation(id, quoteId);
      setRequest(updated);
    } catch (err: unknown) {
      alert("Error al eliminar cotización: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    try {
      const updated = await api.approvePurchaseRequest(id);
      setRequest(updated);
    } catch (err: unknown) {
      alert("Error al aprobar: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center" }}>Cargando solicitud y presupuestos...</div>;
  }

  if (error || !request) {
    return (
      <div style={{ padding: "30px", textAlign: "center", color: "#b91c1c" }}>
        <p>{error || "Solicitud de compra no encontrada"}</p>
        <Link to="/compras/solicitudes" className="btn btn-outline">
          ← Volver al Listado
        </Link>
      </div>
    );
  }

  const selectedQuote = request.quotations?.find((q) => q.isSelected);

  return (
    <div className="workspace-page">
      {/* Header */}
      <div className="page-head">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link to="/compras/solicitudes" className="btn btn-outline" style={{ padding: "6px 12px" }}>
            ← Volver
          </Link>
          <div>
            <h1 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
              <span>Solicitud #{request.requestNumber}</span>
              <span
                style={{
                  fontSize: "0.8rem",
                  padding: "3px 10px",
                  borderRadius: "12px",
                  fontWeight: "bold",
                  background:
                    request.status === "Approved"
                      ? "#ecfdf5"
                      : request.status === "Ordered"
                      ? "#eff6ff"
                      : request.status === "Rejected"
                      ? "#fef2f2"
                      : "#fffbeb",
                  color:
                    request.status === "Approved"
                      ? "#047857"
                      : request.status === "Ordered"
                      ? "#1d4ed8"
                      : request.status === "Rejected"
                      ? "#b91c1c"
                      : "#b45309"
                }}
              >
                {request.status === "Approved"
                  ? "Aprobada"
                  : request.status === "Ordered"
                  ? "En Orden de Compra"
                  : request.status === "Rejected"
                  ? "Rechazada"
                  : "Pendiente de Aprobación"}
              </span>
            </h1>
            <p className="muted" style={{ margin: "4px 0 0 0" }}>
              Solicitado por <strong>{request.requestedBy}</strong> ({request.department}) el {new Date(request.createdAtUtc).toLocaleDateString("es-AR")}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          {request.status === "Pending" && (
            <button type="button" onClick={handleApprove} className="btn" style={{ background: "#059669", color: "white", fontWeight: "bold" }}>
              ✓ Aprobar Solicitud
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowQuoteModal(true)}
            className="btn btn-primary"
            style={{ fontWeight: "bold" }}
          >
            + Cargar Presupuesto de Proveedor
          </button>

          <Link
            to={
              selectedQuote
                ? `/compras/ordenes/nueva?request_id=${request.id}&supplier_id=${selectedQuote.supplierId}&currency=${selectedQuote.currency}&quote_ref=${encodeURIComponent(selectedQuote.supplierQuoteRef || "")}`
                : `/compras/ordenes/nueva?request_id=${request.id}`
            }
            className="btn"
            style={{ background: "#2563eb", color: "white", textDecoration: "none", fontWeight: "bold" }}
          >
            📝 {selectedQuote ? `Generar OC con ${selectedQuote.supplierName}` : "Generar Orden de Compra"}
          </Link>
        </div>
      </div>

      {/* Info & Items Section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "20px", marginBottom: "24px" }}>
        {/* Summary Card */}
        <div className="card pad">
          <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "1rem", color: "var(--brand-accent)" }}>
            Detalle de la Solicitud
          </h3>
          <div style={{ fontSize: "0.88rem", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <span className="muted">Prioridad: </span>
              <strong>
                {request.priority === "Urgent" ? "🚨 Urgente" : request.priority === "High" ? "⚡ Alta" : "Normal"}
              </strong>
            </div>
            <div>
              <span className="muted">Fecha requerida: </span>
              <strong>
                {request.requiredDate ? new Date(request.requiredDate).toLocaleDateString("es-AR") : "Sin fecha estricta"}
              </strong>
            </div>
            <div>
              <span className="muted">Motivo / Justificación: </span>
              <p style={{ margin: "4px 0 0 0", background: "#f8fafc", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}>
                {request.reason}
              </p>
            </div>
          </div>
        </div>

        {/* Required Items Table */}
        <div className="card pad">
          <h3 style={{ marginTop: 0, marginBottom: "12px", fontSize: "1rem", color: "var(--brand-accent)" }}>
            Artículos / Repuestos Requeridos ({request.items.length})
          </h3>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left", fontSize: "0.82rem", color: "var(--ink-soft)" }}>
                <th style={{ padding: "6px 8px" }}>Código</th>
                <th style={{ padding: "6px 8px" }}>Descripción</th>
                <th style={{ padding: "6px 8px", textAlign: "center" }}>Cantidad</th>
                <th style={{ padding: "6px 8px" }}>Notas Técnicas</th>
              </tr>
            </thead>
            <tbody>
              {request.items.map((it) => (
                <tr key={it.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <td style={{ padding: "8px", fontWeight: "bold", fontFamily: "monospace", fontSize: "0.85rem" }}>
                    {it.code}
                  </td>
                  <td style={{ padding: "8px", fontSize: "0.88rem" }}>{it.description}</td>
                  <td style={{ padding: "8px", textAlign: "center", fontWeight: "bold" }}>
                    {it.quantity} {it.unitMeasure}
                  </td>
                  <td style={{ padding: "8px", fontSize: "0.82rem", color: "var(--ink-soft)" }}>
                    {it.notes || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplier Quotations Comparison Section */}
      <div className="card pad" style={{ marginBottom: "30px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.2rem", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>⚖️ Comparativa de Presupuestos de Proveedores</span>
              <span style={{ fontSize: "0.85rem", padding: "2px 8px", borderRadius: "10px", background: "#f1f5f9", color: "var(--ink-soft)" }}>
                {request.quotations?.length || 0} presupuestos cargados
              </span>
            </h2>
            <p className="muted" style={{ margin: "4px 0 0 0" }}>
              Cargá los PDFs recibidos y compará precios, plazos y condiciones antes de emitir la Orden de Compra
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowQuoteModal(true)}
            className="btn btn-outline"
            style={{ fontWeight: "bold" }}
          >
            + Cargar Presupuesto
          </button>
        </div>

        {(!request.quotations || request.quotations.length === 0) ? (
          <div style={{ padding: "40px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px dashed var(--surface-border)" }}>
            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📑</div>
            <h4 style={{ margin: "0 0 6px 0" }}>Aún no se han cargado presupuestos de proveedores</h4>
            <p className="muted" style={{ fontSize: "0.88rem", maxWidth: "500px", margin: "0 auto 16px auto" }}>
              Solicitá cotización a tus proveedores habituales, subí los presupuestos recibidos en PDF y comparalos para justificar la mejor oferta.
            </p>
            <button
              type="button"
              onClick={() => setShowQuoteModal(true)}
              className="btn btn-primary"
            >
              + Cargar Primer Presupuesto
            </button>
          </div>
        ) : (
          <div>
            {/* Grid of Comparison Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px", marginBottom: "24px" }}>
              {request.quotations.map((q) => {
                const isWinner = q.isSelected;

                return (
                  <div
                    key={q.id}
                    style={{
                      border: isWinner ? "2px solid #059669" : "1px solid var(--surface-border)",
                      borderRadius: "12px",
                      padding: "16px",
                      background: isWinner ? "linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)" : "white",
                      position: "relative",
                      boxShadow: isWinner ? "0 4px 12px rgba(5, 150, 105, 0.15)" : "none",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between"
                    }}
                  >
                    {isWinner && (
                      <div
                        style={{
                          position: "absolute",
                          top: "-12px",
                          right: "16px",
                          background: "#059669",
                          color: "white",
                          padding: "2px 10px",
                          borderRadius: "12px",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.15)"
                        }}
                      >
                        🏆 OPCIÓN ELEGIDA PARA OC
                      </div>
                    )}

                    <div>
                      {/* Supplier & Ref Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: "1.05rem", color: "#1e293b" }}>{q.supplierName}</h4>
                          <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                            {q.supplierQuoteRef ? `Presupuesto N° ${q.supplierQuoteRef}` : "Sin N° ref."} • {new Date(q.issueDate).toLocaleDateString("es-AR")}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteQuotation(q.id)}
                          style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1rem" }}
                          title="Eliminar presupuesto"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Total Amount Badge */}
                      <div style={{ background: isWinner ? "rgba(5, 150, 105, 0.08)" : "#f8fafc", padding: "10px 12px", borderRadius: "8px", margin: "10px 0" }}>
                        <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", textTransform: "uppercase", fontWeight: "bold" }}>
                          Importe Total Presupuestado ({q.currency})
                        </div>
                        <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: isWinner ? "#047857" : "#0f172a", fontFamily: "monospace" }}>
                          {q.currency} {q.totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: "2px" }}>
                          Neto: {q.currency} {q.netAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })} + IVA ({q.taxPercent}%): {q.currency} {q.taxAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      {/* Key Comparison Data */}
                      <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
                        <div>
                          <span className="muted">⏱️ Plazo de Entrega: </span>
                          <strong>{q.deliveryTime || "No especificado"}</strong>
                        </div>
                        <div>
                          <span className="muted">💳 Condición de Pago: </span>
                          <strong>{q.paymentTerms || "30 días"}</strong>
                        </div>
                        {q.notes && (
                          <div>
                            <span className="muted">📝 Notas / Validez: </span>
                            <span style={{ fontStyle: "italic", color: "#475569" }}>{q.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer Actions & PDF Download */}
                    <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      {q.attachmentBase64 ? (
                        <a
                          href={q.attachmentBase64}
                          download={q.attachmentFileName || `Presupuesto_${q.supplierName}.pdf`}
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: "0.8rem", color: "#0284c7" }}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📥 {q.attachmentFileName || "Ver PDF"}
                        </a>
                      ) : (
                        <span style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>Sin PDF adjunto</span>
                      )}

                      <div>
                        {isWinner ? (
                          <span style={{ color: "#059669", fontWeight: "bold", fontSize: "0.85rem" }}>
                            ✓ Seleccionado
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelectQuotation(q.id)}
                            className="btn btn-outline"
                            style={{ padding: "4px 10px", fontSize: "0.82rem", borderColor: "#059669", color: "#059669", fontWeight: "bold" }}
                          >
                            ⭐ Elegir este Presupuesto
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Summary Table */}
            <div style={{ marginTop: "16px", background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "0.95rem" }}>📊 Cuadro Comparativo Rápido</h4>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)", textAlign: "left", color: "var(--ink-soft)" }}>
                    <th style={{ padding: "6px" }}>Proveedor</th>
                    <th style={{ padding: "6px" }}>N° Presupuesto</th>
                    <th style={{ padding: "6px", textAlign: "right" }}>Neto</th>
                    <th style={{ padding: "6px", textAlign: "right" }}>IVA</th>
                    <th style={{ padding: "6px", textAlign: "right" }}>Total</th>
                    <th style={{ padding: "6px" }}>Plazo de Entrega</th>
                    <th style={{ padding: "6px" }}>Pago</th>
                    <th style={{ padding: "6px", textAlign: "center" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {request.quotations.map((q) => (
                    <tr key={q.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", fontWeight: q.isSelected ? "bold" : "normal" }}>
                      <td style={{ padding: "6px" }}>{q.supplierName}</td>
                      <td style={{ padding: "6px" }}>{q.supplierQuoteRef || "-"}</td>
                      <td style={{ padding: "6px", textAlign: "right", fontFamily: "monospace" }}>
                        {q.currency} {q.netAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "6px", textAlign: "right", fontFamily: "monospace" }}>
                        {q.currency} {q.taxAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "6px", textAlign: "right", fontFamily: "monospace", color: q.isSelected ? "#047857" : "inherit" }}>
                        {q.currency} {q.totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: "6px" }}>{q.deliveryTime || "-"}</td>
                      <td style={{ padding: "6px" }}>{q.paymentTerms || "-"}</td>
                      <td style={{ padding: "6px", textAlign: "center" }}>
                        {q.isSelected ? (
                          <span style={{ padding: "2px 6px", borderRadius: "8px", background: "#ecfdf5", color: "#047857", fontSize: "0.75rem" }}>
                            🏆 Elegido
                          </span>
                        ) : (
                          <span style={{ color: "var(--ink-soft)", fontSize: "0.75rem" }}>Alternativa</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal for Adding Supplier Quotation */}
      {showQuoteModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div className="card pad" style={{ background: "white", width: "700px", maxWidth: "95%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, color: "var(--brand-accent)" }}>
                📑 Cargar Presupuesto de Proveedor
              </h3>
              <button
                type="button"
                onClick={() => setShowQuoteModal(false)}
                style={{ background: "transparent", border: "none", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveQuotation}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Proveedor *
                  </label>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                  >
                    <option value="">Seleccione un proveedor...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.legalName || s.tradeName} (CUIT: {s.documentNumber})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                    N° Presupuesto Proveedor
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: PRES-2026-884"
                    value={supplierQuoteRef}
                    onChange={(e) => setSupplierQuoteRef(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Fecha del Presupuesto
                  </label>
                  <input
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Moneda
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                  >
                    <option value="ARS">Pesos Argentinos (ARS)</option>
                    <option value="USD">Dólares Estadounidenses (USD)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Plazo de Entrega
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Inmediata, 7 días..."
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                  />
                </div>
              </div>

              {/* Amount Breakdown */}
              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid var(--surface-border)", marginBottom: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                      Neto Gravado *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={netAmount || ""}
                      onChange={(e) => setNetAmount(parseFloat(e.target.value) || 0)}
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontFamily: "monospace", fontWeight: "bold" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                      Alícuota IVA
                    </label>
                    <select
                      value={taxPercent}
                      onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                      style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                    >
                      <option value={21}>21.0 %</option>
                      <option value={10.5}>10.5 %</option>
                      <option value={27}>27.0 %</option>
                      <option value={0}>0.0 % (Exento)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                      Total ({currency})
                    </label>
                    <div style={{ padding: "8px", background: "white", borderRadius: "6px", border: "1px solid var(--surface-border)", fontFamily: "monospace", fontWeight: "bold", fontSize: "1.1rem", color: "#047857" }}>
                      $ {calculatedTotalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Condición de Pago
                  </label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="Ej: 30 días fecha factura, Contado..."
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                    Adjuntar Presupuesto PDF / Comprobante
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid var(--surface-border)", fontSize: "0.85rem" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Notas Comerciales / Validez de la Oferta
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Oferta válida por 15 días, incluye flete hasta planta..."
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" onClick={() => setShowQuoteModal(false)} className="btn btn-outline">
                  Cancelar
                </button>
                <button type="submit" disabled={submittingQuote} className="btn btn-primary" style={{ fontWeight: "bold" }}>
                  {submittingQuote ? "Guardando..." : "💾 Guardar Presupuesto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
