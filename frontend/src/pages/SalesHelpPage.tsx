import React from "react";
import { Link } from "react-router-dom";

export function SalesHelpPage() {
  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Guía & Documentación: Ventas & Comercial</h1>
          <p className="muted">Ciclo comercial completo: Presupuestos multimoneda, Pedidos, Remitos y Facturación ARCA</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/presupuestos" className="btn btn-outline">
            📋 Presupuestos
          </Link>
          <Link to="/facturas" className="btn btn-primary" style={{ background: "#0d9488" }}>
            🧾 Facturación
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: "24px", maxWidth: "900px" }}>
        {/* Card 1: Presupuestos Multimoneda & Oferta Tecnica */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>1. Presupuestos Comerciales & Ofertas Técnicas</h2>
          <p>
            El generador de presupuestos de Leal Control ERP v2 está optimizado para empresas industriales y de ingeniería:
          </p>
          <ul>
            <li><strong>Cotización en Vivo (DolarApi BNA):</strong> El sistema consulta las cotizaciones de Dólar Billete y Dólar Divisa del Banco Nación en tiempo real y convierte automáticamente los precios de catálogo a la moneda elegida (ARS, USD Billete o USD Divisa).</li>
            <li><strong>Alta Rápida [ + ]:</strong> Podés dar de alta clientes, plantas, contactos y productos con foto directamente desde el formulario de presupuesto sin salir de la pantalla.</li>
            <li><strong>Renglones Opcionales & Descuentos:</strong> Marcá ítems como opcionales (no suman al total por defecto) para presentar alternativas técnicas al cliente.</li>
            <li><strong>Descarga Limpia en PDF:</strong> Botón directo para generar la propuesta comercial con encabezado, foto de productos, especificaciones técnicas y condiciones de venta.</li>
          </ul>
        </section>

        {/* Card 2: Pedidos de Venta & Remitos de Entrega */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>2. Pedidos de Venta & Remitos Oficiales</h2>
          <p>
            Trazabilidad del circuito operativo una vez ganada la oportunidad comercial:
          </p>
          <ul>
            <li><strong>Aceptación de Presupuesto:</strong> Al confirmar un presupuesto, se genera automáticamente el <strong>Pedido de Venta</strong> y se reserva el stock en los depósitos correspondientes.</li>
            <li><strong>Remitos de Entrega (R):</strong> Permite despachar la mercadería total o parcialmente, vinculando el transporte, chofer y patente del vehículo.</li>
            <li><strong>Descarga de Remito con Código de Barras:</strong> Emisión de remito formal listo para firma de conformidad en la planta del cliente.</li>
          </ul>
        </section>

        {/* Card 3: Facturacion Electronica ARCA / AFIP */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>3. Facturación Electrónica ARCA (AFIP WSFE)</h2>
          <p>
            Emisión de comprobantes fiscales conforme a la normativa argentina:
          </p>
          <ul>
            <li><strong>Facturas A, B, C y MiPyME:</strong> Determinación automática de la letra del comprobante según la condición de IVA del cliente (Responsable Inscripto, Monotributo, Exento, Consumidor Final).</li>
            <li><strong>CAE & Código QR Oficial:</strong> Obtención instantánea del Código de Autorización Electrónico (CAE) y renderizado del código QR de AFIP/ARCA.</li>
            <li><strong>Notas de Crédito y Débito:</strong> Anulación o ajuste de comprobantes fiscales con referencia al documento de origen.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
