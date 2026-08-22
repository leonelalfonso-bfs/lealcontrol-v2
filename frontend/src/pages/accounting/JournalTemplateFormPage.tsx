import { useEffect, useState, FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { JournalTemplateLine, Account, AmountSourceVariableInfo } from "../../api/types";

export function JournalTemplateFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id && id !== "nuevo");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [variables, setVariables] = useState<AmountSourceVariableInfo[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [accList, varList] = await Promise.all([
          api.listAccounts().catch(() => []),
          api.getAmountSourceVariables().catch(() => [])
        ]);
        setAccounts(accList.filter((a: Account) => a.isDirectPosting) || []);
        setVariables(varList || []);

        if (isEditing && id) {
          const tpl = await api.getJournalTemplate(id);
          if (tpl) {
            setCode(tpl.code);
            setName(tpl.name);
            setSourceModule(tpl.sourceModule);
            setDocumentType(tpl.documentType);
            setEntrySeries(tpl.entrySeries || "General");
            setStatus(tpl.status);
            setDescription(tpl.description || "");
            setLines(tpl.lines ? [...tpl.lines] : []);
          }
        } else {
          // Default new template initialization
          setCode(`AM-${Date.now().toString().slice(-4)}`);
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
        }
      } catch (err: any) {
        console.error("Error cargando asiento modelo:", err);
        setError("No se pudo cargar la información del asiento modelo.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, isEditing]);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!code.trim() || !name.trim()) {
      setError("El código y nombre del asiento modelo son obligatorios.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (lines.length < 2) {
      setError("Un asiento modelo debe contar con al menos 2 líneas contables (partida doble).");
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      if (isEditing && id) {
        await api.updateJournalTemplate(id, payload);
      } else {
        await api.createJournalTemplate(payload);
      }
      navigate("/contabilidad/modelos");
    } catch (err: any) {
      setError(err?.message || "Error al guardar el asiento modelo.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <div className="muted">Cargando datos del asiento modelo y plan de cuentas...</div>
      </div>
    );
  }

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Top Header & Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#64748b", marginBottom: 6 }}>
          <Link to="/contabilidad" style={{ color: "inherit", textDecoration: "none" }}>Contabilidad</Link>
          <span>›</span>
          <Link to="/contabilidad/modelos" style={{ color: "inherit", textDecoration: "none" }}>Asientos Modelos</Link>
          <span>›</span>
          <span style={{ color: "#0f766e", fontWeight: 700 }}>{isEditing ? `Editar [${code}]` : "Nuevo Modelo"}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: "1.75rem", fontWeight: 800, color: "#0f172a" }}>
              {isEditing ? `✏️ Asiento Modelo: ${name || code}` : "➕ Nuevo Asiento Modelo"}
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              Configuración de plantilla para imputación contable automática en base a comprobantes de gestión.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/contabilidad/modelos" className="btn ghost" style={{ padding: "8px 16px", fontWeight: 600 }}>
              ← Cancelar y Volver
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="btn"
              style={{ background: "#0d9488", color: "#fff", fontWeight: 800, padding: "8px 22px", fontSize: "0.92rem", minWidth: 160 }}
            >
              {saving ? "Guardando..." : "💾 Guardar Asiento Modelo"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ marginBottom: 20, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "14px 18px", borderRadius: 8, fontSize: "0.92rem" }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* SECCIÓN 1: CABECERA & DISPARADOR */}
        <div className="card pad" style={{ marginBottom: 24, borderLeft: "5px solid #0d9488" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f766e", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span>1. DATOS DE CABECERA & DISPARADOR DEL COMPROBANTE</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 6 }}>Código Identificador *</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ej. AM-VTA-01"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: 800, fontSize: "0.92rem" }}
              />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 6 }}>Nombre / Descripción Legible *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Factura A de Venta - Cuenta Corriente"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 6 }}>Módulo de Origen (Gestión) *</label>
              <select
                value={sourceModule}
                onChange={(e) => {
                  setSourceModule(e.target.value);
                  if (e.target.value === "Sales") setEntrySeries("Ventas");
                  else if (e.target.value === "Purchases") setEntrySeries("Compras");
                  else if (e.target.value === "Finance") setEntrySeries("Finanzas");
                }}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="Sales">🛒 Ventas</option>
                <option value="Purchases">📦 Compras</option>
                <option value="Finance">💳 Finanzas / Tesorería</option>
                <option value="Inventory">🏭 Inventario / Stock</option>
                <option value="Payroll">👥 Sueldos / RRHH</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 6 }}>Tipo de Comprobante *</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
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
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 6 }}>Serie del Asiento</label>
              <input
                type="text"
                value={entrySeries}
                onChange={(e) => setEntrySeries(e.target.value)}
                placeholder="Ventas / Compras / Finanzas / General"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 6 }}>Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="Active">✓ Activo (Se usa al Contabilizar)</option>
                <option value="Inactive">Inactivo (Pausado)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 6 }}>Notas / Observaciones del Modelo</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalle o aclaraciones de imputación para el estudio contable..."
              style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
            />
          </div>
        </div>

        {/* SECCIÓN 2: LÍNEAS CONTABLES (TABLA COMPLETA) */}
        <div className="card pad" style={{ marginBottom: 30, borderLeft: "5px solid #3b82f6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "#1e40af" }}>
                2. LÍNEAS CONTABLES (DEBE / HABER & VARIABLES DE IMPORTE)
              </div>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Asigne las cuentas del Plan de Cuentas a cada campo del comprobante y defina las condiciones de disparo.
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddLine}
              className="btn"
              style={{ background: "#0d9488", color: "#fff", fontSize: "0.88rem", fontWeight: 800, padding: "8px 18px" }}
            >
              ➕ Agregar Renglón al Asiento
            </button>
          </div>

          <div className="table-wrap" style={{ border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)" }}>
            <table style={{ margin: 0, width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                  <th style={{ width: 50, textAlign: "center", padding: "12px 8px" }}>#</th>
                  <th style={{ width: "32%", minWidth: 280, padding: "12px 14px" }}>Cuenta Contable (Plan de Cuentas)</th>
                  <th style={{ width: 140, minWidth: 130, padding: "12px 10px" }}>Columna</th>
                  <th style={{ width: "26%", minWidth: 220, padding: "12px 14px" }}>Origen del Importe (Variable del Comprobante)</th>
                  <th style={{ width: "22%", minWidth: 180, padding: "12px 14px" }}>Condición de Disparo</th>
                  <th style={{ width: 100, textAlign: "center", padding: "12px 8px" }}>Signo</th>
                  <th style={{ width: 50, textAlign: "center", padding: "12px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid #e2e8f0", background: index % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                    <td style={{ textAlign: "center", fontWeight: 800, color: "#64748b", padding: "10px 8px" }}>{index + 1}</td>
                    
                    <td style={{ padding: "10px 14px" }}>
                      <select
                        value={l.accountCode}
                        onChange={(e) => handleLineChange(index, "accountCode", e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.88rem", background: "#fff", fontWeight: 600 }}
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.code}>
                            {acc.code} — {acc.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ padding: "10px 10px" }}>
                      <select
                        value={l.debitCredit}
                        onChange={(e) => handleLineChange(index, "debitCredit", e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: "1px solid #cbd5e1",
                          fontWeight: 800,
                          fontSize: "0.88rem",
                          background: l.debitCredit === "Debit" ? "#eff6ff" : "#f0fdf4",
                          color: l.debitCredit === "Debit" ? "#1d4ed8" : "#15803d"
                        }}
                      >
                        <option value="Debit">DEBE</option>
                        <option value="Credit">HABER</option>
                      </select>
                    </td>

                    <td style={{ padding: "10px 14px" }}>
                      <select
                        value={l.amountSource}
                        onChange={(e) => handleLineChange(index, "amountSource", e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.88rem", background: "#fff" }}
                      >
                        {variables.map((v) => (
                          <option key={v.key} value={v.key}>
                            {v.label} ({v.category})
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ padding: "10px 14px" }}>
                      <select
                        value={l.condition}
                        onChange={(e) => handleLineChange(index, "condition", e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.88rem", background: "#fff" }}
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

                    <td style={{ textAlign: "center", padding: "10px 8px" }}>
                      <label style={{ fontSize: "0.82rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700, color: "#475569" }}>
                        <input
                          type="checkbox"
                          checked={l.isInvertedSign}
                          onChange={(e) => handleLineChange(index, "isInvertedSign", e.target.checked)}
                          style={{ transform: "scale(1.1)" }}
                        />
                        Invertir
                      </label>
                    </td>

                    <td style={{ textAlign: "center", padding: "10px 8px" }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(index)}
                        className="btn ghost compact"
                        style={{ color: "#dc2626", padding: "6px 10px", borderRadius: 6, fontSize: "0.95rem" }}
                        title="Quitar renglón"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc",
            padding: "16px 24px",
            borderRadius: 10,
            border: "1px solid #e2e8f0"
          }}
        >
          <Link to="/contabilidad/modelos" className="btn ghost" style={{ padding: "9px 20px" }}>
            ← Cancelar y Volver
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn"
            style={{ background: "#0d9488", color: "#fff", fontWeight: 800, padding: "10px 28px", fontSize: "0.95rem", minWidth: 200 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Asiento Modelo"}
          </button>
        </div>
      </form>
    </div>
  );
}
