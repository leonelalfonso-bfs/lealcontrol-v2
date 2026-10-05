# Recuperación de una reserva fiscal incierta

FiscalVoucherRecoveryService consulta por empresa, punto de venta, tipo y número de la reserva con FECompConsultar. Coteja el perfil fiscal completo, el receptor, el importe y la huella del pedido antes de guardar CAE, número oficial y QR en una transacción. Una respuesta ausente o discordante deja la reserva Unknown, sin reenviar FECAESolicitar. Una reserva Reserved aún sin envío no se recupera.

Esta etapa no llama a FECAESolicitar, no conecta el endpoint de autorización y no habilita emisión.
