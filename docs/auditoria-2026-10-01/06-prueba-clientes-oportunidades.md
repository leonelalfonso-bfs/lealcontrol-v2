# CRM · clientes fuera de la primera página

Rama local: `codex/crm-completion` (base `5acf972`). El cambio usa la función paginada `listAllCustomers()` ya existente en el cliente web.

## Problema

La ficha y el embudo de oportunidades llamaban a `listCustomers()`, que solicita solo 50 clientes. Una empresa con más registros puede mostrar «Sin cliente» en la ficha o no ofrecer un cliente válido en el selector.

## Prueba funcional futura en staging

Usar una empresa de prueba con al menos 60 clientes y una oportunidad vinculada al cliente número 60 o posterior.

1. Abrir el embudo y comprobar que el cliente se ofrece al crear una oportunidad.
2. Abrir la ficha de la oportunidad ya vinculada y comprobar que aparece el nombre legal y que el enlace abre la ficha correcta.
3. Cambiar de página o recargar el navegador y confirmar que el nombre permanece.
4. Revisar la pestaña de red: las solicitudes paginadas deben completar y no deben contener credenciales en la URL.

## Límite

La función existente carga todos los clientes por páginas. Para empresas con catálogos muy grandes puede convenir un selector con búsqueda remota; este cambio prioriza corregir la omisión sin crear un contrato nuevo de API.
