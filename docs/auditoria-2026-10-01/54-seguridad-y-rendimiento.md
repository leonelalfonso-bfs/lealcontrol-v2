# Seguridad y rendimiento: cambio de empresa, límites por IP y DDL por request

Rama: `codex/seguridad-rendimiento-20261006`, sobre `main` c5eb76d.

## Seguridad

### Cambio de empresa sin contraseña (crítico)

`/api/v1/auth/me` y `/api/v1/auth/switch-tenant` buscaban el email del token en todas las bases sin verificar contraseña. Un administrador de cualquier empresa podía crear en la suya un usuario con el email de un administrador ajeno, iniciar sesión con una contraseña propia y pasar a la otra empresa con rol Admin.

Corrección: el login guarda en el token (claim `tenants`) solo las empresas cuya contraseña verificó. `/me` y `switch-tenant` aceptan únicamente esas. Un token emitido antes de este cambio habilita solo su empresa actual: después del despliegue, quien use varias empresas debe volver a iniciar sesión para ver el selector.

Prueba que reproduce el ataque: `CrossTenantSwitchSecurityTests`. También cubre que el mismo email y contraseña en dos empresas sigan pudiendo alternar.

### Otros cambios

- Clave de Gemini escrita en el código como valor por defecto en `GeminiApiClient` y `AskLealService`. **El repositorio es público: hay que rotarla en Google AI Studio.** Ahora se lee solo de `GEMINI_API_KEY` y viaja en el header `x-goog-api-key`, no en la URL. Los compose pasan la variable.
- Listar usuarios de una empresa sin usuarios ya no crea `admin@lealcontrol.com`, `ventas@…` y `servicio@…`.
- `/health` (anónimo) ya no devuelve el mensaje de las excepciones; el detalle queda en el log.
- Hashes heredados (SHA-256 con sal fija) se reemplazan por PBKDF2 en el primer login válido.

## Rendimiento

### DDL en cada request (causa principal de la lentitud)

Unos 150 endpoints llamaban a `Ensure*TablesAsync` en cada pedido. Calidad ejecutaba unas 116 sentencias por request y Metrología unas 60. Además, `ALTER TABLE … ADD COLUMN IF NOT EXISTS` toma un lock exclusivo aunque la columna exista, así que los pedidos concurrentes se bloqueaban entre sí.

`SchemaInitializationGate` (BuildingBlocks) ejecuta cada script una vez por base y por proceso. Si falla, no queda registrado y se reintenta. Con una transacción abierta se ejecuta sin registrarse. El reintento de CRM ante tabla o columna faltante usa `RepairCrmTablesAsync`, que fuerza la reejecución. El bootstrap de arranque y el aprovisionamiento llaman a `ForgetDatabase` y verifican siempre la base completa, así un conflicto de datos sigue fallando visiblemente al iniciar.

### Rate limiting

La API no procesaba `X-Forwarded-For`: todos los clientes compartían la IP del contenedor web, con 200 pedidos y 10 logins por minuto en total. Ahora se usan `ForwardedHeaders`, confiando solo en redes privadas y loopback. El cupo global es de 600 pedidos por minuto por usuario autenticado y 200 por IP anónima; el login mantiene 10 por minuto por IP real.

Requisito del nginx del host: debe enviar `X-Forwarded-For` (con `$proxy_add_x_forwarded_for` o `$remote_addr`). Si no lo envía, todos los pedidos siguen llegando con la IP del gateway de Docker.

### Otros

- Login: las bases de las empresas se consultan en paralelo (máximo 8). `/me` y `switch-tenant` consultan solo las empresas del token, en vez de todas.
- nginx web: gzip (el bundle inicial baja de ~440 KB a ~115 KB), keepalive hacia la API e `index.html` sin caché.
- Postgres: `shared_buffers`, `effective_cache_size`, `work_mem`, `random_page_cost`, `pg_stat_statements` y registro de consultas de más de 500 ms. `shm_size` en 256 MB.
- Frontend: el resumen de notificaciones se pedía 3 veces cada 30 s por pestaña. Ahora es una sola llamada compartida y no consulta el servidor con la pestaña oculta.

## Despliegue

1. Rotar la clave de Gemini y agregar `GEMINI_API_KEY=<nueva>` al `.env` de staging y de producción.
2. Verificar que el nginx del host envíe `X-Forwarded-For` al puerto del contenedor web.
3. Staging: `git pull`, luego `docker compose -f docker-compose.staging.yml --env-file .env up -d --build`. Incluye `postgres`: el contenedor de base se recrea por el cambio de parámetros, unos segundos sin servicio y con los datos intactos en el volumen.
4. Comprobar: `/health` en Healthy; login multiempresa (volver a iniciar sesión); pantallas de Calidad y Metrología; `docker compose exec postgres psql -U <user> -d <db> -c "show shared_buffers"` devuelve el valor nuevo.
5. Medir consultas lentas reales: `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` en cada base y luego `SELECT calls, round(mean_exec_time) ms, left(query, 120) FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;`.
6. Producción: el mismo procedimiento con `docker-compose.prod.yml`, después de validar staging.

## Validación

Suite completa en Release: 361 pruebas aprobadas (CRM integración 197, finanzas 37, comunicaciones 34, contabilidad 28, calidad 25, CRM unitarias 21, arquitectura 10, QA 9). Frontend compilado. Configuración de nginx validada con `nginx -t` y Postgres 16 iniciado con los parámetros nuevos.

## Pendientes

- Recuperación de contraseña por email (no existe).
- Contenedor de la API corriendo como root.
- Migración a .NET 10 antes del fin de soporte de .NET 8 (10/11/2026).
- Unificar el esquema en migraciones de EF y retirar los `CREATE/ALTER IF NOT EXISTS`.
