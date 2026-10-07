import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { filterBySearch, highlightSearch, parseSearch, type SearchToken } from "../../lib/search";
import "../../styles/instrumento.css";

export type EntityPickerProps<T> = {
  /** Id seleccionado ("" o null si no hay selección). */
  value: string | null | undefined;
  onChange: (id: string, item: T | null) => void;
  getId: (item: T) => string;
  getTitle: (item: T) => string;
  getSubtitle?: (item: T) => string | null | undefined;
  /** Dato corto a la derecha (precio, saldo, stock), en mono tabular. */
  getMeta?: (item: T) => string | null | undefined;
  /** Iniciales o código corto para el cuadrito de la izquierda. */
  getBadge?: (item: T) => string | null | undefined;
  /** Lista ya cargada: se filtra localmente con la regla común. */
  options?: readonly T[];
  /** Campos buscables en modo local (por defecto título y subtítulo). */
  getSearchFields?: (item: T) => Array<string | number | null | undefined>;
  /** Búsqueda en el servidor (modo remoto). Recibe el texto ya estabilizado. */
  loadOptions?: (query: string) => Promise<readonly T[]>;
  /** Ítem seleccionado cuando no está en `options` (p. ej. al editar un documento). */
  selectedItem?: T | null;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Agrega "Crear …" al final de la lista. */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Variante baja para usar dentro de tablas (líneas de documentos). */
  compact?: boolean;
  allowClear?: boolean;
  maxResults?: number;
  id?: string;
  "aria-label"?: string;
};

const ChevronIcon = () => (
  <svg className="ins-picker__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m7 15 5 5 5-5" />
    <path d="m7 9 5-5 5 5" />
  </svg>
);

const CheckIcon = () => (
  <svg className="ins-picker__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12 5 5 9-10" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

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

type PanelPosition = { left: number; width: number; top?: number; bottom?: number; up: boolean };

const PANEL_HEIGHT = 420;

/**
 * Selector con búsqueda para clientes, proveedores y productos. Reemplaza al <select> largo:
 * se escribe para filtrar (regla común de lib/search.ts), ↑↓ para moverse, Enter para elegir,
 * Esc para cerrar. Funciona con una lista cargada (`options`) o buscando en el servidor (`loadOptions`).
 */
export function EntityPicker<T>({
  value,
  onChange,
  getId,
  getTitle,
  getSubtitle,
  getMeta,
  getBadge,
  options,
  getSearchFields,
  loadOptions,
  selectedItem,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Escribí para buscar…",
  emptyText = "Sin resultados",
  onCreate,
  createLabel = (query) => (query ? `Crear “${query}”` : "Crear nuevo"),
  required = false,
  disabled = false,
  invalid = false,
  compact = false,
  allowClear = true,
  maxResults = 60,
  id,
  "aria-label": ariaLabel
}: EntityPickerProps<T>) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const controlRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [remoteItems, setRemoteItems] = useState<readonly T[]>([]);
  const [loading, setLoading] = useState(false);
  const [remembered, setRemembered] = useState<T | null>(null);
  const requestSeq = useRef(0);

  const tokens = useMemo(() => parseSearch(query), [query]);

  const fieldsOf = useCallback(
    (item: T) => (getSearchFields ? getSearchFields(item) : [getTitle(item), getSubtitle?.(item)]),
    [getSearchFields, getTitle, getSubtitle]
  );

  const items = useMemo(() => {
    if (loadOptions) return remoteItems.slice(0, maxResults);
    return filterBySearch(options ?? [], query, fieldsOf).slice(0, maxResults);
  }, [loadOptions, remoteItems, options, query, fieldsOf, maxResults]);

  const current = useMemo<T | null>(() => {
    if (!value) return null;
    const pools: Array<readonly T[] | undefined> = [options, remoteItems];
    for (const pool of pools) {
      const found = pool?.find((item) => getId(item) === value);
      if (found) return found;
    }
    if (selectedItem && getId(selectedItem) === value) return selectedItem;
    if (remembered && getId(remembered) === value) return remembered;
    return null;
  }, [value, options, remoteItems, selectedItem, remembered, getId]);

  // Búsqueda remota con debounce y descarte de respuestas viejas.
  useEffect(() => {
    if (!open || !loadOptions) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      loadOptions(query.trim())
        .then((result) => {
          if (seq === requestSeq.current) setRemoteItems(result);
        })
        .catch(() => {
          if (seq === requestSeq.current) setRemoteItems([]);
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false);
        });
    }, query ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [open, query, loadOptions]);

  const createIndex = onCreate ? items.length : -1;
  const optionCount = items.length + (onCreate ? 1 : 0);

  useEffect(() => setActive(0), [query]);

  const measure = useCallback(() => {
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(rect.width, 400), window.innerWidth - 16);
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const up = spaceBelow < Math.min(PANEL_HEIGHT, 300) && rect.top > spaceBelow;
    setPosition(
      up
        ? { left: Math.max(8, left), width, bottom: window.innerHeight - rect.top + 6, up }
        : { left: Math.max(8, left), width, top: rect.bottom + 6, up }
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onScroll = (event: Event) => {
      if (panelRef.current && event.target instanceof Node && panelRef.current.contains(event.target)) return;
      measure();
    };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (controlRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  // El panel se monta cuando ya hay posición calculada: recién ahí existe el campo para enfocar.
  const panelReady = open && position !== null;
  useEffect(() => {
    if (panelReady) searchRef.current?.focus();
  }, [panelReady]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const openPanel = (seed = "") => {
    if (disabled) return;
    setQuery(seed);
    setOpen(true);
  };

  const close = (focusControl = true) => {
    setOpen(false);
    setPosition(null);
    if (focusControl) controlRef.current?.focus();
  };

  const pick = (item: T) => {
    setRemembered(item);
    onChange(getId(item), item);
    close();
  };

  const create = () => {
    const text = query.trim();
    close();
    onCreate?.(text);
  };

  const clear = () => {
    onChange("", null);
    controlRef.current?.focus();
  };

  const onControlKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (open || disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openPanel();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey && event.key !== " ") {
      event.preventDefault();
      openPanel(event.key);
    } else if ((event.key === "Backspace" || event.key === "Delete") && value && allowClear && !required) {
      event.preventDefault();
      clear();
    }
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (optionCount === 0 ? 0 : (index + 1) % optionCount));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (optionCount === 0 ? 0 : (index - 1 + optionCount) % optionCount));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, optionCount - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active === createIndex) create();
      else if (items[active]) pick(items[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close(false);
    }
  };

  const title = current ? getTitle(current) : "";
  const subtitle = current ? getSubtitle?.(current) : null;
  const showFooter = optionCount > 0;

  const classes = [
    "ins-picker",
    open && "ins-picker--open",
    disabled && "ins-picker--disabled",
    invalid && "ins-picker--invalid",
    compact && "ins-picker--compact"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <button
        ref={controlRef}
        id={id}
        type="button"
        className="ins-picker__control"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={onControlKeyDown}
      >
        {current ? (
          <span className="ins-picker__value">
            <span className="ins-picker__value-title">{title}</span>
            {subtitle && !compact && <span className="ins-picker__value-sub">{subtitle}</span>}
          </span>
        ) : value ? (
          <span className="ins-picker__placeholder">Cargando…</span>
        ) : (
          <span className="ins-picker__placeholder">{placeholder}</span>
        )}
        {value && allowClear && !required && !disabled ? (
          <span
            className="ins-search__clear"
            role="button"
            tabIndex={-1}
            aria-label="Quitar selección"
            onClick={(event) => {
              event.stopPropagation();
              clear();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
        ) : (
          <ChevronIcon />
        )}
      </button>

      {required && (
        <input
          className="ins-picker__native"
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value ?? ""}
          onChange={() => undefined}
          onFocus={() => controlRef.current?.focus()}
        />
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            className={`ins-picker__panel${position.up ? " ins-picker__panel--up" : ""}`}
            style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom }}
          >
            <div className="ins-search">
              <SearchIcon />
              <input
                ref={searchRef}
                type="search"
                role="searchbox"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                aria-activedescendant={optionCount > 0 ? `${listId}-${active}` : undefined}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
              />
              {loading && <span className="ins-search__spinner" aria-label="Buscando" />}
              <kbd className="ins-kbd" aria-hidden="true">esc</kbd>
            </div>

            <ul ref={listRef} id={listId} role="listbox" className="ins-picker__list" aria-label={ariaLabel ?? placeholder}>
              {items.map((item, index) => {
                const itemId = getId(item);
                const sub = getSubtitle?.(item);
                const meta = getMeta?.(item);
                const badge = getBadge?.(item);
                return (
                  <li
                    key={itemId}
                    id={`${listId}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={itemId === value}
                    className={`ins-picker__option${index === active ? " ins-picker__option--active" : ""}`}
                    onPointerMove={() => setActive(index)}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => pick(item)}
                  >
                    {badge && <span className="ins-picker__avatar">{badge}</span>}
                    <span className="ins-picker__option-body">
                      <span className="ins-picker__option-title">
                        <Highlighted text={getTitle(item)} tokens={tokens} />
                      </span>
                      {sub && (
                        <span className="ins-picker__option-sub">
                          <Highlighted text={sub} tokens={tokens} />
                        </span>
                      )}
                    </span>
                    {meta && <span className="ins-picker__option-meta">{meta}</span>}
                    {itemId === value && <CheckIcon />}
                  </li>
                );
              })}
              {items.length === 0 && !loading && (
                <li className="ins-picker__empty" role="presentation">
                  {query ? `${emptyText} para “${query.trim()}”` : emptyText}
                </li>
              )}
            </ul>

            {onCreate && (
              <button
                type="button"
                id={`${listId}-${createIndex}`}
                className={`ins-picker__create${active === createIndex ? " ins-picker__create--active" : ""}`}
                onPointerMove={() => setActive(createIndex)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={create}
              >
                <PlusIcon />
                {createLabel(query.trim())}
              </button>
            )}

            {showFooter && (
              <div className="ins-picker__footer" aria-hidden="true">
                <span>
                  <kbd className="ins-kbd">↑↓</kbd> moverse
                </span>
                <span>
                  <kbd className="ins-kbd">↵</kbd> elegir
                </span>
                <span>
                  <kbd className="ins-kbd">esc</kbd> cerrar
                </span>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
