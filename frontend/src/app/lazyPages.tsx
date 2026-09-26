import { Component, lazy, type ComponentType, type ErrorInfo, type ReactNode } from "react";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CHUNK_RELOAD_KEY = "lc:chunk-reload";

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Importing a module script failed|error loading dynamically imported module|502|503|504/i.test(
    msg
  );
}

async function loadWithRetry<T>(loader: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await loader();
    } catch (err) {
      last = err;
      if (i < attempts - 1) {
        await sleep(250 * (i + 1));
      }
    }
  }
  throw last;
}

/**
 * Lazy named export con reintento ante 502/red y un reload automático
 * (index.html viejo tras deploy que apunta a chunks que ya no existen / proxy caído).
 */
const named = <T extends Record<string, unknown>, K extends keyof T>(loader: () => Promise<T>, key: K) =>
  lazy(async () => {
    try {
      const mod = await loadWithRetry(loader);
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        /* ignore */
      }
      return { default: mod[key] as ComponentType<object> };
    } catch (err) {
      if (typeof window !== "undefined" && isChunkLoadError(err)) {
        try {
          const already = sessionStorage.getItem(CHUNK_RELOAD_KEY);
          if (!already) {
            sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
            window.location.reload();
            // Mantener Suspense pendiente hasta que recargue el documento.
            return await new Promise<{ default: ComponentType<object> }>(() => undefined);
          }
        } catch {
          /* sessionStorage bloqueado */
        }
      }
      throw err;
    }
  });

/** UI de recuperación si el chunk sigue fallando tras el reload automático. */
export class ChunkLoadErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || "Error de carga" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ChunkLoadErrorBoundary", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 48, textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ marginTop: 0 }}>No se pudo cargar el módulo</h2>
          <p style={{ color: "#64748b" }}>
            Suele pasar si hubo un deploy o un corte de red. Actualizá la página para recuperar la sesión.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              try {
                sessionStorage.removeItem(CHUNK_RELOAD_KEY);
              } catch {
                /* ignore */
              }
              window.location.reload();
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const LoginPage = named(() => import("../pages/LoginPage"), "LoginPage");
export const LandingPage = named(() => import("../pages/LandingPage"), "LandingPage");
export const CustomerDetailPage = named(() => import("../pages/CustomerDetailPage"), "CustomerDetailPage");
export const CustomerFormPage = named(() => import("../pages/CustomerFormPage"), "CustomerFormPage");
export const DirectoryPage = named(() => import("../pages/DirectoryPage"), "DirectoryPage");
export const CustomersPage = named(() => import("../pages/CustomersPage"), "CustomersPage");
export const HoyPage = named(() => import("../pages/HoyPage"), "HoyPage");
export const ExecutiveDashboardPage = named(() => import("../pages/ExecutiveDashboardPage"), "ExecutiveDashboardPage");
export const InventoryPage = named(() => import("../pages/InventoryPage"), "InventoryPage");
export const InventoryHelpPage = named(() => import("../pages/InventoryHelpPage"), "InventoryHelpPage");
export const InvoiceFormPage = named(() => import("../pages/InvoiceFormPage"), "InvoiceFormPage");
export const InvoicePrintPage = named(() => import("../pages/InvoicePrintPage"), "InvoicePrintPage");
export const InvoicesPage = named(() => import("../pages/InvoicesPage"), "InvoicesPage");
export const LeadsPage = named(() => import("../pages/LeadsPage"), "LeadsPage");
export const OpportunitiesPage = named(() => import("../pages/OpportunitiesPage"), "OpportunitiesPage");
export const OpportunityDetailPage = named(() => import("../pages/OpportunityDetailPage"), "OpportunityDetailPage");
export const CrmHelpPage = named(() => import("../pages/CrmHelpPage"), "CrmHelpPage");
export const OrderDetailPage = named(() => import("../pages/OrderDetailPage"), "OrderDetailPage");
export const OrderFormPage = named(() => import("../pages/OrderFormPage"), "OrderFormPage");
export const OrdersPage = named(() => import("../pages/OrdersPage"), "OrdersPage");
export const ProductFormPage = named(() => import("../pages/ProductFormPage"), "ProductFormPage");
export const ProductsPage = named(() => import("../pages/ProductsPage"), "ProductsPage");
export const PurchaseArcaImportPage = named(() => import("../pages/PurchaseArcaImportPage"), "PurchaseArcaImportPage");
export const PurchaseInvoiceFormPage = named(() => import("../pages/PurchaseInvoiceFormPage"), "PurchaseInvoiceFormPage");
export const PurchaseInvoicesPage = named(() => import("../pages/PurchaseInvoicesPage"), "PurchaseInvoicesPage");
export const PurchaseInvoicePrintPage = named(() => import("../pages/PurchaseInvoicePrintPage"), "PurchaseInvoicePrintPage");
export const PurchaseOrderFormPage = named(() => import("../pages/PurchaseOrderFormPage"), "PurchaseOrderFormPage");
export const PurchaseOrderPrintPage = named(() => import("../pages/PurchaseOrderPrintPage"), "PurchaseOrderPrintPage");
export const PurchaseOrdersPage = named(() => import("../pages/PurchaseOrdersPage"), "PurchaseOrdersPage");
export const PurchaseReceptionFormPage = named(() => import("../pages/PurchaseReceptionFormPage"), "PurchaseReceptionFormPage");
export const PurchaseReceptionsPage = named(() => import("../pages/PurchaseReceptionsPage"), "PurchaseReceptionsPage");
export const PurchaseRequestDetailPage = named(() => import("../pages/PurchaseRequestDetailPage"), "PurchaseRequestDetailPage");
export const PurchaseRequestFormPage = named(() => import("../pages/PurchaseRequestFormPage"), "PurchaseRequestFormPage");
export const PurchaseRequestsPage = named(() => import("../pages/PurchaseRequestsPage"), "PurchaseRequestsPage");
export const PurchasesDashboardPage = named(() => import("../pages/PurchasesDashboardPage"), "PurchasesDashboardPage");
export const PurchaseReportsPage = named(() => import("../pages/PurchaseReportsPage"), "PurchaseReportsPage");
export const PurchaseHelpPage = named(() => import("../pages/PurchaseHelpPage"), "PurchaseHelpPage");
export const QuoteFormPage = named(() => import("../pages/QuoteFormPage"), "QuoteFormPage");
export const QuotePrintPage = named(() => import("../pages/QuotePrintPage"), "QuotePrintPage");
export const QuotesPage = named(() => import("../pages/QuotesPage"), "QuotesPage");
export const RemitoFormPage = named(() => import("../pages/RemitoFormPage"), "RemitoFormPage");
export const RemitoPrintPage = named(() => import("../pages/RemitoPrintPage"), "RemitoPrintPage");
export const RemitosPage = named(() => import("../pages/RemitosPage"), "RemitosPage");
export const ReportsPage = named(() => import("../pages/ReportsPage"), "ReportsPage");
export const SettingsPage = named(() => import("../pages/SettingsPage"), "SettingsPage");
export const DocumentTemplatesPage = named(() => import("../pages/DocumentTemplatesPage"), "DocumentTemplatesPage");
export const SuppliersPage = named(() => import("../pages/SuppliersPage"), "SuppliersPage");
export const MailSettingsPage = named(() => import("../pages/MailSettingsPage"), "MailSettingsPage");
export const InboxPage = named(() => import("../pages/InboxPage"), "InboxPage");
export const ChannelsPage = named(() => import("../pages/ChannelsPage"), "ChannelsPage");
export const ReplyTemplatesPage = named(() => import("../pages/ReplyTemplatesPage"), "ReplyTemplatesPage");
export const ProductionPage = named(() => import("../pages/ProductionPage"), "ProductionPage");
export const ProductionHelpPage = named(() => import("../pages/ProductionHelpPage"), "ProductionHelpPage");
export const ProductionFlowPage = named(() => import("../pages/ProductionFlowPage"), "ProductionFlowPage");
export const ProductionSetupPage = named(() => import("../pages/ProductionSetupPage"), "ProductionSetupPage");
export const ProductionOrdersPage = named(() => import("../pages/ProductionOrdersPage"), "ProductionOrdersPage");
export const ProductionOrderDetailPage = named(() => import("../pages/ProductionOrderDetailPage"), "ProductionOrderDetailPage");
export const ProductionVariantsPage = named(() => import("../pages/ProductionVariantsPage"), "ProductionVariantsPage");
export const ProductionCostsPage = named(() => import("../pages/ProductionCostsPage"), "ProductionCostsPage");
export const ProductionReportsPage = named(() => import("../pages/ProductionReportsPage"), "ProductionReportsPage");
export const FinancePage = named(() => import("../pages/FinancePage"), "FinancePage");
export const FinanceAccountsPage = named(() => import("../pages/FinanceAccountsPage"), "FinanceAccountsPage");
export const FinanceReconciliationPage = named(() => import("../pages/FinanceReconciliationPage"), "FinanceReconciliationPage");
export const FinanceConceptsPage = named(() => import("../pages/FinanceConceptsPage"), "FinanceConceptsPage");
export const ChequePortfolioPage = named(() => import("../pages/ChequePortfolioPage"), "ChequePortfolioPage");
export const CollectionReceiptsWorkspacePage = named(() => import("../pages/CollectionReceiptsWorkspacePage"), "CollectionReceiptsWorkspacePage");
export const CurrentAccountsPage = named(() => import("../pages/CurrentAccountsPage"), "CurrentAccountsPage");
export const PaymentOrdersPage = named(() => import("../pages/PaymentOrdersPage"), "PaymentOrdersPage");
export const PaymentOrderFormPage = named(() => import("../pages/PaymentOrderFormPage"), "PaymentOrderFormPage");
export const PaymentOrderPrintPage = named(() => import("../pages/PaymentOrderPrintPage"), "PaymentOrderPrintPage");
export const CashFlowPage = named(() => import("../pages/CashFlowPage"), "CashFlowPage");
export const HumanResourcesDashboardPage = named(() => import("../pages/HumanResourcesDashboardPage"), "HumanResourcesDashboardPage");
export const OrgChartPage = named(() => import("../pages/OrgChartPage"), "OrgChartPage");
export const OrganizationPositionFormPage = named(() => import("../pages/OrganizationPositionFormPage"), "OrganizationPositionFormPage");
export const PositionJobDescriptionPage = named(() => import("../pages/PositionJobDescriptionPage"), "PositionJobDescriptionPage");
export const ProcedureManualsPage = named(() => import("../pages/ProcedureManualsPage"), "ProcedureManualsPage");
export const ProcedureManualFormPage = named(() => import("../pages/ProcedureManualFormPage"), "ProcedureManualFormPage");
export const EmployeesListPage = named(() => import("../pages/EmployeesListPage"), "EmployeesListPage");
export const EmployeeFormPage = named(() => import("../pages/EmployeeFormPage"), "EmployeeFormPage");
export const PayrollListPage = named(() => import("../pages/PayrollListPage"), "PayrollListPage");
export const HumanResourcesHelpPage = named(() => import("../pages/HumanResourcesHelpPage"), "HumanResourcesHelpPage");
export const FleetVehiclesListPage = named(() => import("../pages/FleetVehiclesListPage"), "FleetVehiclesListPage");
export const FleetVehicleFormPage = named(() => import("../pages/FleetVehicleFormPage"), "FleetVehicleFormPage");
export const FleetFuelLogsPage = named(() => import("../pages/FleetFuelLogsPage"), "FleetFuelLogsPage");
export const FleetHelpPage = named(() => import("../pages/FleetHelpPage"), "FleetHelpPage");
export const DirectoryHelpPage = named(() => import("../pages/DirectoryHelpPage"), "DirectoryHelpPage");
export const SalesHelpPage = named(() => import("../pages/SalesHelpPage"), "SalesHelpPage");
export const FinanceHelpPage = named(() => import("../pages/FinanceHelpPage"), "FinanceHelpPage");
export const SettingsHelpPage = named(() => import("../pages/SettingsHelpPage"), "SettingsHelpPage");
export const StyleShowcasePage = named(() => import("../pages/StyleShowcasePage"), "StyleShowcasePage");
export const GrainsDashboardPage = named(() => import("../pages/GrainsDashboardPage"), "GrainsDashboardPage");
export const GrainContractsPage = named(() => import("../pages/GrainContractsPage"), "GrainContractsPage");
export const GrainContractFormPage = named(() => import("../pages/GrainContractFormPage"), "GrainContractFormPage");
export const GrainContractDetailPage = named(() => import("../pages/GrainContractDetailPage"), "GrainContractDetailPage");
export const GrainFixationsPage = named(() => import("../pages/GrainFixationsPage"), "GrainFixationsPage");
export const GrainDeliveriesPage = named(() => import("../pages/GrainDeliveriesPage"), "GrainDeliveriesPage");
export const GrainPositionPage = named(() => import("../pages/GrainPositionPage"), "GrainPositionPage");
export const SuperAdminLoginPage = named(() => import("../pages/superadmin/SuperAdminLoginPage"), "SuperAdminLoginPage");
export const SuperAdminDashboardPage = named(() => import("../pages/superadmin/SuperAdminDashboardPage"), "SuperAdminDashboardPage");
export const SuperAdminSettingsPage = named(() => import("../pages/superadmin/SuperAdminSettingsPage"), "SuperAdminSettingsPage");
export const SuperAdminTenantsPage = named(() => import("../pages/superadmin/SuperAdminTenantsPage"), "SuperAdminTenantsPage");
export const SuperAdminPlansPage = named(() => import("../pages/superadmin/SuperAdminPlansPage"), "SuperAdminPlansPage");
export const SuperAdminDemoRequestsPage = named(() => import("../pages/superadmin/SuperAdminDemoRequestsPage"), "SuperAdminDemoRequestsPage");
export const AccountingDashboardPage = named(() => import("../pages/accounting/AccountingDashboardPage"), "AccountingDashboardPage");
export const JournalTemplatesPage = named(() => import("../pages/accounting/JournalTemplatesPage"), "JournalTemplatesPage");
export const JournalTemplateFormPage = named(() => import("../pages/accounting/JournalTemplateFormPage"), "JournalTemplateFormPage");
export const ChartOfAccountsPage = named(() => import("../pages/accounting/ChartOfAccountsPage"), "ChartOfAccountsPage");
export const AccountFormPage = named(() => import("../pages/accounting/AccountFormPage"), "AccountFormPage");
export const JournalEntriesPage = named(() => import("../pages/accounting/JournalEntriesPage"), "JournalEntriesPage");
export const JournalEntryFormPage = named(() => import("../pages/accounting/JournalEntryFormPage"), "JournalEntryFormPage");
export const GeneralLedgerPage = named(() => import("../pages/accounting/GeneralLedgerPage"), "GeneralLedgerPage");
export const TrialBalancePage = named(() => import("../pages/accounting/TrialBalancePage"), "TrialBalancePage");
export const BankReconciliationPage = named(() => import("../pages/accounting/BankReconciliationPage"), "BankReconciliationPage");
export const AccountingStudyPortalPage = named(() => import("../pages/accounting/AccountingStudyPortalPage"), "AccountingStudyPortalPage");
export const MetrologyDashboardPage = named(() => import("../pages/metrology/MetrologyDashboardPage"), "MetrologyDashboardPage");
export const MetrologyScopePage = named(() => import("../pages/metrology/MetrologyScopePage"), "MetrologyScopePage");
export const MetrologyEquipmentPage = named(() => import("../pages/metrology/MetrologyEquipmentPage"), "MetrologyEquipmentPage");
export const MetrologyEquipmentFormPage = named(() => import("../pages/metrology/MetrologyEquipmentFormPage"), "MetrologyEquipmentFormPage");
export const StandardWeightsPage = named(() => import("../pages/metrology/StandardWeightsPage"), "StandardWeightsPage");
export const StandardWeightFormPage = named(() => import("../pages/metrology/StandardWeightFormPage"), "StandardWeightFormPage");
export const StandardWeightsPrintPage = named(() => import("../pages/metrology/StandardWeightsPrintPage"), "StandardWeightsPrintPage");
export const CalibrationReportsPage = named(() => import("../pages/metrology/CalibrationReportsPage"), "CalibrationReportsPage");
export const CalibrationReportFormPage = named(() => import("../pages/metrology/CalibrationReportFormPage"), "CalibrationReportFormPage");
export const CalibrationReportPrintPage = named(() => import("../pages/metrology/CalibrationReportPrintPage"), "CalibrationReportPrintPage");
export const MetrologyInstrumentsPage = named(() => import("../pages/metrology/MetrologyInstrumentsPage"), "MetrologyInstrumentsPage");
export const MetrologyInstrumentFormPage = named(() => import("../pages/metrology/MetrologyInstrumentsPage"), "MetrologyInstrumentFormPage");
export const QualityDashboardPage = named(() => import("../pages/quality/QualityDashboardPage"), "QualityDashboardPage");
export const QualityHelpPage = named(() => import("../pages/quality/QualityHelpPage"), "QualityHelpPage");
export const QualityDocumentsPage = named(() => import("../pages/quality/QualityDocumentsPage"), "QualityDocumentsPage");
export const QualityDocumentDetailPage = named(() => import("../pages/quality/QualityDocumentDetailPage"), "QualityDocumentDetailPage");
export const QualityPg01R01Page = named(() => import("../pages/quality/QualityGeneratedRecordsPage"), "QualityPg01R01Page");
export const QualityInternalDocumentsPrintPage = named(() => import("../pages/quality/QualityInternalDocumentsPrintPage"), "QualityInternalDocumentsPrintPage");
export const QualityPg01R02Page = named(() => import("../pages/quality/QualityGeneratedRecordsPage"), "QualityPg01R02Page");
export const QualityMc01R01Page = named(() => import("../pages/quality/QualityMc01R01Page"), "QualityMc01R01Page");
export const QualityMc01R02Page = named(() => import("../pages/quality/QualityMc01R01Page"), "QualityMc01R02Page");
export const QualityMc01R03Page = named(() => import("../pages/quality/QualityMc01R03Page"), "QualityMc01R03Page");
export const QualityMc01R03PrintPage = named(() => import("../pages/quality/QualityMc01R03PrintPage"), "QualityMc01R03PrintPage");
export const QualityMc01R05Page = named(() => import("../pages/quality/QualityMc01R05Page"), "QualityMc01R05Page");
export const QualityPg11R01Page = named(() => import("../pages/quality/QualityPg11R01Page"), "QualityPg11R01Page");
export const QualityPg03R01Page = named(() => import("../pages/quality/QualityPg03R01Page"), "QualityPg03R01Page");
export const QualityComplaintPrintPage = named(() => import("../pages/quality/QualityComplaintPrintPage"), "QualityComplaintPrintPage");
export const QualityPg07R01Page = named(() => import("../pages/quality/QualityPg07R01Page"), "QualityPg07R01Page");
export const QualityNonConformityPrintPage = named(() => import("../pages/quality/QualityNonConformityPrintPage"), "QualityNonConformityPrintPage");
export const QualityPg04Page = named(() => import("../pages/quality/QualityPg04Page"), "QualityPg04Page");
export const QualityInternalAuditPrintPage = named(() => import("../pages/quality/QualityInternalAuditPrintPage"), "QualityInternalAuditPrintPage");
export const QualityPg05Page = named(() => import("../pages/quality/QualityPg05Page"), "QualityPg05Page");
export const QualitySupplierEvaluationPrintPage = named(() => import("../pages/quality/QualitySupplierEvaluationPrintPage"), "QualitySupplierEvaluationPrintPage");
export const QualityPg06Page = named(() => import("../pages/quality/QualityPg06Page"), "QualityPg06Page");
export const QualityPersonnelAuthorizationPrintPage = named(() => import("../pages/quality/QualityPersonnelAuthorizationPrintPage"), "QualityPersonnelAuthorizationPrintPage");
export const QualityPg08R01Page = named(() => import("../pages/quality/QualityPg08R01Page"), "QualityPg08R01Page");
export const QualityManagementReviewPrintPage = named(
  () => import("../pages/quality/QualityManagementReviewPrintPage"),
  "QualityManagementReviewPrintPage"
);
export const QualityPg09R03Page = named(() => import("../pages/quality/QualityPg09R03Page"), "QualityPg09R03Page");
export const QualitySatisfactionSurveyPrintPage = named(
  () => import("../pages/quality/QualitySatisfactionSurveyPrintPage"),
  "QualitySatisfactionSurveyPrintPage"
);
export const QualityPg14Page = named(() => import("../pages/quality/QualityPg14Page"), "QualityPg14Page");
export const QualityIntermediateCheckPrintPage = named(
  () => import("../pages/quality/QualityIntermediateCheckPrintPage"),
  "QualityIntermediateCheckPrintPage"
);
export const QualityMaintenancePlanPrintPage = named(
  () => import("../pages/quality/QualityMaintenancePlanPrintPage"),
  "QualityMaintenancePlanPrintPage"
);
export const QualityEquipmentLogPrintPage = named(
  () => import("../pages/quality/QualityEquipmentLogPrintPage"),
  "QualityEquipmentLogPrintPage"
);
export const QualityRecordsHubPage = named(() => import("../pages/quality/QualityRecordsHubPage"), "QualityRecordsHubPage");
export const QualityLinkedItPage = named(() => import("../pages/quality/QualityLinkedItPage"), "QualityLinkedItPage");

export const QualityExternalDocumentsPrintPage = named(() => import("../pages/quality/QualityExternalDocumentsPrintPage"), "QualityExternalDocumentsPrintPage");
