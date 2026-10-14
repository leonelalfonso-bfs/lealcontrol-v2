import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { ServiceOrder, ServiceOrderItem, ServiceOrderProduct, ServiceOrderRemitoPreview } from "../../api/types";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { num } from "../../lib/fleet";

type Row = { productId: string | null; code: string; description: string; quantity: string; unit: string; serialNumbers: string; trackStock?: boolean };

const toRow = (i: ServiceOrderItem): Row => ({
  productId: i.productId ?? null, code: i.code, description: i.description, quantity: String(i.quantity), unit: i.unit, serialNumbers: i.serialNumbers ?? ""
});

const DESTINATION: Record<string, string> = {
  remito: "va en el remito",
  consumption: "se descuenta como consumo",
  none: "solo queda anotado (no está en el pedido ni es un producto)"
};

/**
 * Orden de servicio → repuestos y materiales usados, y el remito. El remito descuenta el stock
 * de lo que está en el pedido; el resto de los productos se descuenta como consumo. Una vez
 * generado, los repuestos ya no se cambian.
 */
export function ServiceOrderPartsSection({ order, onChanged }: { order: ServiceOrder; onChanged: () => Promise<void> }) {
  const locked = Boolean(order.stockAppliedAt) || order.status === "Cancelled";
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [products, setProducts] = useState<ServiceOrderProduct[]>([]);
  const [preview, setPreview] = useState<ServiceOrderRemitoPreview | null>(null);
  const [lines, setLines] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.listServiceOrderItems(order.id).then((items) => setRows(items.map(toRow))).catch((e: Error) => setError(e.message));
  }, [order.id]);

  useEffect(() => {
    if (locked || debounced.trim().length < 2) { setProducts([]); return; }
    api.searchServiceOrderProducts(debounced.trim()).then(setProducts).catch(() => setProducts([]));
  }, [debounced, locked]);

  const update = (index: number, patch: Partial<Row>) => {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  const addProduct = (p: ServiceOrderProduct) => {
    setRows((r) => [...r, { productId: p.id, code: p.code, description: p.name, quantity: "1", unit: p.unit, serialNumbers: "", trackStock: p.trackStock }]);
    setSearch("");
    setProducts([]);
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.saveServiceOrderItems(order.id, rows.map((r) => ({
        productId: r.productId, code: r.code, description: r.description, quantity: Number(r.quantity), unit: r.unit, serialNumbers: r.serialNumbers
      })));
      setRows(saved.map(toRow));
      setDirty(false);
      setPreview(null);
      setMessage("Repuestos guardados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const openRemito = async () => {
    setError(null);
    setMessage(null);
    try {
      const p = await api.getServiceOrderRemitoPreview(order.id);
      setPreview(p);
      // Por defecto, una unidad de cada línea pendiente del pedido (un servicio, un remito).
      setLines(Object.fromEntries(p.orderLines.map((l) => [l.id, l.pending > 0 ? String(Math.min(1, l.pending)) : "0"])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar el remito.");
    }
  };

  const generate = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.createServiceOrderRemito(order.id,
        preview.orderLines.map((l) => ({ orderLineId: l.id, quantity: Number(lines[l.id] || 0) })).filter((l) => l.quantity > 0));
      setPreview(null);
      setMessage(`Remito ${result.remitoNumber} generado.${result.consumed ? ` ${result.consumed} repuesto${result.consumed > 1 ? "s" : ""} descontado${result.consumed > 1 ? "s" : ""} como consumo.` : ""}`);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el remito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card pad stack" style={{ gap: 12, marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Repuestos y materiales</h3>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {order.remitoId ? (
            <Link className="btn btn-outline compact" to={`/remitos/${order.remitoId}/imprimir`}>📄 Remito {order.remitoNumber}</Link>
          ) : !locked && order.status !== "Pending" && (
            <button type="button" className="btn compact" disabled={busy || dirty} title={dirty ? "Guardá los repuestos primero" : undefined}
              onClick={() => void openRemito()}>Generar remito…</button>
          )}
        </div>
      </div>

      {error && <div className="alert" style={{ margin: 0 }}>{error}</div>}
      {message && <div className="alert ok" style={{ margin: 0 }}>{message}</div>}
      {order.stockAppliedAt && <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>Ya se generó el remito y se descontó el stock: los repuestos quedan como están.</p>}

      {rows.length === 0 && locked ? <p className="muted" style={{ margin: 0 }}>Sin repuestos.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Producto o material</th><th style={{ width: 110 }}>Cantidad</th><th style={{ width: 200 }}>N° de serie</th>{!locked && <th></th>}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.productId ? <><strong>{r.description}</strong> <span className="muted">· {r.code}</span></>
                      : locked ? r.description
                      : <input value={r.description} maxLength={300} placeholder="Material sin código (no mueve stock)" onChange={(e) => update(i, { description: e.target.value })} />}
                  </td>
                  <td>
                    {locked ? `${num(Number(r.quantity), 3)} ${r.unit}` : (
                      <input type="number" min={0.001} step="0.001" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                    )}
                  </td>
                  <td>{locked ? r.serialNumbers || "—" : <input value={r.serialNumbers} maxLength={300} onChange={(e) => update(i, { serialNumbers: e.target.value })} />}</td>
                  {!locked && (
                    <td style={{ textAlign: "right" }}>
                      <button type="button" className="btn btn-outline compact" onClick={() => { setRows((x) => x.filter((_, k) => k !== i)); setDirty(true); }}>Quitar</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!locked && (
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 320px", position: "relative" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto por código o nombre para agregar…" />
            {products.length > 0 && (
              <div className="card" style={{ position: "absolute", zIndex: 5, left: 0, right: 0, marginTop: 4, padding: 4, maxHeight: 240, overflow: "auto" }}>
                {products.map((p) => (
                  <button key={p.id} type="button" className="btn btn-outline compact" style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 2 }} onClick={() => addProduct(p)}>
                    {p.name} <span className="muted">· {p.code}{p.trackStock ? ` · stock ${num(p.stock, 2)}` : " · sin control de stock"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-outline" onClick={() => { setRows((r) => [...r, { productId: null, code: "", description: "", quantity: "1", unit: "UN", serialNumbers: "" }]); setDirty(true); }}>
            + Material sin código
          </button>
          <button type="button" className="btn" disabled={busy || !dirty} onClick={() => void save()}>Guardar repuestos</button>
        </div>
      )}

      {preview && (
        <div className="card pad stack" style={{ gap: 10, border: "1px solid var(--line)" }}>
          <strong>Generar remito{preview.salesOrderNumber ? ` del pedido ${preview.salesOrderNumber}` : ""}</strong>
          {!preview.ready ? <div className="alert" style={{ margin: 0 }}>{preview.problem}</div> : (
            <>
              {preview.orderLines.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Línea del pedido</th><th>Pedido</th><th>Entregado</th><th>Pendiente</th><th style={{ width: 120 }}>En este remito</th></tr></thead>
                    <tbody>
                      {preview.orderLines.map((l) => (
                        <tr key={l.id}>
                          <td>{l.description}</td>
                          <td>{num(l.ordered, 2)}</td>
                          <td>{num(l.delivered, 2)}</td>
                          <td>{num(l.pending, 2)}</td>
                          <td><input type="number" min={0} max={l.pending} step="0.01" disabled={l.pending <= 0} value={lines[l.id] ?? "0"} onChange={(e) => setLines({ ...lines, [l.id]: e.target.value })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted" style={{ margin: 0 }}>La orden no tiene pedido: el remito lleva el servicio y todos los repuestos.</p>}
              {preview.items.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.85rem" }}>
                  {preview.items.map((i) => <li key={i.id}><strong>{i.description}</strong> × {num(i.quantity, 3)}: {DESTINATION[i.destination]}</li>)}
                </ul>
              )}
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>Al generar el remito se descuenta el stock. Después los repuestos ya no se pueden cambiar.</p>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setPreview(null)}>Cancelar</button>
                <button type="button" className="btn" disabled={busy} onClick={() => void generate()}>{busy ? "Generando…" : "Generar remito y descontar stock"}</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
