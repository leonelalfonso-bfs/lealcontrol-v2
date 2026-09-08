# LealControl Salida a Producción: Seguridad + E2E Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Llevar LealControl v2 a un estado vendible: seguro, estable, probado de punta a punta y con despliegues controlados a staging/producción.

**Architecture:** Trabajaremos en ciclos cortos: detectar → reproducir → acordar criterio → corregir → testear → subir. Cada módulo se valida con pruebas automáticas, pruebas por API y pruebas manuales/guiadas en frontend antes de considerar producción.

**Tech Stack:** .NET 8, ASP.NET Minimal APIs, EF Core/Npgsql, PostgreSQL por Docker, React/Vite/TypeScript, Docker Compose, GitHub Actions, scripts shell de backup/deploy.

---

## 1. Estado actual observado

### Rama y repositorio

- Rama actual: `staging/metrology-2307`
- Sincronizada con `origin/staging/metrology-2307`
- Commits recientes enfocados en seguridad/multitenancy/login:
  - `Force company picker on login when user has multiple tenants`
  - `Add tenant user delete and fix login resolver for shared schema`
  - `Fix login resolver SQL for shared tenant_settings schema`
  - `Add multi-company login across dedicated tenant databases`
  - `Fix SuperAdmin API auth when ERP session exists in localStorage`

### Verificaciones ejecutadas

- `dotnet build LealControl.sln --no-restore`: OK, 0 errores, 0 warnings.
- `dotnet test LealControl.sln --no-build`: OK, 33 tests pasando.
- `cd frontend && npm run build`: OK, pero con advertencias de bundle/eval.
- `npm audit --audit-level=moderate`: 9 vulnerabilidades detectadas.

### Archivos nuevos no trackeados

- `docs/CIRCUITO_DINERO_DISENO.md`
- `docs/CIRCUITO_DINERO_FINANZAS.docx`
- `docs/CIRCUITO_DINERO_FINANZAS.md`
- `docs/SIMULACION_CIRCUITO_DINERO_COMPLETA.md`

---

## 2. Errores/riesgos ya encontrados y cómo resolverlos

### 2.1. Vulnerabilidades npm: 1 critical, 5 high, 3 moderate

**Qué significa:** El frontend compila, pero alguna combinación de dependencias tiene vulnerabilidades reportadas por `npm audit`. Esto no necesariamente implica explotación inmediata, pero sí bloquea una salida comercial responsable.

**Evidencia:** `npm audit` reportó:

- critical: 1
- high: 5
- moderate: 3
- total: 9

**Riesgo:** Dependiendo del paquete, puede afectar XSS, ejecución de código durante build, parseo de archivos Excel/PDF o seguridad del bundle.

**Cómo resolverlo:**

1. Leer `frontend/package-lock.json` y el JSON completo de `npm audit`.
2. Clasificar vulnerabilidades:
   - runtime explotable por usuario final,
   - solo build/dev,
   - transitive dependency.
3. Actualizar dependencias con mínimo impacto.
4. Si una dependencia no tiene fix, aislarla o reemplazarla.
5. Volver a correr:
   - `npm install`
   - `npm audit --audit-level=high`
   - `npm run build`
   - prueba manual de pantallas que usan Excel/PDF.

**¿Lo puede hacer Hermes directamente?** Sí. Puedo actualizar dependencias, adaptar imports/uso si algo rompe, correr build y validar pantallas afectadas.

**Prioridad:** Alta.

---

### 2.2. `pdfjs-dist` usa `eval` durante build

**Qué significa:** Vite advierte que `node_modules/pdfjs-dist/build/pdf.js` usa `eval`. No es código propio, pero entra en el bundle y puede chocar con políticas CSP estrictas.

**Evidencia:** `npm run build` mostró warning: `Use of eval in node_modules/pdfjs-dist/build/pdf.js is strongly discouraged...`

**Riesgo:**

- Dificulta implementar CSP fuerte sin `unsafe-eval`.
- Puede ser mal visto en auditorías de seguridad.
- Puede aumentar superficie si se cargan PDFs no confiables.

**Cómo resolverlo:**

1. Ubicar dónde se usa `pdfjs-dist`/`html2pdf.js`.
2. Confirmar si el uso es crítico ahora o solo accesorio.
3. Evaluar:
   - actualizar `pdfjs-dist`,
   - cargar PDF parsing en lazy chunk,
   - reemplazar biblioteca,
   - mover procesamiento PDF al backend si aplica.
4. Agregar CSP compatible una vez resuelto.

**¿Lo puede hacer Hermes directamente?** Sí, pero conviene hacerlo después de revisar `npm audit`, porque puede resolverse junto con dependencias.

**Prioridad:** Media/Alta.

---

### 2.3. Bundle frontend muy grande (~3.99 MB minificado)

**Qué significa:** El frontend funciona, pero se empaqueta casi todo en un único chunk grande.

**Evidencia:** `npm run build` reportó:

- `dist/assets/index-*.js`: ~3,993.89 kB
- gzip: ~974.93 kB

**Riesgo:**

- Carga inicial lenta.
- Mala experiencia en conexiones débiles.
- Más difícil cachear por módulo.

**Cómo resolverlo:**

1. Dividir rutas con `React.lazy` y `Suspense`.
2. Separar librerías pesadas: PDF, Excel, charts, html2pdf.
3. Configurar `manualChunks` si conviene.
4. Verificar que login/dashboard carguen sin traer módulos pesados innecesarios.

**¿Lo puede hacer Hermes directamente?** Sí. Es una mejora técnica segura si se hace por etapas y con build/pruebas por ruta.

**Prioridad:** Media. No bloquea producción cerrada, pero sí salida pública.

---

### 2.4. Script de backup con password hardcodeado

**Archivo:** `scripts/backup-all-tenants-to-gdrive.sh`

**Problema:** Tiene credenciales hardcodeadas de desarrollo:

- `PG_USER="leal"`
- `PG_PASSWORD="leal"`

**Qué significa:** Aunque puede ser credencial local/dev, no conviene que un script de backup multi-tenant tenga secretos fijos.

**Riesgo:**

- Mal hábito de producción.
- Si se copia al servidor, puede respaldar con credenciales incorrectas o exponer acceso.
- Se contradice con el nuevo enfoque de `.env` y `backup.env.example`.

**Cómo resolverlo:**

1. Cambiar el script para leer desde `.env`, `backup.env`, variables de entorno o argumentos.
2. Fallar si faltan variables obligatorias.
3. Evitar imprimir secretos en logs.
4. Documentar instalación segura.
5. Probar `--dry-run` o prueba contra DB local.

**¿Lo puede hacer Hermes directamente?** Sí. Es una corrección clara y de bajo riesgo.

**Prioridad:** Alta si ese script se piensa usar en producción.

---

### 2.5. Fallback dev de admin con contraseña conocida

**Archivo:** `src/Modules/Crm/LealControl.Modules.Crm.Infrastructure/Http/AuthEndpoints.cs`

**Problema:** Hay un fallback que, ante ciertos emails (`admin@lealcontrol.com`, `admin@leal.com`, `admin`), crea un usuario dev con password `admin123`.

**Qué significa:** Puede ser útil en desarrollo, pero es peligroso si queda activo en producción.

**Riesgo:** Crítico si el fallback queda accesible en `Production`.

**Cómo resolverlo:**

1. Confirmar si el fallback está bloqueado por entorno. A simple vista no lo está en esa sección específica.
2. Cambiarlo para que solo funcione en `Development` o `Testing`.
3. En `Production`, si no existe usuario, responder genérico sin crear nada.
4. Agregar test de seguridad:
   - en Production, login admin dev no crea usuario y devuelve error.
   - en Development, si se quiere conservar, sigue funcionando.

**¿Lo puede hacer Hermes directamente?** Sí. Este sería de los primeros fixes que recomiendo hacer.

**Prioridad:** Crítica antes de producción pública.

---

### 2.6. Connection string dev en `appsettings.json`

**Archivo:** `src/Host/LealControl.Api/appsettings.json`

**Estado actual:** Ya se removió la API key de Gemini. Eso está bien. Pero sigue habiendo una connection string local con usuario/password dev.

**Qué significa:** Para desarrollo puede tolerarse, pero la configuración base no debería contener secretos reales. Si `leal/leal` es solo dev local, el riesgo es bajo; si se reutiliza en servidor, es riesgo alto.

**Cómo resolverlo:**

1. Mantener `appsettings.json` con valores no sensibles o vacíos.
2. Mover secretos a variables de entorno.
3. Usar `appsettings.Development.json` o User Secrets solo para local.
4. Hacer que Production falle si falta `ConnectionStrings__Database`.

**¿Lo puede hacer Hermes directamente?** Sí, pero conviene hacerlo con cuidado para no romper tests/dev.

**Prioridad:** Media/Alta.

---

### 2.7. Producción/staging: se puede subir, pero con compuertas

**Contexto del usuario:** Hoy solo acceden vos y tu equipo tester, así que el riesgo comercial externo es bajo.

**Mi recomendación:** Sí, podemos ir subiendo cambios a producción, pero no “a ciegas”. Aunque el riesgo de usuarios externos sea bajo, producción ya contiene datos, configuración, dominios, backups y credenciales reales. Hay que tratarla como producción desde ahora.

**Política propuesta:**

- Todo fix pasa por:
  1. build backend,
  2. tests backend,
  3. build frontend,
  4. audit de seguridad relevante,
  5. prueba E2E o manual del flujo tocado,
  6. backup antes del deploy si toca DB/migraciones,
  7. deploy a staging si aplica,
  8. deploy a producción solo con autorización explícita tuya.

**¿Lo puede hacer Hermes directamente?**

- Puedo preparar cambios, ramas, commits, scripts, tests, informes y comandos de deploy.
- Puedo ejecutar deploy solo si me autorizás explícitamente y tengo acceso configurado.
- Antes de cualquier deploy haría backup y verificación post-deploy.

---

## 3. Método de trabajo propuesto

### Regla principal

No vamos a “tocar diez cosas y ver qué pasa”. Cada problema se trabaja así:

1. Detectamos síntoma.
2. Creamos reproducción corta.
3. Identificamos causa raíz.
4. Definimos juntos el comportamiento correcto.
5. Escribo/fuerzo test si aplica.
6. Corrijo solo esa causa.
7. Verifico.
8. Recién ahí seguimos con el próximo circuito.

---

## 4. Fase 0 — Hardening inmediato antes de E2E profundo

### Task 0.1: Extraer detalle completo de `npm audit`

**Objective:** Saber exactamente qué paquetes generan las 9 vulnerabilidades.

**Files:**
- Read: `frontend/package.json`
- Read: `frontend/package-lock.json`
- Output: `.hermes/security/npm-audit-current.json`

**Steps:**

1. Ejecutar:
   ```bash
   cd frontend
   npm audit --json > ../.hermes/security/npm-audit-current.json
   ```
2. Parsear vulnerabilidades por paquete, severidad y fix disponible.
3. Clasificar runtime vs dev/build.
4. Proponer cambios mínimos.

**Verification:** Informe con tabla: paquete, severidad, vía, fix, riesgo funcional.

---

### Task 0.2: Bloquear fallback admin dev en Production

**Objective:** Impedir creación/login dev con `admin123` fuera de Development.

**Files:**
- Modify: `src/Modules/Crm/LealControl.Modules.Crm.Infrastructure/Http/AuthEndpoints.cs`
- Test: `tests/LealControl.Modules.Crm.IntegrationTests/*` o `tests/LealControl.QA/*`

**Steps:**

1. Crear test para ambiente Production:
   - login con `admin@lealcontrol.com` + `admin123`
   - esperado: no crea usuario, no devuelve token.
2. Confirmar que falla con implementación actual si aplica.
3. Inyectar `IHostEnvironment env` en endpoint login.
4. Encerrar fallback dev con `if (env.IsDevelopment())`.
5. Repetir tests.

**Verification:**

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj
```

---

### Task 0.3: Sanitizar script de backup multi-tenant

**Objective:** Quitar credenciales hardcodeadas y leer configuración segura.

**Files:**
- Modify: `scripts/backup-all-tenants-to-gdrive.sh`
- Compare/align: `scripts/backup-lealcontrol.sh`
- Maybe modify: `scripts/backup.env.example`
- Docs: `docs/DEVELOPER_GUIDE.md`

**Steps:**

1. Reusar patrón de `backup-lealcontrol.sh` si está bien diseñado.
2. Leer variables desde archivo env configurable.
3. Validar `POSTGRES_USER`, `POSTGRES_PASSWORD`, host/port/db.
4. No imprimir secretos.
5. Agregar modo `--dry-run` si no existe.

**Verification:**

```bash
bash -n scripts/backup-all-tenants-to-gdrive.sh
bash scripts/backup-all-tenants-to-gdrive.sh --help || true
```

Si hay entorno local seguro, probar backup contra base local.

---

### Task 0.4: Revisar configuración de production/staging

**Objective:** Confirmar que production exige secretos por env y no usa defaults inseguros.

**Files:**
- `docker-compose.prod.yml`
- `docker-compose.staging.yml`
- `.env.example`
- `src/Host/LealControl.Api/Program.cs`
- `src/Host/LealControl.Api/appsettings.json`

**Steps:**

1. Confirmar que `JWT_SECRET`, `POSTGRES_PASSWORD`, webhook secrets y API keys son obligatorios en producción.
2. Confirmar que no hay fallback productivo para JWT ni conexión DB.
3. Confirmar CORS productivo limitado a dominios esperados.
4. Documentar variables obligatorias.

**Verification:** `docker compose -f docker-compose.prod.yml config` con `.env` de ejemplo controlado, sin imprimir secretos reales.

---

## 5. Fase 1 — Ejecutar sistema limpio y crear empresa nueva

### Task 1.1: Levantar entorno local controlado

**Objective:** Arrancar DB/API/frontend con datos de prueba aislados.

**Files:**
- Use: `docker-compose.yml`
- Use: `.env.example`
- Maybe create local ignored env: `.env` si el usuario autoriza.

**Steps:**

1. Verificar procesos previos.
2. Levantar PostgreSQL por Docker.
3. Crear DB limpia para QA si hace falta.
4. Arrancar API en puerto definido.
5. Arrancar frontend.
6. Verificar `/health` y Swagger.

**Verification:**

```bash
curl http://localhost:<api-port>/health
curl http://localhost:<api-port>/swagger/v1/swagger.json
```

---

### Task 1.2: Crear empresa/tenant nuevo

**Objective:** Simular onboarding SaaS desde cero.

**Flujo:**

1. Login SuperAdmin.
2. Crear tenant/empresa.
3. Crear admin de tenant.
4. Login como admin tenant.
5. Confirmar selector multiempresa si corresponde.
6. Confirmar datos de empresa.

**Endpoints probables:**
- `/api/v1/superadmin/auth/login`
- `/api/v1/superadmin/tenants`
- `/api/v1/auth/login`
- `/api/v1/auth/me`

**Verification:**

- Tenant existe en master DB.
- DB tenant existe si usa database-per-tenant.
- Usuario admin puede operar solo su tenant.
- Token no permite acceder a otro tenant.

---

## 6. Fase 2 — Circuito maestro de datos

### Task 2.1: Clientes

**Objective:** Cargar clientes manualmente y validar listados/búsqueda/detalle.

**Validar:**

- Alta cliente RI/Monotributo/Consumidor Final.
- CUIT válido/inválido.
- Contactos.
- Domicilios.
- Condición fiscal.
- Edición.
- Inactivación si existe.
- Importación Excel/CSV si existe.

**Stop condition:** Si UI/API discrepan o una validación importante falla, detener y corregir.

---

### Task 2.2: Proveedores

**Objective:** Cargar proveedores y validar que UI use endpoint/rol correcto.

**Validar:**

- Alta proveedor manual.
- Listado proveedores.
- Búsqueda.
- Edición.
- Relación con compras.
- Importación Excel/CSV si existe.

**Stop condition:** Si vuelve el bug de “proveedor existe por API pero pantalla muestra 0”, corregir antes de seguir.

---

### Task 2.3: Productos/servicios/categorías

**Objective:** Cargar catálogo operativo.

**Validar:**

- Categorías.
- Productos.
- Servicios.
- Precios.
- IVA.
- Stock si aplica.

**Stop condition:** Si reaparece el 500 de categorías, detener y corregir.

---

## 7. Fase 3 — Ventas completas

### Task 3.1: Presupuesto → pedido → remito → factura → cobro

**Objective:** Probar circuito comercial completo.

**Validar:**

1. Crear oportunidad o cliente directo.
2. Crear presupuesto.
3. Aceptar presupuesto.
4. Generar pedido.
5. Generar remito/entrega.
6. Generar factura.
7. Registrar cobro.
8. Impacto contable si corresponde.
9. Impacto financiero/banco/caja.

**Verification:**

- Estados correctos.
- Totales, IVA, descuentos y redondeos correctos.
- Cuenta corriente cliente queda consistente.
- Asiento contable generado si aplica.

---

## 8. Fase 4 — Compras completas

### Task 4.1: Solicitud → cotización proveedor → OC → recepción → factura → orden de pago

**Objective:** Probar circuito de abastecimiento completo.

**Validar:**

1. Crear solicitud de compra.
2. Aprobar solicitud.
3. Pedir/cargar cotización proveedor.
4. Emitir orden de compra.
5. Cambiar estado de OC correctamente.
6. Recepcionar mercadería/servicio.
7. Cargar factura proveedor.
8. Registrar orden de pago.
9. Registrar pago bancario/cheque/transferencia.
10. Impacto contable y financiero.

**Verification:**

- Estados correctos.
- No se puede recepcionar una OC en estado inválido.
- Factura proveedor no duplica comprobante.
- Cuenta corriente proveedor queda consistente.
- Banco/caja refleja pago.

---

## 9. Fase 5 — Bancos, caja y finanzas

### Task 5.1: Bancos/cuentas/movimientos

**Objective:** Validar circuito financiero real.

**Validar:**

- Crear banco/cuenta.
- Movimiento manual.
- Cobro imputado a banco.
- Pago imputado a banco.
- Transferencia entre cuentas si existe.
- Conciliación si existe.

**Verification:** Saldos antes/después calculados y consistentes.

---

### Task 5.2: Cheques/cartera si existe

**Objective:** Validar instrumentos de pago/cobro.

**Validar:**

- Cheque recibido.
- Depósito/endoso/rechazo si existe.
- Cheque emitido.
- Vencimientos.

**Verification:** Estado de cheque y saldos correctos.

---

## 10. Fase 6 — CRM a fondo

### Task 6.1: Lead → oportunidad → actividad → forecast

**Objective:** Probar CRM completo comercial.

**Validar:**

- Lead por distintas fuentes.
- Conversión/calificación.
- Oportunidad.
- Cambio de etapa.
- Actividades.
- Follow-up.
- Ganada/perdida.
- Reportes/Kanban.

**Verification:**

- La UI y API usan los mismos endpoints.
- Estados/etapas no permiten transiciones absurdas.
- Métricas coinciden con datos.

---

## 11. Fase 7 — Módulos adicionales

### Task 7.1: Metrología

**Objective:** Revisar módulo reciente de metrología.

**Validar:**

- ABM de instrumentos/equipos.
- Calibraciones.
- Vencimientos.
- Alertas.
- Reportes/documentos.

---

### Task 7.2: Comunicaciones/WhatsApp/media

**Objective:** Revisar seguridad y funcionamiento de webhooks/media.

**Validar:**

- Webhook secret.
- Firma/verificación si aplica.
- Tokens temporales de media.
- No exposición pública de adjuntos privados.
- Rate limiting.

---

### Task 7.3: RRHH, flota, accounting y otros módulos

**Objective:** Cubrir módulos secundarios con smoke tests y flujos representativos.

**Validar:**

- Endpoints protegidos por auth.
- Tenant isolation.
- CRUD básico.
- Reportes principales.
- Exportaciones.

---

## 12. Fase 8 — Seguridad transversal

### Task 8.1: Autenticación y autorización

**Objective:** Confirmar que ningún endpoint privado es accesible sin token o con token incorrecto.

**Tests:**

- Sin token → 401.
- Token tenant A contra tenant B → 403/404 seguro.
- Rol común contra endpoints SuperAdmin → 403.
- SuperAdmin no puede mezclarse accidentalmente con sesión ERP normal.
- Expiración JWT.
- Rate limiting login.

---

### Task 8.2: Tenant isolation

**Objective:** Probar aislamiento real entre empresas.

**Tests:**

1. Crear empresa A y B.
2. Crear cliente/proveedor/venta en A.
3. Intentar leerlo desde B.
4. Intentar cambiar `X-Tenant-Id` manualmente.
5. Confirmar que query handlers filtran por tenant.

**Stop condition:** Cualquier fuga cross-tenant detiene todo. Se corrige antes de seguir.

---

### Task 8.3: Secret scanning

**Objective:** Evitar secretos en repo.

**Checks:**

- grep patterns.
- git diff added lines.
- revisar `.env`, `.env.*` ignorados.
- revisar scripts/docs para passwords reales.

**Verification:** Reporte limpio o falsos positivos documentados.

---

## 13. Fase 9 — Deploy controlado

### Task 9.1: Preparar compuerta de deploy

**Objective:** Definir cuándo algo puede subir a staging/producción.

**Checklist obligatoria:**

- Build backend OK.
- Tests backend OK.
- Build frontend OK.
- Audit sin critical/high runtime explotables.
- E2E del flujo tocado OK.
- Backup validado si toca DB.
- Migraciones revisadas.
- Rollback definido.
- Aprobación explícita del usuario.

---

### Task 9.2: Staging primero

**Objective:** Usar staging como entorno de ensayo.

**Steps:**

1. Deploy staging.
2. Smoke test login, tenant, dashboard.
3. E2E acotado del cambio.
4. Revisión con equipo tester.
5. Solo si pasa, producción.

---

### Task 9.3: Producción controlada

**Objective:** Subir cambios sin afectar datos ni continuidad.

**Steps:**

1. Confirmar ventana de deploy.
2. Backup DB.
3. Backup compose/env actual sin imprimir secretos.
4. Pull/build/deploy.
5. Verificar healthcheck.
6. Login real.
7. Probar flujo principal.
8. Monitorear logs.
9. Documentar resultado.

---

## 14. Orden recomendado de arranque

1. Arreglar/bloquear fallback admin dev en Production.
2. Sanitizar script de backup multi-tenant.
3. Resolver o clasificar vulnerabilidades npm críticas/high.
4. Levantar entorno local limpio.
5. Crear empresa nueva.
6. Ejecutar circuito clientes/proveedores/productos.
7. Ejecutar ventas completas.
8. Ejecutar compras completas.
9. Ejecutar bancos/caja/pagos/cobros.
10. Ejecutar CRM profundo.
11. Revisar módulos secundarios.
12. Preparar deploy staging.
13. Producción controlada.

---

## 15. Cómo nos detenemos cuando aparece un fallo

Cuando encuentre algo mal:

1. Te digo el síntoma en lenguaje funcional.
2. Te muestro evidencia técnica mínima.
3. Te digo impacto: bajo/medio/alto/crítico.
4. Te propongo 1–3 formas de resolverlo.
5. Vos elegís el comportamiento de negocio si hay ambigüedad.
6. Yo lo implemento.
7. Corro pruebas.
8. Seguimos.

---

## 16. Preguntas abiertas antes de ejecutar

1. ¿Querés que el primer bloque de correcciones sea seguridad inmediata?
   - fallback admin dev,
   - backup script,
   - npm audit.

2. ¿Autorizás crear una base local limpia para la simulación completa?
   - Recomendado: sí, para no mezclar con datos actuales.

3. ¿Querés que prepare commits por bloque?
   - Recomendado: sí, commits chicos y reversibles.

4. ¿Tenés staging separado de producción funcionando hoy?
   - Si sí, lo usamos como compuerta.
   - Si no, lo armamos antes de usar producción como banco de pruebas.

---

## 17. Primera acción propuesta

Arrancar por seguridad inmediata:

1. Corregir fallback admin dev para que no exista en Production.
2. Corregir script de backup con password hardcodeado.
3. Extraer y resolver/clasificar `npm audit`.
4. Correr build/tests/build frontend.
5. Generar mini informe.

Después pasamos a ejecución real del sistema y simulación completa por partes.
