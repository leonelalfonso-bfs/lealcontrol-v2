using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LealControl.Api.Automation;

public sealed record ChatMessageDto(
    [property: JsonPropertyName("role")] string Role, // "user" | "model"
    [property: JsonPropertyName("content")] string Content
);

public sealed record AskLealRequest(
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("history")] List<ChatMessageDto>? History
);

public sealed record ActionLinkDto(
    [property: JsonPropertyName("label")] string Label,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("icon")] string? Icon
);

public sealed record AskLealResponse(
    [property: JsonPropertyName("answer")] string Answer,
    [property: JsonPropertyName("suggestedActions")] List<ActionLinkDto> SuggestedActions
);

public sealed class AskLealService
{
    private readonly HttpClient _httpClient;
    private readonly string? _apiKey;
    private readonly ILogger<AskLealService> _logger;

    private const string SystemPrompt = @"Eres el Copiloto Inteligente y Asistente Oficial de LEAL Control ERP V2.
Tu misión es guiar, responder y ayudar al usuario o a sus colaboradores con explicaciones claras, amables, profesionales y directas sobre cómo utilizar todas las funcionalidades del ERP. Hablas en español de Argentina de forma concisa y práctica.

Mapa de Módulos, Rutas y Flujos Clave de LEAL:

1. CRM Y DIRECTORIO:
- Directorio de Contactos: /directorio (Filtros por Clientes, Proveedores, Prospectos).
- Clientes: /clientes | Alta: /clientes/nuevo | Detalle: /clientes/{id}
  * Cuenta con botón 🔍 ARCA para autocompletar Razón Social, IVA y domicilio fiscal desde AFIP/ARCA mediante CUIT.
  * Cuenta con botón 🏛️ BCRA para consultar Central de Deudores, calificación crediticia (A, B, C, D) y guardar la calificación en la ficha.
  * Pestaña Parque Técnico: Carga y seguimiento de balanzas, números de serie, modelo, capacidad máxima, división y fechas de calibración periódica.
- Oportunidades comerciales: /oportunidades

2. VENTAS Y COMERCIAL:
- Flujo comercial estándar: Presupuesto -> Pedido -> Remito -> Factura.
- Presupuestos / Cotizaciones: /presupuestos | Alta: /presupuestos/nuevo
  * Al seleccionar cliente, muestra banner inteligente con la calificación crediticia del BCRA y botones de 1 clic para aplicar condición de pago (30d cta cte, 50% anticipo o contado).
  * Cotizaciones en vivo de Dólar BNA (Oficial Billete y Divisa Mayorista) vía DolarApi.
  * Botones de acción: Imprimir PDF oficial, Duplicar, Convertir a Pedido de Venta, o Convertir directamente a Factura.
- Pedidos de Venta: /pedidos | Alta: /pedidos/nuevo (Permite generar Remito de entrega).
- Remitos de Entrega: /remitos | Alta: /remitos/nuevo
- Facturación Electrónica AFIP/ARCA: /facturas | Alta: /facturas/nueva
  * Emisión con CAE oficial, código QR reglamentario y envío por email.

3. COMPRAS Y PROVEEDORES:
- Proveedores: /proveedores | Alta: /proveedores/nuevo
- Solicitudes de Compra: /compras/solicitudes
- Órdenes de Compra: /compras/ordenes
- Facturas de Proveedores: /compras/facturas | Alta manual: /compras/facturas/nueva
- Asistente IA de Facturas (OCR): Botón 🤖 OCR en /compras/facturas permite subir PDF o foto de factura del proveedor y autocompletar CUIT, número, fecha, CAE y montos.
- Importación Masiva ARCA: /compras/arca (Importa archivo Excel/CSV descargado de 'Mis Comprobantes Recibidos' de AFIP).

4. FINANZAS Y TESORERÍA:
- Centro Financiero: /finanzas
- Cuentas Bancarias y Cajas: /finanzas/cuentas
- Cheques y eCheqs en Cartera: /finanzas/cheques (Registro de cheques recibidos, endosos, depósitos y alertas de vencimiento).
- Recibos de Cobranza: /finanzas/recibos

5. INVENTARIO Y STOCK:
- Inventario: /inventario (Stock actual, valorización, stock mínimo, alertas de reposición).
- Productos y Repuestos: /productos | Alta: /productos/nuevo

6. PRODUCCIÓN Y TALLER:
- Centro de Producción: /produccion
- Órdenes de Trabajo y Fabricación: /produccion/ordenes
- Tablero de Flujo (Kanban): /produccion/flujo

7. RECURSOS HUMANOS:
- Nómina de Empleados: /rrhh/empleados
- Liquidaciones de Sueldo: /rrhh/liquidaciones
- Asistente IA de Convenios (CCT): Botón 🤖 Asistente CCT en /rrhh/liquidaciones investiga escalas salariales y acuerdos recientes en Gemini.

REGLAS DE RESPUESTA:
- Sé súper claro, ordenado con viñetas paso a paso (Paso 1, Paso 2, Paso 3).
- Si la pregunta se refiere a una acción concreta (ej: cargar un presupuesto), incluye al final la ruta exacta y los botones a presionar.
- Responde SIEMPRE en formato JSON con la siguiente estructura exacta:
{
  ""answer"": ""Texto explicativo en Markdown con pasos claros y concisos."",
  ""suggestedActions"": [
    { ""label"": ""Crear Nuevo Presupuesto"", ""url"": ""/presupuestos/nuevo"", ""icon"": ""📝"" }
  ]
}";

    public AskLealService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<AskLealService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _apiKey = configuration["Gemini:ApiKey"]
               ?? configuration["GEMINI_API_KEY"]
               ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY")
               ?? Environment.GetEnvironmentVariable("Gemini__ApiKey");
    }

    public async Task<AskLealResponse> AskAsync(AskLealRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            return FallbackAnswer(request.Message);
        }

        try
        {
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={_apiKey}";

            var contentsList = new List<object>();

            // Historial previo
            if (request.History != null && request.History.Count > 0)
            {
                foreach (var h in request.History.TakeLast(6))
                {
                    contentsList.Add(new
                    {
                        role = h.Role == "assistant" || h.Role == "model" ? "model" : "user",
                        parts = new object[] { new { text = h.Content } }
                    });
                }
            }

            // Pregunta actual del usuario
            contentsList.Add(new
            {
                role = "user",
                parts = new object[] { new { text = request.Message } }
            });

            var body = new
            {
                system_instruction = new
                {
                    parts = new object[] { new { text = SystemPrompt } }
                },
                contents = contentsList,
                generationConfig = new
                {
                    temperature = 0.2,
                    response_mime_type = "application/json"
                }
            };

            var response = await _httpClient.PostAsJsonAsync(url, body, ct);
            if (!response.IsSuccessStatusCode)
            {
                var errorText = await response.Content.ReadAsStringAsync(ct);
                _logger.LogWarning("Gemini AskLeal falló con status {Status}: {Error}", response.StatusCode, errorText);
                return FallbackAnswer(request.Message);
            }

            var jsonResp = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            var candidates = jsonResp.GetProperty("candidates");
            if (candidates.GetArrayLength() == 0)
            {
                return FallbackAnswer(request.Message);
            }

            var textContent = candidates[0]
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text")
                .GetString();

            if (string.IsNullOrWhiteSpace(textContent))
            {
                return FallbackAnswer(request.Message);
            }

            var parsed = JsonSerializer.Deserialize<AskLealResponse>(textContent, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return parsed ?? FallbackAnswer(request.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al consultar Gemini en AskLealService.");
            return FallbackAnswer(request.Message);
        }
    }

    private AskLealResponse FallbackAnswer(string query)
    {
        var lower = query.ToLowerInvariant();
        if (lower.Contains("presupuesto") || lower.Contains("cotizar") || lower.Contains("cotizacion"))
        {
            return new AskLealResponse(
                Answer: "### 📝 Cómo cargar un Presupuesto en LEAL:\n\n1. Ingresá al módulo **Ventas** y hacé clic en **Presupuestos**.\n2. Presioná el botón **`+ Nuevo Presupuesto`**.\n3. Seleccioná el **Cliente** (el sistema te indicará su nota crediticia BCRA y recomendará la forma de pago).\n4. Agregá los productos o servicios, cantidades y precios.\n5. Presioná **Guardar**. Desde allí podés imprimirlo en PDF oficial o convertirlo directamente a Pedido o Factura.",
                SuggestedActions: new List<ActionLinkDto>
                {
                    new("Nuevo Presupuesto", "/presupuestos/nuevo", "📝"),
                    new("Ver Presupuestos", "/presupuestos", "📋")
                }
            );
        }

        if (lower.Contains("cliente") || lower.Contains("arca") || lower.Contains("cuit") || lower.Contains("bcra"))
        {
            return new AskLealResponse(
                Answer: "### 👤 Cómo dar de alta un Cliente en LEAL:\n\n1. Ingresá a **Directorio** o **Clientes**.\n2. Presioná **`+ Nuevo Cliente`**.\n3. Ingresá el **CUIT** y hacé clic en **`🔍 ARCA`** para traer automáticamente Razón Social, Condición de IVA y domicilio fiscal.\n4. Hacé clic en **`🏛️ BCRA`** para consultar y guardar su calificación crediticia.\n5. Si el cliente tiene balanzas o equipos, podés cargarlos en la pestaña **Parque Técnico**.",
                SuggestedActions: new List<ActionLinkDto>
                {
                    new("Nuevo Cliente", "/clientes/nuevo", "👤"),
                    new("Ver Directorio", "/directorio", "🏢")
                }
            );
        }

        if (lower.Contains("factura") || lower.Contains("convertir") || lower.Contains("afip") || lower.Contains("cae"))
        {
            return new AskLealResponse(
                Answer: "### 🧾 Cómo emitir o convertir a Factura Electrónica:\n\n1. **Desde un Presupuesto**: Abrí el presupuesto aprobado y presioná **`Convertir a Factura`**.\n2. **Desde Facturación Directa**: Andá a **Ventas > Facturas** y presioná **`+ Nueva Factura`**.\n3. Verificá los ítems, alícuotas de IVA y condición de venta.\n4. Presioná **Emitir Factura** para solicitar el CAE oficial a AFIP/ARCA con su código QR reglamentario.",
                SuggestedActions: new List<ActionLinkDto>
                {
                    new("Nueva Factura", "/facturas/nueva", "🧾"),
                    new("Ver Facturas", "/facturas", "📄")
                }
            );
        }

        return new AskLealResponse(
            Answer: "### 🤖 Asistente LEAL Control ERP\n\nPuedo ayudarte a operar cualquier parte del sistema:\n* **Ventas**: Cómo emitir presupuestos, pedidos, remitos y facturas electrónicas con CAE.\n* **Clientes & Proveedores**: Consultas automáticas de CUIT en ARCA y Central de Deudores BCRA.\n* **Compras**: Carga manual, importación masiva de comprobantes ARCA o extracción OCR con IA.\n* **Servicio Técnico**: Gestión de parque de balanzas y calibraciones periódicas.\n* **Finanzas**: Cheques en cartera, cuentas bancarias y cobranzas.\n\n¿Qué procedimiento te gustaría que te explique paso a paso?",
            SuggestedActions: new List<ActionLinkDto>
            {
                new("Ir al Inicio", "/", "🏠"),
                new("Nuevo Presupuesto", "/presupuestos/nuevo", "📝"),
                new("Directorio Clientes", "/directorio", "👤")
            }
        );
    }
}
