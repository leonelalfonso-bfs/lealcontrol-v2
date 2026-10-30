import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip, Troubleshooting } from "../../components/help/HelpManual";

const SECTIONS = [
  { id: "para-que", title: "Para qué sirve y quién puede hacer qué" },
  { id: "antes", title: "Antes de empezar" },
  { id: "camionera", title: "Informe de báscula camionera, paso a paso" },
  { id: "resultados", title: "Cómo se calculan los resultados" },
  { id: "emision", title: "Emisión y correcciones" },
  { id: "problemas", title: "Cuando el sistema no te deja" }
];

/** Ayuda de Metrología: manual del informe de calibración de básculas camioneras. */
export function MetrologyHelpPage() {
  return (
    <HelpManual
      eyebrow="METROLOGÍA · MANUAL"
      title="Ayuda de Metrología"
      intro="Cómo cargar un informe de calibración de báscula camionera en campo o en la oficina, y cómo se emite. Los resultados los calcula el sistema: el informe nunca contradice sus datos."
      sections={SECTIONS}
      actions={<><Link to="/metrologia/informes/camionera/nuevo" className="btn">Informe de camionera</Link><Link to="/metrologia/informes" className="btn btn-outline">Informes</Link></>}
    >
      <ManualPart id="para-que" title="1. Para qué sirve y quién puede hacer qué">
        <p style={{ margin: 0 }}>
          BFS emite <strong>informes</strong> de calibración (los certificados los emiten los organismos de certificación; "certificado" solo se usa para
          el de las pesas patrón). El técnico carga el informe en borrador; lo <strong>emite</strong> un responsable técnico (usuario marcado como
          director técnico). Una vez emitido no se edita: se corrige con una enmienda.
        </p>
      </ManualPart>

      <ManualPart id="antes" title="2. Antes de empezar">
        <Steps>
          <Step title="El equipo del cliente cargado en Gestión de Equipos, tipo báscula camionera, con Máx., e, d, clase, apoyos, indicación y norma con la que fue aprobado." />
          <Step title="Las pesas patrón cargadas en Gestión de Pesas Patrón, cada una con su certificado y vencimiento." />
        </Steps>
      </ManualPart>

      <ManualPart id="camionera" title="3. Informe de báscula camionera, paso a paso">
        <Steps>
          <Step title="Metrología → Informe de camionera → elegí el equipo. La norma sale de la ficha (2307/80 o 25/2025) y se puede cambiar.">
            Cargá el número de servicio, remito, pedido, procedimiento, fecha de ensayo (la próxima calibración se propone a un año) y quién lo realizó.
            El número de informe se arma solo: servicio-instrumento (2601-1, 2601-2…).
          </Step>
          <Step title="Patrones: tildá las pesas que usaste. Las vencidas a la fecha del ensayo aparecen en rojo y no permiten emitir." />
          <Step title="Inspección: OK, No OK o N/A en cada punto, con observación si hace falta." />
          <Step title="Pesaje: un renglón por escalón con las pesas, la carga de sustitución si se usó, y las lecturas ascendente y descendente (la descendente es opcional).">
            La carga del escalón es pesas + sustitución. Con la Res. 25/2025 se piden al menos cinco cargas.
          </Step>
          <Step title="Repetibilidad (al menos tres pesadas de la misma carga) y puesta a cero (con 4 % de Máx. sí, con 4 % + 1 e no; E0 en la 25/2025)." />
          <Step title="Excentricidad: pesas sobre cada apoyo, o (Res. 25/2025, básculas de vehículos) el vehículo por tercios, ida y vuelta." />
          <Step title="Movilidad: solo con indicación analógica en la 25/2025; con la 2307/80 se pide siempre." />
          <Step title="“💾 Guardar” cuando quieras: queda en borrador. En el celular, lo tipeado se guarda en el equipo hasta que se guarda en el sistema." />
        </Steps>
        <Tip>La barra de abajo muestra en vivo el resultado (CONFORME / NO CONFORME), cada requisito y los avisos.</Tip>
      </ManualPart>

      <ManualPart id="resultados" title="4. Cómo se calculan los resultados">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li>E.M.T. en servicio, clase III: hasta 500 e ± 1 e; hasta 2000 e ± 2 e; más ± 3 e (clase IIII: 50 e y 200 e).</li>
          <li>Capacidad mínima: 25/2025, 20 e (clase IIII 10 e); 2307/80, según d (10 d, 20 d o 50 d).</li>
          <li>Un ensayo sin datos sale “No ensayado”, nunca “Satisface”. La movilidad con indicación digital en la 25/2025 sale “No aplica”.</li>
          <li>Sustitución (25/2025, 3.7.3): las pesas tienen que ser al menos el 50 % de Máx.; 1/3 si la repetibilidad es ≤ 0,3 e; 1/5 si es ≤ 0,2 e.</li>
          <li>El instrumento es conforme si ningún requisito aplicable da “No satisface” y al menos uno da “Satisface”.</li>
        </ul>
      </ManualPart>

      <ManualPart id="emision" title="5. Emisión y correcciones">
        <Steps>
          <Step title="El responsable técnico abre el informe y toca “✓ Emitir”. Se recalcula todo y queda emitido con su nombre." />
          <Step title="Para corregir un informe emitido: Informes → “Enmendar (PG09 R2)”. El original queda sustituido y la enmienda se carga y emite de nuevo." />
        </Steps>
      </ManualPart>

      <ManualPart id="problemas" title="6. Cuando el sistema no te deja">
        <Troubleshooting rows={[
          ["“Completá en la ficha del equipo la capacidad máxima y la división de verificación”", "Faltan Máx. o e en el equipo: corregilo en Gestión de Equipos."],
          ["“El patrón … venció el …”", "Destildá esa pesa o cargá su certificado nuevo en Pesas Patrón."],
          ["“El informe ya está emitido”", "No se edita: emití una enmienda."],
          ["No aparece “✓ Emitir”", "Solo lo ve un responsable técnico (director técnico) y con el informe ya guardado."]
        ]} />
      </ManualPart>
    </HelpManual>
  );
}
