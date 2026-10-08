# Flota y órdenes de servicio: plan (8 de octubre de 2026)

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

### 1b. Avisos diarios por correo

Proceso nocturno por empresa. Manda el resumen de lo vencido y por vencer a los administradores, desde la casilla principal de la empresa. Se diseña genérico, para sumar después licencias, aptos y services.

### 2. Personas, mantenimiento y combustible

- **Técnicos y choferes = empleados de RRHH.** Licencia y categoría, LINTI, carnet de autoelevadorista, apto médico y ART, con vencimientos.
  - La tabla `fleet.VehicleDrivers` de la maqueta se reemplaza por el vínculo con `EmployeeId`.
- **Mantenimiento:** plan por km, horas o fecha, aviso de service próximo e historial con costo. Una unidad en taller no está disponible.
- **Combustible:** cargas, consumo, y costo por km o por hora.

### 3. Órdenes de servicio y agenda

- **Orden de servicio:** sale del pedido o es suelta. Tiene cliente, lugar, descripción, inicio y fin, técnicos, unidades, repuestos usados y trabajo realizado.
- **Control al asignar:** bloquea una unidad o persona que esté vencida o que **venza antes del fin del trabajo**, que esté en taller o que ya esté asignada esos días. Explica el motivo.
- **Agenda semanal:** órdenes, vencimientos, pedidos sin coordinar y órdenes sin fecha.

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

## Estado anterior (antes de 1a)

`src/Modules/Fleet/.../FleetModule.cs` era una maqueta: un solo archivo con entidades, tablas y endpoints que guardaban la entidad recibida sin validar. Las páginas `Fleet*Page.tsx` se rehacen con cada entrega.
