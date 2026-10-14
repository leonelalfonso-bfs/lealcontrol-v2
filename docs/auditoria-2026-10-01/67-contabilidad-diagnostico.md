# Contabilidad: diagnóstico y plan (14 de octubre de 2026)

> Análisis del módulo antes de construir, como se hizo con Flota ([64](64-flota-plan.md)). No cambia nada del sistema: describe qué hay, qué falla y propone entregas.

## Resumen

La **arquitectura es buena**: los módulos publican "documentos contables" en una cola, y Contabilidad los asienta con **asientos modelo** configurables. Hay plan de cuentas, centros de costo, períodos con candado, procesamiento por lote con vista previa y reversión, sumas y saldos, mayor y estado de resultados.

El problema es que **casi nada alimenta esa estructura**:

- **Las facturas de venta y de compra nunca se contabilizan.** Solo Finanzas (recibos de cobro y órdenes de pago) publica en la cola. Ventas, Compras, el stock y los sueldos no publican. Los únicos que llaman a "contabilizar factura" son escenarios de prueba.
- **El "Libro IVA Digital" es de mentira.** Arma el archivo con datos fijos inventados: tipo 001, punto de venta 00001, CUIT 30000000007 "CLIENTE GENERAL", el número de asiento como número de factura y un formato con barras que no es el de ARCA. Además sale de asientos que no existen. **No se puede presentar.**

Hoy Contabilidad sirve para asientos manuales y para ver cobros y pagos. No refleja la operación de la empresa.

## Lo que funciona

- **Plan de cuentas** jerárquico (5 niveles, imputables o no, moneda, marca de ajuste por inflación) con uno inicial razonable.
- **Asientos modelo** por módulo y tipo de documento, con condiciones (si hay IVA 21, si es efectivo…), importes por variable (neto, IVA por alícuota, percepciones, retenciones…) y signo invertido para notas.
- **Cola contable** (`PendingDocuments`): idempotente (un documento, un asiento), con reversión y registro de errores.
- **Mapeo** de cuentas financieras de Finanzas a cuentas contables.
- **Procesamiento por lote:** vista previa de los asientos, ejecución, historial y reversión de un lote.
- **Períodos mensuales con candado**, respetado al cargar asientos manuales y por lote.
- **Reportes:** sumas y saldos, libro mayor, estado de resultados (EBITDA y márgenes), resultado por centro de costo, conciliación de tesorería.
- **Cierre de ejercicio:** asiento de refundición de resultados.
- **Pruebas:** 17 del motor de plantillas y del lote, más escenarios QA.

## Problemas, por gravedad

### Graves

1. **Ventas y Compras no se contabilizan** (ver resumen). Tampoco se contabilizan las notas de crédito y débito, la Factura de Crédito Electrónica, las diferencias de cambio, el costo de ventas ni los sueldos (solo a mano, desde el portal del estudio).
2. **Libro IVA Digital falso** (ver resumen).
3. **Moneda extranjera mezclada:** un cobro en dólares se asienta con importes en dólares en el debe y el haber, y los reportes suman todo junto con los pesos. El balance en pesos sale mal apenas hay un movimiento en dólares.

### Importantes

4. **Asientos manuales sin validar la cuenta:** se acepta el código y el nombre que manda la pantalla, sin verificar que la cuenta exista, sea imputable y esté activa. Además se tolera un centavo de diferencia entre debe y haber, y el "creado por" lo informa la pantalla y no el usuario conectado.
5. **Numeración de asientos:** se calcula como el máximo más uno. Hay índice único, así que el número no se repite, pero dos asientos simultáneos (o la reversión de varios documentos juntos) terminan en error. Además, la numeración no sigue el orden de las fechas, que es lo que exige el Libro Diario.
6. **Cierre de ejercicio limitado:**
   - solo año calendario (no admite cierres en junio, por ejemplo);
   - se puede ejecutar dos veces;
   - no genera el asiento de apertura del ejercicio siguiente;
   - no cierra los períodos.
7. **La contabilización automática de Finanzas pasa por alto el candado:** el camino automático (`AutoPostOnConfirm`) no controla si el período está cerrado. El lote y los asientos manuales sí lo controlan.
8. **Ajuste por inflación:** las cuentas tienen la marca, pero no hay ninguna lógica que la use.

### Prolijidad

9. **Conciliación bancaria duplicada:** Contabilidad tiene sus propios extractos bancarios, además de los de Finanzas (que ya importa, clasifica y concilia).
10. **Plan de cuentas inicial con bancos de ejemplo** ("Banco Galicia C/C", "Banco Macro C/C"): deberían salir de las cuentas reales de Finanzas.
11. **El estado de resultados** usa prefijos fijos de cuenta (4.1 ventas, 5.1 costo, 5.2 gastos, 5.3 financieros): si el plan cambia, el reporte se desarma.

## Decisiones del dueño (14/10/2026)

1. **Contador interno y estudio externo:** tiene que servir para los dos (permisos y exportaciones pensados para ambos).
2. **Contabilizar es una acción explícita:** la administración carga en Finanzas, Ventas y Compras, y después alguien toca **"contabilizar"**. Ventas y Compras publican en la cola, y se asienta por lote revisado (`AutoPostOnConfirm` apagado), igual que hoy Finanzas.
3. **Fecha de cierre de ejercicio por empresa:** el producto es multiempresa, así que se configura en cada una.
4. **Ajuste por inflación:** sí, porque en Argentina es un tema recurrente. Pasa a ser una entrega propia (C6).

## Propuesta de entregas

### C0. Seguridad contable (hecha, PR "Contabilidad C0")

- **Retirar el Libro IVA Digital falso** hasta tener el real (C2).
- Validar los asientos manuales: la cuenta tiene que existir, ser imputable y estar activa; debe y haber cuadran al centavo, sin montos negativos ni líneas con los dos lados; el autor sale del usuario conectado.
- Numeración única, con un índice único y reintento.
- La contabilización automática también respeta el candado del período.
- **Además:**
  - el lote controla el candado documento por documento: antes comparaba rangos de meses y podía frenar un lote entero o dejar pasar meses cerrados;
  - el asiento de sueldos tiene que cuadrar y respeta el candado;
  - el cierre de ejercicio no se puede ejecutar dos veces;
  - un error al grabar ya no deja asientos a medias.
- **Cómo quedó:** `LockEntryNumberingAsync` toma la numeración con un bloqueo por empresa dentro de la transacción; `IsPeriodLockedAsync` controla el candado. Pruebas en `AccountingSafetyApiTests`, entre ellas diez asientos simultáneos con números seguidos.

### C1. Contabilizar Ventas y Compras (el corazón)

- **Ventas** publica al **autorizar en ARCA**: facturas A y B, FCE y sus notas, con neto y IVA por alícuota, exento y percepciones. Al anular se revierte.
- **Compras** publica al **registrar la factura del proveedor**: neto, IVA por alícuota y percepciones (IVA, IIBB, Ganancias). Al anular se revierte.
- **Todo en pesos:** las facturas en dólares se convierten a la cotización del comprobante, y la moneda y el importe original quedan guardados en la línea.
- Asientos modelo completos para cada tipo (los de fábrica cubren solo factura A y B, la nota de crédito A, y la factura y la nota de crédito A de compra).
- Se contabiliza **por lote**, cuando alguien toca "contabilizar" (decisión 2).
- Termina con el **manual de Ayuda de Contabilidad**.

### C2. Libros IVA reales

- **Libro IVA Ventas y Compras** armados desde los **comprobantes fiscales**, no desde los asientos. Con pantalla, totales por alícuota y exportación a Excel.
- **Exportación Libro IVA Digital de ARCA** en el formato oficial de ancho fijo (comprobantes y alícuotas, ventas y compras), validada con el aplicativo de ARCA en homologación antes de usarla.

### C3. Moneda extranjera y diferencias de cambio

- Libro mayor y balances en pesos, con la moneda original como dato informativo.
- Diferencia de cambio automática en cobros y pagos de comprobantes en dólares.
- Revaluación de saldos en moneda extranjera al cierre de mes.

### C4. Cierre de ejercicio completo

- Fecha de cierre de ejercicio por empresa (decisión 3).
- Refundición, cierre y **apertura** del ejercicio siguiente. Que no se pueda cerrar dos veces y que cierre los períodos.
- **Libro Diario** numerado en orden cronológico, imprimible y exportable.

### C5. Integraciones restantes (con el contador)

- Costo de ventas desde los remitos y el consumo en servicio (con el costo del stock).
- Sueldos automáticos desde la liquidación de RRHH.
- Amortizaciones de bienes de uso.
- Unificar la conciliación bancaria en Finanzas y retirar la duplicada.

### C6. Ajuste por inflación (RT 6)

- Índices FACPCE (IPIM y empalmes) cargados por mes.
- Marcar las partidas no monetarias (la marca por cuenta ya existe).
- Asientos de ajuste del ejercicio y RECPAM.
- Estados contables en moneda homogénea.

Cada entrega termina con su manual de Ayuda ([regla](../CONTINUIDAD.md)).
