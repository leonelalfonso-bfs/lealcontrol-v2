# Liquidación de sueldos: diagnóstico y plan (15 de octubre de 2026)

> Análisis antes de construir, como se hizo con Contabilidad ([67](67-contabilidad-diagnostico.md)). Objetivo del dueño: una liquidación **totalmente funcional que cumpla las leyes argentinas** y que sirva para **cualquier convenio**. El primer caso real es UECARA (CCT 660/13).

## Resumen

Lo que hay en RRHH no es una liquidación de sueldos:

- **Inventa sueldos.** Si un empleado no tiene sueldo básico cargado, usa $ 750.000.
- **Calcula solo** básico, antigüedad al 1 % por año (regla de Comercio, no de cualquier convenio) y aportes del 11 %, 3 % y 3 %, **sin tope**.
- **No calcula:**
  - contribuciones patronales;
  - aguinaldo, vacaciones, horas extra, ausencias ni licencias;
  - aportes sindicales ni Ganancias.
- **El "Libro de Sueldos Digital" es falso.** Usa un CUIT fijo inventado (30718293849) y un diseño de registro que no es el de ARCA. **No se puede presentar.**
- **La pantalla de liquidación no funciona:**
  - llama a rutas que no existen en el servidor (`/payroll/calculate/…`, `/payroll/slips/{id}`);
  - descarga los archivos sin la sesión del usuario.
- **Lo que sí sirve como base:**
  - el **legajo** (datos personales, ingreso, CCT y categoría como texto, obra social, CBU);
  - documentos del legajo, organigrama, puestos y manuales;
  - la **firma del recibo por el empleado** (sello de tiempo y hash).

## Marco legal vigente (octubre de 2026)

Fuentes: Boletín Oficial, ARCA y ANSES. Algunos importes se relevaron de publicaciones especializadas y **se verifican contra la norma oficial al implementar cada parte**.

### Ley de Contrato de Trabajo con la Ley 27.802 de Modernización Laboral

Sancionada el 27/02/2026 y publicada el 06/03/2026.

- **Indemnización por despido (art. 245):**
  - un mes por año (o fracción mayor de 3 meses) sobre la mejor remuneración mensual, normal y habitual del último año;
  - la base **excluye el aguinaldo, las vacaciones y los bonos no mensuales**; un concepto es habitual si se devengó al menos 6 meses del último año;
  - los variables se promedian (6 meses o el año, lo más favorable);
  - la base tiene un **tope** de 3 veces el promedio del convenio y un **piso** del 67 % de la remuneración.
  - Hay que confirmar a qué despidos se aplica: hay criterios distintos (fecha de ingreso o fecha de despido).
- **Fondo de Asistencia Laboral (FAL):**
  - contribución del **2,5 % para MiPyMEs** y del 1 % para el resto, sobre la base de las contribuciones al SIPA;
  - **se compensa con las contribuciones patronales** (no es un costo adicional);
  - rige desde el **período devengado noviembre de 2026**: RG ARCA 5907/2026, F.931 con "Declaración en línea" versión 48, VEP concepto 266-019-019; requiere validar el ID FAL en Simplificación Registral;
  - el FAL no reemplaza la indemnización: el empleador sigue obligado a pagarla.
- **Vacaciones:**
  - se pueden fraccionar en tramos de al menos 7 días y gozar fuera del período legal, de común acuerdo;
  - el preaviso baja a 30 días;
  - se siguen pagando por adelantado.
- **Banco de horas** (art. 197 bis): compensación de horas extra con tiempo libre, por escrito.
- **Recibo de sueldo:** puede emitirse y firmarse en forma digital, y conservarse digitalizado (2 años lo laboral, 10 años lo previsional).
- **Período de prueba:** sin preaviso. La duración varía según el tamaño de la empresa y el convenio (a confirmar con el art. 92 bis).
- **Aporte solidario sindical:** con tope del 2 % del salario.
- **Régimen de Incentivo a la Formalización Laboral (RIFL)** (Decreto 315/2026, RG 5844/2026): contribuciones reducidas por 48 meses para altas entre el 01/05/2026 y el 30/04/2027 que cumplan los requisitos.
- **Advertencia:** hubo una medida cautelar de la CGT sobre artículos de la ley. Las fuentes indican que se dejó sin efecto, pero hay que confirmar su estado al implementar la liquidación final.

### Aportes y contribuciones

- **Aportes del trabajador:**
  - 11 % jubilación (SIPA), 3 % Ley 19.032 (PAMI) y 3 % obra social;
  - topes de **base imponible mínima y máxima** que ANSES actualiza **todos los meses** (septiembre de 2026: máxima $ 4.691.748,47, Res. ANSES 257/2026).
- **Contribuciones patronales** (Ley 27.541):
  - **18 %** para MiPyMEs y el resto de los empleadores privados; 20,40 % para comercio o servicios fuera de MiPyME;
  - más **6 % de obra social**;
  - detracción de $ 7.003,68 por trabajador (montos congelados desde 2019).
  - Desde noviembre de 2026, parte se destina al FAL.
- **ART:** alícuota variable más un fijo por trabajador, según el contrato con la aseguradora.
- **Seguro de vida obligatorio** (Decreto 1567/74): prima por trabajador.

### Ganancias de cuarta categoría (RG 4003)

- Retención **acumulativa** en el año.
- Deducciones personales y escala del art. 94 que se actualizan **cada semestre** (enero y julio).
- Deducciones que informa el empleado por **SiRADIG (F.572 web)**.
- Liquidación anual y final (F.1357).

### Libro de Sueldos Digital y F.931

- La liquidación se informa a ARCA con el **Libro de Sueldos Digital**, que genera el F.931.
- Se importa un archivo de texto ANSI con registros: 01 (datos de la liquidación), 02 (cada trabajador), 03 (cada concepto), 04 (atributos de la relación para la seguridad social) y 05 (eventuales).
- Los conceptos propios se asocian a los conceptos de ARCA.
- La especificación oficial es la "Guía de uso" de ARCA, versión 2.1 (mayo de 2026), Anexos II y III.

### Convenio UECARA (CCT 660/13), primer caso real

- **Escalas por grupo y por zona** (I a V), con aumentos trimestrales y **sumas no remunerativas** temporarias por grupo.
- **Antigüedad:** **monto fijo por año**, igual en todas las zonas, que se cobra **desde el mes siguiente** al aniversario. En Comercio, en cambio, es un porcentaje del básico.
- **Adicional por zona:** solo mientras se trabaja en esa zona.
- **Afiliados:** cuota sindical del 2 %. **No afiliados:** aporte solidario del 1 %. Hubo además un aporte extraordinario del 1,5 % por seis meses desde abril de 2026; hay que confirmar si se prorrogó.
- **Vacaciones:** 14, 21, 28 o 35 días según la antigüedad.

**Conclusión para el diseño:** cada convenio es distinto (antigüedad en porcentaje o en monto fijo, zonas, divisor de la hora, adicionales, aportes sindicales y contribuciones al sindicato). El motor no puede tener reglas fijas: **cada convenio se configura** (categorías, escalas por vigencia, adicionales por fórmula, aportes) y los parámetros legales se guardan **con fecha de vigencia**.

## Datos del dueño (15/10/2026)

1. **Convenio:** UECARA, pero el sistema debe poder cumplir **cualquier convenio**.
2. **Empresa MiPyME:** contribuciones del 18 % y FAL del 2,5 %.
3. **Hoy liquida un estudio contable** para menos de 25 empleados. Se pueden comparar los recibos mes a mes antes de pasar a liquidar con el sistema.
4. **Ningún empleado paga Ganancias:** la retención va al final del plan, pero se hace porque el producto es para cualquier empresa.

## Propuesta de entregas

Cada entrega termina con su **manual de Ayuda**. Desde S3 se **compara con los recibos del estudio** del mismo mes antes de darla por buena.

### S0. Sacar lo falso (hecha, PR "Sueldos S0")

- **Se retiraron de la API de RRHH:**
  - el cálculo (sueldo inventado, aportes sin tope);
  - el Libro de Sueldos Digital falso;
  - la planilla bancaria;
  - los endpoints de períodos, conceptos y recibos que la pantalla llamaba con rutas equivocadas.
- **Las tablas** de períodos, conceptos y recibos **se conservaron** hasta S3, que las borró (ver S3).
- **La pantalla de liquidación** explica que está en reconstrucción y por qué, con las etapas.
- **La Ayuda de RRHH** prometía un Libro de Sueldos "listo para AFIP" y un presentismo que no existía. Se rehízo como manual de lo que funciona: legajos, documentos, EPP, organigrama, manuales y el estado de sueldos.

### S1. Empleador, parámetros legales y legajo completo (hecha, PR "Sueldos S1")

- **Datos del empleador** (RRHH → Configuración de sueldos):
  - MiPyME y comercio o servicios, que definen la contribución del 18 % o del 20,40 % y el FAL del 2,5 % o del 1 %;
  - código de actividad, ART (alícuota variable y suma fija), seguro de vida obligatorio e ID FAL;
  - la razón social y el CUIT se muestran desde la configuración de la empresa.
- **Parámetros legales con vigencia por mes**, cada uno con su norma:
  - aportes 11/3/3, contribuciones 18 y 20,40, obra social 6, detracción $ 7.003,68;
  - FAL 2,5 y 1 desde 11/2026;
  - topes de ANSES de 06 a 10/2026 (resoluciones 139, 186, 232, 257 y 284/2026).
  - **Cómo funcionan:**
    - Los trae el sistema (se siembran en cada base; nunca se borran).
    - La empresa puede cargar un valor con su norma, que a igual mes reemplaza al del sistema; puede borrar solo los suyos.
    - Si falta el tope de ANSES del mes, se usa el anterior y se avisa.
- **Legajo:**
  - CUIL validado con su dígito verificador;
  - afiliado al sindicato;
  - códigos de situación de revista, condición, actividad, modalidad, siniestrado y localidad;
  - obra social (código RNOS) y adherentes, cónyuge e hijos, jornada parcial con horas.
  - Los códigos se guardan como número editable, con los valores confirmados en documentos oficiales: la situación de revista de la guía 15 del Libro de Sueldos, condición 1 y 2, modalidad 8 y 102. Las tablas completas de ARCA viven dentro de su aplicativo: lo demás se carga con el código que indique el estudio.
- **Fuentes del diseño del Libro de Sueldos** (para S5): Guía 15 "Interfaz de liquidación" de ARCA.
  - Topes: mensual de 30 días, de aguinaldo de 180.
  - Conceptos de aguinaldo 120000–129999 solo en junio y diciembre; aguinaldo proporcional con el 120003.
  - Adelanto vacacional 150000 con tope propio.
  - Fecha de pago obligatoria; CBU si se acredita en cuenta.
- **Producción al 15/10/2026:** 1 legajo, y 1 período y 1 recibo de la liquidación vieja (seguramente de prueba). En S3 se propone borrarlos, con OK.
- **Ayuda de RRHH:** datos de seguridad social del legajo y configuración de sueldos.
- **Pruebas:** `PayrollConfigurationApiTests` cubre:
  - topes de octubre con su norma, FAL desde noviembre;
  - aviso de tope faltante y carga de la empresa que lo reemplaza;
  - borrado solo de lo propio;
  - empleador validado;
  - CUIL inválido y jornada parcial sin horas rechazados.

### S2. Convenios configurables (hecha, PR "Sueldos S2")

- **Modelo genérico** (RRHH → Convenios colectivos). Ninguna regla de un convenio está escrita en el código.
  - **Convenio:** número, sindicato, divisor de la hora y zonas.
  - **Categorías** por grupo.
  - **Escalas por mes** (básico y suma no remunerativa por categoría y zona, con su fuente):
    - se **pegan** desde una planilla, todo o nada, con el error de cada fila;
    - o se **generan** con el % de aumento del acuerdo sobre la escala anterior, redondeando a pesos o no.
  - **Reglas con vigencia** (desde y hasta):
    - adicional (remunerativo o no), descuento al trabajador o contribución del empleador;
    - cálculo: % del básico, % de la remuneración, monto fijo, $ o % por año de antigüedad, con la opción "el año que se cumple en el mes se cobra desde el siguiente";
    - filtros por zonas, grupos, afiliación y una marca del colaborador (título, fallo de caja) o del mes (asistencia perfecta, que en S3 sale de las novedades).
  - **Controles:**
    - el aporte solidario de los no afiliados no puede pasar del 2 % (Ley 27.802);
    - el simulador avisa si la suma de los solidarios lo supera, como pasa con UECARA (1 % más el extraordinario del 1,5 %, que la Comisión del acuerdo mantuvo vigente): confirmarlo con el estudio.
  - **Simulador:** lo que fija el convenio para una categoría, zona, antigüedad, afiliación y marcas en un mes. Avisa si falta la escala del mes.
- **UECARA (CCT 660/13) como plantilla de datos:**
  - 16 categorías en 5 grupos y zonas I a V;
  - escala de septiembre de 2026 (acuerdo del 22/09/2026, Anexo I, valores publicados **a verificar con el homologado**);
  - antigüedad $ 13.844 por año desde el mes siguiente;
  - zona III 11,5 %, zona IV del 60 al 80 % según el grupo, zona V 100 %;
  - títulos A, B y C, fallo de caja, asistencia perfecta 10 %;
  - cuota sindical 2 %, solidario 1 % y extraordinario 1,5 %.
  - Queda afuera el adicional por traslado de más de 100 km: se carga como regla si hace falta.
- **Legajo:** convenio, categoría y zona (controlados contra el convenio) y las marcas del colaborador. El texto de convenio y categoría se completa solo. Fuera de convenio rige el básico pactado.
- **Ayuda de RRHH:** sección de convenios colectivos.
- **Pruebas:** `PayrollAgreementsApiTests` cubre:
  - el caso UECARA: auxiliar administrativo de zona II, con antigüedad desde el mes siguiente, título B, solidarios y aviso del tope;
  - afiliado en zona IV con el 80 % del grupo;
  - aumento del 1,8 % redondeado;
  - pegado todo o nada;
  - tope del 2 %;
  - legajo con zona controlada y marcas.

### S3. Liquidación mensual (hecha, PR "Sueldos S3")

- **Liquidación del mes** (una mensual por mes): borrador → calcular → cerrar → contabilizar; reabrir con contra-asiento.
- **Novedades por empleado:**
  - horas extra al 50 % y al 100 % (valor hora = remuneración mensual / divisor del convenio);
  - inasistencias y licencias sin goce (descuentan 1/30 por día y hacen perder la asistencia perfecta), licencias pagas, "pierde asistencia";
  - adelantos, embargos (aviso si pasan el 20 %), otros haberes remunerativos y no remunerativos, otros descuentos.
- **Cálculo** (`PayrollCalculator`):
  - básico y reglas del convenio (o sueldo del legajo), proporcional por ingreso o egreso en el mes (días/30);
  - aportes 11 / 3 / 3 sobre la base con tope máximo y mínimo del mes (el mínimo no se aplica a tiempo parcial);
  - cuota sindical y solidarios recalculados sobre la remuneración final;
  - contribuciones con detracción proporcional, FAL descontado de las contribuciones (desde 11/2026), obra social 6 %, ART (% + fijo) y seguro de vida.
  - Un colaborador con error (sin escala, sin sueldo, neto negativo) se lista y **bloquea el cierre**.
- **Recibo** (art. 140 LCT): original y duplicado, neto en letras, último depósito de aportes (obligatorio para cerrar), huella SHA-256 que avisa si el recibo cambió y registro de la fecha de firma.
- **Asiento AM-SUE-01** por el módulo Sueldos de "Contabilizar". El asiento manual de sueldos de Cierres (C5) queda para cuando liquida el estudio.
- **Se borraron las tablas de la liquidación vieja** (períodos, conceptos, recibos y líneas): en producción, 1 período y 1 recibo de prueba.
- **Quedan para después:**
  - banco de horas y feriados trabajados;
  - conceptos fijos mensuales por empleado (hoy se cargan como novedad cada mes);
  - firma digital del recibo (hoy se registra la fecha de firma en papel);
  - vacaciones (S4).
- **Validación pendiente:** comparar un mes completo con los recibos del estudio.

### S4. Aguinaldo y vacaciones (hecha, PR "Sueldos S4")

- **Aguinaldo** (Ley 23.041), liquidación aparte de tipo "Sac" en junio o diciembre, número 2 del mes:
  - mejor remuneración de los meses cerrados del semestre (o la cargada como novedad si la liquidó el estudio) / 2 × días / 180;
  - días por meses de 30, sin licencias sin goce, tope 180;
  - exige la mensual del mes cerrada; con el aguinaldo cerrado no se reabre la mensual;
  - aportes con tope = 50 % de la base máxima × días / 180 (Decreto 433/94), sin mínimo;
  - contribuciones con el 50 % de la detracción, proporcional (Ley 27.541 art. 22); ART solo alícuota; sin seguro de vida;
  - del convenio, solo descuentos y contribuciones en % del bruto.
- **Vacaciones** (registro en RRHH → Vacaciones, sin importes):
  - días por antigüedad al 31/12 (art. 150) y un día cada 20 si no trabajó la mitad de los hábiles (art. 151; los feriados no se descuentan);
  - tramos de al menos 7 días salvo el saldo, sin superposición; aviso fuera de octubre-abril (Ley 27.802);
  - pago adelantado en el mes de inicio: (sueldo + promedio de variables de los meses cerrados del último semestre) / 25 por día;
  - cada mes descuenta a sueldo / 30 los días que caen en él.
- **Quedan para después:** días adicionales por convenio, notificación impresa de vacaciones, acumulación (art. 164), no remunerativos sobre vacaciones, vacaciones no gozadas y SAC proporcional (S6), previsión contable mensual del aguinaldo.
- **A verificar con el estudio:** tope de aportes del SAC proporcional, aplicación del 50 % de la detracción y qué conceptos del convenio entran al aguinaldo y a las vacaciones.

### S5. Libro de Sueldos Digital y F.931 (hecha, PR "Sueldos S5")

- **Diseño:** "Interfaz Usuario / Liquidación de SyJ - DJ F931" de ARCA (`LSDiseInterfazLiquidacion.pdf`, generado el 2/10/2026), y "Interfaz - Conceptos" (195 posiciones).
- **Archivo de liquidación** por liquidación cerrada:
  - 01 (envío SJ, período, mensual, número, base 30, cantidad de 04), 02 por recibo (legajo, CBU y forma de pago, días para proporcionar el tope, fecha de pago), 03 por renglón del recibo (cantidad, unidad H/D, importe, débito/crédito), 04 por trabajador;
  - el 04 acumula las liquidaciones del período hasta la actual (mensual + aguinaldo en junio y diciembre);
  - bases del 04 según SICOSS: 1, 4 y 5 = base de aportes con tope; 2, 3, 8 y 9 = base de contribuciones; 10 = 2 − detracción; 6 y 7 en cero; importe a detraer;
  - tipo de empleador 1 (art. 19 inc. b Ley 27.541, 18 %) o 4 (inc. a, 20,40 %); ANSI (Latin-1) con CRLF.
- **Conceptos ARCA:** propuesta por concepto (sistema y reglas de convenio), cambiable por empresa, con control de rangos del Anexo I; archivo para el módulo Conceptos. Los códigos de regla quedan en hasta 10 caracteres.
- **Control previo** (como el Libro IVA): CUIT de la empresa, CUIL, actividad, localidad y obra social del legajo, liquidaciones anteriores del período cerradas, conceptos asociados, aguinaldo solo en junio y diciembre.
- **Resumen para la F.931** del período: aportes, contribuciones, obra social, ART, seguro de vida, FAL y detracción.
- **Ajustes al cálculo para que coincida con lo que valida ARCA:**
  - las vacaciones pagadas por adelantado (150000) topean aparte, por sus días;
  - el aguinaldo semestral usa el tope SAC entero (la mitad de la base máxima), sin proporcionar;
  - cada recibo guarda la detracción aplicada.
- **A validar importando un mes real en ARCA:**
  - situación de revista 2 y 3 en "00";
  - tipo de operación "0";
  - remuneración bruta con los no remunerativos;
  - bases con la base mínima cuando la remuneración es menor;
  - FAL fuera de la F.931;
  - conceptos no remunerativos de convenio con aportes de obra social (530000/540000), que hoy no se calculan.
- **Quedan para después:** licencias con situación de revista por días (maternidad, sin goce) y rectificativas (envío RE).

### S6. Liquidación final (hecha, PR "Sueldos S6")

- **Texto oficial** de la Ley 27.802 (argentina.gob.ar): art. 51 (nuevo art. 245), art. 48 (preaviso, art. 231 inc. b), art. 50 (mutuo acuerdo), art. 52 (fallecimiento, art. 248 → 247), art. 25 (certificados del art. 80, 45 días hábiles). No cambió los arts. 92 bis, 232, 233, 156, 247 ni 250. Rige para los egresos desde el 6/3/2026.
- **Liquidación de tipo "Final"**, una por colaborador, en el mes de la fecha de egreso del legajo; la mensual del mes ya no lo incluye.
  Causas: despido sin causa, renuncia, con justa causa, mutuo acuerdo, período de prueba, plazo fijo, jubilación, fallecimiento.
- **Cálculo** (`FinalSettlementCalculator`):
  - días del mes (salvo que la mensual cerrada ya los haya pagado) + SAC proporcional (120003, tope proporcional), con aportes;
  - vacaciones no gozadas: días por antigüedad × días trabajados en el año / 365, menos lo gozado, a sueldo / 25 con promedio de variables, más su SAC;
  - art. 245: mejor remuneración mensual del último año sin SAC, vacaciones ni premios no mensuales (incluye no remunerativos del convenio); variables habituales (6+ meses) promediados (6 meses o año, el mayor); tope del convenio (nuevo dato del convenio; fuera de convenio, el más favorable de la empresa) con piso del 67 %; mínimo un sueldo; la mitad por fallecimiento o plazo fijo de más de un año;
  - preaviso 1 o 2 meses (nada en prueba, 6 meses) con su SAC; integración por los días que faltan del mes (sobre los días del mes calendario) con su SAC;
  - gratificación del mutuo acuerdo;
  - todo lo indemnizatorio no remunerativo (52xxxx en el LSD).
- **Certificado de trabajo** (art. 80) imprimible con las remuneraciones y aportes liquidados en el sistema.
- **A verificar con el estudio:** no remunerativos del convenio en la base del 245, integración sobre días del mes calendario, período de prueba del convenio (si lo extiende), vacaciones pendientes del año anterior (se toman del registro).
- **Fuera de alcance:** indemnizaciones agravadas y casos especiales (embarazo, matrimonio, tutela sindical, incapacidad art. 212, fuerza mayor art. 247 por causa económica), multas y actualización judicial (art. 276).

### S7. Ganancias de cuarta categoría

- Importación del F.572 de SiRADIG (deducciones del empleado).
- Retención acumulativa con las tablas semestrales.
- Liquidación anual y final (F.1357).

## Riesgos y cómo se cubren

- **Normas que cambian todos los meses** (topes, escalas): se guardan con vigencia y la pantalla avisa si falta el valor del mes.
- **Interpretaciones de la Ley 27.802** (fechas de aplicación, cautelar): se confirman con el estudio antes de S6.
- **Archivos de ARCA:** se valida con importaciones reales antes de presentar, como con el Libro IVA.
- **Pasar del estudio al sistema:** se liquida en paralelo al menos un mes y se comparan recibo por recibo.
