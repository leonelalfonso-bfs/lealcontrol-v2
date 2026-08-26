import { useEffect, useState, FormEvent, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyEquipment, StandardWeight, MetrologyTestPoint, EccentricityConfig } from "../../api/types";

export type FidelityTrial = {
  initialZero: string;
  indication: string;
  finalZero: string;
  deltaL: string;
};

const createDefaultTrials = (count: number, defaultLoad: string): FidelityTrial[] => {
  return Array.from({ length: 5 }, (_, i) => ({
    initialZero: "0",
    indication: i < count ? defaultLoad : "",
    finalZero: "0",
    deltaL: "0"
  }));
};

function getEmtForLoad(load: number, e: number, accuracyClass = "III"): number {
  if (!e || e <= 0) return 20;
  const n = load / e;
  if (accuracyClass === "II") {
    if (n <= 5000) return 1 * e;
    if (n <= 20000) return 2 * e;
    return 3 * e;
  }
  if (accuracyClass === "IIII" || accuracyClass === "4") {
    if (n <= 50) return 1 * e;
    if (n <= 200) return 2 * e;
    return 3 * e;
  }
  // Default Clase III
  if (n <= 500) return 1 * e;
  if (n <= 2000) return 2 * e;
  return 3 * e;
}

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

  const operationLabels: Record<string, string> = {
    Calibration: "Calibración / determinación de errores",
    PostRepair: "Ensayo posterior a reparación",
    PeriodicVerification: "Verificación periódica",
    InitialVerification: "Verificación primitiva"
  };

  const is2307 = regulatoryProfile === "REGIMEN_TRANSITORIO_R2307_80";
  const testPlanItems = [
    "Identificación e inscripciones del instrumento",
    "Inspección general, instalación y estado del indicador",
    "Puesta a cero y tara, cuando el dispositivo esté disponible",
    is2307 ? "Ensayo de fidelidad (baja y alta carga)" : "Ensayo de repetibilidad",
    "Ensayo de excentricidad",
    "Errores de indicación: cargas crecientes y decrecientes",
    "Precintos, intervención y cierre del informe"
  ];

  if (operationType === "PostRepair") testPlanItems.splice(2, 0, "Descripción de la intervención posterior a reparación");
  if (operationType === "PeriodicVerification" || operationType === "InitialVerification")
    testPlanItems.push("Control de habilitación aplicable a la operación");

  // Selected Standard Weights (IDs)
  const [selectedWeightIds, setSelectedWeightIds] = useState<string[]>([]);
  const [weightPickerOpen, setWeightPickerOpen] = useState(false);
  const [draftWeightIds, setDraftWeightIds] = useState<string[]>([]);
  const [weightLotFilter, setWeightLotFilter] = useState("");
  const [weightSearch, setWeightSearch] = useState("");

  // Assay 1: Visual Inspection
  const [inspLevel, setInspLevel] = useState(true);
  const [inspZero, setInspZero] = useState(true);
  const [inspTare, setInspTare] = useState(true);
  const [inspSeals, setInspSeals] = useState(true);
  const [inspNotes, setInspNotes] = useState("Instrumento en correctas condiciones mecánicas y estructurales.");

  // Assay 2: Fidelity / Repeatability with Dual Load (Baja Carga y Alta Carga)
  const [fidelityTab, setFidelityTab] = useState<"low" | "high" | "both">("both");

  // Baja Carga (Low Load) - initial proposal
  const [fidelityLowInbound, setFidelityLowInbound] = useState<FidelityTrial[]>(() => createDefaultTrials(3, "12500"));
  const [fidelityLowOutbound, setFidelityLowOutbound] = useState<FidelityTrial[]>(() => createDefaultTrials(3, "12500"));
  const [fidelityLowPlatform, setFidelityLowPlatform] = useState<FidelityTrial[]>(() => createDefaultTrials(5, "12500"));

  // Alta Carga (High Load) - initial proposal
  const [fidelityHighInbound, setFidelityHighInbound] = useState<FidelityTrial[]>(() => createDefaultTrials(3, "25000"));
  const [fidelityHighOutbound, setFidelityHighOutbound] = useState<FidelityTrial[]>(() => createDefaultTrials(3, "25000"));
  const [fidelityHighPlatform, setFidelityHighPlatform] = useState<FidelityTrial[]>(() => createDefaultTrials(5, "25000"));

  // Assay 3: Eccentricity (Positions)
  const [eccTestLoad, setEccTestLoad] = useState<string>("16000");
  const [eccPositions, setEccPositions] = useState<Array<{ pos: number; label: string; indication: string; deltaL: string }>>([
    { pos: 1, label: "Apoyo 1 (Celda 1)", indication: "16000", deltaL: "10" },
    { pos: 2, label: "Apoyo 2 (Celda 2)", indication: "16000", deltaL: "10" },
    { pos: 3, label: "Apoyo 3 (Celda 3)", indication: "16000", deltaL: "10" },
    { pos: 4, label: "Apoyo 4 (Celda 4)", indication: "16000", deltaL: "10" },
    { pos: 5, label: "Apoyo 5 (Celda 5)", indication: "16000", deltaL: "10" },
    { pos: 6, label: "Apoyo 6 (Celda 6)", indication: "16000", deltaL: "10" }
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

    const maxCap = eq.maxCapacity || 80000;
    const isTruck = String(eq.platformType) === "TruckScale" || String(eq.platformType) === "RollingLoad";

    // Propose default values for trials
    const lowVal = isTruck && maxCap === 80000 ? 12500 : Math.round(maxCap * 0.3) || Math.round(maxCap * 0.5);
    const highVal = isTruck && maxCap === 80000 ? 25000 : (Number(eq.maximumOperationalLoad) || maxCap);

    setFidelityLowInbound(createDefaultTrials(3, lowVal.toString()));
    setFidelityLowOutbound(createDefaultTrials(3, lowVal.toString()));
    setFidelityLowPlatform(createDefaultTrials(5, lowVal.toString()));

    setFidelityHighInbound(createDefaultTrials(3, highVal.toString()));
    setFidelityHighOutbound(createDefaultTrials(3, highVal.toString()));
    setFidelityHighPlatform(createDefaultTrials(5, highVal.toString()));

    const std = eq.applicableStandard === "Res2307_80" ? "Res2307_80" : "Res25_2025";
    if (std === "Res2307_80") {
      setRegulatoryProfile("REGIMEN_TRANSITORIO_R2307_80");
      setDocumentTitle("Informe de ensayo metrológico");
      setNextCalibrationDate("");
    } else {
      setRegulatoryProfile("IPNA_R25_2025");
      setDocumentTitle("Informe de ensayo metrológico");
      setNextCalibrationDate(new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
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

      const lPoints =
        rules?.linearityPoints && rules.linearityPoints.length > 0
          ? rules.linearityPoints
          : rules?.recommendedLinearityPoints?.map((p: any, idx: number) => ({
              step: idx + 1,
              targetLoad: p.nominalLoad || p.targetLoad,
              emt: p.toleranceEmt || p.emt || eq.verificationIntervalE || 20,
              minAllowed: (p.nominalLoad || p.targetLoad) - (p.toleranceEmt || p.emt || 20),
              maxAllowed: (p.nominalLoad || p.targetLoad) + (p.toleranceEmt || p.emt || 20)
            })) || [
              { step: 1, targetLoad: eq.minCapacity || 400, emt: eq.verificationIntervalE || 20 },
              { step: 2, targetLoad: (eq.maxCapacity || 80000) * 0.5, emt: (eq.verificationIntervalE || 20) * 2 },
              { step: 3, targetLoad: eq.maxCapacity || 80000, emt: (eq.verificationIntervalE || 20) * 3 }
            ];

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
          indication: loadVal.toString(),
          deltaL: ((eq.verificationIntervalE || 20) / 2).toString()
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

  const eInterval = Number(selectedEquipment?.verificationIntervalE || 20);
  const beforeRounding = (indication: string, deltaL: string) =>
    (parseFloat(indication) || 0) + eInterval / 2 - (parseFloat(deltaL) || 0);

  const fidelityPlatformType = String(selectedEquipment?.platformType ?? "");
  const truckFidelity = fidelityPlatformType === "TruckScale" || fidelityPlatformType === "RollingLoad";

  // Helper to compute stats for a block of trials where the reference load is the 1st reading (Pass #1)
  const computeFidelityBlock = (trials: FidelityTrial[]) => {
    // Calculate raw corrected readings
    const preComputed = trials.map((t, idx) => {
      const rawInd = parseFloat(t.indication);
      const hasValue = !isNaN(rawInd) && t.indication.trim() !== "";
      const dL = parseFloat(t.deltaL) || 0;
      const corrected = hasValue ? (dL > 0 ? rawInd + eInterval / 2 - dL : rawInd) : null;

      return {
        index: idx + 1,
        initialZero: t.initialZero,
        indication: t.indication,
        finalZero: t.finalZero,
        deltaL: t.deltaL,
        hasValue,
        corrected
      };
    });

    // Reference load is the corrected reading of the 1st active trial (#1)
    const firstActive = preComputed.find((r) => r.hasValue && r.corrected !== null);
    const refLoad = firstActive ? (firstActive.corrected as number) : 0;
    const targetEmt = refLoad > 0 ? getEmtForLoad(refLoad, eInterval, selectedEquipment?.accuracyClass || "III") : 20;

    // Evaluate error against reference load #1 (repeatability evaluates consistency against first reading)
    const computedRows = preComputed.map((r) => {
      if (!r.hasValue || r.corrected === null) {
        return {
          ...r,
          error: null,
          emt: null,
          ok: null
        };
      }
      const error = r.corrected - refLoad;
      const ok = Math.abs(error) <= targetEmt;
      return {
        ...r,
        error,
        emt: targetEmt,
        ok
      };
    });

    const activeRows = computedRows.filter((r) => r.hasValue && r.corrected !== null);
    const count = activeRows.length;
    const correctedValues = activeRows.map((r) => r.corrected as number);

    let stdDev = 0;
    let maxDiff = 0;
    let maxVal = 0;
    let minVal = 0;

    if (count > 0) {
      maxVal = Math.max(...correctedValues);
      minVal = Math.min(...correctedValues);
      maxDiff = maxVal - minVal;

      if (count > 1) {
        const mean = correctedValues.reduce((a, b) => a + b, 0) / count;
        const variance = correctedValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (count - 1);
        stdDev = Math.sqrt(variance);
      }
    }

    const minRequired = truckFidelity ? 3 : 5;
    const conform = count >= minRequired && maxDiff <= targetEmt && activeRows.every((r) => r.ok);

    return {
      refLoad,
      targetEmt,
      computedRows,
      activeCount: count,
      stdDev,
      maxDiff,
      maxVal,
      minVal,
      conform
    };
  };

  const lowInboundBlock = useMemo(
    () => computeFidelityBlock(fidelityLowInbound),
    [fidelityLowInbound, eInterval, truckFidelity, selectedEquipment?.accuracyClass]
  );
  const lowOutboundBlock = useMemo(
    () => computeFidelityBlock(fidelityLowOutbound),
    [fidelityLowOutbound, eInterval, truckFidelity, selectedEquipment?.accuracyClass]
  );
  const lowPlatformBlock = useMemo(
    () => computeFidelityBlock(fidelityLowPlatform),
    [fidelityLowPlatform, eInterval, truckFidelity, selectedEquipment?.accuracyClass]
  );

  const highInboundBlock = useMemo(
    () => computeFidelityBlock(fidelityHighInbound),
    [fidelityHighInbound, eInterval, truckFidelity, selectedEquipment?.accuracyClass]
  );
  const highOutboundBlock = useMemo(
    () => computeFidelityBlock(fidelityHighOutbound),
    [fidelityHighOutbound, eInterval, truckFidelity, selectedEquipment?.accuracyClass]
  );
  const highPlatformBlock = useMemo(
    () => computeFidelityBlock(fidelityHighPlatform),
    [fidelityHighPlatform, eInterval, truckFidelity, selectedEquipment?.accuracyClass]
  );

  const lowOk = truckFidelity ? lowInboundBlock.conform && lowOutboundBlock.conform : lowPlatformBlock.conform;
  const highOk = truckFidelity ? highInboundBlock.conform && highOutboundBlock.conform : highPlatformBlock.conform;
  const fidelityAllOk = lowOk && highOk;

  // Reference loads for low and high
  const lowAppliedLoad = truckFidelity ? lowInboundBlock.refLoad || lowOutboundBlock.refLoad : lowPlatformBlock.refLoad;
  const highAppliedLoad = truckFidelity ? highInboundBlock.refLoad || highOutboundBlock.refLoad : highPlatformBlock.refLoad;
  const lowEmt = truckFidelity ? lowInboundBlock.targetEmt : lowPlatformBlock.targetEmt;
  const highEmt = truckFidelity ? highInboundBlock.targetEmt : highPlatformBlock.targetEmt;

  // Eccentricity
  const eccLoadNum = parseFloat(eccTestLoad) || 0;
  const eccErrors = eccPositions.map((p) => Math.abs(beforeRounding(p.indication, p.deltaL) - eccLoadNum));
  const eccMaxError = Math.max(0, ...eccErrors);
  const eccOk = eccentricityConfig ? eccMaxError <= (eccentricityConfig.emt || 20) : true;

  // Linearity
  const linErrors = linRows.map((r) => {
    const ascErr = Math.abs((parseFloat(r.ascIndication) || 0) - r.targetLoad);
    const descErr = Math.abs((parseFloat(r.descIndication) || 0) - r.targetLoad);
    return { step: r.step, ascErr, descErr, ascOk: ascErr <= r.emt, descOk: descErr <= r.emt };
  });
  const linAllOk = linErrors.every((e) => e.ascOk && e.descOk);

  const allAssaysPass = inspLevel && inspZero && inspTare && inspSeals && fidelityAllOk && eccOk && linAllOk;
  const finalResult = allAssaysPass ? "Apto" : "No Apto";

  // Estimated Uncertainty U (k=2)
  const dVal = selectedEquipment?.divisionD || 20;
  const maxFidelityDiff = Math.max(
    lowInboundBlock.maxDiff,
    lowOutboundBlock.maxDiff,
    highInboundBlock.maxDiff,
    highOutboundBlock.maxDiff,
    lowPlatformBlock.maxDiff,
    highPlatformBlock.maxDiff
  );
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
        method: truckFidelity
          ? "Báscula de camiones / carga rodante: 3 pasadas de entrada y 3 pasadas de salida (iniciando y finalizando en cero) evaluadas en Baja Carga y Alta Carga respecto a la 1ra indicación."
          : "Balanza de plataforma / estacionaria: 5 repeticiones sucesivas evaluadas en Baja Carga y Alta Carga respecto a la 1ra indicación.",
        instrumentType: truckFidelity ? "Báscula de camiones / carga rodante" : "Balanza de plataforma / estacionaria",
        truckFidelity,
        hasDualLoad: true,
        lowLoad: {
          title: "Fidelidad en Baja Carga",
          appliedLoad: lowAppliedLoad,
          emt: lowEmt,
          conform: lowOk,
          inbound: lowInboundBlock,
          outbound: lowOutboundBlock,
          platform: lowPlatformBlock,
          maxDiff: truckFidelity ? Math.max(lowInboundBlock.maxDiff, lowOutboundBlock.maxDiff) : lowPlatformBlock.maxDiff
        },
        highLoad: {
          title: "Fidelidad en Alta Carga",
          appliedLoad: highAppliedLoad,
          emt: highEmt,
          conform: highOk,
          inbound: highInboundBlock,
          outbound: highOutboundBlock,
          platform: highPlatformBlock,
          maxDiff: truckFidelity ? Math.max(highInboundBlock.maxDiff, highOutboundBlock.maxDiff) : highPlatformBlock.maxDiff
        },
        // Backward compatibility
        appliedLoad: highAppliedLoad,
        minimum: truckFidelity ? Math.min(highInboundBlock.minVal, highOutboundBlock.minVal) : highPlatformBlock.minVal,
        maximum: truckFidelity ? Math.max(highInboundBlock.maxVal, highOutboundBlock.maxVal) : highPlatformBlock.maxVal,
        range: maxFidelityDiff,
        emt: highEmt,
        conform: fidelityAllOk,
        readings: truckFidelity
          ? [
              ...lowInboundBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Entrada (Baja)", indication: parseFloat(r.indication) || 0 })),
              ...lowOutboundBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Salida (Baja)", indication: parseFloat(r.indication) || 0 })),
              ...highInboundBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Entrada (Alta)", indication: parseFloat(r.indication) || 0 })),
              ...highOutboundBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Salida (Alta)", indication: parseFloat(r.indication) || 0 }))
            ]
          : [
              ...lowPlatformBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Baja Carga", indication: parseFloat(r.indication) || 0 })),
              ...highPlatformBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Alta Carga", indication: parseFloat(r.indication) || 0 }))
            ]
      };

      const eccentricityData = {
        calculatedTestLoad: eccentricityConfig?.calculatedTestLoad ?? eccLoadNum,
        suggestedTestLoad: eccentricityConfig?.suggestedTestLoad ?? eccLoadNum,
        testLoad: eccLoadNum,
        emt: eccentricityConfig?.emt || 20,
        method: "P = I + e/2 − ΔL",
        positions: eccPositions.map((p) => ({
          pos: p.pos,
          label: p.label,
          indication: parseFloat(p.indication) || 0,
          deltaL: parseFloat(p.deltaL) || 0,
          beforeRounding: beforeRounding(p.indication, p.deltaL),
          error: beforeRounding(p.indication, p.deltaL) - eccLoadNum
        })),
        maxError: eccMaxError,
        conform: eccOk
      };

      const linearityData = linRows.map((r) => ({
        step: r.step,
        targetLoad: r.targetLoad,
        emt: r.emt,
        ascIndication: parseFloat(r.ascIndication) || 0,
        ascError: (parseFloat(r.ascIndication) || 0) - r.targetLoad,
        descIndication: parseFloat(r.descIndication) || 0,
        descError: (parseFloat(r.descIndication) || 0) - r.targetLoad,
        conform:
          Math.abs((parseFloat(r.ascIndication) || 0) - r.targetLoad) <= r.emt &&
          Math.abs((parseFloat(r.descIndication) || 0) - r.targetLoad) <= r.emt
      }));

      const weightsUsed = weights
        .filter((w) => selectedWeightIds.includes(w.id))
        .map((w) => ({
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
        maxObservedError: Math.max(eccMaxError, maxFidelityDiff, ...linErrors.flatMap((x) => [x.ascErr, x.descErr])),
        maxAllowedError: Math.max(highEmt, eccentricityConfig?.emt || 0, ...linRows.map((x) => x.emt)),
        expandedUncertaintyK2: expandedUncertainty,
        visualInspectionJson: JSON.stringify({
          level: inspLevel,
          zero: inspZero,
          tare: inspTare,
          seals: inspSeals,
          notes: inspNotes.trim(),
          checklist: {
            profile: regulatoryProfile,
            operationType,
            operationLabel: operationLabels[operationType],
            testPlanVersion: is2307 ? "MET-2307-1" : "MET-25-1",
            items: testPlanItems.map((title) => ({ title, registered: true }))
          }
        }),
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

  // Render a trial table for a block (e.g. Inbound / Outbound / Platform)
  const renderTrialTable = (
    title: string,
    trials: FidelityTrial[],
    setter: React.Dispatch<React.SetStateAction<FidelityTrial[]>>,
    block: ReturnType<typeof computeFidelityBlock>
  ) => {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <strong style={{ fontSize: "0.92rem", color: "#0f172a" }}>{title}</strong>
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            Carga de Referencia (#1): <strong>{block.refLoad} {selectedEquipment?.unit}</strong> · EMT: <strong>±{block.targetEmt} {selectedEquipment?.unit}</strong>
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left", color: "#475569" }}>
                <th style={{ padding: "6px 8px", width: "80px" }}>N° Prueba</th>
                <th style={{ padding: "6px 8px", width: "110px", textAlign: "right" }}>Cero Inicial</th>
                <th style={{ padding: "6px 8px", width: "130px", textAlign: "right" }}>Indicación</th>
                <th style={{ padding: "6px 8px", width: "110px", textAlign: "right" }}>Cero Final</th>
                <th style={{ padding: "6px 8px", width: "140px", textAlign: "right" }}>Desviación Redondeo (ΔL)</th>
                <th style={{ padding: "6px 8px", width: "120px", textAlign: "right" }}>Lectura Corregida</th>
                <th style={{ padding: "6px 8px", width: "90px", textAlign: "right" }}>Error</th>
                <th style={{ padding: "6px 8px", width: "80px", textAlign: "center" }}>EMT</th>
                <th style={{ padding: "6px 8px", width: "100px", textAlign: "center" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {block.computedRows.map((r, idx) => {
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 700, color: "#334155" }}>#{r.index}</td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>
                      <input
                        type="number"
                        step="1"
                        value={trials[idx].initialZero}
                        onChange={(e) => {
                          const copy = [...trials];
                          copy[idx].initialZero = e.target.value;
                          setter(copy);
                        }}
                        style={{ width: "100%", maxWidth: "85px", textAlign: "right", padding: "4px 6px", borderRadius: 4, border: "1px solid var(--surface-border)" }}
                      />
                    </td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>
                      <input
                        type="number"
                        step="1"
                        value={trials[idx].indication}
                        placeholder="—"
                        onChange={(e) => {
                          const copy = [...trials];
                          copy[idx].indication = e.target.value;
                          setter(copy);
                        }}
                        style={{ width: "100%", maxWidth: "105px", textAlign: "right", fontWeight: 700, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--surface-border)", color: "#0f172a" }}
                      />
                    </td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>
                      <input
                        type="number"
                        step="1"
                        value={trials[idx].finalZero}
                        onChange={(e) => {
                          const copy = [...trials];
                          copy[idx].finalZero = e.target.value;
                          setter(copy);
                        }}
                        style={{ width: "100%", maxWidth: "85px", textAlign: "right", padding: "4px 6px", borderRadius: 4, border: "1px solid var(--surface-border)" }}
                      />
                    </td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>
                      <input
                        type="number"
                        step="1"
                        value={trials[idx].deltaL}
                        onChange={(e) => {
                          const copy = [...trials];
                          copy[idx].deltaL = e.target.value;
                          setter(copy);
                        }}
                        style={{ width: "100%", maxWidth: "90px", textAlign: "right", padding: "4px 6px", borderRadius: 4, border: "1px solid var(--surface-border)" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                      {r.corrected !== null ? r.corrected.toFixed(0) : "—"}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        textAlign: "right",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: r.error === null ? "inherit" : Math.abs(r.error) <= (block.targetEmt || 20) ? "#047857" : "#b91c1c"
                      }}
                    >
                      {r.error !== null ? (r.error >= 0 ? `+${r.error.toFixed(0)}` : r.error.toFixed(0)) : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "monospace" }}>
                      {r.hasValue ? `±${block.targetEmt}` : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      {r.hasValue ? (
                        r.ok ? (
                          <span
                            className="badge ok"
                            style={{
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "#065f46",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 10,
                              fontSize: "0.76rem"
                            }}
                          >
                            CUMPLE
                          </span>
                        ) : (
                          <span
                            className="badge prio-high"
                            style={{
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "#b91c1c",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 10,
                              fontSize: "0.76rem"
                            }}
                          >
                            NO CUMPLE
                          </span>
                        )
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Statistics */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
            padding: "8px 12px",
            background: "rgba(0,0,0,0.03)",
            borderRadius: 6,
            fontSize: "0.82rem",
            flexWrap: "wrap",
            gap: 10
          }}
        >
          <div>
            <strong>Desviación Estándar (s):</strong>{" "}
            <span style={{ color: "#0284c7", fontWeight: 700 }}>
              {block.stdDev.toFixed(2)} {selectedEquipment?.unit}
            </span>
          </div>
          <div>
            <strong>Diferencia Máxima:</strong>{" "}
            <span style={{ fontWeight: 700 }}>
              {block.maxDiff.toFixed(0)} {selectedEquipment?.unit}
            </span>{" "}
            <span className="muted">(EMT: ±{block.targetEmt})</span>
          </div>
          <div>
            <strong>Resultado {title.split("·")[0] || ""}:</strong>{" "}
            <span
              className={`badge ${block.conform ? "ok" : "prio-high"}`}
              style={{
                fontWeight: 700,
                fontSize: "0.8rem",
                padding: "3px 10px",
                borderRadius: 12,
                background: block.conform ? "rgba(16, 185, 129, 0.18)" : "rgba(239, 68, 68, 0.18)",
                color: block.conform ? "#065f46" : "#b91c1c"
              }}
            >
              {block.conform ? "CUMPLE" : "NO CUMPLE"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="page-wide pad muted">Cargando formulario metrológico...</div>;
  }

  return (
    <div className="page-wide" style={{ paddingBottom: 60 }}>
      <div className="page-head">
        <div>
          <button type="button" onClick={() => navigate(-1)} className="btn ghost" style={{ marginBottom: 6 }}>
            ← Cancelar / Volver
          </button>
          <h1>Nuevo Certificado de Calibración Metrológica</h1>
          <p className="muted">
            Protocolo de calibración oficial y ensayos normativos (OIML R 76-1 / Res. 2307/80)
          </p>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Instrument & General Info */}
        <div className="card pad">
          <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>1. Instrumento y Datos Generales</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 14 }}>
            <label>
              Instrumento a Calibrar *
              <select
                value={selectedEquipmentId}
                onChange={(e) => handleSelectEquipment(e.target.value)}
                required
              >
                <option value="">-- Seleccionar Instrumento --</option>
                {equipments.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.code} - {eq.brand} {eq.model} (Cap. {eq.maxCapacity} {eq.unit}) - {eq.customerName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              N° de Informe / Certificado
              <input
                type="text"
                placeholder="Ej. CERT-2026-001 (Auto si está vacío)"
                value={reportNumber}
                onChange={(e) => setReportNumber(e.target.value)}
              />
            </label>

            <label>
              Tipo de Operación
              <select value={operationType} onChange={(e) => setOperationType(e.target.value)}>
                {Object.entries(operationLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Fecha de Calibración
              <input
                type="date"
                value={calibrationDate}
                onChange={(e) => setCalibrationDate(e.target.value)}
                required
              />
            </label>

            <label>
              Metrólogo Responsable
              <input
                type="text"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                required
              />
            </label>
          </div>

          {selectedEquipment && (
            <div
              style={{
                background: "rgba(13, 148, 136, 0.06)",
                padding: 12,
                borderRadius: 10,
                marginBottom: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
                fontSize: "0.84rem"
              }}
            >
              <div><strong>Cliente:</strong> {selectedEquipment.customerName || "—"}</div>
              <div><strong>Ubicación:</strong> {selectedEquipment.location || "—"}</div>
              <div><strong>Capacidad Max:</strong> {selectedEquipment.maxCapacity} {selectedEquipment.unit}</div>
              <div><strong>Escalón (e):</strong> {selectedEquipment.verificationIntervalE} {selectedEquipment.unit}</div>
              <div><strong>Clase:</strong> Clase {selectedEquipment.accuracyClass}</div>
              <div><strong>Tipo Plataforma:</strong> {truckFidelity ? "🚛 Báscula Camiones / Rodante" : "⚖️ Balanza Plataforma / Estacionaria"}</div>
            </div>
          )}

          {/* Environmental Conditions */}
          <h4 style={{ margin: "14px 0 8px 0", fontSize: "0.95rem" }}>Condiciones Ambientales</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <label>
              Temperatura (°C)
              <input
                type="number"
                step="0.1"
                value={ambientTemperature}
                onChange={(e) => setAmbientTemperature(e.target.value)}
              />
            </label>
            <label>
              Humedad Relativa (%)
              <input
                type="number"
                step="0.1"
                value={ambientHumidity}
                onChange={(e) => setAmbientHumidity(e.target.value)}
              />
            </label>
            <label>
              Presión Atmosférica (hPa)
              <input
                type="number"
                step="0.1"
                value={atmosphericPressure}
                onChange={(e) => setAtmosphericPressure(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* Assay 1: Visual Inspection */}
        <div className="card pad">
          <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>3. Inspección Visual y Funcional</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={inspLevel} onChange={(e) => setInspLevel(e.target.checked)} />
              <span>Nivelación Conforme</span>
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={inspZero} onChange={(e) => setInspZero(e.target.checked)} />
              <span>Puesta a Cero Correcta</span>
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={inspTare} onChange={(e) => setInspTare(e.target.checked)} />
              <span>Dispositivo de Tara Conforme</span>
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={inspSeals} onChange={(e) => setInspSeals(e.target.checked)} />
              <span>Precintos y Placa Conformes</span>
            </label>
          </div>
          <label>
            Notas de Inspección
            <input type="text" value={inspNotes} onChange={(e) => setInspNotes(e.target.value)} />
          </label>
        </div>

        {/* Assay 2: Fidelidad / Repetibilidad (Baja Carga y Alta Carga) */}
        <div className="card pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem" }}>
                4. {is2307 ? "Ensayo de Fidelidad" : "Ensayo de Repetibilidad"}
              </h3>
              <p className="muted" style={{ margin: "2px 0 0 0", fontSize: "0.82rem" }}>
                {truckFidelity
                  ? "🚛 Báscula de Camiones: 3 pasadas en Sentido Entrada y 3 en Sentido Salida (iniciando y finalizando en cero). La carga de referencia es la primera indicación (#1)."
                  : "⚖️ Balanza de Plataforma / Mostrador: 5 repeticiones sucesivas con descarga a cero. La carga de referencia es la primera indicación (#1)."}
              </p>
            </div>

            {/* Tab switch */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className={`btn compact ${fidelityTab === "low" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setFidelityTab("low")}
                style={{ fontSize: "0.82rem" }}
              >
                🔹 Baja Carga ({lowAppliedLoad} {selectedEquipment?.unit}) {lowOk ? "✓" : "✗"}
              </button>
              <button
                type="button"
                className={`btn compact ${fidelityTab === "high" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setFidelityTab("high")}
                style={{ fontSize: "0.82rem" }}
              >
                🔸 Alta Carga ({highAppliedLoad} {selectedEquipment?.unit}) {highOk ? "✓" : "✗"}
              </button>
              <button
                type="button"
                className={`btn compact ${fidelityTab === "both" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setFidelityTab("both")}
                style={{ fontSize: "0.82rem" }}
              >
                👁️ Ver Ambas Cargas
              </button>
            </div>
          </div>

          {/* Section: Baja Carga */}
          {(fidelityTab === "low" || fidelityTab === "both") && (
            <div
              style={{
                background: "rgba(2, 132, 199, 0.03)",
                border: "1px solid rgba(2, 132, 199, 0.2)",
                borderRadius: 10,
                padding: 14,
                marginBottom: 16
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: "1rem", fontWeight: 800, color: "#0369a1" }}>
                    🔹 Fidelidad en Baja Carga
                  </span>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    (Carga de Referencia #1: <strong>{lowAppliedLoad} {selectedEquipment?.unit}</strong>)
                  </span>
                </div>
                <span className="tag" style={{ background: "rgba(2, 132, 199, 0.12)", color: "#0369a1", fontWeight: 700 }}>
                  EMT Permitido = ±{lowEmt} {selectedEquipment?.unit}
                </span>
              </div>

              {truckFidelity ? (
                <>
                  {renderTrialTable(
                    "→ Sentido Entrada (Carga) · 3 pasadas",
                    fidelityLowInbound,
                    setFidelityLowInbound,
                    lowInboundBlock
                  )}
                  {renderTrialTable(
                    "← Sentido Salida (Descarga) · 3 pasadas",
                    fidelityLowOutbound,
                    setFidelityLowOutbound,
                    lowOutboundBlock
                  )}
                </>
              ) : (
                renderTrialTable(
                  "5 Repeticiones de Ensayo",
                  fidelityLowPlatform,
                  setFidelityLowPlatform,
                  lowPlatformBlock
                )
              )}
            </div>
          )}

          {/* Section: Alta Carga */}
          {(fidelityTab === "high" || fidelityTab === "both") && (
            <div
              style={{
                background: "rgba(245, 158, 11, 0.03)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                borderRadius: 10,
                padding: 14
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: "1rem", fontWeight: 800, color: "#b45309" }}>
                    🔸 Fidelidad en Alta Carga
                  </span>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    (Carga de Referencia #1: <strong>{highAppliedLoad} {selectedEquipment?.unit}</strong>)
                  </span>
                </div>
                <span className="tag" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#b45309", fontWeight: 700 }}>
                  EMT Permitido = ±{highEmt} {selectedEquipment?.unit}
                </span>
              </div>

              {truckFidelity ? (
                <>
                  {renderTrialTable(
                    "→ Sentido Entrada (Carga) · 3 pasadas",
                    fidelityHighInbound,
                    setFidelityHighInbound,
                    highInboundBlock
                  )}
                  {renderTrialTable(
                    "← Sentido Salida (Descarga) · 3 pasadas",
                    fidelityHighOutbound,
                    setFidelityHighOutbound,
                    highOutboundBlock
                  )}
                </>
              ) : (
                renderTrialTable(
                  "5 Repeticiones de Ensayo",
                  fidelityHighPlatform,
                  setFidelityHighPlatform,
                  highPlatformBlock
                )
              )}
            </div>
          )}

          {/* Global Fidelity Badge */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 14,
              padding: "10px 14px",
              background: fidelityAllOk ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
              borderRadius: 8
            }}
          >
            <div>
              <strong>Estado General del Ensayo de Fidelidad:</strong>{" "}
              <span className="muted">
                (Baja Carga: {lowOk ? "✓ Cumple" : "✗ No cumple"} · Alta Carga: {highOk ? "✓ Cumple" : "✗ No cumple"})
              </span>
            </div>
            <span
              className={`badge ${fidelityAllOk ? "ok" : "prio-high"}`}
              style={{ fontWeight: 800, fontSize: "0.85rem", padding: "4px 12px", borderRadius: 12 }}
            >
              {fidelityAllOk ? "✓ FIDELIDAD CONFORME" : "✗ SUPERA EMT"}
            </span>
          </div>
        </div>

        {/* Assay 3: Excentricidad de Carga */}
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

          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.8fr) minmax(280px, 1.2fr)", gap: 14, marginBottom: 14, alignItems: "start" }}>
            <label>
              Carga aplicada por posición (editable)
              <input
                type="number"
                step="1"
                value={eccTestLoad}
                onChange={(e) => setEccTestLoad(e.target.value)}
              />
            </label>
            <div style={{ border: "1px dashed #94a3b8", borderRadius: 10, padding: 10, background: "rgba(59,130,246,0.03)" }}>
              <strong style={{ fontSize: "0.8rem" }}>Croquis de enumeración de apoyos · frente / acceso ↑</strong>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.ceil(eccPositions.length / 2)}, minmax(36px, 1fr))`, gap: 6, marginTop: 8 }}>
                {eccPositions.slice(0, Math.ceil(eccPositions.length / 2)).map((p) => (
                  <span key={`top-${p.pos}`} className="tag" style={{ textAlign: "center" }}>
                    {p.pos}
                  </span>
                ))}
              </div>
              <div style={{ height: 18, borderLeft: "2px solid #64748b", borderRight: "2px solid #64748b", margin: "5px 10px", textAlign: "center", fontSize: "0.68rem", color: "#64748b" }}>
                PLATAFORMA
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.ceil(eccPositions.length / 2)}, minmax(36px, 1fr))`, gap: 6 }}>
                {eccPositions.slice(Math.ceil(eccPositions.length / 2)).map((p) => (
                  <span key={`bottom-${p.pos}`} className="tag" style={{ textAlign: "center" }}>
                    {p.pos}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
            {eccPositions.map((p, idx) => {
              const correctedError = beforeRounding(p.indication, p.deltaL) - eccLoadNum;
              const err = Math.abs(correctedError);
              const ok = eccentricityConfig ? err <= (eccentricityConfig.emt || 20) : true;
              return (
                <div key={p.pos} style={{ background: "rgba(0,0,0,0.02)", padding: 10, borderRadius: 8, border: "1px solid var(--surface-border)" }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                    {p.label}
                    <span className="muted" style={{ display: "block", fontSize: "0.7rem" }}>Indicación I</span>
                    <input
                      type="number"
                      step="1"
                      value={p.indication}
                      onChange={(e) => {
                        const copy = [...eccPositions];
                        copy[idx].indication = e.target.value;
                        setEccPositions(copy);
                      }}
                    />
                    <span className="muted" style={{ display: "block", fontSize: "0.7rem", marginTop: 4 }}>ΔL hasta +e</span>
                    <input
                      type="number"
                      step="1"
                      value={p.deltaL}
                      onChange={(e) => {
                        const copy = [...eccPositions];
                        copy[idx].deltaL = e.target.value;
                        setEccPositions(copy);
                      }}
                    />
                  </label>
                  <div style={{ marginTop: 6, fontSize: "0.75rem", display: "flex", justifyContent: "space-between" }}>
                    <span>Error: <strong>{correctedError >= 0 ? `+${correctedError.toFixed(0)}` : correctedError.toFixed(0)}</strong></span>
                    <span className={`badge ${ok ? "ok" : "prio-high"}`}>{ok ? "✓ Conforme" : "✗ Fuera"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: "0.84rem", background: "rgba(0,0,0,.03)", padding: "8px 10px", borderRadius: 8 }}>
            <span>Error Máximo: <strong>{eccMaxError.toFixed(0)}</strong> {selectedEquipment?.unit}</span>
            <span className={`badge ${eccOk ? "ok" : "prio-high"}`}>{eccOk ? "✓ Excentricidad conforme" : "✗ Supera EMT"}</span>
          </div>
        </div>

        {/* Assay 4: Linearity */}
        <div className="card pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>6. Ensayo de Exactitud y Linealidad</h3>
            <span className="tag" style={{ background: "rgba(13, 148, 136, 0.1)", color: "#0d9488", fontWeight: 700 }}>
              Cargas Crecientes y Decrecientes
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>Paso</th>
                  <th style={{ padding: "8px 6px" }}>Carga Patrón</th>
                  <th style={{ padding: "8px 6px" }}>EMT</th>
                  <th style={{ padding: "8px 6px" }}>Lectura Creciente (↗)</th>
                  <th style={{ padding: "8px 6px" }}>Error (↗)</th>
                  <th style={{ padding: "8px 6px" }}>Lectura Decreciente (↘)</th>
                  <th style={{ padding: "8px 6px" }}>Error (↘)</th>
                  <th style={{ padding: "8px 6px", textAlign: "center" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {linRows.map((r, idx) => {
                  const ascErr = (parseFloat(r.ascIndication) || 0) - r.targetLoad;
                  const descErr = (parseFloat(r.descIndication) || 0) - r.targetLoad;
                  const ascOk = Math.abs(ascErr) <= r.emt;
                  const descOk = Math.abs(descErr) <= r.emt;
                  const stepOk = ascOk && descOk;

                  return (
                    <tr key={r.step} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                      <td style={{ padding: "6px" }}>#{r.step}</td>
                      <td style={{ padding: "6px", fontWeight: 700 }}>
                        {r.targetLoad.toLocaleString("es-AR")} {selectedEquipment?.unit}
                      </td>
                      <td style={{ padding: "6px" }}>±{r.emt} {selectedEquipment?.unit}</td>
                      <td style={{ padding: "6px" }}>
                        <input
                          type="number"
                          step="1"
                          value={r.ascIndication}
                          onChange={(e) => {
                            const copy = [...linRows];
                            copy[idx].ascIndication = e.target.value;
                            setLinRows(copy);
                          }}
                          style={{ width: 110 }}
                        />
                      </td>
                      <td style={{ padding: "6px", color: ascOk ? "#047857" : "#b91c1c", fontWeight: 700 }}>
                        {ascErr >= 0 ? `+${ascErr.toFixed(0)}` : ascErr.toFixed(0)}
                      </td>
                      <td style={{ padding: "6px" }}>
                        <input
                          type="number"
                          step="1"
                          value={r.descIndication}
                          onChange={(e) => {
                            const copy = [...linRows];
                            copy[idx].descIndication = e.target.value;
                            setLinRows(copy);
                          }}
                          style={{ width: 110 }}
                        />
                      </td>
                      <td style={{ padding: "6px", color: descOk ? "#047857" : "#b91c1c", fontWeight: 700 }}>
                        {descErr >= 0 ? `+${descErr.toFixed(0)}` : descErr.toFixed(0)}
                      </td>
                      <td style={{ padding: "6px", textAlign: "center" }}>
                        <span className={`badge ${stepOk ? "ok" : "prio-high"}`}>{stepOk ? "✓ Apto" : "✗ Fuera"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Weights Picker */}
        <div className="card pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>2. Patrones Metrológicos Utilizados</h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                {selectedWeightIds.length} patrones vinculados al ensayo
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline compact"
              onClick={() => {
                setDraftWeightIds([...selectedWeightIds]);
                setWeightPickerOpen(true);
              }}
            >
              ⚖️ Seleccionar Patrones ({selectedWeightIds.length})
            </button>
          </div>
        </div>

        {/* Final Observations & Verdict */}
        <div className="card pad" style={{ borderLeft: allAssaysPass ? "4px solid #10b981" : "4px solid #ef4444" }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>7. Dictamen Final y Emisión</h3>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: allAssaysPass ? "#047857" : "#b91c1c" }}>
                Dictamen: {finalResult.toUpperCase()}
              </div>
              <small className="muted">
                Incertidumbre expandida estimada U (k=2): <strong>{expandedUncertainty} {selectedEquipment?.unit}</strong>
              </small>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="btn ghost"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !selectedEquipment}
                style={{ fontWeight: 800, padding: "10px 24px" }}
              >
                {saving ? "Emitiendo Informe..." : "💾 Guardar y Emitir Certificado"}
              </button>
            </div>
          </div>

          <label>
            Observaciones del Certificado
            <textarea
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Notas metrológicas adicionales, precintos colocados, estado del indicador..."
              style={{ width: "100%", borderRadius: 6, border: "1px solid var(--surface-border)", padding: 8 }}
            />
          </label>
        </div>
      </form>

      {/* Weight Picker Modal */}
      {weightPickerOpen && (
        <div className="modal-backdrop">
          <div className="modal-card card pad" style={{ maxWidth: 650 }}>
            <h3>Seleccionar Patrones Metrológicos</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Buscar por código, certificado o valor..."
                value={weightSearch}
                onChange={(e) => setWeightSearch(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-outline compact"
                onClick={() => setDraftWeightIds(weights.map((w) => w.id))}
              >
                Marcar Todos
              </button>
              <button
                type="button"
                className="btn ghost compact"
                onClick={() => setDraftWeightIds([])}
              >
                Desmarcar
              </button>
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--surface-border)", borderRadius: 6 }}>
              {weights
                .filter(
                  (w) =>
                    !weightSearch ||
                    w.code.toLowerCase().includes(weightSearch.toLowerCase()) ||
                    w.certificateNumber?.toLowerCase().includes(weightSearch.toLowerCase())
                )
                .map((w) => {
                  const checked = draftWeightIds.includes(w.id);
                  return (
                    <label
                      key={w.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderBottom: "1px solid rgba(0,0,0,0.04)",
                        cursor: "pointer",
                        background: checked ? "rgba(13, 148, 136, 0.05)" : "transparent"
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) setDraftWeightIds([...draftWeightIds, w.id]);
                          else setDraftWeightIds(draftWeightIds.filter((id) => id !== w.id));
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>{w.code}</span>
                      <span>
                        ({w.nominalValue} {w.unit} Cl.{w.accuracyClass})
                      </span>
                      <span className="muted" style={{ marginLeft: "auto", fontSize: "0.78rem" }}>
                        Cert: {w.certificateNumber || "—"}
                      </span>
                    </label>
                  );
                })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button type="button" className="btn ghost" onClick={() => setWeightPickerOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSelectedWeightIds(draftWeightIds);
                  setWeightPickerOpen(false);
                }}
              >
                Confirmar ({draftWeightIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
