# LealControl v2: continuidad

Actualizado el 2 de octubre de 2026. Leer este documento primero para continuar. No usar los informes archivados como lista de tareas activa.

## Estado confirmado

El bloque CRM de la [PR #65](https://github.com/leonelalfonso-bfs/lealcontrol-v2/pull/65) fue fusionado en `main` como `54ee304eadcdd8517c78208d454bcf2fee3df93b` y desplegado manualmente desde el VPS en staging y producción.

| Entorno | Carpeta del VPS | Commit desplegado | Evidencia |
| --- | --- | --- | --- |
| Staging: v2.lealcontrol.com | `/opt/lealcontrol-staging` | `75213b54c60e536f0321fd98b5d6fbf7465cda3b` | API y PostgreSQL saludables, web iniciado, 11 checks Healthy; usuario confirmó ficha fiscal, historial y oportunidades |
| Producción: erp.lealcontrol.com | `/opt/lealcontrol-v2` | `54ee304eadcdd8517c78208d454bcf2fee3df93b` | API y PostgreSQL saludables, web iniciado, 11 checks Healthy; falta registrar una confirmación funcional explícita posterior al despliegue |

Los comandos desplegaron por checkout detached del SHA exacto y Docker Compose. No se ejecutaron scripts de borrado de datos ni emisiones de comprobantes ARCA. Los certificados fiscales existentes están en empresas de producción; este bloque CRM no los necesita. El certificado de exclusión de alícuotas es un dato fiscal del cliente, diferente del certificado digital ARCA.

## Qué quedó cerrado

1. Ficha fiscal del cliente: conserva exclusiones de percepción y retención, vencimientos y número de certificado al editar alícuotas. La API valida jurisdicciones y exige ambas banderas. Ruta correcta de la interfaz: **Directorio → Clientes → cliente → Fiscal**.
2. Historial: ya no devuelve una lista vacía ante un fallo persistente de consulta. Reintenta solo tabla o columna ausente; los demás errores se propagan.
3. Oportunidades: mismo tratamiento para lista general, oportunidades por cliente y tablero; se quitó también la captura que ocultaba errores en el handler del cliente.
4. Respuestas PostgreSQL en producción: mensaje genérico ante errores de base de datos, conservando el detalle en los registros del servidor.
5. Workflow manual de staging: despliega el SHA seleccionado, sin ampliar disparadores ni modificar el workflow de producción.

Validación: API sin advertencias ni errores, frontend compilado, 200 pruebas de toda la solución aprobadas en Release y con cobertura, sin omisiones. Distribución: CRM unitarias 21, arquitectura 10, contabilidad 28, comunicaciones 34, QA 9, finanzas 37, calidad 25, CRM integración 36. [CI del commit de la rama](https://github.com/leonelalfonso-bfs/lealcontrol-v2/actions/runs/37023027151) y [CI del merge en main](https://github.com/leonelalfonso-bfs/lealcontrol-v2/actions/runs/37027515570) finalizaron correctamente.

Los informes técnicos 34–38 fueron trasladados al [archivo del bloque publicado](auditoria-2026-10-01/archivo/crm-publicado-2026-10-02/README.md), conservando pruebas y evidencia. `02-cierre-crm.md` conserva la primera tanda y señala que el problema del historial ya está resuelto.

## Pendientes, en orden de continuidad

| Prioridad | Pendiente | Próximo paso verificable |
| --- | --- | --- |
| Alta | Cierre funcional de producción | Registrar verificación de ficha fiscal, historial y oportunidades en ERP; no alterar datos fiscales reales solo para probar |
| Alta | Automatización de despliegues | Configurar acceso SSH por entorno, verificar directorios y probar el workflow en staging antes de volver a usar automatización en producción |
| Alta | Terminar autorización ARCA | Revisar la rama local de preparación, integrarla con main actualizado en una rama aislada y conectar el flujo completo con reserva persistida, envío único y recuperación por consulta |
| Alta | Integridad presupuestos–oportunidad | Revisar el trabajo local `codex/crm-quote-uniqueness`, auditar duplicados con solo lectura y definir el tratamiento antes de añadir una restricción única |
| Alta | Regla comercial de oportunidad ganada | Confirmar si se mantiene la regla actual de generar presupuesto antes de marcar ganada, y documentar el recorrido acordado |
| Media | Cobertura CRM pendiente | Confirmar conversión con/sin oportunidad, etapas, reapertura e historial atómico; ampliar permisos por tenant y vínculos presupuesto–oportunidad |
| Media | Auditoría integral | Continuar módulo por módulo y conservar hallazgos con evidencia, prioridad e instructivo reproducible |
| Baja | Herramientas de CI y frontend | Revisar advertencias de acciones con Node 20, cambio futuro de ubuntu-latest y tamaño de chunks; no mezclar estos cambios con el cierre fiscal |

### ARCA: avance parcial, no dar por terminado

El trabajo está en `codex/arca-preparacion-20261001`, worktree `/home/leonel/Desarrollo-arca-preparacion-20261001`. La última evidencia compartida fue el commit `e32c359`, con 106 pruebas de integración aprobadas en esa rama. Antes de la publicación del bloque CRM estaba 19 commits por delante de la base local `origin/main`; esa cifra no describe su divergencia actual y debe recalcularse.

Ya se prepararon validación local de Factura A de servicios en pesos e IVA 21 %, construcción y análisis SOAP compartidos, transporte sin reintento automático, gateway que conserva credenciales dentro de CRM, QR oficial, reserva transaccional con emisor y ambiente, separación de reserva/envío, conciliación integral y recuperación transaccional por FECompConsultar. Los informes 23–33 pertenecen a ese desarrollo local y no deben archivarse como autorización fiscal terminada.

Falta cerrar la orquestación de autorización y su conexión al handler HTTP, concurrencia y cortes, permisos, estados visibles y pruebas de extremo a extremo. El handler inspeccionado seguía respondiendo ArcaUnavailable; no se confirmó después una conexión completa ni una emisión real. Revisar el estado real antes de modificarlo. No reenviar una solicitud incierta ni reutilizar su número: consultar el mismo comprobante reservado.

El usuario ofreció sus empresas con certificados en producción para una prueba futura. Antes de emitir, definir empresa, ambiente, receptor e importes concretos; no tratar esa oferta como prueba de que ARCA ya está funcionando. La autorización para publicar el bloque CRM no implica mezclar ni publicar automáticamente toda la rama ARCA.

### Despliegues automáticos: falla de configuración

Staging falló en [run 37024919542](https://github.com/leonelalfonso-bfs/lealcontrol-v2/actions/runs/37024919542) y producción en [run 37028213489](https://github.com/leonelalfonso-bfs/lealcontrol-v2/actions/runs/37028213489), ambos por `missing server host`, antes de conectarse al VPS. Estos runs no representan el resultado de los despliegues manuales exitosos.

El workflow espera `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_KEY` y opcional `STAGING_APP_DIR` en staging; en producción, las equivalentes `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`, `PROD_APP_DIR`. Configurar secretos en GitHub, nunca en informes ni chats. No copiar automáticamente secretos de producción a staging.

Existe `staging/metrology-2307`, que impide crear una rama llamada `staging` por conflicto de nombres. Se preservó y el bloque CRM se publicó en `staging/crm-cierre-20261002`. Los disparadores automáticos actuales de Deploy staging todavía esperan la rama exacta `staging`; resolver ese diseño por separado si se quiere automatizar el entorno. El despliegue manual ya usa el commit seleccionado. El merge a main activa CI y después Deploy production.

## Cómo retomar sin repetir trabajo

1. Leer este documento y [el índice de auditoría](auditoria-2026-10-01/README.md).
2. Inspeccionar ramas y worktrees locales y actualizar referencias remotas. Conservar cambios ajenos; no borrar la rama ARCA ni ramas de otros trabajos.
3. Elegir un pendiente concreto de la tabla y revisar su evidencia existente. No repetir correcciones 34–38 ni ejecutar viejos scripts temporales de publicación.
4. Preparar cambios aislados, pruebas apropiadas y un instructivo reproducible. Registrar el resultado aquí o en un informe activo enlazado.
5. Publicar por bloques completos y verificados. Para futuros despliegues, comprobar commit exacto, CI, entorno, cambios locales del VPS y versión anterior; registrar el SHA previo y la revisión funcional.

Los SHA anteriores de staging y producción no fueron incluidos en las salidas compartidas; no inventar una referencia de reversión. Recuperarlos de los registros del VPS antes de necesitarlos. La terminal de esta sesión no puede iniciar procesos; por eso se usaron scripts que el usuario ejecutó en Ubuntu y en el VPS. Los `/tmp/leal-*.sh` son auxiliares de esta sesión, no procedimientos vigentes de operación.

## Estado de las ramas relacionadas

- `main`: contiene el bloque CRM mediante PR #65, merge `54ee304`.
- `staging/crm-cierre-20261002`: rama remota publicada, último commit `75213b5`; conservar mientras sea útil como referencia de staging.
- `codex/crm-cierre-20261002`: checkout local de cierre; no asumir que sigue main después de la fusión.
- `codex/crm-fiscal-rates-20261002`, `codex/crm-timeline-errors-20261002`, `codex/crm-opportunity-errors-20261002`: ramas locales de implementación ya integradas; no volver a fusionarlas ni limpiarlas sin revisar sus cambios.
- `codex/arca-preparacion-20261001`: trabajo fiscal parcial pendiente de revisión e integración; conservar.
- Esta consolidación se publica como cambio exclusivamente documental. Publicarla en GitHub no actualiza el código ejecutado en los servidores ni requiere un nuevo despliegue.
