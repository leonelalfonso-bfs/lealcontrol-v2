import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { StandardWeight, CompanySettings } from "../../api/types";

export function StandardWeightsPrintPage() {
  const [weights, setWeights] = useState<StandardWeight[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.listStandardWeights(),
      api.getCompanySettings().catch(() => null)
    ])
      .then(([wList, comp]) => {
        setWeights(wList);
        if (comp) setCompany(comp);
      })
      .catch((err) => console.error("Error cargando datos para impresión:", err))
      .finally(() => setLoading(false));
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        Cargando registro ISO 17025 (PG14-R4)...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px", background: "#fff", color: "#111", minHeight: "100vh" }}>
      {/* No-print Action bar */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #ddd" }}>
        <Link to="/metrologia/patrones" className="btn ghost compact">
          ← Volver a Pesas Patrón
        </Link>
        <button type="button" onClick={handlePrint} className="btn" style={{ background: "#0d9488", color: "#fff" }}>
          🖨️ Imprimir / Guardar como PDF
        </button>
      </div>

      {/* ISO 17025 Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #0d9488", paddingBottom: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt={company.legalName} style={{ maxHeight: 50, maxWidth: 160, objectFit: "contain" }} />
          ) : (
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0d9488" }}>
              {company?.legalName || "LEAL CONTROL ERP"}
            </div>
          )}
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>{company?.legalName || "LEAL CONTROL ERP S.A."}</div>
            <div style={{ fontSize: "0.78rem", color: "#555" }}>
              {company?.documentNumber ? `CUIT: ${company.documentNumber} • ` : ""}
              {company?.fiscalStreet || "Parque Industrial"}
            </div>
            <div style={{ fontSize: "0.78rem", color: "#555" }}>
              Laboratorio de Ensayos & Metrología Legal
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right", fontSize: "0.82rem", color: "#444" }}>
          <div style={{ fontWeight: 800, color: "#0d9488", fontSize: "0.95rem" }}>REGISTRO: Listado de Equipos</div>
          <div>Vinculado a: <strong>PG-14 - Equipamiento (Patrones de Masa)</strong></div>
          <div><strong>Código:</strong> PG14-R4 | <strong>Versión:</strong> 1.0</div>
          <div><strong>Fecha de Emisión:</strong> {new Date().toLocaleDateString("es-AR")}</div>
        </div>
      </div>

      {/* Summary Box */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 14px", marginBottom: 16, fontSize: "0.84rem", display: "flex", justifyContent: "space-between" }}>
        <div><strong>Total de Patrones de Masa:</strong> {weights.length} unidades</div>
        <div><strong>Trazabilidad:</strong> Laboratorios de Calibración Acreditados</div>
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", marginBottom: 25 }}>
        <thead>
          <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
            <th style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #cbd5e1" }}>Identificación</th>
            <th style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #cbd5e1" }}>Marca / Fabricante</th>
            <th style={{ padding: "6px 8px", textAlign: "left", border: "1px solid #cbd5e1" }}>N° Serie</th>
            <th style={{ padding: "6px 8px", textAlign: "right", border: "1px solid #cbd5e1" }}>Masa Nominal</th>
            <th style={{ padding: "6px 8px", textAlign: "right", border: "1px solid #cbd5e1" }}>Error Conv. (Ec)</th>
            <th style={{ padding: "6px 8px", textAlign: "right", border: "1px solid #cbd5e1" }}>Incertidumbre U</th>
            <th style={{ padding: "6px 8px", textAlign: "center", border: "1px solid #cbd5e1" }}>N° Certificado</th>
            <th style={{ padding: "6px 8px", textAlign: "center", border: "1px solid #cbd5e1" }}>Fecha Cal.</th>
            <th style={{ padding: "6px 8px", textAlign: "center", border: "1px solid #cbd5e1" }}>Fecha Vto.</th>
            <th style={{ padding: "6px 8px", textAlign: "center", border: "1px solid #cbd5e1" }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {weights.map((w) => {
            const isExpired = w.expirationDate && new Date(w.expirationDate).getTime() < Date.now();
            const unit = w.unitEc || "g";
            const ec = w.conventionalMassCorrection;
            const ecFormatted = ec !== null && ec !== undefined
              ? `${ec >= 0 ? "+" : ""}${ec.toLocaleString("es-AR", { maximumFractionDigits: 4 })} ${unit}`
              : "—";

            return (
              <tr key={w.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "5px 8px", border: "1px solid #cbd5e1" }}>
                  <strong>{w.code}</strong>
                  {w.lotName && <div style={{ fontSize: "0.7rem", color: "#666" }}>Lote: {w.lotName}</div>}
                </td>
                <td style={{ padding: "5px 8px", border: "1px solid #cbd5e1" }}>{w.manufacturer || "—"}</td>
                <td style={{ padding: "5px 8px", border: "1px solid #cbd5e1" }}>{w.serialNumber || "—"}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", border: "1px solid #cbd5e1", fontWeight: 700 }}>
                  {w.nominalValue} {w.unit}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "right", border: "1px solid #cbd5e1" }}>
                  {ecFormatted}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "right", border: "1px solid #cbd5e1" }}>
                  {w.uncertainty !== null && w.uncertainty !== undefined
                    ? `±${w.uncertainty.toLocaleString("es-AR", { maximumFractionDigits: 4 })} ${unit}`
                    : "—"}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", border: "1px solid #cbd5e1", fontFamily: "monospace" }}>
                  {w.certificateNumber || "—"}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", border: "1px solid #cbd5e1" }}>
                  {w.calibrationDate ? new Date(w.calibrationDate).toLocaleDateString("es-AR") : "—"}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", border: "1px solid #cbd5e1", color: isExpired ? "#dc2626" : "inherit" }}>
                  {w.expirationDate ? new Date(w.expirationDate).toLocaleDateString("es-AR") : "—"}
                </td>
                <td style={{ padding: "5px 8px", textAlign: "center", border: "1px solid #cbd5e1" }}>
                  {isExpired ? "Vencido" : "Vigente"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer & Signatures */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 40, pageBreakInside: "avoid" }}>
        <div style={{ fontSize: "0.75rem", color: "#666", maxWidth: 450 }}>
          Este registro forma parte del Sistema de Gestión de la Calidad bajo norma IRAM 301 / ISO/IEC 17025 del Laboratorio de Ensayos.
        </div>
        <div style={{ textAlign: "center", borderTop: "1px solid #333", paddingTop: 6, minWidth: 220 }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>Responsable Técnico / Calidad</div>
          <div style={{ fontSize: "0.74rem", color: "#666" }}>Laboratorio de Ensayos Metrológicos</div>
        </div>
      </div>
    </div>
  );
}
