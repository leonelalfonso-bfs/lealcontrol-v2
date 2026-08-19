export interface CctCategoryProposal {
  category: string;
  basicSalary: number;
  nonRemunerativeAmount: number;
  hourlyRate: number;
}

export interface CctAnalysisResult {
  cctNumber: string;
  unionName: string;
  effectivePeriod: string;
  percentageIncrease: number;
  summary: string;
  salaryScales: CctCategoryProposal[];
}

export interface InvoiceOcrItem {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  subtotal: number;
}

export interface InvoiceOcrResult {
  supplierName: string;
  supplierCuit: string;
  supplierTaxCondition: string;
  invoiceType: string;
  pointOfSale: number;
  invoiceNumber: number;
  issueDate: string;
  dueDate?: string;
  cae?: string;
  caeDueDate?: string;
  currency: string;
  exchangeRate: number;
  items: InvoiceOcrItem[];
  subtotal: number;
  vat21: number;
  vat105: number;
  vat27: number;
  iibbPerception: number;
  total: number;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = `Error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed.detail || parsed.title || parsed.message || message;
    } catch {
      message = errorText || message;
    }
    throw new Error(message);
  }

  return response.json();
}

export const automationApi = {
  async getStatus(): Promise<{ status: string; message: string }> {
    return request<{ status: string; message: string }>("/api/v1/automation/status");
  },

  async analyzeCct(cctNumber: string, file?: File): Promise<CctAnalysisResult> {
    let base64Document: string | undefined;
    let mimeType: string | undefined;

    if (file) {
      base64Document = await fileToBase64(file);
      mimeType = file.type;
    }

    return request<CctAnalysisResult>("/api/v1/automation/cct/analyze", {
      method: "POST",
      body: JSON.stringify({
        cctNumber,
        base64Document,
        mimeType
      })
    });
  },

  async extractInvoiceOcr(file: File): Promise<InvoiceOcrResult> {
    const base64Document = await fileToBase64(file);
    const mimeType = file.type || "application/pdf";

    return request<InvoiceOcrResult>("/api/v1/automation/invoice/ocr", {
      method: "POST",
      body: JSON.stringify({
        base64Document,
        mimeType
      })
    });
  },

  async getDiagnostic(): Promise<LealDiagnosticReport> {
    return request<LealDiagnosticReport>("/api/v1/automation/diagnostic");
  }
};

export interface DiagnosticItem {
  id: string;
  level: "critical" | "warning" | "info" | "success";
  category: string;
  title: string;
  description: string;
  impact: string;
  actionLabel: string;
  actionUrl: string;
}

export interface LealDiagnosticReport {
  generatedAtUtc: string;
  greeting: string;
  summary: string;
  healthScore: string;
  totalIssuesCount: number;
  items: DiagnosticItem[];
}
