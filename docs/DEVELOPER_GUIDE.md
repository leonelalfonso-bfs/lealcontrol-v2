# Guía para Desarrolladores & Onboarding 👨‍💻

Bienvenido a la base de código de **Leal Control ERP 2.0**. Esta guía explica el flujo de trabajo diario, convenciones de código y pasos exactos para extender el sistema.

---

## 1. Entorno de Desarrollo Recomendado

- **Sistema Operativo:** Ubuntu 22.04 / 24.04 (o Windows con WSL2).
- **IDE:** VS Code o JetBrains Rider.
- **Extensiones recomendadas:** C# Dev Kit, ESLint, Prettier, PostgreSQL Explorer.

---

## 2. Cómo Agregar una Nueva Característica / Endpoint

### Paso A: Entidad en Backend
1. Ubicá el módulo correspondiente en `src/Modules/[NombreModulo]/...`.
2. Si creás una nueva tabla o campo, definilo en el `DbContext` del módulo con su mapeo en `OnModelCreating`.
3. Verificá que la entidad herede o contenga `TenantId (Guid)` y `CreatedAtUtc (DateTime)`.
4. En el inicializador del módulo (ej: `Ensure[Modulo]TablesAsync`), agregá la creación idempotente del schema y tabla si aún no se usan migraciones automáticas.

### Paso B: Definición del Endpoint (Minimal API)
1. Abrí el archivo de registro de endpoints del módulo (ej: `[Modulo]Module.cs`).
2. Mapeá la ruta bajo el grupo `/api/v1/[modulo]/...`.
3. Inyectá siempre el `ITenantContext` y el `DbContext` correspondiente:
   ```csharp
   group.MapGet("/mis-entidades", async ([Modulo]DbContext db, ITenantContext tenant, CancellationToken ct) =>
   {
       var tenantId = tenant.TenantId.Value;
       var items = await db.MisEntidades
           .AsNoTracking()
           .Where(x => x.TenantId == tenantId)
           .ToListAsync(ct);
       return Results.Ok(items);
   });
   ```

### Paso C: Integración en el Frontend
1. **Tipos TypeScript:** Agregá la interfaz correspondiente en `frontend/src/api/types.ts`.
2. **Métodos API Client:** Agregá los métodos correspondientes en `frontend/src/api/client.ts`:
   ```ts
   async listMisEntidades(): Promise<MiEntidad[]> {
     return get<MiEntidad[]>("/[modulo]/mis-entidades");
   }
   ```
3. **Creación de la Página:** Creá el componente en `frontend/src/pages/MiEntidadPage.tsx`.
4. **Registro de Ruta:** Registrá el `<Route>` en `frontend/src/App.tsx`.
5. **Navegación:** Si debe figurar en el menú lateral, agregalo al arreglo `items` del módulo en `frontend/src/app/moduleRegistry.ts`.

Un módulo o circuito = un PR hacia `staging`. No mezclar seguridad con features de negocio.

---

## 3. Convenciones de Código y Estilos

### Backend C# / .NET
- Utilizar **C# 12** con sintaxis moderna (`record`, `primary constructors`, `file-scoped namespaces`).
- Toda consulta de solo lectura debe llevar `.AsNoTracking()` para máximo rendimiento en memoria.
- Fechas siempre en **UTC** (`DateTime.UtcNow`).
- Montos monetarios y cantidades en tipo `decimal` (nunca `float` ni `double`).

### Frontend React / TypeScript
- **TypeScript estricto:** Prohibido el uso de `any`.
- **Formateo de Moneda:** Usar siempre `.toLocaleString("es-AR", { minimumFractionDigits: 2 })` para importes en Pesos/Dólares.
- **Formateo de CUIT:** Formato estándar `XX-XXXXXXXX-X`.
- **Diseño Responsivo:** Usar las clases utilitarias del sistema (`workspace-page`, `page-head`, `card`, `pad`, `stack`, `grid-2`, `grid-3`, `table-wrap`, `btn`, `btn-primary`, `btn-outline`).

---

## 4. Ejecución de Tests Automatizados

Antes de hacer un commit o pull request, corré la suite completa de tests:

```bash
# Correr tests unitarios, de integración y de arquitectura
dotnet test

# Verificar compilación estricta de TypeScript y bundle de Vite
cd frontend && npm run build
```

---

## 5. Ambientes reales y GitHub

| Para qué | Dominio | Carpeta en el VPS (nombre viejo) | Puertos | Rama git | Compose |
|---|---|---|---|---|---|
| Pruebas con colaboradores | https://v2.lealcontrol.com | `/opt/lealcontrol-staging` | web 5175, api 5210 | `staging` | `docker-compose.staging.yml` |
| Producción | https://erp.lealcontrol.com | `/opt/lealcontrol-v2` | web 5174, api 5209 | `main` | `docker-compose.prod.yml` |

La carpeta se llama `lealcontrol-v2` pero **sirve erp (producción)**. La carpeta `lealcontrol-staging` **sirve v2 (pruebas)**. No las intercambies.

Orden de trabajo:

1. PR hacia `staging` → se prueba en **v2.lealcontrol.com**.
2. Smoke: login, health, el circuito del módulo.
3. PR `staging` → `main` → **erp.lealcontrol.com** (environment GitHub `production` con aprobación).

### Secrets de GitHub Actions

| Secret | Uso |
|---|---|
| `STAGING_SSH_*` | Deploy a **v2** (pruebas). Default dir `/opt/lealcontrol-staging` |
| `PROD_SSH_*` | Deploy a **erp** (producción). Default dir `/opt/lealcontrol-v2` |
| `STAGING_APP_DIR` / `PROD_APP_DIR` | Solo si la carpeta no es la default |

En cada carpeta del VPS: `.env` propio. **No commitear `.env`.** En pruebas v2: `PUBLIC_WEB_ORIGIN=https://v2.lealcontrol.com`. En prod erp: `https://erp.lealcontrol.com`. JWT y password de Postgres **distintos**.

La API no arranca en estos compose sin `JWT_SECRET`. También exige `POSTGRES_PASSWORD`, `PUBLIC_WEB_ORIGIN`, `WHATSAPP_GATEWAY_APIKEY` y `WHATSAPP_WEBHOOK_SECRET`.

SuperAdmin inicial: solo si existe `SUPERADMIN_BOOTSTRAP_PASSWORD`.

### Deploy manual (emergencia)

Pruebas (v2.lealcontrol.com):

```bash
cd /opt/lealcontrol-staging
git pull --ff-only origin staging
docker compose -f docker-compose.staging.yml --env-file .env up -d --build
docker compose -f docker-compose.staging.yml logs --tail=50 api
```

Producción (erp.lealcontrol.com):

```bash
cd /opt/lealcontrol-v2
git pull --ff-only origin main
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml logs --tail=50 api
```
