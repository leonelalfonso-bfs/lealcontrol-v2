import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { MODULE_AREAS, moduleHue, type ModuleDefinition, type NavigationItem } from "../../app/moduleRegistry";
import { allowedQuickActions } from "../../app/quickActions";
import { useTheme } from "../../context/ThemeContext";
import { tenantTitle } from "../../utils/tenantLabel";
import { CommunicationsNotificationBell } from "../CommunicationsNotificationBell";
import { Icon } from "../ui/Icon";
import { CommandPalette, type RecentPage } from "./CommandPalette";
import "../../styles/instrumento.css";
import "../../styles/shell.css";

type TenantOption = { id: string; legalName: string; tradeName?: string | null; documentNumber?: string | null };

type AppShellProps = {
  children: ReactNode;
  modules: readonly ModuleDefinition[];
  activeModule: ModuleDefinition;
  allowedModuleIds: readonly string[];
  companyName: string;
  companyLogo: string | null;
  tenant: TenantOption | null | undefined;
  availableTenants: readonly TenantOption[];
  onSwitchTenant: (tenantId: string) => void;
  userName: string;
  userRole: string;
  onLogout: () => void;
  hasCommunications: boolean;
  communicationsUnread: number;
  presentation: {
    canToggle: boolean;
    active: boolean;
    loading: boolean;
    onToggle: () => void;
  };
};

const RECENT_KEY = "ins-recent-pages";
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Almacenamiento no disponible (modo privado): solo se pierde la preferencia.
  }
}

/** Ítem del módulo que corresponde a la ruta actual (el prefijo más largo). */
function resolveActiveItem(module: ModuleDefinition, pathname: string): NavigationItem | null {
  let best: NavigationItem | null = null;
  for (const item of module.items) {
    const matches = item.end || item.path === "/" ? pathname === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`);
    if (matches && (!best || item.path.length > best.path.length)) best = item;
  }
  return best;
}

/** Último tramo de la ubicación cuando la ruta va más allá del ítem del menú. */
function resolveLeafLabel(itemPath: string | undefined, pathname: string): string | null {
  if (!itemPath || pathname === itemPath || !pathname.startsWith(itemPath)) return null;
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  if (last === "nuevo" || last === "nueva") return "Nuevo";
  if (last === "editar") return "Editar";
  if (last === "imprimir" || last === "pdf") return "Vista de impresión";
  return "Detalle";
}

function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "·";
}

const LogoMark = () => (
  <svg className="ins-brand__mark" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <defs>
      <linearGradient id="ins-logo-gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#10b981" />
        <stop offset="1" stopColor="#0e7490" />
      </linearGradient>
    </defs>
    <rect width="28" height="28" rx="7" fill="url(#ins-logo-gradient)" />
    <path d="M8 19a8 8 0 0 1 12-6.9" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 19l4.5-5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    <circle cx="14" cy="19" r="1.8" fill="#fff" />
  </svg>
);

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/**
 * Estructura "Instrumento": menú lateral con todos los módulos agrupados por área,
 * barra superior con ubicación, buscador ⌘K y altas rápidas.
 */
export function AppShell({
  children,
  modules,
  activeModule,
  allowedModuleIds,
  companyName,
  companyLogo,
  tenant,
  availableTenants,
  onSwitchTenant,
  userName,
  userRole,
  onLogout,
  hasCommunications,
  communicationsUnread,
  presentation
}: AppShellProps) {
  const location = useLocation();
  const { isDark, toggleMode } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentPage[]>(() => readJson<RecentPage[]>(RECENT_KEY, []));
  const companyMenu = usePopover();
  const userMenu = usePopover();
  const newMenu = usePopover();

  const actions = useMemo(() => allowedQuickActions(allowedModuleIds), [allowedModuleIds]);
  const activeItem = resolveActiveItem(activeModule, location.pathname);
  const leafLabel = resolveLeafLabel(activeItem?.path, location.pathname);

  // Acordeón: al cambiar de módulo se despliega solo el actual (los demás se abren a mano).
  useEffect(() => {
    setExpanded([activeModule.id]);
  }, [activeModule.id]);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // El ítem activo siempre visible dentro del menú.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const target = navRef.current?.querySelector<HTMLElement>(".ins-nav__item.active, .ins-nav__module--current, .ins-nav__module--solo.active");
    target?.scrollIntoView({ block: "nearest" });
  }, [activeModule.id, location.pathname, expanded]);

  // Pantallas recientes para el ⌘K.
  useEffect(() => {
    const title = activeItem?.label ?? activeModule.label;
    const entry: RecentPage = {
      path: location.pathname,
      title,
      moduleLabel: activeModule.label,
      glyph: activeModule.glyph,
      moduleId: activeModule.id
    };
    setRecent((prev) => {
      const next = [entry, ...prev.filter((p) => p.path !== entry.path)].slice(0, 5);
      writeJson(RECENT_KEY, next);
      return next;
    });
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/⌘ + K abre el buscador desde cualquier pantalla.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleModule = useCallback((id: string) => {
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const grouped = MODULE_AREAS.map((area) => ({ ...area, modules: modules.filter((m) => m.area === area.id) })).filter(
    (area) => area.modules.length > 0
  );

  const currentTenantId = tenant?.id ?? "";
  const canSwitch = availableTenants.length > 1;
  const shortcutLabel = isMac ? "⌘K" : "Ctrl K";

  return (
    <div
      className={`ins-shell${drawerOpen ? " ins-shell--drawer" : ""}`}
      style={{ "--mod-current": moduleHue(activeModule.id) } as CSSProperties}
    >
      <div className="ins-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <aside className="ins-sidebar" aria-label="Menú principal">
        <Link to="/" className="ins-brand" aria-label="Leal Control, ir al inicio">
          <LogoMark />
          <span className="ins-brand__name">
            <strong>Leal Control</strong>
            <span>ERP industrial</span>
          </span>
        </Link>

        <div className="ins-company" ref={companyMenu.ref}>
          <button
            type="button"
            className="ins-company__button"
            aria-haspopup={canSwitch ? "menu" : undefined}
            aria-expanded={canSwitch ? companyMenu.open : undefined}
            aria-disabled={!canSwitch}
            title={canSwitch ? "Cambiar de empresa" : undefined}
            onClick={() => canSwitch && companyMenu.setOpen((v) => !v)}
          >
            <span className="ins-company__logo">
              {companyLogo ? <img src={companyLogo} alt="" /> : initials(companyName)}
            </span>
            <span className="ins-company__text">
              <strong>{companyName}</strong>
              {tenant?.documentNumber && <span>{tenant.documentNumber}</span>}
            </span>
            {canSwitch && <Icon name="upDown" size={16} style={{ color: "var(--ins-ink-3)" }} />}
          </button>
          {companyMenu.open && (
            <div className="ins-popover" role="menu" style={{ top: "calc(100% + 6px)", left: 0, right: 0 }}>
              <span className="ins-popover__label">Tus empresas</span>
              {availableTenants.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={t.id === currentTenantId}
                  className={`ins-menu-item${t.id === currentTenantId ? " ins-menu-item--active" : ""}`}
                  onClick={() => {
                    companyMenu.setOpen(false);
                    if (t.id !== currentTenantId) onSwitchTenant(t.id);
                  }}
                >
                  <span className="ins-company__logo" style={{ width: 26, height: 26, fontSize: 11 }}>{initials(tenantTitle(t))}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tenantTitle(t)}</span>
                  {t.id === currentTenantId && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="ins-cmdk-trigger" onClick={() => setPaletteOpen(true)}>
          <Icon name="search" size={16} />
          <span>Buscar o ir a…</span>
          <kbd className="ins-kbd">{shortcutLabel}</kbd>
        </button>

        <nav className="ins-nav" aria-label="Módulos" ref={navRef}>
          {grouped.map((area) => (
            <div key={area.id} className="ins-nav__group">
              <span className="ins-nav__group-label">{area.label}</span>
              {area.modules.map((module) => {
                const isCurrent = module.id === activeModule.id;
                const solo = module.items.length <= 1;
                if (solo) {
                  const target = module.items[0]?.path ?? module.defaultPath;
                  return (
                    <NavLink
                      key={module.id}
                      to={target}
                      end
                      style={{ "--mod": moduleHue(module.id) } as CSSProperties}
                      className={({ isActive }) => `ins-nav__module ins-nav__module--solo${isActive ? " active" : ""}`}
                    >
                      <span className="ins-nav__tile">
                        <Icon name={module.glyph} size={16} />
                      </span>
                      <span className="ins-nav__label">{module.label}</span>
                    </NavLink>
                  );
                }
                const isOpen = expanded.includes(module.id);
                const listId = `ins-nav-${module.id}`;
                return (
                  <div key={module.id} style={{ "--mod": moduleHue(module.id) } as CSSProperties}>
                    <button
                      type="button"
                      className={`ins-nav__module${isCurrent ? " ins-nav__module--current" : ""}`}
                      aria-expanded={isOpen}
                      aria-controls={listId}
                      onClick={() => toggleModule(module.id)}
                    >
                      <span className="ins-nav__tile">
                        <Icon name={module.glyph} size={16} />
                      </span>
                      <span className="ins-nav__label">{module.label}</span>
                      {module.id === "comunicaciones" && communicationsUnread > 0 && (
                        <span className="ins-nav__badge">{communicationsUnread > 99 ? "99+" : communicationsUnread}</span>
                      )}
                      <Icon name="chevronRight" size={14} className="ins-nav__chevron" />
                    </button>
                    {isOpen && (
                      <div id={listId} className="ins-nav__items">
                        {module.items.map((item) => {
                          const isHelp = item.label.toLowerCase().startsWith("ayuda");
                          return (
                            <NavLink
                              key={item.path}
                              to={item.path}
                              end={item.end}
                              className={({ isActive }) =>
                                `ins-nav__item${isHelp ? " ins-nav__item--help" : ""}${isActive ? " active" : ""}`
                              }
                            >
                              {isHelp && <Icon name="help" size={14} />}
                              <span className="ins-nav__label">{isHelp ? "Ayuda" : item.label}</span>
                              {item.path === "/comunicaciones" && communicationsUnread > 0 && (
                                <span className="ins-nav__badge">{communicationsUnread > 99 ? "99+" : communicationsUnread}</span>
                              )}
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="ins-sidebar__footer">
          {hasCommunications && <CommunicationsNotificationBell />}
          {presentation.canToggle && (
            <button
              type="button"
              className={`ins-presentation${presentation.active ? " ins-presentation--on" : ""}`}
              disabled={presentation.loading}
              onClick={presentation.onToggle}
              title={presentation.active ? "Salir del modo presentación (requiere contraseña)" : "Mostrar solo Calidad y Metrología, en modo lectura, para una auditoría"}
            >
              <Icon name="presentation" size={16} />
              {presentation.active ? "Salir del modo presentación" : "Modo presentación · auditoría"}
            </button>
          )}
          <div className="ins-user" ref={userMenu.ref}>
            <button
              type="button"
              className="ins-user__button"
              aria-haspopup="menu"
              aria-expanded={userMenu.open}
              onClick={() => userMenu.setOpen((v) => !v)}
            >
              <span className="ins-avatar">{initials(userName)}</span>
              <span className="ins-user__text">
                <strong>{userName}</strong>
                <span>{presentation.active ? "Presentación · solo lectura" : userRole}</span>
              </span>
              <Icon name="upDown" size={16} style={{ color: "var(--ins-ink-3)" }} />
            </button>
            {userMenu.open && (
              <div className="ins-popover" role="menu" style={{ bottom: "calc(100% + 6px)", left: 0, right: 0 }}>
                <button type="button" role="menuitem" className="ins-menu-item" onClick={() => { toggleMode(); userMenu.setOpen(false); }}>
                  <Icon name={isDark ? "sun" : "moon"} size={16} />
                  {isDark ? "Modo claro" : "Modo oscuro"}
                </button>
                <Link role="menuitem" className="ins-menu-item" to="/estilos" onClick={() => userMenu.setOpen(false)}>
                  <Icon name="palette" size={16} />
                  Personalizar tema
                </Link>
                <Link role="menuitem" className="ins-menu-item" to="/configuracion" onClick={() => userMenu.setOpen(false)}>
                  <Icon name="settings" size={16} />
                  Configuración
                </Link>
                <div className="ins-menu-sep" />
                <button type="button" role="menuitem" className="ins-menu-item ins-menu-item--danger" onClick={onLogout}>
                  <Icon name="logOut" size={16} />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="ins-main-column">
        <header className="ins-topbar">
          <button type="button" className="ins-icon-btn ins-topbar__menu" aria-label="Abrir menú" onClick={() => setDrawerOpen(true)}>
            <Icon name="menu" />
          </button>
          <nav className="ins-crumbs" aria-label="Ubicación">
            <span className="ins-crumbs__tile" aria-hidden="true">
              <Icon name={activeModule.glyph} size={14} />
            </span>
            {activeItem && activeModule.items.length > 1 ? (
              <>
                <Link to={activeModule.defaultPath}>{activeModule.label}</Link>
                <span className="ins-crumbs__sep" aria-hidden="true">/</span>
                {leafLabel ? <Link to={activeItem.path}>{activeItem.label}</Link> : <strong aria-current="page">{activeItem.label}</strong>}
              </>
            ) : (
              <strong aria-current={leafLabel ? undefined : "page"}>{activeModule.label}</strong>
            )}
            {leafLabel && (
              <>
                <span className="ins-crumbs__sep" aria-hidden="true">/</span>
                <strong aria-current="page">{leafLabel}</strong>
              </>
            )}
          </nav>
          <button type="button" className="ins-search-pill" onClick={() => setPaletteOpen(true)} aria-label="Abrir buscador universal">
            <Icon name="search" size={16} />
            <span>Buscar…</span>
            <kbd className="ins-kbd">{shortcutLabel}</kbd>
          </button>
          {hasCommunications && (
            <Link to="/comunicaciones" className="ins-icon-btn" aria-label={communicationsUnread > 0 ? `Bandeja: ${communicationsUnread} sin leer` : "Bandeja"}>
              <Icon name="bell" />
              {communicationsUnread > 0 && <span className="ins-icon-btn__dot" aria-hidden="true" />}
            </Link>
          )}
          <button type="button" className="ins-icon-btn" onClick={toggleMode} aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={isDark ? "Modo claro" : "Modo oscuro"}>
            <Icon name={isDark ? "sun" : "moon"} />
          </button>
          {actions.length > 0 && !presentation.active && (
            <div className="ins-new" ref={newMenu.ref}>
              <button type="button" className="ins-new__button" aria-haspopup="menu" aria-expanded={newMenu.open} onClick={() => newMenu.setOpen((v) => !v)}>
                <Icon name="plus" size={16} strokeWidth={2.2} />
                <span>Nuevo</span>
              </button>
              {newMenu.open && (
                <div className="ins-popover" role="menu">
                  <span className="ins-popover__label">Crear</span>
                  {actions.slice(0, 9).map((action) => (
                    <Link
                      key={action.id}
                      role="menuitem"
                      to={action.path}
                      className="ins-menu-item"
                      style={{ "--mod": moduleHue(action.moduleId) } as CSSProperties}
                      onClick={() => newMenu.setOpen(false)}
                    >
                      <span className="ins-menu-item__tile">
                        <Icon name={action.glyph} size={15} />
                      </span>
                      {action.label}
                    </Link>
                  ))}
                  <div className="ins-menu-sep" />
                  <button type="button" className="ins-menu-item" onClick={() => { newMenu.setOpen(false); setPaletteOpen(true); }}>
                    <Icon name="search" size={16} style={{ color: "var(--ins-ink-3)" }} />
                    Más opciones
                    <span className="ins-menu-item__meta">{shortcutLabel}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {children}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        modules={modules}
        actions={presentation.active ? [] : actions}
        recent={recent.filter((r) => r.path !== location.pathname)}
        canSearchParties={!presentation.active && allowedModuleIds.includes("directorio")}
        canSearchProducts={!presentation.active && (allowedModuleIds.includes("inventario") || allowedModuleIds.includes("ventas"))}
        isDark={isDark}
        onToggleTheme={toggleMode}
        onLogout={onLogout}
      />
    </div>
  );
}
