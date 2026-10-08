import type { ExpirationState, FleetDocType, MeterType, Vehicle, VehicleStatus, VehicleType } from "../api/types";

export const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: "Pickup", label: "Camioneta" },
  { value: "Van", label: "Utilitario" },
  { value: "Car", label: "Auto" },
  { value: "Truck", label: "Camión" },
  { value: "TractorUnit", label: "Tractor" },
  { value: "SemiTrailer", label: "Semirremolque" },
  { value: "Trailer", label: "Acoplado" },
  { value: "Forklift", label: "Autoelevador" },
  { value: "Other", label: "Otro" }
];

export const VEHICLE_STATUSES: { value: VehicleStatus; label: string }[] = [
  { value: "Active", label: "Disponible" },
  { value: "InMaintenance", label: "En taller" },
  { value: "OutOfService", label: "Fuera de servicio" },
  { value: "Sold", label: "Dada de baja" }
];

export const METER_TYPES: { value: MeterType; label: string }[] = [
  { value: "Kilometers", label: "Kilómetros" },
  { value: "Hours", label: "Horas de uso" },
  { value: "Both", label: "Kilómetros y horas" },
  { value: "None", label: "No se mide" }
];

export const DOC_TYPES: { value: FleetDocType; label: string }[] = [
  { value: "VtvRto", label: "VTV / RTO" },
  { value: "InsurancePolicy", label: "Seguro" },
  { value: "Ruta", label: "RUTA" },
  { value: "FireExtinguisher", label: "Matafuego" },
  { value: "ForkliftCertification", label: "Habilitación autoelevador" },
  { value: "GreenCard", label: "Cédula" },
  { value: "GncCard", label: "Oblea GNC" },
  { value: "Senasa", label: "SENASA" },
  { value: "Other", label: "Otro" }
];

const find = <T extends string>(list: { value: T; label: string }[], value: T) => list.find((x) => x.value === value)?.label ?? value;

export const vehicleTypeLabel = (t: VehicleType) => find(VEHICLE_TYPES, t);
export const vehicleStatusLabel = (s: VehicleStatus) => find(VEHICLE_STATUSES, s);
export const meterTypeLabel = (m: MeterType) => find(METER_TYPES, m);
export const docTypeLabel = (d: FleetDocType) => find(DOC_TYPES, d);

/** Medición sugerida al elegir el tipo de unidad. */
export function defaultMeterFor(type: VehicleType): MeterType {
  if (type === "Forklift") return "Hours";
  if (type === "SemiTrailer" || type === "Trailer") return "None";
  return "Kilometers";
}

export const usesKm = (m: MeterType) => m === "Kilometers" || m === "Both";
export const usesHours = (m: MeterType) => m === "Hours" || m === "Both";

export function meterText(v: Pick<Vehicle, "meterType" | "currentKilometers" | "currentEngineHours">): string {
  const parts: string[] = [];
  if (usesKm(v.meterType)) parts.push(`${v.currentKilometers.toLocaleString("es-AR")} km`);
  if (usesHours(v.meterType)) parts.push(`${v.currentEngineHours.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`);
  return parts.join(" · ") || "—";
}

export const stateLabel: Record<ExpirationState, string> = {
  Ok: "Al día",
  DueSoon: "Por vencer",
  Expired: "Vencido",
  Missing: "Sin cargar"
};

export const stateBadge: Record<ExpirationState, string> = {
  Ok: "ok",
  DueSoon: "warn",
  Expired: "prio-high",
  Missing: "prio-high"
};

/** "dd/mm/aaaa" desde "aaaa-mm-dd" (fecha civil, sin husos). */
export const civilDate = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function daysText(days?: number | null): string {
  if (days == null) return "";
  if (days < 0) return `venció hace ${-days} día${days === -1 ? "" : "s"}`;
  if (days === 0) return "vence hoy";
  return `en ${days} día${days === 1 ? "" : "s"}`;
}

/** Documentación obligatoria por tipo (la misma regla que el servidor). */
export function requiredDocuments(type: VehicleType): FleetDocType[] {
  switch (type) {
    case "Truck":
    case "TractorUnit":
      return ["VtvRto", "InsurancePolicy", "Ruta"];
    case "Pickup":
    case "Van":
    case "Car":
    case "SemiTrailer":
    case "Trailer":
      return ["VtvRto", "InsurancePolicy"];
    case "Forklift":
      return ["ForkliftCertification"];
    default:
      return [];
  }
}
