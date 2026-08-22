import { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { JournalTemplate, JournalTemplateLine, Account, AmountSourceVariableInfo } from "../../api/types";
import { BatchPostingModal } from "./BatchPostingModal";

export function JournalTemplatesPage() {
  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [variables, setVariables] = useState<AmountSourceVariableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sourceModule, setSourceModule] = useState<string>("Sales");
  const [documentType, setDocumentType] = useState<string>("InvoiceA");
  const [entrySeries, setEntrySeries] = useState("Ventas");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<JournalTemplateLine[]>([]);

  // Batch Posting Modal State
  const [showBatchModal, setShowBatchModal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tplList, accList, varList] = await Promise.all([
        api.listJournalTemplates(),
        api.listAccounts().catch(() => []),
        api.getAmountSourceVariables().catch(() => [])
      ]);
      setTemplates(tplList || []);
      setAccounts(accList.filter((a: Account) => a.isDirectPosting) || []);
      setVariables(varList || []);
    } catch (err: any) {
      console.error("Error al cargar asientos modelos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openNewModal = () => {
    setEditingId(null);
    setCode(`AM-${Date.now().toString().slice(-4)}`);
    setName("");
    setSourceModule("Sales");
    setDocumentType("InvoiceA");
    setEntrySeries("Ventas");
    setStatus("Active");
    setDescription("");
    setError(null);

    // Initial default lines for quick start
    setLines([
      {
        orderIndex: 1,
        accountCode: "1.1.02.001",
        accountName: "Deudores por Ventas (Clientes)",
        debitCredit: "Debit",
        amountSource: "Total",
        condition: "Always",
        isInvertedSign: false
      },
      {
        orderIndex: 2,
        accountCode: "4.1.01",
        accountName: "Venta de Mercaderías & Bienes",
        debitCredit: "Credit",
        amountSource: "Net21",
        condition: "Always",
        isInvertedSign: false
      },
      {
        orderIndex: 3,
        accountCode: "2.1.02.001",
        accountName: "IVA Débito Fiscal (Ventas)",
        debitCredit: "Credit",
        amountSource: "Vat21",
        condition: "IfHasVat21",
        isInvertedSign: false
      }
    ]);

    setShowModal(true);
  };

  const openEditModal = (t: JournalTemplate) => {
    setEditingId(t.id);
    setCode(t.code);
    setName(t.name);
    setSourceModule(t.sourceModule);
    setDocumentType(t.documentType);
    setEntrySeries(t.entrySeries || "General");
    setStatus(t.status);
    setDescription(t.description || "");
    setLines(t.lines ? [...t.lines] : []);
    setError(null);
    setShowModal(true);
  };

  const handleAddLine = () => {
    const firstAcc = accounts[0];
    const newLine: JournalTemplateLine = {
      orderIndex: lines.length + 1,
      accountCode: firstAcc ? firstAcc.code : "1.1.01.001",
      accountName: firstAcc ? firstAcc.name : "Caja Central",
      debitCredit: "Debit",
      amountSource: "Total",
      condition: "Always",
      isInvertedSign: false
    };
    setLines([...lines, newLine]);
  };

  const handleRemoveLine = (index: number) => {
    const updated = lines.filter((_, i) => i !== index).map((l, i) => ({ ...l, orderIndex: i + 1 }));
    setLines(updated);
  };

  const handleLineChange = (index: number, field: keyof JournalTemplateLine, value: any) => {
    const updated = [...lines];
    if (field === "accountCode") {
      const selectedAcc = accounts.find((a) => a.code === value);
      updated[index] = {
        ...updated[index],
        accountCode: value,
        accountName: selectedAcc ? selectedAcc.name : updated[index].accountName,
        accountId: selectedAcc ? selectedAcc.id : updated[index].accountId
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setLines(updated);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setError("Código y nombre del asiento modelo son obligatorios.");
      return;
    }

    if (lines.length < 2) {
      setError("Un asiento modelo debe contar con al menos 2 líneas contables (partida doble).");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      code: code.trim(),
      name: name.trim(),
      sourceModule,
      documentType,
      entrySeries,
      status,
      description: description.trim(),
      lines: lines.map((l, idx) => ({
        ...l,
        orderIndex: idx + 1
      }))
    };

    try {
      if (editingId) {
        await api.updateJournalTemplate(editingId, payload);
      } else {
        await api.createJournalTemplate(payload);
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Error al guardar el asiento modelo.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, codeName: string) => {
    if (!confirm(`¿Confirma eliminar el asiento modelo "${codeName}"?`)) return;
    try {
      await api.deleteJournalTemplate(id);
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar asiento modelo.");
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesModule = filterModule === "all" || t.sourceModule.toLowerCase() === filterModule.toLowerCase();
    const matchesSearch = !searchTerm || t.code.toLowerCase().includes(searchTerm.toLowerCase()) || t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.documentType.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesModule && matchesSearch;
  });

  return (
    <div className="page-wide">
      {/* Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Configuración Contable & Automatización
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            ⚙️ Asientos Modelos
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Plantillas dinámicas para la imputación contable exacta de comprobantes, cobros, pagos y movimientos operativos.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn"
            style={{ background: "#dc2626", color: "#fff", fontWeight: 700 }}
            onClick={() => setShowBatchModal(true)}
          >
            🔴 ► CONTABILIZAR
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", fontWeight: 700 }}
            onClick={openNewModal}
          >
            ➕ Nuevo Asiento Modelo
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="kpi kpi-4" style={{ marginBottom: 24 }}>
        <div className="card pad" style={{ borderLeft: "4px solid #0d9488" }}>
          <div className="muted">Total Modelos Configurados</div>
          <strong style={{ fontSize: "1.8rem" }}>{templates.length}</strong>
          <div style={{ fontSize: "0.78rem", color: "var(--ok)", fontWeight: 700, marginTop: 4 }}>
            ✓ {templates.filter((t) => t.status === "Active").length} activos en ejecución
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #3b82f6" }}>
          <div className="muted">Módulo Ventas</div>
          <strong style={{ fontSize: "1.8rem" }}>{templates.filter((t) => t.sourceModule === "Sales").length}</strong>
          <div style={{ fontSize: "0.78rem", color: "#2563eb", fontWeight: 600, marginTop: 4 }}>
            Facturas A/B/C, NC, ND
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div className="muted">Módulo Compras</div>
          <strong style={{ fontSize: "1.8rem" }}>{templates.filter((t) => t.sourceModule === "Purchases").length}</strong>
          <div style={{ fontSize: "0.78rem", color: "#d97706", fontWeight: 600, marginTop: 4 }}>
            Facturas proveedor & gastos
          </div>
        </div>

        <div className="card pad" style={{ borderLeft: "4px solid #8b5cf6" }}>
          <div className="muted">Finanzas & Tesorería</div>
          <strong style={{ fontSize: "1.8rem" }}>{templates.filter((t) => t.sourceModule === "Finance").length}</strong>
          <div style={{ fontSize: "0.78rem", color: "#7c3aed", fontWeight: 600, marginTop: 4 }}>
            Recibos, pagos y transferencias
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "Todos los Módulos" },
              { id: "Sales", label: "🛒 Ventas" },
              { id: "Purchases", label: "📦 Compras" },
              { id: "Finance", label: "💳 Finanzas / Pagos" },
              { id: "Inventory", label: "🏭 Stock & Producción" }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`btn compact ${filterModule === tab.id ? "" : "ghost"}`}
                style={filterModule === tab.id ? { background: "#0d9488", color: "#fff" } : {}}
                onClick={() => setFilterModule(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ minWidth: 260 }}>
            <input
              type="search"
              placeholder="🔍 Buscar por código, nombre o comprobante..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "100%", padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc" }}
            />
          </div>
        </div>
      </div>

      {/* Templates Table */}
      <div className="card pad">
        {loading ? (
          <div className="muted" style={{ padding: 40, textAlign: "center" }}>Cargando asientos modelos...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="muted" style={{ padding: 40, textAlign: "center" }}>
            No se encontraron asientos modelos con los filtros seleccionados.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Código</th>
                  <th>Nombre del Asiento Modelo</th>
                  <th>Módulo Origen</th>
                  <th>Tipo Comprobante</th>
                  <th>Serie</th>
                  <th style={{ textAlign: "center" }}>Líneas</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="badge" style={{ background: "#e6fffa", color: "#0f766e", fontWeight: 700 }}>
                        {t.code}
                      </span>
                    </td>
                    <td>
                      <strong>{t.name}</strong>
                      {t.description && <div className="muted" style={{ fontSize: "0.76rem" }}>{t.description}</div>}
                    </td>
                    <td>
                      <span className="badge">
                        {t.sourceModule === "Sales" ? "🛒 Ventas" : t.sourceModule === "Purchases" ? "📦 Compras" : t.sourceModule === "Finance" ? "💳 Finanzas" : t.sourceModule}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{t.documentType}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.8rem", color: "#555" }}>{t.entrySeries || "General"}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="badge" style={{ background: "#f1f5f9", fontWeight: 700 }}>
                        {t.lines?.length || 0} cuentas
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${t.status === "Active" ? "ok" : "prio-high"}`}>
                        {t.status === "Active" ? "✓ Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn ghost compact"
                          onClick={() => openEditModal(t)}
                          title="Editar Asiento Modelo"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          type="button"
                          className="btn ghost compact"
                          style={{ color: "#dc2626" }}
                          onClick={() => handleDelete(t.id, `${t.code} - ${t.name}`)}
                          title="Eliminar Asiento Modelo"
                        >
                          🗑️
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

      {/* MODAL CONFIGURADOR DE ASIENTO MODELO */}
      {showModal && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div className="modal-content" style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 1000, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)" }}>
            
            {/* Modal Header */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800 }}>
                  {editingId ? `✏️ Editar Asiento Modelo [${code}]` : "➕ Crear Nuevo Asiento Modelo"}
                </h2>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Definición de cuentas contables debitadas y acreditadas a partir de variables de comprobantes de gestión.
                </span>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="btn ghost compact" style={{ fontSize: "1.2rem", lineHeight: 1 }}>
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
              <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
                
                {error && (
                  <div className="alert" style={{ marginBottom: 16, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: 6, fontSize: "0.85rem" }}>
                    ⚠️ {error}
                  </div>
                )}

                {/* Cabecera del Modelo */}
                <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: 12, color: "#0f766e" }}>
                    1. DATOS DE CABECERA & DISPARADOR
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: 4 }}>Código Modelo *</label>
                      <input
                        type="text"
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="ej. AM-VTA-01"
                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", fontWeight: 700 }}
                      />
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: 4 }}>Nombre / Descripción Legible *</label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="ej. Factura A de Venta - Cuenta Corriente"
                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: 4 }}>Módulo de Origen *</label>
                      <select
                        value={sourceModule}
                        onChange={(e) => {
                          setSourceModule(e.target.value);
                          if (e.target.value === "Sales") setEntrySeries("Ventas");
                          else if (e.target.value === "Purchases") setEntrySeries("Compras");
                          else if (e.target.value === "Finance") setEntrySeries("Finanzas");
                        }}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                      >
                        <option value="Sales">🛒 Ventas</option>
                        <option value="Purchases">📦 Compras</option>
                        <option value="Finance">💳 Finanzas / Tesorería</option>
                        <option value="Inventory">🏭 Inventario / Stock</option>
                        <option value="Payroll">👥 Sueldos / RRHH</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: 4 }}>Tipo de Comprobante *</label>
                      <select
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value)}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                      >
                        <option value="InvoiceA">Factura A</option>
                        <option value="InvoiceB">Factura B / C</option>
                        <option value="CreditNoteA">Nota de Crédito A</option>
                        <option value="CreditNoteB">Nota de Crédito B / C</option>
                        <option value="DebitNote">Nota de Débito</option>
                        <option value="CollectionReceipt">Recibo de Cobranza</option>
                        <option value="PaymentOrder">Orden de Pago</option>
                        <option value="BankTransfer">Transferencia Bancaria</option>
                        <option value="StockAdjustment">Ajuste de Stock</option>
                        <option value="All">Cualquier Comprobante del Módulo</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: 4 }}>Serie de Asiento</label>
                      <input
                        type="text"
                        value={entrySeries}
                        onChange={(e) => setEntrySeries(e.target.value)}
                        placeholder="Ventas / Compras / General"
                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, marginBottom: 4 }}>Estado</label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                      >
                        <option value="Active">✓ Activo (Se usa al Contabilizar)</option>
                        <option value="Inactive">Inactivo (Pausado)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Líneas Contables / Renglones */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f766e" }}>
                      2. LÍNEAS CONTABLES (DEBE / HABER & VARIABLES DE IMPORTE)
                    </div>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="btn compact"
                      style={{ background: "#0d9488", color: "#fff", fontSize: "0.8rem" }}
                    >
                      ➕ Agregar Renglón
                    </button>
                  </div>

                  <div className="table-wrap" style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ margin: 0, fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          <th style={{ width: 40, textAlign: "center" }}>#</th>
                          <th style={{ width: 280 }}>Cuenta Contable (Plan de Cuentas)</th>
                          <th style={{ width: 110 }}>Columna</th>
                          <th>Origen del Importe (Variable del Comprobante)</th>
                          <th>Condición de Disparo</th>
                          <th style={{ width: 90, textAlign: "center" }}>Signo</th>
                          <th style={{ width: 40, textAlign: "center" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, index) => (
                          <tr key={index}>
                            <td style={{ textAlign: "center", fontWeight: 700 }}>{index + 1}</td>
                            <td>
                              <select
                                value={l.accountCode}
                                onChange={(e) => handleLineChange(index, "accountCode", e.target.value)}
                                style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.8rem" }}
                              >
                                {accounts.map((acc) => (
                                  <option key={acc.id} value={acc.code}>
                                    {acc.code} — {acc.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                value={l.debitCredit}
                                onChange={(e) => handleLineChange(index, "debitCredit", e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "4px 8px",
                                  borderRadius: 4,
                                  border: "1px solid #ccc",
                                  fontWeight: 700,
                                  color: l.debitCredit === "Debit" ? "#0369a1" : "#047857"
                                }}
                              >
                                <option value="Debit">DEBE (Débito)</option>
                                <option value="Credit">HABER (Crédito)</option>
                              </select>
                            </td>
                            <td>
                              <select
                                value={l.amountSource}
                                onChange={(e) => handleLineChange(index, "amountSource", e.target.value)}
                                style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.8rem" }}
                              >
                                {variables.map((v) => (
                                  <option key={v.key} value={v.key}>
                                    {v.label} ({v.category})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                value={l.condition}
                                onChange={(e) => handleLineChange(index, "condition", e.target.value)}
                                style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.8rem" }}
                              >
                                <option value="Always">Siempre</option>
                                <option value="IfHasVat21">Si tiene IVA 21% &gt; 0</option>
                                <option value="IfHasVat105">Si tiene IVA 10.5% &gt; 0</option>
                                <option value="IfHasVat27">Si tiene IVA 27% &gt; 0</option>
                                <option value="IfHasPerceptionIibb">Si tiene Percepción IIBB &gt; 0</option>
                                <option value="IfHasPerceptionVat">Si tiene Percepción IVA &gt; 0</option>
                                <option value="IfHasWithholding">Si tiene Retenciones &gt; 0</option>
                              </select>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <label style={{ fontSize: "0.75rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <input
                                  type="checkbox"
                                  checked={l.isInvertedSign}
                                  onChange={(e) => handleLineChange(index, "isInvertedSign", e.target.checked)}
                                />
                                Invertir
                              </label>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(index)}
                                className="btn ghost compact"
                                style={{ color: "#dc2626", padding: "2px 6px" }}
                                title="Quitar línea"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn ghost">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn"
                  style={{ background: "#0d9488", color: "#fff", fontWeight: 700, minWidth: 140 }}
                >
                  {saving ? "Guardando..." : "💾 Guardar Asiento Modelo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONTABILIZACIÓN EN LOTE (BOTÓN CONTABILIZAR) */}
      <BatchPostingModal
        isOpen={showBatchModal}
        onClose={() => {
          setShowBatchModal(false);
          loadData();
        }}
      />
    </div>
  );
}
