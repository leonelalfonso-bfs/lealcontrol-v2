# Módulo Producción

## Objetivo
Administrar la fabricación de productos terminados y semielaborados con estructura de materiales, rutas, órdenes, consumos, resultados, mermas, trazabilidad y costos estimados.

## Circuito operativo
1. Catálogo: crear productos, unidades y reglas de lote/serie.
2. Estructura: crear BOM versionada con componentes, cantidades, merma, variantes y sustitutos.
3. Ruta: definir centros de trabajo y operaciones con tiempos y controles de calidad.
4. Orden: seleccionar producto/BOM, cantidad y fechas; liberar solo cuando la orden esté lista.
5. Ejecución: registrar consumo, devolución, merma y producción. El stock se ajusta en la misma transacción.
6. Cierre: completar la orden y consultar costos y reportes.

## API principal
- `GET/POST/PUT /api/v1/sales/production/boms`
- `GET/POST /api/v1/sales/production/variants`
- `GET/POST /api/v1/sales/production/work-centers`
- `GET/POST/PUT /api/v1/sales/production/routes`
- `GET/POST /api/v1/sales/production/orders`
- `PATCH /api/v1/sales/production/orders/{id}/status`
- `GET/POST /api/v1/sales/production/orders/{id}/executions`
- `GET /api/v1/sales/production/costs/{productId}`

## Reglas críticas
- No se permite stock negativo al consumir o registrar merma.
- El ajuste de Stock y el movimiento de Producción se confirman juntos.
- Una BOM no puede incluir el producto terminado como componente ni crear ciclos.
- Los componentes repetidos en una misma variante se rechazan.
- Los movimientos deben indicar producto, cantidad, unidad y tipo.

## Datos persistidos
`ProductionBom`, `ProductionBomLine`, `ProductionVariant`, `ProductionWorkCenter`, `ProductionRoute`, `ProductionOperation`, `ProductionOrder` y `ProductionExecutionEntry`.

## Prueba manual mínima
Crear producto terminado y materia prima → crear BOM → crear orden → liberar → registrar consumo → registrar producción → registrar merma → verificar Stock → completar orden → consultar Costos y Reportes.
