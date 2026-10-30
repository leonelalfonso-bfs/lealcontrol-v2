import { Link, useLocation } from "react-router-dom";
import { MODULE_REGISTRY } from "../../app/moduleRegistry";

/** Pestañas de RRHH: las mismas opciones del menú lateral, para que nunca queden desparejas. */
export function HrTabs() {
  const { pathname } = useLocation();
  const items = MODULE_REGISTRY.find((m) => m.id === "rrhh")?.items ?? [];
  return (
    <div className="tab-row" style={{ flexWrap: "wrap" }}>
      {items.map((item) => {
        const active = item.end ? pathname === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`);
        return <Link key={item.path} to={item.path} className={`tab-btn${active ? " active" : ""}`}>{item.icon} {item.label}</Link>;
      })}
    </div>
  );
}
