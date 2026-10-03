# Límite oficial de numeración y cotejo del contrato público

La reserva, el gateway, la entidad de intento, la confirmación de factura y el constructor SOAP aplican el rango 1 a 99.999.999. El último autorizado debe ser inferior al máximo para reservar el siguiente. El QR ya aplicaba ese máximo; anteriormente otros componentes admitían números mayores, que no podían completarse con un QR válido.

Fuente oficial: [Manual WSFEv1 RG 4291](https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf), definición de CbteDesde y CbteHasta. El manual enlazado desde homologación identifica versión 4.8 y una revisión correspondiente al 1 de diciembre de 2026; no se presupone que todos sus cambios estén activos en producción.

La lectura del [WSDL público de homologación](https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL) confirma que FECompConsResponse hereda FECAEDetRequest y FEDetRequest. Entre los campos heredados figuran fechas de servicio, neto, IVA, moneda, cotización y CondicionIVAReceptorId. Aunque algunos sean opcionales en el esquema general, el perfil inicial conserva el cotejo estricto y no confirma una respuesta que omita los campos necesarios.

## Validación reproducible

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter 'FullyQualifiedName~FiscalVoucherNumberBoundaryTests|FullyQualifiedName~FiscalReservationServiceTests|FullyQualifiedName~WsfeCaeRequestBuilderTests|FullyQualifiedName~ArcaFiscalGatewayTests'
```

Las 17 pruebas seleccionadas pasaron. Cubren límites de la reserva y SOAP, y rechazan cero, negativos, 100.000.000 y long.MaxValue. Se ejecutó además la integración completa antes del commit. No se utilizaron certificados ni se emitieron comprobantes.

## Pendientes de compatibilidad

- La lectura pública del WSDL de producción desde Python falló con SSL: DH_KEY_TOO_SMALL. Esto no demuestra por sí solo que el transporte .NET falle: verificar el cliente y entorno de despliegue con una operación pública de solo lectura. No se deshabilitó validación TLS ni se redujeron sus requisitos.
- Comprobar ventana de fecha de emisión antes de reservar y enviar; conservar consulta de recuperación de comprobantes antiguos.
- Revisar los demás campos opcionales del contrato frente al perfil admitido y probar homologación con empresa, certificado y punto de venta específicos.
- La prueba visual, publicación y activación en servidores continúan pendientes.
