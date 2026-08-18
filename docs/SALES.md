# Módulo Ventas (Sales) — Leal Control 2.0

## Decisión de diseño

**Base: Leal 1.0 (producción)** — es la estructura que ya funciona en el negocio.

| Leal 1.0 | Leal 2.0 |
|---|---|
| `quotes` / Presupuestos | `Quote` (schema `sales`) |
| `orders` / Pedidos | `Order` (fase siguiente) |
| `draft → sent → ordered / rejected` | Igual |
| Líneas con opcionales, IVA 21, descuento | Igual |
| Revisiones (`revision`, `parent_id`) | Fase 2 |
| CRM lead → quote | Opportunity **Won** → quote borrador |

## De Odoo Community (qué sumamos / qué no)

| Idea Odoo | ¿La tomamos? | Notas |
|---|---|---|
| Un solo `sale.order` (cotización = pedido) | **No** | En Leal conviene separar oferta vs compromiso (estados de entrega/facturación ortogonales) |
| `draft / sent / sale` | **Parcial** | Mapeamos a draft/sent/ordered como en Leal |
| Opportunity → quotation | **Sí** | Slice 6: al ganar, borrador de presupuesto |
| Líneas + impuestos + descuentos | **Sí** | Ya en Leal 1.0 |
| Portal firma/pago online | **No** (aún) | Después |
| Pricelist compleja | **No** (aún) | Lista simple / precio manual primero |

## Flujo Slice 6

```
Opportunity (Won) → POST create draft Quote
  · requiere CustomerId en la oportunidad
  · línea inicial = título + monto esperado
  · status = Draft
```

Pedido (`Order`), remitos y facturas quedan para slices posteriores.
