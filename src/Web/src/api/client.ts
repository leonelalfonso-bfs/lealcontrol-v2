import type {
  Activity,
  CustomerDetail,
  CustomerSummary,
  CustomerWrite,
  Lead,
  Opportunity,
  Paged
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
    throw new Error(problem?.detail ?? problem?.title ?? `Error ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  listCustomers: (search = "") =>
    request<Paged<CustomerSummary>>(`/api/v1/crm/customers?page=1&pageSize=50&search=${encodeURIComponent(search)}`),
  getCustomer: (id: string) => request<CustomerDetail>(`/api/v1/crm/customers/${id}`),
  createCustomer: (body: CustomerWrite) =>
    request<CustomerDetail>("/api/v1/crm/customers", { method: "POST", body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: CustomerWrite) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  addLocation: (id: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/locations`, { method: "POST", body: JSON.stringify(body) }),
  addContact: (id: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/contacts`, { method: "POST", body: JSON.stringify(body) }),
  upsertRate: (id: string, body: object) =>
    request<CustomerDetail>(`/api/v1/crm/customers/${id}/fiscal-rates`, { method: "PUT", body: JSON.stringify(body) }),
  timeline: (id: string) => request<Activity[]>(`/api/v1/crm/customers/${id}/timeline`),
  opportunities: (id: string) => request<Opportunity[]>(`/api/v1/crm/customers/${id}/opportunities`),
  logActivity: (body: object) =>
    request<Activity>("/api/v1/crm/activities", { method: "POST", body: JSON.stringify(body) }),
  listLeads: () => request<Lead[]>("/api/v1/crm/leads"),
  captureLead: (body: object) =>
    request<Lead>("/api/v1/crm/leads", { method: "POST", body: JSON.stringify(body) }),
  convertLead: (id: string, body: CustomerWrite) =>
    request<CustomerDetail>(`/api/v1/crm/leads/${id}/convert`, { method: "POST", body: JSON.stringify(body) }),
  listOpportunities: () => request<Opportunity[]>("/api/v1/crm/opportunities"),
  openOpportunity: (body: object) =>
    request<Opportunity>("/api/v1/crm/opportunities", { method: "POST", body: JSON.stringify(body) }),
  moveOpportunity: (id: string, stage: string) =>
    request<Opportunity>(`/api/v1/crm/opportunities/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ stage })
    })
};
