# Estado local ARCA y siguiente validación — 2026-10-03

## Punto de continuidad

Worktree: /home/leonel/Desarrollo-arca-cierre-20261002.
Rama: codex/arca-cierre-20261002. Último commit de código validado: c8bf811.
El bloque ARCA sigue local: no se publicó, desplegó ni emitió en ARCA real.
No confundirlo con el bloque CRM ya publicado y probado anteriormente.

La suite completa Release aprobó 334 pruebas: 170 de integración CRM/fiscal
y 164 del resto de proyectos. El frontend compiló; conserva el aviso conocido
de chunks grandes. Las pruebas usan PostgreSQL efímero y gateways simulados.
No demuestran autenticación WSAA ni emisión o consulta autenticada reales.

## Implementado y probado

- Reserva persistida del número antes de enviar; emisor y ambiente guardados.
- Un único envío CAE; un resultado incierto se recupera mediante consulta.
- Cotejo de campos fiscales y generación del QR al confirmar el comprobante.
- Exclusión de reservas sin resolver simultáneas dentro de la misma serie.
- Upgrade del esquema legacy y propagación del fallo si existen conflictos,
  preservando las reservas originales (c1ad77e, informe 46).
- Límites de numeración y ventana de fecha de servicios en horario argentino.
- Rutas fiscales con permisos administrativos y controles de empresa.
- Consulta independiente de la emisión: Pending y Unknown pueden recuperarse
  con emisión desactivada, sin reservar números ni enviar CAE (c8bf811, informe 47).

Perfil inicial: Factura A por servicios, receptor Responsable Inscripto,
pesos a cotización 1, IVA 21%, sin percepciones ni otros tributos.
Otros perfiles continúan fuera de este flujo.

## Próximos pasos, en orden

1. Obtener un certificado de homologación y autorizar el servicio wsfe en
   WSASS. El usuario confirmó que actualmente solo tiene certificados de producción.
2. Preparar una empresa de prueba separada, con ambiente homologación,
   credenciales correspondientes y emisión inicialmente desactivada.
3. Validar desde el runtime destinado al despliegue el TLS, WSAA y las
   consultas autenticadas. Los GET públicos de ambos WSDL ya dieron HTTP 200
   en .NET 8.0.31 local; eso no valida el contenedor ni la autenticación.
4. Probar pantalla y flujo completo en homologación: emisión única, consulta,
   persistencia de CAE, número, fechas y QR. Activar emisión solo en ese entorno
   para esa prueba concreta; registrar evidencia sin credenciales.
5. Resolver y documentar el tratamiento de reservas definitivamente rechazadas:
   el índice de número y la reserva única por factura permanecen, y actualmente
   se exige revisión. No liberar ni reutilizar números automáticamente.
6. Revisar la disponibilidad durante el bootstrap asíncrono de producción y
   los campos opcionales del contrato WSFE antes de dar por cerrado el flujo.
7. Actualizar el informe con resultados reales antes de proponer publicación.

## Certificado de homologación: referencias oficiales

ARCA indica que los certificados de testing se gestionan en WSASS, accediendo
con clave fiscal, y deben autorizarse para el servicio correspondiente.
El manual describe generación del CSR, creación del certificado y autorización
de acceso. Conservar la clave privada localmente; no incorporarla al repositorio
ni a los informes. No reutilizar las credenciales de producción en la empresa de prueba.

- [Certificados digitales y entornos](https://www.arca.gob.ar/ws/programadores/certificados-digitales.asp)
- [Manual oficial de WSASS](https://www.arca.gob.ar/ws/WSASS/html/index.html)
- [Documentación WSAA](https://www.arca.gob.ar/ws/documentacion/wsaa.asp)

## Repetir validaciones locales cuando cambie el código

```bash
cd /home/leonel/Desarrollo-arca-cierre-20261002
dotnet test --configuration Release
cd frontend
npm run build
```

Informes detallados de esta tanda: 39 a 47, en esta carpeta. Se conservan
como evidencia local; no archivarlos como publicados hasta completar esa etapa.
