# Permisos personalizados y avisos personales: plan (8 de octubre de 2026)

Prioridad acordada con el dueño: **permisos primero**, porque hacen falta desde el día 1 para vender. Después, avisos personales. Flota queda pausada en el punto exacto descripto al final.

## Objetivo

- Cada persona ve y hace **solo lo que le corresponde**. Por ejemplo, RRHH no ve finanzas y un técnico no ve precios.
- Cada persona recibe **solo sus avisos**, en un único resumen diario, en lugar de llenarle la casilla al dueño.

## Cómo está hoy (8/10/2026)

- **Roles fijos** (`Admin`, `Comercial`, `Contador`, `Compras`, `Calidad`, `Técnico`, `Tesorero`, `DirectorTecnico`) y políticas `Require*` en `Program.cs`. Se usan en unos 25 endpoints de 530.
- **Módulos por usuario** (`tenant_users.AllowedModulesJson`, claim `allowed_modules`):
  - `ContractedModuleMiddleware` bloquea por prefijo de ruta (`ContractedModuleMap`);
  - el frontend arma el menú con `resolveAllowedModuleIds`.
- **Problemas:**
  - **Sin niveles:** quien entra a un módulo puede hacer todo.
  - **Sin datos sensibles:** importes, costos y sueldos son visibles para cualquiera con acceso al módulo.
  - **Agujero:** un usuario **sin módulos asignados ve todo** (`allowedModules.Count == 0 → pasa`).
  - Los permisos viajan en el token: un cambio recién aplica cuando el usuario vuelve a iniciar sesión.

## Diseño

### Niveles por módulo

| Nivel | Puede |
|---|---|
| Sin acceso | No ve el módulo |
| Ver | Consultar y exportar |
| Cargar | Crear y editar borradores |
| Aprobar | Acciones que comprometen: autorizar en ARCA, anular, confirmar cobros o pagos, cerrar períodos |
| Administrar | Configuración del módulo |

Cada nivel incluye a los anteriores.

### Permisos sensibles (aparte de los niveles)

- **Importes y saldos:** cuentas corrientes, cobranzas, finanzas, totales en el tablero "Hoy".
- **Costos y márgenes:** costo de productos, producción, precios de compra.
- **Sueldos:** liquidaciones y datos salariales de RRHH.

### Perfiles

- Un perfil es una plantilla: una matriz de módulo × nivel más los permisos sensibles.
- **Perfiles de fábrica**, editables o copiables: Dueño, Administración, Ventas, Compras, RRHH, Técnico y Solo lectura.
- **Usuario = perfil + excepciones propias.** Ejemplo: "Técnico, pero con Flota en Cargar".
- Pantalla **"Qué puede hacer"** por usuario, para revisar antes de dar acceso.

## Etapas

### P1. Modelo y pantallas

- **Tablas por empresa:**
  - `public.permission_profiles`: nombre, descripción, de fábrica, matriz y sensibles;
  - `tenant_users`: `ProfileId` y `OverridesJson`.
- **Migración sin cambios de acceso:** cada usuario actual recibe un perfil equivalente a su rol y sus módulos de hoy. Lo único que cambia es que **se cierra el agujero** del usuario sin módulos.
- **Configuración → Usuarios y permisos:** pestaña Perfiles (matriz) y, por usuario, perfil, excepciones y "qué puede hacer".

### P2. Control en el servidor y en las pantallas

- **Middleware de permisos:**
  - el módulo sale de la ruta (se extiende `ContractedModuleMap` a todos los módulos);
  - el nivel por defecto sale del método: GET → Ver; POST, PUT y PATCH → Cargar; DELETE → Cargar;
  - las acciones de **Aprobar** y **Administrar** se marcan en cada endpoint (`.RequireLevel("sales", Approve)`).
- **Permisos leídos de la base** con caché corta (≈1 minuto): un cambio aplica sin volver a iniciar sesión.
- **Frontend:** un hook `usePermission(módulo, nivel)`. Menús y botones se muestran según el nivel, sin botones que después den "403".
- **Pruebas:** una matriz de perfiles × endpoints representativos (ver, cargar, aprobar).

### P3. Datos sensibles

- **El servidor no envía** los campos sensibles a quien no tiene el permiso: no se ocultan solo en la pantalla.
- **Inventario por área:**
  - importes: Finanzas, cuentas corrientes, Hoy;
  - costos: productos, producción, compras;
  - sueldos: liquidaciones de RRHH.
- Las pantallas muestran "—" o esconden la columna.

### A1. Avisos personales

- **Catálogo de avisos.** Cada uno tiene módulo, nivel mínimo y sensibles que exige. Ejemplos:
  - Flota: vencimientos de unidades (ya existe: `DailyNoticeSender`, nota 64);
  - Finanzas: facturas vencidas sin cobrar y cheques a depositar;
  - Ventas: presupuestos por vencer y oportunidades sin seguimiento;
  - RRHH: aptos y licencias;
  - Calidad: calibraciones.
- **"Mi perfil → Mis avisos":** cada persona elige entre los avisos que su perfil le permite. El perfil trae unos por defecto.
- **Un correo por día y por persona**, agrupado por módulo, más la **campanita** y "Hoy".
- **Reemplaza al aviso de Flota por empresa** (`DailyNotices:Enabled`, apagado en producción desde el 8/10/2026) y a la PR #97 (destinatarios por empresa), que no se fusiona.

### A2. Quién envía

Pendiente de decisión del dueño:
- **Recomendada: casilla del sistema.** `avisos@lealcontrol.com`, a nombre de "LealControl · {empresa}", por un servicio transaccional (Brevo o Resend), con respuesta a la empresa. Requiere SPF/DKIM en lealcontrol.com.
- **Alternativa:** casilla de avisos configurada por cada empresa.
- **Descartado:** casilla por usuario. Son credenciales por persona y mucho soporte.

## Flota: dónde quedó (ver nota 64)

- **Hecho:**
  - 1a: unidades, lecturas y vencimientos (#95);
  - 1b: aviso diario por empresa (#96). **Apagado en producción** (`DAILY_NOTICES_ENABLED=false`) hasta A1.
- **Siguiente, después de permisos y avisos:**
  - **2:** personas de RRHH con licencias, LINTI, carnet y apto; mantenimiento por km, horas o fecha; combustible;
  - **3:** órdenes de servicio y agenda.

  Sus avisos (licencias, services) nacen dentro del catálogo de A1.

## Orden

**P1 → P2 → P3 → A1 → A2 → Flota 2 → Flota 3.**
