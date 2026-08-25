import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { PaymentOrder } from "../api/types";

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);

const methodNames: Record<string, string> = {
  Cash: "💵 Efectivo (Caja)",
  BankTransfer: "🏦 Transferencia Bancaria",
  ChequeOwn: "✍️ Cheque Propio",
  ChequeThirdParty: "📜 Cheque de Terceros",
  Retention: "🏛️ Retención Practicada"
};

export function PaymentOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getPaymentOrder(id)
      .then(setOrder)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar la orden de pago."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="page-wide" style={{ textAlign: "center", padding: 60 }}>
        <h2>Cargando orden de pago...</h2>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="page-wide" style={{ padding: 40 }}>
        <div className="alert">{error || "Orden de pago no encontrada."}</div>
        <Link className="btn btn-outline" to="/finanzas/pagos">
          ← Volver a Órdenes de Pago
        </Link>
      </div>
    );
  }

  return (
    <div className="page-wide" style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 60 }}>
      {/* Top Bar for Print / Navigation */}
      <div className="no-print toolbar" style={{ justifyContent: "space-between", marginBottom: 20 }}>
        <Link className="btn btn-outline" to="/finanzas/pagos">
          ← Volver al Listado
        </Link>
        <div className="toolbar" style={{ gap: 10 }}>
          <button className="btn primary" onClick={() => window.print()}>
            🖨️ Imprimir Comprobante Oficial
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div
        className="card pad print-sheet"
        style={{
          border: "2px solid #0f172a",
          padding: 32,
          backgroundColor: "#ffffff",
          color: "#0f172a"
        }}
      >
        {/* Document Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "2px solid #0f172a",
            paddingBottom: 16
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>ORDEN DE PAGO</h1>
            <p style={{ margin: "4px 0 0 0", fontWeight: 700, color: "#475569" }}>
              COMPROBANTE OFICIAL DE PAGO A PROVEEDOR
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2 style={{ margin: 0, fontSize: "1.3rem", color: "#2563eb" }}>
              N° {order.orderNumber}
            </h2>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.95rem" }}>
              <strong>Fecha:</strong> {new Date(order.paymentDateUtc).toLocaleDateString("es-AR")}
            </p>
          </div>
        </div>

        {/* Supplier & Payee Info */}
        <div
          style={{
            marginTop: 16,
            padding: 14,
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            background: "#f8fafc",
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 12
          }}
        >
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>
              Proveedor / Beneficiario:
            </span>
            <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>{order.supplierName}</div>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>
              CUIT / Identificación:
            </span>
            <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>
              {order.supplierTaxId || "No informado"}
            </div>
          </div>
          {order.notes && (
            <div style={{ gridColumn: "span 2", marginTop: 4 }}>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>
                Concepto / Observaciones:
              </span>
              <div style={{ fontSize: "0.9rem" }}>{order.notes}</div>
            </div>
          )}
        </div>

        {/* Section 1: Invoices Cancelled */}
        <div style={{ marginTop: 24 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "1rem", borderBottom: "1px solid #cbd5e1", paddingBottom: 4 }}>
            1. FACTURAS Y COMPROBANTES CANCELADOS
          </h3>
          {!order.imputations || order.imputations.length === 0 ? (
            <p style={{ fontSize: "0.88rem", color: "#64748b", fontStyle: "italic" }}>
              Pago a cuenta / Anticipo comercial (sin imputación directa a facturas específicas).
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", border: "1px solid #cbd5e1" }}>Comprobante</th>
                  <th style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "right" }}>Total Factura</th>
                  <th style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "right" }}>Monto Cancelado</th>
                </tr>
              </thead>
              <tbody>
                {order.imputations.map((imp) => (
                  <tr key={imp.id}>
                    <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1" }}>
                      <strong>Factura {imp.invoiceNumber}</strong>
                    </td>
                    <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "right" }}>
                      {money(imp.invoiceTotal, order.currency)}
                    </td>
                    <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "right", fontWeight: 700 }}>
                      {money(imp.amountImputed, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f8fafc", fontWeight: 800 }}>
                  <td colSpan={2} style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "right" }}>
                    TOTAL IMPUTADO:
                  </td>
                  <td style={{ padding: "8px", border: "1px solid #cbd5e1", textAlign: "right" }}>
                    {money(order.imputations.reduce((s, i) => s + i.amountImputed, 0), order.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Section 2: Payment Breakdown */}
        <div style={{ marginTop: 24 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: "1rem", borderBottom: "1px solid #cbd5e1", paddingBottom: 4 }}>
            2. DETALLE DE VALORES Y MEDIOS DE PAGO ENTREGADOS
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", border: "1px solid #cbd5e1" }}>Medio de Pago</th>
                <th style={{ padding: "6px 8px", border: "1px solid #cbd5e1" }}>Detalle / Certificado / Banco</th>
                <th style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "right" }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {order.lines && order.lines.length > 0 ? (
                order.lines.map((line) => (
                  <tr key={line.id}>
                    <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1" }}>
                      <strong>{methodNames[line.method] || line.method}</strong>
                      {line.retentionType && (
                        <span style={{ display: "block", fontSize: "0.78rem", color: "#64748b" }}>
                          Retención: {line.retentionType}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1" }}>
                      {line.retentionCertificate && (
                        <div>
                          <strong>Certificado N°:</strong> {line.retentionCertificate}
                        </div>
                      )}
                      {line.notes && <div>{line.notes}</div>}
                      {!line.retentionCertificate && !line.notes && "—"}
                    </td>
                    <td style={{ padding: "6px 8px", border: "1px solid #cbd5e1", textAlign: "right", fontWeight: 700 }}>
                      {money(line.amount, line.currency || order.currency)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} style={{ padding: 12, border: "1px solid #cbd5e1", textAlign: "center" }}>
                    Pago registrado global por {money(order.amount, order.currency)}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f8fafc", fontWeight: 800, fontSize: "1.05rem" }}>
                <td colSpan={2} style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "right" }}>
                  IMPORTE TOTAL ORDEN DE PAGO:
                </td>
                <td style={{ padding: "10px", border: "1px solid #cbd5e1", textAlign: "right", color: "#059669" }}>
                  {money(order.amount, order.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Section 3: Signatures Block */}
        <div
          style={{
            marginTop: 48,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 40,
            paddingTop: 20
          }}
        >
          <div style={{ textAlign: "center", borderTop: "1px dashed #64748b", paddingTop: 8 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>EMITIDO POR / TESORERÍA</p>
            <small style={{ color: "#64748b" }}>Leal Control ERP</small>
          </div>
          <div style={{ textAlign: "center", borderTop: "1px dashed #64748b", paddingTop: 8 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>RECIBÍ CONFORME (PROVEEDOR)</p>
            <small style={{ color: "#64748b" }}>Firma, Aclaración y DNI/CUIT</small>
          </div>
        </div>
      </div>
    </div>
  );
}
