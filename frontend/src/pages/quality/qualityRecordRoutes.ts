/** Rutas operativas de registros SGC (no van al menú lateral). */
export type QualityOperationalRecord = {
  code: string;
  title: string;
  path: string;
  kind: "Attachment" | "Structured" | "Generated" | "Linked";
  ready: boolean;
  blurb: string;
};

export const QUALITY_OPERATIONAL_RECORDS: QualityOperationalRecord[] = [
  {
    code: "MC01-R01",
    title: "Compromiso de confidencialidad e imparcialidad (interno)",
    path: "/calidad/registros/mc01-r01",
    kind: "Attachment",
    ready: true,
    blurb: "Instancias firmadas por personal interno."
  },
  {
    code: "MC01-R02",
    title: "Compromiso de confidencialidad e imparcialidad (externo)",
    path: "/calidad/registros/mc01-r02",
    kind: "Attachment",
    ready: true,
    blurb: "Instancias firmadas por terceros / personal externo."
  },
  {
    code: "MC01-R03",
    title: "Seguimiento de objetivos e indicadores",
    path: "/calidad/registros/indicadores",
    kind: "Structured",
    ready: true,
    blurb: "Indicadores con meta y valores por período."
  },
  {
    code: "MC01-R05",
    title: "Nota institucional",
    path: "/calidad/registros/mc01-r05",
    kind: "Attachment",
    ready: true,
    blurb: "Comunicaciones formales de la dirección."
  },
  {
    code: "PG03-R01",
    title: "Seguimiento de quejas",
    path: "/calidad/registros/quejas",
    kind: "Structured",
    ready: true,
    blurb: "Quejas generadas en el sistema con workflow y plazos SLA."
  },
  {
    code: "PG07-R01",
    title: "Registro y seguimiento de NC, R y OP",
    path: "/calidad/registros/nc",
    kind: "Structured",
    ready: true,
    blurb: "NC / TNC / Riesgos / OM generados en el sistema."
  },
  {
    code: "PG08-R01",
    title: "Informe de revisión por la dirección",
    path: "/calidad/registros/revision-direccion",
    kind: "Structured",
    ready: true,
    blurb: "Revisión anual; inputs del SGC (quejas, NC, auditorías, indicadores…) se arman solos."
  },
  {
    code: "PG09-R02",
    title: "Modificación al informe de ensayos",
    path: "/metrologia/informes",
    kind: "Linked",
    ready: true,
    blurb: "Vinculado a Metrología: enmienda PG09 R2 (clon borrador, original sustituido, motivo obligatorio)."
  },
  {
    code: "IT01-R01",
    title: "IT01 Identificación",
    path: "/calidad/registros/it/IT01/r1",
    kind: "Linked",
    ready: true,
    blurb: "Equipos de balanzas de alta capacidad (cargas rodantes) en Metrología."
  },
  {
    code: "IT01-R02",
    title: "IT01 Ensayos",
    path: "/calidad/registros/it/IT01/r2",
    kind: "Linked",
    ready: true,
    blurb: "Informes de ensayo asociados a IT01."
  },
  {
    code: "IT01-R03",
    title: "IT01 Precintos",
    path: "/calidad/registros/it/IT01/r3",
    kind: "Linked",
    ready: true,
    blurb: "Precintos colocados en informes IT01."
  },
  {
    code: "IT02-R01",
    title: "IT02 Identificación",
    path: "/calidad/registros/it/IT02/r1",
    kind: "Linked",
    ready: true,
    blurb: "Equipos de balanzas de media capacidad en Metrología."
  },
  {
    code: "IT02-R02",
    title: "IT02 Ensayos",
    path: "/calidad/registros/it/IT02/r2",
    kind: "Linked",
    ready: true,
    blurb: "Informes de ensayo asociados a IT02."
  },
  {
    code: "IT02-R03",
    title: "IT02 Precintos",
    path: "/calidad/registros/it/IT02/r3",
    kind: "Linked",
    ready: true,
    blurb: "Precintos colocados en informes IT02."
  },
  {
    code: "IT03-R01",
    title: "IT03 Identificación",
    path: "/calidad/registros/it/IT03/r1",
    kind: "Linked",
    ready: true,
    blurb: "Equipos de balanzas de baja capacidad / venta al público."
  },
  {
    code: "IT03-R02",
    title: "IT03 Ensayos",
    path: "/calidad/registros/it/IT03/r2",
    kind: "Linked",
    ready: true,
    blurb: "Informes de ensayo asociados a IT03."
  },
  {
    code: "IT03-R03",
    title: "IT03 Precintos",
    path: "/calidad/registros/it/IT03/r3",
    kind: "Linked",
    ready: true,
    blurb: "Precintos colocados en informes IT03."
  },
  {
    code: "IT04-R01",
    title: "IT04 Identificación",
    path: "/calidad/registros/it/IT04/r1",
    kind: "Linked",
    ready: true,
    blurb: "Equipos de balanzas tipo tolva en Metrología."
  },
  {
    code: "IT04-R02",
    title: "IT04 Ensayos",
    path: "/calidad/registros/it/IT04/r2",
    kind: "Linked",
    ready: true,
    blurb: "Informes de ensayo asociados a IT04."
  },
  {
    code: "IT04-R03",
    title: "IT04 Precintos",
    path: "/calidad/registros/it/IT04/r3",
    kind: "Linked",
    ready: true,
    blurb: "Precintos colocados en informes IT04."
  },
  {
    code: "PG09-R03",
    title: "Encuesta de satisfacción",
    path: "/calidad/registros/encuestas",
    kind: "Structured",
    ready: true,
    blurb: "Encuestas ENC-AAAA-NNNN; puntajes 1–5 y vínculo opcional al informe de ensayo."
  },
  {
    code: "PG04-R01",
    title: "Programa de auditorías",
    path: "/calidad/registros/auditorias",
    kind: "Structured",
    ready: true,
    blurb: "Auditorías internas AUD-AAAA-NNNN; el listado por año es el programa."
  },
  {
    code: "PG04-R02",
    title: "Plan de auditoría",
    path: "/calidad/registros/auditorias",
    kind: "Structured",
    ready: true,
    blurb: "Etapa plan / objetivos / adjunto del mismo flujo PG04."
  },
  {
    code: "PG04-R03",
    title: "Informe de auditoría",
    path: "/calidad/registros/auditorias",
    kind: "Structured",
    ready: true,
    blurb: "Hallazgos, conclusiones e informe PDF exportable."
  },
  {
    code: "PG04-R04",
    title: "Lista de verificación ISO/IEC 17025",
    path: "/calidad/registros/auditorias",
    kind: "Structured",
    ready: true,
    blurb: "Checklist y cláusulas dentro de la auditoría."
  },
  {
    code: "PG05-R01",
    title: "Evaluación inicial de proveedores",
    path: "/calidad/registros/proveedores?tab=r01",
    kind: "Structured",
    ready: true,
    blurb: "Evaluación y habilitación de proveedores con puntaje y vigencia."
  },
  {
    code: "PG05-R02",
    title: "Listado de proveedores habilitados",
    path: "/calidad/registros/proveedores?tab=r02",
    kind: "Generated",
    ready: true,
    blurb: "Proveedores con evaluación aprobada y vigente."
  },
  {
    code: "PG05-R03",
    title: "Evaluación del desempeño de proveedores",
    path: "/calidad/registros/proveedores?tab=r03",
    kind: "Structured",
    ready: true,
    blurb: "Revisión periódica de desempeño (calidad, entrega, servicio)."
  },
  {
    code: "PG06-R01",
    title: "Programa de capacitaciones",
    path: "/calidad/registros/personal?tab=r01",
    kind: "Structured",
    ready: true,
    blurb: "Capacitaciones del año con seguimiento de eficacia."
  },
  {
    code: "PG06-R02",
    title: "Entrenamiento y autorización del personal",
    path: "/calidad/registros/personal?tab=r02",
    kind: "Structured",
    ready: true,
    blurb: "Autorización por método/IT firmada por Director Técnico."
  },
  {
    code: "PG06-R03",
    title: "Seguimiento de competencias",
    path: "/calidad/registros/personal?tab=r03",
    kind: "Structured",
    ready: true,
    blurb: "Evaluación técnica y personal por persona/año."
  },
  {
    code: "PG06-R04",
    title: "Asignación de funciones y reemplazos",
    path: "/calidad/registros/personal?tab=r04",
    kind: "Structured",
    ready: true,
    blurb: "Roles SGC con titular y reemplazo."
  },
  {
    code: "PG01-R01",
    title: "Lista de documentos",
    path: "/calidad/registros/pg01-r01",
    kind: "Generated",
    ready: true,
    blurb: "Listado generado del árbol documental interno."
  },
  {
    code: "PG01-R02",
    title: "Lista de documentos externos",
    path: "/calidad/registros/pg01-r02",
    kind: "Generated",
    ready: true,
    blurb: "Listado generado de normas y documentos externos."
  },
  {
    code: "PG14-R04",
    title: "Listado de equipos",
    path: "/calidad/registros/equipos?tab=r04",
    kind: "Generated",
    ready: true,
    blurb: "Pesas patrón + instrumentos (Metrología) + auxiliares (Calidad)."
  },
  {
    code: "PG14-R03",
    title: "Programa de calibraciones",
    path: "/calidad/registros/equipos?tab=r03",
    kind: "Generated",
    ready: true,
    blurb: "Vencimientos de calibración de pesas e instrumentos, ordenados por fecha."
  },
  {
    code: "PG14-R01",
    title: "Hoja de vida del equipo",
    path: "/calidad/registros/equipos?tab=r01",
    kind: "Structured",
    ready: true,
    blurb: "Historial HV-AAAA-NNNN: calibraciones, verificaciones, mantenimientos y bajas."
  },
  {
    code: "PG14-EQ",
    title: "Equipos auxiliares",
    path: "/calidad/registros/equipos?tab=equipos",
    kind: "Structured",
    ready: true,
    blurb: "Camión, acoplado y autoelevador (EQ 001…); autoelevador hijo del camión."
  },
  {
    code: "PG14-R05",
    title: "Verificación intermedia",
    path: "/calidad/registros/equipos?tab=r05",
    kind: "Structured",
    ready: true,
    blurb: "Verificación intermedia VIC-AAAA-NNNN (típic. pesa 1000 kg)."
  },
  {
    code: "PG14-R06",
    title: "Programa de mantenimiento preventivo",
    path: "/calidad/registros/equipos?tab=r06",
    kind: "Structured",
    ready: true,
    blurb: "Ítems MP-AAAA-NNNN por equipo auxiliar; vencimientos y marca hecho."
  }
];

export function operationalRecordFor(code: string): QualityOperationalRecord | undefined {
  return QUALITY_OPERATIONAL_RECORDS.find((r) => r.code === code);
}
