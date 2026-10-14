import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/contabilidad", label: "📊 Tablero", end: true },
  { to: "/contabilidad/modelos", label: "⚙️ Asientos Modelos" },
  { to: "/contabilidad/plan-cuentas", label: "🌳 Plan de Cuentas" },
  { to: "/contabilidad/asientos", label: "📖 Libro Diario" },
  { to: "/contabilidad/mayor", label: "🔍 Libro Mayor" },
  { to: "/contabilidad/sumas-saldos", label: "⚖️ Sumas y Saldos" },
  { to: "/contabilidad/libros-iva", label: "🧾 Libros IVA" },
  { to: "/contabilidad/conciliacion", label: "🏦 Conciliación tesorería" },
  { to: "/contabilidad/portal-estudio", label: "🏢 Cierres y períodos" }
];

/** Pestañas de Contabilidad: una sola lista para todas las pantallas del módulo. */
export function AccountingTabs() {
  return (
    <div className="tab-row" style={{ display: "flex", gap: 8, overflowX: "auto" }}>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `tab-btn${isActive ? " active" : ""}`}>
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
