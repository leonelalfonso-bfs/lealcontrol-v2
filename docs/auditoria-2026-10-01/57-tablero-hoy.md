# Tablero "Hoy"

Rama: `codex/ui-hoy-20261009`, sobre `main` 72298bf.

Reemplaza al panel ejecutivo en la ruta de inicio (`/`). El ítem del menú pasa a llamarse "Hoy".

## Contenido

- **Encabezado:** fecha, semana, saludo según la hora y cuántas tareas quedan pendientes.
- **Indicadores del período** (mes, trimestre o año), cada uno con el color de su módulo:
  - Facturado y Cobrado, con su evolución y la variación contra el período anterior de igual largo.
  - Vencido a cobrar: saldo real después de imputar los recibos, cantidad de clientes y antigüedad de la deuda más vieja.
  - Presupuestos abiertos: borradores, enviados y aceptados.
- **Agenda ordenada por impacto.** Solo incluye las fuentes de los módulos habilitados para el usuario:
  - Cobranza vencida: una tarea por cliente, con saldo total y la factura más atrasada.
  - Facturas en borrador para autorizar en ARCA.
  - Cheques recibidos para depositar.
  - Presupuestos enviados que vencen en 3 días o vencieron hace menos de una semana.
  - Órdenes de compra con entrega atrasada.
  - Stock bajo mínimo.
  - Metrología: equipos de clientes y pesas patrón con calibración vencida.
  - Calidad: documentos con revisión vencida, quejas fuera de plazo, no conformidades abiertas, equipos sin calibrar y autorizaciones por vencer.

  Cada tarea puede tildarse como hecha en el día; la marca se guarda en el navegador y se reinicia al día siguiente.
- **Por cobrar en 4 semanas:** facturas por vencer y cheques en cartera, por semana, con el total ya vencido aparte.
- **Últimas facturas autorizadas** y la cotización del dólar BNA.

## Cambios técnicos

- `lib/receivables.ts`: el cálculo de cobrado y saldo por factura sale de Facturación a una función compartida. Facturación y "Hoy" usan la misma regla.
- Se elimina `ExecutiveDashboardV2`, que quedó sin uso.

## Validación

Recorrido con Playwright con datos locales: 6 facturas autorizadas (3 vencidas), 2 borradores, un presupuesto por vencer, una orden de compra atrasada y stock bajo mínimo. Se revisaron el orden de la agenda, el tildado de tareas, el modo oscuro y el celular, sin errores de consola. Frontend compilado.
