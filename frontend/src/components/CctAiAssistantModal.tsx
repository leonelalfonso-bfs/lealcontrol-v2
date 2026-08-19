import React, { useState } from "react";
import { automationApi, type CctAnalysisResult } from "../api/automationApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApplyScales?: (result: CctAnalysisResult) => void;
}

export function CctAiAssistantModal({ isOpen, onClose, onApplyScales }: Props) {
  const [cctNumber, setCctNumber] = useState("130/75");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CctAnalysisResult | null>(null);

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!cctNumber.trim()) {
      setError("Por favor ingrese un número o nombre de CCT.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await automationApi.analyzeCct(cctNumber, file ?? undefined);
      setResult(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Error al analizar el convenio con Gemini IA.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result && onApplyScales) {
      onApplyScales(result);
      onClose();
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.65)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "20px"
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: "12px",
        width: "100%",
        maxWidth: "800px",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
          color: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.2rem" }}>🤖</span>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                Asistente de Convenios & Escalas Salariales (Gemini IA)
              </h2>
            </div>
            <div style={{ fontSize: "0.78rem", opacity: 0.9, marginTop: "2px" }}>
              Analiza acuerdos, homologaciones y escalas vigentes para importar a RRHH
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#ffffff",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: "1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontSize: "0.85rem" }}>
              ⚠️ {error}
            </div>
          )}

          {/* Form Section */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Convenio Colectivo de Trabajo (CCT):
              </label>
              <input
                type="text"
                value={cctNumber}
                onChange={(e) => setCctNumber(e.target.value)}
                placeholder="Ej: 130/75, 260/75 UOM, 40/89 Camioneros"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem" }}
              />
              <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
                Podés escribir el número o gremio (ej: Empleados de Comercio, Metalúrgicos).
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                Acta Homologada / Escala PDF (Opcional):
              </label>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ width: "100%", padding: "6px", fontSize: "0.8rem", background: "#ffffff", border: "1px dashed #cbd5e1", borderRadius: "6px" }}
              />
              <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px" }}>
                Si tenés el PDF del sindicato, adjuntalo para una precisión milimétrica.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
            <button
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                background: loading ? "#94a3b8" : "#0d9488",
                color: "#ffffff",
                border: "none",
                padding: "9px 20px",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(13, 148, 136, 0.25)",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              {loading ? "⚡ Analizando con Gemini..." : "✨ Analizar e Investigar con IA"}
            </button>
          </div>

          {/* Results Display */}
          {result && (
            <div style={{ border: "1.5px solid #0d9488", borderRadius: "8px", overflow: "hidden", background: "#ffffff" }}>
              <div style={{ background: "#f0fdfa", padding: "12px 16px", borderBottom: "1px solid #ccfbf1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, color: "#0f766e", fontSize: "1rem", fontWeight: 800 }}>
                    {result.unionName || "Sindicato"} • CCT {result.cctNumber}
                  </h3>
                  <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>
                    Período / Vigencia: <strong>{result.effectivePeriod}</strong> | Incremento: <strong>{result.percentageIncrease}%</strong>
                  </div>
                </div>
                <span style={{ background: "#10b981", color: "white", padding: "3px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 700 }}>
                  ✓ Propuesta Lista
                </span>
              </div>

              {result.summary && (
                <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "0.8rem", color: "#334155" }}>
                  <strong>Resumen del Acuerdo:</strong> {result.summary}
                </div>
              )}

              {/* Categories Table */}
              <div style={{ padding: "12px 16px" }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "#0f172a" }}>
                  Escalas y Categorías Salariales Detectadas:
                </h4>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", textAlign: "left", color: "#475569" }}>
                      <th style={{ padding: "6px 8px" }}>Categoría</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Básico Mensual ($)</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>No Remunerativo ($)</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Valor Hora ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.salaryScales?.map((scale, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700, color: "#1e293b" }}>{scale.category}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>
                          $ {scale.basicSalary?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: "#0284c7" }}>
                          {scale.nonRemunerativeAmount > 0 ? `$ ${scale.nonRemunerativeAmount?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: "#64748b" }}>
                          {scale.hourlyRate > 0 ? `$ ${scale.hourlyRate?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onClose}
            style={{ background: "#ffffff", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
          >
            Cerrar
          </button>

          {result && (
            <button
              onClick={handleApply}
              style={{ background: "#059669", color: "#ffffff", border: "none", padding: "8px 20px", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)" }}
            >
              ✅ Aprobar e Importar al Sistema
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
