import { useEffect, useState, FormEvent, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyEquipment, StandardWeight, MetrologyInstrument, MetrologyTestPoint, EccentricityConfig } from "../../api/types";

export type FidelityTrial = {
  initialZero: string;
  indication: string;
  finalZero: string;
  deltaL: string;
};

export type FormTab = "general" | "zero_mobility" | "fidelity" | "eccentricity" | "linearity" | "summary";

export interface LinearityRowState {
  step: number;
  pesas: string;
  auxLoad: string;
  ascIndication: string;
  ascDeltaL: string;
  descIndication: string;
  descDeltaL: string;
}

export interface MetrologySealRow {
  id: string;
  location: string;
  code: string;
  type: string;
  notes: string;
}

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
  const amendmentReasonParam = searchParams.get("amendmentReason");
  const supersedesReportIdParam = searchParams.get("supersedesReportId");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab Navigation State
  const [activeTab, setActiveTab] = useState<FormTab>("general");

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
  const [thermometers, setThermometers] = useState<MetrologyInstrument[]>([]);
  const [thermometerId, setThermometerId] = useState("");
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
    "Puesta a cero (rango 4% Max) y discriminación / movilidad (1.4d)",
    is2307 ? "Ensayo de fidelidad (baja y alta carga)" : "Ensayo de repetibilidad",
    "Ensayo de excentricidad",
    "Errores de indicación: cargas crecientes y decrecientes con redondeo (ΔL)",
    "Precintos, intervención y cierre del informe"
  ];

  if (operationType === "PostRepair") testPlanItems.splice(2, 0, "Descripción de la intervención posterior a reparación");
  if (operationType === "PeriodicVerification" || operationType === "InitialVerification")
    testPlanItems.push("Control de habilitación aplicable a la operación");

  // Selected Standard Weights (IDs)
  const [selectedWeightIds, setSelectedWeightIds] = useState<string[]>([]);
  const [weightPickerOpen, setWeightPickerOpen] = useState(false);
  const [draftWeightIds, setDraftWeightIds] = useState<string[]>([]);
  const [weightSearch, setWeightSearch] = useState("");

  // Assay 1: Visual & Functional Inspection (sin cero, ya que cuenta con ensayo dedicado)
  const [inspLevel, setInspLevel] = useState(true);
  const [inspTare, setInspTare] = useState(true);
  const [inspSeals, setInspSeals] = useState(true);
  const [inspNotes, setInspNotes] = useState("Instrumento en correctas condiciones mecánicas y estructurales.");

  // Assay 2: Puesta a Cero (Rango 4% Max y Exactitud de Cero)
  const [zeroInRangeLoad, setZeroInRangeLoad] = useState("1600");
  const [zeroInRangeOk, setZeroInRangeOk] = useState(true);
  const [zeroOverLimitLoad, setZeroOverLimitLoad] = useState("3500");
  const [zeroOverLimitBlocked, setZeroOverLimitBlocked] = useState(true);
  const [zeroErrorDeltaL, setZeroErrorDeltaL] = useState("10");

  // Assay 3: Movilidad / Discriminación (Sobrecarga de 1.4d)
  const [mobilityPoints, setMobilityPoints] = useState<Array<{ loadName: string; load: string; overload: string; initialIndication: string; finalIndication: string }>>([
    { loadName: "Cero / Carga Mínima", load: "0", overload: "28", initialIndication: "0", finalIndication: "20" },
    { loadName: "Media Carga (50% Max)", load: "40000", overload: "28", initialIndication: "40000", finalIndication: "40020" },
    { loadName: "Carga Máxima (100% Max)", load: "80000", overload: "28", initialIndication: "80000", finalIndication: "80020" }
  ]);

  // Assay 4: Fidelity / Repeatability with Dual Load (Baja Carga y Alta Carga)
  const [fidelityTab, setFidelityTab] = useState<"low" | "high" | "both">("both");

  // Baja Carga (Low Load)
  const [fidelityLowInbound, setFidelityLowInbound] = useState<FidelityTrial[]>(() => createDefaultTrials(3, "12500"));
  const [fidelityLowOutbound, setFidelityLowOutbound] = useState<FidelityTrial[]>(() => createDefaultTrials(3, "12500"));
  const [fidelityLowPlatform, setFidelityLowPlatform] = useState<FidelityTrial[]>(() => createDefaultTrials(5, "12500"));

  // Alta Carga (High Load)
  const [fidelityHighInbound, setFidelityHighInbound] = useState<FidelityTrial[]>(() => createDefaultTrials(3, "25000"));
  const [fidelityHighOutbound, setFidelityHighOutbound] = useState<FidelityTrial[]>(() => createDefaultTrials(3, "25000"));
  const [fidelityHighPlatform, setFidelityHighPlatform] = useState<FidelityTrial[]>(() => createDefaultTrials(5, "25000"));

  // Assay 5: Eccentricity (Positions)
  const [eccTestLoad, setEccTestLoad] = useState<string>("16000");
  const [eccPositions, setEccPositions] = useState<Array<{ pos: number; label: string; indication: string; deltaL: string }>>([
    { pos: 1, label: "Apoyo 1 (Celda 1)", indication: "16000", deltaL: "10" },
    { pos: 2, label: "Apoyo 2 (Celda 2)", indication: "16000", deltaL: "10" },
    { pos: 3, label: "Apoyo 3 (Celda 3)", indication: "16000", deltaL: "10" },
    { pos: 4, label: "Apoyo 4 (Celda 4)", indication: "16000", deltaL: "10" },
    { pos: 5, label: "Apoyo 5 (Celda 5)", indication: "16000", deltaL: "10" },
    { pos: 6, label: "Apoyo 6 (Celda 6)", indication: "16000", deltaL: "10" }
  ]);

  // Assay 6: Linearity (25 rows con pesas, carga auxiliar y redondeo)
  const [linRows, setLinRows] = useState<LinearityRowState[]>([]);

  // Control y Registro de Precintos Metrológicos
  const [seals, setSeals] = useState<MetrologySealRow[]>([
    { id: "1", location: "Indicador electrónico", code: "", type: "Autoadhesivo (a)", notes: "" },
    { id: "2", location: "Caja de unión", code: "", type: "Autoadhesivo (a)", notes: "" },
    { id: "3", location: "Placa de identificación de indicador", code: "", type: "Autoadhesivo (a)", notes: "" },
    { id: "4", location: "Placa de identificación de plataforma", code: "", type: "Autoadhesivo (a)", notes: "" }
  ]);

  // Load initial lists
  useEffect(() => {
    Promise.all([
      api.listMetrologyEquipment({ status: "Active" }),
      api.listStandardWeights(),
      api.listMetrologyInstruments({ kind: "Thermometer", status: "Valid" }).catch(() => [])
    ])
      .then(([eqs, wts, ths]) => {
        setEquipments(eqs || []);
        setWeights(wts || []);
        setThermometers(ths || []);
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
    const dVal = Number(eq.divisionD || 20);
    const eInt = Number(eq.verificationIntervalE || 20);
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

    // Zero setting default setup (4% of Max Capacity)
    const zeroLimit4Pct = Math.round(maxCap * 0.04);
    setZeroInRangeLoad(Math.round(zeroLimit4Pct * 0.5).toString());
    setZeroInRangeOk(true);
    setZeroOverLimitLoad(Math.round(zeroLimit4Pct * 1.2).toString());
    setZeroOverLimitBlocked(true);
    setZeroErrorDeltaL((eInt / 2).toString());

    // Mobility default setup (1.4 * d overload)
    const overload14d = Math.round(dVal * 1.4 * 100) / 100;
    setMobilityPoints([
      { loadName: "Cero / Carga Mínima", load: "0", overload: overload14d.toString(), initialIndication: "0", finalIndication: dVal.toString() },
      { loadName: "Media Carga (50% Max)", load: Math.round(maxCap * 0.5).toString(), overload: overload14d.toString(), initialIndication: Math.round(maxCap * 0.5).toString(), finalIndication: (Math.round(maxCap * 0.5) + dVal).toString() },
      { loadName: "Carga Máxima (100% Max)", load: maxCap.toString(), overload: overload14d.toString(), initialIndication: maxCap.toString(), finalIndication: (maxCap + dVal).toString() }
    ]);

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

      // Setup Linearity rows (al menos 25 renglones para pesas patron y cargas auxiliares)
      const lRows: LinearityRowState[] = [];
      const totalSteps = Math.max(25, lPoints?.length || 0);
      for (let i = 1; i <= totalSteps; i++) {
        const pt = lPoints && lPoints[i - 1];
        lRows.push({
          step: i,
          pesas: pt ? pt.targetLoad.toString() : "",
          auxLoad: "",
          ascIndication: pt ? pt.targetLoad.toString() : "",
          ascDeltaL: "",
          descIndication: pt ? pt.targetLoad.toString() : "",
          descDeltaL: ""
        });
      }
      setLinRows(lRows);
    } catch (err) {
      console.error("Error al calcular reglas metrológicas:", err);
    }
  };

  const eInterval = Number(selectedEquipment?.verificationIntervalE || 20);
  const dInterval = Number(selectedEquipment?.divisionD || 20);
  const beforeRounding = (indication: string, deltaL: string) =>
    (parseFloat(indication) || 0) + eInterval / 2 - (parseFloat(deltaL) || 0);

  const computeLinearityRow = (r: LinearityRowState, eInt: number) => {
    const pesasVal = parseFloat(r.pesas) || 0;
    const auxVal = parseFloat(r.auxLoad) || 0;
    const totalLoad = pesasVal + auxVal;

    const hasAsc = r.ascIndication.trim() !== "" && !isNaN(parseFloat(r.ascIndication));
    const rawAsc = parseFloat(r.ascIndication) || 0;
    const hasAscDelta = r.ascDeltaL.trim() !== "" && !isNaN(parseFloat(r.ascDeltaL));
    const ascDeltaVal = parseFloat(r.ascDeltaL) || 0;
    const ascCorrected = hasAsc ? (hasAscDelta ? rawAsc + eInt / 2 - ascDeltaVal : rawAsc) : null;
    const ascError = ascCorrected !== null ? ascCorrected - totalLoad : null;

    const hasDesc = r.descIndication.trim() !== "" && !isNaN(parseFloat(r.descIndication));
    const rawDesc = parseFloat(r.descIndication) || 0;
    const hasDescDelta = r.descDeltaL.trim() !== "" && !isNaN(parseFloat(r.descDeltaL));
    const descDeltaVal = parseFloat(r.descDeltaL) || 0;
    const descCorrected = hasDesc ? (hasDescDelta ? rawDesc + eInt / 2 - descDeltaVal : rawDesc) : null;
    const descError = descCorrected !== null ? descCorrected - totalLoad : null;

    // EMT según escalón e y carga total L
    const emt = totalLoad <= 500 * eInt ? eInt : totalLoad <= 2000 * eInt ? 2 * eInt : 3 * eInt;

    const hasAnyData = hasAsc || hasDesc || r.pesas.trim() !== "" || r.auxLoad.trim() !== "";
    const ascOk = ascError !== null ? Math.abs(ascError) <= emt : true;
    const descOk = descError !== null ? Math.abs(descError) <= emt : true;
    const conform = hasAnyData ? ascOk && descOk : true;

    return {
      step: r.step,
      pesas: pesasVal,
      auxLoad: auxVal,
      totalLoad,
      hasAsc,
      ascIndication: hasAsc ? rawAsc : null,
      ascDeltaL: hasAscDelta ? ascDeltaVal : null,
      ascCorrected,
      ascError,
      hasDesc,
      descIndication: hasDesc ? rawDesc : null,
      descDeltaL: hasDescDelta ? descDeltaVal : null,
      descCorrected,
      descError,
      emt,
      hasAnyData,
      conform
    };
  };

  const fidelityPlatformType = String(selectedEquipment?.platformType ?? "");
  const truckFidelity = fidelityPlatformType === "TruckScale" || fidelityPlatformType === "RollingLoad";

  // Helper to compute stats for a block of trials where the reference load is the 1st reading (Pass #1)
  const computeFidelityBlock = (trials: FidelityTrial[]) => {
    const rawReadings = trials
      .map((t, idx) => {
        const ind = parseFloat(t.indication);
        if (isNaN(ind) || t.indication.trim() === "") return null;
        const dL = parseFloat(t.deltaL) || 0;
        const corr = ind + eInterval / 2 - dL;
        return { index: idx + 1, indication: ind, deltaL: dL, corrected: corr };
      })
      .filter((x): x is { index: number; indication: number; deltaL: number; corrected: number } => x !== null);

    if (rawReadings.length === 0) {
      return {
        refLoad: 0,
        targetEmt: repeatabilityEmt || 20,
        computedRows: trials.map((_, i) => ({
          index: i + 1,
          hasValue: false,
          indication: null,
          corrected: null,
          error: null,
          ok: true
        })),
        minVal: 0,
        maxVal: 0,
        maxDiff: 0,
        stdDev: 0,
        conform: true
      };
    }

    const refLoad = rawReadings[0].corrected;
    const targetEmt = getEmtForLoad(refLoad, eInterval, selectedEquipment?.accuracyClass || "III");

    const computedRows = trials.map((t, idx) => {
      const ind = parseFloat(t.indication);
      if (isNaN(ind) || t.indication.trim() === "") {
        return { index: idx + 1, hasValue: false, indication: null, corrected: null, error: null, ok: true };
      }
      const dL = parseFloat(t.deltaL) || 0;
      const corr = ind + eInterval / 2 - dL;
      const error = corr - refLoad;
      const ok = Math.abs(error) <= targetEmt;
      return { index: idx + 1, hasValue: true, indication: ind, corrected: corr, error, ok };
    });

    const values = rawReadings.map((r) => r.corrected);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const maxDiff = maxVal - minVal;

    const n = values.length;
    const mean = values.reduce((acc, v) => acc + v, 0) / (n || 1);
    const variance = n > 1 ? values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);

    const conform = computedRows.every((r) => !r.hasValue || r.ok);

    return { refLoad, targetEmt, computedRows, minVal, maxVal, maxDiff, stdDev, conform };
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

  const lowAppliedLoad = truckFidelity ? lowInboundBlock.refLoad || lowOutboundBlock.refLoad : lowPlatformBlock.refLoad;
  const highAppliedLoad = truckFidelity ? highInboundBlock.refLoad || highOutboundBlock.refLoad : highPlatformBlock.refLoad;
  const lowEmt = truckFidelity ? lowInboundBlock.targetEmt : lowPlatformBlock.targetEmt;
  const highEmt = truckFidelity ? highInboundBlock.targetEmt : highPlatformBlock.targetEmt;

  // Zero Setting calculation (4% Max Capacity)
  const zero4PctLimit = Math.round((selectedEquipment?.maxCapacity || 80000) * 0.04);
  const zeroErrorCorrected = eInterval / 2 - (parseFloat(zeroErrorDeltaL) || 0);
  const zeroErrorEmt = 0.25 * eInterval;
  const zeroErrorOk = Math.abs(zeroErrorCorrected) <= zeroErrorEmt;
  const zeroSettingOk = zeroInRangeOk && zeroOverLimitBlocked && zeroErrorOk;

  // Mobility calculation (1.4 * d overload)
  const mobilityComputed = mobilityPoints.map((p) => {
    const init = parseFloat(p.initialIndication) || 0;
    const fin = parseFloat(p.finalIndication) || 0;
    const delta = fin - init;
    const ok = delta >= dInterval;
    return { ...p, delta, ok };
  });
  const mobilityOk = mobilityComputed.every((p) => p.ok);

  // Eccentricity
  const eccLoadNum = parseFloat(eccTestLoad) || 0;
  const eccErrors = eccPositions.map((p) => Math.abs(beforeRounding(p.indication, p.deltaL) - eccLoadNum));
  const eccMaxError = Math.max(0, ...eccErrors);
  const eccOk = eccentricityConfig ? eccMaxError <= (eccentricityConfig.emt || 20) : true;

  // Linearity
  const linRowsComputed = linRows.map((r) => computeLinearityRow(r, eInterval));
  const activeLinRows = linRowsComputed.filter((r) => r.hasAnyData);
  const linAllOk = activeLinRows.length > 0 ? activeLinRows.every((r) => r.conform) : true;

  // Visual inspection OK (nivelación, tara y precintos)
  const inspOk = inspLevel && inspTare && inspSeals;
  const allAssaysPass = inspOk && zeroSettingOk && mobilityOk && fidelityAllOk && eccOk && linAllOk;
  const finalResult = allAssaysPass ? "Apto" : "No Apto";

  // Estimated Uncertainty U (k=2)
  const expandedUncertainty = Math.round((dInterval * 0.58 + eccMaxError * 0.3) * 100) / 100;

  // Tab Navigation Helpers
  const tabOrder: FormTab[] = ["general", "zero_mobility", "fidelity", "eccentricity", "linearity", "summary"];
  const tabLabels: Record<FormTab, string> = {
    general: "1. Datos & Inspección",
    zero_mobility: "2. Cero & Movilidad",
    fidelity: "3. Fidelidad",
    eccentricity: "4. Excentricidad",
    linearity: "5. Linealidad",
    summary: "6. Dictamen & Emisión"
  };

  const goToNextTab = () => {
    const currIdx = tabOrder.indexOf(activeTab);
    if (currIdx < tabOrder.length - 1) {
      setActiveTab(tabOrder[currIdx + 1]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goToPrevTab = () => {
    const currIdx = tabOrder.indexOf(activeTab);
    if (currIdx > 0) {
      setActiveTab(tabOrder[currIdx - 1]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEquipment) {
      setError("Debe seleccionar un instrumento a calibrar.");
      setActiveTab("general");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const repeatabilityData = {
        hasDualLoad: true,
        method: "Primera pasada como referencia",
        lowLoad: {
          load: lowAppliedLoad,
          emt: lowEmt,
          inbound: truckFidelity ? lowInboundBlock : null,
          outbound: truckFidelity ? lowOutboundBlock : null,
          platform: !truckFidelity ? lowPlatformBlock : null,
          conform: lowOk
        },
        highLoad: {
          load: highAppliedLoad,
          emt: highEmt,
          inbound: truckFidelity ? highInboundBlock : null,
          outbound: truckFidelity ? highOutboundBlock : null,
          platform: !truckFidelity ? highPlatformBlock : null,
          conform: highOk
        },
        readings: truckFidelity
          ? [
              ...lowInboundBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Entrada (Baja)", indication: parseFloat(r.indication as any) || 0 })),
              ...lowOutboundBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Salida (Baja)", indication: parseFloat(r.indication as any) || 0 })),
              ...highInboundBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Entrada (Alta)", indication: parseFloat(r.indication as any) || 0 })),
              ...highOutboundBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Salida (Alta)", indication: parseFloat(r.indication as any) || 0 }))
            ]
          : [
              ...lowPlatformBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Baja Carga", indication: parseFloat(r.indication as any) || 0 })),
              ...highPlatformBlock.computedRows.filter((r) => r.hasValue).map((r) => ({ pass: r.index, direction: "Alta Carga", indication: parseFloat(r.indication as any) || 0 }))
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

      const linearityData = linRows
        .map((r) => computeLinearityRow(r, eInterval))
        .filter((r) => r.hasAnyData)
        .map((r) => ({
          step: r.step,
          pesas: r.pesas,
          auxLoad: r.auxLoad,
          targetLoad: r.totalLoad,
          emt: r.emt,
          ascIndication: r.ascIndication ?? 0,
          ascDeltaL: r.ascDeltaL ?? 0,
          ascCorrected: r.ascCorrected ?? 0,
          ascError: r.ascError ?? 0,
          descIndication: r.descIndication ?? 0,
          descDeltaL: r.descDeltaL ?? 0,
          descCorrected: r.descCorrected ?? 0,
          descError: r.descError ?? 0,
          conform: r.conform
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

      const validSeals = seals.filter((s) => s.location.trim() || s.code.trim());
      const sealsSummary = validSeals
        .filter((s) => s.code.trim())
        .map((s) => `${s.location}: ${s.code} (${s.type})`)
        .join("; ");

      const created = await api.saveCalibrationReport({
        certificateNumber: reportNumber.trim() || undefined,
        equipmentId: selectedEquipment.id,
        standardApplied: regulatoryProfile === "REGIMEN_TRANSITORIO_R2307_80" ? "Res2307_80" : "Res25_2025",
        calibrationType: "InService",
        regulatoryProfile,
        operationType,
        documentTitle,
        regulatoryStatus: is2307 ? "Derogada — aplicación transitoria" : "Vigente",
        regulatoryNotice: is2307
          ? "Régimen transitorio aplicado por uso en servicio / habilitación según marco normativo aplicable."
          : "",
        testPlanVersion: "MET-BASE-1",
        reportStatus: "Draft",
        calibrationDate: new Date(calibrationDate).toISOString(),
        expirationDate: nextCalibrationDate ? new Date(nextCalibrationDate).toISOString() : undefined,
        performedBy: performedBy.trim(),
        temperatureCelsius: parseFloat(ambientTemperature) || 20,
        relativeHumidityPercent: parseFloat(ambientHumidity) || 50,
        atmosphericPressureHpa: parseFloat(atmosphericPressure) || 1013,
        thermometerInstrumentId: thermometerId || undefined,
        approvedBy: "",
        verdict: finalResult === "Apto" ? "Approved" : "Rejected",
        maxObservedError: Math.max(
          eccMaxError,
          lowInboundBlock.maxDiff,
          lowOutboundBlock.maxDiff,
          highInboundBlock.maxDiff,
          highOutboundBlock.maxDiff,
          lowPlatformBlock.maxDiff,
          highPlatformBlock.maxDiff,
          ...(activeLinRows.length > 0 ? activeLinRows.flatMap((x) => [Math.abs(x.ascError ?? 0), Math.abs(x.descError ?? 0)]) : [0])
        ),
        maxAllowedError: Math.max(highEmt, eccentricityConfig?.emt || 0, ...(activeLinRows.length > 0 ? activeLinRows.map((x) => x.emt) : [0])),
        expandedUncertaintyK2: expandedUncertainty,
        visualInspectionJson: JSON.stringify({
          level: inspLevel,
          tare: inspTare,
          seals: inspSeals,
          notes: inspNotes.trim(),
          sealsList: validSeals,
          checklist: {
            profile: regulatoryProfile,
            operationType,
            operationLabel: operationLabels[operationType] || operationType,
            normativeApplied: is2307 ? "Resolución SCyNEI Nº 2307/1980 (régimen transitorio)" : "Resolución SIyC Nº 25/2025 (OIML R 76-1)",
            regulatoryStatus: is2307 ? "Derogada — aplicación transitoria" : "Vigente",
            testPlanItems
          },
          zeroSetting: {
            deviceType: "Manual / Semiautomático (>0<)",
            rangePercent: 4,
            maxAllowedRange: zero4PctLimit,
            positiveTestLoad: parseFloat(zeroInRangeLoad) || 0,
            positiveZeroOk: zeroInRangeOk,
            overLimitTestLoad: parseFloat(zeroOverLimitLoad) || 0,
            overLimitBlockedOk: zeroOverLimitBlocked,
            zeroErrorDeltaL: parseFloat(zeroErrorDeltaL) || 0,
            zeroErrorCorrected,
            zeroErrorEmt,
            zeroErrorOk,
            conform: zeroSettingOk
          },
          mobility: {
            overloadFormula: "1.4 × d",
            overloadValue: Math.round(dInterval * 1.4 * 100) / 100,
            points: mobilityComputed.map((p) => ({
              loadName: p.loadName,
              load: parseFloat(p.load) || 0,
              overload: parseFloat(p.overload) || 0,
              initialIndication: parseFloat(p.initialIndication) || 0,
              finalIndication: parseFloat(p.finalIndication) || 0,
              delta: p.delta,
              minRequiredDelta: dInterval,
              conform: p.ok
            })),
            conform: mobilityOk
          }
        }),
        repeatabilityTestJson: JSON.stringify(repeatabilityData),
        eccentricityTestJson: JSON.stringify(eccentricityData),
        linearityTestJson: JSON.stringify(linearityData),
        weightsUsedJson: JSON.stringify(weightsUsed),
        observations: observations.trim() || undefined,
        sealsPlaced: sealsSummary || (inspSeals ? "Precintos reglamentarios colocados en indicador y caja de unión." : "Sin precintos reglamentarios.")
      });

      navigate(`/metrologia/certificados/${created.id}`);
    } catch (err: any) {
      setError(err.message || "Error al emitir el certificado metrológico.");
    } finally {
      setSaving(false);
    }
  };

  const renderTrialTable = (
    title: string,
    trials: FidelityTrial[],
    setter: (t: FidelityTrial[]) => void,
    block: ReturnType<typeof computeFidelityBlock>
  ) => {
    return (
      <div style={{ background: "rgba(0,0,0,0.015)", border: "1px solid var(--surface-border)", borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, borderBottom: "1px solid rgba(0,0,0,0.06)", paddingBottom: 6 }}>
          <strong style={{ fontSize: "0.86rem", color: "#0f766e" }}>{title}</strong>
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            Carga Base Ref: <strong>{block.refLoad.toFixed(0)} {selectedEquipment?.unit}</strong> · EMT: <strong>±{block.targetEmt} {selectedEquipment?.unit}</strong>
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.02)", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", width: 70 }}>Pasada</th>
                <th style={{ padding: "6px 8px", width: 95, textAlign: "right" }}>Cero Inicial</th>
                <th style={{ padding: "6px 8px", width: 110, textAlign: "right" }}>Indicación (I)</th>
                <th style={{ padding: "6px 8px", width: 95, textAlign: "right" }}>Cero Final</th>
                <th style={{ padding: "6px 8px", width: 100, textAlign: "right" }}>ΔL hasta +e</th>
                <th style={{ padding: "6px 8px", width: 100, textAlign: "right" }}>P (Corregida)</th>
                <th style={{ padding: "6px 8px", width: 90, textAlign: "right" }}>Error (E)</th>
                <th style={{ padding: "6px 8px", width: 70, textAlign: "center" }}>EMT</th>
                <th style={{ padding: "6px 8px", width: 90, textAlign: "center" }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {block.computedRows.map((r, idx) => {
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                      Pasada #{idx + 1} {idx === 0 && <span style={{ fontSize: "0.68rem", color: "#0284c7" }}>(Ref.)</span>}
                    </td>
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
                        onChange={(e) => {
                          const copy = [...trials];
                          copy[idx].indication = e.target.value;
                          setter(copy);
                        }}
                        placeholder="—"
                        style={{ width: "100%", maxWidth: "100px", textAlign: "right", fontWeight: 700, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--surface-border)" }}
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

      {(supersedesReportIdParam || amendmentReasonParam) && (
        <div
          className="card pad"
          style={{ marginBottom: 16, background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412" }}
        >
          <strong>Enmienda PG09 R2</strong>
          {amendmentReasonParam && <> — Motivo: {amendmentReasonParam}</>}
          {supersedesReportIdParam && (
            <div style={{ marginTop: 4, fontSize: "0.88rem" }}>
              Sustituye al informe{" "}
              <Link to={`/metrologia/informes/${supersedesReportIdParam}/imprimir`} target="_blank">
                {supersedesReportIdParam}
              </Link>
              . El original queda como sustituido y no se edita.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Modern Tabs Navigation Bar */}
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 4,
          borderBottom: "2px solid rgba(0,0,0,0.06)",
          marginBottom: 16
        }}
      >
        {[
          { id: "general", label: "1. Datos & Inspección", icon: "📋", ok: Boolean(selectedEquipmentId) && inspOk },
          { id: "zero_mobility", label: "2. Cero & Movilidad", icon: "🎯", ok: zeroSettingOk && mobilityOk },
          { id: "fidelity", label: "3. Fidelidad", icon: "🔁", ok: fidelityAllOk },
          { id: "eccentricity", label: "4. Excentricidad", icon: "📐", ok: eccOk },
          { id: "linearity", label: "5. Linealidad", icon: "⚖️", ok: linAllOk },
          { id: "summary", label: "6. Dictamen & Emisión", icon: "📜", ok: allAssaysPass }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as FormTab)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                borderBottom: isActive ? "3px solid #0d9488" : "3px solid transparent",
                background: isActive ? "rgba(13, 148, 136, 0.12)" : "rgba(0,0,0,0.02)",
                color: isActive ? "#06574c" : "var(--text-color, #333)",
                fontWeight: isActive ? 800 : 600,
                fontSize: "0.88rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease"
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.ok && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    background: "#10b981",
                    color: "#fff",
                    padding: "1px 6px",
                    borderRadius: 10,
                    fontWeight: 800
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* TAB 1: DATOS GENERALES & INSPECCION */}
        {activeTab === "general" && (
          <>
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
                  <div><strong>División (d):</strong> {selectedEquipment.divisionD} {selectedEquipment.unit}</div>
                  <div><strong>Clase:</strong> Clase {selectedEquipment.accuracyClass}</div>
                  <div><strong>Tipo Plataforma:</strong> {truckFidelity ? "🚛 Báscula Camiones / Rodante" : "⚖️ Balanza Plataforma / Estacionaria"}</div>
                </div>
              )}

              {/* Environmental Conditions */}
              <h4 style={{ margin: "14px 0 8px 0", fontSize: "0.95rem" }}>Condiciones Ambientales</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 10 }}>
                <label style={{ gridColumn: "1 / -1" }}>
                  Termómetro (PG16)
                  <select value={thermometerId} onChange={(e) => setThermometerId(e.target.value)}>
                    <option value="">— Sin vincular —</option>
                    {thermometers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} · {t.certificateNumber || "sin cert."}
                        {t.expirationDate ? ` · vence ${new Date(t.expirationDate).toLocaleDateString("es-AR")}` : ""}
                      </option>
                    ))}
                  </select>
                  {thermometers.length === 0 && (
                    <small className="muted">
                      No hay termómetros vigentes.{" "}
                      <a href="/metrologia/instrumentos/nuevo">Cargar uno</a>
                    </small>
                  )}
                </label>
              </div>
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

            {/* Inspección Visual y Funcional (Sin cero, ya que cuenta con pestaña y ensayo exclusivo) */}
            <div className="card pad">
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>Inspección Visual y Funcional</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={inspLevel}
                    onChange={(e) => setInspLevel(e.target.checked)}
                  />
                  <span>Nivelación y apoyos correctos</span>
                </label>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={inspTare}
                    onChange={(e) => setInspTare(e.target.checked)}
                  />
                  <span>Dispositivo de tara operativo</span>
                </label>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={inspSeals}
                    onChange={(e) => setInspSeals(e.target.checked)}
                  />
                  <span>Precintos reglamentarios colocados</span>
                </label>
              </div>

              <label>
                Observaciones de Inspección Visual
                <input
                  type="text"
                  value={inspNotes}
                  onChange={(e) => setInspNotes(e.target.value)}
                />
              </label>
            </div>
          </>
        )}

        {/* TAB 2: PUESTA A CERO & MOVILIDAD */}
        {activeTab === "zero_mobility" && (
          <>
            {/* Ensayo de Puesta a Cero (Rango 4% Max) */}
            <div className="card pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>2. Ensayo de Puesta a Cero (Rango 4% Max)</h3>
                  <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.76rem" }}>
                    Resolución SCyNEI 2307/80: Rango máximo de puesta a cero $\le 4\%$ de la Capacidad Máxima ($\pm 2\%$ Max). Error a cero $\le \pm 0.25e$.
                  </p>
                </div>
                <span className="tag" style={{ background: "rgba(13, 148, 136, 0.1)", color: "#0d9488", fontWeight: 700 }}>
                  Límite 4% Max = {zero4PctLimit.toLocaleString("es-AR")} {selectedEquipment?.unit || "kg"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
                {/* Test 1: Puesta a cero dentro del rango */}
                <div style={{ background: "rgba(0,0,0,0.02)", padding: 12, borderRadius: 8, border: "1px solid var(--surface-border)" }}>
                  <strong style={{ fontSize: "0.85rem", color: "#0f766e" }}>A. Puesta a Cero Dentro del Rango</strong>
                  <p className="muted" style={{ fontSize: "0.74rem", margin: "4px 0 8px" }}>
                    Carga aplicada menor al 4% Max donde el dispositivo debe poner a cero efectivamente.
                  </p>
                  <label style={{ fontSize: "0.8rem" }}>
                    Carga de prueba aplicada ({selectedEquipment?.unit})
                    <input
                      type="number"
                      step="1"
                      value={zeroInRangeLoad}
                      onChange={(e) => setZeroInRangeLoad(e.target.value)}
                    />
                  </label>
                  <label style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={zeroInRangeOk}
                      onChange={(e) => setZeroInRangeOk(e.target.checked)}
                    />
                    <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>Puesta a cero efectiva (Indicador regresa a 0)</span>
                  </label>
                </div>

                {/* Test 2: Bloqueo fuera del rango del 4% */}
                <div style={{ background: "rgba(0,0,0,0.02)", padding: 12, borderRadius: 8, border: "1px solid var(--surface-border)" }}>
                  <strong style={{ fontSize: "0.85rem", color: "#0f766e" }}>B. Bloqueo Fuera del Rango (&gt; 4% Max)</strong>
                  <p className="muted" style={{ fontSize: "0.74rem", margin: "4px 0 8px" }}>
                    Carga superior a {zero4PctLimit} {selectedEquipment?.unit} donde el indicador DEBE bloquear la puesta a cero.
                  </p>
                  <label style={{ fontSize: "0.8rem" }}>
                    Carga excesiva de prueba ({selectedEquipment?.unit})
                    <input
                      type="number"
                      step="1"
                      value={zeroOverLimitLoad}
                      onChange={(e) => setZeroOverLimitLoad(e.target.value)}
                    />
                  </label>
                  <label style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={zeroOverLimitBlocked}
                      onChange={(e) => setZeroOverLimitBlocked(e.target.checked)}
                    />
                    <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>Puesta a cero rechazada / bloqueada fuera de rango</span>
                  </label>
                </div>

                {/* Test 3: Exactitud de Puesta a Cero */}
                <div style={{ background: "rgba(0,0,0,0.02)", padding: 12, borderRadius: 8, border: "1px solid var(--surface-border)" }}>
                  <strong style={{ fontSize: "0.85rem", color: "#0f766e" }}>C. Exactitud de Puesta a Cero (E₀)</strong>
                  <p className="muted" style={{ fontSize: "0.74rem", margin: "4px 0 8px" }}>
                    Determinación del error en cero mediante pesitas de redondeo $\Delta L_0$ ($E_0 = 0.5e - \Delta L_0 \le \pm 0.25e$).
                  </p>
                  <label style={{ fontSize: "0.8rem" }}>
                    ΔL hasta cambio de indicación ({selectedEquipment?.unit})
                    <input
                      type="number"
                      step="1"
                      value={zeroErrorDeltaL}
                      onChange={(e) => setZeroErrorDeltaL(e.target.value)}
                    />
                  </label>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: "0.8rem" }}>
                    <span>Error E₀: <strong>{zeroErrorCorrected >= 0 ? `+${zeroErrorCorrected.toFixed(1)}` : zeroErrorCorrected.toFixed(1)} {selectedEquipment?.unit}</strong></span>
                    <span className={`badge ${zeroErrorOk ? "ok" : "prio-high"}`}>
                      {zeroErrorOk ? `✓ Cumple (EMT ±${zeroErrorEmt})` : `✗ Supera ±${zeroErrorEmt}`}
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: zeroSettingOk ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  borderRadius: 8
                }}
              >
                <div>
                  <strong>Estado del Ensayo de Puesta a Cero:</strong>{" "}
                  <span className="muted">(Rango 4%: {zeroInRangeOk && zeroOverLimitBlocked ? "✓ Correcto" : "✗ Falló"} · Error E₀: {zeroErrorOk ? "✓ Correcto" : "✗ Falló"})</span>
                </div>
                <span className={`badge ${zeroSettingOk ? "ok" : "prio-high"}`} style={{ fontWeight: 800 }}>
                  {zeroSettingOk ? "✓ PUESTA A CERO CONFORME" : "✗ NO CONFORME"}
                </span>
              </div>
            </div>

            {/* Ensayo de Movilidad / Discriminación */}
            <div className="card pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>3. Ensayo de Movilidad / Discriminación (Sobrecarga 1.4d)</h3>
                  <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.76rem" }}>
                    Al aplicar suavemente una sobrecarga adicional de $1.4 \times d$ ({Math.round(dInterval * 1.4 * 100) / 100} {selectedEquipment?.unit}) sobre el receptor en equilibrio, la indicación debe variar al menos $1 \times d$ ({dInterval} {selectedEquipment?.unit}).
                  </p>
                </div>
                <span className="tag" style={{ background: "rgba(13, 148, 136, 0.1)", color: "#0d9488", fontWeight: 700 }}>
                  Sobrecarga = 1.4 × d = {Math.round(dInterval * 1.4 * 100) / 100} {selectedEquipment?.unit || "kg"}
                </span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(0,0,0,0.02)", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px" }}>Nivel de Carga</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Carga Base ({selectedEquipment?.unit})</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Sobrecarga (1.4d)</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Indicación Inicial (I₁)</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Indicación Final (I₂)</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Variación (ΔI)</th>
                      <th style={{ padding: "6px 8px", textAlign: "center" }}>Mínimo Requerido</th>
                      <th style={{ padding: "6px 8px", textAlign: "center" }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mobilityPoints.map((p, idx) => {
                      const comp = mobilityComputed[idx];
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                          <td style={{ padding: "6px 8px", fontWeight: 700 }}>{p.loadName}</td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>
                            <input
                              type="number"
                              step="1"
                              value={p.load}
                              onChange={(e) => {
                                const copy = [...mobilityPoints];
                                copy[idx].load = e.target.value;
                                setMobilityPoints(copy);
                              }}
                              style={{ width: 100, textAlign: "right" }}
                            />
                          </td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>
                            <input
                              type="number"
                              step="0.1"
                              value={p.overload}
                              onChange={(e) => {
                                const copy = [...mobilityPoints];
                                copy[idx].overload = e.target.value;
                                setMobilityPoints(copy);
                              }}
                              style={{ width: 85, textAlign: "right" }}
                            />
                          </td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>
                            <input
                              type="number"
                              step="1"
                              value={p.initialIndication}
                              onChange={(e) => {
                                const copy = [...mobilityPoints];
                                copy[idx].initialIndication = e.target.value;
                                setMobilityPoints(copy);
                              }}
                              style={{ width: 100, textAlign: "right", fontWeight: 700 }}
                            />
                          </td>
                          <td style={{ padding: "4px 8px", textAlign: "right" }}>
                            <input
                              type="number"
                              step="1"
                              value={p.finalIndication}
                              onChange={(e) => {
                                const copy = [...mobilityPoints];
                                copy[idx].finalIndication = e.target.value;
                                setMobilityPoints(copy);
                              }}
                              style={{ width: 100, textAlign: "right", fontWeight: 700 }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: comp.ok ? "#047857" : "#b91c1c" }}>
                            +{comp.delta.toFixed(0)} {selectedEquipment?.unit}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontFamily: "monospace" }}>
                            ≥ {dInterval} {selectedEquipment?.unit}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>
                            <span className={`badge ${comp.ok ? "ok" : "prio-high"}`}>
                              {comp.ok ? "✓ CUMPLE" : "✗ NO CUMPLE"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 12,
                  padding: "8px 12px",
                  background: mobilityOk ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  borderRadius: 8
                }}
              >
                <div>
                  <strong>Estado General de Movilidad / Sensibilidad:</strong>{" "}
                  <span className="muted">(Variación mínima $\ge 1d$ verificada en los 3 niveles de carga)</span>
                </div>
                <span className={`badge ${mobilityOk ? "ok" : "prio-high"}`} style={{ fontWeight: 800 }}>
                  {mobilityOk ? "✓ MOVILIDAD CONFORME" : "✗ NO CONFORME"}
                </span>
              </div>
            </div>
          </>
        )}

        {/* TAB 3: FIDELIDAD */}
        {activeTab === "fidelity" && (
          <div className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem" }}>
                  4. {is2307 ? "Ensayo de Fidelidad" : "Ensayo de Repetibilidad"}
                </h3>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.78rem" }}>
                  Baja Carga: {lowAppliedLoad.toFixed(0)} {selectedEquipment?.unit} (EMT: ±{lowEmt}) · Alta Carga: {highAppliedLoad.toFixed(0)} {selectedEquipment?.unit} (EMT: ±{highEmt})
                </p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={`btn ${fidelityTab === "both" ? "btn-primary" : "btn-outline"} compact`}
                  onClick={() => setFidelityTab("both")}
                >
                  Ambas Cargas
                </button>
                <button
                  type="button"
                  className={`btn ${fidelityTab === "low" ? "btn-primary" : "btn-outline"} compact`}
                  onClick={() => setFidelityTab("low")}
                >
                  Baja Carga
                </button>
                <button
                  type="button"
                  className={`btn ${fidelityTab === "high" ? "btn-primary" : "btn-outline"} compact`}
                  onClick={() => setFidelityTab("high")}
                >
                  Alta Carga
                </button>
              </div>
            </div>

            {/* Low Load Section */}
            {(fidelityTab === "low" || fidelityTab === "both") && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "0 0 8px", color: "#0f766e", fontSize: "0.95rem" }}>
                  🔹 Fidelidad en Baja Carga (~30% / 12.5t)
                </h4>
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

            {/* High Load Section */}
            {(fidelityTab === "high" || fidelityTab === "both") && (
              <div style={{ marginBottom: 14 }}>
                <h4 style={{ margin: "0 0 8px", color: "#0f766e", fontSize: "0.95rem" }}>
                  🔸 Fidelidad en Alta Carga (~60%-100% / 25t)
                </h4>
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
        )}

        {/* TAB 4: EXCENTRICIDAD */}
        {activeTab === "eccentricity" && (
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
                {/* Fila superior (enfrente: 2, 4, 6, 8...) */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.ceil(eccPositions.length / 2)}, minmax(36px, 1fr))`, gap: 6, marginTop: 8 }}>
                  {Array.from({ length: Math.ceil(eccPositions.length / 2) }, (_, i) => 2 * (i + 1))
                    .filter((num) => num <= eccPositions.length)
                    .map((num) => (
                      <span key={`top-${num}`} className="tag" style={{ textAlign: "center", fontWeight: 700, background: "#e0f2fe", color: "#0369a1" }}>
                        {num}
                      </span>
                    ))}
                </div>
                <div style={{ height: 18, borderLeft: "2px solid #64748b", borderRight: "2px solid #64748b", margin: "5px 10px", textAlign: "center", fontSize: "0.68rem", color: "#64748b", fontWeight: 600 }}>
                  PLATAFORMA
                </div>
                {/* Fila inferior (frente / acceso: 1, 3, 5, 7...) */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.ceil(eccPositions.length / 2)}, minmax(36px, 1fr))`, gap: 6 }}>
                  {Array.from({ length: Math.ceil(eccPositions.length / 2) }, (_, i) => 2 * i + 1)
                    .filter((num) => num <= eccPositions.length)
                    .map((num) => (
                      <span key={`bottom-${num}`} className="tag" style={{ textAlign: "center", fontWeight: 700, background: "#e0f2fe", color: "#0369a1" }}>
                        {num}
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
        )}

        {/* TAB 5: LINEALIDAD */}
        {activeTab === "linearity" && (
          <div className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem" }}>6. Ensayo de Exactitud y Linealidad</h3>
                <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.75rem" }}>
                  Determinación de errores con cargas crecientes (↗) y decrecientes (↘), pesas patrón, cargas auxiliares y redondeo (ΔL)
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                  onClick={() => {
                    setLinRows((prev) => [
                      ...prev,
                      {
                        step: prev.length + 1,
                        pesas: "",
                        auxLoad: "",
                        ascIndication: "",
                        ascDeltaL: "",
                        descIndication: "",
                        descDeltaL: ""
                      }
                    ]);
                  }}
                >
                  + Agregar Renglón
                </button>
                <span className="tag" style={{ background: "rgba(13, 148, 136, 0.1)", color: "#0d9488", fontWeight: 700 }}>
                  {linRows.length} Renglones de Carga
                </span>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left" }}>
                    <th style={{ padding: "8px 6px", width: 90 }}>Pesas</th>
                    <th style={{ padding: "8px 6px", width: 95 }}>Carga Auxiliar</th>
                    <th style={{ padding: "8px 6px", width: 110 }}>Lectura Ascendente</th>
                    <th style={{ padding: "8px 6px", width: 100 }}>Redondeo Ascendente</th>
                    <th style={{ padding: "8px 6px", width: 115, textAlign: "right" }}>Lectura Corregida Ascendente</th>
                    <th style={{ padding: "8px 6px", width: 90, textAlign: "right" }}>Error Ascendente</th>
                    <th style={{ padding: "8px 6px", width: 110 }}>Lectura Descendente</th>
                    <th style={{ padding: "8px 6px", width: 100 }}>Redondeo Descendente</th>
                    <th style={{ padding: "8px 6px", width: 115, textAlign: "right" }}>Lectura Corregida Descendente</th>
                    <th style={{ padding: "8px 6px", width: 90, textAlign: "right" }}>Error Descendente</th>
                  </tr>
                </thead>
                <tbody>
                  {linRows.map((r, idx) => {
                    const comp = computeLinearityRow(r, eInterval);
                    const ascErrStr = comp.ascError !== null ? (comp.ascError >= 0 ? `+${comp.ascError.toFixed(0)}` : comp.ascError.toFixed(0)) : "-";
                    const descErrStr = comp.descError !== null ? (comp.descError >= 0 ? `+${comp.descError.toFixed(0)}` : comp.descError.toFixed(0)) : "-";
                    const ascOk = comp.ascError !== null ? Math.abs(comp.ascError) <= comp.emt : true;
                    const descOk = comp.descError !== null ? Math.abs(comp.descError) <= comp.emt : true;

                    return (
                      <tr key={r.step} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="1"
                            placeholder="0"
                            value={r.pesas}
                            onChange={(e) => {
                              const copy = [...linRows];
                              copy[idx].pesas = e.target.value;
                              setLinRows(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16 }}
                          />
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="1"
                            placeholder="0"
                            value={r.auxLoad}
                            onChange={(e) => {
                              const copy = [...linRows];
                              copy[idx].auxLoad = e.target.value;
                              setLinRows(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16 }}
                          />
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="1"
                            placeholder="—"
                            value={r.ascIndication}
                            onChange={(e) => {
                              const copy = [...linRows];
                              copy[idx].ascIndication = e.target.value;
                              setLinRows(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16, fontWeight: 700 }}
                          />
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="1"
                            placeholder="ΔL"
                            value={r.ascDeltaL}
                            onChange={(e) => {
                              const copy = [...linRows];
                              copy[idx].ascDeltaL = e.target.value;
                              setLinRows(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16 }}
                          />
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                          {comp.ascCorrected !== null ? comp.ascCorrected.toLocaleString("es-AR") : "-"}
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: comp.ascError === null ? "inherit" : ascOk ? "#047857" : "#b91c1c" }}>
                          {ascErrStr}
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="1"
                            placeholder="—"
                            value={r.descIndication}
                            onChange={(e) => {
                              const copy = [...linRows];
                              copy[idx].descIndication = e.target.value;
                              setLinRows(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16, fontWeight: 700 }}
                          />
                        </td>
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="1"
                            placeholder="ΔL"
                            value={r.descDeltaL}
                            onChange={(e) => {
                              const copy = [...linRows];
                              copy[idx].descDeltaL = e.target.value;
                              setLinRows(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16 }}
                          />
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                          {comp.descCorrected !== null ? comp.descCorrected.toLocaleString("es-AR") : "-"}
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: comp.descError === null ? "inherit" : descOk ? "#047857" : "#b91c1c" }}>
                          {descErrStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: DICTAMEN FINAL & PATRONES */}
        {activeTab === "summary" && (
          <>
            {/* Control y Registro de Precintos Metrológicos (según requerimiento) */}
            <div className="card pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "1.2rem" }}>🔒</span>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Control y Registro de Precintos Metrológicos</h3>
                </div>
                <button
                  type="button"
                  className="btn btn-outline compact"
                  style={{ fontSize: "0.78rem" }}
                  onClick={() => {
                    setSeals((prev) => [
                      ...prev,
                      {
                        id: Date.now().toString(),
                        location: "",
                        code: "",
                        type: "Autoadhesivo (a)",
                        notes: ""
                      }
                    ]);
                  }}
                >
                  + Añadir Precinto
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(0,0,0,0.02)", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", width: "30%" }}>Ubicación del Precinto</th>
                      <th style={{ padding: "6px 8px", width: "25%" }}>N° de Precinto / Código</th>
                      <th style={{ padding: "6px 8px", width: "22%" }}>Tipo de Precinto</th>
                      <th style={{ padding: "6px 8px", width: "18%" }}>Observaciones</th>
                      <th style={{ padding: "6px 8px", width: 45, textAlign: "center" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seals.map((s, idx) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                        <td style={{ padding: "4px 8px" }}>
                          <input
                            type="text"
                            value={s.location}
                            placeholder="Ej. Indicador electrónico..."
                            onChange={(e) => {
                              const copy = [...seals];
                              copy[idx].location = e.target.value;
                              setSeals(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16 }}
                          />
                        </td>
                        <td style={{ padding: "4px 8px" }}>
                          <input
                            type="text"
                            value={s.code}
                            placeholder="Ej. 17741"
                            onChange={(e) => {
                              const copy = [...seals];
                              copy[idx].code = e.target.value;
                              setSeals(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16, fontWeight: 700 }}
                          />
                        </td>
                        <td style={{ padding: "4px 8px" }}>
                          <input
                            type="text"
                            value={s.type}
                            placeholder="Autoadhesivo (a)"
                            onChange={(e) => {
                              const copy = [...seals];
                              copy[idx].type = e.target.value;
                              setSeals(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16 }}
                          />
                        </td>
                        <td style={{ padding: "4px 8px" }}>
                          <input
                            type="text"
                            value={s.notes}
                            placeholder="Opcional"
                            onChange={(e) => {
                              const copy = [...seals];
                              copy[idx].notes = e.target.value;
                              setSeals(copy);
                            }}
                            style={{ width: "100%", padding: "5px 8px", borderRadius: 16 }}
                          />
                        </td>
                        <td style={{ padding: "4px 8px", textAlign: "center" }}>
                          <button
                            type="button"
                            className="btn ghost compact"
                            style={{ color: "#dc2626", padding: "4px 6px" }}
                            title="Eliminar precinto"
                            onClick={() => {
                              setSeals(seals.filter((_, i) => i !== idx));
                            }}
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

            {/* Weights Picker */}
            <div className="card pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Patrones Metrológicos Utilizados</h3>
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

            {/* Checklist de Aptitud de Ensayos */}
            <div className="card pad">
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>Resumen Metrológico de Ensayos</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "rgba(0,0,0,0.02)", borderRadius: 6 }}>
                  <span>📋 Inspección Visual & Precintos</span>
                  <span className={`badge ${inspOk ? "ok" : "prio-high"}`}>{inspOk ? "✓ Conforme" : "✗ No Cumple"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "rgba(0,0,0,0.02)", borderRadius: 6 }}>
                  <span>🎯 Puesta a Cero (4% Max)</span>
                  <span className={`badge ${zeroSettingOk ? "ok" : "prio-high"}`}>{zeroSettingOk ? "✓ Conforme" : "✗ No Cumple"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "rgba(0,0,0,0.02)", borderRadius: 6 }}>
                  <span>🎯 Movilidad (1.4d)</span>
                  <span className={`badge ${mobilityOk ? "ok" : "prio-high"}`}>{mobilityOk ? "✓ Conforme" : "✗ No Cumple"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "rgba(0,0,0,0.02)", borderRadius: 6 }}>
                  <span>🔁 Fidelidad / Repetibilidad</span>
                  <span className={`badge ${fidelityAllOk ? "ok" : "prio-high"}`}>{fidelityAllOk ? "✓ Conforme" : "✗ No Cumple"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "rgba(0,0,0,0.02)", borderRadius: 6 }}>
                  <span>📐 Excentricidad de Carga</span>
                  <span className={`badge ${eccOk ? "ok" : "prio-high"}`}>{eccOk ? "✓ Conforme" : "✗ No Cumple"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "rgba(0,0,0,0.02)", borderRadius: 6 }}>
                  <span>⚖️ Exactitud y Linealidad</span>
                  <span className={`badge ${linAllOk ? "ok" : "prio-high"}`}>{linAllOk ? "✓ Conforme" : "✗ No Cumple"}</span>
                </div>
              </div>
            </div>

            {/* Final Observations & Verdict */}
            <div className="card pad" style={{ borderLeft: allAssaysPass ? "4px solid #10b981" : "4px solid #ef4444" }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "1.1rem" }}>7. Dictamen Final y Emisión</h3>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: allAssaysPass ? "#047857" : "#b91c1c" }}>
                    Dictamen Técnico: {finalResult.toUpperCase()}
                  </div>
                  <small className="muted">
                    Incertidumbre expandida estimada U (k=2): <strong>{expandedUncertainty} {selectedEquipment?.unit}</strong>
                  </small>
                </div>
              </div>

              <label>
                Observaciones del Certificado
                <textarea
                  rows={3}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Notas metrológicas adicionales, estado del indicador, precintos colocados..."
                  style={{ width: "100%", borderRadius: 6, border: "1px solid var(--surface-border)", padding: 8 }}
                />
              </label>
            </div>
          </>
        )}

        {/* Wizard Footer Navigation Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
            paddingTop: 14,
            borderTop: "1px solid rgba(0,0,0,0.06)"
          }}
        >
          {activeTab !== "general" ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={goToPrevTab}
              style={{ fontWeight: 600 }}
            >
              ← Anterior: {tabLabels[tabOrder[tabOrder.indexOf(activeTab) - 1]]}
            </button>
          ) : (
            <div />
          )}

          {activeTab !== "summary" ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={goToNextTab}
              style={{ fontWeight: 700, padding: "8px 20px" }}
            >
              Siguiente: {tabLabels[tabOrder[tabOrder.indexOf(activeTab) + 1]]} →
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !selectedEquipment}
              style={{ fontWeight: 800, padding: "10px 28px", fontSize: "1rem" }}
            >
              {saving ? "Emitiendo Informe..." : "💾 Guardar y Emitir Certificado"}
            </button>
          )}
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
