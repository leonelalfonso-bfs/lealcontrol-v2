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
  }
];

export function operationalRecordFor(code: string): QualityOperationalRecord | undefined {
  return QUALITY_OPERATIONAL_RECORDS.find((r) => r.code === code);
}
