# Contexto para revisión del sistema — Metrología Legal e ISO/IEC 17025

**Fecha de compilación:** 24/08/2026  
**Objetivo:** Documento de contexto para revisar en Codex/ChatGPT el módulo de **Metrología Legal** y el módulo de **Calidad** del sistema de gestión del laboratorio.

> **Importante:** este documento es una guía técnica y de implementación. Antes de una auditoría o de emitir documentación regulatoria, verificar siempre la versión vigente de cada norma en su fuente oficial (Argentina.gob.ar / Boletín Oficial / OAA / OIML / IRAM).

---

## 1. Contexto del proyecto

Se está implementando dentro del sistema de gestión un:

1. **Módulo de Metrología Legal**
2. **Módulo de Calidad**
3. Integración entre:
   - ensayos,
   - normativa aplicable,
   - procedimientos internos,
   - formularios y registros,
   - patrones y equipos,
   - certificados de calibración,
   - competencia del personal,
   - incertidumbre,
   - informes de ensayo,
   - trazabilidad documental,
   - revisiones y vigencias.

El laboratorio se encuentra trabajando en la **acreditación ISO/IEC 17025 como laboratorio de ensayos**, con alcance orientado a **instrumentos de pesaje de diferentes capacidades**, incluyendo equipos de alta capacidad y pesaje vehicular.

El objetivo de la implementación es que durante una auditoría pueda reconstruirse, desde un ensayo, toda la cadena:

**Ensayo → Norma aplicable → Procedimiento → Método → Patrón/equipo → Certificado de calibración → Técnico habilitado → Competencia → Cálculos → Incertidumbre → Registro → Informe de ensayo.**

---

# 2. Marco legal general de Metrología Legal Argentina

## 2.1 Ley 19.511 — Sistema Métrico Legal Argentino (SIMELA)

**Tipo:** Ley  
**Función:** Marco legal general de la Metrología Legal argentina.

Aspectos principales a considerar en el sistema:

- Sistema Métrico Legal Argentino.
- Patrones.
- Instrumentos de medición.
- Instrumentos reglamentados.
- Aprobación de modelo.
- Verificación primitiva.
- Verificación periódica.
- Vigilancia de uso.
- Servicio Nacional de Aplicación.

**Fuente oficial — texto actualizado:**  
https://www.argentina.gob.ar/normativa/nacional/48851/actualizacion

---

## 2.2 Decreto 960/2017

**Tipo:** Decreto  
**Función:** Organización del Servicio Nacional de Aplicación de la Ley 19.511.

Entre otras cuestiones:

- reorganiza las funciones relacionadas con Metrología Legal;
- contempla la incorporación de organismos públicos y privados;
- asigna funciones regulatorias;
- contempla laboratorios de ensayo y organismos de certificación dentro del esquema del Servicio Nacional de Aplicación.

**Fuente oficial:**  
https://www.argentina.gob.ar/normativa/nacional/decreto-960-2017-291620/texto

---

# 3. Procedimiento general de control metrológico

## 3.1 Resolución 611/2019 — texto actualizado

**Nombre:** Normas y procedimientos sobre operaciones de control metrológico.

Es una norma central para el sistema porque regula el marco procedimental de:

- Aprobación de Modelo.
- Verificación Primitiva.
- Verificación Periódica / Subsecuente.
- Vigilancia.
- Laboratorios.
- Organismos integrantes del Servicio Nacional de Aplicación.
- Certificados y documentación.

La norma fue modificada posteriormente y **debe utilizarse el texto actualizado**, no solamente el PDF original de 2019.

**Fuente oficial — texto actualizado:**  
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-611-2019-329234/actualizacion

---

## 3.2 Resolución 276/2024

Modifica el esquema de la Resolución 611/2019 e incorpora cambios relevantes en:

- Servicio Nacional de Aplicación.
- Organismo Argentino de Acreditación.
- Organismos de certificación.
- Certificados.
- Aprobación de Modelo.
- Verificación Primitiva.
- Verificación Periódica.

**Fuente oficial:**  
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-276-2024-404104/texto

---

## 3.3 Resolución 67/2025

Modifica nuevamente la Resolución 611/2019 y sustituye sus **Anexos I, II y III**.

Por este motivo, en el sistema no conviene almacenar la Resolución 611/2019 como documento estático sin relaciones.

Debe modelarse:

- norma base;
- modificatorias;
- versión consolidada / texto actualizado;
- fecha de vigencia;
- documentos reemplazados.

**Referencia recomendada:** utilizar el texto actualizado de la Resolución 611/2019.

---

# 4. Instrumentos de pesar de funcionamiento no automático — IPFNA

## 4.1 Resolución 25/2025

**Reglamento Técnico y Metrológico vigente para Instrumentos de Pesar de Funcionamiento No Automático.**

Aplicación general:

- balanzas comerciales;
- balanzas industriales;
- plataformas;
- básculas;
- básculas para camiones;
- instrumentos de laboratorio;
- instrumentos de diferentes clases de exactitud;
- instrumentos de baja, media y alta capacidad, según corresponda.

### Verificación periódica

La Resolución 25/2025 establece una periodicidad de **24 meses** para los instrumentos alcanzados por ella.

### Referencias técnicas principales

La resolución utiliza como referencia, entre otras:

- **OIML R 76**
- **OIML R 60**

### Derogación y transición de la Resolución 2307/1980

La Resolución 25/2025 deroga la Resolución 2307/1980, pero establece un régimen transitorio.

De acuerdo con el artículo 6:

- **Usuarios:** autorizados por 10 años.
- **Fabricantes, importadores, representantes y reparadores:** autorizados por 5 años.

Por lo tanto, la Resolución 2307/1980 **no debe eliminarse del sistema**.

Debe clasificarse como:

**DEROGADA — APLICABLE EN RÉGIMEN TRANSITORIO**

**Fuente oficial:**  
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-25-2025-410061/texto

---

# 5. Resolución 2307/1980

Antiguo reglamento general de instrumentos de pesar.

Aunque fue derogada por la Resolución 25/2025, continúa siendo relevante durante el régimen transitorio.

### Recomendación para el sistema

Crear dos caminos normativos:

### IPFNA — régimen vigente
- Resolución 25/2025

### IPFNA — régimen anterior/transitorio
- Resolución 2307/1980

Cada instrumento debe poder quedar vinculado a la normativa bajo la cual fue:

- aprobado;
- fabricado;
- comercializado;
- verificado;
- ensayado.

No debería seleccionarse automáticamente la norma únicamente por la fecha del ensayo.

---

# 6. Pesaje estático de vehículos por ejes o tándem de ejes

Este grupo debe tratarse como un alcance separado del IPFNA convencional.

## 6.1 Resoluciones Conjuntas 86/2000 y 279/2000

Crearon el reglamento específico para instrumentos destinados al pesaje de vehículos por:

- eje;
- tándem de ejes.

La Resolución 119/2001 sustituyó el Anexo I.

---

## 6.2 Resolución 119/2001

**Norma específica:** Instrumentos para el pesaje de vehículos por ejes o tándem de ejes.

**Fuente oficial:**  
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-119-2001-68994/texto

### Conceptos importantes

La norma contempla:

- equipos fijos;
- equipos portátiles;
- plataformas para ruedas;
- plataformas para eje completo;
- ensayo individual de instrumentos portátiles;
- uso de instrumentos de a pares;
- condiciones de instalación;
- nivelación;
- caminos de aproximación;
- ensayos específicos.

### Identificaciones

Para plataformas destinadas a trabajar de a pares:

**“USO EXCLUSIVO PARA PESAR POR EJES PARA SER USADO DE A PAR”**

Para plataforma que recibe todas las ruedas del eje:

**“USO EXCLUSIVO PARA PESAR POR EJES”**

### Instalación

Debe controlarse especialmente:

- mismo plano de pesaje;
- horizontalidad;
- nivelación;
- camino de entrada y salida;
- transferencia de carga entre ejes.

### Estructura normativa sugerida en el sistema

**Pesaje estático por ejes**

- Resolución Conjunta 86/2000
- Resolución Conjunta 279/2000
- Resolución 119/2001 — modificatoria / anexo técnico aplicable

---

## 6.3 Resolución 151/2000

Debe conservarse como documentación histórica/transitoria vinculada al régimen de instrumentos por ejes que ya se encontraban en uso al momento de entrada en vigencia del reglamento.

No debería utilizarse como norma principal para una instalación nueva sin verificar previamente su aplicabilidad.

---

# 7. Pesaje automático de vehículos en movimiento — SPEM / WIM

## 7.1 Resolución 492/2022

**Nombre:** Reglamento de Instrumentos Automáticos para Pesaje en Movimiento de Vehículos de Carretera.

Aplica a sistemas que determinan, con el vehículo en movimiento:

- masa total del vehículo;
- carga de ejes;
- carga de grupos de ejes;
- otros parámetros previstos por el reglamento.

### Verificación periódica

Periodicidad indicada por la resolución:

**12 meses**

### Referencia técnica principal

**OIML R 134**

### Información y software

La norma incluye requisitos importantes sobre:

- almacenamiento de datos;
- identificación del vehículo;
- fecha y hora;
- masa total;
- ejes;
- grupos de ejes;
- velocidad;
- registros;
- software legalmente relevante;
- identificación de versión;
- integridad;
- parámetros metrológicos;
- protección contra modificaciones;
- trazabilidad de accesos.

Esto puede impactar directamente en el diseño del software asociado a sistemas SPEM.

**Fuente oficial — texto actualizado:**  
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-492-2022-366696/actualizacion

---

# 8. Pesas y patrones de masa

## Resolución 456/1983

**Objeto:** normas de especificación y clasificación de medidas de masa denominadas pesas.

Debe incorporarse al sistema aunque el alcance principal sean balanzas, porque los patrones de masa participan directamente en:

- trazabilidad;
- métodos de ensayo;
- verificación;
- control de equipos;
- incertidumbre.

**Fuente oficial:**  
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-456-1983-409376

---

# 9. Página oficial de Reglamentos Metrológicos

La página oficial de Argentina.gob.ar lista actualmente, dentro del área de masa/pesaje, entre otros:

- Resolución 25/2025 — IPFNA.
- Resolución 119/2001 — pesaje por ejes o tándem.
- Resolución 492/2022 — pesaje en movimiento.
- Resolución 456/1983 — medidas de masa / pesas.

**Fuente:**  
https://www.argentina.gob.ar/economia/industria-y-comercio/metrologia-legal/reglamentos-metrologicos

Esta página debería registrarse en el módulo como una **fuente de vigilancia normativa**, no como norma.

---

# 10. Referencias OIML recomendadas

Crear en el sistema una categoría separada:

**“Normas técnicas internacionales / documentos de referencia”**

No deben confundirse con legislación argentina.

## OIML R 76

Instrumentos de pesar de funcionamiento no automático.

Referencia oficial OIML:  
https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf

---

## OIML R 60

Metrological regulation for load cells.

La Resolución 25/2025 utiliza OIML R60 como referencia técnica.

Portal OIML:  
https://www.oiml.org/

---

## OIML R 111

Pesas de las clases:

- E1
- E2
- F1
- F2
- M1
- M2
- M3

Portal OIML:  
https://www.oiml.org/

---

## OIML R 134

Automatic instruments for weighing road vehicles in motion and measuring axle loads.

Relacionada directamente con SPEM / Resolución 492/2022.

Portal OIML:  
https://www.oiml.org/

---

## OIML D 11

Requisitos generales aplicables a instrumentos de medición electrónicos.

Puede ser relevante para:

- electrónica;
- software;
- perturbaciones;
- condiciones ambientales;
- ensayos de influencia.

Portal OIML:  
https://www.oiml.org/

---

# 11. ISO/IEC 17025 y documentación OAA

Crear un repositorio documental independiente de la normativa de Metrología Legal:

**CALIDAD / ACREDITACIÓN**

## Norma base

**IRAM-ISO/IEC 17025:2017**

No almacenar copias sin controlar derechos de licencia.

Registrar:

- código;
- edición;
- copia controlada;
- ubicación/licencia;
- responsable;
- fecha de revisión;
- requisitos relacionados.

---

## Documentos OAA

Fuente oficial para versiones vigentes:

https://www.oaa.org.ar/publico/acreditacion/documentos

### Documentos a controlar

Como mínimo:

- **CG-LE-01** — Criterios generales para la evaluación y acreditación de laboratorios de ensayo/calibración.
- **CE-LE-08** — Política y criterios sobre trazabilidad de las mediciones.
- **PG-SG-11** — Procedimiento general para la evaluación y acreditación de entidades.
- **I06-(PG-SG-11)** — Muestreo del alcance y del personal.
- documentos de Ensayos de Aptitud / Comparaciones Interlaboratorio aplicables;
- listas de verificación vigentes para ISO/IEC 17025;
- guías para actividades realizadas fuera de las instalaciones permanentes, cuando correspondan.

### Versiones verificadas al 24/08/2026

Según el catálogo público OAA:

- **CG-LE-01:** versión 18.
- **CE-LE-08:** versión 5.
- **I06-(PG-SG-11):** versión 12.

**IMPORTANTE:** siempre consultar la versión vigente en OAA antes de una auditoría.

---

# 12. Modelo de datos recomendado — Maestro de Normativa

Cada documento normativo debería contener al menos:

```text
id
codigo
titulo
tipo_documento
organismo_emisor

fecha_emision
fecha_publicacion
fecha_vigencia_desde
fecha_vigencia_hasta

estado
  - vigente
  - transitorio
  - derogado
  - reemplazado
  - histórico

version_revision

alcance
magnitud
tipo_instrumento
clase_exactitud
capacidad_minima
capacidad_maxima

operaciones_aplicables
  - aprobación de modelo
  - aprobación de modelo con efecto limitado
  - verificación primitiva
  - verificación periódica
  - vigilancia
  - ensayo

url_oficial
archivo_pdf
hash_archivo

responsable_revision
fecha_ultima_revision
fecha_proxima_revision

observaciones
```

---

# 13. Relaciones entre normas

No modelar las normas como archivos independientes.

Agregar relaciones:

```text
NORMA
 ├── modifica
 ├── es modificada por
 ├── complementa
 ├── es complementada por
 ├── deroga
 ├── es derogada por
 ├── sustituye
 ├── reglamenta
 └── referencia
```

Ejemplo:

```text
Resolución 25/2025
    └── DEROGA → Resolución 2307/1980
        └── pero mantiene régimen transitorio
```

Ejemplo:

```text
RC 86/2000 + RC 279/2000
    └── MODIFICADA POR → Resolución 119/2001
        └── sustituye Anexo I
```

Ejemplo:

```text
Resolución 611/2019
    ├── MODIFICADA POR → Resolución 276/2024
    └── MODIFICADA POR → Resolución 67/2025
```

---

# 14. Matriz Norma → Procedimiento → Registro

Crear una relación explícita entre normativa externa y documentación interna.

Ejemplo:

| Reglamento | Procedimiento interno | Registro | Hoja de cálculo |
|---|---|---|---|
| Res. 25/2025 | PE-ML-001 IPFNA | FO-ML-001 | HC-IPFNA |
| Res. 2307/1980 | PE-ML-002 IPFNA legado | FO-ML-002 | HC-2307 |
| Res. 119/2001 | PE-ML-003 Pesaje por ejes | FO-ML-003 | HC-EJES |
| Res. 492/2022 | PE-ML-004 SPEM | FO-ML-004 | HC-SPEM |
| Res. 456/1983 | PE-ML-005 Pesas | FO-ML-005 | HC-MASA |

Los códigos son ejemplos y deberán adaptarse al sistema real.

---

# 15. Diseño recomendado del alcance técnico

Evitar guardar el alcance únicamente como:

**“Balanzas de todas las capacidades”**

Internamente conviene poder definir:

```text
Magnitud
Tipo de instrumento
Reglamento
Procedimiento
Operación
Rango
Capacidad máxima
Clase de exactitud
Ubicación
Método
CMC / incertidumbre cuando corresponda
Personal autorizado
```

Ejemplo conceptual:

```text
IPFNA
Reglamento: Res. 25/2025
Operaciones: AM / VP / VPE / Ensayo
Rango: según alcance aprobado
```

```text
IPFNA — régimen transitorio
Reglamento: Res. 2307/1980
Operaciones: según alcance aprobado
```

```text
PESAJE ESTÁTICO POR EJES
Reglamento: RC 86/2000 + RC 279/2000 + Res. 119/2001
Operaciones: según alcance aprobado
```

```text
SPEM
Reglamento: Res. 492/2022
Operaciones: según alcance aprobado
```

---

# 16. Equipos y patrones

Cada ensayo debe poder resolver automáticamente:

```text
Ensayo
  ↓
Equipo utilizado
  ↓
Patrón
  ↓
Certificado de calibración
  ↓
Laboratorio que calibró
  ↓
Acreditación
  ↓
Vigencia
  ↓
Trazabilidad
```

Campos recomendados:

- código interno;
- descripción;
- fabricante;
- modelo;
- número de serie;
- rango;
- resolución;
- clase;
- ubicación;
- estado;
- fecha última calibración;
- próxima calibración;
- certificado;
- proveedor de calibración;
- incertidumbre;
- criterio de aceptación;
- historial;
- verificaciones intermedias;
- mantenimiento;
- fuera de servicio;
- restricciones de uso.

---

# 17. Personal y competencia

Cada método debe indicar qué personas están autorizadas.

Registrar:

```text
Persona
Competencia
Método
Fecha autorización
Evaluador
Evidencia
Capacitación
Supervisión
Ensayos testigo
Reevaluación
Restricciones
Estado
```

El sistema debe impedir o advertir que un ensayo sea firmado por una persona que no tenga competencia vigente para ese alcance.

---

# 18. Ensayos fuera de las instalaciones

Muy relevante para:

- básculas de camiones;
- balanzas de alta capacidad;
- pesaje por ejes;
- SPEM;
- instalaciones aeroportuarias;
- instrumentos que no pueden trasladarse al laboratorio.

El sistema debería registrar:

- ubicación del ensayo;
- condiciones ambientales;
- condiciones de instalación;
- nivelación;
- disponibilidad de patrones;
- transporte de patrones;
- condiciones previas;
- fotografías;
- croquis;
- evidencias de instalación;
- condiciones del camino/plataforma cuando corresponda;
- desviaciones autorizadas;
- responsable in situ.

---

# 19. Incertidumbre

El módulo debería permitir una relación:

```text
Método
  ↓
Modelo matemático
  ↓
Fuentes de incertidumbre
  ↓
Distribución
  ↓
Coeficiente de sensibilidad
  ↓
Incertidumbre estándar
  ↓
Combinación
  ↓
Grados de libertad
  ↓
Factor k
  ↓
Incertidumbre expandida
```

Idealmente la hoja de cálculo de incertidumbre debe:

- poseer versión;
- estar bloqueada;
- tener control de cambios;
- vincularse al procedimiento;
- conservar resultados utilizados en cada informe.

---

# 20. Control documental

Cada documento interno debe tener:

```text
Código
Título
Tipo
Versión
Fecha de emisión
Fecha de vigencia
Autor
Revisor
Aprobador
Estado
Historial de cambios
Archivo
Hash
Relaciones
```

Estados posibles:

- borrador;
- en revisión;
- aprobado;
- vigente;
- obsoleto;
- archivado.

Nunca debe borrarse una versión utilizada en un ensayo ya emitido.

---

# 21. Trazabilidad de cada informe de ensayo

Desde un informe debería poder reconstruirse:

```text
INFORME
  │
  ├── cliente
  ├── instrumento
  ├── identificación
  ├── ubicación
  ├── fecha
  ├── reglamento vigente/aplicable
  ├── procedimiento y versión
  ├── técnicos
  ├── equipos utilizados
  ├── patrones
  ├── certificados de calibración
  ├── condiciones ambientales
  ├── datos crudos
  ├── cálculos
  ├── incertidumbre
  ├── criterios de aceptación
  ├── resultado
  ├── observaciones
  ├── evidencias / fotos
  ├── revisión técnica
  └── aprobación / firma
```

---

# 22. Auditoría — recorrido ideal dentro del sistema

El objetivo del sistema debería ser poder responder rápidamente a preguntas típicas del evaluador.

## Ejemplo 1

**Auditor:** “Muéstreme qué norma aplicaron a este ensayo.”

Sistema:

```text
Informe IE-2026-0012
→ Reglamento Res. 119/2001
→ versión/vigencia
→ PDF controlado
→ fuente oficial
```

## Ejemplo 2

**Auditor:** “¿Cómo sabe que el técnico estaba autorizado?”

```text
Informe
→ Técnico
→ Matriz de competencia
→ Método PE-ML-003
→ Autorización vigente
→ Evidencias
```

## Ejemplo 3

**Auditor:** “¿Cómo demuestra la trazabilidad de esta pesa?”

```text
Informe
→ patrón P-005
→ certificado
→ laboratorio acreditado
→ alcance
→ fecha
→ incertidumbre
→ vigencia
```

## Ejemplo 4

**Auditor:** “¿Qué procedimiento estaba vigente el día del ensayo?”

El sistema debe presentar la **versión histórica exacta utilizada**, no simplemente la versión vigente actualmente.

---

# 23. Funciones recomendadas para el módulo de Calidad

## Gestión documental
- documentos;
- versiones;
- aprobaciones;
- distribución;
- obsoletos;
- revisiones periódicas.

## No conformidades
- origen;
- descripción;
- análisis de causa;
- corrección;
- acción correctiva;
- responsable;
- plazo;
- evidencia;
- verificación de eficacia.

## Riesgos y oportunidades
- proceso;
- riesgo;
- causa;
- impacto;
- probabilidad;
- nivel;
- controles;
- tratamiento;
- revisión.

## Reclamos
- cliente;
- causa;
- investigación;
- imparcialidad;
- respuesta;
- cierre.

## Trabajo no conforme
- ensayo;
- impacto;
- decisión;
- cliente afectado;
- retiro/reemisión de informe;
- acciones.

## Auditorías internas
- programa;
- auditor;
- requisito;
- evidencia;
- hallazgos;
- NC;
- acciones.

## Revisión por la dirección
- entradas;
- indicadores;
- reclamos;
- auditorías;
- desempeño;
- recursos;
- riesgos;
- acciones;
- decisiones.

## Ensayos de aptitud
- proveedor;
- programa;
- magnitud;
- resultado;
- z-score / criterio;
- evaluación;
- acciones;
- historial.

## Proveedores
- categoría;
- evaluación;
- homologación;
- reevaluación;
- desempeño.

---

# 24. Vigilancia normativa

Crear una función específica para evitar normas desactualizadas.

Campos:

```text
Norma
Fuente oficial
Fecha última consulta
Resultado
Cambios detectados
Nueva versión
Responsable
Acción requerida
```

Fuentes mínimas:

### Argentina — Metrología Legal
https://www.argentina.gob.ar/economia/industria-y-comercio/metrologia-legal/reglamentos-metrologicos

### Normativa Argentina / InfoLEG
https://www.argentina.gob.ar/normativa

### OAA
https://www.oaa.org.ar/publico/acreditacion/documentos

### OIML
https://www.oiml.org/

---

# 25. Lista inicial de documentos a cargar al sistema

## Marco legal
- [ ] Ley 19.511 — texto actualizado.
- [ ] Decreto 960/2017.

## Procedimiento general
- [ ] Resolución 611/2019 — texto actualizado.
- [ ] Resolución 276/2024.
- [ ] Resolución 67/2025.

## IPFNA
- [ ] Resolución 25/2025.
- [ ] Resolución 2307/1980 — régimen transitorio.

## Pesaje por ejes
- [ ] Resolución Conjunta 86/2000.
- [ ] Resolución Conjunta 279/2000.
- [ ] Resolución 119/2001.
- [ ] Resolución 151/2000 — histórica/transitoria.

## Pesaje en movimiento
- [ ] Resolución 492/2022.

## Patrones de masa
- [ ] Resolución 456/1983.

## OIML
- [ ] OIML R 76.
- [ ] OIML R 60.
- [ ] OIML R 111.
- [ ] OIML R 134.
- [ ] OIML D 11.

## Calidad / acreditación
- [ ] IRAM-ISO/IEC 17025:2017.
- [ ] CG-LE-01 OAA.
- [ ] CE-LE-08 OAA.
- [ ] PG-SG-11 OAA.
- [ ] I06-(PG-SG-11).
- [ ] documentación OAA de ensayos de aptitud aplicable.
- [ ] listas de verificación vigentes.
- [ ] guías OAA aplicables a actividades fuera de instalaciones permanentes.

---

# 26. Puntos que debemos revisar juntos en Codex

Cuando este documento se cargue junto con el código del sistema, revisar:

## Arquitectura
- entidades;
- relaciones;
- normalización;
- historial;
- permisos;
- multitenancy si corresponde.

## Metrología Legal
- catálogo de normas;
- vigencias;
- normas transitorias;
- relación norma ↔ método;
- relación instrumento ↔ aprobación de modelo;
- verificaciones;
- informes.

## Calidad
- ISO/IEC 17025;
- control documental;
- competencia;
- equipos;
- trazabilidad;
- incertidumbre;
- NC;
- acciones correctivas;
- auditorías;
- revisión por dirección;
- riesgos;
- reclamos;
- trabajos no conformes;
- ensayos de aptitud.

## Seguridad e integridad
- auditoría de cambios;
- usuario;
- fecha/hora;
- before/after;
- firma;
- bloqueo de registros;
- control de versiones;
- permisos.

## Informes
- reproducibilidad;
- datos crudos;
- cálculos;
- evidencia;
- versión del procedimiento;
- versión normativa;
- firma/autorización.

---

# 27. Regla de diseño central

**Nunca modificar retrospectivamente la información de un ensayo cerrado.**

Si cambia:

- una norma;
- un procedimiento;
- una incertidumbre;
- un certificado;
- una autorización;
- un formulario;

el ensayo histórico debe conservar la **versión exacta que estaba vinculada en el momento de su ejecución/emisión**.

Esto es esencial para trazabilidad y auditoría.

---

# 28. Objetivo de la próxima revisión

Al cargar este documento en Codex junto con el repositorio del sistema:

1. identificar los módulos actuales;
2. revisar el modelo de datos existente;
3. comparar lo implementado con esta matriz;
4. detectar faltantes;
5. revisar flujos de auditoría;
6. proponer cambios mínimos antes que reescrituras innecesarias;
7. validar relaciones entre Metrología Legal y Calidad;
8. revisar permisos, trazabilidad y versionado;
9. simular una auditoría ISO/IEC 17025;
10. generar una lista priorizada de mejoras.

---

# 29. Fuentes oficiales principales

### Argentina.gob.ar — Reglamentos Metrológicos
https://www.argentina.gob.ar/economia/industria-y-comercio/metrologia-legal/reglamentos-metrologicos

### Ley 19.511 — texto actualizado
https://www.argentina.gob.ar/normativa/nacional/48851/actualizacion

### Decreto 960/2017
https://www.argentina.gob.ar/normativa/nacional/decreto-960-2017-291620/texto

### Resolución 611/2019 — texto actualizado
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-611-2019-329234/actualizacion

### Resolución 276/2024
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-276-2024-404104/texto

### Resolución 25/2025
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-25-2025-410061/texto

### Resolución 119/2001 — pesaje por ejes
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-119-2001-68994/texto

### Resolución 492/2022 — SPEM
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-492-2022-366696/actualizacion

### Resolución 456/1983 — pesas
https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-456-1983-409376

### OAA — documentación vigente
https://www.oaa.org.ar/publico/acreditacion/documentos

### OIML
https://www.oiml.org/

---

## Nota final para la revisión

Este documento debe utilizarse como **contexto inicial**, no como sustituto de las normas controladas.

La revisión del software debería orientarse a que el propio sistema sea capaz de demostrar:

**qué se hizo, quién lo hizo, con qué método, con qué patrón, bajo qué norma, con qué versión, con qué incertidumbre, qué resultado produjo y quién lo revisó/aprobó.**

Ese es el criterio central para que el módulo sea útil tanto operativamente como frente a una auditoría.
