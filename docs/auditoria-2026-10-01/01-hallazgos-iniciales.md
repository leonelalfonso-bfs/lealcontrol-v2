# LealControl v2 — auditoría inicial y plan de cierre del CRM

Fecha de revisión: 30/09/2026 (Argentina). Fuente: `main` tras el PR #57. Revisión de código; no sustituye pruebas funcionales ni una auditoría completa de todos los módulos.

## Hallazgos confirmados en código

1. **Alta rápida de prospecto duplica oportunidades (alta prioridad).** `ConvertLeadCommandHandler` crea una oportunidad al convertir un lead. `LeadsPage` llama de nuevo a `openOpportunity` cuando la casilla «Crear automáticamente una Oportunidad» está marcada. Si se desmarca, el backend igualmente la crea. Resultado esperado: exactamente una oportunidad cuando se solicite y ninguna cuando no se solicite. Archivos: `src/Modules/Crm/LealControl.Modules.Crm.Application/Leads/LeadUseCases.cs`, `src/Modules/Crm/LealControl.Modules.Crm.Infrastructure/Http/CrmEndpoints.cs`, `frontend/src/pages/LeadsPage.tsx`.
2. **Servicios afectan el stock al despachar (alta prioridad).** `Product.Create` fuerza `TrackStock=false` para servicios, pero `RemitoQueryHandlers` crea/ajusta `StockItem` y registra `SaleDelivery` para cualquier producto identificado. La factura directa tiene el mismo patrón. Hay que omitir movimientos físicos para servicios y productos sin control de stock, y revisar saldos anteriores con una consulta de solo lectura antes de proponer ajustes. Archivos: `src/Modules/Sales/LealControl.Modules.Sales.Domain/Products/Product.cs`, `src/Modules/Sales/LealControl.Modules.Sales.Infrastructure/Persistence/RemitoQueryHandlers.cs`, `src/Modules/Sales/LealControl.Modules.Sales.Infrastructure/Persistence/InvoiceQueryHandlers.cs`.
3. **Reintento de devolución puede duplicar el ingreso (alta prioridad).** La API bloquea cantidades superiores al saldo, pero no identifica un reintento del mismo POST. Si se pierde la respuesta tras confirmar 1 de 2 unidades, repetir la solicitud puede ingresar otra unidad. Propuesta: identificador de operación persistido y único por tenant, respuesta idempotente bajo el mismo bloqueo del remito. Archivo: `src/Modules/Sales/LealControl.Modules.Sales.Infrastructure/Persistence/RemitoReturnHandlers.cs`.
4. **«Aplicar %» contradice la factura de remito (prioridad media).** `InvoiceFormPage` deja modificar las cantidades con «Aplicar %» incluso cuando se factura un remito; el servidor exige el saldo neto exacto y rechaza la factura. Ocultar o deshabilitar esa herramienta en este flujo; mantenerla para facturas sin remito. Archivo: `frontend/src/pages/InvoiceFormPage.tsx`.
5. **Contrato CRM incompleto para probabilidad/campos personalizados (prioridad media).** `MoveOpportunityCommand` acepta `Probability` y `CustomFields`, pero `MoveOpportunityRequest` expone solo etapa y motivo; el endpoint no pasa esos valores. Confirmar la necesidad funcional y alinear API/UI antes de presentar un forecast. Archivos: `src/Modules/Crm/LealControl.Modules.Crm.Application/Pipeline/PipelineUseCases.cs`, `src/Modules/Crm/LealControl.Modules.Crm.Infrastructure/Http/CrmEndpoints.cs`.
6. **Exportación de prospectos sin nombre de empresa (prioridad baja).** `LeadDto` devuelve `name`, mientras la columna Excel «Empresa» en `LeadsPage` usa `companyName`. Debe leer `name` o normalizar el contrato. Archivos: `src/Modules/Crm/LealControl.Modules.Crm.Application/Leads/LeadUseCases.cs`, `frontend/src/pages/LeadsPage.tsx`.
7. **Dos solicitudes simultáneas pueden crear dos presupuestos para una oportunidad (alta prioridad).** `CreateDraftFromOpportunityCommandHandler` busca un presupuesto existente y después inserta; el índice de `QuoteConfiguration` sobre `(TenantId, OpportunityId)` no es único. Una colisión de número de presupuesto se reintenta con otro número, de modo que las dos solicitudes podrían persistir. Antes de agregar una restricción única parcial para presupuestos no cancelados, contar duplicados existentes por tenant/oportunidad. Archivos: `src/Modules/Sales/LealControl.Modules.Sales.Application/Quotes/QuoteUseCases.cs`, `src/Modules/Sales/LealControl.Modules.Sales.Infrastructure/Persistence/Configurations/QuoteConfiguration.cs`.
8. **Regla documentada de presupuesto desde oportunidad no coincide con el código (prioridad media).** `docs/CRM_MIGRATION_BACKLOG.md` describe «oportunidad ganada → presupuesto», pero el handler rechaza oportunidades `Won` y `Lost`; la UI crea el presupuesto en `Proposal`. Acordar el circuito comercial y actualizar la regla/documentación sin asumir que el documento histórico refleja el producto vigente.
9. **Checklist CRM desactualizado frente a `main` (prioridad media).** `docs/PLAN_RELACION_COMERCIAL.md` aún dice que falta fusionar la visibilidad de CRM, mientras `frontend/src/app/moduleRegistry.ts` ya incluye CRM y lo asigna al plan comercial. Separar «código publicado» de «validado en staging» y actualizar el checklist solo con evidencia.
10. **Cobertura de CRM incompleta (prioridad media).** Las pruebas de integración actuales cubren clientes y seguridad, pero no hay pruebas de API para conversión de leads, embudo, actividades o presupuesto desde oportunidad. El primer parche preparado agrega el caso de conversión con y sin oportunidad; las demás rutas quedan en la rama de cierre CRM.

## Cierre de CRM: orden de trabajo propuesto

- **Rama local `codex/crm-lead-conversion`:** corregir la conversión opcional y la exportación; agregar prueba de handler/API para 0/1 oportunidad, conversión repetida y aislamiento por tenant. No publicar.
- **Rama local `codex/sales-stock-services`:** detener movimientos de servicios en remitos y facturas directas; agregar prueba del balance de stock para servicio y repuesto. No modificar saldos históricos sin conciliación.
- **Rama local `codex/remito-return-idempotency`:** clave de operación única, migración compatible, prueba de reintento y concurrencia. No publicar.
- **Rama local `codex/crm-completion`:** reconciliar `docs/PLAN_RELACION_COMERCIAL.md` con el código actual; completar pruebas de pipeline, actividades, presupuesto desde oportunidad y ficha unificada; verificar en staging antes de marcar funcionalidades como comprobadas.
- **Rama local `codex/crm-quote-uniqueness`:** auditar duplicados existentes, definir restricción única para presupuesto activo por oportunidad y probar dos creaciones concurrentes. Mantener la decisión sobre cuándo se permite crear el presupuesto separada de esta corrección de concurrencia.
- Mantener separados informes de código, resultados de pruebas locales y resultados de staging. Los documentos CRM existentes mezclan estado histórico y actual; no asumir que un `[x]` equivale a validación funcional.

## Instructivos de prueba propuestos

### CRM: conversión de prospecto

1. Crear prospecto con CUIT de prueba y convertirlo con «Crear oportunidad» activado. Verificar un cliente, una oportunidad vinculada al lead y una actividad de conversión.
2. Repetir con la opción desactivada. Verificar un cliente y ninguna oportunidad.
3. Reintentar la conversión del mismo prospecto. Debe rechazarse sin crear otro cliente.
4. Exportar prospectos a Excel. La columna Empresa debe contener el nombre mostrado en pantalla.
5. Repetir consultas con dos tenants de prueba para confirmar aislamiento.
6. Enviar dos peticiones simultáneas para crear el presupuesto de la misma oportunidad. Deben devolver el mismo borrador o una de ellas rechazar sin insertar un segundo presupuesto. Verificar también que cancelar un presupuesto permita uno nuevo solo si esa es la regla comercial aprobada.

### Ventas: stock y devolución

1. Pedido de prueba: un servicio y dos unidades de un repuesto inventariable. Registrar saldos previos.
2. Generar remito. Debe bajar dos el repuesto y no cambiar stock del servicio.
3. Devolver una unidad del repuesto. Debe subir una sola vez; el Kardex conserva referencia al remito/devolución.
4. Reenviar exactamente la misma confirmación. Debe responder con la devolución original sin nuevo movimiento.
5. Facturar en borrador: servicio completo y una unidad del repuesto al precio del pedido. No autorizar en ARCA durante esta prueba.
6. Probar que «Aplicar %» no altera una factura vinculada a remito y que no se puede devolver después de facturar.

## Estado de preparación

No se subió ningún cambio ni se creó una rama nueva en esta revisión. La terminal del agente no inicia procesos en el checkout actual. Dejé preparado `/tmp/lealcontrol-preparar-ramas-auditoria.sh`, que crea cinco ramas en worktrees aislados desde `origin/main` sin tocar los cambios pendientes ni publicar nada. Cuando vuelva a estar disponible la terminal, ejecutarlo y después compilar/probar cada corrección antes de considerarla lista para revisión. La continuación diaria está programada en este chat.

Actualización del 01/10/2026: preparé `/tmp/leal-crm-lead-conversion-fix.sh` para aplicar el primer arreglo en `codex/crm-lead-conversion`, agregar una prueba de integración para ambas opciones de la casilla y compilar API/frontend. **No se ejecutó** por la falla de terminal; los resultados de compilación y pruebas siguen pendientes.
