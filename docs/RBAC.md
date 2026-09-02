# Matriz RBAC — Leal Control ERP 2.0

Roles definidos en el sistema y políticas de autorización del backend (`Program.cs`).

## Roles

| Rol | Descripción |
|-----|-------------|
| **Admin / Administrador** | Acceso total al tenant, configuración y usuarios |
| **SuperAdmin** | Plataforma SaaS (fuera del tenant) |
| **Contador** | Contabilidad, lectura transversal, finanzas |
| **Tesorero** | Finanzas y tesorería |
| **Comercial** | Ventas, CRM, directorio |
| **Compras** | Compras y abastecimiento |
| **Técnico** | Metrología / operaciones técnicas (perfil operativo) |
| **Lectura** | Solo consultas (sin escrituras sensibles) |

## Políticas ASP.NET

| Policy | Roles permitidos |
|--------|------------------|
| `RequireAdmin` | Admin, Administrador, SuperAdmin |
| `RequireFinance` | Admin, Administrador, SuperAdmin, Tesorero, Contador |
| `RequireAccounting` | Admin, Administrador, SuperAdmin, Contador |
| `RequireSales` | Admin, Administrador, SuperAdmin, Comercial, Contador |
| `RequirePurchases` | Admin, Administrador, SuperAdmin, Compras, Contador |

## Aplicación por módulo (escrituras)

| Prefijo API | Policy en POST/PUT/PATCH/DELETE |
|-------------|----------------------------------|
| `/api/v1/finance/*` | `RequireFinance` |
| `/api/v1/accounting/*` | `RequireAccounting` |
| `/api/v1/sales/*`, `/api/v1/grains/*` | `RequireSales` |
| `/api/v1/purchases/*` | `RequirePurchases` |
| `/api/v1/automation/*` | `RequireAdmin` (todo el grupo) |
| `/api/v1/company/*` (settings, users) | `RequireAdmin` |

Las lecturas (`GET`) quedan disponibles para cualquier usuario autenticado con el módulo contratado.

## Módulos contratados (`AllowedModulesJson`)

Además del rol, el JWT incluye el claim `allowed_modules` (array JSON). Un middleware bloquea rutas de módulos no incluidos en el plan/perfil del usuario.

Claves de módulo: `sales`, `crm`, `purchases`, `inventory`, `finance`, `accounting`, `fleet`, `hr`, `grains`, `metrology`, `communications`, `automation`.

Admin y SuperAdmin omiten esta restricción.

## Frontend

`moduleRegistry.ts` + `App.tsx` ocultan navegación según rol y `allowedModulesJson`. **El backend es la última línea de defensa.**
