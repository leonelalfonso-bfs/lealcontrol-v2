# Consulta de numeración ARCA antes de emitir

El ERP asigna números locales al crear borradores. Ese número **no** demuestra que ARCA haya autorizado el comprobante. Antes de habilitar `FECAESolicitar`, la integración debe consultar `FECompUltimoAutorizado` por CUIT representado, punto de venta y tipo; resolver concurrencia e incertidumbre con `FECompConsultar`. Ningún reintento de emisión debe asumir que un timeout equivale a rechazo.

Esta etapa incorpora una consulta de solo lectura en Configuración → Certificado ARCA. Soporta facturas A/B/C y no envía `FECAESolicitar`. El endpoint exige administrador, valida parámetros, utiliza el certificado del tenant y devuelve únicamente ambiente, punto, tipo y números. Nunca devuelve token, firma o clave privada.

## Prueba en staging

1. Sin certificado de homologación, la consulta debe informar que falta un certificado válido; no debe cambiar facturas ni crear CAE.
2. Con certificado de homologación autorizado para `wsfe`, consultar un punto de venta habilitado para A, B o C. Comparar el último número mostrado con ARCA/`FECompUltimoAutorizado`.
3. Consultar un punto inválido y un tipo distinto de A/B/C por API. Deben fallar sin enviar solicitud de autorización.
4. Probar usuario sin rol Admin: `403`. Probar aislamiento entre empresas: una empresa no puede usar el certificado de otra.
5. Comprobar que los borradores mantienen estado `Draft`, sin CAE ni QR.

## Pendiente para autorización real

- Obtener y reservar el siguiente número fiscal por punto/tipo desde ARCA al autorizar, sin usar el número del borrador.
- Validar emisor, receptor, concepto, moneda, totales, alícuotas, comprobantes asociados y punto de venta.
- Construir `FECAESolicitar`, interpretar aprobación/rechazo/observaciones y persistir respuesta verificable.
- Tras timeout o respuesta ambigua, recuperar con `FECompConsultar` antes de cualquier reintento.
- Probar en homologación con certificado de homologación antes de habilitar emisión en producción.

Fuente: https://www.afip.gob.ar/fe/documentos/manual-desarrollador-ARCA-COMPG-v4-0.pdf
