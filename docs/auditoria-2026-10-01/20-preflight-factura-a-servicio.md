# Preparación local de Factura A por servicios

El primer caso fiscal se restringe a Factura A, servicio, ARS, receptor Responsable Inscripto con CUIT válido e ítems al 21%. La validación local produce los campos necesarios para WSFEv1: tipo 1, concepto 2, documento tipo 80, condición IVA receptor 1, alícuota 5, fechas y montos. Comprueba `total = neto + IVA` y precisión de dos decimales. No reserva número, consulta ni solicita CAE.

Prueba reproducible: construir un borrador con 1 unidad a $0,83 netos y 21% de IVA; debe preparar $0,83 netos, $0,17 de IVA y $1,00 total. Repetir con CUIT inválido, otro tipo de factura, otra moneda, fechas incompletas y alícuota distinta; todos deben bloquearse. Comprobar que el botón de autorización fiscal sigue ausente y que el endpoint sigue rechazando la autorización.

Antes de usarlo para una factura real faltan: cotejar el receptor con el padrón, reservar el número oficial, construir el XML, analizar la respuesta y recuperar estados inciertos mediante `FECompConsultar`. No publicar esta preparación de forma aislada como si habilitara facturación.

Referencia: [manual oficial WSFEv1 de ARCA](https://arca.gob.ar/ws/WSFEV1/documentos/manual-desarrollador-COMPG-v3-4-2.pdf), campos `Concepto`, `DocTipo`, `CondicionIVAReceptorId`, `ImpNeto`, `ImpIVA`, `ImpTotal` y `AlicIva`.
