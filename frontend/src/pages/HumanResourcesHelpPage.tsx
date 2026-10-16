import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip } from "../components/help/HelpManual";

const SECTIONS = [
  { id: "para-que", title: "Para qué sirve" },
  { id: "legajo", title: "Alta y legajo de un colaborador" },
  { id: "documentos", title: "Legajo digital: documentos de ingreso y egreso" },
  { id: "epp", title: "Entrega de elementos de protección (EPP)" },
  { id: "organigrama", title: "Organigrama y descripción de puestos" },
  { id: "manuales", title: "Manuales de procedimientos" },
  { id: "seguridad-social", title: "Datos de seguridad social del legajo" },
  { id: "configuracion", title: "Configuración de sueldos" },
  { id: "convenios", title: "Convenios colectivos" },
  { id: "sueldos", title: "Liquidación de sueldos" }
];

/** Ayuda de RRHH: manual de legajos, documentos, EPP, organigrama y manuales; y liquidación mensual de sueldos. */
export function HumanResourcesHelpPage() {
  return (
    <HelpManual
      eyebrow="RECURSOS HUMANOS · MANUAL"
      title="Ayuda de RRHH"
      intro="Cómo llevar el legajo de cada colaborador con su documentación, las entregas de elementos de protección, el organigrama con la descripción de cada puesto y los manuales de procedimientos."
      sections={SECTIONS}
      actions={<><Link to="/rrhh/empleados" className="btn">Colaboradores</Link><Link to="/rrhh/organigrama" className="btn btn-outline">Organigrama</Link></>}
    >
      <ManualPart id="para-que" title="1. Para qué sirve">
        <p style={{ margin: 0 }}>
          RRHH guarda todo lo de cada colaborador en un solo lugar: datos personales, contrato y convenio, cuenta bancaria, documentación
          y entregas de EPP. También el organigrama y los manuales de la empresa. Los sueldos de cada persona solo los ve quien tiene el
          permiso de <strong>sueldos</strong>.
        </p>
      </ManualPart>

      <ManualPart id="legajo" title="2. Alta y legajo de un colaborador">
        <Steps>
          <Step title="RRHH → Colaboradores & Legajos → “+ Nuevo Colaborador”." />
          <Step title="“👤 1. Datos Personales”: nombre, DNI, CUIL, fecha de nacimiento, domicilio y contacto de emergencia." />
          <Step title="“💼 2. Contrato & Convenio”: fecha de ingreso, modalidad, puesto, área, convenio, categoría, obra social y sueldo básico." />
          <Step title="“🏦 3. Datos Bancarios”: banco, CBU (22 dígitos) y alias de la cuenta sueldo." />
          <Step title="Guardá. El legajo queda en la lista con su estado (activo, licencia o baja)." />
        </Steps>
      </ManualPart>

      <ManualPart id="documentos" title="3. Legajo digital: documentos de ingreso y egreso">
        <Steps>
          <Step title="En el legajo, “📂 4. Legajo Digital”: subí cada documento en su casillero.">
            Ingreso: CV, DNI, constancia de CUIL, alta temprana, examen preocupacional, cargas de familia, domicilio, títulos, constancia de CBU
            y licencias. Egreso: recibo de liquidación final firmado, certificado de trabajo (art. 80), certificado de servicios y telegrama.
          </Step>
          <Step title="El contador del encabezado muestra cuántos documentos de ingreso están presentados." />
        </Steps>
      </ManualPart>

      <ManualPart id="epp" title="4. Entrega de elementos de protección (EPP)">
        <Steps>
          <Step title="En el legajo, “🛡️ 5. Entrega de EPP” → “+ Registrar Entrega de EPP”: elemento, cantidad, fecha y certificación." />
          <Step title="Cada entrega queda registrada como constancia (Resolución SRT 299/2011)." />
        </Steps>
      </ManualPart>

      <ManualPart id="organigrama" title="5. Organigrama y descripción de puestos">
        <Steps>
          <Step title="RRHH → Organigrama & Puestos → “➕ Nuevo Puesto en Organigrama”.">
            Nombre del puesto, área, a quién reporta, quién lo ocupa y nivel.
          </Step>
          <Step title="Completá la misión, las responsabilidades, los requisitos, las competencias y los indicadores." />
          <Step title="“📄 Ver Descripción” muestra la descripción del puesto lista para imprimir." />
        </Steps>
      </ManualPart>

      <ManualPart id="manuales" title="6. Manuales de procedimientos">
        <Steps>
          <Step title="RRHH → Manuales de Procedimientos → “➕ Nuevo Procedimiento / Instructivo”.">
            Código, título, área, versión, fecha de vigencia, estado (vigente, en revisión u obsoleto) y el documento.
          </Step>
        </Steps>
      </ManualPart>

      <ManualPart id="seguridad-social" title="7. Datos de seguridad social del legajo">
        <p style={{ margin: 0 }}>
          En “💼 2. Contrato & Convenio”, la sección “🏛️ Seguridad social (ARCA)” guarda los datos que pide ARCA en el Libro de Sueldos
          Digital y el F.931. Son códigos de las tablas de ARCA (SICOSS / Declaración en línea); si no sabés alguno, pedíselo al estudio.
        </p>
        <ul style={{ margin: 0, display: "grid", gap: 4 }}>
          <li><strong>Situación de revista:</strong> 1 Activo, o la licencia que corresponda en el mes.</li>
          <li><strong>Condición:</strong> 1 Servicios comunes mayor de 18 años; 2 Jubilado.</li>
          <li><strong>Modalidad de contratación:</strong> 8 a tiempo completo indeterminado; 102 eventual.</li>
          <li><strong>Actividad:</strong> vacía, se usa la de la empresa. <strong>Siniestrado:</strong> 0 si no tiene incapacidad.</li>
          <li><strong>Obra social:</strong> el código de 6 dígitos del RNOS, y los adherentes.</li>
          <li><strong>Familia y jornada:</strong> cónyuge e hijos a cargo, afiliado al sindicato, jornada parcial con sus horas semanales.</li>
        </ul>
        <Tip>El CUIL se controla con su dígito verificador: si no lo acepta, revisá los 11 números.</Tip>
      </ManualPart>

      <ManualPart id="configuracion" title="8. Configuración de sueldos">
        <Steps>
          <Step title="RRHH → Configuración de sueldos → “Empleador”.">
            Indicá si la empresa es MiPyME y si su actividad es de comercio o servicios: de eso salen la contribución patronal (18 % o 20,40 %)
            y el Fondo de Asistencia Laboral desde noviembre de 2026 (2,5 % o 1 %). Completá la ART (alícuota y suma fija), el seguro de vida
            obligatorio y el ID FAL.
          </Step>
          <Step title="“Parámetros legales vigentes”: elegí el mes para ver cada valor, desde cuándo rige y su norma.">
            Los aportes, las contribuciones, la detracción, el FAL y los topes de ANSES los trae el sistema.
          </Step>
          <Step title="Si aparece “Falta el valor de …”, es un tope de ANSES del mes que el sistema todavía no trae: cargalo en “Cargar un valor nuevo” con su resolución." />
        </Steps>
      </ManualPart>

      <ManualPart id="convenios" title="9. Convenios colectivos">
        <p style={{ margin: 0 }}>
          Cada convenio se configura con sus datos: categorías (por grupo), zonas si las tiene, la escala de cada mes y sus reglas
          (adicionales, descuentos sindicales y contribuciones del empleador). Sirve para cualquier convenio; UECARA viene como plantilla.
        </p>
        <Steps>
          <Step title="RRHH → Convenios colectivos → “Cargar UECARA (CCT 660/13)” o “➕ Nuevo convenio”.">
            UECARA trae sus 16 categorías, las zonas I a V, la escala de septiembre de 2026 publicada y sus reglas: antigüedad por año (desde el
            mes siguiente), adicionales por zona desfavorable, títulos, fallo de caja, asistencia perfecta, cuota sindical y aportes solidarios.
            <strong> Verificá la escala contra el acuerdo homologado y un recibo del estudio.</strong>
          </Step>
          <Step title="Escala salarial: elegí el mes y usá “Generar escala del mes” con el aumento del acuerdo (por ejemplo, 1,8 %), o pegá la escala desde una planilla.">
            Para pegar: una fila por categoría y zona, con categoría, zona, básico y, si hay, la suma no remunerativa. Si una fila está mal, no
            se carga nada y se indica cuál corregir. Cada valor queda con su fuente.
          </Step>
          <Step title="Reglas: tipo (adicional, descuento o contribución), cálculo (% del básico, % de la remuneración, monto fijo, por año de antigüedad), a quién aplica (todos, afiliados, no afiliados), zonas, grupos, marca del colaborador y vigencia.">
            Cuando un monto cambia por paritaria, cargá una regla nueva con el mismo código desde el mes del cambio y cerrá la anterior con
            “hasta”. El aporte solidario de los no afiliados no puede pasar del 2 % (Ley 27.802).
          </Step>
          <Step title="Simulador: elegí categoría, zona, antigüedad, afiliación y marcas, y verificá el resultado contra el recibo del estudio." />
          <Step title="En el legajo (“💼 2. Contrato & Convenio” → “📜 Convenio colectivo”): convenio, categoría, zona y los adicionales que dependen del colaborador (título, fallo de caja)." />
        </Steps>
      </ManualPart>

      <ManualPart id="sueldos" title="10. Liquidación de sueldos">
        <p style={{ margin: 0 }}>
          Cada mes se liquida una vez: se cargan las novedades, se calcula, se revisa, se cierra con los datos del último depósito y se
          entregan los recibos para firmar. Requiere la configuración de sueldos (punto 8) y, para los colaboradores en convenio, el convenio
          con la escala del mes (punto 9).
        </p>
        <Steps>
          <Step title="RRHH → Liquidación de Sueldos → elegí el mes y la fecha de pago → “➕ Nueva liquidación”.">
            Hay una sola liquidación mensual por mes. Entran todos los colaboradores que trabajaron en el mes; los que ingresaron o egresaron
            en el mes, por los días trabajados.
          </Step>
          <Step title="Novedades del mes: colaborador, tipo de novedad y cantidad o importe → “Agregar”.">
            Horas extra al 50 % y al 100 % (en horas), inasistencias injustificadas y licencias sin goce (en días, descuentan el sueldo y hacen
            perder la asistencia perfecta), licencias pagas (en días, no descuentan), “pierde la asistencia perfecta”, adelantos, embargos y
            otros haberes o descuentos (en pesos, con detalle).
          </Step>
          <Step title="“🧮 Calcular”.">
            Calcula cada recibo: básico de la escala y adicionales del convenio (o el sueldo del legajo si está fuera de convenio), horas extra
            sobre el valor hora, inasistencias, aportes (jubilación 11 %, Ley 19.032 3 %, obra social 3 %) con los topes de la base, cuota
            sindical y solidarios, adelantos y embargos. También calcula lo del empleador: contribuciones con la detracción, FAL (desde
            noviembre de 2026), obra social 6 %, ART y seguro de vida. Si falta un parámetro legal del mes, no calcula. Si un colaborador
            tiene un error (sin escala del mes, sin sueldo, neto negativo), lo lista y la liquidación no se puede cerrar hasta corregirlo y
            volver a calcular; los avisos (por ejemplo, un embargo mayor al 20 %) no frenan.
          </Step>
          <Step title="Revisá los recibos y los totales. Si cambiás una novedad, volvé a calcular.">
            El total “a pagar por F.931” es aportes más contribuciones, ART y seguro de vida. Compará el primer mes contra el recibo del estudio.
          </Step>
          <Step title="“Cerrar liquidación” con el período, la fecha y el banco del último depósito de aportes.">
            El art. 140 de la LCT exige ese dato en el recibo. Al cerrar, cada recibo queda fijo con su huella (SHA-256): si alguien lo
            modificara después, el recibo lo avisa.
          </Step>
          <Step title="“Recibo” en cada colaborador → “🖨️ Imprimir”: sale original y duplicado.">
            Tiene los datos del empleador (de la configuración de la empresa), del trabajador, el período, los haberes con y sin aportes, los
            descuentos, el neto en números y en letras, el último depósito, la fecha y lugar de pago y las firmas.
          </Step>
          <Step title="Cuando el trabajador firma, “Marcar como firmado” con la fecha de la firma." />
          <Step title="Contabilidad → “🔴 ► CONTABILIZAR” con el módulo Sueldos: la liquidación cerrada genera el asiento AM-SUE-01." />
          <Step title="Para corregir una liquidación cerrada: “Reabrir”.">
            Vuelve a borrador, borra las huellas y firmas, y si ya estaba contabilizada genera el contra-asiento. Se corrige, se calcula, se
            cierra y se contabiliza de nuevo. Un borrador se puede borrar con sus novedades.
          </Step>
        </Steps>
        <Tip>
          Todavía no hacen aguinaldo, vacaciones, liquidación final, Libro de Sueldos Digital ni F.931: vienen en las próximas etapas.
          Hasta entonces, esos conceptos los sigue liquidando el estudio.
        </Tip>
      </ManualPart>
    </HelpManual>
  );
}
