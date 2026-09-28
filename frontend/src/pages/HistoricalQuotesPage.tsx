import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { HistoricalQuote, HistoricalQuoteDetail } from "../api/types";
import { loadHtml2Pdf } from "../utils/loadHtml2Pdf";
import { trimBlankPdfPages } from "../utils/trimBlankPdfPages";

const money = (value: number, currency: string) =>
  `${currency} ${Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
};
const detail = (value: unknown) => typeof value === "string" && value.trim() ? value : "—";

export function HistoricalQuotesPage() {
  const [records, setRecords] = useState<HistoricalQuote[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listHistoricalQuotes()
      .then(setRecords)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudo cargar el historial"))
      .finally(() => setLoading(false));
  }, []);

  const visible = records.filter(q => `${q.quoteNumber} ${q.customerName}`.toLowerCase().includes(search.toLowerCase()));

  return <>
    <div className="page-head">
      <div><h1>Presupuestos históricos</h1><p className="muted">Copias de solo lectura del ERP anterior; importes netos originales.</p></div>
      <Link className="btn" to="/presupuestos">Volver a presupuestos</Link>
    </div>
    {error && <div className="alert">{error}</div>}
    <div className="card pad" style={{ marginBottom: 16 }}>
      <input type="search" placeholder="Buscar por número o cliente" value={search} onChange={event => setSearch(event.target.value)} style={{ width: "100%" }} />
    </div>
    <section className="card table-wrap">
      {loading ? <div className="pad muted">Cargando historial...</div> :
        <table><thead><tr><th>Número</th><th>Revisión</th><th>Cliente</th><th>Fecha</th><th>Estado original</th><th>Moneda</th><th style={{ textAlign: "right" }}>Total neto</th><th></th></tr></thead>
          <tbody>{visible.map(q => <tr key={q.id}>
            <td><strong>{q.quoteNumber}</strong></td><td>{q.revision}</td>
            <td>{q.customerName}</td><td>{date(q.quoteDate)}</td>
            <td>{q.status}</td><td>{q.currency}</td><td style={{ textAlign: "right" }}>{money(q.netTotal, q.currency)}</td>
            <td><Link to={`/presupuestos/historicos/${q.id}`}>Ver</Link></td>
          </tr>)}</tbody>
        </table>}
      {!loading && visible.length === 0 && <div className="pad muted">No hay presupuestos históricos para mostrar.</div>}
    </section>
  </>;
}

export function HistoricalQuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<HistoricalQuoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getHistoricalQuote(id)
      .then(setQuote)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudo cargar el presupuesto"));
  }, [id]);

  const downloadPdf = async () => {
    const sheet = document.getElementById("historical-quote-sheet");
    if (!sheet || !quote) return;
    setDownloading(true);
    try {
      const html2pdf = await loadHtml2Pdf();
      const worker = html2pdf().set({
        margin: [8, 8, 8, 8], filename: `Presupuesto_historico_${quote.quoteNumber}_rev${quote.revision}.pdf`,
        image: { type: "jpeg", quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["css", "legacy"] }
      }).from(sheet).toCanvas();
      const canvas: HTMLCanvasElement = await worker.get("canvas");
      const pageSize: { inner: { ratio: number } } = await worker.get("pageSize");
      await worker.set({ canvas: trimBlankPdfPages(canvas, Math.floor(canvas.width * pageSize.inner.ratio)) }).toPdf().save();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo generar el PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (error && !quote) return <div className="alert">{error}</div>;
  if (!quote) return <div className="pad muted">Cargando presupuesto histórico...</div>;
  const source = quote.source;
  return <>
    <div className="page-head"><div><h1>Presupuesto {quote.quoteNumber} · revisión {quote.revision}</h1><p className="muted">Historial de solo lectura del ERP anterior.</p></div>
      <div className="toolbar"><Link className="btn" to="/presupuestos/historicos">Volver</Link><button className="btn" type="button" onClick={downloadPdf} disabled={downloading}>{downloading ? "Generando..." : "Descargar PDF"}</button></div>
    </div>
    {error && <div className="alert">{error}</div>}
    <article id="historical-quote-sheet" className="card pad" style={{ maxWidth: 1000, margin: "0 auto", background: "white", color: "#182434" }}>
      <header style={{ borderBottom: "2px solid #206bc4", paddingBottom: 16, marginBottom: 20 }}>
        <strong style={{ color: "#206bc4" }}>PRESUPUESTO HISTÓRICO</strong>
        <h2 style={{ margin: "8px 0" }}>{quote.quoteNumber} · revisión {quote.revision}</h2>
        <small>Reproducción de los datos guardados en el ERP anterior. Documento de consulta; no editable.</small>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 20 }}>
        <div><strong>Cliente</strong><div>{quote.customerName}</div></div>
        <div><strong>Fecha</strong><div>{date(quote.quoteDate)}</div></div>
        <div><strong>Estado original</strong><div>{quote.status}</div></div>
        <div><strong>Moneda original</strong><div>{quote.currency}</div></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Descripción</th><th style={{ textAlign: "right" }}>Cantidad</th><th style={{ textAlign: "right" }}>Precio unitario</th><th style={{ textAlign: "right" }}>Desc.</th><th style={{ textAlign: "right" }}>IVA</th><th style={{ textAlign: "right" }}>Neto</th></tr></thead>
        <tbody>{quote.lines.map(line => <tr key={line.id} style={{ breakInside: "avoid" }}>
          <td><strong>{line.description}</strong>{line.is_optional && <span> · Opcional</span>}{line.detailed_description && <div style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 5 }}>{line.detailed_description}</div>}</td>
          <td style={{ textAlign: "right" }}>{line.quantity}</td><td style={{ textAlign: "right" }}>{money(line.unit_price, quote.currency)}</td>
          <td style={{ textAlign: "right" }}>{line.discount_percent}%</td><td style={{ textAlign: "right" }}>{line.tax_rate}%</td>
          <td style={{ textAlign: "right" }}>{money(line.total, quote.currency)}</td>
        </tr>)}</tbody></table></div>
      <div style={{ textAlign: "right", marginTop: 20, fontSize: 18 }}><strong>Total neto original: {money(quote.netTotal, quote.currency)}</strong></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 24 }}>
        <div><strong>Condiciones de pago</strong><div>{detail(source.payment_terms)}</div></div>
        <div><strong>Plazo de entrega</strong><div>{detail(source.delivery_time)}</div></div>
        <div><strong>Garantía</strong><div>{detail(source.warranty)}</div></div>
        <div><strong>Transporte</strong><div>{detail(source.transportation)}</div></div>
      </div>
      {Boolean(source.notes) && <p style={{ marginTop: 18, whiteSpace: "pre-wrap" }}><strong>Observaciones:</strong> {String(source.notes)}</p>}
    </article>
  </>;
}
