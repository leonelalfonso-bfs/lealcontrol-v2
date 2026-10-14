import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { VatBookRow, VatBooks } from "../../api/types";
import { AccountingTabs } from "../../components/accounting/AccountingTabs";
import { exportToExcel, type ExcelColumn } from "../../components/ExcelTools";
import { monthRangeAr } from "../../lib/dates";

type Kind = "sales" | "purchases";

const money = (n: number) => (n === 0 ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Columnas del libro; las que en el mes están en cero no se muestran. */
const COLUMNS: { key: keyof VatBookRow; header: string; only?: Kind }[] = [
  { key: "net21", header: "Neto 21%" },
  { key: "vat21", header: "IVA 21%" },
  { key: "net105", header: "Neto 10,5%" },
  { key: "vat105", header: "IVA 10,5%" },
  { key: "net27", header: "Neto 27%" },
  { key: "vat27", header: "IVA 27%" },
  { key: "netOther", header: "Neto otras alíc." },
  { key: "vatOther", header: "IVA otras alíc." },
  { key: "exempt", header: "Exento / no gravado" },
  { key: "perceptionVat", header: "Perc. IVA", only: "purchases" },
  { key: "perceptionIibb", header: "Perc. IIBB" },
  { key: "otherTaxes", header: "Otros tributos", only: "purchases" }
];

/** Libros IVA Ventas y Compras del mes, armados desde los comprobantes, y su exportación a ARCA. */
export function VatBooksPage() {
  // El IVA se liquida a mes vencido: por defecto, el mes anterior.
  const [period, setPeriod] = useState(monthRangeAr(1).from.slice(0, 7));
  const [kind, setKind] = useState<Kind>("sales");
  const [books, setBooks] = useState<VatBooks | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [year, month] = period.split("-").map(Number);

  useEffect(() => {
    if (!year || !month) return;
    setLoading(true);
    setError(null);
    api.getVatBooks(year, month)
      .then(setBooks)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los libros."))
      .finally(() => setLoading(false));
  }, [year, month]);

  const book = books?.[kind];
  const columns = useMemo(
    () => COLUMNS.filter((c) => (!c.only || c.only === kind) &&
      (c.key === "net21" || c.key === "vat21" || (book?.rows.some((r) => r[c.key] !== 0) ?? false))),
    [book, kind]
  );
  const title = kind === "sales" ? "Libro IVA Ventas" : "Libro IVA Compras";

  const exportExcel = () => {
    if (!book) return;
    const excelColumns: ExcelColumn<VatBookRow>[] = [
      { key: "date", header: "Fecha", value: (r) => day(r.date) },
      { key: "voucher", header: "Comprobante" },
      { key: "counterpartyDocument", header: kind === "sales" ? "CUIT / DNI cliente" : "CUIT proveedor" },
      { key: "counterpartyName", header: kind === "sales" ? "Cliente" : "Proveedor" },
      { key: "currency", header: "Moneda" },
      { key: "exchangeRate", header: "Cotización" },
      ...columns.map((c) => ({ key: c.key, header: c.header })),
      { key: "total", header: "Total" }
    ];
    void exportToExcel(`${title} ${period}`, [...book.rows, book.totals], excelColumns);
  };

  const exportArca = () => {
    setError(null);
    api.downloadArcaVatBook(year, month).catch((err) => setError(err instanceof Error ? err.message : "No se pudo exportar."));
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>🧾 Libros IVA</h1>
          <p className="muted">
            Ventas con CAE y facturas de proveedor del mes, en pesos. Las notas de crédito restan. Sale de los comprobantes, no de los asientos.
          </p>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} aria-label="Mes" />
          <button type="button" className="btn ghost" onClick={exportExcel} disabled={!book?.rows.length}>
            📥 Excel
          </button>
          <button type="button" className="btn" onClick={exportArca} disabled={!books || books.problems.length > 0}>
            📤 Libro IVA Digital (ARCA)
          </button>
        </div>
      </div>

      <AccountingTabs />

      {error && <div className="alert">{error}</div>}
      {books && books.problems.length > 0 && (
        <div className="alert">
          <strong>No se puede exportar a ARCA hasta corregir estos comprobantes:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {books.problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      <div className="tab-row">
        <button type="button" className={`tab-btn${kind === "sales" ? " active" : ""}`} onClick={() => setKind("sales")}>
          Ventas ({books?.sales.rows.length ?? 0})
        </button>
        <button type="button" className={`tab-btn${kind === "purchases" ? " active" : ""}`} onClick={() => setKind("purchases")}>
          Compras ({books?.purchases.rows.length ?? 0})
        </button>
      </div>

      <div className="card pad" style={{ overflowX: "auto" }}>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : !book || book.rows.length === 0 ? (
          <p className="muted">No hay comprobantes en el mes.</p>
        ) : (
          <table style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Comprobante</th>
                <th>{kind === "sales" ? "Cliente" : "Proveedor"}</th>
                {columns.map((c) => <th key={c.key} style={{ textAlign: "right" }}>{c.header}</th>)}
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {book.rows.map((r, i) => (
                <tr key={`${r.voucher}-${i}`}>
                  <td>{day(r.date)}</td>
                  <td>
                    {r.voucher}
                    {r.currency !== "ARS" && <div className="muted">{r.currency} a {r.exchangeRate.toLocaleString("es-AR")}</div>}
                  </td>
                  <td>
                    {r.counterpartyName}
                    <div className="muted">{r.counterpartyDocument}</div>
                  </td>
                  {columns.map((c) => <td key={c.key} style={{ textAlign: "right" }}>{money(r[c.key] as number)}</td>)}
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, borderTop: "2px solid var(--surface-border)" }}>
                <td colSpan={3}>Totales del mes</td>
                {columns.map((c) => <td key={c.key} style={{ textAlign: "right" }}>{money(book.totals[c.key] as number)}</td>)}
                <td style={{ textAlign: "right" }}>{money(book.totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="muted" style={{ fontSize: "0.82rem" }}>
        El archivo para ARCA trae los cuatro registros del Libro IVA Digital (comprobantes y alícuotas de ventas y compras).
        Antes de presentar, importalo en el Libro IVA Digital y revisá que ARCA no marque errores. Paso a paso en la{" "}
        <Link to="/contabilidad/ayuda">Ayuda</Link>.
      </p>
    </div>
  );
}
