# Integración fiscal y prueba pendiente de homologación

## Estado validado

La rama fiscal integra main 40297ae mediante el merge local 5ca37bb. Conserva las correcciones de configuración ARCA (PR 67) y de reutilización WSAA (PR 68). La suite completa en Release aprobó 353 casos: 189 de integración CRM y 164 de los demás proyectos. El frontend compiló correctamente; permanece el aviso de tamaño de algunos bundles.

En staging, main 40297ae pasó 11 comprobaciones de salud. El usuario confirmó consultas repetidas de último autorizado en homologación para Factura A, punto 1, con último número 0 y siguiente orientativo 1. El CUIT fiscal de la empresa se corrigió para corresponder al representado autorizado. Este resultado valida autenticación y consulta de numeración; no constituye una emisión ni una reserva y no demuestra todavía el flujo completo de CAE.

## Bloque fiscal local

Incluye reserva persistida antes del envío, control de concurrencia, envío único por intento, recuperación mediante consulta oficial, conciliación de datos fiscales y QR, rango de numeración, validación de fechas de servicios, aislamiento por empresa y acceso administrativo. La recuperación tiene un endpoint separado y sigue disponible si la emisión está desactivada. El arranque propaga errores de bootstrap en lugar de declarar éxito global con bases fallidas.

La activación de emisión es explícita mediante Arca:EnableInvoiceAuthorization. Permanece pendiente confirmar su configuración de despliegue antes de habilitar la prueba en staging. No habilitar emisión en producción como parte de esta prueba.

## Instructivo de prueba tras despliegue autorizado en staging

1. Confirmar versión del bloque fiscal, salud del servidor y empresa seleccionada. Revisar que el ambiente ARCA siga siendo homologación y que el CUIT fiscal corresponda al representado autorizado. Conservar el certificado y la clave actuales.
2. Confirmar diagnóstico WSAA y consultar último autorizado para Factura A, punto 1. Volver a consultar justo antes de emitir: el número observado previamente no se considera reservado.
3. Crear un borrador Factura A de servicios (concepto 2), ARS, cotización 1, receptor Responsable Inscripto con CUIT válido y períodos de servicio completos. Usar fecha de emisión del día argentino y vencimiento posterior o igual. Un caso simple es cantidad 1, neto 100, IVA 21 y total 121; comprobar esos importes en el borrador antes de autorizar.
4. Con emisión habilitada exclusivamente en staging, solicitar autorización una vez desde una sesión administrativa. Verificar número oficial, CAE, vencimiento y datos del comprobante. Si no se confirma el resultado, consultar el intento mediante recuperación; no generar otro borrador para eludir un intento pendiente.
5. Revisar el documento imprimible y QR. Repetir la consulta del comprobante para comprobar persistencia y ausencia de una segunda emisión. Si queda Pending o Unknown, desactivar emisión y verificar que Consultar ARCA continúa disponible.
6. Registrar resultado y cualquier rechazo con datos mínimos, sin certificados, claves, tickets ni respuestas fiscales completas con información del cliente.

## Pendientes y límites

La prueba de emisión real en homologación aún no se ejecutó. Los intentos rechazados requieren revisión: no se implementó reutilización automática de una reserva rechazada. La caché WSAA es por proceso y desaparece al reiniciar; no comparte tickets entre servidores. El bootstrap de producción todavía corre de forma asincrónica, por lo que su comprobación de disponibilidad durante el arranque sigue pendiente de auditoría.

La integración y esta documentación son locales. Publicación del bloque fiscal, CI remoto y despliegue en staging son pasos posteriores sujetos a autorización. La corrección WSAA ya integrada en main no implica que este bloque fiscal esté desplegado.
