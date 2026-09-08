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
