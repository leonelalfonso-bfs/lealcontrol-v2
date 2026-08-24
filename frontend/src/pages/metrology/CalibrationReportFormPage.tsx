import { useEffect, useState, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyEquipment, StandardWeight, MetrologyTestPoint, EccentricityConfig } from "../../api/types";

export function CalibrationReportFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedEquipmentId = searchParams.get("equipmentId");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available Data
  const [equipments, setEquipments] = useState<MetrologyEquipment[]>([]);
  const [weights, setWeights] = useState<StandardWeight[]>([]);

  // Selected Equipment & Test Configuration
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>(preselectedEquipmentId || "");
  const [selectedEquipment, setSelectedEquipment] = useState<MetrologyEquipment | null>(null);
  
  // Rules and Test Matrix
  const [linearityPoints, setLinearityPoints] = useState<MetrologyTestPoint[]>([]);
  const [eccentricityConfig, setEccentricityConfig] = useState<EccentricityConfig | null>(null);
  const [repeatabilityEmt, setRepeatabilityEmt] = useState<number>(20);

  // General Report Info
  const [reportNumber, setReportNumber] = useState("");
  const [regulatoryProfile, setRegulatoryProfile] = useState("REGIMEN_TRANSITORIO_R2307_80");
  const [operationType, setOperationType] = useState("Calibration");
  const [documentTitle, setDocumentTitle] = useState("Informe de ensayo metrológico");
  const [calibrationDate, setCalibrationDate] = useState(new Date().toISOString().split("T")[0]);
  const [nextCalibrationDate, setNextCalibrationDate] = useState("");
  const [performedBy, setPerformedBy] = useState("Metrólogo Autorizado");
  const [ambientTemperature, setAmbientTemperature] = useState("20.0");
  const [ambientHumidity, setAmbientHumidity] = useState("50.0");
  const [atmosphericPressure, setAtmosphericPressure] = useState("1013.0");
  const [observations, setObservations] = useState("");
  const operationLabels: Record<string, string> = { Calibration: "Calibración / determinación de errores", PostRepair: "Ensayo posterior a reparación", PeriodicVerification: "Verificación periódica", InitialVerification: "Verificación primitiva" };
  const is2307 = regulatoryProfile === "REGIMEN_TRANSITORIO_R2307_80";
  const testPlanItems = ["Identificación e inscripciones del instrumento", "Inspección general, instalación y estado del indicador", "Puesta a cero y tara, cuando el dispositivo esté disponible", is2307 ? "Ensayo de fidelidad" : "Ensayo de repetibilidad", "Ensayo de excentricidad", "Errores de indicación: cargas crecientes y decrecientes", "Precintos, intervención y cierre del informe"];
  if (operationType === "PostRepair") testPlanItems.splice(2, 0, "Descripción de la intervención posterior a reparación");
  if (operationType === "PeriodicVerification" || operationType === "InitialVerification") testPlanItems.push("Control de habilitación aplicable a la operación");

  // Selected Standard Weights (IDs)
  const [selectedWeightIds, setSelectedWeightIds] = useState<string[]>([]);

  // Assay 1: Visual Inspection
  const [inspLevel, setInspLevel] = useState(true);
  const [inspZero, setInspZero] = useState(true);
  const [inspTare, setInspTare] = useState(true);
  const [inspSeals, setInspSeals] = useState(true);
  const [inspNotes, setInspNotes] = useState("Instrumento en correctas condiciones mecánicas y estructurales.");

  // Assay 2: Repeatability (Half Max and Full Max)
  const [repLoad50, setRepLoad50] = useState<string>("40000");
  const [rep50_1, setRep50_1] = useState<string>("40000");
  const [rep50_2, setRep50_2] = useState<string>("40000");
  const [rep50_3, setRep50_3] = useState<string>("40000");

  const [repLoad100, setRepLoad100] = useState<string>("80000");
  const [rep100_1, setRep100_1] = useState<string>("80000");
  const [rep100_2, setRep100_2] = useState<string>("80000");
  const [rep100_3, setRep100_3] = useState<string>("80000");

  // Assay 3: Eccentricity (Positions)
  const [eccTestLoad, setEccTestLoad] = useState<string>("16000");
  const [eccPositions, setEccPositions] = useState<Array<{ pos: number; label: string; indication: string }>>([
    { pos: 1, label: "Apoyo 1 (Celda 1)", indication: "16000" },
    { pos: 2, label: "Apoyo 2 (Celda 2)", indication: "16000" },
    { pos: 3, label: "Apoyo 3 (Celda 3)", indication: "16000" },
    { pos: 4, label: "Apoyo 4 (Celda 4)", indication: "16000" },
    { pos: 5, label: "Apoyo 5 (Celda 5)", indication: "16000" },
    { pos: 6, label: "Apoyo 6 (Celda 6)", indication: "16000" }
  ]);

  // Assay 4: Linearity (Points)
  const [linRows, setLinRows] = useState<Array<{ step: number; targetLoad: number; emt: number; ascIndication: string; descIndication: string }>>([]);

  // Load initial lists
  useEffect(() => {
    Promise.all([
      api.listMetrologyEquipment({ status: "Active" }),
      api.listStandardWeights()
    ])
      .then(([eqs, wts]) => {
        setEquipments(eqs || []);
        setWeights(wts || []);
        if (wts && Array.isArray(wts)) {
          setSelectedWeightIds(wts.filter(w => w.status === "Valid").map(w => w.id));
        }

        const targetId = preselectedEquipmentId || (eqs && eqs.length > 0 ? eqs[0].id : "");
        if (targetId && eqs) {
          handleSelectEquipment(targetId, eqs);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectEquipment = async (eqId: string, availableEqs?: MetrologyEquipment[]) => {
    setSelectedEquipmentId(eqId);
    const list = availableEqs || equipments;
    const eq = list.find((e) => e.id === eqId);
    if (!eq) return;

    setSelectedEquipment(eq);

    // Initial Repeatability loads
    const half = (eq.maxCapacity || 80000) * 0.5;
    setRepLoad50(half.toString());
    setRep50_1(half.toString());
    setRep50_2(half.toString());
    setRep50_3(half.toString());

    setRepLoad100((eq.maxCapacity || 80000).toString());
    setRep100_1((eq.maxCapacity || 80000).toString());
    setRep100_2((eq.maxCapacity || 80000).toString());
    setRep100_3((eq.maxCapacity || 80000).toString());

    const std = eq.applicableStandard === "Res2307_80" ? "Res2307_80" : "Res25_2025";
    if (std === "Res2307_80") {
      setRegulatoryProfile("REGIMEN_TRANSITORIO_R2307_80");
      setDocumentTitle("Informe de ensayo metrológico");
      setNextCalibrationDate("");
    } else {
      setRegulatoryProfile("IPNA_R25_2025");
      setDocumentTitle("Informe de ensayo metrológico");
      setNextCalibrationDate(new Date(Date.now() + 730*24*60*60*1000).toISOString().split("T")[0]);
    }

    // Generate Rules via backend engine
    try {
      const rules: any = await api.calculateMetrologyRules({
        maxCapacity: eq.maxCapacity,
        minCapacity: eq.minCapacity,
        divisionD: eq.divisionD,
        verificationIntervalE: eq.verificationIntervalE,
        accuracyClass: eq.accuracyClass || "III",
        loadCellsCount: eq.loadCellsCount || 6,
        normative: std,
        standardApplied: std,
        platformType: eq.platformType || "TruckScale",
        isInService: true
      });

      const lPoints = (rules?.linearityPoints && rules.linearityPoints.length > 0)
        ? rules.linearityPoints
        : (rules?.recommendedLinearityPoints?.map((p: any, idx: number) => ({
            step: idx + 1,
            targetLoad: p.nominalLoad || p.targetLoad,
            emt: p.toleranceEmt || p.emt || eq.verificationIntervalE || 20,
            minAllowed: (p.nominalLoad || p.targetLoad) - (p.toleranceEmt || p.emt || 20),
            maxAllowed: (p.nominalLoad || p.targetLoad) + (p.toleranceEmt || p.emt || 20)
          })) || [
            { step: 1, targetLoad: eq.minCapacity || 400, emt: eq.verificationIntervalE || 20 },
            { step: 2, targetLoad: (eq.maxCapacity || 80000) * 0.5, emt: (eq.verificationIntervalE || 20) * 2 },
            { step: 3, targetLoad: eq.maxCapacity || 80000, emt: (eq.verificationIntervalE || 20) * 3 }
          ]);

      const eccConfig: EccentricityConfig = rules?.eccentricityConfig || {
        testLoad: (eq.maxCapacity || 80000) / 3,
        positionsCount: eq.loadCellsCount || 6,
        emt: eq.verificationIntervalE || 20,
        description: "Carga de ensayo sobre apoyos"
      };

      const repEmt = rules?.repeatabilityConfig?.emt || eq.verificationIntervalE || 20;

      setLinearityPoints(lPoints);
      setEccentricityConfig(eccConfig);
      setRepeatabilityEmt(repEmt);

      // Setup Eccentricity positions
      const loadVal = eccConfig.testLoad || Math.round((eq.maxCapacity || 80000) / 3);
      setEccTestLoad(loadVal.toString());
      const posArr = [];
      const count = eccConfig.positionsCount || eq.loadCellsCount || 6;
      for (let i = 1; i <= count; i++) {
        posArr.push({
          pos: i,
          label: count > 4 ? `Apoyo ${i} (Celda ${i})` : `Esquina ${i}`,
          indication: loadVal.toString()
        });
      }
      setEccPositions(posArr);

      // Setup Linearity rows
      const lRows = lPoints.map((p: any) => ({
        step: p.step,
        targetLoad: p.targetLoad,
        emt: p.emt,
        ascIndication: p.targetLoad.toString(),
        descIndication: p.targetLoad.toString()
      }));
      setLinRows(lRows);
    } catch (err) {
      console.error("Error al calcular reglas metrológicas:", err);
    }
  };

  // Calculations in real-time
  const rep50Vals = [parseFloat(rep50_1) || 0, parseFloat(rep50_2) || 0, parseFloat(rep50_3) || 0];
  const rep50Range = Math.max(...rep50Vals) - Math.min(...rep50Vals);
  const rep50Ok = rep50Range <= repeatabilityEmt;

  const rep100Vals = [parseFloat(rep100_1) || 0, parseFloat(rep100_2) || 0, parseFloat(rep100_3) || 0];
  const rep100Range = Math.max(...rep100Vals) - Math.min(...rep100Vals);
  const rep100Ok = rep100Range <= repeatabilityEmt;

  // Eccentricity Max Error
  const eccLoadNum = parseFloat(eccTestLoad) || 0;
  const eccErrors = eccPositions.map(p => Math.abs((parseFloat(p.indication) || 0) - eccLoadNum));
  const eccMaxError = Math.max(0, ...eccErrors);
  const eccOk = eccentricityConfig ? eccMaxError <= (eccentricityConfig.emt || 20) : true;

  // Linearity Evaluation
  const linErrors = linRows.map(r => {
    const ascErr = Math.abs((parseFloat(r.ascIndication) || 0) - r.targetLoad);
    const descErr = Math.abs((parseFloat(r.descIndication) || 0) - r.targetLoad);
    return {
      step: r.step,
      ascErr,
      descErr,
      ascOk: ascErr <= r.emt,
      descOk: descErr <= r.emt
    };
  });
  const linAllOk = linErrors.every(e => e.ascOk && e.descOk);

  // Overall Result
  const allAssaysPass = inspLevel && inspZero && inspTare && inspSeals && rep50Ok && rep100Ok && eccOk && linAllOk;
  const finalResult = allAssaysPass ? "Apto" : "No Apto";

  // Estimated Uncertainty U (k=2)
  const dVal = selectedEquipment?.divisionD || 20;
  const expandedUncertainty = Math.round((dVal * 0.58 + eccMaxError * 0.3) * 100) / 100;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEquipment) {
      setError("Debe seleccionar un instrumento a calibrar.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const repeatabilityData = {
        halfMax: { load: parseFloat(repLoad50), repetitions: rep50Vals, range: rep50Range, emt: repeatabilityEmt, conform: rep50Ok },
        fullMax: { load: parseFloat(repLoad100), repetitions: rep100Vals, range: rep100Range, emt: repeatabilityEmt, conform: rep100Ok }
      };

      const eccentricityData = {
        testLoad: eccLoadNum,
        emt: eccentricityConfig?.emt || 20,
        positions: eccPositions.map(p => ({
          pos: p.pos,
          label: p.label,
          indication: parseFloat(p.indication) || 0,
          error: (parseFloat(p.indication) || 0) - eccLoadNum
        })),
        maxError: eccMaxError,
        conform: eccOk
      };

      const linearityData = linRows.map(r => ({
        step: r.step,
        targetLoad: r.targetLoad,
        emt: r.emt,
        ascIndication: parseFloat(r.ascIndication) || 0,
        ascError: (parseFloat(r.ascIndication) || 0) - r.targetLoad,
        descIndication: parseFloat(r.descIndication) || 0,
        descError: (parseFloat(r.descIndication) || 0) - r.targetLoad,
        conform: Math.abs((parseFloat(r.ascIndication) || 0) - r.targetLoad) <= r.emt && Math.abs((parseFloat(r.descIndication) || 0) - r.targetLoad) <= r.emt
      }));

      const weightsUsed = weights.filter(w => selectedWeightIds.includes(w.id)).map(w => ({
        id: w.id,
        code: w.code,
        nominalValue: w.nominalValue,
        unit: w.unit,
        accuracyClass: w.accuracyClass,
        certificateNumber: w.certificateNumber
      }));

      const created = await api.saveCalibrationReport({
        certificateNumber: reportNumber.trim() || undefined,
        equipmentId: selectedEquipment.id,
        standardApplied: regulatoryProfile === "REGIMEN_TRANSITORIO_R2307_80" ? "Res2307_80" : "Res25_2025",
        calibrationType: operationType,
        regulatoryProfile,
        operationType,
        documentTitle,
        testPlanVersion: regulatoryProfile === "REGIMEN_TRANSITORIO_R2307_80" ? "MET-2307-1" : "MET-25-1",
        reportStatus: "Issued",
        calibrationDate: new Date(calibrationDate).toISOString(),
        expirationDate: nextCalibrationDate ? new Date(nextCalibrationDate).toISOString() : undefined,
        performedBy: performedBy.trim(),
        temperatureCelsius: parseFloat(ambientTemperature) || 20,
        relativeHumidityPercent: parseFloat(ambientHumidity) || 50,
        atmosphericPressureHpa: parseFloat(atmosphericPressure) || 1013,
        approvedBy: "",
        verdict: finalResult === "Apto" ? "Approved" : "Rejected",
        maxObservedError: Math.max(eccMaxError, ...linErrors.flatMap(x => [x.ascErr, x.descErr])),
        maxAllowedError: Math.max(repeatabilityEmt, eccentricityConfig?.emt || 0, ...linRows.map(x => x.emt)),
        expandedUncertaintyK2: expandedUncertainty,
        visualInspectionJson: JSON.stringify({ level: inspLevel, zero: inspZero, tare: inspTare, seals: inspSeals, notes: inspNotes.trim(), checklist: { profile: regulatoryProfile, operationType, operationLabel: operationLabels[operationType], testPlanVersion: is2307 ? "MET-2307-1" : "MET-25-1", items: testPlanItems.map((title) => ({ title, registered: true })) } }),
        repeatabilityTestJson: JSON.stringify(repeatabilityData),
        eccentricityTestJson: JSON.stringify(eccentricityData),
        linearityTestJson: JSON.stringify(linearityData),
        weightsUsedJson: JSON.stringify(weightsUsed),
        observations: observations.trim(),
        sealsPlaced: inspSeals ? "Verificados durante la inspección" : "Requiere observación"
      });

      navigate(`/metrologia/informes/${created.id}/imprimir`);
    } catch (err: any) {
      setError(err?.message || "Error al emitir informe de calibración.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="page-wide muted" style={{ padding: 30, textAlign: "center" }}>Inicializando asistente metrológico...</div>;
  }

  return (
    <div className="page-wide">
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Protocolo de Calibración & Ensayos en Campo
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            📝 Asistente de Carga de Ensayo Metrológico
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Perfil reglamentario guiado, datos de ensayo y trazabilidad de patrones. El dictamen legal requiere la habilitación aplicable.
          </p>
        </div>
      </div>

      {error && <div className="alert" style={{ marginBottom: 20 }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
        {/* Cabecera: Instrumento y Datos Generales */}
        <div className="card pad" style={{ borderLeft: "4px solid #0d9488" }}>
          <h3 style={{ margin: "0 0 14px", fontSize: "1.1rem", color: "#0d9488" }}>
            1. Selección de Instrumento & Datos del Servicio
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <label>
              Instrumento / Balanza a Calibrar *
              <select
                required
                value={selectedEquipmentId}
                onChange={(e) => handleSelectEquipment(e.target.value)}
              >
                <option value="">Seleccione una balanza...</option>
                {equipments.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.code} - {eq.description} ({eq.customerName || "Sin cliente"})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Perfil reglamentario
              <select value={regulatoryProfile} disabled>
                <option value="REGIMEN_TRANSITORIO_R2307_80">Régimen transitorio — Res. 2307/1980</option>
                <option value="IPNA_R25_2025">Res. 25/2025 — instrumentos no automáticos</option>
              </select>
            </label>

            <label>
              Operación metrológica
              <select value={operationType} onChange={(e) => { setOperationType(e.target.value); setDocumentTitle("Informe de ensayo metrológico"); }}>
                <option value="Calibration">Calibración / determinación de errores</option>
                <option value="PostRepair">Ensayo posterior a reparación</option>
                <option value="PeriodicVerification">Verificación periódica</option>
                <option value="InitialVerification">Verificación primitiva</option>
              </select>
            </label>

            <label>
              Documento a emitir
              <input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} />
            </label>
          </div>

          {regulatoryProfile === "REGIMEN_TRANSITORIO_R2307_80" && (
            <div className="alert" style={{ marginBottom: 14 }}>
              <strong>Régimen transitorio.</strong> La Res. 2307/80 está derogada. Usar este perfil sólo cuando el equipo y la operación estén comprendidos en la transición aplicable; el sistema registrará esa condición en el informe.
            </div>
          )}

          <div style={{ background: "rgba(13, 148, 136, 0.06)", border: "1px solid rgba(13, 148, 136, 0.2)", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <strong style={{ fontSize: "0.86rem" }}>Matriz de ensayo {is2307 ? "2307/80 — régimen transitorio" : "25/2025"}</strong>
            <div className="muted" style={{ fontSize: "0.78rem", marginTop: 3 }}>Operación: {operationLabels[operationType]}. Esta matriz quedará guardada con el informe.</div>
            <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: "0.78rem", display: "grid", gap: 3 }}>{testPlanItems.map((item) => <li key={item}>{item}</li>)}</ol>
          </div>

          {selectedEquipment && (
            <div style={{ background: "rgba(13, 148, 136, 0.06)", padding: 12, borderRadius: 10, marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, fontSize: "0.84rem" }}>
              <div><strong>Cliente:</strong> {selectedEquipment.customerName || "—"}</div>
              <div><strong>Ubicación:</strong> {selectedEquipment.location || "—"}</div>
              <div><strong>Capacidad Max:</strong> {selectedEquipment.maxCapacity} {selectedEquipment.unit}</div>
              <div><strong>Escalón (e):</strong> {selectedEquipment.verificationIntervalE} {selectedEquipment.unit}</div>
              <div><strong>Clase:</strong> Clase {selectedEquipment.accuracyClass}</div>
              <div><strong>Apoyos/Celdas:</strong> {selectedEquipment.loadCellsCount || 6}</div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
            <label>
              Fecha del Ensayo
              <input type="date" required value={calibrationDate} onChange={(e) => setCalibrationDate(e.target.value)} />
            </label>

            <label>
              Próxima intervención / vencimiento
              <input type="date" value={nextCalibrationDate} onChange={(e) => setNextCalibrationDate(e.target.value)} placeholder="Definir según operación" />
            </label>

            <label>
              Metrólogo / Técnico
              <input type="text" required value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} />
            </label>

            <label>
              Nº Certificado (Auto)
              <input type="text" placeholder="CAL-2026-XXXX (Automático)" value={reportNumber} onChange={(e) => setReportNumber(e.target.value)} />
            </label>
          </div>
        </div>

        {/* Condiciones Ambientales y Pesas Utilizadas */}
        <div className="card pad">
          <h3 style={{ margin: "0 0 14px", fontSize: "1.1rem", color: "var(--ink)" }}>
            2. Condiciones Ambientales & Patrones de Referencia Empleados
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
            <label>
              Temperatura Ambiente (ºC)
              <input type="number" step="0.1" value={ambientTemperature} onChange={(e) => setAmbientTemperature(e.target.value)} />
            </label>

            <label>
              Humedad Relativa (%)
              <input type="number" step="0.1" value={ambientHumidity} onChange={(e) => setAmbientHumidity(e.target.value)} />
            </label>

            <label>
              Presión Atmosférica (hPa)
              <input type="number" step="0.1" value={atmosphericPressure} onChange={(e) => setAtmosphericPressure(e.target.value)} />
            </label>
          </div>

          <div>
            <label style={{ marginBottom: 6 }}>Pesas Patrón Empleadas para el Ensayo:</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {weights.map((w) => {
                const checked = selectedWeightIds.includes(w.id);
                return (
                  <label
                    key={w.id}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      background: checked ? "rgba(13, 148, 136, 0.12)" : "rgba(0,0,0,0.04)",
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: checked ? "1px solid #0d9488" : "1px solid transparent",
                      cursor: "pointer",
                      fontSize: "0.82rem"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedWeightIds([...selectedWeightIds, w.id]);
                        else setSelectedWeightIds(selectedWeightIds.filter(id => id !== w.id));
                      }}
                    />
                    <span><strong>{w.code}</strong> ({w.nominalValue} {w.unit} - Cl. {w.accuracyClass} - {w.certificateNumber})</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Ensayo 1: Inspección Visual y Funcional */}
        <div className="card pad">
          <h3 style={{ margin: "0 0 14px", fontSize: "1.1rem", color: "var(--ink)" }}>
            3. Inspección Visual y Ensayos Funcionales Iniciales
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={inspLevel} onChange={(e) => setInspLevel(e.target.checked)} />
              <span>Nivelación & Estructura Conforme</span>
            </label>

            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={inspZero} onChange={(e) => setInspZero(e.target.checked)} />
              <span>Dispositivo de Puesta a Cero Operativo</span>
            </label>

            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={inspTare} onChange={(e) => setInspTare(e.target.checked)} />
              <span>Dispositivo de Tara Sustractiva Conforme</span>
            </label>

            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={inspSeals} onChange={(e) => setInspSeals(e.target.checked)} />
              <span>Precintos y Placa de Identificación Conforme</span>
            </label>
          </div>

          <label>
            Notas de Inspección
            <input type="text" value={inspNotes} onChange={(e) => setInspNotes(e.target.value)} />
          </label>
        </div>

        {/* Ensayo 2: Repetibilidad / Fidelidad */}
        <div className="card pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
              4. {is2307 ? "Ensayo de Fidelidad" : "Ensayo de Repetibilidad"}
            </h3>
            <span className="tag" style={{ background: "rgba(13, 148, 136, 0.1)", color: "#0d9488", fontWeight: 700 }}>
              EMT = ±{repeatabilityEmt} {selectedEquipment?.unit || "kg"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            {/* Carga al 50% */}
            <div style={{ background: "rgba(0,0,0,0.02)", padding: 14, borderRadius: 10, border: "1px solid var(--surface-border)" }}>
              <strong style={{ display: "block", marginBottom: 8 }}>Ensayo a Carga ~50% Max ({repLoad50} {selectedEquipment?.unit})</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
                <label>
                  Repetición 1
                  <input type="number" step="0.0001" value={rep50_1} onChange={(e) => setRep50_1(e.target.value)} />
                </label>
                <label>
                  Repetición 2
                  <input type="number" step="0.0001" value={rep50_2} onChange={(e) => setRep50_2(e.target.value)} />
                </label>
                <label>
                  Repetición 3
                  <input type="number" step="0.0001" value={rep50_3} onChange={(e) => setRep50_3(e.target.value)} />
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.84rem" }}>
                <span>Error de Rango: <strong>{rep50Range} {selectedEquipment?.unit}</strong></span>
                <span className={`badge ${rep50Ok ? "ok" : "prio-high"}`}>{rep50Ok ? "✓ Conforme" : "✗ Supera EMT"}</span>
              </div>
            </div>

            {/* Carga al 100% */}
            <div style={{ background: "rgba(0,0,0,0.02)", padding: 14, borderRadius: 10, border: "1px solid var(--surface-border)" }}>
              <strong style={{ display: "block", marginBottom: 8 }}>Ensayo a Carga ~100% Max ({repLoad100} {selectedEquipment?.unit})</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
                <label>
                  Repetición 1
                  <input type="number" step="0.0001" value={rep100_1} onChange={(e) => setRep100_1(e.target.value)} />
                </label>
                <label>
                  Repetición 2
                  <input type="number" step="0.0001" value={rep100_2} onChange={(e) => setRep100_2(e.target.value)} />
                </label>
                <label>
                  Repetición 3
                  <input type="number" step="0.0001" value={rep100_3} onChange={(e) => setRep100_3(e.target.value)} />
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.84rem" }}>
                <span>Error de Rango: <strong>{rep100Range} {selectedEquipment?.unit}</strong></span>
                <span className={`badge ${rep100Ok ? "ok" : "prio-high"}`}>{rep100Ok ? "✓ Conforme" : "✗ Supera EMT"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ensayo 3: Excentricidad de Carga */}
        <div className="card pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>5. Ensayo de Excentricidad de Carga</h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                Carga de ensayo: <strong>{eccTestLoad} {selectedEquipment?.unit}</strong> ({eccentricityConfig?.description})
              </p>
            </div>
            <span className="tag" style={{ background: "rgba(13, 148, 136, 0.1)", color: "#0d9488", fontWeight: 700 }}>
              EMT = ±{eccentricityConfig?.emt || 20} {selectedEquipment?.unit || "kg"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
            {eccPositions.map((p, idx) => {
              const err = Math.abs((parseFloat(p.indication) || 0) - eccLoadNum);
              const ok = eccentricityConfig ? err <= (eccentricityConfig.emt || 20) : true;
              return (
                <div key={p.pos} style={{ background: "rgba(0,0,0,0.02)", padding: 10, borderRadius: 8, border: "1px solid var(--surface-border)" }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                    {p.label}
                    <input
                      type="number"
                      step="0.0001"
                      value={p.indication}
                      onChange={(e) => {
                        const copy = [...eccPositions];
                        copy[idx].indication = e.target.value;
                        setEccPositions(copy);
                      }}
                    />
                  </label>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.76rem" }}>
                    <span className="muted">Error: {err} {selectedEquipment?.unit}</span>
                    <span style={{ color: ok ? "var(--ok)" : "#dc2626", fontWeight: 700 }}>{ok ? "✓" : "✗"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.86rem", background: "rgba(0,0,0,0.03)", padding: "8px 12px", borderRadius: 8 }}>
            <span>Error Máximo de Excentricidad: <strong>{eccMaxError} {selectedEquipment?.unit}</strong></span>
            <span className={`badge ${eccOk ? "ok" : "prio-high"}`}>{eccOk ? "✓ Excentricidad Conforme" : "✗ Supera Tolerancia EMT"}</span>
          </div>
        </div>

        {/* Ensayo 4: Exactitud / Linealidad */}
        <div className="card pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>6. Ensayo de Exactitud y Linealidad (Carga Creciente y Decreciente)</h3>
            <span className="tag" style={{ fontWeight: 700 }}>{linRows.length} Puntos de Ensayo</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Paso</th>
                  <th>Carga Nominal Patrón (L)</th>
                  <th>EMT Permitido</th>
                  <th>Indicación Creciente (↗)</th>
                  <th>Error Creciente</th>
                  <th>Indicación Decreciente (↘)</th>
                  <th>Error Decreciente</th>
                  <th>Evaluación</th>
                </tr>
              </thead>
              <tbody>
                {linRows.map((r, idx) => {
                  const ascVal = parseFloat(r.ascIndication) || 0;
                  const ascErr = ascVal - r.targetLoad;
                  const ascOk = Math.abs(ascErr) <= r.emt;

                  const descVal = parseFloat(r.descIndication) || 0;
                  const descErr = descVal - r.targetLoad;
                  const descOk = Math.abs(descErr) <= r.emt;

                  const rowOk = ascOk && descOk;

                  return (
                    <tr key={r.step}>
                      <td><strong>#{r.step}</strong></td>
                      <td><strong>{r.targetLoad.toLocaleString("es-AR")} {selectedEquipment?.unit}</strong></td>
                      <td><span className="tag">±{r.emt} {selectedEquipment?.unit}</span></td>
                      <td>
                        <input
                          type="number"
                          step="0.0001"
                          style={{ maxWidth: 140 }}
                          value={r.ascIndication}
                          onChange={(e) => {
                            const copy = [...linRows];
                            copy[idx].ascIndication = e.target.value;
                            setLinRows(copy);
                          }}
                        />
                      </td>
                      <td>
                        <span style={{ color: ascOk ? "inherit" : "#dc2626", fontWeight: ascOk ? 400 : 700 }}>
                          {ascErr >= 0 ? `+${ascErr}` : ascErr}
                        </span>
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.0001"
                          style={{ maxWidth: 140 }}
                          value={r.descIndication}
                          onChange={(e) => {
                            const copy = [...linRows];
                            copy[idx].descIndication = e.target.value;
                            setLinRows(copy);
                          }}
                        />
                      </td>
                      <td>
                        <span style={{ color: descOk ? "inherit" : "#dc2626", fontWeight: descOk ? 400 : 700 }}>
                          {descErr >= 0 ? `+${descErr}` : descErr}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${rowOk ? "ok" : "prio-high"}`}>
                          {rowOk ? "✓ Apto" : "✗ Fuera"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dictamen Final & Emisión */}
        <div className="card pad" style={{ borderLeft: allAssaysPass ? "4px solid var(--ok)" : "4px solid #dc2626" }}>
          <h3 style={{ margin: "0 0 14px", fontSize: "1.1rem" }}>7. Resultado técnico & emisión del informe</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
            <div style={{ background: "rgba(0,0,0,0.02)", padding: 14, borderRadius: 10 }}>
              <div className="muted" style={{ fontSize: "0.82rem", marginBottom: 4 }}>Incertidumbre Expandida Estimada (k=2):</div>
              <strong style={{ fontSize: "1.3rem", color: "#0d9488" }}>U = ±{expandedUncertainty} {selectedEquipment?.unit || "kg"}</strong>
              <div className="muted" style={{ fontSize: "0.76rem", marginTop: 4 }}>Valor informativo. La declaración de incertidumbre requiere el método y la trazabilidad documentados.</div>
            </div>

            <div style={{ background: allAssaysPass ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)", padding: 14, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="muted" style={{ fontSize: "0.82rem", marginBottom: 4 }}>Resultado técnico registrado:</div>
                <strong style={{ fontSize: "1.5rem", color: allAssaysPass ? "var(--ok)" : "#dc2626" }}>{finalResult}</strong>
              </div>
              <span style={{ fontSize: "2rem" }}>{allAssaysPass ? "🏆" : "⚠️"}</span>
            </div>
          </div>

          <label style={{ marginBottom: 16 }}>
            Observaciones & Recomendaciones Técnicas
            <textarea
              rows={2}
              placeholder="Observaciones técnicas, reparaciones, condiciones de instalación o acciones requeridas..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
            />
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button type="button" className="btn ghost" onClick={() => navigate("/metrologia")}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn"
              style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", padding: "12px 28px", fontSize: "1rem" }}
            >
              {saving ? "Emitiendo informe..." : "💾 Emitir e imprimir informe"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
