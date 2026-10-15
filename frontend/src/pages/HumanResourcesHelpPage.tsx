import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip } from "../components/help/HelpManual";

const SECTIONS = [
  { id: "para-que", title: "Para qué sirve" },
  { id: "legajo", title: "Alta y legajo de un colaborador" },
  { id: "documentos", title: "Legajo digital: documentos de ingreso y egreso" },
  { id: "epp", title: "Entrega de elementos de protección (EPP)" },
  { id: "organigrama", title: "Organigrama y descripción de puestos" },
  { id: "manuales", title: "Manuales de procedimientos" },
  { id: "sueldos", title: "Sueldos" }
];

/** Ayuda de RRHH: manual de legajos, documentos, EPP, organigrama y manuales; estado de la liquidación. */
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

      <ManualPart id="sueldos" title="7. Sueldos">
        <p style={{ margin: 0 }}>
          La <Link to="/rrhh/liquidaciones">liquidación de sueldos</Link> se está rehaciendo para que cumpla la ley vigente (incluida la Ley
          27.802) y sirva para cualquier convenio. Mientras tanto, los sueldos se liquidan como hasta ahora (estudio contable) y el asiento
          de sueldos del mes se registra en Contabilidad → Cierres y períodos.
        </p>
      </ManualPart>
    </HelpManual>
  );
}
