# Concepto fiscal y período de servicios en borradores

La emisión de CAE sigue deshabilitada. El borrador guarda el concepto WSFEv1 (1 productos, 2 servicios, 3 mixto) y, para servicios o mixto, el período desde/hasta. El vencimiento de pago ya existente debe ser igual o posterior a la fecha de emisión. Los borradores anteriores tienen concepto 0 (sin clasificar) y no pueden autorizarse hasta completarlo en un flujo futuro.

Prueba manual en un tenant de prueba:

1. Abrir Facturas → Nueva factura; elegir Servicio. Comprobar que aparecen desde/hasta.
2. Intentar guardar sin período, con hasta anterior a desde y con vencimiento anterior a emisión. Cada caso debe rechazarse sin crear factura.
3. Completar un servicio de prueba, guardar borrador y comprobar por la API que `fiscalConcept=2`, `serviceFrom` y `serviceTo` persisten. No pulsar ninguna autorización fiscal.
4. Elegir Productos y comprobar que no pide fechas de servicio y que persiste `fiscalConcept=1`.
5. Consultar un borrador anterior: debe mostrar `fiscalConcept=0` y conservar sus importes.

Referencia: [manual oficial WSFEv1](https://arca.gob.ar/ws/WSFEV1/documentos/manual-desarrollador-COMPG-v3-4-2.pdf), campos `Concepto`, `FchServDesde`, `FchServHasta` y `FchVtoPago`.
