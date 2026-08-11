import { NavLink, Route, Routes } from "react-router-dom";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { CustomerFormPage } from "./pages/CustomerFormPage";
import { CustomersPage } from "./pages/CustomersPage";
import { HoyPage } from "./pages/HoyPage";
import { LeadsPage } from "./pages/LeadsPage";
import { OpportunitiesPage } from "./pages/OpportunitiesPage";

export function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          Leal Control
          <small>ERP 2.0 · CRM</small>
        </div>
        <nav className="nav">
          <NavLink to="/">Hoy</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          <NavLink to="/prospectos">Prospectos</NavLink>
          <NavLink to="/oportunidades">Embudo</NavLink>
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<HoyPage />} />
          <Route path="/clientes" element={<CustomersPage />} />
          <Route path="/clientes/nuevo" element={<CustomerFormPage />} />
          <Route path="/clientes/:id" element={<CustomerDetailPage />} />
          <Route path="/clientes/:id/editar" element={<CustomerFormPage />} />
          <Route path="/prospectos" element={<LeadsPage />} />
          <Route path="/oportunidades" element={<OpportunitiesPage />} />
        </Routes>
      </main>
    </div>
  );
}
