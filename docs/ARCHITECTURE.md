# Arquitectura Leal Control 2.0

Monolito modular. Cada módulo es independiente: dominio propio, persistencia propia (schema SQL propio) y un contrato público. Ningún módulo referencia el interior de otro.

## Capas

```
Host (LealControl.Api)
  └── Modules.X.Infrastructure
        └── Modules.X.Application
              ├── Modules.X.Domain
              └── Modules.X.Contracts   ← lo único que pueden ver los demás módulos
BuildingBlocks                         ← primitivos (Result, TenantId, AggregateRoot)
```

## Reglas que no se negocian

1. El dominio no conoce EF, HTTP ni otros módulos.
2. Application orquesta casos de uso. No toca SQL.
3. Infrastructure implementa repositorios y endpoints del módulo.
4. Otro módulo solo puede depender de `*.Contracts`.
5. Un módulo = un schema de Postgres (`crm`, mañana `billing`, `inventory`…).
6. Los tests de arquitectura (NetArchTest) rompen el build si se cruza una frontera.

## Módulo CRM (el primero)

Bounded contexts adentro del módulo, no mezclados en un formulario:

| Agregado | Responsabilidad |
|---|---|
| `Customer` | Maestro fiscal/comercial: CUIT, IVA, IIBB, plantas, contactos, alícuotas |
| `Lead` | Prospecto. Se convierte en cliente (el eslabón que Leal 1.0 no tenía) |
| `Opportunity` | Negocio en curso. No es un presupuesto: el presupuesto vivirá en Ventas |
| `Activity` | Timeline (nota, llamada, WhatsApp, mail, visita) |

Metrología, facturación, portal B2B y canales IMAP/Evolution **no** entran en el alta de cliente.

## Tenancy

Hoy: header `X-Tenant-Id` o tenant de desarrollo. Mañana: módulo Identity. Todas las tablas ya nacen con `TenantId`.
