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
- **Las tablas** de períodos, conceptos y recibos **se conservan** hasta S3, que decide con conteo previo.
- **Se retiró el "asistente de convenios con IA" (Gemini):** solo lo usaba esa pantalla y proponía escalas sin control. Si en S2 conviene leer escalas desde el PDF del acuerdo, se rehace con revisión humana. El lector de facturas con IA sigue.
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

### S2. Convenios configurables

- **Convenio:**
  - categorías (y zonas, si las tiene), con escalas por vigencia que se cargan o pegan desde la planilla del acuerdo;
  - sumas no remunerativas por categoría y mes.
- **Adicionales por fórmula:**
  - porcentaje del básico, monto fijo, monto por año de antigüedad (con "desde el mes siguiente" si corresponde), por día u hora;
  - divisor de la hora.
- **Aportes y contribuciones sindicales:** cuota de afiliados, solidario de no afiliados (tope legal del 2 %), contribuciones del empleador a fondos del convenio.
- **UECARA cargado como primer convenio**, con su escala vigente.

### S3. Liquidación mensual

- **Novedades del mes por empleado:**
  - horas extra al 50 % y al 100 %, banco de horas;
  - ausencias, licencias (enfermedad, vacaciones, especiales);
  - adelantos, embargos y conceptos fijos.
- **Cálculo:**
  - básico, adicionales del convenio, horas extra, feriados;
  - proporcionales por ingreso o egreso en el mes;
  - aportes con los topes del mes y aportes sindicales;
  - contribuciones (18 %, obra social 6 %, FAL desde noviembre de 2026, detracción, ART, seguro de vida).
- **Recibo legal** (art. 140 LCT) en PDF, con firma digital del empleado (Ley 27.802).
- **Cierre del período y asiento contable automático:** reemplaza al asiento manual de Contabilidad (C5).
- **Validación:** comparar un mes completo con los recibos del estudio.

### S4. Aguinaldo y vacaciones

- **Aguinaldo:** 50 % de la mejor remuneración mensual, normal y habitual del semestre, proporcional, en junio y diciembre.
- **Vacaciones:**
  - días según la antigüedad y el convenio;
  - valor por día = sueldo / 25 (art. 155), con los variables promediados;
  - fraccionamiento y pago adelantado.

### S5. Libro de Sueldos Digital y F.931

- Archivo oficial de ARCA (registros 01 a 04, y 05 si hay eventuales), con el diseño de la guía 2.1.
- Asociación de cada concepto propio con el concepto de ARCA (Anexo II).
- Control previo de lo que ARCA rechazaría, como en el Libro IVA.
- Antes de presentar, **validar importando un mes real en ARCA** y compararlo con el F.931 del estudio.

### S6. Liquidación final

- Renuncia, despido sin causa, fin de contrato y mutuo acuerdo.
- Indemnización art. 245 con la Ley 27.802 (base sin aguinaldo ni vacaciones, tope y piso), preaviso, integración del mes de despido.
- Vacaciones no gozadas y aguinaldo proporcional.
- Certificado de trabajo (art. 80) y constancia de aportes.

### S7. Ganancias de cuarta categoría

- Importación del F.572 de SiRADIG (deducciones del empleado).
- Retención acumulativa con las tablas semestrales.
- Liquidación anual y final (F.1357).

## Riesgos y cómo se cubren

- **Normas que cambian todos los meses** (topes, escalas): se guardan con vigencia y la pantalla avisa si falta el valor del mes.
- **Interpretaciones de la Ley 27.802** (fechas de aplicación, cautelar): se confirman con el estudio antes de S6.
- **Archivos de ARCA:** se valida con importaciones reales antes de presentar, como con el Libro IVA.
- **Pasar del estudio al sistema:** se liquida en paralelo al menos un mes y se comparan recibo por recibo.
