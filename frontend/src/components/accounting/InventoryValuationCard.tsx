import { useState } from "react";
import { api } from "../../api/client";
import type { InventoryValuationPreview } from "../../api/types";
import { monthRangeAr } from "../../lib/dates";

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SOURCES: Record<string, string> = { LastPurchase: "Última compra", ProductCost: "Costo del producto", Missing: "Sin costo" };

/**
 * Costo de ventas por diferencia de inventario: las existencias a fin de mes, al último costo de compra; la
 * cuenta Mercaderías se ajusta a ese valor contra Costo de Mercaderías Vendidas.
 */
export function InventoryValuationCard() {
  const [date, setDate] = useState(monthRangeAr(1).to);
  const [usdRate, setUsdRate] = useState("");
  const [preview, setPreview] = useState<InventoryValuationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const body = () => {
    const rate = Number(usdRate.replace(",", "."));
    return rate > 1 ? { date, usdRate: rate } : { date };
  };

  const load = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      setPreview(await api.previewInventoryValuation(body()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron valuar las existencias.");
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!preview || !window.confirm(`¿Registrar el ajuste de existencias al ${date.split("-").reverse().join("/")}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.postInventoryValuation(body());
      setMsg(`✓ Ajuste registrado: asiento N° ${res.entryNumber}.`);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el ajuste.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card pad" style={{ border: "1px solid #b45309", background: "rgba(180, 83, 9, 0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: "28px" }}>📦</div>
        <div>
          <h3 style={{ margin: 0, color: "#92400e" }}>Existencias y costo de ventas</h3>
          <p className="muted" style={{ margin: 0, fontSize: "12px" }}>
            Stock a fin de mes al último costo de compra; la diferencia con Mercaderías va a CMV.
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 10 }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
          Stock al:
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPreview(null); }} />
        </label>
        <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
          Dólar (solo si hay costos en USD sin compras):
          <input inputMode="decimal" value={usdRate} placeholder="Opcional" onChange={(e) => { setUsdRate(e.target.value); setPreview(null); }} />
        </label>
      </div>

      {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}
      {msg && <div className="alert ok" style={{ marginTop: 10 }}>{msg}</div>}

      {preview && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          {preview.withoutCost > 0 && (
            <div className="alert" style={{ marginBottom: 8 }}>
              {preview.withoutCost} producto(s) con stock no tienen costo y valen cero: cargá su costo o una compra.
            </div>
          )}
          <table style={{ fontSize: "0.8rem" }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th style={{ textAlign: "right" }}>Costo unitario</th>
                <th style={{ textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((l) => (
                <tr key={l.productId}>
                  <td>{l.code} — {l.name}<div className="muted" style={{ fontSize: "0.72rem" }}>{SOURCES[l.costSource]}</div></td>
                  <td style={{ textAlign: "right" }}>{l.quantity.toLocaleString("es-AR")}</td>
                  <td style={{ textAlign: "right" }}>{money(l.unitCostArs)}</td>
                  <td style={{ textAlign: "right" }}>{money(l.valueArs)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}><td colSpan={3}>Existencias valuadas</td><td style={{ textAlign: "right" }}>{money(preview.inventoryValue)}</td></tr>
              <tr><td colSpan={3}>Saldo de Mercaderías en libros</td><td style={{ textAlign: "right" }}>{money(preview.bookBalance)}</td></tr>
              <tr style={{ fontWeight: 800 }}>
                <td colSpan={3}>{preview.difference >= 0 ? "Ajuste: Mercaderías aumenta (baja el CMV)" : "Ajuste: Mercaderías baja (sube el CMV)"}</td>
                <td style={{ textAlign: "right" }}>{money(preview.difference)}</td>
              </tr>
            </tfoot>
          </table>
          {preview.existingEntryNumber != null && (
            <div className="alert" style={{ marginTop: 8 }}>Este mes ya tiene ajuste de existencias: asiento N° {preview.existingEntryNumber}.</div>
          )}
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={load} disabled={busy || !date}>👁️ Valuar existencias</button>
        <button type="button" className="btn" onClick={post}
          disabled={busy || !preview || preview.difference === 0 || preview.existingEntryNumber != null}
          style={{ background: "#b45309", color: "#fff", fontWeight: 700 }}>
          Registrar ajuste
        </button>
      </div>
    </div>
  );
}
