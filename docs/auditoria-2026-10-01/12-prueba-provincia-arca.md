# Prueba: provincia fiscal desde ARCA

## Problema

El padrón puede devolver el nombre de una provincia que el importador anterior no reconocía. En ese caso la pantalla conservaba Santa Fe como valor inicial y podía guardarse un domicilio fiscal incorrecto.

## Prueba en staging

1. Elegir un cliente de prueba con domicilio fiscal en una provincia distinta de Santa Fe, Buenos Aires o CABA (por ejemplo Córdoba o Entre Ríos). No registrar CUIT ni datos personales en la evidencia pública.
2. En su ficha, pulsar **ARCA**. Comprobar que se selecciona la provincia informada por el padrón y que el nombre se lee con espacios y acentos.
3. Guardar y volver a abrir la ficha. Comprobar que la provincia persiste y aparece legible también en el detalle del cliente.
4. Revisar el selector de provincia de una planta: sus etiquetas deben ser legibles, sin cambiar los códigos guardados.
5. Si ARCA devuelve una provincia desconocida, el formulario debe dejar el selector sin provincia y exigir una elección manual antes de guardar el domicilio fiscal.
6. En clientes previamente guardados con Santa Fe por este defecto, volver a consultar ARCA y guardar para corregir el dato; esta entrega no modifica registros existentes automáticamente.

## Verificación técnica

`ArcaProvinceMappingTests` cubre nombres con acentos, nombres compuestos, códigos numéricos y una provincia desconocida. Compilar el frontend y ejecutar la suite CRM antes de publicar.
