# Migración a .NET 10 LTS

Rama: `codex/dotnet10-20261009`. Motivo: el soporte de .NET 8 termina el 10/11/2026 (sin parches de seguridad desde esa fecha). .NET 10 es LTS, con soporte hasta noviembre de 2028.

## Cambios

- `net8.0` → `net10.0` en `Directory.Build.props` y en los 11 proyectos; `global.json` en SDK 10.0.100 o posterior de la misma banda (`latestFeature`).
- Paquetes:
  - ASP.NET Core, EF Core y Microsoft.Extensions: 10.0.12.
  - Npgsql EF: 10.0.3.
  - Serilog.AspNetCore: 10.0.0. Serilog.Sinks.File: 7.0.0.
  - Swashbuckle: 10.3.0.
  - Testcontainers: 4.15.0. Microsoft.NET.Test.Sdk: 18.10.1.
  - Se quitaron referencias que .NET 10 ya incluye.
- Imágenes Docker: `sdk:10.0` y `aspnet:10.0`, ahora basadas en Ubuntu 24.04. `curl` sigue disponible para el healthcheck. CI: `setup-dotnet` 10.0.x.

## Ajustes por cambios de comportamiento

- **EF Core 9+ corta `Migrate()` si el modelo difiere de la última migración** (`PendingModelChangesWarning`). Acá la diferencia es esperable, porque parte del esquema lo crean los `Ensure*TablesAsync`. Se mantiene el comportamiento de EF Core 8: se registra en el log y el arranque sigue. Solo en el bootstrapper, que es el único lugar que migra. No se generaron migraciones nuevas, que en producción chocarían con columnas ya creadas por los scripts.
- Certificado ARCA: `new X509Certificate2(byte[])` es obsoleto. Se reemplazó por `X509CertificateLoader.LoadPkcs12`, con el mismo PKCS#12 sin contraseña y las mismas opciones de clave.
- `SearchText`: se usa el constructor nuevo de `SqlConstantExpression`.
- Proxies de confianza: `System.Net.IPNetwork` y `KnownIPNetworks`. La clase anterior quedó obsoleta.
- Swagger: modelo OpenAPI 2. La autenticación Bearer se declara con `OpenApiSecuritySchemeReference`.
- Migraciones de EF: se marcan como código generado en `.editorconfig`, para no aplicarles reglas de estilo.
- Tests: `PostgreSqlBuilder(imagen)` y `HostBuilder` + `UseTestServer` en lugar de `WebHostBuilder`, que quedó obsoleto.

## Validación

- Compilación en Release sin errores ni advertencias (las advertencias se tratan como errores).
- 371 pruebas aprobadas en .NET 10.
- **Actualización en el lugar:** la imagen .NET 8 actual crea la base, aprovisiona una empresa con base dedicada y carga clientes, producto, presupuesto y factura. Después, la imagen .NET 10 arranca sobre la misma base: 11 checks de salud, datos idénticos, búsqueda normalizada, altas nuevas y `/me` funcionando.
- **Avisos de arranque comparados:** idénticos en .NET 8 y .NET 10. El único aviso, "MigrateAsync chocó con objetos ya existentes (42701)" en CRM, ya ocurre hoy en cada arranque. Es deuda técnica previa: unificar el esquema de CRM en migraciones.

## Para desarrollar en local

El repositorio exige el SDK de .NET 10 (`global.json`). En WSL:

```bash
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 10.0 --install-dir ~/.dotnet10
echo 'export DOTNET_ROOT=$HOME/.dotnet10; export PATH=$HOME/.dotnet10:$PATH' >> ~/.bashrc
```

## Deploy

No cambia el `.env` ni el compose. El primer build en el VPS descarga las imágenes nuevas de .NET 10 (alrededor de 1 GB). Conviene verificar antes el espacio libre con `df -h /`.
