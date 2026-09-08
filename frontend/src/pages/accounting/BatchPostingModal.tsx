import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type {
  UnpostedDocumentsSummary,
  BatchPostingPreview,
  BatchPostingExecuteResponse
} from "../../api/types";

const BATCH_POSTING_DISABLED =
  "La contabilización en lote está en reconstrucción y no generará asientos hasta conectar documentos reales.";

interface BatchPostingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BatchPostingModal({ isOpen, onClose }: BatchPostingModalProps) {
  const navigate = useNavigate();

  // Current Step: 1 = Filters/Selection, 2 = Preview, 3 = In Progress, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Filters
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [includeSales, setIncludeSales] = useState(true);
  const [includePurchases, setIncludePurchases] = useState(true);
  const [includeFinance, setIncludeFinance] = useState(true);
  const [includeInventory, setIncludeInventory] = useState(false);

  // Data & States
  const [summary, setSummary] = useState<UnpostedDocumentsSummary | null>(null);
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
      api.getUnpostedDocumentsSummary()
        .then(setSummary)
        .catch((err) => console.error("Error al obtener resumen de pendientes:", err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleQuickPeriod = (type: "today" | "lastWeek" | "thisMonth") => {
    const now = new Date();
    if (type === "today") {
      setStartDate(now.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (type === "lastWeek") {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setStartDate(past.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (type === "thisMonth") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    }
  };

  const getSelectedModules = () => {
    const list: string[] = [];
    if (includeSales) list.push("Sales");
    if (includePurchases) list.push("Purchases");
    if (includeFinance) list.push("Finance");
    if (includeInventory) list.push("Inventory");
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
        modules: getSelectedModules(),
        executedBy: "Contador"
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
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 16
      }}
    >
      <div
        className="modal-content"
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "95vw",
          maxWidth: "1150px",
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)"
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.4rem" }}>🔴</span>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>
                {step === 1 && "Contabilizar Documentos de Gestión"}
                {step === 2 && "Vista Previa de Asientos a Generar"}
                {step === 3 && "Generando Asientos Contables..."}
                {step === 4 && "✓ Contabilización Exitosa"}
              </h2>
              <span className="muted" style={{ fontSize: "0.78rem" }}>
                Módulo Contable — Motor de Asientos Modelos & Partida Doble
              </span>
            </div>
          </div>
          {step !== 3 && (
            <button
              type="button"
              onClick={onClose}
              className="btn ghost compact"
              style={{ fontSize: "1.2rem", lineHeight: 1 }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {error && (
            <div
              className="alert"
              style={{
                marginBottom: 16,
                background: "#fef2f2",
                color: "#dc2626",
                border: "1px solid #fecaca",
                padding: "10px 14px",
                borderRadius: 6,
                fontSize: "0.85rem"
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* ============================================================ */}
          {/* PASO 1: Selección de Período y Módulos */}
          {/* ============================================================ */}
          {step === 1 && (
            <div>
              <div
                className="alert"
                style={{
                  marginBottom: 16,
                  background: "#fffbeb",
                  color: "#92400e",
                  border: "1px solid #fde68a",
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontSize: "0.85rem"
                }}
              >
                ⚠️ {BATCH_POSTING_DISABLED}
              </div>
              <p style={{ margin: "0 0 16px", fontSize: "0.88rem", color: "#475569" }}>
                Seleccione el período de fechas y los módulos operativos que desea contabilizar en el Libro Diario.
              </p>

              {/* Período */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: "0.86rem", color: "#0f766e" }}>📅 PERÍODO CONTABLE:</strong>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => handleQuickPeriod("today")} className="btn ghost compact" style={{ fontSize: "0.74rem" }}>
                      Hoy
                    </button>
                    <button type="button" onClick={() => handleQuickPeriod("lastWeek")} className="btn ghost compact" style={{ fontSize: "0.74rem" }}>
                      Últ. Semana
                    </button>
                    <button type="button" onClick={() => handleQuickPeriod("thisMonth")} className="btn ghost compact" style={{ fontSize: "0.74rem" }}>
                      Mes Actual
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: 4 }}>Desde:</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: 4 }}>Hasta:</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                    />
                  </div>
                </div>
              </div>

              {/* Módulos a Incluir */}
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 18 }}>
                <strong style={{ display: "block", fontSize: "0.86rem", color: "#0f766e", marginBottom: 10 }}>
                  📦 MÓDULOS A INCLUIR:
                </strong>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={includeSales} onChange={(e) => setIncludeSales(e.target.checked)} />
                    <span>🛒 <strong>Ventas</strong> ({summary?.salesPendingCount ?? 0} comprobantes)</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={includePurchases} onChange={(e) => setIncludePurchases(e.target.checked)} />
                    <span>📦 <strong>Compras</strong> ({summary?.purchasesPendingCount ?? 0} comprobantes)</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={includeFinance} onChange={(e) => setIncludeFinance(e.target.checked)} />
                    <span>💳 <strong>Finanzas & Cobranzas</strong> ({summary?.financePendingCount ?? 0} recibos/pagos)</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={includeInventory} onChange={(e) => setIncludeInventory(e.target.checked)} />
                    <span>🏭 <strong>Inventario & Ajustes</strong> ({summary?.inventoryPendingCount ?? 0} movimientos)</span>
                  </label>
                </div>
              </div>

              {/* Resumen Box */}
              <div style={{ border: "2px dashed #0d9488", background: "#f0fdfa", padding: 14, borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "0.84rem", color: "#0f766e", fontWeight: 700 }}>DOCUMENTOS PENDIENTES DE CONTABILIZAR:</div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f766e" }}>
                      {summary?.totalPendingCount ?? 0} documentos detectados
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.78rem", color: "#666" }}>
                    Período: {new Date(startDate).toLocaleDateString("es-AR")} al {new Date(endDate).toLocaleDateString("es-AR")}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* PASO 2: Vista Previa y Validación de Cuadre */}
          {/* ============================================================ */}
          {step === 2 && preview && (
            <div>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 14px", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "1.4rem" }}>✓</span>
                <div style={{ fontSize: "0.85rem", color: "#166534" }}>
                  <strong>Validaciones de Asientos Modelos completadas con éxito.</strong>
                  <div>Partida doble balanceada: Total Debe = Total Haber verificado.</div>
                </div>
              </div>

              {/* Métricas Resumen */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
                <div style={{ background: "#f8fafc", padding: 10, borderRadius: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#666" }}>Documentos a Procesar</div>
                  <strong style={{ fontSize: "1.25rem" }}>{preview.documentsCount}</strong>
                </div>
                <div style={{ background: "#f8fafc", padding: 10, borderRadius: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#666" }}>Asientos a Generar</div>
                  <strong style={{ fontSize: "1.25rem", color: "#0d9488" }}>{preview.estimatedEntriesCount}</strong>
                </div>
                <div style={{ background: "#f8fafc", padding: 10, borderRadius: 6, border: "1px solid #e2e8f0", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#666" }}>Líneas Contables</div>
                  <strong style={{ fontSize: "1.25rem" }}>{preview.totalLinesCount}</strong>
                </div>
              </div>

              {/* Cuentas Afectadas & Balance */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ padding: "8px 12px", background: "#f1f5f9", fontWeight: 700, fontSize: "0.82rem", color: "#334155" }}>
                  📊 CUENTAS AFECTADAS EN EL LOTE:
                </div>
                <table style={{ margin: 0, fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      <th>Cuenta Contable</th>
                      <th style={{ textAlign: "right", width: 140 }}>Debe ($)</th>
                      <th style={{ textAlign: "right", width: 140 }}>Haber ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.accountsAffected.map((acc, idx) => (
                      <tr key={idx}>
                        <td>
                          <strong>{acc.accountCode}</strong> — {acc.accountName}
                        </td>
                        <td style={{ textAlign: "right", color: acc.totalDebit > 0 ? "#0369a1" : "inherit" }}>
                          {acc.totalDebit > 0 ? `$${acc.totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: acc.totalCredit > 0 ? "#047857" : "inherit" }}>
                          {acc.totalCredit > 0 ? `$${acc.totalCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#f0fdf4", fontWeight: 800, borderTop: "2px solid #22c55e" }}>
                      <td>TOTALES GENERALES DEL LOTE:</td>
                      <td style={{ textAlign: "right", color: "#0369a1" }}>
                        ${preview.totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "right", color: "#047857" }}>
                        ${preview.totalCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Checkbox de Confirmación */}
              <div style={{ background: "#fffbeb", border: "1px solid #fef3c7", padding: "12px 16px", borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, color: "#92400e" }}>
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
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 14 }}>⚙️</div>
              <h3 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Generando Asientos en el Libro Diario...</h3>
              <p className="muted" style={{ margin: "0 0 20px", fontSize: "0.85rem" }}>
                Aplicando plantillas de Asientos Modelos y asignando numeración correlativa.
              </p>
              <div style={{ width: "100%", height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(90deg, #0d9488, #22c55e)",
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
              <div style={{ background: "#f0fdf4", border: "2px solid #22c55e", padding: 18, borderRadius: 8, textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 6 }}>🎉</div>
                <h3 style={{ margin: "0 0 4px", fontSize: "1.3rem", color: "#166534", fontWeight: 800 }}>
                  ¡Contabilización Completada con Éxito!
                </h3>
                <div style={{ fontSize: "0.85rem", color: "#15803d" }}>
                  Lote Nº: <strong>{result.batchNumber}</strong>
                </div>
              </div>

              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 18 }}>
                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "#0f766e", marginBottom: 8 }}>
                  RESUMEN DE AUDITORÍA:
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.85rem", lineHeight: 1.8 }}>
                  <li>✓ <strong>{result.entriesGenerated}</strong> asientos generados exitosamente en el Libro Diario.</li>
                  <li>✓ <strong>{result.documentsProcessed}</strong> comprobantes marcados como contabilizados.</li>
                  <li>✓ Asientos generados: <strong>{result.entryNumbers.slice(0, 5).join(", ")}{result.entryNumbers.length > 5 ? "..." : ""}</strong></li>
                  <li>✓ Total Débitos / Créditos: <strong>${result.totalDebit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></li>
                  <li>✓ Tiempo de procesamiento: <strong>{result.durationSeconds} segundos</strong>.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc"
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
                style={{ background: "#0d9488", color: "#fff", fontWeight: 700 }}
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
                disabled
                title={BATCH_POSTING_DISABLED}
                className="btn"
                style={{
                  background: "#cbd5e1",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "not-allowed"
                }}
              >
                🔴 CONTABILIZAR AHORA (deshabilitado)
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate("/contabilidad/diario");
                }}
                className="btn ghost"
              >
                📖 Ver en Libro Diario
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn"
                style={{ background: "#0d9488", color: "#fff", fontWeight: 700 }}
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
