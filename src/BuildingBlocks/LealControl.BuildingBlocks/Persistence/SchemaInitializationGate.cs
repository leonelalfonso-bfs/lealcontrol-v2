using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LealControl.BuildingBlocks.Persistence;

/// <summary>
/// Ejecuta un script de esquema (CREATE/ALTER ... IF NOT EXISTS) una sola vez por base de datos
/// y por proceso. Los endpoints llaman a los Ensure*Async en cada request; sin esta compuerta cada
/// pedido repetía decenas de sentencias DDL y, como ALTER TABLE toma un lock exclusivo aunque la
/// columna ya exista, los pedidos concurrentes se bloqueaban entre sí.
/// Si el script falla no queda registrado y el próximo pedido lo reintenta.
/// </summary>
public static class SchemaInitializationGate
{
    private static readonly ConcurrentDictionary<string, Lazy<Task>> Completed = new(StringComparer.Ordinal);

    public static Task RunOnceAsync(DbContext db, string schemaKey, Func<CancellationToken, Task> ensure)
    {
        // Dentro de una transacción el DDL podría revertirse: se ejecuta sin registrarlo.
        if (db.Database.CurrentTransaction is not null)
        {
            return ensure(CancellationToken.None);
        }

        var key = $"{schemaKey}|{db.Database.GetConnectionString()}";
        var entry = Completed.GetOrAdd(key, _ => new Lazy<Task>(() => RunAsync(key, ensure)));
        return entry.Value;
    }

    /// <summary>
    /// Vuelve a ejecutar el script aunque ya se haya corrido: para reparar una tabla o columna
    /// que falta en tiempo de ejecución (UndefinedTable/UndefinedColumn).
    /// </summary>
    public static Task RerunAsync(DbContext db, string schemaKey, Func<CancellationToken, Task> ensure)
    {
        Completed.TryRemove($"{schemaKey}|{db.Database.GetConnectionString()}", out _);
        return RunOnceAsync(db, schemaKey, ensure);
    }

    /// <summary>
    /// Olvida lo registrado para una base: el bootstrap de arranque y el aprovisionamiento la
    /// verifican siempre completa, aunque algún request ya haya corrido los scripts.
    /// </summary>
    public static void ForgetDatabase(string databaseName)
    {
        foreach (var key in Completed.Keys)
        {
            var connectionString = key[(key.IndexOf('|') + 1)..];
            string? database;
            try
            {
                database = new NpgsqlConnectionStringBuilder(connectionString).Database;
            }
            catch (ArgumentException)
            {
                continue;
            }

            if (string.Equals(database, databaseName, StringComparison.Ordinal))
            {
                Completed.TryRemove(key, out _);
            }
        }
    }

    /// <summary>Olvida lo ejecutado (tests o tras restaurar una base).</summary>
    public static void Reset() => Completed.Clear();

    private static async Task RunAsync(string key, Func<CancellationToken, Task> ensure)
    {
        try
        {
            // El script compartido no usa el token de un request puntual: si ese cliente
            // cancela, los demás pedidos que esperan el mismo script no deben fallar.
            await ensure(CancellationToken.None);
        }
        catch
        {
            Completed.TryRemove(key, out _);
            throw;
        }
    }
}
