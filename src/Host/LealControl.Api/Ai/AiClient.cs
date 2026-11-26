using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Anthropic;
using Anthropic.Models.Messages;

namespace LealControl.Api.Ai;

/// <summary>Respuesta de la IA: el JSON pedido, los tokens usados y por qué terminó.</summary>
public sealed record AiCompletion(string Json, long InputTokens, long OutputTokens, string? StopReason);

/// <summary>
/// El proveedor de IA. El resto del sistema pide "un JSON con este esquema" y no sabe qué proveedor contesta:
/// cambiar de proveedor es escribir otra implementación.
/// </summary>
public interface IAiClient
{
    Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
        IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct);
}

public static class AiModels
{
    /// <summary>Lectura y clasificación de mails: rápido y barato.</summary>
    public const string Reader = "claude-haiku-5-5";
    /// <summary>Supervisor comercial: razona sobre el estado de la empresa.</summary>
    public const string Supervisor = "claude-sonnet-5-5";

    /// <summary>USD por millón de tokens (entrada, salida), precios de lista.</summary>
    private static readonly Dictionary<string, (decimal Input, decimal Output)> Prices = new()
    {
        [Reader] = (0.10m, 0.50m),
        [Supervisor] = (2m, 10m),
    };

    public static decimal Cost(string model, long inputTokens, long outputTokens) =>
        Prices.TryGetValue(model, out var p) ? (inputTokens * p.Input + outputTokens * p.Output) / 1_000_000m : 0m;
}

/// <summary>Claude, por la API de Anthropic, con salida estructurada (JSON validado contra el esquema).</summary>
public sealed class ClaudeAiClient : IAiClient
{
    public async Task<AiCompletion> CompleteJsonAsync(string apiKey, string model, string system, string user,
        IReadOnlyDictionary<string, JsonElement> schema, int maxTokens, CancellationToken ct)
    {
        var client = new AnthropicClient { ApiKey = apiKey };
        var message = await client.Messages.Create(new MessageCreateParams
        {
            Model = model,
            MaxTokens = maxTokens,
            System = system,
            Messages = [new UserMessageParam { Content = user }],
            OutputConfig = new OutputConfig
            {
                Effort = Effort.Low,
                Format = new JsonOutputFormat { Schema = schema.ToDictionary(x => x.Key, x => x.Value) },
            },
        }, ct);
        var text = string.Concat(message.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        return new AiCompletion(text, message.Usage.InputTokens, message.Usage.OutputTokens, message.StopReason?.Raw());
    }
}
