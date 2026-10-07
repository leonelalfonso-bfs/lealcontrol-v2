import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { moduleHue, type ModuleDefinition } from "../../app/moduleRegistry";
import type { QuickAction } from "../../app/quickActions";
import { highlightSearch, matchesSearch, parseSearch, type SearchToken } from "../../lib/search";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { formatCuit, formatProductPrice } from "../pickers";
import { Icon, type IconName } from "../ui/Icon";
import "../../styles/instrumento.css";
import "../../styles/shell.css";

export type RecentPage = { path: string; title: string; moduleLabel: string; glyph: IconName; moduleId?: string };

type Entry = {
  key: string;
  section: string;
  title: string;
  sub?: string | null;
  meta?: string | null;
  glyph?: IconName;
  badge?: string;
  /** Color del módulo al que pertenece la entrada. */
  hue?: string;
  /** Palabras que también encuentran la entrada pero no se muestran. */
  keywords?: string;
  run: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  modules: readonly ModuleDefinition[];
  actions: readonly QuickAction[];
  recent: readonly RecentPage[];
  canSearchParties: boolean;
  canSearchProducts: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
};

const MAX_REMOTE = 5;

function Highlighted({ text, tokens }: { text: string; tokens: SearchToken[] }): ReactNode {
  return highlightSearch(text, tokens).map((part, index) =>
    part.match ? (
      <mark key={index} className="ins-mark">
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    )
  );
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(w));
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "·";
}

/**
 * Buscador universal (⌘K / Ctrl+K): pantallas, altas rápidas, clientes y productos en un solo lugar,
 * con la misma regla de búsqueda que el resto del sistema.
 */
export function CommandPalette({
  open,
  onClose,
  modules,
  actions,
  recent,
  canSearchParties,
  canSearchProducts,
  isDark,
  onToggleTheme,
  onLogout
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [parties, setParties] = useState<Entry[]>([]);
  const [products, setProducts] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const debounced = useDebouncedValue(query.trim(), 200);
  const tokens = useMemo(() => parseSearch(query), [query]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => restoreFocus.current?.focus?.();
  }, [open]);

  // Clientes y productos: búsqueda en el servidor con la regla común (solo con 2+ letras).
  useEffect(() => {
    if (!open || debounced.length < 2) {
      setParties([]);
      setProducts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const partyRequest = canSearchParties
      ? api.listCustomers(debounced, "all").then((page) =>
          page.items.slice(0, MAX_REMOTE).map<Entry>((p) => ({
            key: `party-${p.id}`,
            section: "Empresas",
            title: p.tradeName?.trim() || p.legalName,
            sub: [p.tradeName && p.tradeName !== p.legalName ? p.legalName : null, formatCuit(p.documentNumber)]
              .filter(Boolean)
              .join(" · "),
            meta: p.isCustomer && p.isSupplier ? "cliente y proveedor" : p.isSupplier ? "proveedor" : "cliente",
            badge: initials(p.tradeName?.trim() || p.legalName),
            hue: moduleHue("directorio"),
            run: () => go(`/clientes/${p.id}`)
          }))
        )
      : Promise.resolve<Entry[]>([]);
    const productRequest = canSearchProducts
      ? api.listProducts(debounced).then((list) =>
          list.slice(0, MAX_REMOTE).map<Entry>((p) => ({
            key: `product-${p.id}`,
            section: "Productos",
            title: p.name,
            sub: [p.code, p.categoryName].filter(Boolean).join(" · "),
            meta: formatProductPrice(p),
            glyph: "package",
            hue: moduleHue("inventario"),
            run: () => go(`/productos/${p.id}/editar`)
          }))
        )
      : Promise.resolve<Entry[]>([]);
    Promise.allSettled([partyRequest, productRequest]).then(([partyResult, productResult]) => {
      if (cancelled) return;
      setParties(partyResult.status === "fulfilled" ? partyResult.value : []);
      setProducts(productResult.status === "fulfilled" ? productResult.value : []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // go/navigate son estables a efectos de esta búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debounced, canSearchParties, canSearchProducts]);

  const localEntries = useMemo<Entry[]>(() => {
    const create: Entry[] = actions.map((action) => ({
      key: `create-${action.id}`,
      section: "Crear",
      title: action.title,
      keywords: action.keywords,
      glyph: action.glyph,
      hue: moduleHue(action.moduleId),
      run: () => go(action.path)
    }));
    const pages: Entry[] = modules.flatMap((module) =>
      module.items.map((item) => ({
        key: `page-${item.path}`,
        section: "Ir a",
        title: item.label,
        sub: module.label,
        glyph: module.glyph,
        hue: moduleHue(module.id),
        run: () => go(item.path)
      }))
    );
    const system: Entry[] = [
      { key: "sys-theme", section: "Sistema", title: isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro", glyph: isDark ? "sun" : "moon", run: () => { onToggleTheme(); onClose(); } },
      { key: "sys-themes", section: "Sistema", title: "Personalizar tema", glyph: "palette", run: () => go("/estilos") },
      { key: "sys-logout", section: "Sistema", title: "Cerrar sesión", glyph: "logOut", run: () => { onClose(); onLogout(); } }
    ];
    return [...create, ...pages, ...system];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, modules, isDark]);

  const entries = useMemo<Entry[]>(() => {
    if (tokens.length === 0) {
      const recentEntries: Entry[] = recent.map((page) => ({
        key: `recent-${page.path}`,
        section: "Recientes",
        title: page.title,
        sub: page.moduleLabel,
        glyph: page.glyph,
        hue: page.moduleId ? moduleHue(page.moduleId) : undefined,
        run: () => go(page.path)
      }));
      const create = localEntries.filter((e) => e.section === "Crear").slice(0, 5);
      const modulesEntries: Entry[] = modules.map((module) => ({
        key: `module-${module.id}`,
        section: "Módulos",
        title: module.label,
        sub: module.title.charAt(0) + module.title.slice(1).toLowerCase(),
        glyph: module.glyph,
        hue: moduleHue(module.id),
        run: () => go(module.defaultPath)
      }));
      return [...recentEntries, ...create, ...modulesEntries];
    }
    const local = localEntries.filter((e) => matchesSearch(tokens, e.title, e.sub, e.section, e.keywords));
    const order = ["Crear", "Ir a", "Sistema"];
    local.sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
    return [...parties, ...products, ...local.slice(0, 14)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, localEntries, recent, modules, parties, products]);

  useEffect(() => setActive(0), [query, parties.length, products.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (entries.length ? (i + 1) % entries.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      entries[active]?.run();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  let lastSection = "";
  return createPortal(
    <div className="ins-cmdk-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ins-cmdk" role="dialog" aria-modal="true" aria-label="Buscador universal">
        <div className="ins-search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Buscá una pantalla, un cliente, un producto o qué querés crear…"
            aria-label="Buscar en todo el sistema"
            aria-controls="ins-cmdk-list"
            aria-activedescendant={entries.length ? `ins-cmdk-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {loading && <span className="ins-search__spinner" aria-label="Buscando" />}
          <kbd className="ins-kbd" aria-hidden="true">esc</kbd>
        </div>

        <ul ref={listRef} id="ins-cmdk-list" role="listbox" className="ins-cmdk__list" aria-label="Resultados">
          {entries.map((entry, index) => {
            const header = entry.section !== lastSection ? entry.section : null;
            lastSection = entry.section;
            return (
              <li key={entry.key} role="presentation">
                {header && <span className="ins-cmdk__section">{header}</span>}
                <div
                  id={`ins-cmdk-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  className={`ins-cmdk__item${index === active ? " ins-cmdk__item--active" : ""}`}
                  onPointerMove={() => setActive(index)}
                  onClick={() => entry.run()}
                >
                  <span
                    className={`ins-cmdk__glyph${entry.hue ? " ins-cmdk__glyph--hue" : ""}`}
                    style={entry.hue ? ({ "--mod": entry.hue } as CSSProperties) : undefined}
                  >
                    {entry.glyph ? <Icon name={entry.glyph} size={16} /> : entry.badge}
                  </span>
                  <span className="ins-cmdk__body">
                    <span className="ins-cmdk__title">
                      <Highlighted text={entry.title} tokens={tokens} />
                    </span>
                    {entry.sub && (
                      <span className="ins-cmdk__sub">
                        <Highlighted text={entry.sub} tokens={tokens} />
                      </span>
                    )}
                  </span>
                  {entry.meta && <span className="ins-cmdk__meta">{entry.meta}</span>}
                </div>
              </li>
            );
          })}
          {entries.length === 0 && !loading && (
            <li className="ins-cmdk__empty" role="presentation">
              Nada coincide con “{query.trim()}”. Probá con otra palabra o con parte del CUIT.
            </li>
          )}
        </ul>

        <div className="ins-cmdk__footer" aria-hidden="true">
          <span><kbd className="ins-kbd">↑↓</kbd> moverse</span>
          <span><kbd className="ins-kbd">↵</kbd> abrir</span>
          <span><kbd className="ins-kbd">esc</kbd> cerrar</span>
          <span>Abrí este buscador desde cualquier pantalla con <kbd className="ins-kbd">Ctrl K</kbd></span>
        </div>
      </div>
    </div>,
    document.body
  );
}
