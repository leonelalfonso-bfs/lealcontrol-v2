import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip, Troubleshooting } from "../../components/help/HelpManual";

const SECTIONS = [
  { id: "para-que", title: "Para qué sirve y quién puede hacer qué" },
  { id: "preparar", title: "Antes de empezar: plan de cuentas y mapeo" },
  { id: "circuito", title: "El circuito: de la factura al Libro Diario" },
  { id: "contabilizar", title: "Contabilizar un período" },
  { id: "modelos", title: "Asientos modelo" },
  { id: "manuales", title: "Asientos manuales" },
  { id: "anulaciones", title: "Anulaciones y notas de crédito" },
  { id: "reportes", title: "Libro Diario, Mayor y Sumas y Saldos" },
  { id: "libros-iva", title: "Libros IVA y Libro IVA Digital de ARCA" },
  { id: "cierres", title: "Cierre de meses y de ejercicio" },
  { id: "problemas", title: "Cuando el sistema no te deja" }
];

/** Ayuda de Contabilidad: manual del circuito completo, de los comprobantes al cierre. */
export function AccountingHelpPage() {
  return (
    <HelpManual
      eyebrow="CONTABILIDAD · MANUAL"
      title="Ayuda de Contabilidad"
      intro="Cómo pasar lo que la administración carga en Ventas, Compras y Finanzas al Libro Diario, revisarlo y cerrar los períodos. Sirve tanto para el contador de la empresa como para el estudio contable externo."
      sections={SECTIONS}
      actions={<><Link to="/contabilidad" className="btn">Tablero</Link><Link to="/contabilidad/asientos" className="btn btn-outline">Libro Diario</Link></>}
    >
      <ManualPart id="para-que" title="1. Para qué sirve y quién puede hacer qué">
        <p style={{ margin: 0 }}>
          La administración carga los comprobantes en sus módulos y <strong>no asienta nada</strong>. Cuando el contador lo decide, toca{" "}
          <strong>Contabilizar</strong>: el sistema arma los asientos con los <strong>asientos modelo</strong>, los muestra para revisar y recién
          al confirmar los graba en el Libro Diario.
        </p>
        <ul style={{ margin: 0 }}>
          <li><strong>Ver</strong>: consulta el Libro Diario, el Mayor, Sumas y Saldos y los reportes.</li>
          <li><strong>Cargar</strong>: plan de cuentas, asientos modelo y asientos manuales.</li>
          <li><strong>Aprobar</strong>: contabilizar, cerrar y reabrir meses, cierre de ejercicio y asiento de sueldos.</li>
          <li>Contabilidad muestra importes: solo la ve quien tiene el permiso de <strong>importes</strong>.</li>
        </ul>
      </ManualPart>

      <ManualPart id="preparar" title="2. Antes de empezar: plan de cuentas y mapeo">
        <Steps>
          <Step title="Contabilidad → Plan de Cuentas: revisá el plan inicial y adaptalo a la empresa.">
            Solo las cuentas <em>imputables</em> reciben movimientos; las de agrupación suman a sus hijas. Las cuentas que usan los asientos
            modelo de fábrica son: Deudores por Ventas (1.1.02.001), Ventas (4.1.01), IVA Débito Fiscal (2.1.02.001), Percepción de IIBB a pagar
            (2.1.02.005), Compras (5.1.03), IVA Crédito Fiscal (1.1.03.001), Percepciones de IVA (1.1.03.004) e IIBB (1.1.03.002) sufridas,
            Impuestos y Tasas (5.2.09) y Proveedores (2.1.01.001).
          </Step>
          <Step title="En la misma pantalla, “Mapeo cuenta financiera → plan contable”: asigná a cada caja y banco de Finanzas su cuenta contable.">
            Sin ese mapeo, los cobros y pagos de esa caja o banco quedan con error al contabilizar.
          </Step>
        </Steps>
      </ManualPart>

      <ManualPart id="circuito" title="3. El circuito: de la factura al Libro Diario">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><strong>Ventas</strong>: entran las facturas, notas de débito y notas de crédito <strong>autorizadas por ARCA</strong> (con CAE). Los borradores, rechazados y proformas no se contabilizan.</li>
          <li><strong>Compras</strong>: entran las facturas y notas de proveedor registradas (no las anuladas).</li>
          <li><strong>Finanzas</strong>: entran los recibos de cobro y las órdenes de pago.</li>
          <li>
            <strong>Todo en pesos</strong>: un comprobante en dólares se convierte a la cotización del propio comprobante. La moneda, la cotización y el
            total originales quedan guardados como dato del documento.
          </li>
        </ul>
        <Tip>
          La fecha del asiento es la fecha del comprobante, no la del día en que se contabiliza. Por eso podés contabilizar meses anteriores
          (incluso lo cargado antes de usar Contabilidad), siempre que el mes no esté cerrado.
        </Tip>
      </ManualPart>

      <ManualPart id="contabilizar" title="4. Contabilizar un período">
        <Steps>
          <Step title="Contabilidad → Tablero → “🔴 ► CONTABILIZAR”." />
          <Step title="Elegí el período (Hoy, Últ. Semana, Mes Actual o fechas a mano) y los módulos: Ventas, Compras y Finanzas.">
            Lo normal es contabilizar el mes completo antes de cerrarlo.
          </Step>
          <Step title="“👁️ Vista Previa de Asientos →”.">
            El sistema trae los comprobantes del período que todavía no se contabilizaron y muestra cuántos asientos va a generar, las cuentas
            afectadas con su Debe y Haber, y los avisos (por ejemplo, un comprobante sin asiento modelo).
          </Step>
          <Step title="Revisá, marcá “Confirmo que he revisado el balance…” y tocá “🔴 Contabilizar ahora”.">
            Los asientos se graban con número correlativo y el lote queda registrado con tu usuario. Los comprobantes con problemas quedan
            pendientes, con el motivo, y no frenan al resto.
          </Step>
          <Step title="“📖 Ver en Libro Diario” para ver los asientos generados." />
        </Steps>
        <Tip>Contabilizar dos veces el mismo período no duplica nada: cada comprobante se asienta una sola vez.</Tip>
      </ManualPart>

      <ManualPart id="modelos" title="5. Asientos modelo">
        <p style={{ margin: 0 }}>
          En <Link to="/contabilidad/modelos">Asientos Modelos</Link> está, para cada tipo de comprobante, qué cuenta va al Debe y cuál al Haber y
          con qué importe. Los de fábrica son:
        </p>
        <ul style={{ margin: 0 }}>
          <li><strong>AM-VTA-FAC</strong> (facturas y notas de débito de venta): Deudores al Debe; Ventas por alícuota (21, 10,5 y 27 % y exento), IVA Débito y percepción de IIBB al Haber.</li>
          <li><strong>AM-VTA-NC</strong> (notas de crédito de venta): el mismo asiento, invertido.</li>
          <li><strong>AM-CMP-FAC</strong> (facturas y notas de débito de compra): Compras por alícuota, IVA Crédito, percepciones sufridas y otros tributos al Debe; Proveedores al Haber.</li>
          <li><strong>AM-CMP-NC</strong> (notas de crédito de proveedor): el mismo asiento, invertido.</li>
          <li><strong>AM-FIN-01 y AM-FIN-02</strong>: cobros y pagos de Finanzas.</li>
        </ul>
        <Steps>
          <Step title="Para usar otras cuentas (por ejemplo, separar ventas de servicios), entrá al modelo y cambiá la cuenta de la línea.">
            Cada línea tiene una condición: “Siempre” o “si el comprobante tiene ese importe”. Así una factura sin IVA 10,5 % no genera esa línea.
          </Step>
          <Step title="Un modelo “Inactivo” no se usa al contabilizar." />
        </Steps>
        <Tip>Los modelos anteriores (AM-VTA-01/02/03 y AM-CMP-01/02) cubrían solo IVA 21 %: quedaron inactivos al instalarse los nuevos.</Tip>
      </ManualPart>

      <ManualPart id="manuales" title="6. Asientos manuales">
        <Steps>
          <Step title="Libro Diario → “➕ Asiento Manual”.">Fecha, concepto y tipo: Estándar, Ajuste o Apertura.</Step>
          <Step title="Cargá las líneas: cada una con una cuenta imputable y activa, y un importe en el Debe o en el Haber (no en los dos).">
            Debe y Haber tienen que cuadrar al centavo. El asiento queda a nombre del usuario conectado.
          </Step>
        </Steps>
      </ManualPart>

      <ManualPart id="anulaciones" title="7. Anulaciones y notas de crédito">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li>Una venta autorizada por ARCA no se borra: se corrige con una <strong>nota de crédito</strong>, que se contabiliza con AM-VTA-NC.</li>
          <li>
            Si se anula una factura de proveedor que ya estaba contabilizada, el próximo “Contabilizar” de ese período genera el{" "}
            <strong>contra-asiento</strong>. Si todavía no estaba contabilizada, simplemente sale de la cola.
          </li>
          <li>Si el mes del asiento original está cerrado, el contra-asiento no se genera hasta reabrirlo.</li>
        </ul>
      </ManualPart>

      <ManualPart id="reportes" title="8. Libro Diario, Mayor y Sumas y Saldos">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><Link to="/contabilidad/asientos">Libro Diario</Link>: todos los asientos, con su origen (Ventas, Compras, Finanzas o Manual).</li>
          <li><Link to="/contabilidad/mayor">Libro Mayor</Link>: los movimientos y el saldo de una cuenta.</li>
          <li><Link to="/contabilidad/sumas-saldos">Sumas y Saldos</Link>: el balance de 8 columnas.</li>
          <li><Link to="/contabilidad/conciliacion">Conciliación tesorería</Link>: el saldo de cada caja y banco en Finanzas contra su cuenta del mayor.</li>
        </ul>
      </ManualPart>

      <ManualPart id="libros-iva" title="9. Libros IVA y Libro IVA Digital de ARCA">
        <p style={{ margin: 0 }}>
          Los <Link to="/contabilidad/libros-iva">Libros IVA</Link> salen de los <strong>comprobantes</strong>, no de los asientos: Ventas muestra
          lo emitido con CAE y Compras las facturas de proveedor vigentes, aunque todavía no se hayan contabilizado.
        </p>
        <Steps>
          <Step title="Contabilidad → Libros IVA → elegí el mes (por defecto, el anterior).">
            Pestañas Ventas y Compras: neto e IVA por alícuota, exento, percepciones, otros tributos y total, en pesos. Los comprobantes en
            dólares se convierten a su cotización y las notas de crédito restan.
          </Step>
          <Step title="“📥 Excel” descarga el libro que estás viendo, con los totales del mes." />
          <Step title="Si arriba aparece “No se puede exportar a ARCA…”, corregí esos comprobantes.">
            Por ejemplo, una factura A o M de proveedor necesita el CUIT del proveedor: anulala y cargala de nuevo.
          </Step>
          <Step title="“📤 Libro IVA Digital (ARCA)” descarga un .zip con cuatro archivos: comprobantes y alícuotas de ventas, y comprobantes y alícuotas de compras." />
          <Step title="En ARCA: Portal IVA → Libro IVA Digital → el período → Ventas y Compras → importá cada archivo en su lugar.">
            Revisá que ARCA no marque errores y que los totales coincidan con los de la pantalla antes de presentar la declaración.
          </Step>
        </Steps>
        <Tip>Las facturas de proveedor B y C no discriminan IVA: van en el libro, pero no suman crédito fiscal ni llevan registro de alícuotas.</Tip>
      </ManualPart>

      <ManualPart id="cierres" title="10. Cierre de meses y de ejercicio">
        <Steps>
          <Step title="Contabilizá el mes completo y revisá Sumas y Saldos." />
          <Step title="Cierres y períodos → elegí el año → “🔒 Cerrar con Candado” en el mes.">
            Con el mes cerrado no se puede cargar, contabilizar ni revertir nada con esa fecha. “🔓 Reabrir Mes” lo vuelve a abrir.
          </Step>
          <Step title="Al terminar el ejercicio: “⚡ Ejecutar Asiento de Refundición de Resultados”.">
            Cancela las cuentas de resultado contra el resultado del ejercicio. Se puede ejecutar una sola vez por año.
          </Step>
          <Step title="Sueldos: “📝 Contabilizar Asiento de Sueldos y F.931” con los totales de la liquidación.">
            Los importes tienen que cuadrar: brutos más contribuciones igual a netos más cargas a pagar.
          </Step>
        </Steps>
      </ManualPart>

      <ManualPart id="problemas" title="11. Cuando el sistema no te deja">
        <Troubleshooting rows={[
          [<>Una factura de venta no aparece al contabilizar</>, <>Solo entran las autorizadas por ARCA y con fecha dentro del período. Si está en borrador, autorizala en Ventas.</>],
          [<>“Sin asiento modelo” en la vista previa</>, <>Ese tipo de comprobante no tiene un modelo activo: activalo o creá uno en Asientos Modelos.</>],
          [<>“Período … cerrado: no se contabiliza”</>, <>El mes del comprobante tiene candado. Reabrilo en Cierres y períodos, contabilizá y volvé a cerrarlo.</>],
          [<>Una venta no aparece en el Libro IVA Ventas</>, <>Solo van las que tienen CAE. Revisá en Ventas que esté autorizada y la fecha del comprobante.</>],
          [<>“… necesita CUIT” al exportar a ARCA</>, <>Una factura de compra no se edita: anulala en Compras (“Anular”) y cargala de nuevo con el CUIT del proveedor o con el tipo correcto.</>],
          [<>Un cobro o pago queda con error</>, <>Falta el mapeo de esa caja o banco: Plan de Cuentas → Mapeo cuenta financiera.</>],
          [<>“Asiento desbalanceado” o cuenta inexistente</>, <>Una línea del asiento modelo apunta a una cuenta que no existe o no es imputable: corregila en el modelo.</>],
          [<>“no imputable”, “uno solo” o “desbalanceado” en un asiento manual</>, <>Usá cuentas imputables, un solo lado por línea y que Debe y Haber cuadren.</>]
        ]} />
      </ManualPart>
    </HelpManual>
  );
}
