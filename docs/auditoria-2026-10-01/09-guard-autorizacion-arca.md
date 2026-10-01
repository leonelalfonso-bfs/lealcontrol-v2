# Facturas · autorización ARCA simulada (prioridad crítica)

Auditoría del código de `main` el 1 de octubre de 2026. El cambio de esta rama es una guarda preventiva; **no implementa WSFE** ni modifica facturas existentes.

## Evidencia

En `InvoiceQueryHandlers.Handle(AuthorizeInvoiceArcaCommand)`, la API construye un supuesto CAE con `new Random()`, arma un QR y llama a `invoice.Authorize(...)` sin enviar el comprobante a ARCA. La pantalla `InvoicesPage` presenta el botón «CAE ARCA» y muestra esos registros como autorizados. Por lo tanto, el estado local `Authorized` y el número almacenado no son evidencia suficiente de autorización fiscal.

ARCA documenta que el servicio WSFEv1 asigna el CAE al aprobar `FECAESolicitar`: https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp y https://www.afip.gob.ar/ws/WSFEV1/documentos/manual_desarrollador_COMPG_v3_3.pdf.

## Corrección preparada

- El endpoint conserva `404` para una factura ajena o inexistente; para una factura existente devuelve un error explícito, sin crear CAE ni cambiar estado.
- La pantalla deja de ofrecer la acción de autorización mientras no exista integración real y advierte que cualquier CAE anterior debe verificarse en ARCA.
- Si el mensaje guardado identifica un CAE generado por esta versión, el PDF muestra una advertencia visible y omite el recuadro y QR que lo presentaban como oficial; también se deshabilita el envío por correo desde esa vista.
- Se mantienen disponibles la consulta y los borradores. No se alteran ni borran registros previos.

## Auditoría de datos antes de decidir reparaciones

En cada base de tenant, ejecutar **solo lectura** y registrar únicamente los conteos, sin nombres de clientes ni documentos fiscales:

```sql
SELECT count(*) AS autorizadas_marcadas,
       count(*) FILTER (WHERE "AfipRawResponse" LIKE 'CAE % otorgado exitosamente por ARCA WSFE v1.%') AS marcadas_por_este_codigo
FROM sales.invoices
WHERE "Status" = 'Authorized';
```

La marca en `AfipRawResponse` identifica el mensaje producido por este código, pero no reemplaza una comprobación externa. Para cada comprobante afectado, cotejar su autorización con ARCA antes de emitirlo, cobrarlo como factura fiscal o corregir su estado. No reparar en lote sin revisión y respaldo.

## Verificación de la guarda en staging

1. Compilar API y frontend.
2. Crear una factura **borrador de prueba**; comprobar que la pantalla no ofrece «CAE ARCA» y que muestra la limitación.
3. Invocar el endpoint de autorización de ese borrador con una sesión de prueba: debe devolver un error explícito; al recargar, la factura debe seguir en borrador y sin CAE ni QR.
4. Consultar facturas ya marcadas `Authorized`: la UI debe pedir verificación externa, sin presentarlas como confirmadas por esta versión.
5. Para un registro de prueba identificado por el mensaje local simulado, abrir su PDF: debe mostrar el aviso de falta de autorización, sin recuadro de CAE oficial ni QR; el envío por correo debe estar deshabilitado.
6. Probar que una factura inexistente o de otro tenant devuelve `404`.

## Estado

- [x] Fallo identificado en código y contrastado con documentación oficial.
- [ ] Compilación local de la guarda.
- [ ] Auditoría de conteos por tenant y verificación externa de casos afectados.
- [ ] Prueba funcional en staging.
- [ ] Integración real con WSFEv1 en una mejora separada.
