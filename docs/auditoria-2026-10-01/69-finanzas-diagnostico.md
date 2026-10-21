# Finanzas: diagnóstico y comparación con el mercado (16/10/2026)

## Qué tiene hoy LealControl

| Área | Qué hay | Notas |
|---|---|---|
| Bancos y cajas | Cuentas por moneda, saldo inicial, movimientos manuales, transferencias entre cuentas, arqueo de caja | Saldos calculados en el servidor (nota 60) |
| Cobranzas | Recibos con varias formas de cobro (efectivo, transferencia, cheques, retención), imputación a facturas, anticipos de clientes, diferencia de cambio, anulación | Retención sufrida = renglón manual con tipo y número de certificado |
| Pagos | Órdenes de pago con imputación a facturas de proveedor, cheque propio o de terceros, transferencia, efectivo, retención, anulación | Retención practicada = renglón manual, sin cálculo |
| Cheques | Cartera recibidos y emitidos (también eCheq), depósito, rechazo, anulación, uso en pagos, importación | Sin integración con bancos (no hay API pública de eCheq) |
| Extractos | Importación de extractos (perfiles por banco), vista previa, confirmación, conciliación automática y manual | |
| Conceptos | Conceptos financieros y reglas de clasificación automática | |
| Cuentas corrientes | Clientes y proveedores, con saldos en el servidor | |
| Cash flow | Proyección de 7 a 365 días | |
| Contabilidad | Cobros y pagos generan asientos (AM-FIN-01/02, C0–C6) | |
| Avisos | Cheques para depositar en el resumen diario | |
| Pruebas | Escenarios QA de finanzas, ciclo de cheques, importación y anulación | |

## Qué ofrecen los sistemas del mercado argentino

- **Tango Gestión (Tesorería):** bancos, cheques y tarjetas, fondos, arqueos, flujo de fondos, conciliación con importación de extractos. Retenciones con SICORE y padrones en módulos impositivos.
- **Colppy:** conciliación bancaria (planes altos), **cálculo automático de retenciones IIBB ARBA y AGIP** con padrón, pagos y cobranzas.
- **Xubio:** integración con bancos y tesorería básica.
- **Todos los ERPs que hacen de agente de retención:**
  - calculan la retención al armar el pago (Ganancias RG 830, IVA/SUSS, IIBB por padrón);
  - emiten el certificado;
  - generan los archivos para SICORE/SIRE y los aplicativos provinciales (ARBA, AGIP, SIFERE).
- **Lo más moderno** (Colppy, Contabilium, ERPs en la nube):
  - importación de movimientos de **Mercado Pago** y billeteras;
  - **pagos masivos por archivo** de home banking o Interbanking;
  - liquidaciones de **tarjetas**.

## Dónde estamos parados

**Fuerte en:** circuito cobro–pago–cheque–banco–conciliación–asiento, cuenta corriente con diferencia de cambio, reglas de clasificación. Está a la altura de Tango/Colppy para una PyME que no es agente de retención.

**Lo que falta, ordenado por impacto:**

1. **Retenciones sufridas como registro impositivo.**
   - Hoy son un renglón del recibo.
   - Falta:
     - libro por impuesto y jurisdicción (IIBB por provincia, Ganancias, IVA, SUSS);
     - control contra "Mis retenciones" de ARCA y los padrones provinciales;
     - exportación para la DDJJ de IIBB (SIFERE / ARBA / AGIP);
     - su asiento a las cuentas de crédito fiscal.
2. **Retenciones practicadas (si la empresa es agente).**
   - Cálculo automático en la orden de pago:
     - Ganancias RG 830, con mínimo no sujeto y acumulado mensual por proveedor;
     - IIBB por padrón ARBA/AGIP;
     - IVA y SUSS si corresponde.
   - Además: certificado imprimible y archivos SICORE/SIRE y provinciales.
   - Hoy se carga a mano.
3. **Agenda de pagos y cobros.**
   - Vencimientos de facturas de proveedor y de clientes.
   - Propuesta de pago semanal, por ejemplo "qué pago este viernes con la plata que hay".
   - El cash flow existe, pero no arma el pago.
4. **Pagos por archivo bancario:** exportar las transferencias de una o varias órdenes de pago en el formato del banco o de Interbanking. El formato varía por banco.
5. **Mercado Pago y billeteras:** importar el reporte de movimientos (cobros, comisiones, retenciones) y conciliar contra recibos.
6. **Tarjetas:** cupones de cobro con tarjeta y su liquidación (comisiones, retenciones, plazo de acreditación).
7. **Inversiones y préstamos:**
   - plazos fijos, FCI y cauciones con su devengamiento;
   - préstamos con cuotas e intereses.
   - Menos urgente para una PyME chica.

## Respuestas del dueño (20/10/2026)

1. **Retenciones:** está en proceso de ser agente de retención de **Ganancias**; el sistema debe poder con cualquier régimen.
2. **IIBB:** **Convenio Multilateral**, inscripto en varias provincias.
3. **Bancos:** Galicia, Credicoop, BBVA (Francés) y Santander; paga por **home banking**. El sistema tiene que escalar a medianas empresas con **Interbanking**.
4. **Mercado Pago, QR y tarjetas:** casi no los usa, pero los usuarios chicos sí.
5. **Inversiones:** fondos comunes **FIMA $ y FIMA USD**.
6. **Lo que más tiempo le lleva:** **conciliar y vincular los pagos al banco**.

## Plan (orden según las respuestas)

| Etapa | Contenido |
|---|---|
| F1 | **Conciliación asistida.** Ver el detalle abajo. |
| F2 | **Retenciones practicadas**, empezando por Ganancias RG 830. Ver el detalle abajo. |
| F3 | **Retenciones y percepciones sufridas con Convenio Multilateral.** Ver el detalle abajo. |
| F4 | **Pagos por archivo** de home banking (los 4 bancos) e **Interbanking**: una o varias órdenes de pago generan el archivo, y el extracto después las concilia solas. |
| F5 | **Fondos comunes de inversión** (FIMA $ y USD): cuenta de inversión en cuotapartes, suscripción y rescate desde el banco, valor de la cuotaparte, resultado por tenencia y su asiento. |
| F6 | **Mercado Pago y tarjetas** para usuarios chicos: importar sus reportes, comisiones y retenciones, y conciliar contra recibos. |

**F1, conciliación asistida:**
- Formatos de extracto de Galicia, Credicoop, BBVA y Santander listos para usar.
- Reconocer al proveedor o cliente por CUIT, CBU o nombre en la descripción del banco.
- Conciliar uno contra varios: una transferencia que paga varias órdenes, o un depósito con varios recibos.
- Desde un débito sin orden de pago, crear la orden con el proveedor y sus facturas pendientes. Lo mismo con los créditos y los recibos.
- Clasificar solos los gastos e impuestos bancarios: impuesto a los débitos y créditos, comisiones, IVA y SIRCREB.
- Una bandeja con la acción sugerida para cada renglón y confirmación masiva.

**F2, retenciones practicadas:**
- Motor de regímenes configurable, que sirve para IVA, SUSS e IIBB.
- Para Ganancias: mínimo no sujeto, acumulado mensual por proveedor, escala, inscriptos y no inscriptos.
- Cálculo al armar la orden de pago, certificado y archivo SICORE.

**F3, retenciones y percepciones sufridas con Convenio Multilateral:**
- Registro por impuesto y jurisdicción, que se alimenta de recibos, compras y SIRCREB del extracto.
- Control contra "Mis retenciones" y los padrones.
- Exportación para SIFERE y su asiento.

### Lo que muestran los archivos reales (20/10/2026)

Los archivos quedan en la PC del dueño; no se suben al repositorio.

- **Galicia, extracto de cuenta corriente** (CSV `;`, UTF-8 con BOM, comillas, coma decimal):
  - **Columnas:** Fecha, Descripción, Origen, Débitos, Créditos, Grupo/Concepto, Terminal, Observaciones, Número de Comprobante, Leyendas Adicionales 1 a 4, Tipo de Movimiento, Saldo.
  - **Transferencias** ("Trf Inmed Proveed", "Transferencias Cash Proveedores", "Transferencia de/a Terceros"): la **Leyenda 1 trae la razón social y la Leyenda 2 el CUIT de la contraparte** (11 dígitos, en todos los casos del mes); la Leyenda 3 trae el motivo (FACTURAS, VARIOS) o el banco.
  - **eCheq debitados:** "Echeq 48 Hs. Nro. N", con el **número de cheque** en el comprobante.
  - **FCI:** "Suscripcion Fima" / "Rescate Fima", con el fondo (FIMA PREMIUM CLASE A) y el número de operación.
  - **Gastos e impuestos:**
    - "Imp. Deb. Ley 25413 Gral.", "Imp. Cre. Ley 25413" (impuesto al cheque);
    - "Ing. Brutos S/ Cred" con leyenda "REG.RECAU.SIRCREB" (retención sufrida de IIBB, CM);
    - "Iva", "Percep. Iva";
    - "Com. Deposito De Cheque", "G.de Echeq" (gastos), "Comision Servicio De Cuenta", "Intereses Sobre Saldos Deudores";
    - "Deb. Autom. De Serv.", "Pago Visa Empresa", "Debito Debin", "Transf. Afip" (pagos de impuestos con VEP).
  - Alrededor de 290 renglones por mes; casi todo se puede clasificar o vincular solo.
- **Galicia, listados de eCheq emitidos y recibidos** (CSV `;`, dos filas de encabezado):
  - número, beneficiario o librador con **CUIT**, fechas de emisión y pago, importe ("$1.234,56"), estado (Aceptado, Pagado, Disponible), ID del cheque, CMC7, **motivo y descripción**;
  - en los emitidos, el motivo suele traer la **factura del proveedor** ("Factura / A00006-00000402");
  - historial de endosos, cesiones y avales.
- **Santander, movimientos** (CSV `;`, Latin-1):
  - antes de los datos vienen renglones de título ("Movimientos del Día", "Últimos Movimientos", la cuenta y el saldo), y hay **dos bloques**;
  - **columnas:** Fecha, Suc. Origen, Desc. Sucursal, Cod. Operativo, Referencia, Concepto, Importe, Saldo;
  - los débitos van **entre paréntesis**;
  - el concepto trae la contraparte con CUIT en las transferencias de Interbanking;
  - impuestos: "Impuesto Ley 25.413", "Iva Percepcion Rg 2408", "Iva 21% Reg De Transfisc Ley27743".
- **Faltan:** Credicoop y BBVA.

### F1 en concreto

**F1a (hecha):**
- Formatos Galicia, Santander y BBVA, con el archivo original (base64) y detección automática del banco.
- El movimiento guarda CUIT y nombre de la contraparte y el código de operación.
- La sugerencia de proveedor o cliente usa ese CUIT.
- Validado contra los archivos reales: Galicia 286 renglones con el saldo continuo en 285 de 285, Santander 5 y BBVA 14, sin errores.
- Credicoop queda pendiente: llega el 21/10.

**F1b (hecha):**
- **Bandeja de conciliación** por cuenta, con la acción sugerida para cada movimiento y confirmación masiva:
  - pago o cobro del sistema: ±5 días, desempatando por el CUIT del banco contra el del proveedor o cliente y por la fecha más cercana;
  - eCheq por número;
  - crear OP o recibo precargado;
  - gasto o impuesto;
  - sin identificar.
- **Clasificación de fábrica** de los textos del banco cuando no hay regla propia: impuesto al cheque, SIRCREB, IVA, percepciones, comisiones, intereses, FIMA y haberes.
  - Sobre el extracto real de Galicia, 255 de 286 renglones quedan clasificados o con contraparte. Los 31 restantes (débitos automáticos, compras con débito, VEP, Visa) necesitan una regla de la empresa.
- Se retiraron la consulta y la conciliación uno a uno anteriores.

**F1c (hecha):**
- **Uno contra varios:** una transferencia contra 2 a 5 pagos o cobros del sistema del mismo CUIT que suman su importe (±5 días).
- **Orden de pago desde el débito:** propone la factura pendiente del proveedor de ese importe, o hasta cuatro que lo sumen.
- **Queda:** el formato de Credicoop, cuando el dueño mande el archivo.


1. **Formatos de extracto incorporados.**
   - Galicia y Santander tal como bajan del home banking; Credicoop y BBVA cuando lleguen.
   - Se guardan los datos extra del renglón: CUIT de la contraparte, comprobante, leyendas y código operativo.
   - Detección automática del banco por el encabezado.
2. **Vinculación por CUIT**, en este orden:
   1. el débito con CUIT de un proveedor busca su orden de pago pendiente de banco (mismo importe, ±5 días);
   2. si no la hay, propone **crear la orden de pago** con las facturas pendientes de ese proveedor que sumen el importe;
   3. con los créditos, lo mismo con clientes y recibos.
3. **eCheq:**
   - importar el listado de emitidos y recibidos del home banking a la cartera, sin duplicar (por ID de cheque o CMC7);
   - el débito "Echeq Nro. N" se concilia solo contra el cheque emitido N y su orden de pago;
   - el motivo "Factura / A00006-00000402" vincula la factura.
4. **Uno contra varios:** una transferencia contra varias órdenes de pago del mismo proveedor, y un crédito contra varios recibos.
5. **Gastos e impuestos bancarios** clasificados solos por el texto del banco:
   - impuesto al cheque;
   - IVA y percepción de IVA (crédito fiscal);
   - SIRCREB, que va al registro de retenciones sufridas de F3;
   - comisiones e intereses.

   Se ofrece un asiento sugerido por el total del día o del mes.
6. **FCI:** "Suscripcion/Rescate Fima" se vincula con la cuenta de inversión de F5 (mientras tanto, como transferencia a una cuenta "FIMA").
7. **Bandeja de conciliación:** cada renglón del extracto con su estado (conciliado, sugerencia, crear OP/recibo, gasto bancario, sin identificar) y confirmación masiva de las sugerencias.

Cada etapa lleva su Ayuda como manual del circuito completo y pruebas con importes calculados a mano.

Fuentes: [Programa Tango Gestión 2026 (UNC)](https://secretariaextension.eco.unc.edu.ar/images/Programas_2026/Programa_Tango_Gestión_2026_.pdf), [Colppy: conciliación bancaria](https://intercom.help/Colppy/es/articles/4047961-conciliacion-bancaria), [Colppy: retención ARBA](https://intercom.help/Colppy/es/articles/1273216-calculo-de-retencion-de-impuesto-a-los-libb-provincia-de-buenos-aires-arba), [Colppy: retención AGIP](https://intercom.help/Colppy/es/articles/9670254-calculo-automatico-de-retencion-de-agip), [Sistemas de gestión 2026](https://www.developargentina.com/blog/sistemas-gestion-comercial-argentina-2026), [Mercado Pago: conciliación](https://mercadopago.cl/developers/en/docs/links-and-debts/conciliation).
