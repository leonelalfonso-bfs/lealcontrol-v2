import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { CustomerSummary, Product } from "../api/types";
import { EntityPicker } from "./ui/EntityPicker";

/** Forma mínima de un cliente/proveedor para el selector (sirve CustomerSummary, Supplier o CustomerDetail). */
export type PartyOption = Pick<CustomerSummary, "id" | "legalName" | "documentNumber"> & {
  tradeName?: string | null;
  taxCondition?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type PartyRole = "customer" | "supplier" | "all";

const taxConditionLabels: Record<string, string> = {
  ResponsableInscripto: "Resp. Inscripto",
  Monotributo: "Monotributo",
  Exento: "Exento",
  ConsumidorFinal: "Consumidor final",
  NoResponsable: "No responsable"
};

export function formatCuit(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D+/g, "");
  return digits.length === 11 ? `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` : value ?? "";
}

function initials(name: string): string {
  const words = name
    .replace(/\b(S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?S\.?|LTDA\.?)\b/gi, "")
    .split(/\s+/)
    .filter((w) => /[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(w));
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "·";
}

const partyTitle = (p: PartyOption) => p.tradeName?.trim() || p.legalName;
const partySubtitle = (p: PartyOption) => {
  const parts = [p.tradeName?.trim() && p.tradeName !== p.legalName ? p.legalName : null, formatCuit(p.documentNumber)];
  const tax = p.taxCondition ? taxConditionLabels[p.taxCondition] ?? p.taxCondition : null;
  if (tax) parts.push(tax);
  return parts.filter(Boolean).join(" · ");
};

type CustomerPickerProps = {
  value: string | null | undefined;
  onChange: (id: string, party: PartyOption | null) => void;
  role?: PartyRole;
  /** Lista ya cargada: si se pasa, filtra localmente en vez de buscar en el servidor. */
  options?: readonly PartyOption[];
  placeholder?: string;
  onCreate?: (query: string) => void;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
  "aria-label"?: string;
};

/**
 * Selector de clientes / proveedores con la búsqueda común: razón social, nombre de fantasía,
 * CUIT con o sin guiones, email y teléfono. Busca en el servidor, así no depende de cuántos
 * registros traiga la pantalla.
 */
export function CustomerPicker({
  value,
  onChange,
  role = "customer",
  options,
  placeholder,
  onCreate,
  required,
  disabled,
  compact,
  id,
  "aria-label": ariaLabel
}: CustomerPickerProps) {
  const [selected, setSelected] = useState<PartyOption | null>(null);

  // Al editar un documento existente, resolver el nombre del cliente aunque no esté en la primera página.
  useEffect(() => {
    if (!value || options?.some((o) => o.id === value) || selected?.id === value) return;
    let cancelled = false;
    api
      .getCustomer(value)
      .then((detail) => {
        if (!cancelled) setSelected(detail);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value, options, selected?.id]);

  const loadOptions = useCallback(
    (query: string) =>
      api.listCustomers(query, role === "all" ? "all" : role).then((page) => page.items as PartyOption[]),
    [role]
  );

  const noun = role === "supplier" ? "proveedor" : role === "all" ? "empresa" : "cliente";

  return (
    <EntityPicker<PartyOption>
      id={id}
      aria-label={ariaLabel ?? `Elegir ${noun}`}
      value={value}
      onChange={(next, party) => {
        setSelected(party);
        onChange(next, party);
      }}
      options={options}
      loadOptions={options ? undefined : loadOptions}
      selectedItem={selected}
      getId={(p) => p.id}
      getTitle={partyTitle}
      getSubtitle={partySubtitle}
      getBadge={(p) => initials(partyTitle(p))}
      getSearchFields={(p) => [p.legalName, p.tradeName, p.documentNumber, p.email, p.phone]}
      placeholder={placeholder ?? `Elegir ${noun}…`}
      searchPlaceholder={`Buscar ${noun} por nombre, CUIT, email o teléfono`}
      emptyText={`No hay ${noun === "empresa" ? "empresas" : `${noun}es`}`}
      onCreate={onCreate}
      createLabel={(q) => (q ? `Crear ${noun} “${q}”` : `Crear ${noun} nuevo`)}
      required={required}
      disabled={disabled}
      compact={compact}
    />
  );
}

const currencySymbol: Record<string, string> = { ARS: "$", USD_BILLETE: "US$", USD_DIVISA: "US$" };

export function formatProductPrice(p: Pick<Product, "saleCurrency" | "basePrice">): string {
  const symbol = currencySymbol[p.saleCurrency] ?? p.saleCurrency;
  return `${symbol} ${Number(p.basePrice ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type ProductPickerProps = {
  value: string | null | undefined;
  onChange: (id: string, product: Product | null) => void;
  /** Catálogo ya cargado por la pantalla. */
  products: readonly Product[];
  placeholder?: string;
  /** Qué precio mostrar a la derecha: venta (por defecto), costo o ninguno. */
  price?: "sale" | "cost" | "none";
  onCreate?: (query: string) => void;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
  "aria-label"?: string;
};

/** Selector de productos con la búsqueda común: código, nombre, descripción y categoría. */
export function ProductPicker({
  value,
  onChange,
  products,
  placeholder = "Buscar en el catálogo…",
  price = "sale",
  onCreate,
  required,
  disabled,
  compact = true,
  id,
  "aria-label": ariaLabel
}: ProductPickerProps) {
  return (
    <EntityPicker<Product>
      id={id}
      aria-label={ariaLabel ?? "Elegir producto"}
      value={value}
      onChange={onChange}
      options={products}
      getId={(p) => p.id}
      getTitle={(p) => p.name}
      getSubtitle={(p) => [p.code, p.categoryName, p.trackStock ? `stock ${p.stock} ${p.baseUnit ?? ""}`.trim() : null].filter(Boolean).join(" · ")}
      getMeta={(p) =>
        price === "none"
          ? null
          : price === "cost"
            ? formatProductPrice({ saleCurrency: p.purchaseCurrency, basePrice: p.costPrice })
            : formatProductPrice(p)
      }
      getSearchFields={(p) => [p.code, p.name, p.description, p.categoryName]}
      placeholder={placeholder}
      searchPlaceholder="Buscar por código, nombre o descripción"
      emptyText="No hay productos"
      onCreate={onCreate}
      createLabel={(q) => (q ? `Crear producto “${q}”` : "Crear producto nuevo")}
      required={required}
      disabled={disabled}
      compact={compact}
    />
  );
}
