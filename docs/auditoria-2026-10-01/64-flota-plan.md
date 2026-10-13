# Flota y órdenes de servicio: plan (8 de octubre de 2026)

> **Retomado el 13/10/2026** después de los permisos y los avisos personales ([65](65-permisos-y-avisos-plan.md)). El aviso diario por empresa (1b) fue reemplazado por los avisos personales.

## Objetivo

1. Controlar las unidades y las personas que las usan.
2. Asignarlas a trabajos (órdenes de servicio) **sin programar nunca un trabajo con algo vencido**, en taller u ocupado.

Tiene que servir para BFS (5 camionetas, 2 camiones con semirremolque y 3 autoelevadores; camión, semi y autoelevador forman un equipo que rota) y crecer hasta una empresa de transporte.

## Circuito (igual al del sistema anterior)

**Pedido de venta** (por ejemplo, 10 servicios) → **remitos** (uno por servicio, para firmar) → **órdenes de servicio** (una por servicio). Cada orden de servicio tiene:
- técnico o técnicos;
- unidad o unidades;
- fecha y hora de inicio y fin.

Todo eso arma la **agenda**, con alarmas.

## Sistema anterior (referencia)

Repo `leonelalfonso-bfs/lealcontrolerp` (Laravel), todavía montado en el servidor.

- **`work_orders`** tiene:
  - `order_id` (opcional), `client_id`;
  - estado: `assigned`, `in_progress`, `completed` o `cancelled`;
  - problema, trabajo realizado y observaciones;
  - `scheduled_date`, `scheduled_end_date` y `scheduled_time`;
  - firmas del técnico y del cliente (`*_signature_path`, `*_signed_at`, `client_signer_name`).
- **Tablas relacionadas:**
  - `work_order_employees` (técnicos);
  - `work_order_vehicles` (unidades);
  - `work_order_items` (repuestos con número de serie y "usado");
  - `work_order_equipments` (equipos del cliente, vinculados a Calidad y Metrología).
- **`AgendaController`**: semana con órdenes, técnicos y patentes, vencimientos de flota (VTV, seguro, matafuego, RUTA), seguimientos de CRM, pedidos sin coordinar y órdenes sin fecha.
- **`WorkOrderMobileService`**: carga desde el celular y firmas.

## Entregas

### 1a. Unidades y vencimientos (hecha, PR "Flota 1a")

- **Unidades:**
  - tipos: camioneta, utilitario, camión, auto, autoelevador, semirremolque, tractor, acoplado y otro;
  - identificación: patente o código interno (los autoelevadores no tienen patente), únicos por empresa;
  - medición: km, horas o ambas;
  - estado: disponible, en taller, fuera de servicio o dada de baja.
- **Lecturas de km y horas** con historial. **No pueden bajar**: si hay que corregir un error, queda registrado como corrección.
- **Vencimientos por unidad:** VTV/RTO, seguro, RUTA, matafuego, habilitación de autoelevador, cédula, GNC, SENASA y otro.
  - Cada uno tiene número, emisor, fecha de vencimiento y días de aviso.
  - Cargar uno nuevo del mismo tipo **renueva** el anterior: solo cuenta el vigente.
- **Panel de vencimientos:** vencidos, por vencer (dentro de los días de aviso) y **faltantes**.
  - Faltantes en unidades de ruta: VTV y seguro.
  - Faltantes en autoelevadores: habilitación.
- **Validaciones en el servidor:** se acabó "guardar lo que llega".

### 1b. Avisos diarios por correo (hecha, PR "Flota 1b")

Proceso nocturno por empresa. Manda el resumen de lo vencido y por vencer a los administradores, desde la casilla principal de la empresa. Se diseña genérico, para sumar después licencias, aptos y services.

### 2. Personas, mantenimiento y combustible

- **Técnicos y choferes = empleados de RRHH.** Licencia y categoría, LINTI, carnet de autoelevadorista, apto médico y ART, con vencimientos.
  - La tabla `fleet.VehicleDrivers` de la maqueta se reemplaza por el vínculo con `EmployeeId`.
- **Mantenimiento:** plan por km, horas o fecha, aviso de service próximo e historial con costo. Una unidad en taller no está disponible.
- **Combustible:** cargas, consumo, y costo por km o por hora.

### 2a. Personas (hecha, PR "Flota 2a")

- **Flota → Personas** (`FleetPeople.cs`): empleados de RRHH sumados a la flota. Se leen de `hr."Employees"`, sin duplicarlos. Tabla `fleet."Members"`, con los roles chofer, chofer de cargas, autoelevadorista y técnico.
- **Credenciales** (`fleet."PersonCredentials"`): licencia (con categoría), LINTI, carnet de autoelevadorista, apto médico y otra.
  - Renovar y borrar funcionan igual que con los documentos de las unidades.
  - **Obligatorias por rol:** chofer → licencia; chofer de cargas → licencia y LINTI; autoelevadorista → carnet.
- Los empleados no activos en RRHH no se controlan.
- **Aviso nuevo:** `fleet.people-credentials` (`FleetPeopleNotices`).
- **Pruebas:** `FleetPeopleApiTests`.

### 2b. Mantenimiento y combustible (hecha, PR "Flota 2b")

- **Plan de mantenimiento** (`FleetMaintenance.cs`, tabla `fleet."MaintenancePlans"`):
  - Cada ítem tiene frecuencia por km, horas o días; vence por lo que llegue primero.
  - Tiene márgenes de aviso (km, horas y días) y un **punto de partida** ("último hecho": fecha y lectura).
  - El último hecho **se calcula**: es el último trabajo completado que incluye el ítem (`VehicleMaintenances.PlanIds`, `uuid[]`). Si no hay ninguno, cuenta desde el punto de partida. Por eso borrar un trabajo equivocado no rompe el plan.
  - Quitar un ítem lo da de baja (`IsActive`); no lo borra.
- **Taller** (`fleet."VehicleMaintenances"`, ahora validado):
  - Estados: programado, en taller, hecho y cancelado.
  - **En taller** pone la unidad en `InMaintenance`. Cuando no queda ninguno en curso, vuelve a `Active`.
  - Un trabajo hecho exige los km u horas si cumple ítems del plan. Además, actualiza la lectura de la unidad si es mayor.
  - Quien no ve costos no puede pisar el costo al editar.
- **Combustible** (`FleetFuel.cs`):
  - Cada carga se asocia a la unidad, a la persona de la flota (`EmployeeId`) y a la lectura (km u horas, obligatoria según la medición).
  - Los km no pueden ser menores que los de una carga anterior.
  - Se informa litros más precio por litro o total del ticket.
  - Consumo: km/l desde la carga anterior, o l/h. Se recalcula al borrar o al cargar con fecha atrasada.
  - La carga también es una lectura de la unidad.
- **Costos** (`GET /fleet/costs?from&to`): combustible, taller y vencimientos (por fecha de emisión) por unidad, con costo por km o por hora y consumo del período.
  - Pantalla "Costos por unidad".
  - Permisos: `/api/v1/fleet/costs` es área de **costos**. En el resto de Flota se ocultan `totalCost`, `pricePerLiter` y `cost` a quien no tiene el permiso.
- **Aviso nuevo** `fleet.services` (`FleetServiceNotices`).
- **Pantallas:**
  - Mantenimiento (panel);
  - en la ficha de la unidad, "Plan de mantenimiento" y "Taller" (`components/fleet/VehicleMaintenanceSection.tsx`);
  - Combustible (rehecha);
  - Costos por unidad;
  - Ayuda.
- **Fuera de servicio:** los endpoints de la maqueta `/drivers` y `/maintenances` (sin validar). La tabla `fleet."VehicleDrivers"` queda sin uso.
- **Pruebas:** `FleetMaintenanceApiTests`.

### 3. Órdenes de servicio y agenda (hecha, PR "Flota 3")

- **Órdenes de servicio** (`FleetServiceOrders.cs`, tabla `fleet."ServiceOrders"`):
  - número correlativo por empresa (`OS-00001`);
  - cliente (de `crm.customers` o texto) o pedido de venta (`sales.orders`, que se lee por SQL sin depender de Ventas);
  - lugar, descripción, inicio y fin (instantes; la pantalla trabaja en hora de Argentina);
  - personas (`EmployeeIds`) y unidades (`VehicleIds`) como `uuid[]`.
- **Estados:**
  - sin fecha (Pending) y programada (Scheduled) se deciden solos según haya fechas;
  - en curso, terminada (con el trabajo realizado) y cancelada se pasan con acciones.
  - Una orden terminada o cancelada no se edita.
- **Control al asignar** (`Snapshot`): carga todo una vez y evalúa cada persona o unidad para el horario.
  - **Bloquea:**
    - dada de baja, fuera de servicio o en taller;
    - documentación o credencial obligatoria sin cargar;
    - un vencimiento **anterior al día de fin** (vale hasta el día que vence);
    - taller programado entre el inicio y el fin;
    - otra orden programada o en curso que se superpone;
    - una persona que no está en la flota o no está activa en RRHH.
  - **Avisa sin bloquear:** service del plan vencido.
  - Sin fecha no controla horario, pero sí que existan.
- **Problemas posteriores:** las órdenes programadas recalculan sus problemas al verse (`problems`). El aviso nuevo `fleet.service-orders` cubre los próximos 15 días.
- **Endpoints:**
  - `GET/POST/PUT /fleet/service-orders`;
  - `/{id}/start`, `/{id}/complete`, `/{id}/cancel`;
  - `/service-orders/availability?start&end&excludeId`;
  - `/service-orders/customers`, `/service-orders/sales-orders`;
  - `/fleet/agenda?from&days`: órdenes, vencimientos de unidades y personas, taller, órdenes sin fecha y pedidos sin coordinar.
- **Pantallas:** Agenda semanal, Órdenes de servicio y la ficha de la orden (disponibilidad en vivo al elegir horario).
- **Pruebas:** `FleetServiceOrdersApiTests`.
- **Queda para después:**
  - remito por servicio;
  - repuestos usados;
  - firmas desde el celular;
  - equipos del cliente (Calidad y Metrología);
  - informe en PDF.

### Más adelante

- Firmas del técnico y del cliente desde el celular.
- Equipos del cliente (Calidad y Metrología).
- Informe de servicio en PDF.
- Costos por unidad en contabilidad.

## Cómo quedó 1a (código)

- Backend `src/Modules/Fleet/LealControl.Modules.Fleet.Infrastructure/`:
  - `FleetEntities.cs` (enumeraciones; los valores solo se agregan al final porque se guardan como número);
  - `FleetRules.cs` (validaciones, documentación obligatoria y estado de cada vencimiento, con el día de Argentina);
  - `FleetDbContext.cs` (tabla nueva `VehicleMeterReadings`, columnas `InternalCode` y `MeterType`, índices únicos de patente y código);
  - `FleetModule.cs` (endpoints).
- **Endpoints:**
  - `GET/POST/PUT /api/v1/fleet/vehicles`;
  - `GET/POST /vehicles/{id}/readings`;
  - `GET/POST /vehicles/{id}/documents`;
  - `PUT/DELETE /documents/{id}`;
  - `GET /expirations`.
  - Las enumeraciones viajan como texto ("Pickup", "DueSoon").
- **Frontend:** `FleetVehiclesListPage` (unidades con el panel de vencimientos), `FleetVehicleFormPage` (ficha con datos, vencimientos y lecturas) y `lib/fleet.ts` (etiquetas y reglas).
- **Pruebas:** `tests/LealControl.Modules.Crm.IntegrationTests/FleetApiTests.cs`.
- **Quedan de la maqueta, para la entrega 2:** los endpoints de choferes, mantenimientos y combustible, y la página de combustible.

## Cómo quedó 1b (código)

- **`src/Host/LealControl.Api/Notices/DailyNotices.cs`.** Vive en el host porque une Flota (qué avisar) con Comunicaciones (cómo enviarlo).
  - **`DailyNoticeSender`** arma el resumen de vencidos, sin cargar y por vencer. Lo envía desde la casilla principal activa de la empresa a los administradores activos (`public.tenant_users` con rol Admin).
  - Registra el resultado en `public.daily_notices` (`Kind`, `Day`), en la base de cada empresa. Reserva el día antes de enviar, así dos procesos no mandan dos correos.
  - Si no hay novedades, no envía, pero lo registra.
  - **`DailyNoticesBackgroundService`** corre cada 10 minutos. Desde las 7 de Argentina, envía una vez por día a cada empresa activa.
  - **Endpoints (solo administradores):**
    - `GET /api/v1/notices/daily/fleet`: vista previa (casilla, destinatarios, cantidades, último resultado);
    - `POST /api/v1/notices/daily/fleet/send-now`: envía ya, aunque ya haya salido.
- **Configuración** `DailyNotices:Enabled` (`DAILY_NOTICES_ENABLED`): en producción viene encendido; en staging, apagado, para no duplicar correos.
- **Pantalla Unidades:** recuadro "Aviso diario por correo" con el botón "Enviar ahora".
- **Pruebas:** `DailyNoticesApiTests`.
- **Para sumar más avisos** (licencias, aptos, services): agregar otro `Kind` y su armado en `DailyNoticeSender`.

## Estado anterior (antes de 1a)

`src/Modules/Fleet/.../FleetModule.cs` era una maqueta: un solo archivo con entidades, tablas y endpoints que guardaban la entidad recibida sin validar. Las páginas `Fleet*Page.tsx` se rehacen con cada entrega.
