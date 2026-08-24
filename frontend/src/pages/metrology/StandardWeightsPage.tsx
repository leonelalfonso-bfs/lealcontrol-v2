import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { StandardWeight } from "../../api/types";
import { extractTextFromPdf, parseCertificateText, ParsedCertificateResult, ParsedWeightItem } from "../../utils/certificateParser";

export function StandardWeightsPage() {
  const navigate = useNavigate();

  // State
  const [weights, setWeights] = useState<StandardWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [lotFilter, setLotFilter] = useState("");

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLotInput, setBulkLotInput] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Sub-screens: 'list' | 'import' | 'history'
  const [currentScreen, setCurrentScreen] = useState<"list" | "import" | "history">("list");

  // PDF Import State
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [importProgressMsg, setImportProgressMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ParsedCertificateResult | null>(null);
  const [importLotName, setImportLotName] = useState("");
  const [importRows, setImportRows] = useState<(ParsedWeightItem & { selected: boolean })[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History & Drift Modal/Drawer State
  const [historyWeightCode, setHistoryWeightCode] = useState<string>("");
  const [historyRecords, setHistoryRecords] = useState<StandardWeight[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load weights list
  const loadWeights = () => {
    setLoading(true);
    api.listStandardWeights({
      search: search || undefined,
      status: statusFilter || undefined,
      lot: lotFilter || undefined
    })
      .then((data) => {
        setWeights(data);
        setSelectedIds([]);
      })
      .catch((err) => console.error("Error al cargar pesas:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWeights();
  }, [statusFilter, lotFilter]);

  // Unique Lots for filtering
  const uniqueLots = Array.from(new Set(weights.map((w) => w.lotName).filter(Boolean))) as string[];

  // Selection handlers
  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(weights.map((w) => w.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Bulk Lot Assignment
  const handleApplyBulkLot = async (clear: boolean = false) => {
    const lotName = clear ? "" : bulkLotInput.trim();
    if (!clear && !lotName) {
      alert("Por favor, ingresá un nombre para el lote.");
      return;
    }
    if (selectedIds.length === 0) return;

    if (!confirm(clear ? `¿Quitar el lote de los ${selectedIds.length} patrones seleccionados?` : `¿Asignar el lote "${lotName}" a los ${selectedIds.length} patrones seleccionados?`)) {
      return;
    }

    try {
      setBulkLoading(true);
      await api.bulkUpdateStandardWeightLot(selectedIds, lotName);
      setBulkLotInput("");
      loadWeights();
    } catch (err: any) {
      alert("Error al actualizar lotes: " + (err?.message || ""));
    } finally {
      setBulkLoading(false);
    }
  };

  // Delete Single Weight
  const handleDeleteWeight = async (id: string, code: string) => {
    if (!confirm(`¿Eliminar el patrón [${code}]? Esta acción no se puede deshacer.`)) return;
    try {
      await api.deleteStandardWeight(id);
      loadWeights();
    } catch (err: any) {
      alert("Error al eliminar patrón: " + (err?.message || ""));
    }
  };

  // Clear All Inventory
  const handleClearAll = async () => {
    if (!confirm("⚠️ ¿ESTÁS ABSOLUTAMENTE SEGURO? Esta acción eliminará TODAS las pesas y certificados cargados en el inventario.")) return;
    if (!confirm("Confirmación final: ¿Realmente querés vaciar todo el inventario de pesas patrón?")) return;

    try {
      setLoading(true);
      const res = await api.clearAllStandardWeights();
      alert(`✅ ${res.message}`);
      loadWeights();
    } catch (err: any) {
      alert("Error al vaciar inventario: " + (err?.message || ""));
      setLoading(false);
    }
  };

  // History & Drift Modal
  const handleOpenHistory = async (code: string) => {
    setHistoryWeightCode(code);
    setHistoryLoading(true);
    setCurrentScreen("history");
    try {
      const records = await api.getStandardWeightHistory(code);
      setHistoryRecords(records);
    } catch (err) {
      console.error("Error al obtener historial:", err);
      setHistoryRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // PDF Import Handlers
  const handlePdfSelected = async (file: File) => {
    if (!file) return;
    try {
      setImportProgressMsg("Leyendo archivo PDF…");
      const text = await extractTextFromPdf(file, (msg) => setImportProgressMsg(msg));
      setImportProgressMsg("Analizando estructura de datos y tablas de calibración…");
      const parsed = parseCertificateText(text, file.name);

      setImportResult(parsed);
      setImportRows(
        parsed.weights.map((w) => ({
          ...w,
          selected: true
        }))
      );
      setImportLotName(parsed.weights[0]?.lotName || "");
      setImportStep(2);
      setImportProgressMsg(null);
    } catch (err: any) {
      alert("Error al leer el certificado PDF: " + (err?.message || err));
      setImportProgressMsg(null);
    }
  };

  const handleConfirmImport = async () => {
    const selected = importRows.filter((r) => r.selected);
    if (selected.length === 0) {
      alert("No hay pesas seleccionadas para importar.");
      return;
    }

    const certNum = importResult?.certInfo.certificateNumber || "";
    const calDate = importResult?.certInfo.calibrationDate || null;
    const expDate = importResult?.certInfo.expirationDate || null;
    const fk = importResult?.certInfo.factorK || 2.0;

    const payload = selected.map((r) => ({
      code: r.identification.trim(),
      serialNumber: r.serialNumber?.trim() || "",
      manufacturer: r.manufacturer?.trim() || "",
      lotName: importLotName.trim() || r.lotName?.trim() || "",
      nominalValue: r.nominalValue,
      unit: r.unit || "kg",
      accuracyClass: r.accuracyClass || "M1",
      material: "Hierro Fundido",
      errorAsFound: r.errorAsFound ?? null,
      conventionalMassCorrection: r.conventionalMassCorrection ?? 0,
      uncertainty: r.uncertainty ?? 0,
      unitEc: r.unitEc || "g",
      factorK: fk,
      certificateNumber: certNum,
      traceabilityLab: "Laboratorio Acreditado",
      calibrationDate: calDate ? new Date(calDate).toISOString() : null,
      expirationDate: expDate ? new Date(expDate).toISOString() : null,
      status: "Valid"
    }));

    try {
      setImporting(true);
      const res = await api.bulkImportStandardWeights(payload);
      alert(`✅ ${res.message}`);
      setCurrentScreen("list");
      setImportStep(1);
      setImportResult(null);
      loadWeights();
    } catch (err: any) {
      alert("Error al importar pesas: " + (err?.message || ""));
    } finally {
      setImporting(false);
    }
  };

  // Helper for real mass calculation
  const calculateRealMass = (nominal: number, ec: number | null | undefined, unitEc: string = "g") => {
    if (ec === null || ec === undefined || isNaN(ec)) return nominal;
    const factor = unitEc.toLowerCase() === "g" ? 1 / 1000 : 1;
    return nominal + ec * factor;
  };

  // Helper for formatting error with sign
  const formatError = (val: number | null | undefined, unit: string = "g") => {
    if (val === null || val === undefined || isNaN(val)) return "—";
    const sign = val > 0 ? "+" : "";
    return `${sign}${val.toLocaleString("es-AR", { minimumFractionDigits: val % 1 === 0 ? 0 : 3, maximumFractionDigits: 4 })} ${unit}`;
  };

  // Helper to check expiration
  const isWeightExpired = (expDate?: string | null) => {
    if (!expDate) return false;
    return new Date(expDate).getTime() < Date.now();
  };

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* ═══════════════════════════════════════════
          PANTALLA: HISTORIAL & DERIVA METROLÓGICA (DRAWER / MODAL)
      ═══════════════════════════════════════════ */}
      {currentScreen === "history" && (
        <div style={{ marginBottom: 25 }}>
          <div className="card pad" style={{ borderLeft: "5px solid #0d9488" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem" }}>
                  ISO/IEC 17025 • Trazabilidad & Estabilidad
                </span>
                <h2 style={{ margin: "2px 0 0", fontSize: "1.5rem", fontWeight: 800, color: "#0f172a" }}>
                  🕒 Historial de Calibración & Deriva: <span style={{ color: "#0d9488" }}>{historyWeightCode}</span>
                </h2>
              </div>
              <button onClick={() => setCurrentScreen("list")} className="btn ghost">
                ← Volver al Inventario
              </button>
            </div>

            {historyLoading ? (
              <div style={{ padding: 30, textAlign: "center" }} className="muted">
                Cargando historial metrológico...
              </div>
            ) : historyRecords.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center" }} className="muted">
                No hay registros de calibraciones anteriores para este patrón.
              </div>
            ) : (
              <div className="table-wrap">
                <table style={{ width: "100%", fontSize: "0.88rem" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th>Fecha Cal.</th>
                      <th>Nº Certificado</th>
                      <th>Error As Found (Inicial)</th>
                      <th>Error Convencional (Final)</th>
                      <th>Incertidumbre U</th>
                      <th>Deriva Calculada (Δ)</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRecords.map((rec, i) => {
                      const calDate = rec.calibrationDate ? new Date(rec.calibrationDate).toLocaleDateString("es-AR") : "—";
                      const eaf = rec.errorAsFound;
                      const ec = rec.conventionalMassCorrection;
                      const u = rec.uncertainty || 0;
                      const unit = rec.unitEc || "g";

                      // Deriva respecto al registro anterior
                      let driftText = "—";
                      let driftColor = "#64748b";
                      if (i < historyRecords.length - 1) {
                        const prev = historyRecords[i + 1];
                        const prevEc = prev.conventionalMassCorrection;
                        if (eaf !== null && eaf !== undefined && prevEc !== null && prevEc !== undefined) {
                          const delta = eaf - prevEc;
                          const sign = delta > 0 ? "+" : "";
                          driftText = `${sign}${delta.toFixed(4)} ${unit}`;
                          if (Math.abs(delta) > u && u > 0) {
                            driftColor = "#dc2626"; // Alerta: Deriva supera la Incertidumbre U
                          } else if (Math.abs(delta) > u / 2 && u > 0) {
                            driftColor = "#d97706";
                          } else {
                            driftColor = "#16a34a";
                          }
                        }
                      }

                      const isExpired = isWeightExpired(rec.expirationDate);

                      return (
                        <tr key={rec.id}>
                          <td><strong>{calDate}</strong></td>
                          <td>{rec.certificateNumber || "—"}</td>
                          <td>{formatError(eaf, unit)}</td>
                          <td style={{ fontWeight: 700, color: (ec ?? 0) >= 0 ? "#16a34a" : "#dc2626" }}>
                            {formatError(ec, unit)}
                          </td>
                          <td>±{rec.uncertainty?.toFixed(3) || "0.000"} {unit} (k={rec.factorK || 2})</td>
                          <td style={{ color: driftColor, fontWeight: 700 }}>
                            {driftText}
                          </td>
                          <td>
                            <span className={`badge ${isExpired ? "prio-high" : "ok"}`}>
                              {isExpired ? "Vencido" : "Vigente"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          PANTALLA: SUB-PANTALLA DE IMPORTACIÓN PDF
      ═══════════════════════════════════════════ */}
      {currentScreen === "import" && (
        <div style={{ marginBottom: 25 }}>
          <div className="card pad" style={{ borderLeft: "5px solid #16a34a" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentScreen("list");
                    setImportStep(1);
                    setImportResult(null);
                  }}
                  className="btn ghost compact"
                >
                  ← Volver al Inventario
                </button>
                <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#15803d" }}>
                  📄 Importar Patrones desde Certificado de Calibración PDF
                </h2>
              </div>
            </div>

            {/* PASO 1: Dropzone */}
            {importStep === 1 && (
              <div>
                <div
                  style={{
                    border: "2px dashed #86efac",
                    borderRadius: 12,
                    padding: "40px 20px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: "#f0fdf4",
                    transition: "all 0.2s"
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file && file.type === "application/pdf") handlePdfSelected(file);
                  }}
                >
                  <div style={{ fontSize: "3rem", marginBottom: 12 }}>📄</div>
                  <h3 style={{ margin: "0 0 6px", fontSize: "1.2rem", fontWeight: 700, color: "#166534" }}>
                    Arrastrá el certificado de calibración PDF aquí
                  </h3>
                  <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                    o hacé click para seleccionar — Reconocimiento automático de <strong>CERPES/OAA</strong> y <strong>SIPEL/INTI</strong> (Lab N°20)
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handlePdfSelected(e.target.files[0]);
                    }}
                  />
                </div>

                {importProgressMsg && (
                  <div style={{ marginTop: 20, textAlign: "center", padding: 20, background: "#f8fafc", borderRadius: 8 }}>
                    <div className="muted" style={{ fontWeight: 600 }}>⏳ {importProgressMsg}</div>
                  </div>
                )}
              </div>
            )}

            {/* PASO 2: Preview & Editable Table */}
            {importStep === 2 && importResult && (
              <div>
                {/* Cert Info Banner */}
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 10,
                    padding: "16px 20px",
                    marginBottom: 20
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, fontSize: "0.88rem" }}>
                    <div>
                      <div className="muted" style={{ fontSize: "0.76rem" }}>N° Certificado</div>
                      <strong style={{ color: "#166534", fontSize: "1.05rem" }}>{importResult.certInfo.certificateNumber || "—"}</strong>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "0.76rem" }}>Fecha Calibración</div>
                      <strong>{importResult.certInfo.calibrationDate ? new Date(importResult.certInfo.calibrationDate).toLocaleDateString("es-AR") : "—"}</strong>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "0.76rem" }}>Fecha Vencimiento</div>
                      <strong>{importResult.certInfo.expirationDate ? new Date(importResult.certInfo.expirationDate).toLocaleDateString("es-AR") : "—"}</strong>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "0.76rem" }}>Factor de Cobertura</div>
                      <strong>k = {importResult.certInfo.factorK} (95%)</strong>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "0.76rem" }}>Formato Detectado</div>
                      <span className="tag" style={{ background: "#dcfce7", color: "#15803d", fontWeight: 700 }}>
                        {importResult.certInfo.formatDetected}
                      </span>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: "0.76rem" }}>Pesas Detectadas</div>
                      <strong style={{ color: "#15803d", fontSize: "1.1rem" }}>{importResult.count} masas</strong>
                    </div>
                  </div>
                </div>

                {/* Batch Lot Name Input */}
                <div
                  style={{
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 10,
                    padding: "14px 18px",
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, color: "#1e40af", marginBottom: 4 }}>
                      🏷️ Asignar Lote / Conjunto a todas estas pesas:
                    </label>
                    <input
                      type="text"
                      value={importLotName}
                      onChange={(e) => setImportLotName(e.target.value)}
                      placeholder="ej. Camión 1, Lote 22x1t Sipel, Pesas de Control..."
                      style={{ width: "100%", maxWidth: 450, padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
                    />
                  </div>
                  <div className="muted" style={{ fontSize: "0.8rem", maxWidth: 400 }}>
                    Permite seleccionar y cargar todo este juego de masas en conjunto con un solo click al realizar un ensayo técnico.
                  </div>
                </div>

                {/* Editable Preview Table */}
                <div className="table-wrap" style={{ marginBottom: 20, overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: "0.88rem", borderCollapse: "separate", borderSpacing: "0 4px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ width: 44, textAlign: "center", padding: "10px 8px" }}>
                          <input
                            type="checkbox"
                            style={{ width: 16, height: 16, cursor: "pointer" }}
                            checked={importRows.length > 0 && importRows.every((r) => r.selected)}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setImportRows((prev) => prev.map((r) => ({ ...r, selected: v })));
                            }}
                          />
                        </th>
                        <th style={{ minWidth: 120, padding: "10px 8px", whiteSpace: "nowrap" }}>Identificación *</th>
                        <th style={{ minWidth: 140, padding: "10px 8px", whiteSpace: "nowrap" }}>Marca / Fabricante</th>
                        <th style={{ minWidth: 110, padding: "10px 8px", whiteSpace: "nowrap" }}>N° Serie</th>
                        <th style={{ minWidth: 75, padding: "10px 8px", whiteSpace: "nowrap" }}>Clase</th>
                        <th style={{ minWidth: 110, padding: "10px 8px", whiteSpace: "nowrap" }}>Masa Nom. (kg) *</th>
                        <th style={{ minWidth: 120, padding: "10px 8px", whiteSpace: "nowrap" }}>E. Inicial (As Found)</th>
                        <th style={{ minWidth: 120, padding: "10px 8px", whiteSpace: "nowrap" }}>E. Final (Ec) *</th>
                        <th style={{ minWidth: 110, padding: "10px 8px", whiteSpace: "nowrap" }}>Incert. U *</th>
                        <th style={{ minWidth: 90, padding: "10px 8px", whiteSpace: "nowrap" }}>Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row, idx) => (
                        <tr key={idx} style={{ background: row.selected ? "#f0fdf4" : "#fff" }}>
                          <td style={{ textAlign: "center", verticalAlign: "middle", padding: "6px 8px" }}>
                            <input
                              type="checkbox"
                              style={{ width: 16, height: 16, cursor: "pointer" }}
                              checked={row.selected}
                              onChange={(e) => {
                                const v = e.target.checked;
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, selected: v } : r))
                                );
                              }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <input
                              type="text"
                              value={row.identification}
                              onChange={(e) => {
                                const v = e.target.value;
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, identification: v } : r))
                                );
                              }}
                              style={{ width: "100%", minWidth: 110, padding: "7px 10px", fontSize: "0.88rem", fontWeight: 700, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <input
                              type="text"
                              value={row.manufacturer}
                              onChange={(e) => {
                                const v = e.target.value;
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, manufacturer: v } : r))
                                );
                              }}
                              style={{ width: "100%", minWidth: 130, padding: "7px 10px", fontSize: "0.88rem", borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <input
                              type="text"
                              value={row.serialNumber}
                              onChange={(e) => {
                                const v = e.target.value;
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, serialNumber: v } : r))
                                );
                              }}
                              style={{ width: "100%", minWidth: 100, padding: "7px 10px", fontSize: "0.88rem", borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <input
                              type="text"
                              value={row.accuracyClass}
                              onChange={(e) => {
                                const v = e.target.value;
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, accuracyClass: v } : r))
                                );
                              }}
                              style={{ width: "100%", minWidth: 65, padding: "7px 8px", fontSize: "0.88rem", borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box", textAlign: "center" }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <input
                              type="number"
                              step="any"
                              value={row.nominalValue}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value) || 0;
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, nominalValue: v } : r))
                                );
                              }}
                              style={{ width: "100%", minWidth: 100, padding: "7px 10px", fontSize: "0.88rem", fontWeight: 700, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <input
                              type="number"
                              step="any"
                              value={row.errorAsFound ?? ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, errorAsFound: v } : r))
                                );
                              }}
                              placeholder="—"
                              style={{ width: "100%", minWidth: 100, padding: "7px 10px", fontSize: "0.88rem", borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <input
                              type="number"
                              step="any"
                              value={row.conventionalMassCorrection ?? ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, conventionalMassCorrection: v } : r))
                                );
                              }}
                              style={{ width: "100%", minWidth: 100, padding: "7px 10px", fontSize: "0.88rem", fontWeight: 700, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <input
                              type="number"
                              step="any"
                              value={row.uncertainty ?? ""}
                              onChange={(e) => {
                                const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, uncertainty: v } : r))
                                );
                              }}
                              style={{ width: "100%", minWidth: 95, padding: "7px 10px", fontSize: "0.88rem", borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </td>
                          <td style={{ padding: "6px 6px" }}>
                            <select
                              value={row.unitEc}
                              onChange={(e) => {
                                const v = e.target.value;
                                setImportRows((prev) =>
                                  prev.map((r, i) => (i === idx ? { ...r, unitEc: v } : r))
                                );
                              }}
                              style={{ width: "100%", minWidth: 80, padding: "7px 10px", fontSize: "0.88rem", fontWeight: 600, borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", boxSizing: "border-box" }}
                            >
                              <option value="g">g (gramos)</option>
                              <option value="kg">kg (kilos)</option>
                              <option value="mg">mg (mg)</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Import Action Bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setImportStep(1);
                      setImportResult(null);
                    }}
                    className="btn ghost"
                  >
                    ← Cargar otro PDF
                  </button>

                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span className="muted" style={{ fontSize: "0.9rem" }}>
                      {importRows.filter((r) => r.selected).length} de {importRows.length} seleccionadas
                    </span>
                    <button
                      type="button"
                      disabled={importing}
                      onClick={handleConfirmImport}
                      className="btn"
                      style={{ background: "#16a34a", color: "#fff", fontWeight: 800, padding: "10px 24px" }}
                    >
                      {importing ? "Importando al Sistema..." : "☁️ Importar Seleccionadas al Inventario"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          PANTALLA PRINCIPAL: LISTADO & CONTROL
      ═══════════════════════════════════════════ */}
      {currentScreen === "list" && (
        <div>
          {/* Top Bar Actions & Stats */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
            <div>
              <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
                Metrología Legal & Calibración
              </span>
              <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800, color: "#0f172a" }}>
                ⚖️ Gestión de Pesas Patrón
              </h1>
              <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                <strong>{weights.length}</strong> patrón/es cargado/s con trazabilidad metrológica
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                to="/metrologia/patrones/imprimir"
                target="_blank"
                className="btn"
                style={{ background: "#fff", border: "1px solid #ea580c", color: "#ea580c", fontWeight: 700 }}
              >
                📄 Exportar PDF (PG14-R4)
              </Link>
              <button
                type="button"
                onClick={() => {
                  setImportStep(1);
                  setImportResult(null);
                  setCurrentScreen("import");
                }}
                className="btn"
                style={{ background: "#fff", border: "1px solid #16a34a", color: "#16a34a", fontWeight: 700 }}
              >
                📥 Importar desde Certificado PDF
              </button>
              <Link
                to="/metrologia/patrones/nuevo"
                className="btn"
                style={{ background: "#0d9488", color: "#fff", fontWeight: 800 }}
              >
                ➕ Cargar Nuevo Patrón
              </Link>
              <button
                type="button"
                onClick={handleClearAll}
                className="btn ghost"
                style={{ color: "#dc2626", border: "1px solid #fecaca" }}
                title="Vaciar todo el inventario de pesas"
              >
                🗑️ Vaciar Inventario
              </button>
            </div>
          </div>

          {/* Bulk Action Panel (Gestión de Lotes) */}
          {selectedIds.length > 0 && (
            <div
              style={{
                background: "#eff6ff",
                border: "1px solid #93c5fd",
                borderRadius: 10,
                padding: "14px 20px",
                marginBottom: 20,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 14
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ background: "#3b82f6", color: "#fff", width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
                  🏷️
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Gestión de Lotes
                  </h4>
                  <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                    <strong style={{ color: "#2563eb" }}>{selectedIds.length}</strong> patrón/es seleccionado/s.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={bulkLotInput}
                  onChange={(e) => setBulkLotInput(e.target.value)}
                  placeholder="Nombre del lote (ej. Camión 1, Lote Dolz)"
                  style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.88rem", width: 260 }}
                />
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => handleApplyBulkLot(false)}
                  className="btn"
                  style={{ background: "#2563eb", color: "#fff", fontWeight: 700, padding: "7px 16px" }}
                >
                  🏷️ Asignar Lote
                </button>
                <button
                  type="button"
                  disabled={bulkLoading}
                  onClick={() => handleApplyBulkLot(true)}
                  className="btn ghost"
                  style={{ color: "#dc2626", border: "1px solid #fca5a5", padding: "7px 16px" }}
                >
                  Quitar Lote
                </button>
              </div>
            </div>
          )}

          {/* Filters Bar */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="🔍 Buscar por código, serie, certificado o marca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadWeights()}
              style={{ flex: 1, minWidth: 260, padding: "8px 14px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
            />
            {uniqueLots.length > 0 && (
              <select
                value={lotFilter}
                onChange={(e) => setLotFilter(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
              >
                <option value="">Todos los Lotes</option>
                {uniqueLots.map((l) => (
                  <option key={l} value={l}>Lote: {l}</option>
                ))}
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.88rem" }}
            >
              <option value="">Todos los Estados</option>
              <option value="Valid">Vigente</option>
              <option value="Expired">Vencido</option>
            </select>
            <button type="button" onClick={loadWeights} className="btn ghost compact">
              Filtrar
            </button>
          </div>

          {/* High Density Table */}
          <div className="card pad">
            {loading ? (
              <div style={{ padding: 40, textAlign: "center" }} className="muted">
                Cargando inventario de pesas patrón...
              </div>
            ) : weights.length === 0 ? (
              <div style={{ padding: 36, textAlign: "center" }} className="muted">
                No hay pesas patrón registradas. Arrastrá tu certificado PDF o hacé click en <strong>➕ Cargar Nuevo Patrón</strong>.
              </div>
            ) : (
              <div className="table-wrap">
                <table style={{ width: "100%", fontSize: "0.88rem" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ width: 40, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={weights.length > 0 && selectedIds.length === weights.length}
                          onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        />
                      </th>
                      <th>Identificación</th>
                      <th>Marca / N° Serie</th>
                      <th>Masa Nominal</th>
                      <th>E. Inicial</th>
                      <th>E. Final</th>
                      <th>U (incert.)</th>
                      <th>N° Certificado</th>
                      <th>Cal. / Vto.</th>
                      <th>Estado</th>
                      <th style={{ textAlign: "right" }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weights.map((w) => {
                      const isExpired = isWeightExpired(w.expirationDate);
                      const isSelected = selectedIds.includes(w.id);
                      const ec = w.conventionalMassCorrection;
                      const eaf = w.errorAsFound;
                      const unit = w.unitEc || "g";
                      const realMass = calculateRealMass(w.nominalValue, ec, unit);

                      return (
                        <tr key={w.id} style={{ background: isSelected ? "#f0fdf4" : undefined }}>
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRow(w.id)}
                            />
                          </td>
                          <td>
                            <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>{w.code}</strong>
                            {w.lotName && (
                              <div style={{ marginTop: 2 }}>
                                <span className="tag" style={{ fontSize: "0.72rem", background: "#f1f5f9", color: "#475569" }}>
                                  🏷️ {w.lotName}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            <div>{w.manufacturer || "—"}</div>
                            {w.serialNumber && (
                              <div className="muted" style={{ fontSize: "0.76rem" }}>
                                S/N: {w.serialNumber}
                              </div>
                            )}
                          </td>
                          <td>
                            <strong style={{ fontSize: "0.95rem" }}>
                              {w.nominalValue.toLocaleString("es-AR", { maximumFractionDigits: 3 })} {w.unit}
                            </strong>
                            {ec !== null && ec !== undefined && ec !== 0 && (
                              <div className="muted" style={{ fontSize: "0.74rem" }}>
                                Masa real: {realMass.toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 6 })} {w.unit}
                              </div>
                            )}
                          </td>
                          <td>
                            {eaf !== null && eaf !== undefined ? (
                              <span className="muted">{formatError(eaf, unit)}</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            {ec !== null && ec !== undefined ? (
                              <span style={{ fontWeight: 700, color: ec >= 0 ? "#16a34a" : "#dc2626" }}>
                                {formatError(ec, unit)}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            {w.uncertainty !== null && w.uncertainty !== undefined ? (
                              <div>
                                <span>±{w.uncertainty.toLocaleString("es-AR", { maximumFractionDigits: 4 })} {unit}</span>
                                <div className="muted" style={{ fontSize: "0.74rem" }}>
                                  k={w.factorK || 2.0} / 95%
                                </div>
                              </div>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 600 }}>
                              {w.certificateNumber || "—"}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.82rem" }}>
                            <div>{w.calibrationDate ? new Date(w.calibrationDate).toLocaleDateString("es-AR") : "—"}</div>
                            <div style={{ color: isExpired ? "#dc2626" : "#64748b", fontWeight: isExpired ? 700 : 400 }}>
                              Vto: {w.expirationDate ? new Date(w.expirationDate).toLocaleDateString("es-AR") : "—"}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${isExpired ? "prio-high" : "ok"}`}>
                              {isExpired ? "Vencido" : "Vigente"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              onClick={() => handleOpenHistory(w.code)}
                              className="btn-icon"
                              title="Historial de Calibraciones & Deriva Metrológica"
                              style={{ color: "#0d9488", marginRight: 4 }}
                            >
                              🕒
                            </button>
                            <Link
                              to={`/metrologia/patrones/${w.id}`}
                              className="btn-icon"
                              title="Editar Patrón"
                              style={{ color: "#3b82f6", marginRight: 4 }}
                            >
                              ✏️
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDeleteWeight(w.id, w.code)}
                              className="btn-icon"
                              title="Eliminar"
                              style={{ color: "#dc2626" }}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
