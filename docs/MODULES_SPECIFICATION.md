# Especificación Funcional de Módulos 📚

Detalle integral de todos los módulos que componen **Leal Control ERP 2.0**.

---

## 1. Módulo de Directorio (`schema: directory`)
- **Propósito:** Maestro único de entidades comerciales (Clientes, Proveedores, Socios).
- **Tablas:** `Customers`, `CustomerPlants`, `CustomerContacts`, `TaxProfiles`.
- **Características:**
  - Consulta en vivo al Padrón ARCA/AFIP por CUIT con autocompletado de Razón Social, Condición IVA y Domicilio.
  - Validación de dígito verificador de CUIT (módulo 11).
  - Soporte para múltiples plantas / sucursales de entrega por cliente.
  - Gestión de personas de contacto con roles y botón de WhatsApp directo.

---

## 2. Módulo de CRM (`schema: crm`)
- **Propósito:** Gestión del ciclo comercial previo a la venta.
- **Tablas:** `Leads`, `Opportunities`, `Activities`, `Pipelines`.
- **Características:**
  - Embudo de prospectos (leads) con conversión 1-clic a Cliente real.
  - Oportunidades comerciales con etapas configurables, probabilidad de cierre y monto estimado.
  - Timeline unificado de actividades (llamadas, reuniones, notas, correos, WhatsApp).

---

## 3. Módulo de Ventas (`schema: sales`)
- **Propósito:** Cotización, pedidos, despacho físico y facturación fiscal.
- **Tablas:** `Quotes`, `QuoteLines`, `Orders`, `OrderLines`, `Remitos`, `RemitoLines`, `Invoices`, `InvoiceLines`.
- **Características:**
  - Presupuestos multimoneda con cotización en vivo de Dólar Billete y Dólar Divisa (DolarApi BNA).
  - Fotos de producto y especificaciones técnicas incluidas en la propuesta comercial.
  - Modales de alta rápida `[ + ]` para clientes y productos sin salir del formulario.
  - Renglones opcionales y cálculo automático de descuentos e IVA.
  - Generación de Pedidos de Venta y compromiso de stock.
  - Emisión de Remitos oficiales de entrega con código de barras.
  - Facturación Electrónica ARCA (Facturas A, B, C, MiPyME) con CAE y QR reglamentario.

---

## 4. Módulo de Compras (`schema: purchases`)
- **Propósito:** Circuito de abastecimiento y cuentas a pagar.
- **Tablas:** `PurchaseRequests`, `PurchaseOrders`, `PurchaseReceptions`, `PurchaseInvoices`.
- **Características:**
  - Solicitudes internas de compra por sector.
  - Órdenes de compra a proveedores con selector de moneda y condiciones de pago.
  - Recepciones de mercadería en depósito con control de cantidades vs. pedido.
  - Registro de facturas de compra y conciliación con el servicio "Mis Comprobantes" de ARCA.

---

## 5. Módulo de Inventario & Stock (`schema: inventory`)
- **Propósito:** Control físico de existencias y catálogo de productos.
- **Tablas:** `Products`, `Warehouses`, `StockMovements`, `PriceLists`.
- **Características:**
  - Matriz de precios en 3 monedas (ARS, USD Billete, USD Divisa).
  - Clasificación de productos con fotos, descripciones técnicas y marcador para Portal B2B / Catálogo web.
  - Stock multidepósito (Materias Primas, Productos Terminados, Repuestos).
  - Trazabilidad de movimientos (ingresos por compra, salidas por venta, mermas, ajustes).

---

## 6. Módulo de Producción Industrial (`schema: production`)
- **Propósito:** Fabricación, costeo y rendimiento de planta.
- **Tablas:** `ProductionOrders`, `BillsOfMaterial (BOM)`, `WorkCenters`, `Operations`, `Downtimes`.
- **Características:**
  - Estructuras de producto / Listas de materiales multinivel (BOM).
  - Rutas de producción y centros de mecanizado / armado.
  - Órdenes de fabricación con seguimiento de tiempos de parada de máquina.
  - Costeo real de lote y cálculo de eficiencia OEE.

---

## 7. Módulo de Finanzas & Tesorería (`schema: finance`)
- **Propósito:** Flujo de fondos, bancos, valores y cuentas corrientes.
- **Tablas:** `FinancialAccounts`, `Cheques`, `CurrentAccountEntries`, `Receipts`, `CashFlow`.
- **Características:**
  - Cuentas bancarias en ARS y USD con importación de extractos.
  - Cartera integral de eCheqs y cheques físicos (ingreso, depósito, endoso a proveedor, rechazo).
  - Resúmenes de Cuenta Corriente con antigüedad de saldos.
  - Recibos de cobro multimedio (efectivo, transferencias, eCheqs y retenciones IIBB/Ganancias/IVA).
  - Proyección de Cashflow.

---

## 8. Módulo de Recursos Humanos (`schema: hr`)
- **Propósito:** Nómina, legajos 360°, seguridad e higiene y liquidación de sueldos.
- **Tablas:** `Employees`, `PayrollPeriods`, `PayrollSlips`, `PayrollSlipLines`, `EppDeliveries`, `TimeTrackings`.
- **Características:**
  - Legajos 360° con datos personales, CUIL, domicilio, CBU y CCT (*Comercio 130/75, UOM 260/75, UOCRA 76/75, Camioneros, etc.*).
  - Registro de entrega de EPP y Ropa de Trabajo (Res. SRT 299/2011).
  - Motor de liquidación en 1 clic (Básico, Antigüedad, Presentismo, SIPA 11%, INSSJyP 3%, Obra Social 3%, Gremio 2%).
  - Recibo de Sueldo oficial (Art. 140 LCT) con firma digital SHA-256 (Ley 25.506) e impresión limpia en PDF.
  - Exportador oficial a **Libro de Sueldos Digital AFIP / ARCA (F.931)** en formato TXT de 4 registros.
  - Exportador TXT de **Acreditación Bancaria Masiva** para Homebanking corporativo.

---

## 9. Módulo de Gestión de Flota (`schema: fleet`)
- **Propósito:** Parque automotor, cumplimiento legal, mantenimiento y consumo.
- **Tablas:** `Vehicles`, `VehicleDocuments`, `VehicleDrivers`, `VehicleMaintenances`, `VehicleFuelLogs`.
- **Características:**
  - Ficha automotor con patente, chasis VIN, motor y odómetro en KM.
  - Banner con alertas preventivas de **VTV / RTO y Seguros a vencer en los próximos 30 días**.
  - Control de choferes y licencias de conducir habilitantes.
  - Historial de mantenimientos con programación automática del próximo service por kilometraje.
  - Control de tickets de combustible (YPF en Ruta, Shell Flota) con **cálculo de rendimiento en KM / Litro**.

---

## 10. Módulo de Comunicaciones & Configuración (`schema: communications` / `settings`)
- **Propósito:** Bandeja de correo y personalización global.
- **Tablas:** `MailAccounts`, `EmailMessages`, `CompanySettings`, `PrintTemplates`.
- **Características:**
  - Bandeja IMAP/SMTP integrada.
  - Logo institucional en alta resolución para encabezados de documentos y barra lateral.
  - Certificados digitales ARCA (.crt y .key) para facturación electrónica.
  - Plantillas de impresión con términos y garantías configurables.
