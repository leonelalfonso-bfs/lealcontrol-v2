import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip, Troubleshooting } from "../components/help/HelpManual";

const SECTIONS = [
  { id: "orden", title: "En qué orden configurar una empresa nueva" },
  { id: "empresa", title: "Empresa" },
  { id: "arca", title: "Facturación ARCA (certificado y punto de venta)" },
  { id: "bancos", title: "Cobros y bancos" },
  { id: "documentos", title: "Documentos" },
  { id: "comunicaciones", title: "Comunicaciones (correo)" },
  { id: "usuarios", title: "Usuarios y permisos" },
  { id: "avisos", title: "Mis avisos" },
  { id: "respaldo", title: "Respaldo" },
  { id: "problemas", title: "Cuando el sistema no te deja" }
];

/** Ayuda de Configuración: manual para dejar una empresa lista para trabajar. */
export function ConfigurationHelpPage() {
  return (
    <HelpManual
      eyebrow="CONFIGURACIÓN · MANUAL"
      title="Ayuda de Configuración"
      intro="Cómo dejar la empresa lista para trabajar: datos fiscales, facturación electrónica con ARCA, cuentas, documentos, correo y quién puede hacer qué."
      sections={SECTIONS}
      actions={<Link to="/configuracion" className="btn">Ir a Configuración</Link>}
    >
      <ManualPart id="orden" title="1. En qué orden configurar una empresa nueva">
        <Steps>
          <Step title="Empresa: logo, datos fiscales, domicilio y contacto." />
          <Step title="Facturación ARCA: punto de venta y certificado digital." />
          <Step title="Cobros y bancos: la cuenta para transferencias." />
          <Step title="Documentos: estilo y textos de presupuestos, remitos, órdenes de compra y facturas." />
          <Step title="Comunicaciones: la casilla de correo para enviar facturas y presupuestos." />
          <Step title="Usuarios y permisos: dar de alta a cada persona con su perfil." />
        </Steps>
        <Tip>La Configuración la maneja quien tiene el nivel Administrar. Los cambios se guardan por sección.</Tip>
      </ManualPart>

      <ManualPart id="empresa" title="2. Empresa">
        <p style={{ margin: 0 }}>
          Logo, razón social y nombre de fantasía, CUIT, condición frente al IVA, Ingresos Brutos, inicio de actividades, domicilio fiscal, teléfono, correo y web.
          Salen en facturas, presupuestos, remitos y demás documentos. Tocá guardar al terminar.
        </p>
      </ManualPart>

      <ManualPart id="arca" title="3. Facturación ARCA (certificado y punto de venta)">
        <Steps>
          <Step title="Punto de venta de este sistema.">
            En ARCA creá un punto de venta para facturación por web service y cargá ese número en “Punto de venta de este sistema” → “Guardar punto de venta”.
            Tiene que ser exclusivo de este sistema: si lo usás también desde otro lado, la numeración se cruza.
          </Step>
          <Step title="Elegí el ambiente: 🧪 Homologación (pruebas) o 🚀 Producción real, el CUIT asociado al certificado y un alias (por ejemplo “LealControl”)." />
          <Step title="Paso 1 — “📥 Generar y descargar archivo de consulta”.">
            Se descarga el <strong>.csr</strong> y la clave privada queda guardada en el servidor.
            Subí el .csr en ARCA: en producción, <em>Administrador de Certificados Digitales</em>; en homologación, <em>WSASS</em>. ARCA te da el <strong>.crt</strong>.
          </Step>
          <Step title="En ARCA → Administrador de Relaciones, asociá el certificado a “Facturación electrónica” (wsfe) y a “Constancia de Inscripción” (ws_sr_constancia_inscripcion)." />
          <Step title="Paso 2 — “📄 Seleccionar archivo .CRT” y “🔐 Guardar configuración ARCA”." />
          <Step title="Paso 3 — “🔎 Probar certificado y servicios ARCA”.">Cada prueba sale con ✓ o ✗ y el detalle de qué falta.</Step>
          <Step title="Paso 4 — “Consultar último autorizado”: muestra el último número de Factura A y B en ARCA para ese punto de venta." />
        </Steps>
        <Tip warn>
          Generar otro archivo de consulta reemplaza la clave privada guardada y borra el certificado actual: hacelo solo si vas a cargar un certificado nuevo.
          La emisión real en producción, además, la habilita el administrador del sistema para cada empresa.
        </Tip>
      </ManualPart>

      <ManualPart id="bancos" title="4. Cobros y bancos">
        <p style={{ margin: 0 }}>
          La cuenta para transferencias (banco, CBU de 22 dígitos, alias y titular) que sale en las facturas.
          Es obligatoria para emitir Factura de Crédito Electrónica, porque se informa a ARCA.
        </p>
      </ManualPart>

      <ManualPart id="documentos" title="5. Documentos">
        <p style={{ margin: 0 }}>
          Estilo visual (modelo de diseño y color de acento) y los textos fijos de cada plantilla: presupuesto, remito, orden de compra y factura
          (condiciones, garantía, datos bancarios, anexo técnico con fotos…). “Restaurar textos de fábrica” vuelve a los textos originales.
        </p>
      </ManualPart>

      <ManualPart id="comunicaciones" title="6. Comunicaciones (correo)">
        <Steps>
          <Step title="En “Agregar cuenta”, elegí el proveedor y cargá la casilla.">
            <strong>Gmail</strong>: con una <em>contraseña de aplicación</em> (no la contraseña normal) o conectando con Google (OAuth).
            <strong> Microsoft</strong>: se conecta por OAuth. Para otros, servidor y puerto IMAP y SMTP.
          </Step>
          <Step title="Marcá “Remitente principal” en la casilla que manda facturas y presupuestos." />
          <Step title="Tocá “Probar”: tiene que decir “Conexión correcta”. “Recibir” trae los correos nuevos a la bandeja de Comunicaciones." />
        </Steps>
      </ManualPart>

      <ManualPart id="usuarios" title="7. Usuarios y permisos">
        <Steps>
          <Step title="“+ Nuevo usuario”: nombre, correo, contraseña inicial y perfil." />
          <Step title="El perfil define qué puede hacer en cada módulo.">
            Perfiles de fábrica: <em>Dueño</em> (todo; no se modifica), <em>Administración</em>, <em>Ventas</em>, <em>Compras</em>, <em>RRHH</em>, <em>Técnico</em> y <em>Solo lectura</em>.
            Podés copiar uno y ajustarlo (“+ Nuevo perfil”, “Copiar”).
          </Step>
          <Step title="Si a una persona le hace falta algo distinto de su perfil, cargale una excepción en su usuario." />
          <Step title="Antes de guardar, leé “Qué va a poder hacer”: es el resumen en palabras de lo que le estás dando." />
        </Steps>
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><strong>Niveles por módulo:</strong> Ver (consultar y exportar), Cargar (crear y editar), Aprobar (autorizar, anular, confirmar) y Administrar (configurar el módulo).</li>
          <li><strong>Datos sensibles:</strong> <em>Importes y saldos</em> (Finanzas, Contabilidad, cuentas corrientes), <em>Costos y márgenes</em> (Compras, costos, precios de compra) y <em>Sueldos</em>. Sin ese permiso, esos datos no salen del servidor.</li>
          <li>Para que alguien no entre más, desmarcá “Usuario activo”: no se borra su historial.</li>
        </ul>
        <Tip>Los cambios de permisos se aplican en menos de un minuto, sin que la persona tenga que volver a entrar.</Tip>
      </ManualPart>

      <ManualPart id="avisos" title="8. Mis avisos">
        <p style={{ margin: 0 }}>
          Cada persona elige en <Link to="/mi-perfil/avisos">Mi perfil → Mis avisos</Link> qué avisos quiere (facturas vencidas, presupuestos por vencer,
          cheques a depositar, vencimientos de flota…) y si quiere el resumen diario por correo. Solo ve avisos de lo que tiene permiso.
        </p>
      </ManualPart>

      <ManualPart id="respaldo" title="9. Respaldo">
        <p style={{ margin: 0 }}>
          “Descargar copia (.sql.gz)” baja una copia completa de los datos de la empresa. Además, el sistema guarda una copia cifrada todas las noches fuera del servidor.
        </p>
      </ManualPart>

      <ManualPart id="problemas" title="10. Cuando el sistema no te deja">
        <Troubleshooting rows={[
          [<>“Indicá un punto de venta ARCA válido (1 a 99998)”</>, <>Cargá el número del punto de venta de web service creado en ARCA.</>],
          [<>“Falta la clave privada (.key)…”</>, <>Generá el archivo de consulta en este sistema (Paso 1), o cargá el .key si lo generaste por tu cuenta.</>],
          [<>Prueba de ARCA con ✗ en “Constancia de Inscripción”</>, <>En ARCA → Administrador de Relaciones, asociá el certificado a ws_sr_constancia_inscripcion.</>],
          [<>“El certificado de ARCA está vencido”</>, <>Repetí los pasos 1 a 3 con un certificado nuevo.</>],
          [<>“Microsoft requiere conexión OAuth” / Gmail rechaza la contraseña</>, <>Conectá con OAuth, o en Gmail usá una contraseña de aplicación.</>],
          [<>“Tiene que quedar al menos un usuario activo que administre la configuración y los usuarios.”</>, <>Antes de quitarle la administración a alguien (o desactivarlo), dásela a otra persona.</>]
        ]} />
      </ManualPart>
    </HelpManual>
  );
}
