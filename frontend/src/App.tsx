import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "./api/client";
import { useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AskLealAssistantModal } from "./components/AskLealAssistantModal";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { CustomerFormPage } from "./pages/CustomerFormPage";
import { DirectoryPage } from "./pages/DirectoryPage";
import { CustomersPage } from "./pages/CustomersPage";
import { HoyPage } from "./pages/HoyPage";
import { ExecutiveDashboardPage } from "./pages/ExecutiveDashboardPage";
import { InventoryPage } from "./pages/InventoryPage";
import { InventoryHelpPage } from "./pages/InventoryHelpPage";
import { InvoiceFormPage } from "./pages/InvoiceFormPage";
import { InvoicePrintPage } from "./pages/InvoicePrintPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { LeadsPage } from "./pages/LeadsPage";
import { OpportunitiesPage } from "./pages/OpportunitiesPage";
import { OpportunityDetailPage } from "./pages/OpportunityDetailPage";
import { CrmHelpPage } from "./pages/CrmHelpPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrderFormPage } from "./pages/OrderFormPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ProductFormPage } from "./pages/ProductFormPage";
import { ProductsPage } from "./pages/ProductsPage";
import { PurchaseArcaImportPage } from "./pages/PurchaseArcaImportPage";
import { PurchaseInvoiceFormPage } from "./pages/PurchaseInvoiceFormPage";
import { PurchaseInvoicesPage } from "./pages/PurchaseInvoicesPage";
import { PurchaseOrderFormPage } from "./pages/PurchaseOrderFormPage";
import { PurchaseOrderPrintPage } from "./pages/PurchaseOrderPrintPage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { PurchaseReceptionFormPage } from "./pages/PurchaseReceptionFormPage";
import { PurchaseReceptionsPage } from "./pages/PurchaseReceptionsPage";
import { PurchaseRequestDetailPage } from "./pages/PurchaseRequestDetailPage";
import { PurchaseRequestFormPage } from "./pages/PurchaseRequestFormPage";
import { PurchaseRequestsPage } from "./pages/PurchaseRequestsPage";
import { PurchasesDashboardPage } from "./pages/PurchasesDashboardPage";
import { PurchaseReportsPage } from "./pages/PurchaseReportsPage";
import { PurchaseHelpPage } from "./pages/PurchaseHelpPage";
import { QuoteFormPage } from "./pages/QuoteFormPage";
import { QuotePrintPage } from "./pages/QuotePrintPage";
import { QuotesPage } from "./pages/QuotesPage";
import { RemitoFormPage } from "./pages/RemitoFormPage";
import { RemitoPrintPage } from "./pages/RemitoPrintPage";
import { RemitosPage } from "./pages/RemitosPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DocumentTemplatesPage } from "./pages/DocumentTemplatesPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { MailSettingsPage } from "./pages/MailSettingsPage";
import { InboxPage } from "./pages/InboxPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { ProductionPage } from "./pages/ProductionPage";
import { ProductionHelpPage } from "./pages/ProductionHelpPage";
import { ProductionFlowPage } from "./pages/ProductionFlowPage";
import { ProductionSetupPage } from "./pages/ProductionSetupPage";
import { ProductionOrdersPage } from "./pages/ProductionOrdersPage";
import { ProductionOrderDetailPage } from "./pages/ProductionOrderDetailPage";
import { ProductionVariantsPage } from "./pages/ProductionVariantsPage";
import { ProductionCostsPage } from "./pages/ProductionCostsPage";
import { ProductionReportsPage } from "./pages/ProductionReportsPage";
import { FinancePage } from "./pages/FinancePage";
import { FinanceAccountsPage } from "./pages/FinanceAccountsPage";
import { ChequePortfolioPage } from "./pages/ChequePortfolioPage";
import { CollectionReceiptsWorkspacePage } from "./pages/CollectionReceiptsWorkspacePage";
import { CurrentAccountsPage } from "./pages/CurrentAccountsPage";
import { CashFlowPage } from "./pages/CashFlowPage";
import { HumanResourcesDashboardPage } from "./pages/HumanResourcesDashboardPage";
import { OrgChartPage } from "./pages/OrgChartPage";
import { ProcedureManualsPage } from "./pages/ProcedureManualsPage";
import { EmployeesListPage } from "./pages/EmployeesListPage";
import { EmployeeFormPage } from "./pages/EmployeeFormPage";
import { PayrollListPage } from "./pages/PayrollListPage";
import { HumanResourcesHelpPage } from "./pages/HumanResourcesHelpPage";
import { FleetVehiclesListPage } from "./pages/FleetVehiclesListPage";
import { FleetVehicleFormPage } from "./pages/FleetVehicleFormPage";
import { FleetFuelLogsPage } from "./pages/FleetFuelLogsPage";
import { FleetHelpPage } from "./pages/FleetHelpPage";
import { DirectoryHelpPage } from "./pages/DirectoryHelpPage";
import { SalesHelpPage } from "./pages/SalesHelpPage";
import { FinanceHelpPage } from "./pages/FinanceHelpPage";
import { SettingsHelpPage } from "./pages/SettingsHelpPage";
import { StyleShowcasePage } from "./pages/StyleShowcasePage";
import { GrainsDashboardPage } from "./pages/GrainsDashboardPage";
import { GrainContractsPage } from "./pages/GrainContractsPage";
import { GrainContractFormPage } from "./pages/GrainContractFormPage";
import { GrainContractDetailPage } from "./pages/GrainContractDetailPage";
import { GrainFixationsPage } from "./pages/GrainFixationsPage";
import { GrainDeliveriesPage } from "./pages/GrainDeliveriesPage";
import { GrainPositionPage } from "./pages/GrainPositionPage";
import { SuperAdminLoginPage } from "./pages/superadmin/SuperAdminLoginPage";
import { SuperAdminDashboardPage } from "./pages/superadmin/SuperAdminDashboardPage";
import { SuperAdminTenantsPage } from "./pages/superadmin/SuperAdminTenantsPage";
import { SuperAdminPlansPage } from "./pages/superadmin/SuperAdminPlansPage";
import { AccountingDashboardPage } from "./pages/accounting/AccountingDashboardPage";
import { JournalTemplatesPage } from "./pages/accounting/JournalTemplatesPage";
import { JournalTemplateFormPage } from "./pages/accounting/JournalTemplateFormPage";
import { ChartOfAccountsPage } from "./pages/accounting/ChartOfAccountsPage";
import { AccountFormPage } from "./pages/accounting/AccountFormPage";
import { JournalEntriesPage } from "./pages/accounting/JournalEntriesPage";
import { JournalEntryFormPage } from "./pages/accounting/JournalEntryFormPage";
import { GeneralLedgerPage } from "./pages/accounting/GeneralLedgerPage";
import { TrialBalancePage } from "./pages/accounting/TrialBalancePage";
import { BankReconciliationPage } from "./pages/accounting/BankReconciliationPage";
import { AccountingStudyPortalPage } from "./pages/accounting/AccountingStudyPortalPage";
import { MetrologyDashboardPage } from "./pages/metrology/MetrologyDashboardPage";
import { MetrologyEquipmentPage } from "./pages/metrology/MetrologyEquipmentPage";
import { MetrologyEquipmentFormPage } from "./pages/metrology/MetrologyEquipmentFormPage";
import { StandardWeightsPage } from "./pages/metrology/StandardWeightsPage";
import { StandardWeightFormPage } from "./pages/metrology/StandardWeightFormPage";
import { CalibrationReportsPage } from "./pages/metrology/CalibrationReportsPage";
import { CalibrationReportFormPage } from "./pages/metrology/CalibrationReportFormPage";
import { CalibrationReportPrintPage } from "./pages/metrology/CalibrationReportPrintPage";
import { LandingPage } from "./pages/LandingPage";
import { ThemeToggle } from "./components/ThemeToggle";
import { LealLogo } from "./components/LealLogo";
import "./v1-theme.css";
import "./brand-layout.css";
import "./excel-tools.css";
import { DEVELOPMENT_ACCESS, resolveActiveModule, visibleModules } from "./app/moduleRegistry";

export function App() {
  const location = useLocation();
  const { user, tenant, availableTenants, switchTenant, logout } = useAuth();

  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("Empresa");
  const [appsOpen, setAppsOpen] = useState(false);
  const [showAskLeal, setShowAskLeal] = useState(false);

  useEffect(() => {
    void api
      .getCompanySettings()
      .then((settings) => {
        setCompanyLogo(settings.logoUrl || null);
        setCompanyName(settings.tradeName || settings.legalName || "Empresa");
      })
      .catch(() => undefined);
  }, [tenant?.id]);

  const activeCompanyName = tenant?.tradeName || tenant?.legalName || companyName;

  const userRole = user?.role || "Comercial";
  let allowedModuleIds: string[] = [];
  if (userRole === "Admin") {
    allowedModuleIds = ["inicio", "directorio", "crm", "ventas", "compras", "inventario", "produccion", "finanzas", "rrhh", "flota", "cereales", "contabilidad", "metrologia", "administracion"];
  } else {
    try {
      const raw = typeof user?.allowedModulesJson === "string" ? JSON.parse(user.allowedModulesJson) : user?.allowedModulesJson || [];
      const map: Record<string, string[]> = {
        sales: ["ventas"],
        crm: ["crm", "directorio"],
        purchases: ["compras"],
        inventory: ["inventario", "produccion"],
        finance: ["finanzas"],
        fleet: ["flota"],
        hr: ["rrhh"],
        grains: ["cereales"],
        accounting: ["contabilidad"],
        metrology: ["metrologia"]
      };
      allowedModuleIds = ["inicio"];
      (Array.isArray(raw) ? raw : []).forEach((r: string) => {
        if (map[r]) allowedModuleIds.push(...map[r]);
        else allowedModuleIds.push(r);
      });
    } catch {
      allowedModuleIds = ["inicio", "ventas", "crm"];
    }
  }

  const allMods = visibleModules(DEVELOPMENT_ACCESS);
  const modules = allMods.filter((m) => m.id === "inicio" || allowedModuleIds.includes(m.id));
  const activeModule = resolveActiveModule(location.pathname, DEVELOPMENT_ACCESS);
  const activeModuleId = activeModule.id;

  if (location.pathname === "/login") {
    return <LoginPage />;
  }

  if (location.pathname === "/landing" || location.pathname === "/demo") {
    return <LandingPage />;
  }

  if (location.pathname.startsWith("/superadmin")) {
    if (location.pathname === "/superadmin/login") {
      return <SuperAdminLoginPage />;
    }
    if (location.pathname === "/superadmin/tenants") {
      return <SuperAdminTenantsPage />;
    }
    if (location.pathname === "/superadmin/planes") {
      return <SuperAdminPlansPage />;
    }
    return <SuperAdminDashboardPage />;
  }

  return (
    <ProtectedRoute>
      <div className="app-shell">
        {/* Main Body with Clean Sidebar */}
        <div className="app">
          <aside className="sidebar">
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
                        🏢 {t.tradeName || t.legalName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button type="button" className="applications-launcher" onClick={() => setAppsOpen(true)}>
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
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  <span className="nav-icon-badge">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10, paddingTop: 12, borderTop: "1px solid var(--surface-border)" }}>
              {/* User Session Bar */}
              {user && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: "8px",
                  background: "var(--surface-muted)",
                  border: "1px solid var(--surface-border)",
                  fontSize: "0.78rem"
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      👤 {user.fullName}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--brand-accent)" }}>
                      {user.role}
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

              <button
                type="button"
                onClick={() => setShowAskLeal(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #0f172a, #1e293b)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontWeight: 800,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  width: "100%",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>🤖</span>
                  <span>Preguntale a LEAL</span>
                </span>
                <span style={{ fontSize: "0.65rem", background: "#0d9488", padding: "2px 6px", borderRadius: "8px", color: "#fff" }}>
                  IA
                </span>
              </button>

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
              <Route path="/finanzas/echeqs" element={<ChequePortfolioPage />} />
              <Route path="/finanzas/cobranzas" element={<CollectionReceiptsWorkspacePage />} />

              <Route path="/finanzas/cuenta-corriente" element={<CurrentAccountsPage />} />
              <Route path="/finanzas/cashflow" element={<CashFlowPage />} />
              <Route path="/finanzas/ayuda" element={<FinanceHelpPage />} />

              {/* Human Resources & Payroll Routes */}
              <Route path="/rrhh" element={<HumanResourcesDashboardPage />} />
              <Route path="/rrhh/organigrama" element={<OrgChartPage />} />
              <Route path="/rrhh/manuales" element={<ProcedureManualsPage />} />
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
              <Route path="/metrologia/patrones/:id" element={<StandardWeightFormPage />} />
              <Route path="/metrologia/ensayos/nuevo" element={<CalibrationReportFormPage />} />
              <Route path="/metrologia/informes" element={<CalibrationReportsPage />} />
              <Route path="/metrologia/informes/:id/imprimir" element={<CalibrationReportPrintPage />} />

              {/* Reports & Settings Routes */}
              <Route path="/reportes" element={<ReportsPage />} />
              <Route path="/configuracion" element={<SettingsPage />} />
              <Route path="/configuracion/plantillas" element={<DocumentTemplatesPage />} />
              <Route path="/configuracion/correo" element={<MailSettingsPage />} />
              <Route path="/configuracion/ayuda" element={<SettingsHelpPage />} />
              <Route path="/comunicaciones" element={<InboxPage />} />
              <Route path="/comunicaciones/canales" element={<ChannelsPage />} />
            </Routes>
          </main>
        </div>

        {/* Asistente Copiloto Modal */}
        <AskLealAssistantModal isOpen={showAskLeal} onClose={() => setShowAskLeal(false)} />
      </div>
    </ProtectedRoute>
  );
}
