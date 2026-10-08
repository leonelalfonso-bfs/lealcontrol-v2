# Encendido de la emisión ARCA en producción

> **Encendida el 8/10/2026.** Punto de venta 6, CUIT 30715342215. Primera factura real: A 0006-00000003, CAE 86416730865280, verificada con el QR en ARCA.

Procedimiento para empezar a facturar desde erp.lealcontrol.com. Producción ya tiene el código (#85 y #86). Solo falta habilitarlo.

## 1. En ARCA (clave fiscal de cada empresa)

- [ ] **Punto de venta RECE** (web services) dado de alta, distinto del que usa el otro sistema de facturación.
- [ ] **Certificado de producción** asociado a **wsfe** (Facturación electrónica) y a **wsfecred** (Factura de Crédito Electrónica MiPyMEs), en el Administrador de Relaciones.

  Sin wsfecred, las facturas de más de $1.000.000 no se autorizan, porque no se puede verificar si corresponde FCE.
- [ ] Si se va a emitir FCE: el **CBU** informado en la aplicación de Factura de Crédito Electrónica.

## 2. En el ERP de producción (cada empresa)

- [ ] **Configuración → Empresa:** CUIT, condición de IVA, Ingresos Brutos, inicio de actividades y domicilio, todos reales.
- [ ] **Configuración → Facturación ARCA:** **punto de venta de este sistema** (arriba de todo) y ambiente "Producción" con el certificado de producción.
- [ ] **Configuración → Cobros y bancos:** **CBU y alias reales**. Son los únicos que salen en el PDF y en la FCE (#88).
- [ ] **Configuración → Documentos → Factura:** si se muestran los datos bancarios y las instrucciones de pago. Se guardan en el servidor, por empresa.
- [ ] **Nueva factura:** el punto de venta aparece fijo y es el configurado.

## 3. En el VPS (solo producción)

```bash
cd /opt/lealcontrol-v2
grep -n '^ARCA_' .env
```

Agregar (o cambiar a `true`) estas dos líneas en `.env`:

```bash
ARCA_ENABLE_INVOICE_AUTHORIZATION=true
ARCA_ALLOW_PRODUCTION_AUTHORIZATION=true
```

Recrear solo la API y verificar:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d api
docker compose -f docker-compose.prod.yml --env-file .env exec -T api printenv | grep -i '^Arca__'
curl -s http://127.0.0.1:5209/health | head -c 300
```

Tiene que mostrar `Arca__EnableInvoiceAuthorization=true` y `Arca__AllowProductionAuthorization=true`, y el health en Healthy. El deploy automático conserva el `.env`.

**Apagado de emergencia:** poner las dos variables en `false` y repetir el `up -d api`. Lo ya emitido no cambia.

## 4. Primera emisión

1. Una factura **real y chica** de una venta existente, a un Responsable Inscripto conocido.
2. Verificar:
   - CAE y número;
   - el QR, escaneado con el celular (en producción abre el comprobante en ARCA);
   - el PDF con datos reales;
   - el listado y la cuenta corriente.
3. Primera factura en USD: comprobar que "Cotización ARCA del …" coincida con el cierre divisa vendedor BNA del día hábil anterior.
4. Si algo sale mal: no reenviar. Usar "Consultar ARCA" ante un envío incierto y "Corregir y reintentar" ante un rechazo. Una factura autorizada se corrige con nota de crédito.
