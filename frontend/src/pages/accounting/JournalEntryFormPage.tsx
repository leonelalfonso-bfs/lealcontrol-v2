import { useEffect, useState, FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";

interface EntryLineDraft {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  costCenterId?: string;
  costCenterCode?: string;
  memo?: string;
}

export function JournalEntryFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id && id !== "nuevo");

  const [accounts, setAccounts] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [concept, setConcept] = useState("");
  const [entryType, setEntryType] = useState("Standard");
  const [series, setSeries] = useState("General");
  const [lines, setLines] = useState<EntryLineDraft[]>([
    { accountId: "", accountCode: "", accountName: "", debit: 0, credit: 0, memo: "" },
    { accountId: "", accountCode: "", accountName: "", debit: 0, credit: 0, memo: "" }
  ]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [acctList, ccList] = await Promise.all([
          api.listAccounts().catch(() => []),
          api.listCostCenters().catch(() => [])
        ]);
        const directAccs = acctList.filter((a: any) => a.isDirectPosting) || [];
        setAccounts(directAccs);
        setCostCenters(ccList || []);

        if (directAccs.length >= 2 && !isEditing) {
          setLines([
            { accountId: directAccs[0].id, accountCode: directAccs[0].code, accountName: directAccs[0].name, debit: 0, credit: 0, memo: "" },
            { accountId: directAccs[1].id, accountCode: directAccs[1].code, accountName: directAccs[1].name, debit: 0, credit: 0, memo: "" }
          ]);
        }
      } catch (err: any) {
        console.error("Error al cargar datos contables:", err);
        setError("No se pudo cargar el plan de cuentas.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEditing]);

  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = totalDebit > 0 && diff < 0.01;

  const handleAccountSelect = (index: number, acctCodeOrId: string) => {
    const selected = accounts.find((a) => a.id === acctCodeOrId || a.code === acctCodeOrId);
    if (!selected) return;
    const updated = [...lines];
    updated[index].accountId = selected.id;
    updated[index].accountCode = selected.code;
    updated[index].accountName = selected.name;
    setLines(updated);
  };

  const handleLineChange = (index: number, field: keyof EntryLineDraft, val: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: val };
    setLines(updated);
  };

  const addLine = () => {
    const defaultAcc = accounts[0];
    setLines([
      ...lines,
      {
        accountId: defaultAcc ? defaultAcc.id : "",
        accountCode: defaultAcc ? defaultAcc.code : "",
        accountName: defaultAcc ? defaultAcc.name : "",
        debit: 0,
        credit: 0,
        memo: ""
      }
    ]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!concept.trim()) {
      setError("El concepto / glosa principal del asiento es obligatorio.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (!isBalanced) {
      setError(`El asiento contable no balancea. Diferencia actual: $ ${diff.toFixed(2)}.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const unassigned = lines.some((l) => !l.accountCode || (!l.debit && !l.credit));
    if (unassigned) {
      setError("Todas las líneas deben tener asignada una cuenta contable e importe mayor a cero.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      date: new Date(entryDate).toISOString(),
      concept: concept.trim(),
      entryType,
      sourceModule: "Manual",
      series,
      lines: lines.map((l, i) => ({
        lineNumber: i + 1,
        accountId: l.accountId,
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        costCenterId: l.costCenterId || undefined,
        costCenterCode: l.costCenterCode || undefined,
        memo: l.memo?.trim() || concept.trim()
      }))
    };

    try {
      await api.createJournalEntry(payload);
      navigate("/contabilidad/asientos");
    } catch (err: any) {
      setError(err?.message || "Error al registrar el asiento contable.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <div className="muted">Cargando cuentas contables y centros de costo...</div>
      </div>
    );
  }

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Breadcrumb & Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#64748b", marginBottom: 6 }}>
          <Link to="/contabilidad" style={{ color: "inherit", textDecoration: "none" }}>Contabilidad</Link>
          <span>›</span>
          <Link to="/contabilidad/asientos" style={{ color: "inherit", textDecoration: "none" }}>Libro Diario</Link>
          <span>›</span>
          <span style={{ color: "#0d9488", fontWeight: 700 }}>Nuevo Asiento Manual</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: "1.75rem", fontWeight: 800, color: "#0f172a" }}>
              📝 Registrar Asiento Manual en Libro Diario
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              Carga manual con partida doble, validación de balance en tiempo real y asignación por centros de costo.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/contabilidad/asientos" className="btn ghost" style={{ padding: "8px 16px", fontWeight: 600 }}>
              ← Cancelar y Volver
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !isBalanced}
              className="btn"
              style={{
                background: isBalanced ? "#0d9488" : "#94a3b8",
                color: "#fff",
                fontWeight: 800,
                padding: "8px 24px",
                fontSize: "0.92rem",
                minWidth: 160
              }}
            >
              {saving ? "Registrando..." : "💾 Registrar Asiento"}
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
        {/* SECCIÓN 1: CABECERA DEL ASIENTO */}
        <div className="card pad" style={{ marginBottom: 20, borderLeft: "5px solid #0d9488" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f766e", marginBottom: 14 }}>
            1. CABECERA & IDENTIFICACIÓN DEL ASIENTO
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Fecha Contable *</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontWeight: 700, fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Tipo de Asiento</label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="Standard">Operativo / Estándar</option>
                <option value="Opening">Asiento de Apertura</option>
                <option value="Closing">Asiento de Cierre de Ejercicio</option>
                <option value="Adjustment">Asiento de Ajuste / Regularización</option>
                <option value="InflationAdjustment">Ajuste por Inflación (RT 6)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Serie / Diario</label>
              <input
                type="text"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder="General, Ajustes, Bancos..."
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div style={{ gridColumn: "span 3" }}>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Concepto General / Glosa del Asiento *</label>
              <input
                type="text"
                required
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="ej. Devengamiento de alquileres e impuestos mensuales período corriente"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: LÍNEAS CONTABLES & PARTIDA DOBLE */}
        <div className="card pad" style={{ marginBottom: 24, borderLeft: "5px solid #3b82f6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "#1d4ed8" }}>
                2. RENGLONES DEL ASIENTO (DEBE / HABER)
              </div>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                Imputación de cuentas contables imputables con balanceo obligatorio.
              </span>
            </div>

            <button
              type="button"
              onClick={addLine}
              className="btn"
              style={{ background: "#0d9488", color: "#fff", fontSize: "0.88rem", fontWeight: 800, padding: "8px 18px" }}
            >
              ➕ Agregar Renglón
            </button>
          </div>

          <div className="table-wrap" style={{ border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)" }}>
            <table style={{ margin: 0, width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                  <th style={{ width: 45, textAlign: "center", padding: "12px 6px" }}>#</th>
                  <th style={{ width: "35%", minWidth: 280, padding: "12px 14px" }}>Cuenta Contable (Plan de Cuentas)</th>
                  <th style={{ width: "20%", minWidth: 160, padding: "12px 10px" }}>Centro de Costo (Opcional)</th>
                  <th style={{ width: "20%", minWidth: 160, padding: "12px 10px" }}>Glosa / Leyenda Específica</th>
                  <th style={{ width: 140, textAlign: "right", padding: "12px 12px" }}>DEBE ($)</th>
                  <th style={{ width: 140, textAlign: "right", padding: "12px 12px" }}>HABER ($)</th>
                  <th style={{ width: 45, textAlign: "center", padding: "12px 6px" }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid #e2e8f0", background: index % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                    <td style={{ textAlign: "center", fontWeight: 800, color: "#64748b", padding: "10px 6px" }}>{index + 1}</td>
                    
                    <td style={{ padding: "10px 14px" }}>
                      <select
                        value={l.accountCode}
                        onChange={(e) => handleAccountSelect(index, e.target.value)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.88rem", background: "#fff", fontWeight: 600 }}
                      >
                        <option value="">-- Seleccionar Cuenta Imputable --</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.code}>
                            {acc.code} — {acc.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ padding: "10px 10px" }}>
                      <select
                        value={l.costCenterId || ""}
                        onChange={(e) => {
                          const cc = costCenters.find((c) => c.id === e.target.value);
                          const updated = [...lines];
                          updated[index].costCenterId = e.target.value || undefined;
                          updated[index].costCenterCode = cc ? cc.code : undefined;
                          setLines(updated);
                        }}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.85rem", background: "#fff" }}
                      >
                        <option value="">-- Ninguno / Central --</option>
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code} - {cc.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={{ padding: "10px 10px" }}>
                      <input
                        type="text"
                        value={l.memo || ""}
                        onChange={(e) => handleLineChange(index, "memo", e.target.value)}
                        placeholder="Glosa del renglón..."
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                      />
                    </td>

                    <td style={{ padding: "10px 12px" }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.debit === 0 ? "" : l.debit}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleLineChange(index, "debit", val);
                          if (val > 0) handleLineChange(index, "credit", 0);
                        }}
                        placeholder="0.00"
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: "1px solid #cbd5e1",
                          textAlign: "right",
                          fontWeight: 800,
                          fontSize: "0.95rem",
                          color: l.debit > 0 ? "#1d4ed8" : "inherit",
                          background: l.debit > 0 ? "#eff6ff" : "#fff"
                        }}
                      />
                    </td>

                    <td style={{ padding: "10px 12px" }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.credit === 0 ? "" : l.credit}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleLineChange(index, "credit", val);
                          if (val > 0) handleLineChange(index, "debit", 0);
                        }}
                        placeholder="0.00"
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: "1px solid #cbd5e1",
                          textAlign: "right",
                          fontWeight: 800,
                          fontSize: "0.95rem",
                          color: l.credit > 0 ? "#15803d" : "inherit",
                          background: l.credit > 0 ? "#f0fdf4" : "#fff"
                        }}
                      />
                    </td>

                    <td style={{ textAlign: "center", padding: "10px 6px" }}>
                      <button
                        type="button"
                        disabled={lines.length <= 2}
                        onClick={() => removeLine(index)}
                        className="btn ghost compact"
                        style={{ color: lines.length <= 2 ? "#cbd5e1" : "#dc2626", padding: "6px 10px", borderRadius: 6, fontSize: "0.95rem" }}
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

        {/* BALANCE SUMMARY CARD */}
        <div
          className="card pad"
          style={{
            marginBottom: 30,
            background: isBalanced ? "#f0fdf4" : "#fef2f2",
            border: `1.5px solid ${isBalanced ? "#86efac" : "#fca5a5"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>{isBalanced ? "⚖️" : "⚠️"}</span>
            <div>
              <strong style={{ fontSize: "1.05rem", color: isBalanced ? "#166534" : "#991b1b" }}>
                {isBalanced ? "Asiento Balanceado Correctamente (Partida Doble)" : "Asiento Desbalanceado"}
              </strong>
              <div style={{ fontSize: "0.85rem", color: isBalanced ? "#15803d" : "#b91c1c" }}>
                {isBalanced
                  ? "El total del Debe coincide exactamente con el total del Haber."
                  : `Diferencia a balancear: $ ${diff.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 24, textAlign: "right" }}>
            <div>
              <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 700 }}>Total DEBE</div>
              <strong style={{ fontSize: "1.3rem", color: "#1d4ed8" }}>
                $ {totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 700 }}>Total HABER</div>
              <strong style={{ fontSize: "1.3rem", color: "#15803d" }}>
                $ {totalCredit.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
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
          <Link to="/contabilidad/asientos" className="btn ghost" style={{ padding: "9px 20px" }}>
            ← Cancelar y Volver
          </Link>
          <button
            type="submit"
            disabled={saving || !isBalanced}
            className="btn"
            style={{
              background: isBalanced ? "#0d9488" : "#94a3b8",
              color: "#fff",
              fontWeight: 800,
              padding: "10px 28px",
              fontSize: "0.95rem",
              minWidth: 200,
              cursor: isBalanced ? "pointer" : "not-allowed"
            }}
          >
            {saving ? "Registrando..." : "💾 Registrar Asiento Contable"}
          </button>
        </div>
      </form>
    </div>
  );
}
