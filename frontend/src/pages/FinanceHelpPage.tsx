import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip, Troubleshooting } from "../components/help/HelpManual";

const SECTIONS = [
  { id: "para-que", title: "Para qué sirve y quién puede hacer qué" },
  { id: "puesta-en-marcha", title: "Puesta en marcha (una sola vez)" },
  { id: "cobros", title: "Cobrar a un cliente" },
  { id: "pagos", title: "Pagar a un proveedor" },
  { id: "cheques", title: "Cartera de cheques" },
  { id: "bancos", title: "Bancos, extractos y conceptos" },
  { id: "cuentas", title: "Cuentas corrientes" },
  { id: "cashflow", title: "Disponibilidad y cash flow" },
  { id: "problemas", title: "Cuando el sistema no te deja" }
];

/** Ayuda de Finanzas: manual de instrucciones de cobros, pagos, cheques y bancos. */
export function FinanceHelpPage() {
  return (
    <HelpManual
      eyebrow="FINANZAS · MANUAL"
      title="Ayuda de Finanzas"
      intro="Cómo registrar cobros y pagos, manejar los cheques, importar los extractos del banco y tener al día las cuentas corrientes de clientes y proveedores."
      sections={SECTIONS}
      actions={<><Link to="/finanzas/cobranzas" className="btn">Registrar cobro</Link><Link to="/finanzas/cuenta-corriente" className="btn btn-outline">Cuentas corrientes</Link></>}
    >
      <ManualPart id="para-que" title="1. Para qué sirve y quién puede hacer qué">
        <p style={{ margin: 0 }}>
          Finanzas registra <strong>lo que entra</strong> (recibos de cobro) y <strong>lo que sale</strong> (órdenes de pago), los <strong>cheques</strong> en cartera,
          las <strong>cuentas bancarias y cajas</strong> con sus extractos, y calcula las <strong>cuentas corrientes</strong> y el <strong>cash flow</strong>.
        </p>
        <ul style={{ margin: 0 }}>
          <li>Para entrar a Finanzas hace falta el permiso <strong>Importes y saldos</strong>.</li>
          <li><strong>Cargar</strong>: registra cobros, pagos, cheques y movimientos. <strong>Aprobar</strong>: además anula, deposita cheques y concilia.</li>
        </ul>
      </ManualPart>

      <ManualPart id="puesta-en-marcha" title="2. Puesta en marcha (una sola vez)">
        <Steps>
          <Step title="Cuentas: Finanzas → Disponibilidad → “+ Nueva cuenta”.">
            Una por cada banco, caja, billetera virtual o inversión. Elegí si se lleva <em>con extracto bancario (CSV)</em> o <em>manual</em> (movimientos uno a uno).
          </Step>
          <Step title="Conceptos y reglas: Finanzas → Conceptos y reglas.">
            Los conceptos clasifican cada movimiento (alquiler, sueldos, impuestos…). Las reglas los reconocen solos por el texto del extracto (“contiene”, “comienza con”…).
          </Step>
          <Step title="La cuenta para transferencias que sale en las facturas se elige en Configuración → Cobros y bancos." />
        </Steps>
      </ManualPart>

      <ManualPart id="cobros" title="3. Cobrar a un cliente">
        <Steps>
          <Step title="Desde la factura (“💵 Cobrar”) o en Finanzas → Recibos de cobro.">La pantalla “Registrar cobro” tiene tres preguntas.</Step>
          <Step title="1. ¿Quién pagó? Elegí el cliente." />
          <Step title="2. ¿Cómo pagó? Agregá los medios: transferencia, efectivo, cheque (“+ Cargar un cheque nuevo” o uno ya cargado) y retenciones que te hicieron (Ganancias, Ingresos Brutos…)." />
          <Step title="3. ¿Qué cancela? El importe se aplica solo a las facturas pendientes, en orden; podés ajustarlo a mano o “Volver a aplicar automáticamente”. Lo que sobra queda a cuenta." />
          <Step title="Revisá el resumen y guardá: se emite el recibo y la factura queda cobrada (o con cobro parcial)." />
        </Steps>
        <Tip>
          Si el cliente pagó en dólares, elegí “Pagó en: Dólares” y completá la “Cotización del día” (sugiere la del BNA). Con esa cotización
          Contabilidad lo pasa a pesos y registra la diferencia contra la cotización de la factura.
        </Tip>
        <Tip>Un recibo mal cargado se anula con “Anular recibo” (nivel Aprobar) y la factura vuelve a quedar pendiente.</Tip>
      </ManualPart>

      <ManualPart id="pagos" title="4. Pagar a un proveedor">
        <Steps>
          <Step title="Desde la factura de compra (“💳 Pagar”) o en Finanzas → Órdenes de pago → “💳 + Nueva Orden de Pago”." />
          <Step title="1. Proveedor y fecha." />
          <Step title="2. Facturas a cancelar: marcalas (o “✓ Imputar todas”)." />
          <Step title="3. Medios de pago: “+ Transferencia”, “+ Cheque Propio”, “+ Cheque Cartera” (endosar uno recibido), “+ Efectivo” o “+ Retención” (Ganancias, IIBB, SUSS).">
            Cada transferencia necesita su cuenta y su cartera (concepto de egreso).
          </Step>
          <Step title="4. Resumen: los medios tienen que sumar lo mismo que lo imputado. Guardá e imprimí la orden de pago (“🖨️ Imprimir OP”)." />
        </Steps>
      </ManualPart>

      <ManualPart id="cheques" title="5. Cartera de cheques">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li>Los cheques recibidos en un cobro entran solos a la <Link to="/finanzas/echeqs">Cartera de cheques</Link>. También se pueden importar (“⇧ Importar recibidos / emitidos”).</li>
          <li>Desde la cartera: <strong>Depositar</strong> (elegís la cuenta), <strong>Rechazar</strong> (las facturas que cancelaba vuelven a quedar pendientes y, si estaba depositado, se descuenta de la cuenta con los gastos) o <strong>Anular</strong>. Un cheque de cartera también se usa para pagar a un proveedor.</li>
          <li>Los avisos personales muestran los cheques próximos a depositar.</li>
        </ul>
      </ManualPart>

      <ManualPart id="bancos" title="6. Bancos, extractos y conceptos">
        <Steps>
          <Step title="En Bancos y cajas, abrí la cuenta y tocá “Importar extracto”: elegí el archivo tal como lo bajaste del home banking.">
            Los extractos de <strong>Galicia</strong> (CSV de movimientos), <strong>Santander</strong> (CSV de movimientos) y{" "}
            <strong>BBVA</strong> (Excel “Movimientos.xls”) se reconocen solos, sin mapear columnas. Además de la fecha y el importe, guardan
            la contraparte de cada transferencia (nombre y CUIT) y el código de operación del banco: con el CUIT, el movimiento ya queda
            sugerido para el proveedor o cliente que lo tenga cargado.
          </Step>
          <Step title="Otro banco: la primera vez mapeá las columnas (fecha, descripción, importe o débito/crédito) y guardá el perfil; los próximos extractos se leen solos.">
            Hay una plantilla para descargar si el banco no exporta CSV. Un mismo archivo no se importa dos veces.
          </Step>
          <Step title="Al importar, cada movimiento se clasifica: primero por las reglas de la empresa (Conceptos y reglas) y, si ninguna lo reconoce, por los textos del banco.">
            Se reconocen solos el impuesto a los débitos y créditos, SIRCREB, IVA y percepciones, comisiones e intereses del banco,
            suscripciones y rescates de fondos (FIMA) y acreditación de haberes. Con el CUIT de la transferencia queda sugerido el
            proveedor o cliente.
          </Step>
          <Step title="Finanzas → Conciliación bancaria → elegí la cuenta: aparece cada movimiento del extracto sin vincular con su acción sugerida.">
            <ul style={{ margin: "4px 0 0" }}>
              <li><strong>Conciliar con una orden de pago o un recibo</strong> del sistema: mismo importe, hasta 5 días de diferencia; si hay varios, el del mismo CUIT y la fecha más cercana.</li>
              <li><strong>Paga varias juntas</strong>: una transferencia que cancela de 2 a 5 órdenes de pago (o recibos) del mismo CUIT que suman su importe.</li>
              <li><strong>eCheq</strong>: el débito “Echeq … Nro. N” se vincula con el cheque emitido N de la cartera (cargá antes el listado de eCheq emitidos del home banking en Cartera de cheques).</li>
              <li><strong>Gasto o impuesto del banco</strong>: ya clasificado, solo falta confirmarlo.</li>
              <li><strong>Crear orden de pago / recibo</strong>: el CUIT es de un proveedor o cliente cargado; el botón abre la orden de pago o el recibo con el proveedor, el importe y el movimiento del banco ya elegidos. En la orden de pago quedan propuestas las facturas pendientes que suman el importe (una o hasta cuatro): revisalas antes de guardar.</li>
              <li><strong>Sin identificar</strong>: crear la orden de pago o el recibo a mano, o una regla en Conceptos y reglas para que la próxima vez se reconozca solo.</li>
            </ul>
          </Step>
          <Step title="Revisá las sugerencias tildadas (podés destildar las que no correspondan) y tocá “✓ Confirmar”: se concilian todas juntas." />
        </Steps>
        <Tip>Una cuenta manual se carga con “+ Cargar movimiento”. Una “+ Expectativa manual” anota algo que va a entrar o salir y se empareja sola al importar el extracto.</Tip>
      </ManualPart>

      <ManualPart id="cuentas" title="7. Cuentas corrientes">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><Link to="/finanzas/cuenta-corriente">Cuentas corrientes</Link> calcula el saldo de cada cliente (a cobrar) y proveedor (a pagar), con su detalle de comprobantes, cobros y pagos.</li>
          <li>“Ver cuenta” abre el detalle: desde ahí “Registrar cobro”, “Emitir orden de pago”, “Descargar PDF”, “✉ Email” (estado de cuenta al cliente) o “📥 Descargar Excel”.</li>
          <li>“🔄 Cuentas Mixtas” muestra a quienes son cliente y proveedor a la vez, para compensar.</li>
        </ul>
      </ManualPart>

      <ManualPart id="cashflow" title="8. Disponibilidad y cash flow">
        <p style={{ margin: 0 }}>
          <Link to="/finanzas">Disponibilidad</Link> muestra el saldo de cada cuenta. <Link to="/finanzas/cashflow">Cash flow</Link> proyecta en un calendario
          lo que va a entrar y salir: facturas por cobrar y pagar, cheques y expectativas.
        </p>
      </ManualPart>

      <ManualPart id="problemas" title="9. Cuando el sistema no te deja">
        <Troubleshooting rows={[
          [<>“Los medios de pago (…) no coinciden con el total imputado…”</>, <>Ajustá los medios o las facturas hasta que la diferencia sea cero.</>],
          [<>“Elegí la cartera (concepto) para cada transferencia bancaria vinculada”</>, <>Elegí la cartera de egreso en cada transferencia.</>],
          [<>“Este movimiento ya está conciliado con un recibo u orden de pago. No se puede reclasificar.”</>, <>Es correcto: ese movimiento ya está explicado. Si fue un error, anulá el recibo o la orden de pago.</>],
          [<>“No se reconocieron las columnas…” al importar</>, <>Abrí la cuenta y usá el asistente de mapeo, o la plantilla LealControl.</>],
          [<>“Creá una cuenta bancaria primero” (cheques)</>, <>Creá la cuenta en Disponibilidad → “+ Nueva cuenta”.</>],
          [<>No veo Finanzas en el menú</>, <>Te falta el permiso Importes y saldos (Configuración → Usuarios y permisos).</>]
        ]} />
      </ManualPart>
    </HelpManual>
  );
}
