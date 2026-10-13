import type { CredentialType, ExpirationState, FleetDocType, FleetMember, MaintenanceStatus, MaintenanceType, MeterType, ServiceOrderStatus, Vehicle, VehicleStatus, VehicleType } from "../api/types";

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

export const CREDENTIAL_TYPES: { value: CredentialType; label: string }[] = [
  { value: "DrivingLicense", label: "Licencia de conducir" },
  { value: "Linti", label: "LINTI" },
  { value: "ForkliftOperator", label: "Carnet de autoelevadorista" },
  { value: "MedicalFitness", label: "Apto médico" },
  { value: "Other", label: "Otra" }
];

export const credentialLabel = (t: CredentialType) => CREDENTIAL_TYPES.find((x) => x.value === t)?.label ?? t;

/** Credenciales obligatorias según los roles (la misma regla que el servidor). */
export function requiredCredentials(m: Pick<FleetMember, "isDriver" | "isCargoDriver" | "isForkliftOperator">): CredentialType[] {
  const list: CredentialType[] = [];
  if (m.isDriver || m.isCargoDriver) list.push("DrivingLicense");
  if (m.isCargoDriver) list.push("Linti");
  if (m.isForkliftOperator) list.push("ForkliftOperator");
  return list;
}

export function rolesText(m: Pick<FleetMember, "isDriver" | "isCargoDriver" | "isForkliftOperator" | "isTechnician">): string {
  return [
    m.isCargoDriver ? "Chofer de cargas" : m.isDriver ? "Chofer" : null,
    m.isForkliftOperator ? "Autoelevadorista" : null,
    m.isTechnician ? "Técnico" : null
  ].filter(Boolean).join(" · ");
}

export const MAINTENANCE_TYPES: { value: MaintenanceType; label: string }[] = [
  { value: "Preventive", label: "Service / preventivo" },
  { value: "Corrective", label: "Reparación" },
  { value: "Urgent", label: "Urgencia" },
  { value: "Inspection", label: "Inspección" }
];

export const MAINTENANCE_STATUSES: { value: MaintenanceStatus; label: string }[] = [
  { value: "Completed", label: "Hecho" },
  { value: "InProgress", label: "En taller ahora" },
  { value: "Scheduled", label: "Programado" },
  { value: "Cancelled", label: "Cancelado" }
];

export const maintenanceTypeLabel = (t: MaintenanceType) => find(MAINTENANCE_TYPES, t);
export const maintenanceStatusLabel = (s: MaintenanceStatus) => find(MAINTENANCE_STATUSES, s);

export const maintenanceStatusBadge: Record<MaintenanceStatus, string> = {
  Completed: "ok",
  InProgress: "warn",
  Scheduled: "",
  Cancelled: "off"
};

/** Estado de un service del plan ("Vencido" se lee como service pasado). */
export const serviceStateLabel: Record<ExpirationState, string> = {
  Ok: "Al día",
  DueSoon: "Próximo",
  Expired: "Vencido",
  Missing: "Sin datos"
};

/** "cada 10.000 km · 250 h · 365 días" */
export function intervalText(p: { intervalKm?: number | null; intervalHours?: number | null; intervalDays?: number | null }): string {
  const parts: string[] = [];
  if (p.intervalKm) parts.push(`${p.intervalKm.toLocaleString("es-AR")} km`);
  if (p.intervalHours) parts.push(`${p.intervalHours.toLocaleString("es-AR")} h`);
  if (p.intervalDays) parts.push(`${p.intervalDays.toLocaleString("es-AR")} días`);
  return parts.length ? `cada ${parts.join(" o ")}` : "—";
}

export const money = (value?: number | null) =>
  value == null ? "—" : value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export const num = (value?: number | null, decimals = 0) =>
  value == null ? "—" : value.toLocaleString("es-AR", { maximumFractionDigits: decimals });

export const SERVICE_ORDER_STATUSES: { value: ServiceOrderStatus; label: string }[] = [
  { value: "Pending", label: "Sin fecha" },
  { value: "Scheduled", label: "Programada" },
  { value: "InProgress", label: "En curso" },
  { value: "Completed", label: "Terminada" },
  { value: "Cancelled", label: "Cancelada" }
];
export const serviceOrderStatusLabel = (s: ServiceOrderStatus) => find(SERVICE_ORDER_STATUSES, s);
export const serviceOrderStatusBadge: Record<ServiceOrderStatus, string> = {
  Pending: "warn",
  Scheduled: "",
  InProgress: "warn",
  Completed: "ok",
  Cancelled: "off"
};

/** Argentina es UTC-3 todo el año: los horarios se cargan y muestran en esa hora. */
const AR_OFFSET_MS = -3 * 3600_000;

/** "2026-10-05T08:00" (hora de Argentina) desde un instante ISO. */
export function toArLocalInput(iso?: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + AR_OFFSET_MS).toISOString().slice(0, 16);
}

/** Instante ISO con huso desde "2026-10-05T08:00" (hora de Argentina). */
export const fromArLocalInput = (local: string) => (local ? `${local}:00-03:00` : null);

/** "aaaa-mm-dd" del día de Argentina de un instante. */
export const arDay = (iso: string) => toArLocalInput(iso).slice(0, 10);

/** "08:00" de Argentina. */
export const arTime = (iso?: string | null) => (iso ? toArLocalInput(iso).slice(11, 16) : "");

/** "lun 05/10 08:00 → 18:00" o, si cambia el día, con las dos fechas. */
export function rangeText(start?: string | null, end?: string | null): string {
  if (!start || !end) return "Sin fecha";
  const a = toArLocalInput(start);
  const b = toArLocalInput(end);
  const day = (x: string) => civilDate(x.slice(0, 10)).slice(0, 5);
  return a.slice(0, 10) === b.slice(0, 10)
    ? `${day(a)} ${a.slice(11)} → ${b.slice(11)}`
    : `${day(a)} ${a.slice(11)} → ${day(b)} ${b.slice(11)}`;
}
