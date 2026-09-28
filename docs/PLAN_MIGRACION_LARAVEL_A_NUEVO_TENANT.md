# Migración del ERP Laravel a un nuevo tenant

Estado: **ensayo importado en producción al tenant BFS**, 28-09-2026. No se consultó ARCA masivamente ni se cargaron credenciales. Se auditó una copia privada de `tenantbfs`; el informe sin datos personales está en el entorno privado de trabajo. El destino confirmado es `leal_tenant_bfs`, que estaba vacío antes de la carga. Se guardó un respaldo previo en el VPS antes de importar.

El lote preparado por `scripts/migrations/prepare_bfs_crm_import.py` carga en una sola transacción 764 clientes, 1.393 proveedores, 49 ubicaciones y 57 contactos. Mantiene una tabla `legacy_bfs.entities` con IDs antiguos, nuevos IDs y copia del dato original, además de copias de origen de ubicaciones/contactos dentro del esquema `legacy_bfs`. Deja fuera 3 entidades cuya condición IVA no figura en el origen y conserva aparte un contacto de una entidad que solo es proveedora. Hay 16 teléfonos de cliente que no se pueden normalizar al formato actual y 165 domicilios fiscales parciales sin provincia: no se cargan esos campos incompletos en CRM, pero se conserva el valor original para revisión. El SQL generado contiene datos personales y **nunca debe subirse a Git**. La prueba con PostgreSQL aislado concilió los conteos y verificó que una segunda ejecución se rechaza al encontrar datos.

La tabla `crm.suppliers` faltaba en el tenant recién creado porque la migración CRM chocó con `public.tenant_settings` ya existente. El bootstrap la crea de forma idempotente desde `04b8168`; el usuario confirmó que ya está en producción. La migración EF pendiente sigue requiriendo conciliación para eliminar esa advertencia. El segundo lote conservó 118 versiones y 239 renglones completos en `sales.historical_quotes`; se ejecutó en BFS con resultado `118|239`. El usuario aclaró que necesita presupuestos operables. Se preparó un tercer lote que promueve la última revisión de cada una de las **66 familias** a `sales.quotes` (134 renglones); deja las 52 revisiones anteriores en «Historial anterior». Está probado en PostgreSQL aislado, pero **aún no se ejecutó en producción**. Las 50 versiones en borrador serán editables y convertibles a pedido; las 12 ya pedidas y 4 rechazadas conservarán su estado sin habilitar una conversión duplicada. El total del presupuesto normal incluirá IVA; el neto antiguo seguirá en el archivo histórico y en `legacy_bfs.quote_promotions`. Los plazos de entrega en texto pasan a un campo editable que también se traslada al pedido. No se dan de alta productos.

### Estado del ensayo BFS

- [x] Confirmar identidad y vacío de `leal_tenant_bfs`; guardar respaldo previo.
- [x] Auditar una copia privada de `tenantbfs` y preparar lotes transaccionales con guardas de base, vacío y conteos.
- [x] Importar 764 clientes, 1.393 proveedores, 49 ubicaciones y 57 contactos; conservar IDs y datos originales en `legacy_bfs`.
- [x] Importar 118 versiones históricas y 239 renglones, sin productos ni pedidos nuevos.
- [x] Preparar y probar en PostgreSQL aislado la promoción de 66 versiones vigentes y 134 renglones; verificar estados 50/12/4, relaciones, totales netos (máxima diferencia de redondeo: 0,01) y rechazo de una segunda ejecución.
- [ ] Respaldar el BFS ya poblado, desplegar la ampliación del módulo Sales y ejecutar el lote privado de presupuestos operables; conciliar `66|134|52`.
- [ ] Revisar en la interfaz clientes, proveedores, revisiones y PDF de una muestra de presupuestos.
- [ ] Abrir y editar un borrador, comprobar su PDF con IVA y generar un pedido de prueba; verificar que las versiones ya pedidas no generen otro pedido.
- [ ] Resolver 3 entidades sin condición IVA, 16 teléfonos no normalizados y 165 domicilios parciales; revisar 191 CUIT faltantes y 5 grupos de CUIT duplicados.
- [ ] Contrastar datos fiscales con ARCA y corregir la exposición de la clave privada antes de cargar un certificado real.
- [ ] Si el Laravel siguió operando después del respaldo fuente, obtener un respaldo fresco y conciliar las diferencias antes de considerar la migración definitiva.

## Alcance acordado

- Importar clientes, proveedores y presupuestos históricos con sus renglones al **nuevo tenant**.
- Conservar contactos y ubicaciones referenciados por presupuestos. Cargar los productos manualmente después de revisarlos; los renglones históricos mantienen su descripción, cantidad, precio, IVA, descuento, moneda y carácter opcional, sin `ProductId` cuando no exista producto revisado.
- Normalizar CUIT y contrastar datos fiscales con ARCA donde corresponda. No sobrescribir datos comerciales (teléfono, correo, contacto, notas) con datos fiscales. Registrar cambios propuestos, errores y fecha de consulta; revisar conflictos antes de aplicarlos.
- Configurar datos fiscales propios y certificado ARCA del nuevo tenant al momento de la puesta en marcha, tras corregir la exposición de la clave privada descrita abajo.

## Mapa comprobado en código

| Laravel | Sistema actual | Atención |
| --- | --- | --- |
| `entities` (`is_client`, `is_supplier`) | CRM `Customer` y `Supplier` | Un registro puede cumplir ambos roles. Decidir si se crean ambos perfiles vinculados por CUIT; preservar el ID original en un mapa de migración. |
| `entity_contacts`, `entity_locations` | Contactos y ubicaciones de cliente | Migrar antes de presupuestos que los referencian. Los contactos/ubicaciones de entidades que solo son proveedor requieren tratamiento explícito. |
| `quotes` | Sales `Quote` | `client_id` debe mapearse a GUID. Revisiones Laravel usan `parent_id` y empiezan en 0; el modelo nuevo usa revisión 1 y no tiene relación de familia equivalente. |
| `quote_items` | Sales `QuoteLine` | `product_id` es opcional en destino. `detailed_description` puede ir a `TechnicalDetail`; revisar límites de longitud y representación del texto. |
| `products` | Sales `Product` | Fuera de esta importación. Alta manual tras revisión. |

Otros puntos de compatibilidad: normalizar condición IVA y régimen IIBB a los valores que acepta CRM; preservar estados de los presupuestos sin disparar aceptación, pedidos o facturación; resolver números históricos repetidos con una regla visible; comparar totales originales con los recalculados en destino (redondeo, descuento, IVA y monedas); conservar fechas originales. No enviar presupuestos históricos por correo ni recrear pedidos/facturas.

## ARCA y certificado

El sistema actual ya dispone de `Configuración → Certificado ARCA`: ambiente, CUIT firmante, generación de CSR, carga CRT/KEY, diagnóstico de WSAA para `wsfe` y `ws_sr_constancia_inscripcion`, y consulta individual de CUIT para clientes. La consulta devuelve razón social, condición IVA, domicilio fiscal y estado, pero **no** certifica por sí sola IIBB, todos los datos comerciales ni cada campo del ERP anterior. Proveedores no tienen aún un botón/flujo equivalente de enriquecimiento.

**Corrección previa obligatoria para usar credenciales reales:** `CompanySettingsDto` y `MapToDto` incluyen `ArcaCertificateKey`; `GET /api/v1/company/settings` la devuelve al navegador y la pantalla la carga en memoria. Separar lectura pública de escritura sensible: la respuesta debe exponer solo `certificateConfigured`, vigencia/metadatos y nunca el PEM privado. Revisar autorización de lectura/escritura, logs, respaldos y almacenamiento de la clave. La generación de CSR también devuelve la clave como descarga local por diseño; revisar ese flujo antes de utilizarlo con credenciales reales.

La asociación del certificado al servicio de facturación y al padrón debe hacerse en ARCA. Según la documentación oficial, producción usa Administrador de Certificados Digitales y Administrador de Relaciones; la autenticación WSAA requiere vincular el certificado a cada servicio. Facturar además requiere un punto de venta apto para WSFE. Fuentes: https://www.arca.gob.ar/ws/documentacion/certificados.asp , https://www.arca.gob.ar/ws/documentacion/wsaa.asp , https://www.arca.gob.ar/fe/emision-autorizacion/solicitud-autorizacion.asp . Verificar requisitos vigentes el día de la activación.

## Checklist para cuando se decida ejecutar

- [ ] Elegir el nuevo tenant y confirmar que está vacío; guardar backup y fijar ventana de corte del Laravel.
- [ ] Obtener **copia de solo lectura** de la base de datos de origen; relevar conteos, duplicados de CUIT, presupuestos sin cliente, contactos/ubicaciones huérfanos, monedas, estados, revisiones y discrepancias de totales. No copiar `.env`, certificados ni claves al repositorio.
- [ ] Preparar mapeo `legacy_entity_id → customer_id / supplier_id` y `legacy_quote_id → quote_id`, con importación repetible por lotes y `dry-run` que no escriba en el tenant.
- [ ] Definir reglas para CUIT faltante/inválido, entidad cliente+proveedor, estados y revisiones, números duplicados y redondeos; presentar informe de excepciones para revisión.
- [ ] Corregir la exposición de la clave ARCA y probar que ningún endpoint de lectura la devuelve.
- [ ] Importar clientes, proveedores, contactos y ubicaciones; conciliar conteos y relaciones.
- [ ] Consultar ARCA por CUIT válido con cola controlada; guardar propuestas y aplicar solo los cambios fiscales revisados. Agregar soporte equivalente para proveedores. Conservar fecha y resultado de cada consulta.
- [ ] Importar presupuestos y renglones sin alta de productos; conciliar cantidad, cliente, número, fechas, revisiones, estado e importes. Verificar una muestra de PDF contra el ERP anterior.
- [ ] Cargar datos fiscales propios del tenant. Tramitar/cargar certificado en el ambiente correcto y autorizar `wsfe` y `ws_sr_constancia_inscripcion`; ejecutar diagnóstico. Confirmar punto de venta antes de emitir comprobantes reales.
- [ ] Realizar ensayo completo en staging; validar con usuarios; repetir desde un nuevo backup en el tenant definitivo y dejar informe final de conciliación.

## Límites de este análisis

Se inspeccionó el código Laravel local y el repositorio actual. No se inspeccionó una base de datos Laravel con registros reales ni la cuenta ARCA, por lo que todavía no se pueden prometer conteos, calidad de datos, credenciales reutilizables ni una migración sin excepciones.
