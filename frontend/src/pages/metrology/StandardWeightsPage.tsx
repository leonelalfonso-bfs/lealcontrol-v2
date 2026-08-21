import { useEffect, useState, FormEvent } from "react";
import { api } from "../../api/client";
import type { StandardWeight } from "../../api/types";

export function StandardWeightsPage() {
  const [weights, setWeights] = useState<StandardWeight[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [code, setCode] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [nominalValue, setNominalValue] = useState("1000");
  const [unit, setUnit] = useState("kg");
  const [accuracyClass, setAccuracyClass] = useState("M1");
  const [material, setMaterial] = useState("Hierro Fundido");
  const [conventionalMassCorrection, setConventionalMassCorrection] = useState("0");
  const [uncertainty, setUncertainty] = useState("0.02");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [traceabilityLab, setTraceabilityLab] = useState("INTI - Metrología Legal");
  const [calibrationDate, setCalibrationDate] = useState(new Date().toISOString().split("T")[0]);
  const [expirationDate, setExpirationDate] = useState(new Date(Date.now() + 365*24*60*60*1000).toISOString().split("T")[0]);

  const loadWeights = () => {
    setLoading(true);
    api.listStandardWeights()
      .then(setWeights)
      .catch((err) => console.error("Error al cargar pesas patrón:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWeights();
  }, []);

  const handleOpenCreate = () => {
    setCode("");
    setSerialNumber("");
    setNominalValue("1000");
    setUnit("kg");
    setAccuracyClass("M1");
    setMaterial("Hierro Fundido");
    setConventionalMassCorrection("0");
    setUncertainty("0.02");
    setCertificateNumber("");
    setTraceabilityLab("INTI - Metrología Legal");
    setCalibrationDate(new Date().toISOString().split("T")[0]);
    setExpirationDate(new Date(Date.now() + 365*24*60*60*1000).toISOString().split("T")[0]);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError("El código de la pesa es obligatorio.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await api.createStandardWeight({
        code: code.trim(),
        serialNumber: serialNumber.trim(),
        nominalValue: parseFloat(nominalValue) || 0,
        unit,
        accuracyClass,
        material,
        conventionalMassCorrection: parseFloat(conventionalMassCorrection) || 0,
        uncertainty: parseFloat(uncertainty) || 0,
        certificateNumber: certificateNumber.trim(),
        traceabilityLab: traceabilityLab.trim(),
        calibrationDate: calibrationDate ? new Date(calibrationDate).toISOString() : undefined,
        expirationDate: expirationDate ? new Date(expirationDate).toISOString() : undefined
      });

      setShowModal(false);
      loadWeights();
    } catch (err: any) {
      setError(err?.message || "Error al registrar pesa patrón.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, codeName: string) => {
    if (!confirm(`¿Está seguro de eliminar la pesa patrón '${codeName}'?`)) return;
    try {
      await api.deleteStandardWeight(id);
      loadWeights();
    } catch (err: any) {
      alert(err?.message || "Error al eliminar pesa patrón.");
    }
  };

  return (
    <div className="page-wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Trazabilidad Metrológica Nacional
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            ⚖️ Padrón de Pesas Patrón & Masas
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Pesas de calibración con trazabilidad a patrones de referencia INTI y laboratorios acreditados SAC
          </p>
        </div>

        <button type="button" className="btn" onClick={handleOpenCreate} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
          ➕ Registrar Pesa Patrón
        </button>
      </div>

      <div className="card pad">
        {loading ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>Cargando padrón de pesas patrón...</div>
        ) : weights.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            No se encontraron pesas patrón registradas.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código / Identificador</th>
                  <th>Valor Nominal</th>
                  <th>Clase Exactitud</th>
                  <th>Material</th>
                  <th>Error Convencional</th>
                  <th>Incertidumbre (U)</th>
                  <th>Certificado INTI / SAC</th>
                  <th>Laboratorio Emisor</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {weights.map((w) => {
                  const isExpired = w.expirationDate && new Date(w.expirationDate) < new Date();
                  return (
                    <tr key={w.id}>
                      <td>
                        <strong style={{ color: "#0d9488" }}>{w.code}</strong>
                        {w.serialNumber && (
                          <div className="muted" style={{ fontSize: "0.74rem" }}>Nº Serie: {w.serialNumber}</div>
                        )}
                      </td>
                      <td>
                        <strong>{w.nominalValue.toLocaleString("es-AR")} {w.unit}</strong>
                      </td>
                      <td>
                        <span className="tag" style={{ fontWeight: 700 }}>Clase {w.accuracyClass}</span>
                      </td>
                      <td>{w.material}</td>
                      <td>
                        <span style={{ fontFamily: "monospace", fontSize: "0.84rem" }}>
                          {w.conventionalMassCorrection >= 0 ? `+${w.conventionalMassCorrection}` : w.conventionalMassCorrection} {w.unit}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: "monospace", fontSize: "0.84rem" }}>
                          ±{w.uncertainty} {w.unit}
                        </span>
                      </td>
                      <td>
                        <strong style={{ fontSize: "0.84rem" }}>{w.certificateNumber || "—"}</strong>
                      </td>
                      <td>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>{w.traceabilityLab}</div>
                      </td>
                      <td>
                        {w.expirationDate ? (
                          <span style={{ color: isExpired ? "#dc2626" : "inherit", fontWeight: isExpired ? 700 : 400 }}>
                            {new Date(w.expirationDate).toLocaleDateString("es-AR")}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <span className={`badge ${!isExpired && w.status === "Valid" ? "ok" : "prio-high"}`}>
                          {!isExpired && w.status === "Valid" ? "Vigente" : "Vencida"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="btn ghost compact" onClick={() => handleDelete(w.id, w.code)} style={{ color: "#dc2626" }} title="Eliminar">
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

      {/* Modal Alta */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 640 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem" }}>➕ Registrar Pesa Patrón / Juego de Masas</h2>
              <button type="button" className="alert-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {error && <div className="alert" style={{ marginBottom: 16 }}>{error}</div>}

            <form onSubmit={handleSave} style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  Código / Identificador *
                  <input type="text" required placeholder="ej. P-1000-01 o JGO-F1-01" value={code} onChange={(e) => setCode(e.target.value)} />
                </label>

                <label>
                  Número de Serie / Grabado
                  <input type="text" placeholder="ej. INTI-2024-001" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 12 }}>
                <label>
                  Valor Nominal *
                  <input type="number" step="0.0001" min="0.0001" required value={nominalValue} onChange={(e) => setNominalValue(e.target.value)} />
                </label>

                <label>
                  Unidad
                  <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                    <option value="kg">kg (Kilogramos)</option>
                    <option value="g">g (Gramos)</option>
                    <option value="mg">mg (Miligramos)</option>
                    <option value="t">t (Toneladas)</option>
                  </select>
                </label>

                <label>
                  Clase de Pesa (OIML R 111)
                  <select value={accuracyClass} onChange={(e) => setAccuracyClass(e.target.value)}>
                    <option value="E2">Clase E2</option>
                    <option value="F1">Clase F1</option>
                    <option value="F2">Clase F2</option>
                    <option value="M1">Clase M1 (Estándar)</option>
                    <option value="M2">Clase M2</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 12 }}>
                <label>
                  Material
                  <select value={material} onChange={(e) => setMaterial(e.target.value)}>
                    <option value="Hierro Fundido">Hierro Fundido</option>
                    <option value="Acero Inoxidable">Acero Inoxidable</option>
                    <option value="Latón Cromado">Latón Cromado</option>
                    <option value="Aluminio">Aluminio</option>
                  </select>
                </label>

                <label>
                  Corrección Masa Convencional
                  <input type="number" step="0.000001" value={conventionalMassCorrection} onChange={(e) => setConventionalMassCorrection(e.target.value)} />
                </label>

                <label>
                  Incertidumbre U (k=2)
                  <input type="number" step="0.000001" min="0" value={uncertainty} onChange={(e) => setUncertainty(e.target.value)} />
                </label>
              </div>

              {/* Trazabilidad INTI */}
              <div style={{ background: "rgba(13, 148, 136, 0.05)", padding: 14, borderRadius: 12, border: "1px solid rgba(13, 148, 136, 0.2)" }}>
                <h4 style={{ margin: "0 0 10px", color: "#0d9488", fontSize: "0.86rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  📜 Trazabilidad Metrológica Oficial
                </h4>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 10, marginBottom: 10 }}>
                  <label>
                    Nº de Certificado de Calibración
                    <input type="text" placeholder="ej. INTI-SAC-2024-9981" value={certificateNumber} onChange={(e) => setCertificateNumber(e.target.value)} />
                  </label>

                  <label>
                    Laboratorio Emisor
                    <input type="text" placeholder="ej. INTI Centro de Metrología" value={traceabilityLab} onChange={(e) => setTraceabilityLab(e.target.value)} />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label>
                    Fecha de Calibración
                    <input type="date" value={calibrationDate} onChange={(e) => setCalibrationDate(e.target.value)} />
                  </label>

                  <label>
                    Fecha de Vencimiento
                    <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
                  </label>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button type="button" className="btn ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn" disabled={saving} style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
                  {saving ? "Guardando..." : "💾 Guardar Pesa Patrón"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
