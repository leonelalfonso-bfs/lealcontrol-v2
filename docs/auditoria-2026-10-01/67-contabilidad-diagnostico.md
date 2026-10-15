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

### C1. Contabilizar Ventas y Compras (hecha, PR "Contabilidad C1")

- **Cómo entra lo de Ventas y Compras:** al tocar "Contabilizar" (vista previa o ejecución), Contabilidad les pide a Ventas y Compras que publiquen en la cola los comprobantes del período que faltan (`IAccountingDocumentSource`). Así nada se asienta solo (decisión 2) y lo cargado antes de usar Contabilidad entra la primera vez que se contabiliza ese período.
  - **Ventas:** facturas, notas de débito y de crédito **autorizadas por ARCA** (también FCE). No entran borradores, rechazadas ni proformas.
  - **Compras:** facturas y notas de proveedor registradas.
  - **Anuladas:** si ya estaban publicadas, se sacan de la cola o se contra-asientan.
- **Todo en pesos:** cada importe se convierte a la cotización del comprobante y se redondea por separado; el total es la suma de las partes, así el asiento cuadra al centavo. La moneda, la cotización y el total originales quedan como datos del documento.
- **Asientos modelo de fábrica nuevos**, con todas las alícuotas (21, 10,5 y 27 %), exento y percepciones; cada línea solo aparece si el comprobante tiene ese importe:
  - AM-VTA-FAC y AM-VTA-NC (ventas);
  - AM-CMP-FAC y AM-CMP-NC (compras: también percepciones de IVA e IIBB sufridas y otros tributos).
  - Los anteriores (AM-VTA-01/02/03 y AM-CMP-01/02, solo IVA 21 %) quedan inactivos en cada empresa al instalarse los nuevos. Se agregaron las cuentas 5.1.03 "Compras de Mercaderías, Insumos y Servicios" y 5.2.09 "Impuestos y Tasas".
- **La ventana "Contabilizar" ahora funciona:** el botón estaba deshabilitado ("en reconstrucción"). La vista previa muestra los avisos reales (comprobantes sin modelo, asientos que no cuadran) en lugar de un "validado con éxito" fijo. Se quitaron la casilla de Inventario (no publica nada todavía) y los contadores que no incluían Ventas ni Compras; el enlace final iba a una ruta inexistente.
- **Concurrencia:**
  - un "Contabilizar" a la vez por empresa (`LockPostingRunAsync`), así dos personas no publican ni asientan lo mismo;
  - el número de lote ya no choca si hay dos lotes en el mismo segundo;
  - el lote lo firma el usuario conectado, no la pantalla.
- **El período incluye el último día completo:** antes quedaban afuera los comprobantes del día "hasta" que tenían hora.
- **Se borraron** los endpoints `auto-post/invoice`, `auto-post/purchase` y `auto-post/receipt`. Ninguna pantalla los usaba, publicaban solo neto e IVA 21 %, y además **encendían solos la contabilización automática de la empresa**. Los escenarios QA ahora contabilizan por el circuito real.
- **El cierre de ejercicio** pide permiso de Aprobar, como contabilizar y cerrar meses.
- **Bug de Compras corregido:** el total de la factura de proveedor sumaba dos veces el exento (ya estaba dentro del subtotal), lo que inflaba la deuda con el proveedor. Las facturas viejas con exento quedan con el total mal hasta corregirlas: ver el conteo en el PR.
- **Manual de Ayuda de Contabilidad** (`/contabilidad/ayuda`): el circuito completo, de los comprobantes al cierre.
- **Pruebas:** `AccountingSalesPurchasesPostingApiTests` cubre:
  - venta con tres alícuotas y exento;
  - venta en dólares;
  - borrador excluido;
  - compra con percepciones;
  - sin duplicados;
  - anulación con contra-asiento;
  - nota de crédito;
  - modelos viejos retirados.

### C2. Libros IVA reales (hecha, PR "Contabilidad C2")

- **Contabilidad → Libros IVA** (`/contabilidad/libros-iva`): Libro IVA Ventas y Compras del mes armados desde los **comprobantes fiscales**, no desde los asientos (`IVatBookSource`, que implementa Ventas, igual que en C1).
  - **Ventas:** lo emitido con CAE. **Compras:** las facturas de proveedor vigentes.
  - En pesos (cada comprobante a su cotización); las notas de crédito restan.
  - Neto e IVA por alícuota (21, 10,5, 27 y otras), exento, percepciones de IVA e IIBB, otros tributos y total, con totales del mes.
  - Exportación a Excel.
- **Exportación al Libro IVA Digital de ARCA** (`/vat-books/arca`): un .zip con los cuatro archivos de importación (comprobantes y alícuotas de ventas y de compras), con el diseño de registro de ancho fijo (RG 4597: 266, 62, 325 y 84 posiciones).
  - Importes en la moneda del comprobante, con su código (PES, DOL) y cotización.
  - Un comprobante todo exento lleva operación "E" y un registro de alícuota 0 %.
  - Las compras B y C no discriminan IVA: van sin alícuotas y sin crédito fiscal computable.
  - Texto en ASCII y mayúsculas, sin acentos.
- **Antes de exportar se controla** lo que ARCA rechazaría y se muestra en pantalla: tipo de comprobante sin código, alícuota inexistente, moneda sin código, cotización fuera de formato, compra A o M sin CUIT del proveedor.
- **Pendiente: validarlo con el importador real de ARCA.** Antes de presentar la primera declaración, importar un mes en el Libro IVA Digital y comparar totales. Las pruebas cubren cada campo en su posición, pero no reemplazan esa validación.
- **Prolijidad:** las siete pantallas de Contabilidad tenían su propia barra de pestañas, con nombres distintos. Ahora usan una sola (`AccountingTabs`), que suma Asientos Modelos y Libros IVA.
- **Ayuda:** sección "Libros IVA y Libro IVA Digital de ARCA".
- **Pruebas:**
  - `ArcaVatBookExportTests`: diseño de registro campo por campo.
  - `AccountingVatBooksApiTests`: libros en pesos con nota de crédito y dólares, borrador excluido, compra C sin alícuotas, exportación rechazada si falta un CUIT.

### C3. Moneda extranjera y diferencias de cambio (hecha, PR "Contabilidad C3")

- **El libro va en pesos.**
  - El motor convierte cada comprobante en otra moneda a su cotización.
  - Debe y Haber siempre en pesos; la línea guarda moneda, cotización e importe original (`OriginalAmount`), y el Libro Mayor lo muestra como dato.
  - Los centavos de redondeo de la conversión van a la línea más grande, y el asiento cuadra exacto (antes se toleraba un centavo de diferencia).
  - Un comprobante en dólares sin cotización queda pendiente con el motivo.
  - Los asientos manuales aceptan líneas en dólares con su cotización.
- **Cobros en dólares:**
  - Finanzas exige la cotización del día; la pantalla de cobros la pide y sugiere la del BNA.
  - Cada factura en dólares cancelada guarda su cotización.
  - Contabilidad cancela Deudores a la cotización de la factura y la diferencia realizada va a diferencia de cambio (líneas nuevas en AM-FIN-01, también para las empresas existentes).
  - Antes un cobro en dólares se asentaba con importes en dólares mezclados con pesos.
- **Cobros en pesos de facturas en dólares:** como antes, la diferencia se documenta con nota de débito o crédito desde la cuenta corriente. Esas notas ahora se contabilizan con sus propios modelos (AM-VTA-DC-ND y AM-VTA-DC-NC): el neto va a Diferencia de Cambio Positiva o Negativa, no a Ventas.
- **Revaluación de fin de mes** (Cierres y períodos → "Revaluación de moneda extranjera"):
  - Las cuentas del plan con moneda USD (caja y bancos en dólares) se valúan a la cotización de cierre.
  - La diferencia va contra diferencia de cambio, sin cambiar el saldo en dólares.
  - Una vez por mes; respeta el candado; pide permiso de Aprobar.
- **Fuera de alcance, a propósito:**
  - Los créditos y deudas en dólares no se revalúan: su diferencia se documenta con notas, y revaluarlos la contaría dos veces.
  - Las órdenes de pago son siempre en pesos. La diferencia de un pago de una compra en dólares la documenta el proveedor con su nota.
- **Prolijidad:** se retiró la columna `ExchangeDifferenceAmount` de los recibos (copia de `SuggestedAdjustmentArs` que nadie leía) y el registro `ExchangeDifferenceRequest` sin uso.
- **Ayuda:** sección "Moneda extranjera y diferencias de cambio" en Contabilidad, y cobro en dólares en Finanzas.
- **Pruebas:**
  - `AccountingForeignCurrencyApiTests`: cobro en dólares con diferencia realizada; revaluación y su repetición rechazada; nota por diferencia de cambio; línea manual en dólares.
  - En el motor: conversión, centavos de redondeo y falta de cotización.

### C4. Cierre de ejercicio completo (hecha, PR "Contabilidad C4")

- **Mes de cierre por empresa** (decisión 3): en Cierres y períodos → "Ejercicios y cierre anual". El ejercicio va del día siguiente al cierre anterior al último día de ese mes. Se cambia solo mientras no haya ejercicios cerrados.
- **Cerrar ejercicio** genera tres asientos (origen `FiscalYear`):
  - **refundición:** cuentas de resultado contra Resultado del Ejercicio;
  - **cierre:** todas las cuentas patrimoniales en cero, también su saldo en moneda extranjera;
  - **apertura**, al día siguiente: el cierre invertido, con el resultado pasado a Resultados no Asignados.
- **Al cerrar:**
  - todos los meses del ejercicio quedan con candado, y no se pueden reabrir sueltos;
  - se cierra en orden y nunca un ejercicio que no terminó;
  - primero se traen los comprobantes de Ventas y Compras: si queda alguno sin contabilizar, no se cierra;
  - todo dentro del candado de "un contabilizar a la vez".
- **Reabrir:** solo el último ejercicio cerrado. Borra sus tres asientos de cierre y abre sus meses.
- **Reemplaza** al asistente anterior: era solo la refundición, por año calendario, con años fijos en pantalla y sin cierre ni apertura.
- **Libro Diario** (`/contabilidad/libro-diario`): asientos del período en orden de fecha, con número de orden correlativo que reinicia en cada ejercicio, listo para imprimir o guardar en PDF y exportar a Excel. La lista de trabajo pasó a llamarse "Asientos". El número interno del asiento no se toca.
- **Prolijidad:**
  - el candado de un mes lo firma el usuario conectado (antes, la pantalla mandaba "Contador Auditor");
  - el asiento de sueldos ya no trae importes de ejemplo cargados;
  - Contabilidad registra su propio reloj.
- **Ayuda:** cierre de ejercicio y Libro Diario.
- **Pruebas:** `AccountingFiscalYearApiTests` cubre:
  - los tres asientos, con dólares que siguen en el ejercicio nuevo;
  - el candado y la repetición rechazada;
  - el Libro Diario numerado;
  - la reapertura;
  - el mes de cierre en junio;
  - el cierre frenado por una venta sin contabilizar.

### C5. Integraciones restantes (hecha, PR "Contabilidad C5")

Decisiones del dueño (15/10/2026):
- costo de ventas por diferencia de inventario;
- sueldos con asiento manual hasta que RRHH liquide de verdad;
- registro simple de bienes de uso.

- **Costo de ventas por diferencia de inventario** (Cierres y períodos → "Existencias y costo de ventas"):
  - El stock a fin de mes se valúa al último costo de compra en pesos; si no hay compras, al costo cargado en el producto. Si no hay ninguno, vale cero y se avisa.
  - La cuenta Mercaderías se ajusta a ese valor contra CMV (5.1.01). Con las compras en "Compras" (C1), el costo del período es Compras + existencia inicial − existencia final.
  - Una vez por mes, respeta el candado y pide permiso de Aprobar.
  - El stock a una fecha se reconstruye desde el stock actual, restando los movimientos posteriores. Lo implementa Inventario (`IInventoryValuationSource`).
- **Bienes de uso** (`/contabilidad/bienes-de-uso`):
  - Alta con costo, valor residual, vida útil en meses y cuentas. Se agregaron las amortizaciones acumuladas de Maquinarias y de Instalaciones.
  - Amortización mensual en línea recta, con el mes de alta entero: un asiento por mes, que pone al día los meses que falten.
  - Baja con fecha. Ya amortizado, no se cambian los datos que definen la amortización.
  - El alta y la venta del bien se registran aparte (Ayuda).
- **Sueldos:** queda el asiento manual de Contabilidad, que ya valida que cuadre.
  - La liquidación de RRHH hoy es un esqueleto: inventa un sueldo de $ 750.000 si falta y no calcula contribuciones patronales.
  - Rehacerla es un proyecto propio de RRHH; cuando esté, se conecta.
- **Conciliación bancaria:** ya vivía en Finanzas. Se retiraron los endpoints de Contabilidad que solo respondían "se mudó", sus entidades y las tablas `accounting.bank_statements` y `bank_statement_lines` (sin uso; ver el conteo del PR).
- **Ayuda:** existencias y costo de ventas, bienes de uso, y sueldos.
- **Pruebas:** `AccountingInventoryAndAssetsApiTests` cubre:
  - valuación con los tres orígenes de costo, ajuste y su repetición;
  - CMV del mes siguiente;
  - amortización con puesta al día;
  - baja y datos bloqueados.

### C6. Ajuste por inflación (RT 6)

- Índices FACPCE (IPIM y empalmes) cargados por mes.
- Marcar las partidas no monetarias (la marca por cuenta ya existe).
- Asientos de ajuste del ejercicio y RECPAM.
- Estados contables en moneda homogénea.

Cada entrega termina con su manual de Ayuda ([regla](../CONTINUIDAD.md)).
