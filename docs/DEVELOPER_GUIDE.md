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

## 5. Protocolo de Despliegue en Producción

1. Todos los cambios se integran en la rama `main`.
2. Conectate por SSH al servidor VPS de producción:
   ```bash
   ssh root@tu-servidor-ip
   cd /opt/lealcontrol-v2
   git pull origin main
   docker compose -f docker-compose.prod.yml up -d --build
   ```
3. Verificá los logs del contenedor para asegurar que no hubo errores en el arranque:
   ```bash
   docker compose -f docker-compose.prod.yml logs -f --tail=100
   ```
