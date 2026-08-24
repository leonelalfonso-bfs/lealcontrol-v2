import React, { useState, useEffect, FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";

export function StandardWeightFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [code, setCode] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [nominalValue, setNominalValue] = useState("20");
  const [unit, setUnit] = useState("kg");
  const [accuracyClass, setAccuracyClass] = useState("M1");
  const [material, setMaterial] = useState("Hierro Fundido");
  const [conventionalMassCorrection, setConventionalMassCorrection] = useState("0");
  const [uncertainty, setUncertainty] = useState("0.02");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [traceabilityLab, setTraceabilityLab] = useState("Laboratorio Acreditado");
  const [calibrationDate, setCalibrationDate] = useState(new Date().toISOString().split("T")[0]);
  const [expirationDate, setExpirationDate] = useState(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
  const [status, setStatus] = useState("Valid");

  useEffect(() => {
    if (isEditing && id) {
      setLoading(true);
      api.listStandardWeights()
        .then((list) => {
          const w = list.find((item) => item.id === id);
          if (w) {
            setCode(w.code || "");
            setSerialNumber(w.serialNumber || "");
            setNominalValue(String(w.nominalValue));
            setUnit(w.unit || "kg");
            setAccuracyClass(w.accuracyClass || "M1");
            setMaterial(w.material || "Hierro Fundido");
            setConventionalMassCorrection(String(w.conventionalMassCorrection ?? 0));
            setUncertainty(String(w.uncertainty ?? 0.02));
            setCertificateNumber(w.certificateNumber || "");
            setTraceabilityLab(w.traceabilityLab || "Laboratorio Acreditado");
            setCalibrationDate(w.calibrationDate ? w.calibrationDate.slice(0, 10) : "");
            setExpirationDate(w.expirationDate ? w.expirationDate.slice(0, 10) : "");
            setStatus(w.status || "Valid");
          }
        })
        .catch((err) => {
          console.error("Error al cargar pesa:", err);
          setError("No se pudo cargar la información de la pesa patrón.");
        })
        .finally(() => setLoading(false));
    }
  }, [id, isEditing]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError("El código identificador de la pesa es obligatorio.");
      return;
    }
    const numVal = parseFloat(nominalValue);
    if (isNaN(numVal) || numVal <= 0) {
      setError("El valor nominal debe ser un número positivo.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        code: code.trim(),
        serialNumber: serialNumber.trim(),
        nominalValue: numVal,
        unit,
        accuracyClass,
        material,
        conventionalMassCorrection: parseFloat(conventionalMassCorrection) || 0,
        uncertainty: parseFloat(uncertainty) || 0,
        certificateNumber: certificateNumber.trim(),
        traceabilityLab: traceabilityLab.trim(),
        calibrationDate: calibrationDate ? new Date(calibrationDate).toISOString() : null,
        expirationDate: expirationDate ? new Date(expirationDate).toISOString() : null,
        status: status as any
      };

      if (isEditing && id) {
        await api.updateStandardWeight(id, payload);
      } else {
        await api.createStandardWeight(payload);
      }

      navigate("/metrologia/patrones");
    } catch (err: any) {
      console.error("Error al guardar pesa patrón:", err);
      setError(err?.message || "Error al registrar la pesa patrón.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wide" style={{ padding: 40, textAlign: "center" }}>
        <div className="muted">Cargando datos de la pesa patrón...</div>
      </div>
    );
  }

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      {/* Breadcrumb & Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", color: "#64748b", marginBottom: 6 }}>
          <Link to="/metrologia" style={{ color: "inherit", textDecoration: "none" }}>Metrología Legal</Link>
          <span>›</span>
          <Link to="/metrologia/patrones" style={{ color: "inherit", textDecoration: "none" }}>Gestión de Pesas Patrón</Link>
          <span>›</span>
          <span style={{ color: "#0d9488", fontWeight: 700 }}>{isEditing ? `Editar [${code}]` : "Alta de Pesa"}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: "1.75rem", fontWeight: 800, color: "#0f172a" }}>
              {isEditing ? `⚖️ Pesa Patrón: ${code}` : "➕ Registrar Pesa Patrón / Juego de Masas"}
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              Alta de masa patrón de referencia con trazabilidad metrológica de calibración.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/metrologia/patrones" className="btn ghost" style={{ padding: "8px 16px", fontWeight: 600 }}>
              ← Cancelar y Volver
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="btn"
              style={{ background: "#0d9488", color: "#fff", fontWeight: 800, padding: "8px 24px", fontSize: "0.92rem", minWidth: 160 }}
            >
              {saving ? "Guardando..." : "💾 Guardar Pesa Patrón"}
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
        {/* SECCIÓN 1: IDENTIFICACIÓN TÉCNICA */}
        <div className="card pad" style={{ marginBottom: 20, borderLeft: "5px solid #0d9488" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f766e", marginBottom: 14 }}>
            1. IDENTIFICACIÓN TÉCNICA DEL PATRÓN
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Código Interno / Identificador *</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ej. PAT-1000-01"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem", fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Número de Serie del Fabricante</label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="ej. SN-8849102"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Valor Nominal *</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  step="any"
                  required
                  value={nominalValue}
                  onChange={(e) => setNominalValue(e.target.value)}
                  placeholder="ej. 20"
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem", fontWeight: 700 }}
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  style={{ width: 85, padding: "9px 8px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="mg">mg</option>
                  <option value="t">t</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Clase de Exactitud (OIML R111) *</label>
              <select
                value={accuracyClass}
                onChange={(e) => setAccuracyClass(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="E1">Clase E1 (Patrón Primario)</option>
                <option value="E2">Clase E2 (Laboratorio de Alta Precisión)</option>
                <option value="F1">Clase F1 (Calibración Balanzas Analíticas)</option>
                <option value="F2">Clase F2 (Balanzas Industriales Clase II)</option>
                <option value="M1">Clase M1 (Básculas Camioneras / Clase III)</option>
                <option value="M2">Clase M2 (Pesas Comerciales)</option>
                <option value="M3">Clase M3 (Pesaje Pesado)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Material de Fabricación</label>
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              >
                <option value="Hierro Fundido">Hierro Fundido Pintado</option>
                <option value="Acero Inoxidable">Acero Inoxidable Pulido</option>
                <option value="Latón Cromado">Latón Cromado</option>
                <option value="Acero Forjado">Acero Forjado</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: TRAZABILIDAD & CERTIFICADO DE CALIBRACIÓN */}
        <div className="card pad" style={{ marginBottom: 30, borderLeft: "5px solid #3b82f6" }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#1d4ed8", marginBottom: 14 }}>
            2. CERTIFICADO DE CALIBRACIÓN & TRAZABILIDAD DEL PATRÓN
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Número de Certificado de Calibración</label>
              <input
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                placeholder="ej. CERT-MET-2024-8841"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem", fontWeight: 700 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Laboratorio Emisor / Calibrador</label>
              <input
                type="text"
                value={traceabilityLab}
                onChange={(e) => setTraceabilityLab(e.target.value)}
                placeholder="ej. Laboratorio de Metrología Acreditado"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Error / Corrección Masa Convencional ({unit})</label>
              <input
                type="number"
                step="any"
                value={conventionalMassCorrection}
                onChange={(e) => setConventionalMassCorrection(e.target.value)}
                placeholder="0.000"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Incertidumbre Expandida U (k=2) ({unit})</label>
              <input
                type="number"
                step="any"
                value={uncertainty}
                onChange={(e) => setUncertainty(e.target.value)}
                placeholder="0.02"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Fecha de Calibración</label>
              <input
                type="date"
                value={calibrationDate}
                onChange={(e) => setCalibrationDate(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, marginBottom: 5 }}>Fecha de Vencimiento Calibración</label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.92rem" }}
              />
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
          <Link to="/metrologia/patrones" className="btn ghost" style={{ padding: "9px 20px" }}>
            ← Cancelar y Volver
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn"
            style={{ background: "#0d9488", color: "#fff", fontWeight: 800, padding: "10px 28px", fontSize: "0.95rem", minWidth: 200 }}
          >
            {saving ? "Guardando..." : "💾 Guardar Pesa Patrón"}
          </button>
        </div>
      </form>
    </div>
  );
}
