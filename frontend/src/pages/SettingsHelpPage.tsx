import React from "react";
import { Link } from "react-router-dom";

export function SettingsHelpPage() {
  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Guía & Documentación: Configuración del Sistema</h1>
          <p className="muted">Parámetros de empresa, certificados ARCA/AFIP, servidores de correo y plantillas</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/configuracion" className="btn btn-outline">
            🏢 Datos de Empresa
          </Link>
          <Link to="/configuracion/plantillas" className="btn btn-primary" style={{ background: "#0d9488" }}>
            📄 Plantillas de Impresión
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: "24px", maxWidth: "900px" }}>
        {/* Card 1: Datos de Empresa & Logo */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>1. Datos de la Empresa & Logo Institucional</h2>
          <p>
            Personalización de la identidad corporativa que figura en los encabezados de documentos:
          </p>
          <ul>
            <li><strong>Logo de la Empresa:</strong> Subida del logo institucional en formato PNG/SVG. Se refleja automáticamente en la barra lateral y en los presupuestos, remitos y facturas en PDF.</li>
            <li><strong>Datos Fiscales:</strong> Razón Social, CUIT, Número de Ingresos Brutos (IIBB) y Fecha de Inicio de Actividades.</li>
            <li><strong>Puntos de Venta (PV):</strong> Configuración de los puntos de emisión fiscal autorizados en AFIP.</li>
          </ul>
        </section>

        {/* Card 2: Certificados Digitales ARCA / AFIP */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>2. Certificados Digitales ARCA (WSFE / WSMTXCA)</h2>
          <p>
            Habilitación de la facturación electrónica oficial:
          </p>
          <ul>
            <li><strong>Archivo de consulta (.CSR):</strong> Se genera desde Configuración → Certificado ARCA. Es el pedido PKCS#10 que se sube al portal ARCA (Administrador de Certificados Digitales) para obtener el .CRT.</li>
            <li><strong>Certificado Digital (.CRT):</strong> Emitido por ARCA/AFIP tras aprobar el archivo de consulta.</li>
            <li><strong>Clave Privada (.KEY):</strong> Se crea junto con el CSR (también podés usar una generada con OpenSSL). Firma las solicitudes de CAE ante los servidores de ARCA.</li>
            <li><strong>Ambientes Homologación / Producción:</strong> Permite realizar pruebas en el entorno de testing de AFIP antes de emitir comprobantes reales.</li>
          </ul>
        </section>

        {/* Card 3: Cuentas de Correo & Plantillas */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>3. Servidores de Correo (SMTP/IMAP) & Plantillas</h2>
          <p>
            Automatización de la comunicación comercial y documental:
          </p>
          <ul>
            <li><strong>Cuentas de Correo Institucionales:</strong> Configuración de cuentas (Google Workspace, Microsoft 365, cPanel / IMAP / SMTP) para el envío y recepción de correos dentro del ERP.</li>
            <li><strong>Plantillas de Impresión:</strong> Personalización de los textos legales, cláusulas de garantía y condiciones de pago que se imprimen al pie de los presupuestos y órdenes de compra.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
