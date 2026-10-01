# Cambio preparado: no mover stock por servicios

Rama local: `codex/sales-stock-services` en `/home/leonel/Desarrollo-sales-stock-services`, base `5acf972`. El arreglo compiló con cero advertencias y cero errores; falta la prueba funcional en staging.

## Problema y alcance

Al generar un remito o una factura directa, la API intenta ajustar `StockItem` para cualquier `ProductId` presente, incluso cuando el producto es un servicio o tiene `TrackStock=false`. La corrección propuesta limita ambos egresos a productos cuyo seguimiento de stock está activo. No cambia la creación del remito o la factura, sus precios ni el PDF.

Archivos modificados: `src/Modules/Sales/LealControl.Modules.Sales.Infrastructure/Persistence/RemitoQueryHandlers.cs` y `src/Modules/Sales/LealControl.Modules.Sales.Infrastructure/Persistence/InvoiceQueryHandlers.cs`.

## Prueba local

1. Compilar API con `dotnet build src/Host/LealControl.Api/LealControl.Api.csproj` en el worktree.
2. Revisar el diff (`git diff --check` y `git diff`) para confirmar que solo se limita el bloque de stock.

## Prueba funcional futura en staging

Usar una empresa y productos de prueba; no usar producción. Registrar stock inicial y movimientos del kardex.

1. Crear un pedido con un servicio, un producto inventariable y otro producto con seguimiento desactivado. Remitirlo. Confirmar que el remito contiene los tres, pero kardex y saldo solo cambian por el inventariable.
2. Crear una factura directa con los mismos tres tipos. Confirmar la misma separación y el total fiscal correcto. No solicitar autorización ARCA en esta prueba.
3. Crear una nota de crédito directa de prueba sobre el inventariable, y confirmar que el movimiento inverso solo aplica al producto seguido.
4. Verificar que una devolución de remito de servicio o producto sin egreso sea rechazada y que una devolución del inventariable sí revierta el egreso una sola vez.

## Límite

Este cambio evita movimientos erróneos nuevos. Si ya existen movimientos de servicios, requieren auditoría de solo lectura y un plan de conciliación independiente; no se corrigen datos automáticamente.
