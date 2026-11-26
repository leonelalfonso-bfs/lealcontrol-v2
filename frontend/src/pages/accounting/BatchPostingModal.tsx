import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { todayAr, addDaysAr, monthRangeAr } from "../../lib/dates";
import type { BatchPostingPreview, BatchPostingExecuteResponse } from "../../api/types";

/** yyyy-mm-dd → dd/mm/yyyy, sin pasar por Date (que lo corre un día por la zona horaria). */
const dayLabel = (iso: string) => iso.split("-").reverse().join("/");

interface BatchPostingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BatchPostingModal({ isOpen, onClose }: BatchPostingModalProps) {
  const navigate = useNavigate();

  // Current Step: 1 = Filters/Selection, 2 = Preview, 3 = In Progress, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Filters
  const today = todayAr();
  const firstOfMonth = monthRangeAr().from;

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [includeSales, setIncludeSales] = useState(true);
  const [includePurchases, setIncludePurchases] = useState(true);
  const [includeFinance, setIncludeFinance] = useState(true);
  const [includePayroll, setIncludePayroll] = useState(true);

  // Data & States
  const [preview, setPreview] = useState<BatchPostingPreview | null>(null);
  const [result, setResult] = useState<BatchPostingExecuteResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setError(null);
      setConfirmed(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleQuickPeriod = (type: "today" | "lastWeek" | "thisMonth") => {
    if (type === "today") {
      setStartDate(todayAr());
      setEndDate(todayAr());
    } else if (type === "lastWeek") {
      setStartDate(addDaysAr(-7));
      setEndDate(todayAr());
    } else if (type === "thisMonth") {
      setStartDate(monthRangeAr().from);
      setEndDate(todayAr());
    }
  };

  const getSelectedModules = () => {
    const list: string[] = [];
    if (includeSales) list.push("Sales");
    if (includePurchases) list.push("Purchases");
    if (includeFinance) list.push("Finance");
    if (includePayroll) list.push("Payroll");
    return list;
  };

  const handleFetchPreview = async () => {
    const modules = getSelectedModules();
    if (modules.length === 0) {
      setError("Debe seleccionar al menos un módulo para contabilizar.");
      return;
    }

    setLoadingPreview(true);
    setError(null);

    try {
      const res = await api.previewBatchPosting({
        periodStart: startDate,
        periodEnd: endDate,
        modules
      });
      setPreview(res);
      setStep(2);
    } catch (err: any) {
      setError(err?.message || "Error al generar la vista previa de contabilización.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExecuteBatch = async () => {
    if (!confirmed) return;

    setStep(3);
    setExecuting(true);
    setError(null);

    try {
      const res = await api.executeBatchPosting({
        periodStart: startDate,
        periodEnd: endDate,
        modules: getSelectedModules()
      });
      setResult(res);
      setStep(4);
    } catch (err: any) {
      setError(err?.message || "Error crítico durante la generación de asientos.");
      setStep(2);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-card"
        style={{
          width: "min(1150px, 95vw)",
          maxWidth: "none",
          maxHeight: "94vh",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--lc-line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--lc-surface-2)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.4rem" }}>🔴</span>
            <div>
              <h2 style={{ margin: 0 }}>
                {step === 1 && "Contabilizar Documentos de Gestión"}
                {step === 2 && "Vista Previa de Asientos a Generar"}
                {step === 3 && "Generando Asientos Contables..."}
                {step === 4 && "✓ Contabilización Exitosa"}
              </h2>
              <span className="muted t-small">
                Módulo Contable — Motor de Asientos Modelos & Partida Doble
              </span>
            </div>
          </div>
          {step !== 3 && (
            <button
              type="button"
              onClick={onClose}
              className="btn ghost compact"
              style={{ lineHeight: 1 }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {error && (
            <div
              className="alert t-small"
              style={{ marginBottom: 16 }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* ============================================================ */}
          {/* PASO 1: Selección de Período y Módulos */}
          {/* ============================================================ */}
          {step === 1 && (
            <div>
              <p className="muted" style={{ margin: "0 0 16px" }}>
                Elegí el período y los módulos. En la vista previa el sistema trae las facturas de venta autorizadas por ARCA,
                las facturas de proveedor y los cobros y pagos del período que todavía no se contabilizaron, y muestra los asientos
                que va a generar. Nada se graba hasta que confirmes.
              </p>

              {/* Período */}
              <div className="box" style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong className="t-accent">📅 PERÍODO CONTABLE:</strong>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => handleQuickPeriod("today")} className="btn ghost compact">
                      Hoy
                    </button>
                    <button type="button" onClick={() => handleQuickPeriod("lastWeek")} className="btn ghost compact">
                      Últ. Semana
                    </button>
                    <button type="button" onClick={() => handleQuickPeriod("thisMonth")} className="btn ghost compact">
                      Mes Actual
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label>Desde:</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label>Hasta:</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
              </div>

              {/* Módulos a Incluir */}
              <div className="box" style={{ marginBottom: 18 }}>
                <strong className="t-accent" style={{ display: "block", marginBottom: 10 }}>
                  📦 MÓDULOS A INCLUIR:
                </strong>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={includeSales} onChange={(e) => setIncludeSales(e.target.checked)} />
                    <span>🛒 <strong>Ventas</strong> (facturas y notas)</span>
                  </label>

                  <label style={{ alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={includePurchases} onChange={(e) => setIncludePurchases(e.target.checked)} />
                    <span>📦 <strong>Compras</strong> (facturas de proveedor y notas)</span>
                  </label>

                  <label style={{ alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={includeFinance} onChange={(e) => setIncludeFinance(e.target.checked)} />
                    <span>💳 <strong>Finanzas</strong> (cobros y pagos)</span>
                  </label>

                  <label style={{ alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={includePayroll} onChange={(e) => setIncludePayroll(e.target.checked)} />
                    <span>👥 <strong>Sueldos</strong> (liquidaciones cerradas)</span>
                  </label>

                </div>
              </div>

              <div className="muted t-small">
                Período: {dayLabel(startDate)} al {dayLabel(endDate)}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* PASO 2: Vista Previa y Validación de Cuadre */}
          {/* ============================================================ */}
          {step === 2 && preview && (
            <div>
              {preview.documentsCount === 0 ? (
                <div className="alert" style={{ marginBottom: 16 }}>
                  No hay comprobantes pendientes de contabilizar en el período elegido.
                </div>
              ) : preview.isBalanced && preview.warnings.length === 0 && preview.unmappedDocuments.length === 0 ? (
                <div className="t-small t-ok" style={{ background: "var(--lc-ok-bg)", border: "1px solid var(--lc-ok-bg)", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>
                  <strong>✓ Todos los comprobantes tienen asiento modelo y cada asiento cuadra (Debe = Haber).</strong>
                </div>
              ) : (
                <div className="t-small t-warn" style={{ background: "var(--lc-warn-bg)", border: "1px solid var(--lc-warn-bg)", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>
                  <strong>⚠️ Revisá antes de confirmar:</strong> los comprobantes con problemas quedan pendientes, con el motivo, y el resto se contabiliza.
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {preview.unmappedDocuments.map((d) => <li key={d}>Sin asiento modelo: {d}</li>)}
                    {preview.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Métricas Resumen */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
                <div className="box t-center">
                  <div className="t-small muted">Documentos a Procesar</div>
                  <strong style={{ fontSize: "1.25rem" }}>{preview.documentsCount}</strong>
                </div>
                <div className="box t-center">
                  <div className="t-small muted">Asientos a Generar</div>
                  <strong className="t-accent" style={{ fontSize: "1.25rem" }}>{preview.estimatedEntriesCount}</strong>
                </div>
                <div className="box t-center">
                  <div className="t-small muted">Líneas Contables</div>
                  <strong style={{ fontSize: "1.25rem" }}>{preview.totalLinesCount}</strong>
                </div>
              </div>

              {/* Cuentas Afectadas & Balance */}
              <div style={{ border: "1px solid var(--lc-line)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                <div className="t-strong t-small muted" style={{ padding: "8px 12px", background: "var(--lc-surface-2)" }}>
                  📊 CUENTAS AFECTADAS EN EL LOTE:
                </div>
                <table style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Cuenta Contable</th>
                      <th className="t-right" style={{ width: 140 }}>Debe ($)</th>
                      <th className="t-right" style={{ width: 140 }}>Haber ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.accountsAffected.map((acc, idx) => (
                      <tr key={idx}>
                        <td>
                          <strong>{acc.accountCode}</strong> — {acc.accountName}
                        </td>
                        <td className="t-right" style={{ color: acc.totalDebit > 0 ? "#0369a1" : "inherit" }}>
                          {acc.totalDebit > 0 ? `$${acc.totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td className="t-right" style={{ color: acc.totalCredit > 0 ? "#047857" : "inherit" }}>
                          {acc.totalCredit > 0 ? `$${acc.totalCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="t-strong">
                      <td>TOTALES GENERALES DEL LOTE:</td>
                      <td className="t-right t-info">
                        ${preview.totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="t-right t-ok">
                        ${preview.totalCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Checkbox de Confirmación */}
              <div style={{ background: "var(--lc-warn-bg)", border: "1px solid var(--lc-warn-bg)", padding: "12px 16px", borderRadius: 8 }}>
                <label style={{ alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    style={{ transform: "scale(1.2)" }}
                  />
                  <span>
                    Confirmo que he revisado el balance y deseo contabilizar {preview.estimatedEntriesCount} asientos en el Libro Diario.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* PASO 3: Ejecución en Progreso */}
          {/* ============================================================ */}
          {step === 3 && (
            <div className="t-center" style={{ padding: "40px 20px" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 14 }}>⚙️</div>
              <h3 style={{ margin: "0 0 8px" }}>Generando Asientos en el Libro Diario...</h3>
              <p className="muted t-small" style={{ margin: "0 0 20px" }}>
                Aplicando plantillas de Asientos Modelos y asignando numeración correlativa.
              </p>
              <div style={{ width: "100%", height: 8, background: "var(--lc-line)", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(90deg, var(--lc-accent), var(--lc-ok))",
                    animation: "pulse 1.5s infinite"
                  }}
                />
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* PASO 4: Resultado Exitoso */}
          {/* ============================================================ */}
          {step === 4 && result && (
            <div>
              <div className="t-center" style={{ background: "var(--lc-ok-bg)", border: "2px solid var(--lc-ok)", padding: 18, borderRadius: 8, marginBottom: 20 }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 6 }}>🎉</div>
                <h3 style={{ margin: "0 0 4px" }}>
                  {result.errorsCount === 0 ? "Contabilización terminada" : "Contabilización terminada con avisos"}
                </h3>
                <div className="t-small t-ok">
                  Lote Nº: <strong>{result.batchNumber}</strong>
                </div>
              </div>

              <div className="box" style={{ marginBottom: 18 }}>
                <div className="t-strong t-accent" style={{ marginBottom: 8 }}>
                  RESUMEN DE AUDITORÍA:
                </div>
                <ul className="t-small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
                  <li>✓ <strong>{result.entriesGenerated}</strong> asientos generados exitosamente en el Libro Diario.</li>
                  <li>✓ <strong>{result.documentsProcessed}</strong> comprobantes marcados como contabilizados.</li>
                  <li>✓ Asientos generados: <strong>{result.entryNumbers.slice(0, 5).join(", ")}{result.entryNumbers.length > 5 ? "..." : ""}</strong></li>
                  <li>✓ Total Débitos / Créditos: <strong>${result.totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></li>
                </ul>
                {result.exceptions.length > 0 && (
                  <>
                    <div className="t-strong t-warn" style={{ margin: "12px 0 4px" }}>
                      QUEDARON PENDIENTES ({result.errorsCount}):
                    </div>
                    <ul className="t-small t-warn" style={{ margin: 0, paddingLeft: 20 }}>
                      {result.exceptions.map((x) => <li key={x}>{x}</li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--lc-line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--lc-surface-2)"
          }}
        >
          {step === 1 && (
            <>
              <button type="button" onClick={onClose} className="btn ghost">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFetchPreview}
                disabled={loadingPreview}
                className="btn"
              >
                {loadingPreview ? "Analizando..." : "👁️ Vista Previa de Asientos →"}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button type="button" onClick={() => setStep(1)} className="btn ghost">
                ← Volver a Filtros
              </button>
              <button
                type="button"
                onClick={handleExecuteBatch}
                disabled={!confirmed || preview?.estimatedEntriesCount === 0}
                className="btn danger"
              >
                🔴 Contabilizar ahora
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate("/contabilidad/asientos");
                }}
                className="btn ghost"
              >
                📖 Ver en Libro Diario
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn"
              >
                Finalizar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
