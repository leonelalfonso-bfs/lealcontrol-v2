export type QualityDocumentType =
  | "Manual"
  | "Procedure"
  | "Instruction"
  | "RecordTemplate"
  | "External";

export type QualityDocumentStatus =
  | "Draft"
  | "InReview"
  | "Approved"
  | "Current"
  | "Obsolete"
  | "Archived";

export interface QualityDocumentVersionSummary {
  id: string;
  version: number;
  status: string;
  publishedFileId?: string | null;
  sourceFileId?: string | null;
  elaboratedBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  effectiveFrom?: string | null;
}

export interface QualityDocumentTreeNode {
  id: string;
  code: string;
  displayCode: string;
  type: QualityDocumentType | string;
  title: string;
  status: QualityDocumentStatus | string;
  recordKind?: string | null;
  linkedModule?: string | null;
  iso17025Clauses?: string;
  nextReviewDate?: string | null;
  reviewPeriodMonths?: number;
  currentVersion?: QualityDocumentVersionSummary | null;
  children: QualityDocumentTreeNode[];
}

export interface QualityDashboard {
  totalDocuments: number;
  byType: Record<string, number>;
  current: number;
  draft: number;
  reviewDue: number;
  overdueReview: number;
  openNonConformities?: number;
  overdueComplaints?: number;
  authorizationsExpiring?: number;
  calibrationsDueSoon?: number;
  calibrationsOverdue?: number;
  maintenanceOverdue?: number;
  alerts?: {
    documentsReview?: Array<{
      code: string;
      displayCode?: string;
      title: string;
      status: string;
      nextReviewDate?: string | null;
      overdue?: boolean;
    }>;
    nonConformities?: Array<{
      id: string;
      number: string;
      kind: string;
      status: string;
      description?: string;
      dueDate?: string | null;
      href?: string;
    }>;
    complaints?: Array<{
      id: string;
      number: string;
      partyName: string;
      status: string;
      currentDueAt?: string | null;
      href?: string;
    }>;
    authorizations?: Array<{
      id: string;
      number: string;
      personName: string;
      methodDocumentCode: string;
      validUntil?: string | null;
      href?: string;
    }>;
    calibrations?: Array<{
      id: string;
      code: string;
      description?: string;
      expirationDate?: string | null;
      status?: string;
      overdue?: boolean;
      href?: string | null;
    }>;
    maintenance?: Array<{
      id: string;
      number: string;
      equipmentCode?: string;
      activity?: string;
      nextDue?: string | null;
      href?: string;
    }>;
  };
  clauseMatrix?: Array<{
    clause: string;
    status: "ok" | "gap" | string;
    documents: string[];
  }>;
}

export interface QualityAuditEventRow {
  id: string;
  eventType: string;
  summary: string;
  beforeJson: string;
  afterJson: string;
  performedByUserId?: string | null;
  performedByName?: string;
  occurredAtUtc: string;
}

export interface QualityDocumentDetail {
  document: {
    id: string;
    code: string;
    displayCode: string;
    type: string;
    title: string;
    parentId?: string | null;
    status: string;
    currentVersionId?: string | null;
    reviewPeriodMonths: number;
    nextReviewDate?: string | null;
    ownerRole?: string;
    iso17025Clauses?: string;
    recordKind?: string | null;
    linkedModule?: string | null;
    externalSource?: string | null;
    externalUrl?: string | null;
  };
  versions: Array<{
    id: string;
    version: number;
    publishedFileId?: string | null;
    sourceFileId?: string | null;
    changeSummary?: string;
    elaboratedBy?: string;
    elaboratedAt?: string | null;
    reviewedBy?: string;
    reviewedAt?: string | null;
    approvedBy?: string;
    approvedAt?: string | null;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    status: string;
  }>;
  children: Array<{
    id: string;
    code: string;
    displayCode: string;
    title: string;
    type: string;
    status: string;
    recordKind?: string | null;
  }>;
}

export interface QualityConfidentialityCommitment {
  id: string;
  kind: "Internal" | "External" | string;
  recordCode: string;
  personUserId?: string | null;
  personName: string;
  personEmail?: string;
  personRole?: string;
  organization?: string;
  signedAt: string;
  signedFileId?: string | null;
  notes?: string;
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityIndicatorValue {
  id: string;
  indicatorId: string;
  period: string;
  value: number;
  notes?: string;
  recordedBy?: string;
  recordedAtUtc: string;
}

export interface QualityIndicator {
  id: string;
  recordCode: string;
  name: string;
  objective?: string;
  formula?: string;
  targetValue?: number | null;
  targetUnit?: string;
  direction?: string;
  responsible?: string;
  frequency?: string;
  notes?: string;
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  latestPeriod?: string | null;
  latestValue?: number | null;
  compliance?: "Met" | "Below" | string | null;
  values?: QualityIndicatorValue[];
}

export interface QualityInstitutionalNote {
  id: string;
  recordCode: string;
  subject: string;
  body?: string;
  issuedBy?: string;
  audience?: string;
  issuedAt: string;
  fileId?: string | null;
  notes?: string;
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityComplaint {
  id: string;
  recordCode: string;
  number: string;
  receivedAt: string;
  channel: string;
  partyName: string;
  partyContact?: string;
  description: string;
  isValid?: boolean | null;
  validatedAt?: string | null;
  validationNotes?: string;
  investigation?: string;
  actions?: string;
  responsible?: string;
  communicatedAt?: string | null;
  closedAt?: string | null;
  linkedNonConformityId?: string | null;
  evidenceFileId?: string | null;
  notes?: string;
  status: string;
  registerDueAt: string;
  validateDueAt: string;
  investigateDueAt: string;
  closeDueAt: string;
  currentDueAt?: string | null;
  isOverdue?: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export type QualityNonConformityKind =
  | "NonConformity"
  | "NonConformingWork"
  | "Risk"
  | "Opportunity"
  | string;

export interface QualityNonConformity {
  id: string;
  recordCode: string;
  number: string;
  kind: QualityNonConformityKind;
  origin?: string;
  detectedAt: string;
  description: string;
  immediateAction?: string;
  impactOnPreviousResults?: boolean;
  customerNotified?: boolean;
  rootCauseMethod?: string;
  rootCause?: string;
  correctiveAction?: string;
  responsible?: string;
  dueDate?: string | null;
  newDueDate?: string | null;
  effectivenessCheck?: string;
  effectivenessResult?: string;
  closedAt?: string | null;
  status: string;
  probability?: number | null;
  impact?: number | null;
  level?: number | null;
  controls?: string;
  residualLevel?: number | null;
  sourceComplaintId?: string | null;
  evidenceFileId?: string | null;
  notes?: string;
  effectiveDueAt?: string | null;
  isOverdue?: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export type QualityInternalAuditStatus =
  | "Planned"
  | "InProgress"
  | "Reported"
  | "Closed"
  | "Cancelled"
  | string;

export interface QualityInternalAudit {
  id: string;
  recordCode: string;
  number: string;
  programYear: number;
  plannedDate: string;
  executedDate?: string | null;
  scope: string;
  clauses?: string;
  auditor: string;
  auditee?: string;
  objectives?: string;
  findingsSummary?: string;
  conclusions?: string;
  recommendations?: string;
  checklistNotes?: string;
  planFileId?: string | null;
  reportFileId?: string | null;
  checklistFileId?: string | null;
  status: QualityInternalAuditStatus;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityTrainingPlanItem {
  id: string;
  recordCode: string;
  number: string;
  programYear: number;
  topic: string;
  targetRoles?: string;
  plannedDate: string;
  doneDate?: string | null;
  effectivenessCheck?: string;
  status: string;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityPersonnelAuthorization {
  id: string;
  recordCode: string;
  number: string;
  userId: string;
  personName: string;
  methodDocumentCode: string;
  methodTitle?: string;
  trainingEvidence?: string;
  supervisedBy?: string;
  authorizedByUserId?: string | null;
  authorizedByName?: string;
  authorizedAt?: string | null;
  validUntil?: string | null;
  evidenceFileId?: string | null;
  status: string;
  notes?: string;
  isExpired?: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityCompetenceReview {
  id: string;
  recordCode: string;
  number: string;
  userId: string;
  personName: string;
  reviewYear: number;
  evaluator?: string;
  technicalScore?: number | null;
  personalScore?: number | null;
  conclusions?: string;
  status: string;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityRoleAssignment {
  id: string;
  recordCode: string;
  number: string;
  role: string;
  userId: string;
  personName: string;
  substituteUserId?: string | null;
  substituteName?: string;
  since: string;
  until?: string | null;
  status: string;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityPg06Summary {
  code: string;
  title: string;
  recordKind?: string;
  generatedAtUtc: string;
  trainingOpen?: number;
  authorizationsExpiringSoon?: number;
  competenceDraft?: number;
  roleActive?: number;
  counts?: { r01: number; r02: number; r03: number; r04: number };
}

export interface QualitySupplierEvaluation {
  id: string;
  recordCode: string;
  number: string;
  supplierId: string;
  supplierName: string;
  supplierDocument?: string;
  serviceScope?: string;
  evaluatedAt: string;
  score?: number | null;
  criteriaNotes?: string;
  strengths?: string;
  weaknesses?: string;
  approvedBy?: string;
  approvedAt?: string | null;
  validUntil?: string | null;
  evidenceFileId?: string | null;
  status: string;
  notes?: string;
  isExpired?: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualitySupplierPerformanceReview {
  id: string;
  recordCode: string;
  number: string;
  supplierId: string;
  supplierName: string;
  evaluationId?: string | null;
  period?: string;
  reviewDate: string;
  score?: number | null;
  qualityScore?: number | null;
  deliveryScore?: number | null;
  serviceScore?: number | null;
  comments?: string;
  reviewedBy?: string;
  evidenceFileId?: string | null;
  status: string;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityEnabledSupplierRow {
  supplierId: string;
  supplierName: string;
  supplierDocument?: string;
  evaluationId: string;
  evaluationNumber: string;
  score?: number | null;
  approvedAt?: string | null;
  validUntil?: string | null;
  serviceScope?: string;
  lastPerformanceScore?: number | null;
  lastPerformancePeriod?: string | null;
  lastPerformanceDate?: string | null;
}

export interface QualityPg05Summary {
  code: string;
  title: string;
  evaluationsDraft?: number;
  evaluationsApproved?: number;
  performanceDraft?: number;
  enabledSuppliers?: number;
  generatedAtUtc: string;
  counts?: { r01: number; r02: number; r03: number };
}

export interface QualityManagementReview {
  id: string;
  recordCode: string;
  number: string;
  programYear: number;
  reviewDate: string;
  attendees?: string;
  inputsSnapshotJson?: string;
  inputsSnapshot?: unknown;
  inputsNotes?: string;
  decisions?: string;
  actions?: string;
  followUp?: string;
  evidenceFileId?: string | null;
  status: string;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualitySatisfactionSurvey {
  id: string;
  recordCode: string;
  number: string;
  calibrationReportId?: string | null;
  certificateNumber?: string;
  customerId?: string | null;
  customerName: string;
  surveyDate: string;
  channel?: string;
  scorePunctuality?: number | null;
  scoreQuality?: number | null;
  scoreCommunication?: number | null;
  scoreOverall?: number | null;
  averageScore?: number | null;
  comments?: string;
  answersJson?: string;
  evidenceFileId?: string | null;
  status: string;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityEquipment {
  id: string;
  code: string;
  kind: string;
  description?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  plate?: string;
  parentEquipmentId?: string | null;
  fleetVehicleId?: string | null;
  location?: string;
  status: string;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityIntermediateCheck {
  id: string;
  recordCode: string;
  number: string;
  checkDate: string;
  weightUsed?: string;
  instrument?: string;
  equipmentId?: string | null;
  readings?: string;
  result?: string;
  responsible?: string;
  evidenceFileId?: string | null;
  status: string;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityMaintenancePlanItem {
  id: string;
  recordCode: string;
  number: string;
  equipmentId: string;
  equipmentCode?: string;
  equipmentDescription?: string;
  activity: string;
  frequency: string;
  nextDue?: string | null;
  lastDone?: string | null;
  responsible?: string;
  status: string;
  isOverdue?: boolean;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityEquipmentLogEntry {
  id: string;
  recordCode: string;
  number: string;
  assetSource: string;
  assetId: string;
  assetCode: string;
  assetDescription?: string;
  eventDate: string;
  kind: string;
  description?: string;
  certificateNumber?: string;
  verdict?: string;
  approvedByTechnicalDirector?: boolean;
  responsible?: string;
  evidenceFileId?: string | null;
  status: string;
  notes?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface QualityEquipmentLogListResponse {
  code: string;
  title: string;
  recordKind?: string;
  generatedAtUtc: string;
  countsByKind: {
    C: number;
    V: number;
    MP: number;
    MC: number;
    Baja: number;
  };
  totalActive: number;
  rows: QualityEquipmentLogEntry[];
}

export interface QualityPg14Summary {
  code: string;
  title: string;
  generatedAtUtc: string;
  equipmentActive: number;
  checksDraft: number;
  maintenanceDue: number;
  maintenanceOverdue: number;
  logEntries?: number;
  weightsCount?: number;
  instrumentsCount?: number;
}

/** PG14-R04 — listado unificado pesas + instrumentos + auxiliares */
export interface QualityPg14UnifiedAsset {
  id: string;
  source: "StandardWeight" | "Instrument" | "QualityEquipment" | string;
  code: string;
  kind: string;
  description: string;
  brandOrManufacturer?: string;
  model?: string;
  serialNumber?: string;
  certificateNumber?: string;
  calibrationDate?: string | null;
  expirationDate?: string | null;
  status: string;
  extra?: string | null;
  deepLinkPath?: string | null;
  isExpired?: boolean;
}

export interface QualityPg14R04Response {
  code: string;
  title: string;
  recordKind?: string;
  generatedAtUtc: string;
  counts: {
    weights: number;
    instruments: number;
    auxiliaries: number;
    total: number;
  };
  rows: QualityPg14UnifiedAsset[];
}

/** PG14-R03 — programa de calibraciones */
export interface QualityPg14CalibrationProgramRow extends QualityPg14UnifiedAsset {
  daysUntilExpiry?: number | null;
  isDueSoon?: boolean;
}

export interface QualityPg14R03Response {
  code: string;
  title: string;
  recordKind?: string;
  generatedAtUtc: string;
  summary: {
    expired: number;
    dueSoon: number;
    ok: number;
    total: number;
  };
  rows: QualityPg14CalibrationProgramRow[];
}
