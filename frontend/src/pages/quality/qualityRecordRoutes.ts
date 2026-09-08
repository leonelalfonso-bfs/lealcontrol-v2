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
