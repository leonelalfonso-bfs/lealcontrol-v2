const PLACEHOLDER = /^(empresa|leal control|leal control erp( s\.?a\.?)?)$/i;

export function isGenericCompanyLabel(value?: string | null): boolean {
  const text = value?.trim() ?? "";
  return text.length === 0 || PLACEHOLDER.test(text);
}

export function tenantTitle(tenant: { legalName?: string | null; tradeName?: string | null }): string {
  const trade = tenant.tradeName?.trim();
  const legal = tenant.legalName?.trim();
  if (trade && !isGenericCompanyLabel(trade)) return trade;
  if (legal && !isGenericCompanyLabel(legal)) return legal;
  return trade || legal || "Empresa";
}

export function tenantLegalLine(tenant: { legalName?: string | null; tradeName?: string | null }): string | null {
  const title = tenantTitle(tenant);
  const legal = tenant.legalName?.trim();
  if (!legal || isGenericCompanyLabel(legal) || legal.toLowerCase() === title.toLowerCase()) return null;
  return legal;
}
