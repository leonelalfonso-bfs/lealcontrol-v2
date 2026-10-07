import { useEffect, useState } from "react";

/**
 * Devuelve `value` recién cuando dejó de cambiar durante `delayMs`.
 * Para búsquedas contra el servidor: una consulta al terminar de escribir, no una por tecla.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
