import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const ACCENT = "#0369a1";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card pad stack">
      <h2 style={{ margin: "0 0 10px 0", color: ACCENT }}>{title}</h2>
      {children}
    </section>
  );
}

export function QualityHelpPage() {
  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Manual del módulo Calidad (SGC ISO/IEC 17025)</h1>
          <p className="muted">
            Guía operativa: árbol documental, registros, tablero, vínculo con Metrología y buenas prácticas para auditoría.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link to="/calidad" className="btn btn-outline">
            Tablero SGC
          </Link>
          <Link to="/calidad/documentos" className="btn btn-outline">
            Árbol documental
          </Link>
          <Link to="/calidad/registros" className="btn btn-primary" style={{ background: ACCENT }}>
            Registros operativos
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: 24, maxWidth: 960 }}>
        <Section title="1. Para qué sirve este módulo">
          <p>
            El módulo de Calidad es el <strong>Sistema de Gestión de Calidad (SGC)</strong> del laboratorio según{" "}
            <strong>ISO/IEC 17025</strong>. El auditor (OAA u organismo de acreditación) revisa{" "}
            <strong>el sistema</strong>, no carpetas del Drive: mismos códigos y nombres que el listado de documentos
            (MC01, PG01, PG14-R1, IT01 R2, etc.).
          </p>
          <ul>
            <li>
              <strong>Árbol documental:</strong> plantillas vigentes (PDF publicado + Word/Excel fuente) con versionado.
            </li>
            <li>
              <strong>Registros operativos:</strong> cada queja, NC, auditoría, indicador, etc. se{" "}
              <em>genera en el ERP</em> (número, estados, plazos). El PDF adjunto es evidencia, no reemplaza al registro.
            </li>
            <li>
              <strong>Tablero SGC:</strong> alertas, termómetro de cumplimiento y modo presentación.
            </li>
            <li>
              <strong>Metrología:</strong> informes de ensayo, pesas, instrumentos e IT se vinculan sin duplicar datos.
            </li>
          </ul>
        </Section>

        <Section title="2. Menú y navegación">
          <p>En el lateral de Calidad verás solo tres entradas (más esta Ayuda):</p>
          <ul>
            <li>
              <Link to="/calidad"><strong>Tablero SGC</strong></Link> — panorama del sistema y alertas.
            </li>
            <li>
              <Link to="/calidad/documentos"><strong>Árbol documental</strong></Link> — MC, PG, IT y externos.
            </li>
            <li>
              <Link to="/calidad/registros"><strong>Registros operativos</strong></Link> — índice de pantallas de
              instancias (quejas, NC, equipos…).
            </li>
          </ul>
          <p className="muted" style={{ marginBottom: 0 }}>
            No hay un ítem de menú por cada registro (PG03-R01, PG14-R05, etc.): se abren desde el árbol, desde el hub
            de registros o desde “Agregar registro” en el detalle del documento padre.
          </p>
        </Section>

        <Section title="3. Conceptos clave (tipos de registro)">
          <table className="data-table" style={{ width: "100%", fontSize: 14 }}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Qué hace el sistema</th>
                <th>Ejemplos</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Structured</strong></td>
                <td>Formulario + entidad con número y workflow</td>
                <td>Quejas, NC, auditorías, personal, proveedores</td>
              </tr>
              <tr>
                <td><strong>Generated</strong></td>
                <td>Vista calculada / listado / impresión desde datos vivos</td>
                <td>PG01 listas, PG14 listado/programa/etiqueta</td>
              </tr>
              <tr>
                <td><strong>Linked</strong></td>
                <td>Deep-link a Metrología u otro módulo</td>
                <td>PG09 informes, IT01–IT04 R1/R2/R3</td>
              </tr>
              <tr>
                <td><strong>Attachment</strong></td>
                <td>Alta de instancia + metadatos + PDF opcional</td>
                <td>MC01-R01/R02/R05, PG11-R01</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="4. Puesta en marcha (empresa nueva)">
          <p>
            Cada empresa (tenant) arma <strong>su propio árbol</strong>. No se copia automáticamente el catálogo de
            otra empresa.
          </p>
          <ol>
            <li>
              Ir a <Link to="/calidad/documentos">Árbol documental</Link> (vacío al inicio).
            </li>
            <li>
              <strong>Nuevo documento</strong>: tipo MC / PG / IT / Externo · código · título · encabezado (versión,
              elaboró, revisó, aprobó, fechas) · PDF publicado · Word/Excel fuente · marcar vigente si corresponde.
            </li>
            <li>
              En el detalle del documento: <strong>Agregar registro</strong> desde la lista fija del sistema (se crea el
              nodo hijo y el enlace a la pantalla operativa).
            </li>
            <li>
              Las instancias se cargan en <Link to="/calidad/registros">/calidad/registros/…</Link>.
            </li>
          </ol>
        </Section>

        <Section title="5. Tablero SGC">
          <p>
            Desde <Link to="/calidad">/calidad</Link> ves el estado del SGC: alertas de NC/quejas abiertas,
            calibraciones próximas a vencer, autorizaciones, matriz de cláusulas 17025 y acceso al{" "}
            <strong>modo presentación</strong> (útil para mostrar el sistema a auditores o dirección sin distracciones).
          </p>
        </Section>

        <Section title="6. Árbol documental (control de documentos)">
          <ul>
            <li>
              <strong>Versionado:</strong> cada documento tiene versiones; el PDF vigente es el publicado. El Word/Excel
              es la fuente editable.
            </li>
            <li>
              <strong>Aprobación / vigencia:</strong> al publicar o marcar vigente queda trazabilidad de quién elaboró,
              revisó y aprobó.
            </li>
            <li>
              <strong>Listas generadas:</strong>{" "}
              <Link to="/calidad/registros/pg01-r01">PG01-R01</Link> (documentos internos) y{" "}
              <Link to="/calidad/registros/pg01-r02">PG01-R02</Link> (externos/normas) se arman solos desde el árbol.
            </li>
            <li>
              <strong>Descarga:</strong> los archivos se abren con la sesión del usuario (token); no hace falta
              compartir carpetas de Drive para la operación diaria.
            </li>
          </ul>
        </Section>

        <Section title="7. Registros de gestión (MC / PG)">
          <h3 style={{ marginTop: 8, fontSize: 16 }}>Manual / compromiso (MC01)</h3>
          <ul>
            <li>
              <Link to="/calidad/registros/mc01-r01">MC01-R01</Link> /{" "}
              <Link to="/calidad/registros/mc01-r02">R02</Link> — compromisos de confidencialidad e imparcialidad
              (interno / externo) con PDF firmado.
            </li>
            <li>
              <Link to="/calidad/registros/indicadores">MC01-R03</Link> — objetivos e indicadores (meta + valores por
              período).
            </li>
            <li>
              <Link to="/calidad/registros/mc01-r05">MC01-R05</Link> — notas institucionales.
            </li>
          </ul>

          <h3 style={{ marginTop: 16, fontSize: 16 }}>Quejas y no conformidades</h3>
          <ul>
            <li>
              <Link to="/calidad/registros/quejas">PG03-R01 Quejas</Link> — recepción → validación → investigación →
              comunicación/cierre, con plazos SLA. Puede derivar en NC. PDF de instancia + Excel del listado.
            </li>
            <li>
              <Link to="/calidad/registros/nc">PG07-R01 NC / TNC / Riesgos / OM</Link> — registro y seguimiento con
              workflow, PDF y Excel. Vínculo desde una queja cuando corresponde.
            </li>
          </ul>

          <h3 style={{ marginTop: 16, fontSize: 16 }}>Auditorías internas (PG04)</h3>
          <p>
            Una auditoría interna (<code>AUD-AAAA-NNNN</code>) concentra programa, plan, informe y checklist
            ISO/IEC 17025. Entrada:{" "}
            <Link to="/calidad/registros/auditorias">/calidad/registros/auditorias</Link>. Exportá PDF y Excel.
          </p>

          <h3 style={{ marginTop: 16, fontSize: 16 }}>Proveedores (PG05)</h3>
          <ul>
            <li>R01 evaluación inicial · R02 listado de habilitados · R03 desempeño.</li>
            <li>
              Pantalla: <Link to="/calidad/registros/proveedores">/calidad/registros/proveedores</Link> (vínculo con
              Directorio).
            </li>
          </ul>

          <h3 style={{ marginTop: 16, fontSize: 16 }}>Personal (PG06)</h3>
          <ul>
            <li>R01 capacitaciones · R02 autorización por método/IT (firma Director Técnico) · R03 competencias · R04 funciones y reemplazos.</li>
            <li>
              Pantalla: <Link to="/calidad/registros/personal">/calidad/registros/personal</Link>.
            </li>
          </ul>

          <h3 style={{ marginTop: 16, fontSize: 16 }}>Revisión por la dirección (PG08)</h3>
          <p>
            <Link to="/calidad/registros/revision-direccion">PG08-R01</Link> — informe anual (
            <code>REV-AAAA-NNNN</code>). Los inputs del SGC (quejas, NC, auditorías, indicadores…) se arman solos; se
            pueden refrescar. PDF + Excel.
          </p>

          <h3 style={{ marginTop: 16, fontSize: 16 }}>Informes y satisfacción (PG09)</h3>
          <ul>
            <li>
              <Link to="/metrologia/informes">PG09-R01</Link> — informe de ensayos (vive en Metrología).
            </li>
            <li>
              <strong>PG09-R02</strong> — enmienda al informe (clon borrador, original sustituido, motivo obligatorio).
            </li>
            <li>
              <Link to="/calidad/registros/encuestas">PG09-R03</Link> — encuesta de satisfacción (
              <code>ENC-AAAA-NNNN</code>), puntajes 1–5, vínculo opcional al informe.
            </li>
          </ul>

          <h3 style={{ marginTop: 16, fontSize: 16 }}>Validación del método (PG11)</h3>
          <p>
            <Link to="/calidad/registros/pg11-r01">PG11-R01</Link> — informe de validación por método/IT con resultado
            (válido / condicional / no válido) y PDF de evidencia.
          </p>
        </Section>

        <Section title="8. Equipos y metrología legal (PG14 + IT)">
          <p>
            Pantalla unificada:{" "}
            <Link to="/calidad/registros/equipos">/calidad/registros/equipos</Link> (pestañas R01–R06 y equipos
            auxiliares).
          </p>
          <ul>
            <li>
              <strong>R04 Listado</strong> — pesas + instrumentos (Metrología) + auxiliares (Calidad). Excel.
            </li>
            <li>
              <strong>R03 Programa de calibraciones</strong> — vencimientos ordenados. Excel.
            </li>
            <li>
              <strong>R02 Etiqueta</strong> — impresión de etiqueta de equipo calibrado (pesas/instrumentos).
            </li>
            <li>
              <strong>R01 Hoja de vida</strong> — historial HV por activo (calibraciones, verificaciones, mantenimientos).
            </li>
            <li>
              <strong>Equipos auxiliares (EQ)</strong> — camión, acoplado, autoelevador.
            </li>
            <li>
              <strong>R05 Verificación intermedia</strong> · <strong>R06 Mantenimiento preventivo</strong> — con PDF.
            </li>
          </ul>
          <p>
            <strong>IT01–IT04</strong> (identificación / ensayos / precintos): vistas vinculadas a Metrología filtradas
            por instrucción técnica, desde el hub o{" "}
            <code>/calidad/registros/it/IT01/r1</code> (y equivalentes).
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            Tip: las pesas se cargan desde certificados PDF en Metrología (importación SIPEL); el listado PG14 las
            consume automáticamente.
          </p>
        </Section>

        <Section title="9. Flujo recomendado del día a día">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12
            }}
          >
            {[
              { n: "1", t: "Documentos", d: "Mantener vigentes MC/PG/IT en el árbol." },
              { n: "2", t: "Operar", d: "Quejas, NC, auditorías, personal, proveedores." },
              { n: "3", t: "Equipos", d: "Calibraciones, etiquetas, HV, verificaciones." },
              { n: "4", t: "Metrología", d: "Informes PG09 e IT desde el vínculo SGC." },
              { n: "5", t: "Revisar", d: "Tablero + revisión por la dirección." }
            ].map((s) => (
              <div key={s.n} className="card pad" style={{ margin: 0 }}>
                <div style={{ fontWeight: 800, color: ACCENT, fontSize: 20 }}>{s.n}</div>
                <strong>{s.t}</strong>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="10. Exportaciones y evidencias">
          <ul>
            <li>
              <strong>PDF de instancia:</strong> formato tipo planilla SGC, con logo y razón social de Configuración de
              empresa.
            </li>
            <li>
              <strong>Excel de listado:</strong> con filtros aplicados en pantalla (útil para auditorías y reportes
              internos).
            </li>
            <li>
              Guardá adjuntos firmados (compromisos, validaciones) en las pantallas Attachment; no reemplazan el
              registro estructurado.
            </li>
          </ul>
        </Section>

        <Section title="11. Buenas prácticas (auditoría)">
          <ul>
            <li>Usá siempre los códigos del listado oficial (PG01): no inventes nomenclatura paralela.</li>
            <li>Plantilla en el árbol ≠ instancia operativa: la instancia se crea en el sistema.</li>
            <li>Antes de una auditoría: revisá tablero (alertas), listas PG01 y vencimientos PG14-R03.</li>
            <li>Modo presentación: ideal para recorrer el SGC en sala con el organismo evaluador.</li>
            <li>
              Cada laboratorio tiene su árbol y firmas; no compartas base ni storage entre empresas.
            </li>
          </ul>
        </Section>

        <Section title="12. Mapa rápido de pantallas">
          <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Ruta</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Tablero", "Alertas y panorama SGC", "/calidad"],
                ["Árbol", "Documentos MC/PG/IT", "/calidad/documentos"],
                ["Hub", "Índice de registros", "/calidad/registros"],
                ["MC01-R01/R02", "Confidencialidad", "/calidad/registros/mc01-r01"],
                ["MC01-R03", "Indicadores", "/calidad/registros/indicadores"],
                ["MC01-R05", "Nota institucional", "/calidad/registros/mc01-r05"],
                ["PG01-R01/R02", "Listas de documentos", "/calidad/registros/pg01-r01"],
                ["PG03-R01", "Quejas", "/calidad/registros/quejas"],
                ["PG04", "Auditorías", "/calidad/registros/auditorias"],
                ["PG05", "Proveedores", "/calidad/registros/proveedores"],
                ["PG06", "Personal", "/calidad/registros/personal"],
                ["PG07-R01", "NC / riesgos / OM", "/calidad/registros/nc"],
                ["PG08-R01", "Revisión dirección", "/calidad/registros/revision-direccion"],
                ["PG09-R01/R02", "Informes de ensayo", "/metrologia/informes"],
                ["PG09-R03", "Encuestas", "/calidad/registros/encuestas"],
                ["PG11-R01", "Validación método", "/calidad/registros/pg11-r01"],
                ["PG14", "Equipos / calib / etiqueta", "/calidad/registros/equipos"],
                ["IT01–IT04", "Linked Metrología", "/calidad/registros/it/IT01/r1"]
              ].map(([code, desc, path]) => (
                <tr key={code}>
                  <td><strong>{code}</strong></td>
                  <td>{desc}</td>
                  <td>
                    <Link to={path}>{path}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </div>
  );
}
