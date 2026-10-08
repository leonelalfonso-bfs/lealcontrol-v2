# LealControl v2: continuidad

Actualizado el 8 de octubre de 2026. Leer este documento primero. La versión anterior (2 y 3 de octubre) está en [archivo/continuidad-2026-10-03.md](auditoria-2026-10-01/archivo/continuidad-2026-10-03.md).

## Estado

| Entorno | Carpeta del VPS | Versión |
| --- | --- | --- |
| Producción: erp.lealcontrol.com | `/opt/lealcontrol-v2` | `main`, deploy automático tras CI verde |
| Staging: v2.lealcontrol.com | `/opt/lealcontrol-staging` | Lo que se despliegue con "Deploy staging" (input `ref`) |

- **Deploy:**
  - al fusionar a `main` corre el CI y, si da verde, "Deploy production";
  - el deploy entra por SSH (puerto 5280) con una clave restringida a `/usr/local/bin/leal-deploy`;
  - hace backup, levanta, ejecuta el smoke test y vuelve atrás si falla.
  - Staging: `gh workflow run deploy-staging.yml --ref main -f ref=<sha>`.
- **Configuración** (#88 y siguiente): secciones Empresa, Facturación ARCA, Cobros y bancos, Documentos, Comunicaciones (correo, WhatsApp y redes), Usuarios y Respaldo, cada una con su ruta `/configuracion/...`.
  - Los datos bancarios se cargan una sola vez, en Cobros y bancos; de ahí los toman el PDF y la FCE.
  - Las plantillas de documentos se guardan en el servidor, en `tenant_settings."DocumentTemplatesJson"`.
  - Las empresas nuevas arrancan sin datos de ejemplo.
- **Emisión ARCA:** apagada en producción. Procedimiento de encendido: [61](auditoria-2026-10-01/61-encendido-produccion-arca.md). En staging está activa contra homologación.

## Documentos vigentes

| Tema | Documento |
| --- | --- |
| Seguridad y rendimiento | [54](auditoria-2026-10-01/54-seguridad-y-rendimiento.md) |
| Buscadores | [55](auditoria-2026-10-01/55-buscadores-normalizados.md) |
| Estructura Instrumento y ⌘K | [56](auditoria-2026-10-01/56-estructura-instrumento.md) |
| Tablero Hoy | [57](auditoria-2026-10-01/57-tablero-hoy.md) |
| .NET 10 y desarrollo local | [58](auditoria-2026-10-01/58-migracion-dotnet10.md) |
| Facturación electrónica ARCA (A, B, notas, USD, FCE) | [59](auditoria-2026-10-01/59-facturacion-electronica-arca.md) |
| Cobranzas, diferencia de cambio, cuenta corriente, saldos | [60](auditoria-2026-10-01/60-cobranzas-cuenta-corriente-saldos.md) |
| Encendido de la emisión en producción | [61](auditoria-2026-10-01/61-encendido-produccion-arca.md) |
| Diagnóstico general y plan | [62](auditoria-2026-10-01/62-estado-general-y-plan.md) |

## Próximos pasos (en orden)

1. Encender la emisión en producción ([61](auditoria-2026-10-01/61-encendido-produccion-arca.md)): punto de venta fijo por empresa, wsfecred en el certificado de producción, primera factura real chica.
2. Backups fuera del VPS con prueba de restauración, y alertas.
3. Comunicaciones y Flota, con objetivos definidos con el usuario.
4. Deuda técnica y requisitos para vender ([62](auditoria-2026-10-01/62-estado-general-y-plan.md)).

## Reglas de trabajo

- Las fusiones a `main` las hace el usuario.
- Probar en staging (homologación) antes de fusionar.
- Nunca habilitar la emisión en producción sin el punto de venta fijo de cada empresa.
- Ante un envío ARCA incierto: consultar el mismo número, nunca reenviar.
- Secretos: solo en GitHub Secrets o en el `.env` del VPS, nunca en el repositorio ni en el chat. El repositorio es público.
- Desarrollo local:
  - SDK .NET 10 en `~/.dotnet10` (ver [58](auditoria-2026-10-01/58-migracion-dotnet10.md));
  - las pruebas de integración usan Testcontainers (Docker) y el reloj fiscal fijo del 2/10/2026.
