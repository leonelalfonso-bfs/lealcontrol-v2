/** Etiquetas en español para estados y catálogos del SGC / Metrología (códigos API sin cambio). */

export function labelOf(map: Record<string, string>, value?: string | null, fallback?: string): string {
  if (value == null || value === "") return fallback ?? "—";
  return map[value] ?? fallback ?? value;
}

export const QUALITY_DOC_STATUS: Record<string, string> = {
  Draft: "Borrador",
  InReview: "En revisión",
  Approved: "Aprobado",
  Current: "Vigente",
  Obsolete: "Obsoleto",
  Archived: "Archivado"
};

export const QUALITY_DOC_TYPE: Record<string, string> = {
  Manual: "Manual",
  Procedure: "Procedimiento",
  Instruction: "Instructivo",
  RecordTemplate: "Registro",
  External: "Externo"
};

export const METROLOGY_REPORT_STATUS: Record<string, string> = {
  Draft: "Borrador",
  Issued: "Emitido",
  Superseded: "Sustituido"
};

export const METROLOGY_VERDICT: Record<string, string> = {
  Approved: "Apto",
  Rejected: "No apto",
  ConditionallyApproved: "Apto condicional",
  Apto: "Apto",
  "No Apto": "No apto",
  "Apto con Observaciones": "Apto con observaciones",
  NoApto: "No apto",
  Condicional: "Condicional"
};

export const COMPLAINT_CHANNEL: Record<string, string> = {
  Email: "Correo",
  Phone: "Teléfono",
  InPerson: "Presencial",
  Web: "Web",
  Other: "Otro"
};

export const EQUIPMENT_KIND: Record<string, string> = {
  Truck: "Camión",
  Trailer: "Acoplado",
  Forklift: "Autoelevador",
  Other: "Otro",
  Weight: "Pesa",
  Thermometer: "Termómetro"
};

export const CHECK_RESULT: Record<string, string> = {
  Pass: "Apto",
  Fail: "No apto",
  Conditional: "Condicional"
};

export const FREQUENCY_LABEL: Record<string, string> = {
  Monthly: "Mensual",
  Quarterly: "Trimestral",
  Semiannual: "Semestral",
  Annual: "Anual",
  Yearly: "Anual",
  Weekly: "Semanal",
  Daily: "Diaria"
};

/** Tipos de registro en el hub operativo (códigos internos → etiqueta UI). */
export const RECORD_KIND: Record<string, string> = {
  Attachment: "Adjunto",
  Structured: "Estructurado",
  Generated: "Generado",
  Linked: "Vinculado"
};

export const INDICATOR_STATUS: Record<string, string> = {
  Active: "Activo",
  Inactive: "Inactivo"
};

export const INDICATOR_DIRECTION: Record<string, string> = {
  HigherIsBetter: "Mayor es mejor",
  LowerIsBetter: "Menor es mejor",
  Exact: "Exacto"
};

export const METROLOGY_OPERATION: Record<string, string> = {
  CAL: "Calibración",
  VPE: "Verificación periódica",
  VPR: "Verificación primitiva",
  VPO: "Verificación posterior a la reparación",
  // Legacy aliases
  Calibration: "Calibración",
  PostRepair: "Verificación posterior a la reparación",
  PeriodicVerification: "Verificación periódica",
  InitialVerification: "Verificación primitiva"
};

export const INDICATOR_TYPE: Record<string, string> = {
  Digital: "Digital",
  Analog: "Analógico",
  Analogue: "Analógico"
};

export const LOG_KIND_LABEL: Record<string, string> = {
  C: "Calibración",
  V: "Verificación",
  MP: "Mant. preventivo",
  MC: "Mant. correctivo",
  Baja: "Baja"
};

export const EQUIPMENT_STATUS: Record<string, string> = {
  Active: "Activo",
  OutOfService: "Fuera de servicio",
  Retired: "Baja",
  Maintenance: "Mantenimiento",
  Valid: "Vigente",
  Expired: "Vencido",
  Cancelled: "Anulado"
};

export const GENERIC_RECORD_STATUS: Record<string, string> = {
  Draft: "Borrador",
  Open: "Abierta",
  Closed: "Cerrada",
  Cancelled: "Anulada",
  Active: "Activo",
  Inactive: "Inactivo",
  Completed: "Completada",
  Pending: "Pendiente",
  Approved: "Aprobado",
  Issued: "Emitido",
  Superseded: "Sustituido",
  Received: "Recibida",
  Suspended: "Suspendida",
  Authorized: "Autorizada",
  Done: "Hecho",
  Planned: "Planificada",
  Ended: "Finalizada"
};

export const EFFECTIVENESS_RESULT: Record<string, string> = {
  Pending: "Pendiente",
  Effective: "Eficaz",
  NotEffective: "No eficaz"
};

export const NC_ORIGIN: Record<string, string> = {
  Internal: "Interno",
  Complaint: "Queja",
  Audit: "Auditoría",
  Customer: "Cliente",
  Other: "Otro"
};

export const NC_KIND: Record<string, string> = {
  NonConformity: "NC",
  NonConformingWork: "TNC",
  Risk: "Riesgo",
  Opportunity: "OM"
};

export const AUDIT_STATUS: Record<string, string> = {
  Planned: "Programada",
  InProgress: "En curso",
  Reported: "Informada",
  Closed: "Cerrada",
  Cancelled: "Anulada"
};
