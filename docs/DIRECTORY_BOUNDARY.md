# Directorio — límite de responsabilidad

## Propósito

El Directorio es el maestro transversal de empresas y personas de contacto. Una misma empresa puede ser cliente, proveedor o ambas cosas, sin duplicar su CUIT, contactos, domicilios ni condiciones fiscales.

## Qué pertenece al Directorio

- identidad legal y comercial de la empresa;
- roles comerciales: cliente, proveedor o doble relación;
- contactos, sedes, direcciones y canales de comunicación;
- información fiscal y condiciones comerciales comunes.

## Qué permanece en cada módulo

| Módulo | Es dueño de |
|---|---|
| CRM | leads, oportunidades, actividades, pipeline y responsables comerciales |
| Ventas | presupuestos, pedidos, precios, facturación y saldo comercial |
| Compras | solicitudes, órdenes, recepciones, facturas y condiciones de compra específicas |
| Inventario | existencias, depósitos y vínculo producto-proveedor |

## Regla de dependencias

Los módulos que necesiten identificar una empresa consumen `Directory.Contracts`. No consultan tablas ni infraestructura de CRM.

CRM puede asociar una oportunidad a una empresa del Directorio. Ventas puede consultar oportunidades mediante `Crm.Contracts` exclusivamente cuando crea un presupuesto desde una oportunidad ganada. Esa dependencia es explícita y no convierte a CRM en dueño de la empresa.

## Regla de experiencia

La navegación parte de `/directorio`. Desde allí, una ficha y su edición deben regresar al Directorio cuando el usuario llegó por ese flujo. Las pantallas propias de Clientes o Proveedores son vistas filtradas, no maestros independientes.

## Migración gradual

1. Mantener el modelo y los endpoints actuales mientras se consolidan los flujos.
2. Publicar todo acceso entre módulos mediante `Directory.Contracts`.
3. Extraer la persistencia de empresas a un schema `directory` con una migración repetible y conciliación de datos.
4. Retirar los adaptadores temporales de CRM solo cuando los consumidores no dependan de ellos.

No se duplican entidades ni datos durante esta transición.
