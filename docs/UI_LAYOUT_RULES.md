# Reglas de layout operativo

## Ancho de trabajo

Las pantallas operativas del ERP deben utilizar el ancho disponible de `.main` mediante la clase `workspace-page`.

No usar `maxWidth` junto a `margin: "0 auto"` en listados, formularios, fichas, tableros, pedidos, presupuestos, compras, stock ni CRM. En pantallas anchas ese patrón desperdicia espacio e impide comparar información.

## Excepciones permitidas

- Documentos de impresión (A4 / comprobantes).
- Modales y diálogos.
- Campos de búsqueda, filtros y controles que necesiten una medida deliberada.
- Bloques secundarios de resumen, cuando no sean el contenedor de la pantalla.

## Implementación

