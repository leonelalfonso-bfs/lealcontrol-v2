import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "./api/client";
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
import { StyleShowcasePage } from "./pages/StyleShowcasePage";
import { ThemeToggle } from "./components/ThemeToggle";
import { LealLogo } from "./components/LealLogo";
import "./v1-theme.css";
import "./brand-layout.css";
import "./excel-tools.css";
import { DEVELOPMENT_ACCESS, resolveActiveModule, visibleModules } from "./app/moduleRegistry";

export function App() {
  const location = useLocation();
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("Empresa");
  const [appsOpen, setAppsOpen] = useState(false);

  useEffect(() => {
    void api
      .getCompanySettings()
      .then((settings) => {
        setCompanyLogo(settings.logoUrl || null);
        setCompanyName(settings.tradeName || settings.legalName || "Empresa");
      })
      .catch(() => undefined);
  }, []);

  const modules = visibleModules(DEVELOPMENT_ACCESS);
  const activeModule = resolveActiveModule(location.pathname, DEVELOPMENT_ACCESS);
  const activeModuleId = activeModule.id;

  return (
    <div className="app-shell">
      {/* Main Body with Clean Sidebar */}
      <div className="app">
        <aside className="sidebar">
          <div className="company-brand">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="company-logo" />
            ) : (
              <div className="company-logo-placeholder">{companyName.slice(0, 2).toUpperCase()}</div>
            )}
            <strong>{companyName}</strong>
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
                      className="app-card-icon"
                      style={{
                        background: mod.gradient,
                        boxShadow: `0 8px 24px ${mod.glow}`
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

            {/* CRM Routes */}
            <Route path="/crm" element={<HoyPage />} />
            <Route path="/directorio" element={<DirectoryPage />} />
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
            {/* Reports & Settings Routes */}
            <Route path="/finanzas/cashflow" element={<CashFlowPage />} />
            <Route path="/reportes" element={<ReportsPage />} />
            <Route path="/configuracion" element={<SettingsPage />} />
            <Route path="/configuracion/correo" element={<MailSettingsPage />} />
            <Route path="/comunicaciones" element={<InboxPage />} />
            <Route path="/comunicaciones/canales" element={<ChannelsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
