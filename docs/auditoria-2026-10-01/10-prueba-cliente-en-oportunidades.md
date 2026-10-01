# CRM · cliente visible en oportunidades

## Problema

Varias oportunidades con el mismo título se ven indistinguibles en el tablero. El cliente solo podía identificarse entrando en cada ficha. La exportación a Excel podía mostrar el identificador del cliente en vez de su nombre.

## Cambio

Cada tarjeta muestra el nombre del cliente debajo del título. La búsqueda del tablero encuentra coincidencias por cliente o por oportunidad. El Excel exporta el nombre del cliente. Se usa el nombre de la oportunidad recibido de la API y, si falta, la ficha de clientes ya cargada por la página. No modifica datos existentes.

## Prueba en staging

1. Abrir CRM → Oportunidades con dos o más oportunidades de igual título y distintos clientes.
2. Verificar que cada tarjeta muestre el cliente correcto sin abrir la ficha. Incluir una oportunidad antigua y una recién creada.
3. Buscar un nombre de cliente. Deben quedar visibles solo sus oportunidades; al borrar el texto deben reaparecer las demás.
4. Buscar una palabra del título y comprobar que el filtro también encuentre la oportunidad.
5. Combinar la búsqueda con prioridad o responsable y comprobar que ambos filtros se respeten.
6. Exportar Excel y verificar que la columna «Cliente» contenga nombres, no UUID.

Validación local: `npm run build` completó correctamente.
