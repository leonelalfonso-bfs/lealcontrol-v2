using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
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
    private readonly string _apiKey;
    private readonly string _model;
    private readonly ILogger<AskLealService> _logger;

    private const string SystemPrompt = @"Eres el Copiloto Inteligente y Asistente Oficial de LEAL Control ERP V2.
Tu misión es guiar y responder al usuario con explicaciones paso a paso claras, amables y profesionales sobre cómo utilizar todas las funcionalidades del ERP. Hablas en español de Argentina de forma concisa y práctica.

Mapa de Módulos, Rutas y Flujos Clave de LEAL:

1. CRM Y EMBUDO COMERCIAL (CIRCUITO CLARO):
- PROSPECTOS / LEADS (/prospectos):
  * Es la puerta de entrada de nuevos interesados comerciales (consultas web, llamadas, ferias, WhatsApp) que aún NO son clientes formales ni tienen CUIT cargado.
  * Se cargan en /prospectos indicando Nombre de contacto, Empresa, Teléfono y Origen.
  * BOTÓN 'CONVERTIR': Cuando el prospecto muestra interés real de compra, se presiona 'Convertir a Cliente', lo que automáticamente crea el Cliente formal con CUIT en el Directorio y abre una Oportunidad Comercial.

- OPORTUNIDADES / PIPELINE (/oportunidades):
  * Es el embudo de ventas para gestionar negociaciones en curso (etapas: Calificación, Propuesta, Negociación, Ganada, Perdida).
  * Desde una Oportunidad se emiten los Presupuestos formales.

- DIRECTORIO / CLIENTES (/directorio | /clientes):
  * Es el Padrón Maestro de Entidades fiscales formalizadas con CUIT (Clientes, Proveedores o ambos).
  * NO duplica información con Leads: el Directorio almacena la Razón Social, CUIT, Condición IVA, Calificación BCRA, Plantas de entrega y Parque de Balanzas.
  * Pestaña 'Contactos' dentro del cliente: Son las personas físicas que trabajan dentro de esa empresa (ej: 'Juan Pérez - Jefe de Compras', 'María Gómez - Pago a Proveedores').
  * Botón 🔍 ARCA: Autocompleta datos fiscales desde AFIP por CUIT.
  * Botón 🏛️ BCRA: Consulta Central de Deudores y guarda la calificación crediticia (A, B, C, D).
  * Pestaña Parque Técnico: Balanzas, números de serie y fechas de calibración periódica.

2. PRODUCTOS, STOCK E INVENTARIO:
- Productos y Repuestos (/productos | Alta: /productos/nuevo):
  * Tipos: 'Comprado' (reventa), 'Fabricado' (requiere receta BOM), 'Materia Prima' o 'Servicio' (calibración, horas taller).
  * Código, Nombre, Alícuotas de IVA, Precios y Stock Mínimo para alertas de reposición.
- Inventario (/inventario): Stock valorizado, movimientos y transferencias entre depósitos.

3. PRODUCCIÓN Y TALLER:
- Centro de Producción (/produccion):
  * Listas de Materiales / Fórmulas (BOM): /produccion/flujo (Define insumos necesarios).
  * Órdenes de Fabricación / Trabajo (OT): /produccion/ordenes | Alta: /produccion/ordenes (Consume materias primas y da de alta el stock elaborado).

4. VENTAS Y COMERCIAL:
- Flujo estándar: Presupuesto -> Pedido -> Remito -> Factura.
- Presupuestos: /presupuestos | Alta: /presupuestos/nuevo
  * Lee la nota BCRA del cliente y sugiere condición de pago con botones de 1 clic.
  * Cotización Dólar BNA en vivo vía DolarApi.
  * Botones para Imprimir PDF oficial, Duplicar o Convertir a Pedido / Factura.
- Pedidos: /pedidos | Alta: /pedidos/nuevo
- Remitos: /remitos | Alta: /remitos/nuevo
- Facturas Electrónicas: /facturas | Alta: /facturas/nueva (CAE oficial de AFIP/ARCA y código QR).

5. COMPRAS Y PROVEEDORES:
- Proveedores: /proveedores | Alta: /proveedores/nuevo
- Facturas de Compras: /compras/facturas
- Asistente IA de Facturas (OCR): Botón 🤖 OCR en /compras/facturas para escanear PDF o foto.
- Importación Masiva ARCA: /compras/arca (Importa Excel de 'Mis Comprobantes Recibidos' de AFIP).

6. FINANZAS Y TESORERÍA:
- Centro Financiero: /finanzas
- Cheques en Cartera: /finanzas/cheques (eCheqs y cheques físicos).
- Recibos de Cobranza: /finanzas/recibos

REGLAS DE RESPUESTA:
- Sé directo y estructurado con viñetas paso a paso (1., 2., 3.).
- Incluye siempre sugerencias de acción con URLs válidas.
- Responde SIEMPRE en formato JSON con la siguiente estructura:
{
  ""answer"": ""Texto explicativo en Markdown con pasos claros y concisos."",
  ""suggestedActions"": [
    { ""label"": ""Nombre de la Acción"", ""url"": ""/ruta"", ""icon"": ""📦"" }
  ]
}";

    public AskLealService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<AskLealService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _apiKey = Environment.GetEnvironmentVariable("GEMINI_API_KEY")
               ?? configuration["Gemini:ApiKey"]
               ?? "AQ.Ab8RN6KSIzI37ur4u4gVfU3fDY1d-0rO9Dsw41J0FJs0oBmQIA";
        _model = configuration["Gemini:Model"] ?? "gemini-3.5-flash-lite";
    }

    public async Task<AskLealResponse> AskAsync(AskLealRequest request, CancellationToken ct = default)
    {
        try
        {
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";

            var contentsList = new List<object>();

            // Historial previo
            if (request.History != null && request.History.Count > 0)
            {
                foreach (var h in request.History.TakeLast(6))
                {
                    contentsList.Add(new
                    {
                        role = h.Role == "assistant" || h.Role == "model" ? "model" : "user",
                        parts = new[] { new { text = h.Content } }
                    });
                }
            }

            // Pregunta actual
            contentsList.Add(new
            {
                role = "user",
                parts = new[] { new { text = request.Message } }
            });

            var requestBody = new
            {
                systemInstruction = new
                {
                    parts = new[] { new { text = SystemPrompt } }
                },
                contents = contentsList.ToArray(),
                generationConfig = new
                {
                    responseMimeType = "application/json",
                    temperature = 0.2
                }
            };

            var json = JsonSerializer.Serialize(requestBody);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync(url, content, ct);
            var responseString = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gemini AskLeal falló con status {Status}: {Error}", response.StatusCode, responseString);
                return FallbackAnswer(request.Message);
            }

            using var doc = JsonDocument.Parse(responseString);
            var root = doc.RootElement;
            var textContent = root.GetProperty("candidates")[0]
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

        // 1. Producto Fabricado / Producción / BOM
        if (lower.Contains("fabricad") || lower.Contains("produccion") || lower.Contains("fabricar") || lower.Contains("bom") || lower.Contains("receta") || lower.Contains("formula"))
        {
            return new AskLealResponse(
                Answer: "### 🏭 Cómo cargar y gestionar un Producto Fabricado:\n\n1. **Alta del Producto**: Ingresá a **Ventas / Inventario > Productos** y presioná **`+ Nuevo Producto`**.\n2. **Tipo de Producto**: En el selector de tipo, elegí **`Fabricado`** (o Producto Terminado).\n3. **Datos Comerciales**: Completá código, nombre, categoría, unidad de medida, precio de venta y costo estimado.\n4. **Lista de Materiales (BOM)**: Ingresá a **Producción > Flujo / Variantes** para vincular los insumos y materias primas que componen la receta.\n5. **Orden de Fabricación**: Para iniciar la producción, andá a **Producción > Órdenes** y presioná **`+ Nueva Orden`** para reservar insumos y dar de alta el stock final.",
                SuggestedActions: new List<ActionLinkDto>
                {
                    new("Nuevo Producto", "/productos/nuevo", "📦"),
                    new("Módulo Producción", "/produccion", "⚙️"),
                    new("Ver Inventario", "/inventario", "📊")
                }
            );
        }

        // 2. Producto / Artículo general
        if (lower.Contains("producto") || lower.Contains("articulo") || lower.Contains("item") || lower.Contains("insumo") || lower.Contains("materia prima"))
        {
            return new AskLealResponse(
                Answer: "### 📦 Cómo cargar un Producto o Insumo en LEAL:\n\n1. Ingresá a **Ventas** (o Inventario) y hacé clic en **Productos**.\n2. Presioná el botón **`+ Nuevo Producto`**.\n3. Seleccioná el **Tipo de Producto**:\n   * **Comprado / Mercadería**: Para reventa.\n   * **Fabricado**: Para productos de elaboración propia.\n   * **Materia Prima / Insumo**: Para insumos de taller/fábrica.\n   * **Servicio**: Para mano de obra, calibraciones o fletes.\n4. Ingresá el Código, Nombre, Alícuota de IVA (21%, 10.5%), Precio de Venta y **Stock Mínimo** (para recibir alertas de reposición).\n5. Presioná **Guardar Producto**.",
                SuggestedActions: new List<ActionLinkDto>
                {
                    new("Crear Nuevo Producto", "/productos/nuevo", "📦"),
                    new("Ver Catálogo de Productos", "/productos", "📋")
                }
            );
        }

        // 3. Presupuestos
        if (lower.Contains("presupuesto") || lower.Contains("cotizar") || lower.Contains("cotizacion"))
        {
            return new AskLealResponse(
                Answer: "### 📝 Cómo cargar un Presupuesto en LEAL:\n\n1. Ingresá a **Ventas** y hacé clic en **Presupuestos**.\n2. Presioná el botón **`+ Nuevo Presupuesto`**.\n3. Seleccioná el **Cliente** (el sistema te indicará su nota crediticia BCRA y recomendará la forma de pago con 1 clic).\n4. Agregá los productos o servicios, cantidades y precios.\n5. Presioná **Guardar**. Desde allí podés imprimirlo en PDF oficial o convertirlo directamente a Pedido o Factura.",
                SuggestedActions: new List<ActionLinkDto>
                {
                    new("Nuevo Presupuesto", "/presupuestos/nuevo", "📝"),
                    new("Ver Presupuestos", "/presupuestos", "📋")
                }
            );
        }

        // 4. Clientes / Proveedores / ARCA / BCRA
        if (lower.Contains("cliente") || lower.Contains("arca") || lower.Contains("cuit") || lower.Contains("bcra") || lower.Contains("proveedor") || lower.Contains("directorio"))
        {
            return new AskLealResponse(
                Answer: "### 👤 Cómo dar de alta un Cliente o Proveedor en LEAL:\n\n1. Ingresá a **Directorio** o **Clientes**.\n2. Presioná **`+ Nuevo Cliente`**.\n3. Ingresá el **CUIT** y hacé clic en **`🔍 ARCA`** para traer automáticamente Razón Social, Condición de IVA y domicilio fiscal oficial.\n4. Hacé clic en **`🏛️ BCRA`** para consultar y guardar su calificación crediticia.\n5. Si el cliente tiene balanzas o equipos, podés cargarlos en la pestaña **Parque Técnico**.",
                SuggestedActions: new List<ActionLinkDto>
                {
                    new("Nuevo Cliente", "/clientes/nuevo", "👤"),
                    new("Ver Directorio", "/directorio", "🏢")
                }
            );
        }

        // 5. Facturación / CAE
        if (lower.Contains("factura") || lower.Contains("convertir") || lower.Contains("afip") || lower.Contains("cae") || lower.Contains("cobrar"))
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

        // 6. Balanzas / Parque Técnico / Calibraciones
        if (lower.Contains("balanza") || lower.Contains("calibracion") || lower.Contains("parque") || lower.Contains("equipo") || lower.Contains("serie"))
        {
            return new AskLealResponse(
                Answer: "### ⚖️ Cómo cargar y seguir Balanzas y Equipos Técnicos:\n\n1. Ingresá a **Clientes** y abrí la ficha del cliente correspondiente.\n2. Hacé clic en la pestaña **`Parque Técnico / Balanzas`**.\n3. Presioná **`+ Agregar Equipo`**.\n4. Completá: Tipo de equipo, Marca, Modelo, Número de Serie, Capacidad Máxima y División de escala.\n5. Asigná la **Fecha de Última Calibración** y la **Próxima Calibración** para que el sistema te alerte automáticamente en el panel de Diagnóstico.",
                SuggestedActions: new List<ActionLinkDto>
                {
                    new("Ver Clientes", "/clientes", "👤"),
                    new("Ver Directorio", "/directorio", "🏢")
                }
            );
        }

        return new AskLealResponse(
            Answer: "### 🤖 Asistente LEAL Control ERP\n\nPuedo ayudarte con cualquier procedimiento:\n* **Ventas & Cotizaciones**: Cómo emitir presupuestos, pedidos, remitos y facturación con CAE.\n* **Inventario & Fabricación**: Cómo cargar productos comprados, fabricados, insumos y listas de materiales (BOM).\n* **Clientes & Proveedores**: Consultas oficiales por CUIT en ARCA y Central de Deudores BCRA.\n* **Servicio Técnico**: Gestión de parque de balanzas, números de serie y vencimientos de calibración.\n* **Compras & Finanzas**: Carga manual, OCR con IA, importación de ARCA y cheques en cartera.\n\n¿Qué procedimiento te gustaría que te explique paso a paso?",
            SuggestedActions: new List<ActionLinkDto>
            {
                new("Ir al Inicio", "/", "🏠"),
                new("Nuevo Presupuesto", "/presupuestos/nuevo", "📝"),
                new("Nuevo Producto", "/productos/nuevo", "📦"),
                new("Directorio Clientes", "/directorio", "👤")
            }
        );
    }
}
