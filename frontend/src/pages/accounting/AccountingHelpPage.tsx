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
  { id: "reportes", title: "Asientos, Libro Diario, Mayor y Sumas y Saldos" },
  { id: "libros-iva", title: "Libros IVA y Libro IVA Digital de ARCA" },
  { id: "moneda-extranjera", title: "Moneda extranjera y diferencias de cambio" },
  { id: "existencias", title: "Existencias y costo de ventas" },
  { id: "bienes-de-uso", title: "Bienes de uso y amortizaciones" },
  { id: "inflacion", title: "Ajuste por inflación" },
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
      actions={<><Link to="/contabilidad" className="btn">Tablero</Link><Link to="/contabilidad/libro-diario" className="btn btn-outline">Libro Diario</Link></>}
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
          <Step title="“📖 Ver en Libro Diario” abre la lista de asientos con los recién generados." />
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
          <li><strong>AM-VTA-DC-ND y AM-VTA-DC-NC</strong>: notas de débito y crédito por diferencia de cambio (el neto va a diferencia de cambio).</li>
          <li><strong>AM-FIN-01 y AM-FIN-02</strong>: cobros y pagos de Finanzas. El de cobros incluye la diferencia de cambio de los cobros en dólares.</li>
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
          <Step title="Asientos → “➕ Nuevo Asiento Manual”.">Fecha, concepto y tipo: Estándar, Ajuste o Apertura.</Step>
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

      <ManualPart id="reportes" title="8. Asientos, Libro Diario, Mayor y Sumas y Saldos">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><Link to="/contabilidad/asientos">Asientos</Link>: la lista de trabajo, con el origen de cada uno (Ventas, Compras, Finanzas o Manual) y la carga de asientos manuales.</li>
          <li>
            <Link to="/contabilidad/libro-diario">Libro Diario</Link>: los asientos de un período en orden de fecha, con un número de orden correlativo
            que empieza en 1 en cada ejercicio. “🖨️ Imprimir / PDF” lo deja listo para imprimir o guardar, y “📥 Excel” lo exporta.
          </li>
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

      <ManualPart id="moneda-extranjera" title="10. Moneda extranjera y diferencias de cambio">
        <p style={{ margin: 0 }}>
          <strong>El libro va siempre en pesos.</strong> Cada comprobante en dólares se convierte a su cotización y la línea guarda el importe en
          dólares y la cotización, que el Libro Mayor muestra debajo del concepto.
        </p>
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li>
            <strong>Cobro en pesos de una factura en dólares:</strong> la diferencia de cambio se documenta con una nota de débito o crédito
            desde la cuenta corriente del cliente. Esa nota se contabiliza contra Diferencia de Cambio Positiva (4.2.03) o Negativa (5.3.04),
            no contra Ventas.
          </li>
          <li>
            <strong>Cobro en dólares de una factura en dólares:</strong> no lleva nota. Deudores se cancela a la cotización de la factura y la
            diferencia con la cotización del cobro va directo a diferencia de cambio.
          </li>
          <li>
            <strong>Compras en dólares pagadas en pesos:</strong> la diferencia la documenta el proveedor con su nota de débito o crédito, que se
            carga en Compras. Mientras no llegue, queda como saldo en Proveedores.
          </li>
        </ul>
        <Steps>
          <Step title="Para que caja y bancos en dólares se revalúen: en el Plan de Cuentas, esas cuentas van con moneda USD, y en el mapeo cada caja o banco en dólares de Finanzas apunta a su cuenta en USD." />
          <Step title="A fin de mes: Cierres y períodos → “Revaluación de moneda extranjera” → fecha de cierre y cotización de cierre → “👁️ Ver diferencias”.">
            Para cada cuenta en dólares muestra el saldo en dólares, el saldo en pesos en libros, el valor revaluado y la diferencia.
          </Step>
          <Step title="“Registrar asiento de revaluación”: la diferencia va contra diferencia de cambio. Se hace una vez por mes y antes de cerrar el mes con candado." />
        </Steps>
      </ManualPart>

      <ManualPart id="existencias" title="11. Existencias y costo de ventas">
        <p style={{ margin: 0 }}>
          El costo de ventas sale <strong>por diferencia de inventario</strong>. Las compras se contabilizan en “Compras” (5.1.03) y a fin de mes
          se valúa el stock. La cuenta Mercaderías (1.1.04.001) se ajusta a ese valor contra Costo de Mercaderías Vendidas (5.1.01). Así, el costo
          de ventas del mes es Compras + existencia inicial − existencia final.
        </p>
        <Steps>
          <Step title="Cierres y períodos → “Existencias y costo de ventas” → fecha (último día del mes) → “👁️ Valuar existencias”.">
            Muestra cada producto con stock a esa fecha, su costo unitario y su valor. El costo es el precio de la última factura de compra del
            producto (en pesos); si nunca se compró, el costo cargado en el producto.
          </Step>
          <Step title="Si hay productos “Sin costo”, cargales el costo en el catálogo o registrá su compra: mientras tanto valen cero." />
          <Step title="“Registrar ajuste”: una vez por mes, antes de cerrarlo con candado." />
        </Steps>
        <Tip>
          Si un producto solo tiene costo en dólares (sin compras), completá la cotización del dólar para valuarlo. Solo entran los productos
          con control de stock.
        </Tip>
      </ManualPart>

      <ManualPart id="bienes-de-uso" title="12. Bienes de uso y amortizaciones">
        <Steps>
          <Step title="Contabilidad → Bienes de uso → “➕ Nuevo bien”.">
            Código, nombre, fecha de alta, costo, valor residual, vida útil en meses y tipo de bien. El tipo propone la cuenta del bien y la de su
            amortización acumulada (rodados, maquinarias y equipos, instalaciones). El gasto va a Amortización de Bienes de Uso (5.2.08).
          </Step>
          <Step title="El alta del bien no genera asiento: la compra ya se registró en Compras o con un asiento manual. Si entró por Compras, reclasificala a la cuenta del bien con un asiento manual." />
          <Step title="Cada mes, en “Amortización del mes”: último día del mes → “👁️ Calcular” → “Registrar asiento”.">
            La amortización es en línea recta y el mes de alta cuenta entero. Si quedaron meses sin correr, el siguiente los pone al día. Se
            registra una vez por mes.
          </Step>
          <Step title="Cuando el bien se vende o se da de baja: “Baja” con la fecha. Deja de amortizarse después de ese mes.">
            La venta o baja se registra con un asiento manual: se cancelan la cuenta del bien y su amortización acumulada, y la diferencia va a resultados.
          </Step>
        </Steps>
        <Tip>Con amortizaciones registradas, el costo, el valor residual, la vida útil y la fecha de alta ya no se pueden cambiar.</Tip>
      </ManualPart>

      <ManualPart id="inflacion" title="13. Ajuste por inflación">
        <p style={{ margin: 0 }}>
          Reexpresa a moneda de cierre (RT 6, método simplificado) las cuentas <strong>no monetarias</strong>. Cada movimiento se multiplica por
          índice del mes de cierre / índice de su mes, y la diferencia va contra <strong>RECPAM</strong> (4.2.04). Las cuentas monetarias (caja,
          bancos, créditos y deudas) no se ajustan: su pérdida de poder de compra es justamente el RECPAM.
        </p>
        <Steps>
          <Step title="Contabilidad → Ajuste por inflación → “1. Índices FACPCE”: copiá de la planilla de la FACPCE el mes y el valor y pegalos (una fila por mes) → “Guardar índices”.">
            Sirven “2026-03”, “03/2026” y valores con coma o con punto. Hacen falta los índices de todos los meses con movimientos del ejercicio
            (y el del cierre anterior, si el ejercicio anterior está cerrado).
          </Step>
          <Step title="“2. Cuentas no monetarias”: “Marcar las cuentas sugeridas” y revisalas con el contador en el Plan de Cuentas (casilla “Ajusta por inflación”).">
            La sugerencia marca bienes de cambio, bienes de uso, patrimonio neto y resultados, salvo los financieros.
          </Step>
          <Step title="“3. Ajuste del mes”: último día del mes → “👁️ Calcular” → “Registrar asiento”.">
            Muestra por cuenta el saldo histórico, el reexpresado y el ajuste, y el RECPAM. Se puede ajustar todos los meses o solo al cierre del
            ejercicio: cada corrida registra solo lo que falta respecto de los ajustes ya hechos en el ejercicio.
          </Step>
          <Step title="Al cerrar el ejercicio, los saldos ajustados pasan a la apertura: el ejercicio siguiente parte de ellos." />
        </Steps>
        <Tip>Con el ajuste registrado, Sumas y Saldos, el Mayor y el Estado de Resultados quedan en moneda de cierre (moneda homogénea).</Tip>
      </ManualPart>

      <ManualPart id="cierres" title="14. Cierre de meses y de ejercicio">
        <Steps>
          <Step title="Contabilizá el mes completo y revisá Sumas y Saldos." />
          <Step title="Cierres y períodos → elegí el año → “🔒 Cerrar con Candado” en el mes.">
            Con el mes cerrado no se puede cargar, contabilizar ni revertir nada con esa fecha. “🔓 Reabrir Mes” lo vuelve a abrir.
          </Step>
          <Step title="Una sola vez: en “Ejercicios y cierre anual”, elegí el mes en que cierra el ejercicio de la empresa (por ejemplo, diciembre o junio).">
            Se cambia solo mientras no haya ejercicios cerrados.
          </Step>
          <Step title="Terminado el ejercicio, contabilizá todo lo que falte y tocá “Cerrar ejercicio”.">
            El sistema genera tres asientos: la <strong>refundición</strong> (las cuentas de resultado contra Resultado del Ejercicio), el{" "}
            <strong>cierre</strong> (todas las cuentas patrimoniales en cero) y la <strong>apertura</strong> del ejercicio siguiente, al día
            siguiente, con el resultado pasado a Resultados no Asignados. Todos los meses del ejercicio quedan cerrados con candado.
          </Step>
          <Step title="Los ejercicios se cierran en orden, del más viejo al más nuevo, y no se cierra uno que no terminó." />
          <Step title="Para corregir algo de un ejercicio cerrado: “Reabrir” (solo el último cerrado).">
            Borra sus tres asientos de cierre y abre sus meses; después se vuelve a cerrar.
          </Step>
          <Step title="Sueldos: “📝 Contabilizar Asiento de Sueldos y F.931” con los totales de la liquidación del mes.">
            Los importes tienen que cuadrar: brutos más contribuciones igual a netos más cargas a pagar. Por ahora se cargan a mano, con los
            totales del liquidador de sueldos; cuando RRHH liquide los sueldos, el asiento va a salir de ahí.
          </Step>
        </Steps>
      </ManualPart>

      <ManualPart id="problemas" title="15. Cuando el sistema no te deja">
        <Troubleshooting rows={[
          [<>Una factura de venta no aparece al contabilizar</>, <>Solo entran las autorizadas por ARCA y con fecha dentro del período. Si está en borrador, autorizala en Ventas.</>],
          [<>“Sin asiento modelo” en la vista previa</>, <>Ese tipo de comprobante no tiene un modelo activo: activalo o creá uno en Asientos Modelos.</>],
          [<>“Período … cerrado: no se contabiliza”</>, <>El mes del comprobante tiene candado. Reabrilo en Cierres y períodos, contabilizá y volvé a cerrarlo.</>],
          [<>Una venta no aparece en el Libro IVA Ventas</>, <>Solo van las que tienen CAE. Revisá en Ventas que esté autorizada y la fecha del comprobante.</>],
          [<>“… necesita CUIT” al exportar a ARCA</>, <>Una factura de compra no se edita: anulala en Compras (“Anular”) y cargala de nuevo con el CUIT del proveedor o con el tipo correcto.</>],
          [<>“… está en USD y no tiene cotización”</>, <>Es un cobro o pago en dólares cargado sin cotización: anulalo en Finanzas y cargalo de nuevo con la cotización del día.</>],
          [<>“Hay N comprobante(s) del ejercicio sin contabilizar”</>, <>Contabilizá el período del ejercicio (“🔴 ► CONTABILIZAR”) y volvé a cerrar.</>],
          [<>“Ese mes es de un ejercicio cerrado…”</>, <>Los meses de un ejercicio cerrado se abren reabriendo el ejercicio, no de a uno.</>],
          [<>“… ya tiene ajuste de existencias” o “… ya tiene amortización”</>, <>Ese mes ya se registró: buscá el asiento en Asientos (origen Inventory o Depreciation).</>],
          [<>“El bien ya tiene amortizaciones…”</>, <>Solo se pueden cambiar el nombre, las cuentas y las notas. Si el alta estaba mal, dalo de baja y cargalo de nuevo con otro código.</>],
          [<>“Faltan los índices de …”</>, <>Cargá en “Índices FACPCE” los meses que lista y volvé a calcular.</>],
          [<>“… ya tiene ajuste por inflación”</>, <>Ese mes ya se ajustó: el siguiente mes registra la diferencia acumulada.</>],
          [<>“… ya tiene revaluación”</>, <>Ese mes ya se revaluó: buscá el asiento en Asientos (origen Revaluation).</>],
          [<>Un cobro o pago queda con error</>, <>Falta el mapeo de esa caja o banco: Plan de Cuentas → Mapeo cuenta financiera.</>],
          [<>“Asiento desbalanceado” o cuenta inexistente</>, <>Una línea del asiento modelo apunta a una cuenta que no existe o no es imputable: corregila en el modelo.</>],
          [<>“no imputable”, “uno solo” o “desbalanceado” en un asiento manual</>, <>Usá cuentas imputables, un solo lado por línea y que Debe y Haber cuadren.</>]
        ]} />
      </ManualPart>
    </HelpManual>
  );
}
