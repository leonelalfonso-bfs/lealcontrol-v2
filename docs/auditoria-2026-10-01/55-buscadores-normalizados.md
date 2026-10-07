# Buscadores normalizados

Rama: `codex/buscadores-20261006`, sobre `codex/seguridad-rendimiento-20261006` (PR 72).

## Regla única de búsqueda

Backend (`SearchText`, BuildingBlocks) y frontend (`lib/search.ts`) aplican la misma regla:

- Sin distinguir mayúsculas ni acentos: "metalurgica" encuentra "Metalúrgica", "nandu" encuentra "Ñandú".
- Varias palabras en cualquier orden, y todas deben aparecer: "sur metal".
- Palabras con 3 dígitos o más se comparan solo por dígitos: el CUIT con o sin guiones, partes de un número de comprobante o un teléfono.

En SQL, `SearchText.Fold` se traduce a `translate(lower(x), 'áà…', 'aa…')`. No requiere la extensión `unaccent`.

Se aplica en clientes, proveedores, productos, facturas, remitos, pedidos, órdenes de compra, recepciones, facturas de proveedor, comprobantes ARCA, solicitudes de compra, inventario, personal, flota y contratos de granos.

## Componentes

- `SearchField`: filtro de listados. Busca mientras se escribe, muestra la cantidad de resultados, Esc limpia y "/" enfoca el campo desde cualquier parte de la pantalla.
- `EntityPicker`, `CustomerPicker` y `ProductPicker`: reemplazan los `<select>` largos de cliente, proveedor y producto en presupuestos, pedidos, remitos, facturas, recibos, órdenes de pago, compras, oportunidades, calidad, metrología y producción. Permiten escribir para filtrar, moverse con ↑↓, elegir con Enter y crear un registro nuevo desde la lista. El panel se dibuja sobre la página, así no lo recortan tablas ni modales.

Estilos en `styles/instrumento.css`, primeros tokens del sistema de diseño "Instrumento", con modo claro y oscuro.

## Errores corregidos

- **Presupuestos:** el buscador no filtraba. El backend ignora el parámetro y el filtro local solo miraba estado y moneda.
- **Recibos de cobranza, órdenes de pago y cuentas corrientes:** cargaban solo las primeras 50 empresas. El cliente 51 no aparecía en el selector ni en las cuentas corrientes.
- **Proveedores:** la lista se cortaba en 200.
- **Productos, facturas, remitos, pedidos, compras, inventario, personal, flota, granos e importación ARCA:** consultaban el servidor en cada tecla. Ahora esperan 250 ms sin escribir.
- **Pedidos:** la búsqueda distinguía mayúsculas.
- **Patrones metrológicos:** el texto ofrecía buscar por valor, pero el filtro no lo hacía.

## Validación

- `CustomerSearchNormalizationTests` (10 casos contra Postgres real): acentos, orden de palabras, CUIT con guiones, teléfono, "ñ" y exigencia de todas las palabras.
- Las 10 búsquedas de documentos se ejecutaron contra la API local: todas traducen a SQL sin errores.
- Recorrido con Playwright en Clientes, Proveedores, Directorio, Productos, Facturas, Presupuestos, Nuevo presupuesto, Orden de compra y modo oscuro, sin errores de consola.
