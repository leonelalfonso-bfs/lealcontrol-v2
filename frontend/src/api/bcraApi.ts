export interface BcraEntityDebt {
  entity: string;
  situation: number;
  amountThousands: number;
  daysOverdue: number;
  isJudicialProcess: boolean;
}

export interface BcraCreditReport {
  cuit: string;
  legalName: string;
  worstSituation: number;
  situationDescription: string;
  creditRating: "A" | "B" | "C" | "D";
  commercialRecommendation: string;
  totalDebtThousands: number;
  totalDebtPesos: number;
  entitiesCount: number;
  rejectedChequesCount: number;
  rejectedChequesAmount: number;
  hasJudicialProcess: boolean;
  period: string;
  entities: BcraEntityDebt[];
}

export const bcraApi = {
  async getReport(cuit: string): Promise<BcraCreditReport> {
    const cleanCuit = cuit.replace(/\D/g, "");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("leal_token") || localStorage.getItem("leal_superadmin_token");
      const tenantId = localStorage.getItem("leal_tenant_id");
      if (token) headers.Authorization = `Bearer ${token}`;
      if (tenantId) headers["X-Tenant-Id"] = tenantId;
    }
    const res = await fetch(`/api/v1/automation/bcra/${cleanCuit}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `Error ${res.status}` }));
      throw new Error(err.error || "No se pudo obtener el informe crediticio del BCRA.");
    }
    return res.json();
  }
};
