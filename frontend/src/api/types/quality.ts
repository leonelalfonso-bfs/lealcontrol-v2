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
