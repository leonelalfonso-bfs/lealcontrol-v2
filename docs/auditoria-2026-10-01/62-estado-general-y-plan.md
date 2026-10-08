# Estado general y plan (8 de octubre de 2026)

## Diagnóstico

**Lo sólido**
- Alcance amplio y en uso real: ventas, compras, finanzas, contabilidad, producción, calidad, metrología, RRHH, CRM y comunicaciones.
- Núcleo fiscal ARCA bien diseñado: reserva antes de enviar, envío único y conciliación contra ARCA.
- Una base de datos por empresa.
- Unas 435 pruebas automáticas contra PostgreSQL real.
- CI con deploy automático y vuelta atrás.
- .NET 10 LTS y React 19.

**Lo flojo, por prioridad**
1. **Lógica de negocio en el navegador.** Los saldos ya pasaron al servidor (#86). Queda revisar otras pantallas que descargan listados completos para calcular (compras, tablero, reportes).
2. **Lógica duplicada en el frontend.** Ejemplos: la fecha UTC repetida en 10 pantallas, el nombre de los comprobantes en 4. Hay páginas de 1.200 a 1.700 líneas con estilos sueltos. Ya existen `lib/documents.ts` y `lib/dates.ts`: usarlos y seguir extrayendo.
3. **Esquema mixto:** migraciones de EF más `ALTER TABLE IF NOT EXISTS` en los `Ensure*`. Los bloques de facturación agregaron columnas con el mismo patrón. Hay que unificarlo en migraciones.
4. **Módulos desparejos:** Flota es una maqueta (los endpoints guardan la entidad recibida sin validar) y Comunicaciones mezcla etapas.
5. **Datos de demostración:** una empresa nueva arranca con datos y CBU de ejemplo en `CompanySettings`.
6. **Operación:** producción y staging en el mismo VPS, backups locales, sin alertas, sin recuperación de contraseña y la API corriendo como root.

## Hecho (6 a 8 de octubre)

Seguridad y rendimiento (#72), buscadores (#73), estructura Instrumento (#74), tablero Hoy (#75), deploy automático (#76, #78), .NET 10 (#77), facturación electrónica completa (#79 a #85) y saldos en el servidor con punto de venta fijo (#86).

## Plan acordado

1. **Encender la emisión en producción:** [61](61-encendido-produccion-arca.md).
2. **Backups fuera del VPS** con prueba de restauración, y **alertas** (caídas, errores, disco).
3. **Comunicaciones:** definir el objetivo (bandeja única de email y WhatsApp atada al cliente) y rehacer sobre lo que funciona.
4. **Flota:** definir el uso real (vencimientos, mantenimiento, combustible, asignación a servicios) y construirlo con validación.
5. **Deuda técnica:**
   - unificar el esquema en migraciones;
   - API sin root;
   - acciones de GitHub en Node 20;
   - acelerar el CI (unos 20 minutos);
   - ~~plantillas de documentos en el servidor~~ y ~~datos de demostración en empresas nuevas~~: hechos en la reorganización de Configuración (#88 y siguiente).
6. **Para vender:**
   - recuperación de contraseña;
   - alta de clientes con planes y MercadoPago;
   - términos y privacidad;
   - separar servidores;
   - listados y formularios en estilo Instrumento;
   - pulir Calidad y Metrología.

## Pendientes de facturación

- Consulta de aceptación o rechazo de la FCE por el comprador (wsfecred).
- Que el contador confirme si se puede emitir FCE voluntaria por montos menores; hoy está bloqueado.
- Percepciones de IIBB (`Tributos`), solo si alguna empresa es agente de percepción.
- Revisar la contabilización de notas y diferencias de cambio, y el Libro IVA Ventas con A, B, FCE, USD y notas.
