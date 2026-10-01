# Provincia fiscal: evitar Santa Fe por defecto

## Problema y cambio

Un alta o edición enviada directamente a la API con domicilio fiscal, pero sin provincia, terminaba guardando Santa Fe. Ahora la API rechaza ese domicilio parcial y solicita la provincia. Un cliente sin domicilio fiscal sigue siendo válido. El formulario web también muestra un mensaje genérico cuando falta la provincia.

## Prueba funcional en staging

1. Crear un cliente de prueba sin domicilio fiscal: debe guardarse.
2. Completar calle o ciudad fiscal sin elegir provincia: el formulario debe pedir la provincia y no guardar.
3. Elegir Córdoba, guardar y reabrir: la provincia debe persistir.
4. Consultar ARCA en un cliente de prueba fuera de Santa Fe: la provincia importada debe continuar funcionando.

La prueba `PostalAddressTests` cubre el dominio y `CustomerApiTests.Fiscal_address_without_province_is_rejected` confirma la respuesta HTTP. No hay migración ni modificación de clientes existentes.
