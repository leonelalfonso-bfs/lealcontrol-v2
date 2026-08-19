import React from "react";
import { Link } from "react-router-dom";

export function DirectoryHelpPage() {
  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Guía & Documentación: Directorio de Empresas & Contactos</h1>
          <p className="muted">Gestión de Clientes, Proveedores, Padrón ARCA, Plantas y Contactos comerciales</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/clientes" className="btn btn-outline">
            👥 Clientes
          </Link>
          <Link to="/proveedores" className="btn btn-primary" style={{ background: "#0d9488" }}>
            🏭 Proveedores
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: "24px", maxWidth: "900px" }}>
        {/* Card 1: Padron ARCA / AFIP */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>1. Consulta Automática al Padrón ARCA / AFIP</h2>
          <p>
            Agilidad y precisión fiscal al dar de alta nuevos clientes y proveedores:
          </p>
          <ul>
            <li><strong>Búsqueda por CUIT en 1 Clic:</strong> Al ingresar los 11 dígitos del CUIT y pulsar <code>🔍 ARCA</code>, el sistema consulta el padrón oficial en tiempo real.</li>
            <li><strong>Auto-completado de Datos:</strong> Se completa automáticamente la Razón Social exacta, Nombre Fantasía, Condición de IVA (Responsable Inscripto, Monotributo, Exento) y Domicilio Fiscal completo (Calle, Ciudad, Provincia y Código Postal).</li>
            <li><strong>Validación de Dígito Verificador:</strong> Previene errores de tipeo y garantiza que el CUIT sea matemáticamente válido antes de guardar.</li>
          </ul>
        </section>

        {/* Card 2: Plantas & Puntos de Entrega */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>2. Múltiples Plantas / Sucursales por Empresa</h2>
          <p>
            Especialmente diseñado para clientes industriales con sedes y depósitos en distintas localidades:
          </p>
          <ul>
            <li><strong>Plantas de Entrega:</strong> Cada empresa puede tener registradas múltiples plantas (ej: Casa Central, Silo Puerto San Martín, Taller Timbúes).</li>
            <li><strong>Destino en Presupuestos y Remitos:</strong> Al emitir una cotización o remito de entrega, podés seleccionar la planta específica para que figure la dirección de destino correcta.</li>
          </ul>
        </section>

        {/* Card 3: Personas de Contacto */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>3. Directorio de Contactos & Roles</h2>
          <p>
            Organización del organigrama de tus clientes y proveedores:
          </p>
          <ul>
            <li><strong>Roles Específicos:</strong> Clasificación por cargo (*Compras/Comercial, Mantenimiento/Técnico, Administración/Pagos, Gerencia/Directorio*).</li>
            <li><strong>Vías Directas de Comunicación:</strong> Teléfono directo, celular, WhatsApp con botón de chat en 1 clic y correo electrónico para envío de cotizaciones.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
