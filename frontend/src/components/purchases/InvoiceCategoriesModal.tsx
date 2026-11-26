import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { ExpenseCategory, PurchaseInvoice } from "../../api/types";
import { Modal } from "../ui/Modal";

/** Rubro (Producto/Gasto del Libro IVA Compras) de cada renglón de una factura ya cargada. */
export function InvoiceCategoriesModal({ invoice, onClose, onSaved }: {
  invoice: PurchaseInvoice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [lines, setLines] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) return;
    setError(null);
    setLines(Object.fromEntries(invoice.items.map((i) => [i.id, i.expenseCategoryId ?? ""])));
    api.listExpenseCategories().then(setCategories).catch(() => setCategories([]));
  }, [invoice]);

  if (!invoice) return null;
  const active = categories.filter((c) => c.isActive || Object.values(lines).includes(c.id));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.categorizePurchaseInvoice(invoice.id,
        invoice.items.map((i) => ({ itemId: i.id, expenseCategoryId: lines[i.id] || null })));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el rubro.");
    } finally {
      setSaving(false);
    }
  };

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} style={{ width: "100%" }}>
      <option value="">—</option>
      {active.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
    </select>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`🏷 Rubro · ${invoice.supplierName} ${invoice.formattedNumber}`}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      {error && <div className="alert">{error}</div>}
      {categories.length === 0 ? (
        <p className="muted">Todavía no hay rubros: dalos de alta con el ⚙ de la columna “Rubro” en una factura nueva.</p>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {invoice.items.length > 1 && (
            <label>
              Todos los renglones
              {select("", (v) => setLines(Object.fromEntries(invoice.items.map((i) => [i.id, v]))), "Rubro de todos los renglones")}
            </label>
          )}
          {invoice.items.map((item) => (
            <label key={item.id}>
              {item.description || item.code} <span className="muted">· neto {item.netSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              {select(lines[item.id] ?? "", (v) => setLines({ ...lines, [item.id]: v }), `Rubro de ${item.description || item.code}`)}
            </label>
          ))}
          <p className="muted t-small" style={{ margin: 0 }}>El rubro no cambia importes ni el asiento: se puede asignar aunque la factura ya esté contabilizada.</p>
        </div>
      )}
    </Modal>
  );
}
