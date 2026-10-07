import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent } from "react";
import "../../styles/instrumento.css";

type SearchFieldProps = {
  value: string;
  /** Cada tecla: actualiza el texto del campo. */
  onChange: (value: string) => void;
  /** Búsqueda ya estabilizada (tras `debounceMs` sin escribir, o al apretar Enter). */
  onSearch?: (value: string) => void;
  placeholder?: string;
  /** Nombre accesible; por defecto el placeholder. */
  label?: string;
  /** Muestra "N resultados" a la derecha cuando hay texto. */
  resultCount?: number;
  loading?: boolean;
  debounceMs?: number;
  /** Atajo "/" para enfocar el campo (uno por pantalla). */
  shortcut?: boolean;
  autoFocus?: boolean;
  className?: string;
  style?: CSSProperties;
};

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Buscador de listados con la regla común del sistema (ver lib/search.ts):
 * busca mientras se escribe, Esc limpia, "/" enfoca desde cualquier parte de la pantalla.
 */
export function SearchField({
  value,
  onChange,
  onSearch,
  placeholder = "Buscar…",
  label,
  resultCount,
  loading = false,
  debounceMs = 250,
  shortcut = true,
  autoFocus = false,
  className,
  style
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const lastSearched = useRef(value);

  useEffect(() => {
    if (!onSearchRef.current || value === lastSearched.current) return;
    const timer = window.setTimeout(() => {
      lastSearched.current = value;
      onSearchRef.current?.(value);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [value, debounceMs]);

  useEffect(() => {
    if (!shortcut) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcut]);

  const searchNow = (next: string) => {
    lastSearched.current = next;
    onSearchRef.current?.(next);
  };

  const clear = () => {
    onChange("");
    searchNow("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchNow(value);
    } else if (event.key === "Escape" && value) {
      event.preventDefault();
      clear();
    }
  };

  const showCount = value.trim().length > 0 && resultCount !== undefined && !loading;

  return (
    <div role="search" className={`ins-search${className ? ` ${className}` : ""}`} style={style}>
      <SearchIcon />
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {loading && <span className="ins-search__spinner" aria-label="Buscando" />}
      {showCount && (
        <span className="ins-search__meta" aria-live="polite">
          {resultCount === 1 ? "1 resultado" : `${resultCount} resultados`}
        </span>
      )}
      {value ? (
        <button type="button" className="ins-search__clear" onClick={clear} aria-label="Limpiar búsqueda">
          <ClearIcon />
        </button>
      ) : (
        shortcut && <kbd className="ins-search__kbd" aria-hidden="true">/</kbd>
      )}
    </div>
  );
}
