import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { api } from "./api/client";
import { useAuth } from "./context/AuthContext";
import { usePresentationMode } from "./context/PresentationModeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { CommunicationsNotificationBell } from "./components/CommunicationsNotificationBell";
import { useCommunicationsBrowserNotifications } from "./hooks/useCommunicationsBrowserNotifications";
import {
  AccountFormPage,
  AccountingDashboardPage,
  AccountingStudyPortalPage,
  BankReconciliationPage,
  CalibrationReportFormPage,
  CalibrationReportPrintPage,
  CalibrationReportsPage,
  CashFlowPage,
  ChannelsPage,
  ChartOfAccountsPage,
  ChequePortfolioPage,
  CollectionReceiptsWorkspacePage,
  CrmHelpPage,
  CurrentAccountsPage,
  CustomerDetailPage,
  CustomerFormPage,
  CustomersPage,
  DirectoryHelpPage,
  DirectoryPage,
  DocumentTemplatesPage,
  EmployeeFormPage,
  EmployeesListPage,
  ExecutiveDashboardPage,
  FinanceAccountsPage,
  FinanceConceptsPage,
  FinanceHelpPage,
  FinancePage,
  FinanceReconciliationPage,
  FleetFuelLogsPage,
  FleetHelpPage,
  FleetVehicleFormPage,
  FleetVehiclesListPage,
  GeneralLedgerPage,
  GrainContractDetailPage,
  GrainContractFormPage,
  GrainContractsPage,
  GrainDeliveriesPage,
  GrainFixationsPage,
  GrainPositionPage,
  GrainsDashboardPage,
  HoyPage,
  HumanResourcesDashboardPage,
  HumanResourcesHelpPage,
  InboxPage,
  InventoryHelpPage,
  InventoryPage,
  InvoiceFormPage,
  InvoicePrintPage,
  InvoicesPage,
  JournalEntriesPage,
  JournalEntryFormPage,
  JournalTemplateFormPage,
  JournalTemplatesPage,
  LandingPage,
  LeadsPage,
  LoginPage,
  MailSettingsPage,
  MetrologyDashboardPage,
  MetrologyEquipmentFormPage,
  MetrologyEquipmentPage,
  MetrologyInstrumentFormPage,
  MetrologyInstrumentsPage,
  QualityDashboardPage,
  QualityHelpPage,
  QualityDocumentDetailPage,
  QualityDocumentsPage,
  QualityMc01R01Page,
  QualityMc01R02Page,
  QualityMc01R03Page,
  QualityMc01R05Page,
  QualityPg11R01Page,
  QualityPg03R01Page,
  QualityComplaintPrintPage,
  QualityPg07R01Page,
  QualityNonConformityPrintPage,
  QualityPg04Page,
  QualityInternalAuditPrintPage,
  QualityPg05Page,
  QualitySupplierEvaluationPrintPage,
  QualityPg06Page,
  QualityPersonnelAuthorizationPrintPage,
  QualityPg08R01Page,
  QualityManagementReviewPrintPage,
  QualityPg09R03Page,
  QualitySatisfactionSurveyPrintPage,
  QualityPg14Page,
  QualityIntermediateCheckPrintPage,
  QualityMaintenancePlanPrintPage,
  QualityEquipmentLogPrintPage,
  QualityRecordsHubPage,
  QualityLinkedItPage,
  QualityPg01R01Page,
  QualityPg01R02Page,
  OpportunitiesPage,
  OpportunityDetailPage,
  OrderDetailPage,
  OrderFormPage,
  OrdersPage,
  OrgChartPage,
  OrganizationPositionFormPage,
  PaymentOrderFormPage,
  PaymentOrderPrintPage,
  PaymentOrdersPage,
  PayrollListPage,
  PositionJobDescriptionPage,
  ProcedureManualFormPage,
  ProcedureManualsPage,
  ProductFormPage,
  ProductionCostsPage,
  ProductionFlowPage,
  ProductionHelpPage,
  ProductionOrderDetailPage,
  ProductionOrdersPage,
  ProductionPage,
  ProductionReportsPage,
  ProductionSetupPage,
  ProductionVariantsPage,
  ProductsPage,
  PurchaseArcaImportPage,
  PurchaseHelpPage,
  PurchaseInvoiceFormPage,
  PurchaseInvoicePrintPage,
  PurchaseInvoicesPage,
  PurchaseOrderFormPage,
  PurchaseOrderPrintPage,
  PurchaseOrdersPage,
  PurchaseReceptionFormPage,
  PurchaseReceptionsPage,
  PurchaseReportsPage,
  PurchaseRequestDetailPage,
  PurchaseRequestFormPage,
  PurchaseRequestsPage,
  PurchasesDashboardPage,
  QuoteFormPage,
  QuotePrintPage,
  QuotesPage,
  RemitoFormPage,
  RemitoPrintPage,
  RemitosPage,
  ReplyTemplatesPage,
  ReportsPage,
  SalesHelpPage,
  SettingsHelpPage,
  SettingsPage,
  StandardWeightFormPage,
  StandardWeightsPage,
  StandardWeightsPrintPage,
  StyleShowcasePage,
  SuperAdminDashboardPage,
  SuperAdminDemoRequestsPage,
  SuperAdminLoginPage,
  SuperAdminPlansPage,
  SuperAdminTenantsPage,
  SuppliersPage,
  TrialBalancePage,
  ChunkLoadErrorBoundary
} from "./app/lazyPages";
import { ThemeToggle } from "./components/ThemeToggle";
import { LealLogo } from "./components/LealLogo";
import "./v1-theme.css";
import "./brand-layout.css";
import "./excel-tools.css";
import { DEVELOPMENT_ACCESS, resolveActiveModule, resolveAllowedModuleIds, visibleModules } from "./app/moduleRegistry";

function PageFallback() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft, #64748b)" }}>
      Cargando…
    </div>
  );
}

function withPageSuspense(node: ReactNode) {
  return (
    <ChunkLoadErrorBoundary>
      <Suspense fallback={<PageFallback />}>{node}</Suspense>
    </ChunkLoadErrorBoundary>
  );
}

export function App() {
  const location = useLocation();
  const { user, tenant, availableTenants, switchTenant, logout } = useAuth();
  const {
    active: presentationActive,
    loading: presentationLoading,
    start: startPresentation,
    end: endPresentation
  } = usePresentationMode();

  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("Empresa");
  const [appsOpen, setAppsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [exitPresentationOpen, setExitPresentationOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState("");
  const [exitError, setExitError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !tenant?.id) return;
    void api
      .getCompanySettings()
      .then((settings) => {
        setCompanyLogo(settings.logoUrl || null);
        setCompanyName(settings.tradeName || settings.legalName || "Empresa");
      })
      .catch(() => undefined);
  }, [user, tenant?.id]);

  const activeCompanyName = tenant?.tradeName || tenant?.legalName || companyName;

  const userRole = user?.role || "Comercial";
  const allowedModuleIds = resolveAllowedModuleIds(userRole, user?.allowedModulesJson);

  const allMods = visibleModules(DEVELOPMENT_ACCESS);
  const modules = allMods
    .filter((m) => m.id === "inicio" || allowedModuleIds.includes(m.id))
    .filter((m) => !presentationActive || m.id === "inicio" || m.id === "calidad" || m.id === "metrologia");
  const activeModule = resolveActiveModule(location.pathname, DEVELOPMENT_ACCESS);
  const activeModuleId = activeModule.id;
  const hasCommunications = !!user && allowedModuleIds.includes("comunicaciones") && !presentationActive;
  const canTogglePresentation =
    !!user && (allowedModuleIds.includes("calidad") || activeModuleId === "calidad" || activeModuleId === "metrologia");
  useCommunicationsBrowserNotifications(hasCommunications);

  if (location.pathname === "/login") {
    return withPageSuspense(<LoginPage />);
  }

  if (location.pathname === "/landing" || location.pathname === "/demo") {
    return withPageSuspense(<LandingPage />);
  }

  if (location.pathname.startsWith("/superadmin")) {
    if (location.pathname === "/superadmin/login") {
      return withPageSuspense(<SuperAdminLoginPage />);
    }
    if (location.pathname === "/superadmin/tenants") {
      return withPageSuspense(<SuperAdminTenantsPage />);
    }
    if (location.pathname === "/superadmin/planes") {
      return withPageSuspense(<SuperAdminPlansPage />);
    }
    if (location.pathname === "/superadmin/demos") {
      return withPageSuspense(<SuperAdminDemoRequestsPage />);
    }
    return withPageSuspense(<SuperAdminDashboardPage />);
  }

  return (
    <ProtectedRoute>
      <div className="app-shell">
        {/* Mobile Header Bar */}
        <header className="mobile-header">
          <button
            type="button"
            className="mobile-hamburger-btn"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            title="Abrir menú"
          >
            ☰
          </button>
          <div className="mobile-brand-title">
            <strong>{activeCompanyName}</strong>
            <span className="badge" style={{ fontSize: "0.68rem" }}>{activeModule.label}</span>
          </div>
          <button
            type="button"
            className="mobile-apps-btn"
            onClick={() => setAppsOpen(true)}
            title="Centro de Aplicaciones"
          >
            ▦
          </button>
        </header>

        {/* Mobile Sidebar Backdrop */}
        {mobileSidebarOpen && (
          <div
            className="mobile-sidebar-backdrop"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Main Body with Clean Adaptive Sidebar */}
        <div className="app">
          <aside className={`sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`}>
            <div className="company-brand" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6, padding: "8px 6px 12px", borderBottom: "1px solid var(--surface-border)" }}>
              {companyLogo ? (
                <img src={companyLogo} alt={activeCompanyName} style={{ maxHeight: "42px", maxWidth: "160px", objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.15))" }} />
              ) : (
                <div className="company-logo-placeholder" style={{ margin: "0 auto" }}>{activeCompanyName.slice(0, 2).toUpperCase()}</div>
              )}
              <div style={{ width: "100%", marginTop: 2 }}>
                <strong style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {activeCompanyName}
                </strong>
                {tenant?.documentNumber && (
                  <span style={{ fontSize: "0.72rem", color: "var(--ink-soft)", letterSpacing: "0.02em" }}>
                    CUIT {tenant.documentNumber}
                  </span>
                )}
              </div>

              {availableTenants.length > 1 && (
                <div style={{ width: "100%", marginTop: 4 }}>
                  <select
                    value={tenant?.id || ""}
                    onChange={(e) => switchTenant(e.target.value)}
                    style={{
                      width: "100%",
                      fontSize: "0.75rem",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      border: "1px solid var(--surface-border)",
                      background: "var(--surface-muted)",
                      color: "var(--ink)"
                    }}
                    title="Alternar Empresa / Tenant"
                  >
                    {availableTenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        🏢 {t.legalName}{t.documentNumber ? ` (${t.documentNumber})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              type="button"
              className="applications-launcher"
              onClick={() => {
                setAppsOpen(true);
                setMobileSidebarOpen(false);
              }}
            >
              <span>▦</span>
              <span>Aplicaciones</span>
              <span>›</span>
            </button>

            <div className="sidebar-module-header">
              <div className="sidebar-module-badge">
                <span
                  className="sidebar-module-icon"
                  style={{
                    background: activeModule.gradient,
                    boxShadow: `0 3px 10px ${activeModule.glow}`
                  }}
                >
                  {activeModule.icon}
                </span>
                <span className="sidebar-module-label">{activeModule.label}</span>
              </div>
            </div>

            <nav className="nav">
              {activeModule.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  <span className="nav-icon-badge">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: "1px solid var(--surface-border)" }}>
              {hasCommunications && <CommunicationsNotificationBell />}

              {canTogglePresentation && (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={presentationLoading}
                  onClick={() => {
                    if (presentationActive) {
                      setExitError(null);
                      setExitPassword("");
                      setExitPresentationOpen(true);
                    } else {
                      void startPresentation().catch((err) =>
                        window.alert(err instanceof Error ? err.message : String(err))
                      );
                    }
                  }}
                  style={{
                    fontSize: "0.75rem",
                    borderColor: presentationActive ? "#b45309" : undefined,
                    color: presentationActive ? "#b45309" : undefined,
                    fontWeight: 700
                  }}
                  title={presentationActive ? "Salir del modo presentación (requiere contraseña)" : "Activar modo presentación para auditoría"}
                >
                  {presentationActive ? "Salir modo presentación" : "Modo presentación · Auditoría"}
                </button>
              )}

              {/* User Session Bar */}
              {user && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: "8px",
                  background: presentationActive ? "#fff7ed" : "var(--surface-muted)",
                  border: `1px solid ${presentationActive ? "#fdba74" : "var(--surface-border)"}`,
                  fontSize: "0.78rem"
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      👤 {user.fullName}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: presentationActive ? "#b45309" : "var(--brand-accent)" }}>
                      {presentationActive ? "Presentación · solo lectura" : user.role}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    title="Cerrar Sesión"
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      color: "#dc2626",
                      padding: "4px"
                    }}
                  >
                    🚪 Salir
                  </button>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <ThemeToggle />
                <NavLink
                  to="/estilos"
                  title="Personalizar tema"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 10,
                    fontSize: "0.8rem",
                    color: "var(--ink-soft)",
                    fontWeight: 700,
                    textDecoration: "none",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--surface-border)"
                  }}
                >
                  <span>🎨</span>
                  <span>Temas</span>
                </NavLink>
              </div>

              <div className="system-brand" style={{ padding: "6px 2px 2px", justifyContent: "flex-start" }}>
                <LealLogo size={38} showText animated />
              </div>
            </div>
          </aside>

          {appsOpen && (
            <div className="apps-overlay" onClick={() => setAppsOpen(false)}>
              <section className="apps-modal" onClick={(event) => event.stopPropagation()}>
                <div className="apps-modal-head">
                  <h2>
                    <span>▦</span> Centro de Aplicaciones
                  </h2>
                  <button type="button" onClick={() => setAppsOpen(false)} title="Cerrar">
                    ×
                  </button>
                </div>
                <div className="apps-grid">
                  {modules.map((mod) => (
                    <Link
                      key={mod.id}
                      to={mod.defaultPath}
                      className={`app-card ${activeModuleId === mod.id ? "selected" : ""}`}
                      onClick={() => setAppsOpen(false)}
                    >
                      <div
                        className="app-icon"
                        style={{
                          background: mod.gradient,
                          boxShadow: `0 4px 14px ${mod.glow}`
                        }}
                      >
                        {mod.icon}
                      </div>
                      <div>
                        <strong>{mod.label}</strong>
                        <small>{mod.title.toLowerCase()}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          )}

          <main className="main">
            <ChunkLoadErrorBoundary>
            <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Style Showcase & Theme Preview */}
              <Route path="/estilos" element={<StyleShowcasePage />} />

              {/* Main Executive ERP Dashboard */}
              <Route path="/" element={<ExecutiveDashboardPage />} />

              {/* CRM & Directory Routes */}
              <Route path="/crm" element={<HoyPage />} />
              <Route path="/directorio" element={<DirectoryPage />} />
              <Route path="/directorio/ayuda" element={<DirectoryHelpPage />} />
              <Route path="/clientes" element={<CustomersPage />} />
              <Route path="/clientes/nuevo" element={<CustomerFormPage />} />
              <Route path="/clientes/:id" element={<CustomerDetailPage />} />
              <Route path="/clientes/:id/editar" element={<CustomerFormPage />} />
              <Route path="/prospectos" element={<LeadsPage />} />
              <Route path="/oportunidades" element={<OpportunitiesPage />} />
              <Route path="/oportunidades/:id" element={<OpportunityDetailPage />} />
              <Route path="/crm/ayuda" element={<CrmHelpPage />} />

              {/* Sales & Commercial Routes */}
              <Route path="/productos" element={<ProductsPage />} />
              <Route path="/productos/nuevo" element={<ProductFormPage />} />
              <Route path="/productos/:id/editar" element={<ProductFormPage />} />
              <Route path="/presupuestos" element={<QuotesPage />} />
              <Route path="/presupuestos/nuevo" element={<QuoteFormPage />} />
              <Route path="/presupuestos/:id/editar" element={<QuoteFormPage />} />
              <Route path="/presupuestos/:id/imprimir" element={<QuotePrintPage />} />
              <Route path="/pedidos" element={<OrdersPage />} />
              <Route path="/pedidos/nuevo" element={<OrderFormPage />} />
              <Route path="/pedidos/:id" element={<OrderDetailPage />} />
              <Route path="/pedidos/:id/editar" element={<OrderFormPage />} />
              <Route path="/remitos" element={<RemitosPage />} />
              <Route path="/remitos/nuevo" element={<RemitoFormPage />} />
              <Route path="/remitos/:id/imprimir" element={<RemitoPrintPage />} />
              <Route path="/facturas" element={<InvoicesPage />} />
              <Route path="/facturas/nueva" element={<InvoiceFormPage />} />
              <Route path="/facturas/:id/imprimir" element={<InvoicePrintPage />} />
              <Route path="/ventas/ayuda" element={<SalesHelpPage />} />

              {/* Purchases Module Routes */}
              <Route path="/compras" element={<PurchasesDashboardPage />} />
              <Route path="/compras/reportes" element={<PurchaseReportsPage />} />
              <Route path="/compras/ayuda" element={<PurchaseHelpPage />} />
              <Route path="/compras/solicitudes" element={<PurchaseRequestsPage />} />
              <Route path="/compras/solicitudes/nueva" element={<PurchaseRequestFormPage />} />
              <Route path="/compras/solicitudes/:id" element={<PurchaseRequestDetailPage />} />
              <Route path="/compras/ordenes" element={<PurchaseOrdersPage />} />
              <Route path="/compras/ordenes/nueva" element={<PurchaseOrderFormPage />} />
              <Route path="/compras/ordenes/:id/imprimir" element={<PurchaseOrderPrintPage />} />
              <Route path="/compras/recepciones" element={<PurchaseReceptionsPage />} />
              <Route path="/compras/recepciones/nueva" element={<PurchaseReceptionFormPage />} />
              <Route path="/compras/facturas" element={<PurchaseInvoicesPage />} />
              <Route path="/compras/facturas/nueva" element={<PurchaseInvoiceFormPage />} />
              <Route path="/compras/facturas/:id" element={<PurchaseInvoicePrintPage />} />
              <Route path="/compras/facturas/:id/imprimir" element={<PurchaseInvoicePrintPage />} />
              <Route path="/compras/arca" element={<PurchaseArcaImportPage />} />

              {/* Inventory & Suppliers Routes */}
              <Route path="/proveedores" element={<SuppliersPage />} />
              <Route path="/proveedores/nuevo" element={<CustomerFormPage />} />
              <Route path="/inventario" element={<InventoryPage />} />
              <Route path="/inventario/ayuda" element={<InventoryHelpPage />} />
              <Route path="/produccion" element={<ProductionPage />} />
              <Route path="/produccion/ayuda" element={<ProductionHelpPage />} />
              <Route path="/produccion/flujo" element={<ProductionFlowPage />} />
              <Route path="/produccion/variantes" element={<ProductionVariantsPage />} />
              <Route path="/produccion/costos" element={<ProductionCostsPage />} />
              <Route path="/produccion/reportes" element={<ProductionReportsPage />} />
              <Route path="/produccion/rutas" element={<ProductionSetupPage />} />
              <Route path="/produccion/centros" element={<ProductionSetupPage />} />
              <Route path="/produccion/ordenes" element={<ProductionOrdersPage />} />
              <Route path="/produccion/ordenes/:id" element={<ProductionOrderDetailPage />} />
              <Route path="/finanzas" element={<FinancePage />} />
              <Route path="/finanzas/bancos" element={<FinanceAccountsPage />} />
              <Route path="/finanzas/conciliacion" element={<FinanceReconciliationPage />} />
              <Route path="/finanzas/conceptos" element={<FinanceConceptsPage />} />
              <Route path="/finanzas/echeqs" element={<ChequePortfolioPage />} />
              <Route path="/finanzas/cobranzas" element={<CollectionReceiptsWorkspacePage />} />
              <Route path="/finanzas/pagos" element={<PaymentOrdersPage />} />
              <Route path="/finanzas/pagos/nueva" element={<PaymentOrderFormPage />} />
              <Route path="/finanzas/ordenes-pago/nuevo" element={<PaymentOrderFormPage />} />
              <Route path="/finanzas/ordenes-pago/nueva" element={<PaymentOrderFormPage />} />
              <Route path="/finanzas/pagos/:id/imprimir" element={<PaymentOrderPrintPage />} />

              <Route path="/finanzas/cuenta-corriente" element={<CurrentAccountsPage />} />
              <Route path="/finanzas/cashflow" element={<CashFlowPage />} />
              <Route path="/finanzas/ayuda" element={<FinanceHelpPage />} />

              {/* Human Resources & Payroll Routes */}
              <Route path="/rrhh" element={<HumanResourcesDashboardPage />} />
              <Route path="/rrhh/organigrama" element={<OrgChartPage />} />
              <Route path="/rrhh/organigrama/puestos/nuevo" element={<OrganizationPositionFormPage />} />
              <Route path="/rrhh/organigrama/puestos/:id" element={<OrganizationPositionFormPage />} />
              <Route path="/rrhh/organigrama/puestos/:id/descripcion" element={<PositionJobDescriptionPage />} />
              <Route path="/rrhh/manuales" element={<ProcedureManualsPage />} />
              <Route path="/rrhh/manuales/nuevo" element={<ProcedureManualFormPage />} />
              <Route path="/rrhh/manuales/:id" element={<ProcedureManualFormPage />} />
              <Route path="/rrhh/empleados" element={<EmployeesListPage />} />
              <Route path="/rrhh/empleados/nuevo" element={<EmployeeFormPage />} />
              <Route path="/rrhh/empleados/:id" element={<EmployeeFormPage />} />
              <Route path="/rrhh/liquidaciones" element={<PayrollListPage />} />
              <Route path="/rrhh/ayuda" element={<HumanResourcesHelpPage />} />

              {/* Fleet Management Routes */}
              <Route path="/flota" element={<FleetVehiclesListPage />} />
              <Route path="/flota/vehiculos/nuevo" element={<FleetVehicleFormPage />} />
              <Route path="/flota/vehiculos/:id" element={<FleetVehicleFormPage />} />
              <Route path="/flota/combustible" element={<FleetFuelLogsPage />} />
              <Route path="/flota/ayuda" element={<FleetHelpPage />} />

              {/* Grains & Agriculture Brokerage Routes */}
              <Route path="/cereales" element={<GrainsDashboardPage />} />
              <Route path="/cereales/contratos" element={<GrainContractsPage />} />
              <Route path="/cereales/contratos/nuevo" element={<GrainContractFormPage />} />
              <Route path="/cereales/contratos/:id" element={<GrainContractDetailPage />} />
              <Route path="/cereales/fijaciones" element={<GrainFixationsPage />} />
              <Route path="/cereales/entregas" element={<GrainDeliveriesPage />} />
              <Route path="/cereales/posicion" element={<GrainPositionPage />} />

              {/* Accounting & Fiscal Routes */}
              <Route path="/contabilidad" element={<AccountingDashboardPage />} />
              <Route path="/contabilidad/modelos" element={<JournalTemplatesPage />} />
              <Route path="/contabilidad/modelos/nuevo" element={<JournalTemplateFormPage />} />
              <Route path="/contabilidad/modelos/:id" element={<JournalTemplateFormPage />} />
              <Route path="/contabilidad/plan-cuentas" element={<ChartOfAccountsPage />} />
              <Route path="/contabilidad/plan-cuentas/nuevo" element={<AccountFormPage />} />
              <Route path="/contabilidad/plan-cuentas/:id" element={<AccountFormPage />} />
              <Route path="/contabilidad/asientos" element={<JournalEntriesPage />} />
              <Route path="/contabilidad/asientos/nuevo" element={<JournalEntryFormPage />} />
              <Route path="/contabilidad/asientos/:id" element={<JournalEntryFormPage />} />
              <Route path="/contabilidad/mayor" element={<GeneralLedgerPage />} />
              <Route path="/contabilidad/sumas-saldos" element={<TrialBalancePage />} />
              <Route path="/contabilidad/conciliacion" element={<BankReconciliationPage />} />
              <Route path="/contabilidad/portal-estudio" element={<AccountingStudyPortalPage />} />

              {/* Metrology & Quality Professional Routes */}
              <Route path="/metrologia" element={<MetrologyDashboardPage />} />
              <Route path="/metrologia/equipos" element={<MetrologyEquipmentPage />} />
              <Route path="/metrologia/equipos/nuevo" element={<MetrologyEquipmentFormPage />} />
              <Route path="/metrologia/equipos/:id" element={<MetrologyEquipmentFormPage />} />
              <Route path="/metrologia/patrones" element={<StandardWeightsPage />} />
              <Route path="/metrologia/patrones/nuevo" element={<StandardWeightFormPage />} />
              <Route path="/metrologia/patrones/imprimir" element={<StandardWeightsPrintPage />} />
              <Route path="/metrologia/patrones/:id" element={<StandardWeightFormPage />} />
              <Route path="/metrologia/instrumentos" element={<MetrologyInstrumentsPage />} />
              <Route path="/metrologia/instrumentos/nuevo" element={<MetrologyInstrumentFormPage />} />
              <Route path="/metrologia/instrumentos/:id" element={<MetrologyInstrumentFormPage />} />
              <Route path="/metrologia/ensayos/nuevo" element={<CalibrationReportFormPage />} />
              <Route path="/metrologia/informes" element={<CalibrationReportsPage />} />
              <Route path="/metrologia/informes/:id/imprimir" element={<CalibrationReportPrintPage />} />

              <Route path="/calidad" element={<QualityDashboardPage />} />
              <Route path="/calidad/ayuda" element={<QualityHelpPage />} />
              <Route path="/calidad/documentos" element={<QualityDocumentsPage />} />
              <Route path="/calidad/documentos/:code" element={<QualityDocumentDetailPage />} />
              <Route path="/calidad/registros" element={<QualityRecordsHubPage />} />
              <Route path="/calidad/registros/pg01-r01" element={<QualityPg01R01Page />} />
              <Route path="/calidad/registros/pg01-r02" element={<QualityPg01R02Page />} />
              <Route path="/calidad/registros/mc01-r01" element={<QualityMc01R01Page />} />
              <Route path="/calidad/registros/mc01-r02" element={<QualityMc01R02Page />} />
              <Route path="/calidad/registros/indicadores" element={<QualityMc01R03Page />} />
              <Route path="/calidad/registros/mc01-r03" element={<QualityMc01R03Page />} />
              <Route path="/calidad/registros/mc01-r05" element={<QualityMc01R05Page />} />
              <Route path="/calidad/registros/pg11-r01" element={<QualityPg11R01Page />} />
              <Route path="/calidad/registros/quejas" element={<QualityPg03R01Page />} />
              <Route path="/calidad/registros/pg03-r01" element={<QualityPg03R01Page />} />
              <Route path="/calidad/registros/quejas/:id/pdf" element={<QualityComplaintPrintPage />} />
              <Route path="/calidad/registros/nc" element={<QualityPg07R01Page />} />
              <Route path="/calidad/registros/pg07-r01" element={<QualityPg07R01Page />} />
              <Route path="/calidad/registros/nc/:id/pdf" element={<QualityNonConformityPrintPage />} />
              <Route path="/calidad/registros/auditorias" element={<QualityPg04Page />} />
              <Route path="/calidad/registros/pg04" element={<QualityPg04Page />} />
              <Route path="/calidad/registros/auditorias/:id/pdf" element={<QualityInternalAuditPrintPage />} />
              <Route path="/calidad/registros/proveedores" element={<QualityPg05Page />} />
              <Route path="/calidad/registros/pg05" element={<QualityPg05Page />} />
              <Route path="/calidad/registros/proveedores/:id/pdf" element={<QualitySupplierEvaluationPrintPage />} />
              <Route path="/calidad/registros/personal" element={<QualityPg06Page />} />
              <Route path="/calidad/registros/pg06" element={<QualityPg06Page />} />
              <Route path="/calidad/registros/personal/autorizacion/:id/pdf" element={<QualityPersonnelAuthorizationPrintPage />} />
              <Route path="/calidad/registros/revision-direccion" element={<QualityPg08R01Page />} />
              <Route path="/calidad/registros/pg08-r01" element={<QualityPg08R01Page />} />
              <Route path="/calidad/registros/revision-direccion/:id/pdf" element={<QualityManagementReviewPrintPage />} />
              <Route path="/calidad/registros/encuestas" element={<QualityPg09R03Page />} />
              <Route path="/calidad/registros/pg09-r03" element={<QualityPg09R03Page />} />
              <Route path="/calidad/registros/encuestas/:id/pdf" element={<QualitySatisfactionSurveyPrintPage />} />
              <Route path="/calidad/registros/equipos" element={<QualityPg14Page />} />
              <Route path="/calidad/registros/pg14" element={<QualityPg14Page />} />
              <Route path="/calidad/registros/equipos/verificacion/:id/pdf" element={<QualityIntermediateCheckPrintPage />} />
              <Route path="/calidad/registros/equipos/mantenimiento/:id/pdf" element={<QualityMaintenancePlanPrintPage />} />
              <Route path="/calidad/registros/equipos/hoja-vida/:source/:assetId/pdf" element={<QualityEquipmentLogPrintPage />} />
              <Route path="/calidad/registros/it/:itCode/:record" element={<QualityLinkedItPage />} />

              {/* Reports & Settings Routes */}
              <Route path="/reportes" element={<ReportsPage />} />
              <Route path="/configuracion" element={<SettingsPage />} />
              <Route path="/configuracion/plantillas" element={<DocumentTemplatesPage />} />
              <Route path="/configuracion/correo" element={<MailSettingsPage />} />
              <Route path="/configuracion/ayuda" element={<SettingsHelpPage />} />
              <Route path="/comunicaciones" element={<InboxPage />} />
              <Route path="/comunicaciones/canales" element={<ChannelsPage />} />
              <Route path="/comunicaciones/plantillas" element={<ReplyTemplatesPage />} />
            </Routes>
            </Suspense>
            </ChunkLoadErrorBoundary>
          </main>
        </div>

        {/* Asistente Copiloto Modal */}
        {exitPresentationOpen && (
          <div className="modal-backdrop" role="presentation" onClick={() => setExitPresentationOpen(false)}>
            <div
              className="card pad"
              role="dialog"
              aria-modal="true"
              style={{ maxWidth: 420, margin: "12vh auto", background: "var(--surface)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginTop: 0 }}>Salir del modo presentación</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                Por seguridad, reingresá tu contraseña. Así el auditor no puede desactivar el modo solo.
              </p>
              <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Contraseña</label>
              <input
                type="password"
                value={exitPassword}
                onChange={(e) => setExitPassword(e.target.value)}
                autoFocus
                style={{ width: "100%", marginBottom: 8 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void endPresentation(exitPassword)
                      .then(() => {
                        setExitPresentationOpen(false);
                        setExitPassword("");
                      })
                      .catch((err) => setExitError(err instanceof Error ? err.message : String(err)));
                  }
                }}
              />
              {exitError && <p style={{ color: "#b91c1c", fontSize: 13 }}>{exitError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setExitPresentationOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={presentationLoading || !exitPassword}
                  onClick={() => {
                    void endPresentation(exitPassword)
                      .then(() => {
                        setExitPresentationOpen(false);
                        setExitPassword("");
                      })
                      .catch((err) => setExitError(err instanceof Error ? err.message : String(err)));
                  }}
                >
                  Salir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
