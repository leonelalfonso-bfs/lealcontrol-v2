# Pantalla de autorización y estados fiscales persistidos

La pantalla de facturas consulta GET /api/v1/sales/invoices/fiscal-status para administradores. La respuesta incluye activación de emisión e intentos de la empresa actual: factura, estado y número reservado. No entrega credenciales ni consulta servicios de ARCA.

Cuando la emisión está habilitada, ofrece Autorizar ARCA para el perfil inicial de factura A de servicios en ARS y Consultar ARCA para Pending o Unknown. Los rechazos requieren revisión. Una confirmación previa a la autorización muestra cliente e importe; un bloqueo inmediato mediante referencia y estado evita dobles clics en la pantalla. Las consultas de envíos inciertos usan el mismo endpoint y el servicio no reenvía CAE.

Los estados de reserva vuelven a cargarse tras un resultado o error y tras recargar la pantalla. La lectura de errores del cliente API admite description, usado por los errores de validación. Los CAE históricos mantienen su indicación de verificación, sin atribuirles una consulta que no ocurrió.

## Validación

- Frontend compilado con npm run build; permanece la advertencia de tamaño de bundles ya existente.
- Siete pruebas de API con PostgreSQL efímero y gateway simulado cubren roles, configuración, estados tras autorización o incertidumbre, repetición sin doble envío y aislamiento de la consulta entre empresas.
- Suite completa de la solución ejecutada en Release antes del commit; consultar la salida de ejecución para sus totales.
- No se realizó aún verificación visual en navegador ni homologación; no se emitieron comprobantes reales.

## Prueba manual reproducible antes de publicar

1. En un entorno local o de homologación, ingresar como administrador y abrir Ventas → Facturas. Con emisión deshabilitada debe mostrarse esa condición y no ofrecer autorización.
2. Usar una empresa y certificado específicos de homologación; verificar ambiente, CUIT y punto de venta antes de habilitar Arca__EnableInvoiceAuthorization. No reutilizar configuración de producción para esta prueba.
3. Crear una factura A de servicios en ARS, con período válido e IVA 21 %. Revisar cliente, fechas e importe. Autorizar una vez y comprobar la confirmación previa, el bloqueo del botón y el CAE confirmado mediante consulta.
4. Recargar y verificar que número, CAE y reserva persistan. La prueba automática con gateway simulado cubre respuesta incierta y solicitudes simultáneas; no provocar cortes en una emisión real para reproducirlas.
5. Ingresar con un rol sin permisos fiscales: no debe ofrecer acciones de emisión y la API debe rechazarlas. Cambiar de empresa y comprobar que no aparezcan reservas de otra empresa.

## Pendientes

Revisar contrato oficial de consulta, límites de numeración y fechas; ampliar aislamiento del endpoint de autorización y perfiles no admitidos; verificar migraciones sobre bases existentes; ejecutar prueba visual y homologación antes de publicar o habilitar emisión. La configuración de ningún servidor se modificó.
