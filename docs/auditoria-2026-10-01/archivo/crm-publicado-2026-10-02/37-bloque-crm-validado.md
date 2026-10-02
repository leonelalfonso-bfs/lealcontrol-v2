# Bloque CRM validado localmente

Fecha: 2026-10-02. Rama: `codex/crm-cierre-20261002`. Base: `6d5fd3e`. Código validado: `32e447b`.

## Cambios incluidos

- `5e9b93c`: los errores persistentes del historial se informan como errores; las respuestas de producción usan un mensaje genérico para errores PostgreSQL.
- `3f7ccfa`: los errores persistentes en las consultas de oportunidades se propagan desde el repositorio y desde el handler del cliente.
- `32e447b`: la ficha fiscal conserva exclusiones y sus datos, y la API valida jurisdicciones y campos requeridos.

Los informes 34, 35 y 36 contienen el detalle y las pruebas reproducibles de cada corrección. Este bloque no incorpora el desarrollo fiscal de autorización ARCA de la rama de preparación.

## Validación conjunta

- API: compilación correcta, cero advertencias y cero errores.
- CRM: 21 pruebas unitarias y 36 pruebas de integración aprobadas, sin fallos ni omisiones.
- Frontend: TypeScript y Vite compilados correctamente. Persisten advertencias de tamaño de algunos chunks; no impidieron el build.
- Worktree limpio al finalizar las verificaciones.

## Verificación funcional antes de producción

En staging, con una empresa y un cliente de prueba: abrir la ficha fiscal, editar una alícuota, guardar, recargar y comprobar que las exclusiones y sus datos se conservaron. Comprobar que una jurisdicción inválida recibe una respuesta de validación.

Abrir el historial, las oportunidades del cliente y el tablero; comprobar carga y visualización de registros existentes. Confirmar que una lista sin registros se muestra vacía correctamente. Las pruebas de fallo de esquema se ejecutan exclusivamente en PostgreSQL efímero; no romper el esquema de staging para reproducirlas.

Antes de publicar, comprobar el estado actual de la rama principal, el procedimiento de despliegue y la versión del servidor. Preparar la reversión a la versión anterior según ese procedimiento. Este informe registra validación local; la verificación funcional en staging y el despliegue siguen pendientes.
