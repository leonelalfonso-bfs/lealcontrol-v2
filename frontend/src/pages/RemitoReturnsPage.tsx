import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { type CompanySettings, type ProductSummary, type Remito, type RemitoReturn, type Warehouse } from "../api/types";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";

const formatQty = (value: number) => value.toLocaleString("es-AR", { maximumFractionDigits: 4 });

export function RemitoReturnsPage() {
  const { id } = useParams<{ id: string }>();
  const [remito, setRemito] = useState<Remito | null>(null);
  const [returns, setReturns] = useState<RemitoReturn[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("Repuesto no utilizado");
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!id) return;
    const [r, rows, stocks, catalog, settings] = await Promise.all([
      api.getRemito(id), api.listRemitoReturns(id),
      api.listWarehouses().catch(() => []),
      api.listProducts().catch(() => []),
      api.getCompanySettings().catch(() => null)
    ]);
    setRemito(r);
    setReturns(rows);
    setWarehouses(stocks);
    setProducts(catalog);
    setCompany(settings);
    if (!warehouseId) {
      const preferred = stocks.find((w) => w.isActive && w.type === "MainWarehouse");
      setWarehouseId(preferred?.id || stocks.find((w) => w.isActive)?.id || "");
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh().catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el remito"))
      .finally(() => setLoading(false));
  }, [id]);

  const returned = useMemo(() => {
    const result: Record<string, number> = {};
    for (const r of returns) for (const item of r.items) {
      result[item.remitoItemId] = (result[item.remitoItemId] || 0) + item.quantity;
    }
    return result;
  }, [returns]);
  const selected = returns.find((r) => r.id === selectedId) || null;
  const canReturn = remito?.status === "Delivered" && !remito.invoiceId;
  const selectedLines = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([remitoItemId, quantity]) => ({ remitoItemId, quantity }));

  const confirmReturn = async () => {
    if (!id || !remito || !canReturn || saving) return;
    if (!reason.trim() || selectedLines.length === 0) {
      setError("Seleccioná al menos un ítem y completá el motivo.");
      return;
    }
    if (selectedLines.some((line) => {
      const source = remito.items.find((i) => i.id === line.remitoItemId);
      return !source || line.quantity > source.quantity - (returned[line.remitoItemId] || 0);
    })) {
      setError("La cantidad supera lo que queda por devolver.");
      return;
    }
    if (!window.confirm("¿Confirmar la recepción física y el ingreso de estas piezas al stock?")) return;
    try {
      setSaving(true);
      setError(null);
      const saved = await api.confirmRemitoReturn(id, {
        warehouseId: warehouseId || undefined, reason: reason.trim(),
        notes: notes.trim() || undefined, items: selectedLines
      });
      setQuantities({});
      setNotes("");
      await refresh();
      setSelectedId(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar la devolución");
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    const element = document.getElementById("remito-return-document");
    if (!element || !selected) return;
    try {
      setDownloading(true);
      const html2pdf = await loadHtml2Pdf();
      await html2pdf().set({
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: "Devolucion_" + selected.returnNumber + ".pdf",
        image: { type: "jpeg" as const, quality: 0.94 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
        pagebreak: { mode: ["css", "legacy"] }
      }).from(element).save();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <p className="pad muted">Cargando devoluciones…</p>;
  if (!remito) return <div className="alert">{error || "Remito no encontrado"}</div>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>↩ Devoluciones del remito {remito.remitoNumber}</h1>
          <p className="muted">{remito.customerName} · Pedido {remito.orderId ? "vinculado" : "sin vincular"}</p>
        </div>
        <Link className="btn ghost" to="/remitos">← Remitos</Link>
      </div>
      {error && <div className="alert">{error}</div>}
      {remito.invoiceId && <div className="alert">Este remito ya fue facturado. Las devoluciones posteriores requieren el circuito de nota de crédito.</div>}
      {canReturn && (
        <section className="card pad">
          <h2>Confirmar recepción de piezas</h2>
          <p className="muted">La confirmación registra el retorno y, para artículos inventariables despachados, el ingreso al stock. Lo devuelto queda «no utilizado / no facturar».</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ítem del remito</th><th>Enviado</th><th>Ya devuelto</th><th>Disponible</th><th>Recibir ahora</th></tr></thead>
              <tbody>
                {remito.items.map((item) => {
                  const product = products.find((p) => p.id === item.productId ||
                    (item.code && p.code.toLowerCase() === item.code.toLowerCase()));
                  const returnable = product?.type !== "Service" && Boolean(item.productId || product);
                  const available = returnable ? Math.max(0, item.quantity - (returned[item.id] || 0)) : 0;
                  return <tr key={item.id}>
                    <td><strong>{item.code}</strong><div>{item.description}</div>
                      {!returnable && <small className="muted">Servicio o artículo sin stock: no retorna</small>}</td>
                    <td>{formatQty(item.quantity)}</td>
                    <td>{formatQty(returned[item.id] || 0)}</td>
                    <td>{formatQty(available)}</td>
                    <td><input aria-label={"Recibir " + item.description} type="number" min="0" max={available} step="0.0001"
                      value={quantities[item.id] || 0} disabled={available <= 0}
                      onChange={(e) => setQuantities((q) => ({
                        ...q, [item.id]: Math.max(0, Math.min(available, Number(e.target.value) || 0))
                      }))} style={{ width: 110 }} /></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="grid-3" style={{ marginTop: 16 }}>
            <label>Motivo
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option>Repuesto no utilizado</option>
                <option>Sobrante</option>
                <option>Devolución del cliente</option>
                <option>Otro</option>
              </select>
            </label>
            <label>Depósito de ingreso
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {warehouses.filter((w) => w.isActive).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                {!warehouses.some((w) => w.isActive) && <option value="">Depósito Central</option>}
              </select>
            </label>
            <label>Observaciones
              <input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)}
                placeholder="Estado, serie o detalle de recepción" />
            </label>
          </div>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <button type="button" className="btn" disabled={saving || selectedLines.length === 0} onClick={confirmReturn}>
              {saving ? "Confirmando…" : "Confirmar devolución e ingreso"}
            </button>
          </div>
        </section>
      )}
      <section className="card pad">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Devoluciones registradas</h2>
          {canReturn && <Link className="btn ghost" to={"/facturas/nueva?remito_id=" + remito.id}>Facturar saldo neto →</Link>}
        </div>
        {returns.length === 0 ? <p className="muted">Todavía no hay devoluciones.</p> :
          <div className="stack" style={{ marginTop: 12 }}>
            {returns.map((r) => <div key={r.id} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <span><strong>{r.returnNumber}</strong> · {new Date(r.receivedAtUtc).toLocaleDateString("es-AR")} · {r.reason} · {r.items.length} ítem(s)</span>
              <button type="button" className="btn ghost" onClick={() => setSelectedId(r.id)}>Ver constancia</button>
            </div>)}
          </div>}
      </section>
      {selected && <section className="stack" style={{ alignItems: "center", gap: 12 }}>
        <div className="row" style={{ width: 720, maxWidth: "100%", justifyContent: "space-between" }}>
          <h2>Constancia de devolución</h2>
          <button type="button" className="btn" disabled={downloading} onClick={downloadPdf}>
            {downloading ? "Generando PDF…" : "Descargar PDF"}
          </button>
        </div>
        <div id="remito-return-document" style={{ width: 720, maxWidth: "100%", padding: 38, background: "#fff", color: "#17243b", borderTop: "8px solid #2563eb", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
            <div><div style={{ fontSize: 13, letterSpacing: 2, color: "#5277a9", fontWeight: 700 }}>DEVOLUCIÓN DE REMITO</div>
              <h2 style={{ margin: "8px 0" }}>{company?.tradeName || company?.legalName || "LEAL CONTROL"}</h2>
              <p style={{ margin: 0, color: "#64748b" }}>Constancia de recepción de artículos no utilizados</p></div>
            <div style={{ textAlign: "right" }}><strong>{selected.returnNumber}</strong>
              <div>{new Date(selected.receivedAtUtc).toLocaleString("es-AR")}</div>
              <div>Remito {remito.remitoNumber}</div></div>
          </div>
          <hr style={{ border: "0", borderTop: "1px solid #cbd5e1", margin: "24px 0" }} />
          <p><strong>Cliente:</strong> {remito.customerName} · {remito.customerDocument}</p>
          <p><strong>Motivo:</strong> {selected.reason}</p>
          <p><strong>Depósito de ingreso:</strong> {selected.warehouseName}</p>
          {selected.notes && <p><strong>Observaciones:</strong> {selected.notes}</p>}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}>
            <thead><tr style={{ background: "#eff6ff" }}><th style={{ padding: 10, textAlign: "left" }}>Código / Ítem</th><th style={{ padding: 10, textAlign: "right" }}>Cantidad recibida</th></tr></thead>
            <tbody>{selected.items.map((item) => <tr key={item.id} style={{ borderBottom: "1px solid #dbe4ef" }}>
              <td style={{ padding: 10 }}><strong>{item.code}</strong><div>{item.description}</div></td>
              <td style={{ padding: 10, textAlign: "right" }}>{formatQty(item.quantity)}</td>
            </tr>)}</tbody>
          </table>
          <p style={{ marginTop: 28, fontSize: 12, color: "#64748b" }}>Documento vinculado al remito original. Las cantidades recibidas no se incluyen en la facturación del remito.</p>
        </div>
      </section>}
    </div>
  );
}
