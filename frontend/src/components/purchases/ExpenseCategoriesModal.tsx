import { useState } from "react";
import { api } from "../../api/client";
import type { ExpenseCategory } from "../../api/types";
import { Modal } from "../ui/Modal";

/**
 * Rubros de compra o gasto: el "Producto/Gasto" que el estudio lee en el Libro IVA Compras
 * (por ejemplo PAP · Papelería). Se dan de alta acá y se eligen en cada renglón de la factura.
 */
export function ExpenseCategoriesModal({ open, onClose, categories, onChange }: {
  open: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
  onChange: (categories: ExpenseCategory[]) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async (body: { id?: string; code: string; name: string; isActive?: boolean }) => {
    setError(null);
    try {
      const saved = await api.saveExpenseCategory(body);
      const rest = categories.filter((c) => c.id !== saved.id);
      onChange([...rest, saved].sort((a, b) => a.code.localeCompare(b.code)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el rubro.");
      return false;
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await save({ code, name })) {
      setCode("");
      setName("");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="🏷 Rubros de compra / gasto">
      <p className="muted t-small" style={{ marginTop: 0 }}>
        Usá los mismos códigos que el estudio (por ejemplo PAP, GMR, SEG): el Libro IVA Compras los muestra como “[PAP] PAPELERIA…”.
      </p>
      {error && <div className="alert">{error}</div>}
      <form onSubmit={add} className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código" maxLength={12} required style={{ width: 100 }} aria-label="Código del rubro" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" required style={{ flex: 1, minWidth: 160 }} aria-label="Nombre del rubro" />
        <button type="submit" className="btn">Agregar</button>
      </form>
      {categories.length === 0 ? (
        <p className="muted">Todavía no hay rubros.</p>
      ) : (
        <table>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.5 }}>
                <td className="t-strong" style={{ width: 90 }}>{c.code}</td>
                <td>{c.name}</td>
                <td className="t-right">
                  <button type="button" className="btn ghost" onClick={() => void save({ ...c, isActive: !c.isActive })}>
                    {c.isActive ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
