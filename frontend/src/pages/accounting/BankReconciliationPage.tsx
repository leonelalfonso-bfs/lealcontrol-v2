import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

interface TreasuryRow {
  code: string;
  name: string;
  accountType: string;
  currency: string;
  ledgerDebit: number;
  ledgerCredit: number;
  ledgerBalance: number;
  role: string;
}

export function BankReconciliationPage() {
  const [rows, setRows] = useState<TreasuryRow[]>([]);
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const data = await api.getTreasuryReconciliation();
        setRows(data.rows ?? []);
        setMessage(data.message ?? "");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la conciliación tesorería vs mayor.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fmt = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">CONTABILIDAD</span>
          <h1>Conciliación tesorería vs mayor</h1>
          <p className="muted">
            El extracto se importa en Finanzas. Acá se ve el saldo del libro mayor de caja/banco según el mapeo contable.
          </p>
        </div>
        <div className="toolbar">
          <Link className="btn" to="/finanzas/conciliacion">
            Ir a conciliación de extracto
          </Link>
        </div>
      </div>

      <div className="tabs-row" style={{ marginBottom: 16 }}>
        <Link to="/contabilidad" className="tab-btn">Tablero</Link>
        <Link to="/contabilidad/plan-cuentas" className="tab-btn">Plan de Cuentas</Link>
        <Link to="/contabilidad/asientos" className="tab-btn">Libro Diario</Link>
        <Link to="/contabilidad/mayor" className="tab-btn">Libro Mayor</Link>
        <Link to="/contabilidad/sumas-saldos" className="tab-btn">Sumas y Saldos</Link>
        <Link to="/contabilidad/conciliacion" className="tab-btn active">Conciliación</Link>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && !error && <p className="muted">{message}</p>}

      {loading ? (
        <div className="card pad">Cargando saldos del mayor…</div>
      ) : (
        <section className="card pad">
          <table className="table">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Código</th>
                <th>Cuenta</th>
                <th>Debe</th>
                <th>Haber</th>
                <th>Saldo mayor</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">No hay cuentas de tesorería mapeadas.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.code}>
                    <td>{r.role}</td>
                    <td>{r.code}</td>
                    <td>{r.name}</td>
                    <td>{fmt(r.ledgerDebit)}</td>
                    <td>{fmt(r.ledgerCredit)}</td>
                    <td>{fmt(r.ledgerBalance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 12 }}>
            Comisiones y gastos bancarios: clasificá el movimiento en Finanzas con concepto COMISION (solo movimiento) y después contabilizá el lote.
          </p>
        </section>
      )}
    </div>
  );
}
