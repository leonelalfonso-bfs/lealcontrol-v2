/** Informe de báscula camionera (paquete Informes BFS): lo que carga el técnico y lo que calcula el sistema. */
export type TruckScaleVerdict = "Satisface" | "NoSatisface" | "NoEnsayado" | "NoAplica";
export type TruckScaleInspectionItem = { point: string; status: "OK" | "No OK" | "N/A"; observation?: string | null };
export type TruckScaleLoadStep = { load: number; weights: number; substitution: number; ascending: number; descending?: number | null };
export type TruckScaleEccentricity = { method: "apoyos" | "rodante"; load: number; positions: { position: string; reading: number }[]; rows?: string[] | null };
export type TruckScaleInput = {
  equipmentId: string; standard: "2307" | "25/2025"; serviceNumber: string; remitoNumber?: string | null; orderReference?: string | null; procedureCode: string;
  calibrationDate: string; nextCalibrationDate?: string | null; performedBy: string; modules: number; weightIds: string[];
  substitution?: { description: string; value: number } | null; inspection: TruckScaleInspectionItem[]; weighing: TruckScaleLoadStep[];
  repeatability?: { load: number; readings: number[] } | null; eccentricity?: TruckScaleEccentricity | null;
  zero?: { at4Percent?: boolean | null; at4PercentPlusE?: boolean | null; zeroErrorE?: number | null } | null;
  mobility: { load: number; reading: number; readingAfter: number }[]; observations: string[]; temperatureCelsius?: number | null; thermometerInstrumentId?: string | null;
};
export type TruckScaleWeightSet = { mass: number; quantity: number; identification: string; certificate: string; expiration?: string | null };
export type TruckScaleData = {
  standard: string; instrument: { max: number; e: number; d?: number | null; accuracyClass: string; unit: string; indication: string; supports: number; modules: number };
  weights: TruckScaleWeightSet[]; substitution?: { description: string; value: number } | null; inspection: TruckScaleInspectionItem[]; weighing: TruckScaleLoadStep[];
  repeatability?: { load: number; readings: number[] } | null; eccentricity?: TruckScaleEccentricity | null; zero?: TruckScaleInput["zero"]; mobility: TruckScaleInput["mobility"]; observations: string[];
};
export type TruckScaleEvaluation = {
  standard: string; standardShort: string; standardName: string; minCapacity: number; minCapacityRule: string; mpeBands: number[];
  requirements: { paragraph: string; name: string; key: string; verdict: TruckScaleVerdict }[];
  weighing: { load: number; weights: number; substitution: number; ascending: number; ascendingError: number; descending?: number | null; descendingError?: number | null; mpe: number; pass: boolean }[];
  repeatabilitySpread?: number | null; repeatabilityMpe?: number | null; eccentricityMpe?: number | null;
  eccentricity: { position: string; reading: number; error: number; pass: boolean }[];
  usesSubstitution: boolean; maxWeightsApplied: number; weightsFraction: number; requiredWeightsFraction: number; maxLoad: number; rangeFraction: number;
  totalStandardsMass: number; conforming: boolean; notTested: string[]; observations: string[]; warnings: string[];
};
export type TruckScaleReport = {
  id: string; number: string; reportStatus: string; approvedBy?: string | null; equipmentId: string; equipmentCode: string; equipmentDescription: string;
  customerId?: string | null; customerName: string; location: string; serviceNumber: string; remitoNumber?: string | null; orderReference?: string | null; procedureCode: string;
  calibrationDate: string; nextCalibrationDate?: string | null; performedBy: string; createdAtUtc: string; supersedesReportId?: string | null;
  equipment: {
    code: string; description: string; location: string; platformType: string; brand: string; model: string; serialNumber: string; indicator1Brand: string; indicator1Model: string;
    indicator1SerialNumber: string; approvalCode: string; platformApprovalCode: string; loadCellsCount: number; maxCapacity: number; verificationIntervalE: number; divisionD: number;
    accuracyClass: string; unit: string; indicationType: string;
  };
  input: TruckScaleInput; data: TruckScaleData; evaluation: TruckScaleEvaluation;
};
