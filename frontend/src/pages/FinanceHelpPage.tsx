import React from "react";
import { Link } from "react-router-dom";

export function FinanceHelpPage() {
  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Guía & Documentación: Finanzas & Tesorería</h1>
          <p className="muted">Gestión de cuentas bancarias, eCheqs, cuentas corrientes, recibos de cobro y Cashflow</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/finanzas/bancos" className="btn btn-outline">
            🏦 Cuentas & Bancos
          </Link>
          <Link to="/finanzas/echeqs" className="btn btn-primary" style={{ background: "#0d9488" }}>
            🎫 Cartera de eCheqs
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: "24px", maxWidth: "900px" }}>
        {/* Card 1: Bancos, Cajas & Disponibilidad */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>1. Cuentas Financieras, Bancos & Cajas</h2>
          <p>
            Control centralizado de saldos en moneda nacional y extranjera:
          </p>
          <ul>
            <li><strong>Múltiples Cuentas y Monedas:</strong> Creación de Cuentas Corrientes Bancarias (ARS / USD), Cajas de Ahorro, Cajas de Efectivo en Planta y Billeteras Virtuales.</li>
            <li><strong>Transferencias entre Cuentas:</strong> Registro de movimientos de fondos internos con comprobación automática de saldo de origen.</li>
            <li><strong>Importación de Extractos Bancarios:</strong> Carga de extractos en formato CSV / Excel para conciliación bancaria asistida.</li>
          </ul>
        </section>

        {/* Card 2: Cartera de Cheques & eCheqs */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>2. Cartera de eCheqs & Cheques Físicos</h2>
          <p>
            Ciclo de vida completo de valores recibidos y emitidos:
          </p>
          <ul>
            <li><strong>Ingreso en Recibos de Cobro:</strong> Carga de cheques recibidos de clientes con N° de Cheque, eCheq ID, CMC7, Banco Emisor, CUIT y Fecha de Pago.</li>
            <li><strong>Estados del Cheque:</strong> *En Cartera (Disponible) ➔ Depositado ➔ Acreditado*, o *Entregado a Proveedor (Endoso)*, *Rechazado* o *Vencido*.</li>
            <li><strong>Uso como Medio de Pago:</strong> Pago a proveedores utilizando eCheqs en cartera con seguimiento del endosatario.</li>
          </ul>
        </section>

        {/* Card 3: Cuentas Corrientes & Recibos de Cobro */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>3. Cuentas Corrientes & Recibos de Cobro</h2>
          <p>
            Gestión de créditos comerciales y retenciones impositivas:
          </p>
          <ul>
            <li><strong>Resumen de Cuenta Corriente:</strong> Estado de deuda de clientes y pagos pendientes a proveedores con detalle de facturas adeudadas y antigüedad de saldos.</li>
            <li><strong>Recibos de Cobro Multimedio:</strong> Asignación de cobros a facturas combinando Transferencias, Efectivo, eCheqs y Retenciones impositivas (Retención IIBB, Ganancias, IVA).</li>
            <li><strong>Cashflow Proyectado:</strong> Proyección de ingresos por cobranzas estimadas vs. egresos por compras y sueldos.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
