# Módulo de Calidad (SGC ISO/IEC 17025) — Análisis de estructura

**Fecha:** 07/09/2026  
**Fuente:** carpeta Drive "INMELA - BFS" preparada por la consultoría ELEVAR (Laura Delissi) + documentos técnicos de Germán, relevada completa el 07/09/2026.  
**Referencia interna:** `docs/Contexto_revision_Metrologia_Legal_ISO17025.md`, módulo `src/Modules/Metrology`.

> Regla de oro: el auditor del OAA va a revisar **el sistema**, no el Drive. Todo lo que hoy vive en carpetas del Drive tiene que poder recorrerse desde el módulo con **los mismos códigos y nombres** (MC01, PG01, PG14-R1, IT 01 R2, etc.). El módulo no inventa nomenclatura: adopta la de PG01.

---

## 1. Qué hay hoy en el Drive de la consultoría

### 1.1 Árbol de carpetas (tal cual está)

```
INMELA - BFS/
├── Listado de códigos utilizados.xlsx          ← índice maestro PG/IT y registros asociados
├── Planilla_Seguimiento_ISO_17025 INMELA.xlsx  ← matriz cláusula 17025 → estado
├── MC (Manual de calidad)/
│   ├── MC01 v1 Manual de calidad.docx
│   ├── MC01 R1 Compromiso de confidencialidad e imparcialidad interno.docx
│   ├── MC01 R2 Compromiso de confidencialidad e imparcialidad externo.docx
│   └── MC01-R03 v1 Seguimiento de objetivos e indicadores.xlsx
├── PG (Procedimientos)/
│   ├── PG 01 - Gestión de documentos/        (PG01 + R01 Lista de documentos + R02 Lista de documentos externos)
│   ├── PG 02 - Control de registros/         (PG02, sin registros propios)
│   ├── PG 03 - Gestión de quejas/            (PG03 + R01 Seguimiento de quejas)
│   ├── PG 04 - Auditorias internas/          (PG04 + R01 Programa, R02 Plan, R03 Informe, R04 Lista de verificación 17025)
│   ├── PG 05 - Compras/                      (R01 Evaluación inicial proveedores, R02 Listado habilitados, R03 Evaluación desempeño; el PG05 aún no está subido)
│   ├── PG 06 - Gestión de personal/          (PG06 + R01 Programa capacitaciones, R02 Entrenamiento y autorización, R03 Seguimiento competencias, R04 Asignación de funciones y reemplazos)
│   ├── PG 07 - No conformidades.../          (PG07 + R1 Registro y seguimiento de NC, R y OP)
│   ├── PG 08 - Revisión por la dirección/    (PG08 + R01 Informe de revisión por la dirección)
│   ├── PG 09 - Informes de Ensayo/           (PG09; R1 Informe de ensayo, R2 Modificación, R3 Encuesta — plantillas aún no subidas)
│   ├── PG 10 - Evaluación de la Incertidumbre/ (PG10, sin registros)
│   ├── PG 11 - Validación del método/        (PG11 + R1 Informe de validación del método)
│   ├── PG 12 - Ensayos para la Verificación de IPFNA/ (PG12; registros = IT 01..04 R1/R2/R3)
│   ├── PG 13 - Manipulación del ítem/        (PG13; registros = IT 01..04 R1/R2/R3)
│   ├── PG 14 - Equipamiento/                 (PG14 + R1 Hoja de vida, R2 Etiqueta, R3 Programa calibraciones, R4 Listado equipos, R5 Verificación intermedia, R6 Mantenimiento preventivo)
│   ├── PG 15 - Aseguramiento de la validez/  (PG15, sin registros; usa PG14-R3/R5 e IT R1/R2)
│   ├── PG 16 - Instalaciones y cond. ambientales/ (PG16; registros = IT 01..04 R1/R2/R3)
│   └── PG 17 - Trazabilidad metrológica/     (PG17, sin registros; usa PG14-R3)
├── IT (Instructivos)/
│   └── IT 07 - Validación de planillas de cálculos/ (IT-07 v1)
│       (IT 01..04 existen en el "Listado de códigos" pero NO están en el Drive: son los instructivos de ensayo por tipo de balanza)
├── Certificados/                              ← certificados de calibración de pesas (TM-01..04, PESERO)
├── Normas de referencia/                      ← ISO 17025, Ley 19511, Dec. 960/17, Res. 2307/80, 25/2025, 456/83, 276/24, 67/25, 56/26, OIML R76, nota SSDCYLC
├── Capacitaciones ELEVAR/                     ← presentación R4/R5
└── Logos/
```

### 1.2 Reglas de codificación (PG01 §5.2 — son obligatorias para el módulo)

| Tipo | Prefijo | Aprueba | Ejemplo |
|---|---|---|---|
| Manual de calidad | `MC` | Dirección | `MC01` |
| Procedimiento general | `PG` | Dirección / Calidad | `PG14` |
| Instructivo de trabajo | `IT` | Dirección | `IT 01` |
| Registro | `R` (siempre colgado de un padre) | según padre | `PG14-R1`, `IT 01 R2`, `MC01-R03` |

- Numeración correlativa creciente por tipo (si hay 17 PG, el próximo es PG18).
- Todo documento tiene **versión** que arranca en 1.
- Estructura fija de PG/IT: Objetivo y alcance → Definiciones → Referencias → Responsabilidades → Desarrollo → Registros → Anexos → Historial de cambios.
- Pie de firma: **Elaboró / Revisó / Aprobó** con fecha; quien revisa debe ser distinto de quien elabora.
- Encabezado: logo + nombre + "ESTE DOCUMENTO SE IMPRIME COMO COPIA NO CONTROLADA" + código + versión.
- Los documentos **externos** (normas, resoluciones) **no se codifican internamente**, conservan su nombre original y van al `PG01-R02 Lista de documentos externos`.
- Revisión periódica: internos cada **2 años**, externos cada **1 año**.
- Retención: obsoletos y registros técnicos **≥ 8 años**. Nunca se borra: la baja se marca (tachado/rojo) y se justifica en el historial.

Nota de consistencia: la consultoría usa `PG14-R1`, `PG14 R1`, `PG14-R01`, `PG 14 - R1` indistintamente. El módulo debe **normalizar internamente** (`PG14-R01`) pero **mostrar el código tal como figura en el documento aprobado** (campo `displayCode`). Así el auditor ve exactamente lo que dice el papel.

### 1.3 Inventario de registros y quién los "posee"

Esto es lo que define **qué pantallas** necesita el módulo. Hay tres clases de registros:

**(A) Registros que ya viven (o deben vivir) en Metrología Legal** — el módulo de Calidad los referencia, no los duplica:

| Código SGC | Nombre | Dato real en el sistema |
|---|---|---|
| `PG14-R4` | Listado de equipos | Pesas patrón (`metrology.standard_weights`) + equipos auxiliares (termómetro, camiones, elevadores — hoy no existen) |
| `PG14-R1` | Hoja de vida del equipo | Historial por equipo: calibraciones, verificaciones, mantenimientos, bajas |
| `PG14-R3` | Programa de calibraciones | Derivable de `CalibrationDate`/`ExpirationDate` de las pesas + certificados |
| `PG14-R5` | Verificación intermedia | Verificación semestral con pesa de 1000 kg — hoy no existe |
| `PG14-R6` | Programa de mantenimiento preventivo | Hoy no existe |
| `PG14-R2` | Etiqueta de equipo calibrado | Imprimible desde la pesa |
| `IT 01..04 R1` | Identificación del instrumento | `metrology.equipments` (balanza del cliente) |
| `IT 01..04 R2` | Ensayos | `metrology.calibration_reports` (JSON de repetibilidad, excentricidad, linealidad, pesas usadas) |
| `IT 01..04 R3` | Precintos | `CalibrationReport.SealsPlaced` |
| `PG09 R1` | Informe de ensayo | `CalibrationReport` emitido (impresión actual) |
| `PG09 R2` | Modificación al informe de ensayo | Hoy no existe (hay que agregar versionado/enmienda del informe) |
| `PG09 R3` | Encuesta de satisfacción | Hoy no existe |

**(B) Registros de gestión del SGC** — son propios del módulo de Calidad (hoy son planillas Excel/Word en el Drive):

| Código | Nombre | Tipo de pantalla |
|---|---|---|
| `PG01-R01` | Lista de documentos internos | **Generada automáticamente** desde el árbol documental |
| `PG01-R02` | Lista de documentos externos | Generada desde el catálogo de normas |
| `PG03-R01` | Seguimiento de quejas | Workflow: recepción → registro (1 día) → validación (2 días) → investigación (5 días) → comunicación/cierre (2 días); puede derivar en NC |
| `PG04-R01..R04` | Programa / Plan / Informe de auditoría / Lista de verificación 17025 | Programa anual + auditorías con hallazgos → NC |
| `PG05-R01..R03` | Evaluación inicial / Listado habilitados / Evaluación desempeño de proveedores | Ligar con proveedores del Directorio/Compras |
| `PG06-R01..R04` | Programa de capacitaciones / Entrenamiento y autorización / Seguimiento de competencias / Asignación de funciones y reemplazos | Ligar con personal (RRHH/usuarios); **la autorización por método es lo que valida quién puede firmar un ensayo** |
| `PG07-R1` | Registro y seguimiento de NC, Riesgos y Oportunidades | Un solo registro con tres tipos (NC/TNC, Riesgo, OM), análisis de causa, acción correctiva, eficacia, cierre |
| `PG08-R01` | Informe de revisión por la dirección | Anual; consume indicadores, quejas, auditorías, NC, encuestas |
| `PG11-R1` | Informe de validación del método | Documento adjunto por método/IT |
| `MC01-R01/R02` | Compromiso de confidencialidad e imparcialidad (interno/externo) | Registro firmado por persona (PDF adjunto) |
| `MC01-R03` | Seguimiento de objetivos e indicadores | Indicadores con meta/valor por período |
| `MC01-R05` | Nota institucional | Comunicaciones de la dirección |

**(C) Documentos externos** (carpeta "Normas de referencia" + certificados): catálogo con nombre original, vigencia, fecha de revisión anual, relaciones (deroga/modifica), y archivo.

---

## 2. Cómo se relaciona con Metrología Legal (y dónde está el límite)

```
CALIDAD (schema quality)                       METROLOGÍA LEGAL (schema metrology)
────────────────────────                       ──────────────────────────────────
Árbol documental MC/PG/IT  ──"registro de"──▶  equipments, standard_weights, calibration_reports
Lista de documentos (PG01-R01)                 (los datos operativos siguen acá)
Registros SGC (quejas, NC, auditorías,
  capacitaciones, proveedores, indicadores)
Catálogo documentos externos (PG01-R02)  ◀──  ApplicableStandard / RegulatoryProfile del informe
Autorizaciones de personal (PG06-R02)    ──▶  valida PerformedBy / ApprovedBy del informe
Hoja de vida / programa calibración      ◀──  eventos de calibración / vencimiento de pesas
```

Principios:

1. **Metrología es dueña del dato técnico** (balanza, pesa, ensayo, informe). Calidad **no copia** esos datos; los muestra a través de "vistas de registro" con el código SGC correspondiente (ej. la pantalla "PG14-R4 Listado de equipos" lee `standard_weights` y los equipos auxiliares nuevos).
2. **Calidad es dueña del "marco"**: qué procedimiento/versión rige, quién está autorizado, qué norma aplica, qué NC hubo. Metrología consulta a Calidad vía un proyecto `Quality.Contracts` (misma técnica que `Accounting.Contracts`), nunca al revés por Infrastructure.
3. **Snapshot al emitir**: cuando se emite un `PG09 R1 Informe de ensayo`, el informe guarda `procedureCode+version` (PG12 v1, IT 02 v1), `externalDocumentCodes` (Res. 25/2025), `authorizationIds` del técnico y aprobador. Si mañana PG12 pasa a v2, el informe histórico sigue apuntando a v1 (regla §27 del documento de contexto).
4. **Equipos** (decisión 07/09/2026): se reparten según quién los usa en el ensayo.
   - **Pesas patrón y termómetro → Metrología.** El termómetro interviene en el ensayo (condiciones ambientales, PG16) igual que las pesas, tiene certificado de calibración y trazabilidad. Metrología incorpora una entidad `MetrologyInstrument` (termómetro y futuros instrumentos auxiliares de medición) con los mismos campos de calibración que `StandardWeight`.
   - **Camión, acoplado y autoelevador → Calidad** como `QualityEquipment` (auxiliares: mueven y transportan las pesas, no miden). El autoelevador se modela como equipo hijo del camión (`ParentEquipmentId`). Vínculo opcional a Flota (`FleetVehicleId`) para no duplicar patente/servicio, pero no es requisito.
   - `PG14-R4 Listado de equipos` y `PG14-R1 Hoja de vida` los muestran unificados: pesas + instrumentos desde Metrología, auxiliares desde Calidad, con la codificación `EQ 001…` que fija PG14 §5.1.

---

## 3. Modelo de dominio propuesto (schema `quality`)

### 3.1 Documentos

```
QualityDocument                          -- nodo del árbol documental
  Id, TenantId
  Code            "PG14"                  (normalizado, único por tenant)
  DisplayCode     "PG 14"                 (como figura en el documento)
  Type            Manual | Procedure | Instruction | RecordTemplate | External
  Title           "Equipamiento"
  ParentId        (MC01 → PG → IT; R cuelga de su PG/IT/MC)
  SortOrder
  Status          Draft | InReview | Approved | Current | Obsolete | Archived
  CurrentVersionId
  ReviewPeriodMonths   24 internos / 12 externos
  NextReviewDate
  OwnerRole       "Responsable de calidad" / "Dirección técnica"
  Iso17025Clauses "6.4, 6.5"              (para la matriz cláusula → documento)
  RecordKind      (solo para RecordTemplate) → ver §3.3
  ExternalSource  (solo External: organismo, URL oficial, nombre original)
  DeactivationReason (baja justificada, PG01 §5.10)

QualityDocumentVersion                   -- una fila por versión, inmutable una vez aprobada
  Id, DocumentId, Version (1,2,3…)
  FileId          → QualityFile
  ChangeSummary   (historial de cambios)
  ElaboratedBy / ElaboratedAt
  ReviewedBy   / ReviewedAt
  ApprovedBy   / ApprovedAt
  EffectiveFrom / EffectiveTo
  Status
  DistributionAcknowledgements[] (quién acusó recibo, PG01 §5.6)

QualityDocumentRelation                  -- para externos: deroga / modifica / complementa / referencia
  FromDocumentId, ToDocumentId, RelationType
```

### 3.2 Archivos

No existe hoy ninguna abstracción de almacenamiento binario en el repo (solo base64 en DB para el logo). Para Calidad hace falta un `IFileStorage` real:

```
QualityFile
  Id, TenantId, FileName, ContentType, SizeBytes, Sha256, StorageKey, UploadedBy, UploadedAtUtc
  Role            Published | Source          (PDF publicado vs. .docx/.xlsx editable)
```

**Decisión (07/09/2026): disco local del VPS.** Ruta `/opt/lealcontrol/storage/{tenant}/quality/{yyyy}/{guid}` detrás de `IFileStorage` en BuildingBlocks; la carpeta entra al backup del runbook junto con la base. Si en el futuro se necesita almacenamiento externo (S3 = servicio de archivos en la nube de Amazon; MinIO = equivalente autoalojado), se agrega otra implementación de `IFileStorage` sin tocar el módulo. Descarga siempre por endpoint autenticado (nunca URL pública).

**Formato publicado (decisión): la versión vigente se publica obligatoriamente en PDF.** Cada `QualityDocumentVersion` tiene un `PublishedFileId` (PDF, obligatorio para pasar a `Approved`/`Current`) y un `SourceFileId` opcional (.docx/.xlsx editable, visible solo para Calidad/Dirección). Lo que ve el auditor y lo que se descarga es siempre el PDF, con marca "COPIA NO CONTROLADA" en el nombre y pie (PG01 §5.3). El hash SHA-256 del PDF publicado queda registrado para demostrar que no se alteró.

### 3.3 Registros del SGC

Cada `RecordTemplate` (PG03-R01, PG07-R1…) tiene un `RecordKind` que decide **cómo se materializa**:

| RecordKind | Materialización |
|---|---|
| `Generated` | Vista calculada (PG01-R01, PG01-R02, PG14-R3, PG14-R4) |
| `Linked` | Vive en otro módulo; Calidad muestra lista + deep-link (IT 0X R1/R2/R3, PG09 R1 → Metrología) |
| `Structured` | Entidad propia con formulario (quejas, NC, auditorías, capacitaciones, proveedores, indicadores, hoja de vida, verificación intermedia, mantenimiento) |
| `Attachment` | Solo archivo subido + metadatos (MC01-R01/R02 firmados, PG11-R1, PG08-R01, PG04-R03) |

Entidades `Structured` (nombres en inglés en código, etiquetas en español con el código SGC en UI):

```
Complaint            (PG03-R01)  number, receivedAt, channel, party, description, isValid, validatedAt,
                                 investigation, actions, communicatedAt, closedAt, status, linkedNonConformityId
NonConformity        (PG07-R1)   kind: NonConformity|NonConformingWork|Risk|Opportunity
                                 origin, detectedAt, description, immediateAction, impactOnPreviousResults,
                                 customerNotified, rootCauseMethod, rootCause, correctiveAction, responsible,
                                 dueDate, newDueDate, effectivenessCheck, effectivenessResult, closedAt, status
                                 (riesgo: probability, impact, level, controls, residualLevel)
InternalAudit        (PG04)      programYear, plannedDate, scope/clauses, auditor, planFileId (R02),
                                 reportFileId (R03), checklistFileId (R04), findings[] → NonConformity
TrainingPlanItem     (PG06-R01)  year, topic, targetRoles, plannedDate, doneDate, effectivenessCheck
PersonnelAuthorization (PG06-R02) userId (usuario del sistema), method/documentCode (IT 01…), trainingEvidence, supervisedBy,
                                 authorizedByUserId (debe tener flag Director Técnico), authorizedAt, validUntil, status
                                 ← usado por Metrología para validar quién ejecuta y quién aprueba un informe
CompetenceReview     (PG06-R03)  personId, year, evaluator, technical/personal scores, conclusions
RoleAssignment       (PG06-R04)  role, personId, substitutePersonId, since
SupplierEvaluation   (PG05-R01/R03) supplierId (Directorio), initialScore, approved, performanceReviews[]
Indicator / IndicatorValue (MC01-R03) name, objective, formula, target, period, value, responsible
ManagementReview     (PG08-R01)  year, date, attendees, inputs (auto: quejas, NC, auditorías, indicadores, encuestas), decisions, fileId
QualityEquipment     (PG14-R4 auxiliares) code "EQ 001", kind: Truck|Trailer|Forklift|Other, brand, model, serial, plate,
                                 parentEquipmentId (autoelevador → camión), fleetVehicleId? (opcional, Flota),
                                 location, status (Active|OutOfService|Retired)
                                 (el termómetro NO va acá: es MetrologyInstrument en Metrología, ver §3.4)
EquipmentLogEntry    (PG14-R1)   equipmentRef (QualityEquipment | StandardWeight | MetrologyInstrument), date, kind: C|V|MP|MC|Baja,
                                 description, certificateNumber, verdict Apto|NoApto, approvedByTechnicalDirector, responsible
IntermediateCheck    (PG14-R5)   date, weightUsed (1000 kg), instrument, readings, result, responsible
MaintenancePlanItem  (PG14-R6)   equipmentRef, activity, frequency, nextDue, lastDone
SatisfactionSurvey   (PG09 R3)   calibrationReportId, customerId, date, answers, score, comments
ConfidentialityCommitment (MC01-R01/R02) personId | externalName, kind Internal|External, signedAt, fileId
```

### 3.4 Lo que hay que agregar en Metrología (mínimo)

- `CalibrationReport.ProcedureSnapshotJson` = `{ "PG12": 1, "IT 02": 1, "PG09": 1 }` y `ExternalDocumentCodes`.
- `CalibrationReport.PerformedByAuthorizationId / ApprovedByAuthorizationId` (FK lógico a `quality.personnel_authorizations`); al emitir, validar vía `IQualityAuthorizationGateway` (en `Quality.Contracts`).
- Enmienda: `CalibrationReport.SupersedesReportId` + `AmendmentReason` para el `PG09 R2 Modificación al informe`; el original queda `ReportStatus = Superseded`, nunca se edita.
- `StandardWeight` publica evento de dominio `WeightCalibrated` para que Calidad cree la fila en `EquipmentLogEntry` (hoja de vida) sin acoplar módulos.
- Nueva entidad `MetrologyInstrument` (termómetro y otros instrumentos de medición auxiliares): `Code "EQ 0xx"`, `Kind Thermometer|Other`, marca/modelo/serie, rango, resolución, `CertificateNumber`, `TraceabilityLab`, `CalibrationDate`, `ExpirationDate`, `Status`. Mismo evento `InstrumentCalibrated` que las pesas. El `CalibrationReport` pasa a referenciar el termómetro usado (`ThermometerInstrumentId`) junto con la temperatura registrada, para que la condición ambiental del PG16 sea trazable al instrumento.
- Flag **Director Técnico** a nivel usuario (ver §5): solo un DT puede `ApprovedBy` en un informe, aprobar MC/IT y firmar autorizaciones PG06-R02.

---

## 4. Frontend — recorrido pensado para el auditor

Módulo `calidad` en `moduleRegistry.ts`, ruta base `/calidad`, claim `quality`.

```
/calidad                         Tablero SGC: documentos vencidos de revisión, NC abiertas, calibraciones próximas,
                                 autorizaciones por vencer, quejas fuera de plazo, matriz cláusulas 17025 (verde/rojo)
/calidad/documentos              ÁRBOL (panel izquierdo) + detalle (derecha)
                                   MC01 Manual de calidad
                                     ├─ MC01-R01, R02, R03, R05
                                   PG Procedimientos
                                     ├─ PG01 Gestión de documentos
                                     │    ├─ PG01-R01 Lista de documentos      [generado]
                                     │    └─ PG01-R02 Lista de doc. externos   [generado]
                                     ├─ …
                                     └─ PG14 Equipamiento
                                          ├─ PG14-R1 Hoja de vida  [estructurado]
                                          ├─ PG14-R3 Programa de calibraciones [generado]
                                          └─ PG14-R4 Listado de equipos [generado: pesas Metrología + auxiliares]
                                   IT Instructivos
                                     ├─ IT 01 Alta capacidad cargas rodantes
                                     │    ├─ IT 01 R1 Identificación  → lista de equipos Metrología (deep-link)
                                     │    ├─ IT 01 R2 Ensayos         → informes Metrología (deep-link)
                                     │    └─ IT 01 R3 Precintos       → informes Metrología (deep-link)
                                     └─ IT 07 Validación de planillas de cálculo
                                   Documentos externos (Normas de referencia)
/calidad/documentos/:code        Detalle: encabezado (código, versión vigente, estado, próxima revisión), pestañas
                                 Versiones (historial + Elaboró/Revisó/Aprobó) · Archivo (visor/descarga) ·
                                 Registros asociados · Cláusulas 17025 · Distribución (acuses)
/calidad/registros/quejas        PG03-R01
/calidad/registros/nc            PG07-R1 (NC / TNC / Riesgos / OM con filtro por tipo)
/calidad/registros/auditorias    PG04
/calidad/registros/personal      PG06 (capacitaciones, autorizaciones, competencias, funciones)
/calidad/registros/proveedores   PG05
/calidad/registros/equipos       PG14 (hoja de vida, verificación intermedia, mantenimiento, auxiliares)
/calidad/registros/indicadores   MC01-R03
/calidad/registros/revision-direccion  PG08-R01
/calidad/registros/encuestas     PG09 R3
/calidad/normas                  Documentos externos (PG01-R02): vigencia, relaciones, revisión anual
```

Detalles de UX que importan en auditoría:
- Cada pantalla de registro muestra el **código SGC en el título** ("PG07-R1 · Registro y seguimiento de NC, R y OP") y un link al procedimiento padre con la versión vigente.
- Desde un informe de ensayo en Metrología, un botón "Ver trazabilidad SGC" abre: PG12 v1 · IT 02 v1 · PG09 v1 · Res. 25/2025 · técnico autorizado (PG06-R02 #…) · pesas con certificado vigente.
- Buscador global por código (`PG14-R1`, `IT 03 R2`) que resuelve al documento o al registro.
- Descargas marcadas "COPIA NO CONTROLADA".

---

## 5. Permisos

| Rol (PG06 anexos) | Documentos | Registros SGC | Metrología |
|---|---|---|---|
| **Director Técnico** (Leonel / Javier) — flag `IsTechnicalDirector` en el usuario | aprobar MC/PG/IT, dar de baja | todo; **único que firma autorizaciones PG06-R02** y evalúa certificados (Apto/No apto) | **único que puede `ApprovedBy` un informe** |
| Responsable de calidad | crear/revisar, distribuir, cargar externos, publicar PDF | todo | lectura |
| Consultor de calidad externo | lectura + comentarios (opcional edición borradores) | lectura/edición según se decida | lectura |
| Técnico de campo | lectura de vigentes | crear quejas/NC, ver su legajo | ejecutar ensayos (si tiene PG06-R02 vigente para ese IT) |

**Director Técnico (decisión 07/09/2026):** no es un rol más del RBAC sino un **flag sobre el usuario** (`IsTechnicalDirector`), porque la norma exige que ciertas firmas sean de una persona concreta y nominada (PG06-R04). Se crea un usuario para Javier y otro para Leonel con ese flag; el flag lo asigna solo SuperAdmin/Admin y queda auditado. Backend: policy `RequireTechnicalDirector` (claim `technical_director=true`) para aprobar informes, aprobar MC/IT, firmar PG06-R02 y dictaminar certificados; `RequireQuality` para escrituras generales de Calidad; prefijo `/api/v1/quality → quality` en `ContractedModuleMap`.

**Auditor externo (decisión): "modo presentación", sin usuario propio.** El responsable de calidad o el DT activan desde su sesión un modo de solo lectura para mostrar el sistema al auditor:
- Se activa con un toggle en el header ("Modo presentación · Auditoría"); el frontend oculta todos los botones de alta/edición/baja y el backend rechaza escrituras mientras la sesión tenga el flag (`X-Presentation-Mode: 1` verificado por middleware → 403 en cualquier método no-GET de `/api/v1/quality` y `/api/v1/metrology`).
- Salir del modo requiere reingresar la contraseña (evita que el auditor, con la máquina prestada, salga solo).
- Cada activación/desactivación queda en un log (`quality.presentation_sessions`: usuario, inicio, fin, IP), que sirve como evidencia de "acceso controlado" frente a PG02 §5.1.
- Fuente editable (.docx) y datos de otros módulos (Finanzas, CRM…) no se muestran en este modo: el menú se reduce a Calidad y Metrología.

---

## 6. Backend — organización propuesta

Seguir el patrón Metrología (Infrastructure plano + Minimal API + `EnsureQualityTablesAsync`) **más** un proyecto `Quality.Contracts` para que Metrología pueda consultar autorizaciones y snapshots sin referenciar Infrastructure (mismo esquema que `Accounting.Contracts`; se agrega la regla correspondiente en `ArchitectureTests`).

```
src/Modules/Quality/
├── LealControl.Modules.Quality.Contracts/
│   ├── IQualityAuthorizationGateway.cs     (¿persona X autorizada para método IT 02 en fecha Y?)
│   └── IQualityDocumentSnapshotProvider.cs (versión vigente de PG12/IT 02/PG09 a una fecha)
└── LealControl.Modules.Quality.Infrastructure/
    ├── QualityEntities.cs
    ├── QualityDbContext.cs                 (schema "quality", EnsureQualityTablesAsync)
    ├── QualityDocumentEndpoints.cs         (/api/v1/quality/documents…)
    ├── QualityRecordEndpoints*.cs          (uno por familia: complaints, nonconformities, audits, personnel, suppliers, equipment, indicators, reviews)
    ├── QualityFileEndpoints.cs             (upload/download)
    ├── QualityDashboardEndpoints.cs
    ├── QualitySeed.cs                      (árbol inicial MC/PG/IT del Listado de códigos)
    ├── PresentationModeMiddleware.cs       (modo presentación: bloquea escrituras + log de sesión)
    └── Storage/ (o en BuildingBlocks) IFileStorage + LocalDiskFileStorage

tools/quality-seed/                          (script de carga inicial, ver §7)
```

Ganchos: `Program.cs` (Add/Map/HealthCheck), `TenantDatabaseBootstrapper` (después de Metrology), `TenantProvisionerService` (schema `quality` en backups), `QaWebApplicationFactory`, `moduleRegistry.ts`, `App.tsx`, `lazyPages.tsx`, `client.ts`/`types/quality.ts`.

---

## 7. Datos iniciales (seed)

El `Listado de códigos utilizados.xlsx` es la fuente del árbol inicial. Seed por tenant INMELA:

- `MC01` Manual de calidad (v1, aprobado 10/07/2026, Elaboró Laura Delissi / Revisó Leonel Alfonso / Aprobó Javier Coppini) + R01, R02, R03, R05.
- `PG01`…`PG17` con los títulos exactos del listado y sus registros R (ver §1.3). PG05 y PG09 se crean sin archivo (estado `Draft`) hasta que la consultoría los suba.
- `IT 01`…`IT 04` (títulos: Balanzas de alta capacidad cargas rodantes / media capacidad / baja capacidad y venta al público / tipo tolva) con R1 Identificación, R2 Ensayos, R3 Precintos como `Linked` → Metrología. `IT 07` Validación de planillas de cálculos.
- Documentos externos de "Normas de referencia" con relaciones (25/2025 deroga 2307/80 con régimen transitorio; 276/2024 y 67/2025 modifican 611/2019).
- Cláusulas ISO 17025 → documento, tomadas de la `Planilla_Seguimiento_ISO_17025` (4.1/4.2 → MC01; 6.2 → PG06; 6.3 → PG16; 6.4 → PG14; 6.5 → PG17; 6.6 → PG05; 7.2 → PG11/PG12; 7.4 → PG13; 7.5 → PG02; 7.6 → PG10; 7.7 → PG15; 7.8 → PG09; 7.9 → PG03; 7.10 → PG07; 8.3 → PG01; 8.4 → PG02; 8.5/8.7 → PG07; 8.8 → PG04; 8.9 → PG08).

**Carga de archivos (decisión): por script, al cierre de C1.** `tools/quality-seed/` hace:

1. Coloca los archivos del Drive "INMELA - BFS" en `tools/quality-seed/input/` (misma `fileName` que `mapping.json`; no versionar binarios).
2. Convierte cada .docx/.xlsx a PDF (LibreOffice headless) → ese PDF es el `PublishedFileId`; el original queda como `SourceFileId`.
3. Resuelve códigos con `mapping.json` (revisado a mano; `missing` / `generated` para huecos ELEVAR y registros generados).
4. Sube vía API (`POST …/files`, `POST …/attach`, `PATCH` metadatos, opcional `--approve` DT) con Elaboró/Revisó/Aprobó 10/07/2026.
5. Emite `discrepancies-report.md` (sin archivo local, missing Drive, huérfanos, catálogo sin mapping).

El script es idempotente por código+versión (si ya hay `PublishedFileId`, se omite).

---

## 8. Huecos detectados en la documentación de la consultoría (para plantear a ELEVAR)

1. `PG05 Compras` y las plantillas `PG09 R1/R2/R3` no están subidas; el listado de códigos dice "subido" para PG05 pero la carpeta solo tiene los R.
2. `IT 01`…`IT 04` no están en el Drive; el sistema los va a materializar como los formularios de ensayo de Metrología — conviene que la consultoría valide que la salida del sistema "es" el IT 0X R1/R2/R3 (y que el encabezado del informe impreso lleve esos códigos).
3. `PG09` menciona `IT 05 R1 R2 R3` y `PG11 R01 Informe de revisión por la dirección` (debería ser PG08 R01); `PG15` dice "Versión: 4" mientras el resto es v1; `PG13` define "ítem de ensayo" como "surtidor de combustibles" (copy-paste de otro cliente). Son errores documentales que un auditor va a marcar.
4. `PG06` habla de "PG06-R04 Verificación de la eficacia de la capacitación" y a la vez `PG06 R04 Asignación de funciones y reemplazos`: código duplicado, falta un R05.
5. `MC01` referencia `MC01 R05 Nota institucional` que no existe como archivo, y hay inversión interno/externo entre el texto del MC01 (R01 externo, R02 interno) y los nombres de archivo (R1 interno, R2 externo).
6. `PG14` cita `CE-LE-08` del OAA y `PG17` cita `CG-LE-01` y `VIM`: deben entrar al catálogo de documentos externos (hoy no están en la carpeta Normas).
7. `PG02` dice que la corrección de registros digitales se apoya en el "historial de cambios de Google Drive": al migrar al sistema, el módulo tiene que ofrecer **historial de cambios por registro** (quién, cuándo, antes/después) para reemplazar esa evidencia. Esto exige auditoría de cambios a nivel entidad en todos los registros `Structured`.

---

## 9. Propuesta de fases

| Fase | Alcance | Resultado auditable |
|---|---|---|
| **C1 — Árbol documental** | `IFileStorage` (disco local), `QualityDocument/Version/File` con PDF publicado + fuente, árbol MC/PG/IT + externos, versiones con Elaboró/Revisó/Aprobó, estados, PG01-R01/R02 generados, descarga "copia no controlada", vencimiento de revisión, flag Director Técnico + policy `RequireTechnicalDirector`, **script de seed** `tools/quality-seed` (descarga Drive → PDF → carga) | El auditor navega todo el SGC con los códigos reales y los PDF vigentes |
| **Estado C1 (07/09/2026):** | **CERRADO.** Staging validado (dashboard + menú). API: upload/attach/PATCH versión/approve (ReviewedBy antes de validar). UI detalle: subir PDF/fuente, nueva versión, aprobar (DT). Script `tools/quality-seed` con `mapping.json` ampliado, conversión LibreOffice y reporte de discrepancias. Pendiente operativo: poblar `input/` desde Drive y correr el seed en el tenant INMELA (PDFs aún no cargados hasta eso). | — |
| **C2 — Enlace con Metrología** | `Quality.Contracts`, `MetrologyInstrument` (termómetro) y su referencia en el informe, snapshot de procedimiento/versión y normas en el informe, `ApprovedBy` restringido a DT, PG14-R4/R3 generados desde pesas + instrumentos + auxiliares, hoja de vida PG14-R1 con eventos de calibración, PG09 R2 enmienda, "Ver trazabilidad SGC" desde el informe, vista IT 0X R1/R2/R3 | Cadena Ensayo → Norma → Procedimiento → Patrón/Termómetro → Certificado → DT que aprobó, desde un informe |
| **Estado C2 (07/09/2026):** | **EN CURSO — corte 2.** Corte 1 (snapshot + DT + trazabilidad) + `MetrologyInstrument` (termómetro) con CRUD `/metrologia/instrumentos`, vínculo `ThermometerInstrumentId` en el informe (valida certificado vigente), visible en impresión y trazabilidad SGC. Pendiente: PG14-R3/R4 generados, PG09 R2, hoja de vida, vistas Linked IT. | — |
| **C3 — Registros de gestión** | PG07-R1 (NC/TNC/riesgos/OM), PG03-R01 quejas con plazos, PG04 auditorías, PG06 personal + autorizaciones firmadas por DT (validación de firma en Metrología), PG05 proveedores, MC01-R03 indicadores, PG08-R01 revisión por la dirección, PG09 R3 encuestas, PG14-R5/R6, `QualityEquipment` (camión/acoplado/autoelevador), MC01-R01/R02 | Todos los registros del listado de códigos existen en el sistema |
| **C4 — Tablero, auditoría de cambios y modo presentación** | Dashboard SGC, matriz cláusulas 17025, historial before/after por registro, **modo presentación** (toggle, bloqueo de escrituras en backend, salida con contraseña, log de sesiones), alertas (Google Calendar → notificaciones del sistema) | Simulacro de auditoría interna PG04 completo dentro del sistema, mostrado en modo presentación |

Estimación gruesa: C1 es la que desbloquea todo lo demás y es la de menor riesgo; C2 toca Metrología y conviene hacerla antes de emitir informes "en producción ISO"; C3 es volumen (muchos formularios pero todos del mismo patrón); C4 es pulido. El modo presentación podría adelantarse a C1 en versión mínima (solo ocultar botones) si la auditoría interna se programa antes de terminar C4.

---

## 10. Decisiones tomadas (07/09/2026, Leonel)

| # | Tema | Decisión | Impacto en el diseño |
|---|---|---|---|
| 1 | Equipos auxiliares | **Termómetro → Metrología** (`MetrologyInstrument`, mismo tratamiento que las pesas). **Camión, acoplado y autoelevador → Calidad** (`QualityEquipment`; autoelevador como hijo del camión; vínculo a Flota opcional, no requerido). | §2.4, §3.3, §3.4 |
| 2 | Almacenamiento | **Disco local del VPS** con backup, detrás de `IFileStorage`. S3/MinIO queda como implementación alternativa futura sin cambios en el módulo. | §3.2 |
| 3 | Formato publicado | **PDF obligatorio** para la versión vigente; .docx/.xlsx se conserva como fuente editable no visible al auditor. | §3.2, §7 |
| 4 | Autorizaciones / firmas | Las autorizaciones PG06-R02 y las aprobaciones las firman los **Directores Técnicos (Javier y Leonel)**. Se crea un **flag `IsTechnicalDirector` sobre el usuario** y la policy `RequireTechnicalDirector`. Las personas autorizadas son usuarios del sistema. | §3.3, §3.4, §5 |
| 5 | Auditor externo | **Modo presentación** desde la sesión de Calidad/DT: solo lectura, bloqueo de escrituras en backend, salida con contraseña, log de sesiones. Sin usuario propio para el auditor. | §5, §9 (C4) |
| 6 | Seed de archivos | **Script** `tools/quality-seed`: descarga del Drive, conversión a PDF, mapeo de códigos, carga por API, reporte de discrepancias. Idempotente. | §6, §7, §9 (C1) |
