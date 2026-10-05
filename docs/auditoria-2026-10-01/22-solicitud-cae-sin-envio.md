# Solicitud CAE de un servicio A: construcción sin envío

El constructor toma el dato fiscal ya validado, un punto de venta y número reservado. Genera SOAP 1.1 `FECAESolicitar` de un único comprobante, con importes en formato invariante y `CondicionIVAReceptorId=1`. Token y firma se escapan como XML; nunca deben registrarse en logs ni persistirse en el intento fiscal. Esta clase **no realiza HTTP** ni habilita la emisión.

Prueba: generar XML con un ejemplo de $0,83 neto + $0,17 IVA = $1,00 total y confirmar nodo `FeCabReq` (1/1), número idéntico desde/hasta, fechas de servicio/vencimiento, receptor CUIT, `Iva/Id=5` y `MonId=PES`. Rechazar número/punto cero, credenciales vacías y datos de otro tipo. No usar credenciales reales en tests.

Referencia: [manual oficial WSFEv1 V4.1](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-1.pdf), orden de campos `FECAEDetRequest`.

El fingerprint SHA-256 se calcula sobre número reservado y datos fiscales canónicos, sin credenciales. Detecta cambios entre reserva y envío.
