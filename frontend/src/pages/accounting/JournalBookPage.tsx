import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { JournalBook, JournalBookEntry } from "../../api/types";
import { AccountingTabs } from "../../components/accounting/AccountingTabs";
import { exportToExcel } from "../../components/ExcelTools";
import { todayAr } from "../../lib/dates";

const money = (n: number) => (n === 0 ? "" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/**
 * Libro Diario: los asientos en orden de fecha, con número de orden correlativo dentro de cada ejercicio,
 * para imprimir (o guardar en PDF) y exportar.
 */
export function JournalBookPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayAr());
  const [book, setBook] = useState<JournalBook | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Por defecto, desde el inicio del ejercicio en curso.
  useEffect(() => {
    api.getFiscalYears()
      .then((d) => setFrom(d.years[0]?.start.slice(0, 10) ?? todayAr().slice(0, 8) + "01"))
      .catch(() => setFrom(todayAr().slice(0, 8) + "01"));
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    api.getJournalBook(from, to)
      .then(setBook)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el Libro Diario."))
      .finally(() => setLoading(false));
  }, [from, to]);

  const exportExcel = () => {
    if (!book) return;
    const rows = book.entries.flatMap((e: JournalBookEntry) => e.lines.map((l) => ({ e, l })));
    void exportToExcel(`Libro Diario ${from} a ${to}`, rows, [
      { key: "order", header: "N° de orden", value: (r) => r.e.order },
      { key: "date", header: "Fecha", value: (r) => day(r.e.date) },
      { key: "entryNumber", header: "Asiento", value: (r) => r.e.entryNumber },
      { key: "concept", header: "Concepto", value: (r) => r.e.concept },
      { key: "accountCode", header: "Cuenta", value: (r) => r.l.accountCode },
      { key: "accountName", header: "Nombre de la cuenta", value: (r) => r.l.accountName },
      { key: "debit", header: "Debe", value: (r) => r.l.debit },
      { key: "credit", header: "Haber", value: (r) => r.l.credit },
      { key: "memo", header: "Detalle", value: (r) => r.l.memo ?? "" }
    ]);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>🖨️ Libro Diario</h1>
          <p className="muted">Asientos en orden cronológico, numerados en forma correlativa dentro de cada ejercicio.</p>
        </div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label style={{ minWidth: 150 }}>Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label style={{ minWidth: 150 }}>Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="btn ghost" onClick={exportExcel} disabled={!book?.entries.length}>📥 Excel</button>
          <button type="button" className="btn" onClick={() => window.print()} disabled={!book?.entries.length}>🖨️ Imprimir / PDF</button>
        </div>
      </div>

      <div className="no-print"><AccountingTabs /></div>
      {error && <div className="alert">{error}</div>}

      <div className="card pad print-container">
        <h2 style={{ margin: "0 0 4px" }}>Libro Diario</h2>
        <p className="muted" style={{ margin: "0 0 16px" }}>Del {from && day(from)} al {to && day(to)}</p>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : !book || book.entries.length === 0 ? (
          <p className="muted">No hay asientos en el período.</p>
        ) : (
          <table style={{ fontSize: "0.8rem" }}>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Orden</th>
                <th style={{ width: 90 }}>Fecha</th>
                <th>Cuenta / concepto</th>
                <th style={{ textAlign: "right", width: 130 }}>Debe</th>
                <th style={{ textAlign: "right", width: 130 }}>Haber</th>
              </tr>
            </thead>
            {book.entries.map((e) => (
              <tbody key={e.id} style={{ breakInside: "avoid" }}>
                <tr style={{ background: "rgba(15, 23, 42, 0.04)" }}>
                  <td><strong>{e.order}</strong></td>
                  <td>{day(e.date)}</td>
                  <td colSpan={3}>
                    <strong>{e.concept}</strong>
                    <span className="muted"> · asiento N° {e.entryNumber}</span>
                  </td>
                </tr>
                {e.lines.map((l, i) => (
                  <tr key={i}>
                    <td />
                    <td />
                    <td style={{ paddingLeft: l.credit > 0 ? 40 : 18 }}>
                      {l.credit > 0 && "a "}{l.accountCode} {l.accountName}
                      {l.memo && <div className="muted" style={{ fontSize: "0.72rem" }}>{l.memo}</div>}
                    </td>
                    <td style={{ textAlign: "right" }}>{money(l.debit)}</td>
                    <td style={{ textAlign: "right" }}>{money(l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr style={{ fontWeight: 800, borderTop: "2px solid var(--line)" }}>
                <td colSpan={3}>Totales del período ({book.entries.length} asientos)</td>
                <td style={{ textAlign: "right" }}>{money(book.totalDebit)}</td>
                <td style={{ textAlign: "right" }}>{money(book.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
