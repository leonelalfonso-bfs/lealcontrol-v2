using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Fleet.Infrastructure;

public sealed record SaveServiceOrderRequest(
    string? Description,
    Guid? CustomerId = null,
    string? CustomerName = null,
    Guid? SalesOrderId = null,
    string? Location = null,
    DateTimeOffset? Start = null,
    DateTimeOffset? End = null,
    Guid[]? EmployeeIds = null,
    Guid[]? VehicleIds = null);

public sealed record CompleteServiceOrderRequest(string? WorkPerformed, string? Observations = null);

public sealed record ResourceRef(Guid Id, string Label);

/// <summary>Una persona o unidad para un horario: lo que impide asignarla y lo que conviene saber.</summary>
public sealed record ResourceStatus(Guid Id, string Label, string? Detail, string[] Blockers, string[] Warnings);

public sealed record ServiceOrderView(
    Guid Id, int Number, string Code, ServiceOrderStatus Status, Guid? CustomerId, string CustomerName,
    Guid? SalesOrderId, string? SalesOrderNumber, string? Location, string Description,
    DateTimeOffset? Start, DateTimeOffset? End, ResourceRef[] People, ResourceRef[] Vehicles,
    string? WorkPerformed, string? Observations, DateTimeOffset? CompletedAt, string? CreatedBy,
    /// <summary>Problemas actuales de lo asignado (por ejemplo, algo que venció después de programar).</summary>
    string[] Problems);

public sealed record AgendaEvent(string Date, string Kind, string Title, string? Detail, string Link);

public sealed record SalesOrderToCoordinate(Guid Id, string OrderNumber, Guid CustomerId, string CustomerName, string Status, DateTime CreatedAtUtc, int ServiceOrders);

/// <summary>
/// Flota 3: órdenes de servicio y agenda. Nunca se programa un trabajo con una persona o unidad
/// vencida (o que venza antes del fin del trabajo), en taller u ocupada en ese horario.
/// </summary>
public static class FleetServiceOrders
{
    private static IResult Problem(string message) => Results.BadRequest(new { detail = message });

    public static string Code(int number) => $"OS-{number:D5}";

    private static string Day(DateOnly d) => d.ToString("dd/MM");

    /// <summary>Todo lo que hace falta para evaluar disponibilidad, leído una sola vez.</summary>
    internal sealed class Snapshot
    {
        public required DateOnly Today { get; init; }
        public required DateTime NowUtc { get; init; }
        public required Dictionary<Guid, Vehicle> Vehicles { get; init; }
        public required ILookup<Guid, VehicleDocument> Documents { get; init; }
        public required List<VehicleMaintenance> OpenShopJobs { get; init; }
        public required ILookup<Guid, ServiceDueItem> ServicesDue { get; init; }
        public required Dictionary<Guid, FleetMember> Members { get; init; }
        public required ILookup<Guid, PersonCredential> Credentials { get; init; }
        public required Dictionary<Guid, FleetEmployee> Employees { get; init; }
        public required List<ServiceOrder> ActiveOrders { get; init; }

        public static async Task<Snapshot> LoadAsync(FleetDbContext db, Guid tenantId, DateTimeOffset now, CancellationToken ct)
        {
            var today = FleetRules.TodayInArgentina(now);
            var vehicles = await db.Vehicles.AsNoTracking().Where(v => v.TenantId == tenantId).ToDictionaryAsync(v => v.Id, ct);
            var docs = await db.VehicleDocuments.AsNoTracking().Where(d => d.TenantId == tenantId && d.IsActive).ToListAsync(ct);
            var shop = await db.VehicleMaintenances.AsNoTracking()
                .Where(m => m.TenantId == tenantId && (m.Status == MaintenanceStatus.Scheduled || m.Status == MaintenanceStatus.InProgress)).ToListAsync(ct);
            var dues = await FleetMaintenance.ServicesDueAsync(db, tenantId, today, ct);
            var members = await db.Members.AsNoTracking().Where(m => m.TenantId == tenantId).ToListAsync(ct);
            var creds = await db.PersonCredentials.AsNoTracking().Where(c => c.TenantId == tenantId && c.IsActive).ToListAsync(ct);
            var employees = await FleetPeople.EmployeesAsync(db, tenantId, ct);
            var orders = await db.ServiceOrders.AsNoTracking()
                .Where(o => o.TenantId == tenantId && (o.Status == ServiceOrderStatus.Scheduled || o.Status == ServiceOrderStatus.InProgress)
                    && o.StartUtc != null && o.EndUtc != null)
                .ToListAsync(ct);
            return new Snapshot
            {
                Today = today,
                NowUtc = now.UtcDateTime,
                Vehicles = vehicles,
                Documents = docs.ToLookup(d => d.VehicleId),
                OpenShopJobs = shop,
                ServicesDue = dues.ToLookup(d => d.VehicleId),
                Members = members.GroupBy(m => m.EmployeeId).ToDictionary(g => g.Key, g => g.First()),
                Credentials = creds.ToLookup(c => c.EmployeeId),
                Employees = employees,
                ActiveOrders = orders
            };
        }

        private string ExpiryText(string label, DateOnly expiration) =>
            expiration < Today ? $"{label} vencida el {Day(expiration)}" : $"{label} vence el {Day(expiration)}, antes del fin del trabajo";

        private IEnumerable<string> Overlaps(DateTime start, DateTime end, Guid? excludeOrderId, Func<ServiceOrder, bool> uses) =>
            ActiveOrders
                .Where(o => o.Id != excludeOrderId && o.StartUtc < end && o.EndUtc > start && uses(o))
                .OrderBy(o => o.StartUtc)
                .Select(o => $"ocupada en {Code(o.Number)} ({o.CustomerName})");

        public ResourceStatus Vehicle(Guid id, DateTime start, DateTime end, Guid? excludeOrderId)
        {
            if (!Vehicles.TryGetValue(id, out var v)) return new ResourceStatus(id, "?", null, ["unidad inexistente"], []);
            var startDay = FleetRules.TodayInArgentina(start);
            var endDay = FleetRules.TodayInArgentina(end);
            var blockers = new List<string>();
            switch (v.Status)
            {
                case VehicleStatus.Sold: blockers.Add("dada de baja"); break;
                case VehicleStatus.OutOfService: blockers.Add("fuera de servicio"); break;
                case VehicleStatus.InMaintenance: blockers.Add("en taller"); break;
            }
            var docs = Documents[id].ToList();
            foreach (var required in FleetRules.RequiredDocuments(v.Type).Where(t => docs.All(d => d.DocumentType != t)))
                blockers.Add($"sin {FleetRules.DocumentLabel(required)} cargada");
            foreach (var d in docs.OrderBy(d => d.ExpirationDateUtc))
            {
                var expiration = FleetRules.FromStoredDate(d.ExpirationDateUtc);
                if (expiration < endDay) blockers.Add(ExpiryText(FleetRules.DocumentLabel(d.DocumentType), expiration));
            }
            foreach (var job in OpenShopJobs.Where(m => m.VehicleId == id && m.Status == MaintenanceStatus.Scheduled))
            {
                var day = FleetRules.FromStoredDate(job.ServiceDateUtc);
                if (day >= startDay && day <= endDay) blockers.Add($"taller programado el {Day(day)} ({job.Title})");
            }
            blockers.AddRange(Overlaps(start, end, excludeOrderId, o => o.VehicleIds.Contains(id)));
            var warnings = ServicesDue[id].Where(s => s.State == ExpirationState.Expired).Select(s => $"service vencido: {s.Title} ({s.DueText})").ToArray();
            return new ResourceStatus(id, FleetModule.Label(v), $"{v.Brand} {v.Model}".Trim(), blockers.ToArray(), warnings);
        }

        public ResourceStatus Person(Guid employeeId, DateTime start, DateTime end, Guid? excludeOrderId)
        {
            var name = Employees.TryGetValue(employeeId, out var e) ? e.FullName : "?";
            if (!Members.TryGetValue(employeeId, out var member))
                return new ResourceStatus(employeeId, name, null, ["no está en Flota → Personas"], []);
            var endDay = FleetRules.TodayInArgentina(end);
            var blockers = new List<string>();
            if (e is null || !e.IsActive) blockers.Add("no está activo en RRHH");
            var creds = Credentials[employeeId].ToList();
            foreach (var required in FleetRules.RequiredCredentials(member).Where(t => creds.All(c => c.Type != t)))
                blockers.Add($"sin {FleetRules.CredentialLabel(required)} cargada");
            foreach (var c in creds.OrderBy(c => c.ExpirationDateUtc))
            {
                var expiration = FleetRules.FromStoredDate(c.ExpirationDateUtc);
                if (expiration < endDay) blockers.Add(ExpiryText(FleetRules.CredentialLabel(c.Type), expiration));
            }
            blockers.AddRange(Overlaps(start, end, excludeOrderId, o => o.EmployeeIds.Contains(employeeId)).Select(t => t.Replace("ocupada", "ocupado")));
            var roles = new[]
            {
                member.IsCargoDriver ? "chofer de cargas" : member.IsDriver ? "chofer" : null,
                member.IsForkliftOperator ? "autoelevadorista" : null,
                member.IsTechnician ? "técnico" : null
            }.Where(r => r is not null);
            return new ResourceStatus(employeeId, name, string.Join(" · ", roles), blockers.ToArray(), []);
        }

        /// <summary>Problemas actuales de una orden programada (texto "Persona: motivo").</summary>
        public string[] Problems(ServiceOrder o)
        {
            if (o.StartUtc is not { } start || o.EndUtc is not { } end
                || o.Status is not (ServiceOrderStatus.Scheduled or ServiceOrderStatus.InProgress)) return [];
            return o.EmployeeIds.Select(id => Person(id, start, end, o.Id))
                .Concat(o.VehicleIds.Select(id => Vehicle(id, start, end, o.Id)))
                .Where(r => r.Blockers.Length > 0)
                .Select(r => $"{r.Label}: {string.Join("; ", r.Blockers)}")
                .ToArray();
        }
    }

    private static DateTimeOffset? Utc(DateTime? value) => value is { } v ? new DateTimeOffset(DateTime.SpecifyKind(v, DateTimeKind.Utc)) : null;

    private static ServiceOrderView ToView(ServiceOrder o, Snapshot s) => new(
        o.Id, o.Number, Code(o.Number), o.Status, o.CustomerId, o.CustomerName, o.SalesOrderId, o.SalesOrderNumber, o.Location,
        o.Description, Utc(o.StartUtc), Utc(o.EndUtc),
        o.EmployeeIds.Select(id => new ResourceRef(id, s.Employees.TryGetValue(id, out var e) ? e.FullName : "?")).ToArray(),
        o.VehicleIds.Select(id => new ResourceRef(id, s.Vehicles.TryGetValue(id, out var v) ? FleetModule.Label(v) : "?")).ToArray(),
        o.WorkPerformed, o.Observations, Utc(o.CompletedAtUtc), o.CreatedBy,
        o.EndUtc >= s.NowUtc.AddDays(-1) ? s.Problems(o) : []);

    // -------------------------------------------------------------
    // Lecturas de Ventas y CRM (misma base de la empresa; sin depender de esos módulos)
    // -------------------------------------------------------------
    private static async Task<List<T>> QueryAsync<T>(FleetDbContext db, string sql, Func<DbDataReader, T> map, CancellationToken ct, params (string Name, NpgsqlTypes.NpgsqlDbType Type, object? Value)[] args)
    {
        var connection = db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await connection.OpenAsync(ct);
        try
        {
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = sql;
            foreach (var (name, type, value) in args)
                cmd.Parameters.Add(new Npgsql.NpgsqlParameter(name, type) { Value = value ?? DBNull.Value });
            var list = new List<T>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) list.Add(map(reader));
            return list;
        }
        catch (Npgsql.PostgresException ex) when (ex.SqlState is Npgsql.PostgresErrorCodes.UndefinedTable or Npgsql.PostgresErrorCodes.InvalidSchemaName)
        {
            return [];
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }

    private const string CustomerNameSql = @"COALESCE(NULLIF(c.""TradeName"", ''), c.""LegalName"")";

    private static Task<List<(Guid Id, string Name)>> CustomersAsync(FleetDbContext db, Guid tenantId, string? search, Guid? id, CancellationToken ct) =>
        QueryAsync(db, $@"
            SELECT c.""Id"", {CustomerNameSql} FROM crm.customers c
            WHERE c.""TenantId"" = @t AND c.deleted_at_utc IS NULL
              AND (@id IS NULL OR c.""Id"" = @id)
              AND (@q = '' OR c.""LegalName"" ILIKE '%' || @q || '%' OR c.""TradeName"" ILIKE '%' || @q || '%')
            ORDER BY 2 LIMIT 20",
            r => (r.GetGuid(0), r.GetString(1)), ct,
            ("t", NpgsqlTypes.NpgsqlDbType.Uuid, tenantId), ("q", NpgsqlTypes.NpgsqlDbType.Text, (search ?? "").Trim()), ("id", NpgsqlTypes.NpgsqlDbType.Uuid, id));

    private static async Task<List<SalesOrderToCoordinate>> SalesOrdersAsync(FleetDbContext db, Guid tenantId, string? search, Guid? id, bool onlyOpen, CancellationToken ct)
    {
        var list = await QueryAsync(db, $@"
            SELECT o.""Id"", o.""OrderNumber"", o.""CustomerId"", COALESCE({CustomerNameSql}, ''), o.""Status"", o.""CreatedAtUtc""
            FROM sales.orders o LEFT JOIN crm.customers c ON c.""Id"" = o.""CustomerId""
            WHERE o.""TenantId"" = @t
              AND (@id IS NULL OR o.""Id"" = @id)
              AND (NOT @open OR o.""Status"" IN ('Confirmed', 'InPreparation', 'Dispatched'))
              AND (@q = '' OR o.""OrderNumber"" ILIKE '%' || @q || '%' OR c.""LegalName"" ILIKE '%' || @q || '%' OR c.""TradeName"" ILIKE '%' || @q || '%')
            ORDER BY o.""CreatedAtUtc"" DESC LIMIT 30",
            r => (Id: r.GetGuid(0), Number: r.GetString(1), CustomerId: r.GetGuid(2), Customer: r.GetString(3), Status: r.GetString(4), Created: r.GetDateTime(5)), ct,
            ("t", NpgsqlTypes.NpgsqlDbType.Uuid, tenantId), ("q", NpgsqlTypes.NpgsqlDbType.Text, (search ?? "").Trim()),
            ("id", NpgsqlTypes.NpgsqlDbType.Uuid, id), ("open", NpgsqlTypes.NpgsqlDbType.Boolean, onlyOpen));
        var ids = list.Select(x => x.Id).ToList();
        var counts = await db.ServiceOrders.AsNoTracking()
            .Where(o => o.TenantId == tenantId && o.SalesOrderId != null && ids.Contains(o.SalesOrderId.Value) && o.Status != ServiceOrderStatus.Cancelled)
            .GroupBy(o => o.SalesOrderId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        return list.Select(x => new SalesOrderToCoordinate(x.Id, x.Number, x.CustomerId, x.Customer, x.Status, x.Created, counts.GetValueOrDefault(x.Id))).ToList();
    }

    private static async Task<int> NextNumberAsync(FleetDbContext db, Guid tenantId, CancellationToken ct) =>
        (await db.ServiceOrders.Where(o => o.TenantId == tenantId).MaxAsync(o => (int?)o.Number, ct) ?? 0) + 1;

    /// <summary>Valida y aplica lo pedido. Devuelve el error, si lo hay (con el detalle de cada bloqueo).</summary>
    private static async Task<IResult?> ApplyAsync(FleetDbContext db, Guid tenantId, ServiceOrder o, SaveServiceOrderRequest req, DateTimeOffset now, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Description)) return Problem("Describí el trabajo a hacer.");
        if (req.Description.Trim().Length > 2000 || (req.Location ?? "").Trim().Length > 300) return Problem("Descripción o lugar demasiado largos.");
        if ((req.Start is null) != (req.End is null)) return Problem("Cargá el inicio y el fin, o ninguno de los dos (queda sin fecha, para coordinar).");
        if (req.Start is { } s0 && req.End is { } e0)
        {
            if (e0 <= s0) return Problem("El fin tiene que ser posterior al inicio.");
            if (e0 - s0 > TimeSpan.FromDays(31)) return Problem("Una orden no puede durar más de 31 días: dividila en varias.");
        }

        var customerId = req.CustomerId;
        var customerName = (req.CustomerName ?? "").Trim();
        string? salesOrderNumber = null;
        if (req.SalesOrderId is { } salesOrderId)
        {
            var so = (await SalesOrdersAsync(db, tenantId, null, salesOrderId, onlyOpen: false, ct)).FirstOrDefault();
            if (so is null) return Problem("El pedido de venta no existe.");
            salesOrderNumber = so.OrderNumber;
            customerId = so.CustomerId;
            customerName = so.CustomerName;
        }
        else if (customerId is { } cid)
        {
            var c = (await CustomersAsync(db, tenantId, null, cid, ct)).FirstOrDefault();
            if (c == default) return Problem("El cliente no existe.");
            customerName = c.Name;
        }
        if (customerName.Length == 0) return Problem("Elegí el cliente o el pedido de venta.");
        if (customerName.Length > 256) customerName = customerName[..256];

        var people = (req.EmployeeIds ?? []).Distinct().ToArray();
        var vehicles = (req.VehicleIds ?? []).Distinct().ToArray();
        DateTime? start = req.Start?.UtcDateTime, end = req.End?.UtcDateTime;

        if (start is { } st && end is { } en && (people.Length > 0 || vehicles.Length > 0))
        {
            var snapshot = await Snapshot.LoadAsync(db, tenantId, now, ct);
            var blocked = people.Select(id => snapshot.Person(id, st, en, o.Id))
                .Concat(vehicles.Select(id => snapshot.Vehicle(id, st, en, o.Id)))
                .Where(r => r.Blockers.Length > 0).ToList();
            if (blocked.Count > 0)
            {
                var problems = blocked.Select(r => $"{r.Label}: {string.Join("; ", r.Blockers)}").ToArray();
                return Results.BadRequest(new { detail = "No se puede asignar: " + string.Join(" · ", problems), problems });
            }
        }
        else if (people.Length > 0 || vehicles.Length > 0)
        {
            // Sin fecha no se puede controlar, pero sí que existan.
            var members = await db.Members.AsNoTracking().Where(m => m.TenantId == tenantId && people.Contains(m.EmployeeId)).CountAsync(ct);
            if (members != people.Length) return Problem("Hay personas que no están en Flota → Personas.");
            var units = await db.Vehicles.AsNoTracking().Where(v => v.TenantId == tenantId && vehicles.Contains(v.Id)).CountAsync(ct);
            if (units != vehicles.Length) return Problem("Hay unidades que no existen.");
        }

        o.Description = req.Description.Trim();
        o.Location = string.IsNullOrWhiteSpace(req.Location) ? null : req.Location.Trim();
        o.CustomerId = customerId;
        o.CustomerName = customerName;
        o.SalesOrderId = req.SalesOrderId;
        o.SalesOrderNumber = salesOrderNumber;
        o.StartUtc = start;
        o.EndUtc = end;
        o.EmployeeIds = people;
        o.VehicleIds = vehicles;
        if (o.Status is ServiceOrderStatus.Pending or ServiceOrderStatus.Scheduled)
            o.Status = start is null ? ServiceOrderStatus.Pending : ServiceOrderStatus.Scheduled;
        return null;
    }

    private static async Task<IResult> ViewAsync(FleetDbContext db, Guid tenantId, ServiceOrder o, TimeProvider clock, CancellationToken ct) =>
        Results.Ok(ToView(o, await Snapshot.LoadAsync(db, tenantId, clock.GetUtcNow(), ct)));

    public static void MapFleetServiceOrders(this RouteGroupBuilder group)
    {
        group.MapGet("/service-orders", async (string? status, string? search, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var q = db.ServiceOrders.AsNoTracking().Where(o => o.TenantId == tenantId);
            if (Enum.TryParse<ServiceOrderStatus>(status, true, out var st)) q = q.Where(o => o.Status == st);
            else if (status == "open") q = q.Where(o => o.Status != ServiceOrderStatus.Completed && o.Status != ServiceOrderStatus.Cancelled);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var text = search.Trim();
                var number = int.TryParse(text.ToUpperInvariant().Replace("OS-", ""), out var n) ? n : -1;
                q = q.Where(o => o.Number == number || EF.Functions.ILike(o.CustomerName, $"%{text}%")
                    || EF.Functions.ILike(o.Description, $"%{text}%") || (o.SalesOrderNumber != null && EF.Functions.ILike(o.SalesOrderNumber, $"%{text}%")));
            }
            var orders = await q.OrderBy(o => o.StartUtc == null ? 0 : 1).ThenByDescending(o => o.StartUtc).ThenByDescending(o => o.Number)
                .Take(300).ToListAsync(ct);
            var snapshot = await Snapshot.LoadAsync(db, tenantId, clock.GetUtcNow(), ct);
            return Results.Ok(orders.Select(o => ToView(o, snapshot)));
        });

        group.MapGet("/service-orders/{id:guid}", async (Guid id, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var o = await db.ServiceOrders.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            return o is null ? Results.NotFound(new { detail = "Orden no encontrada." }) : await ViewAsync(db, tenantId, o, clock, ct);
        });

        // Para elegir a quién y qué asignar: cada persona y unidad con sus bloqueos en ese horario.
        group.MapGet("/service-orders/availability", async (DateTimeOffset start, DateTimeOffset end, Guid? excludeId, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            if (end <= start) return Problem("El fin tiene que ser posterior al inicio.");
            var tenantId = tenant.TenantId.Value;
            var s = await Snapshot.LoadAsync(db, tenantId, clock.GetUtcNow(), ct);
            var people = s.Members.Keys
                .Where(id => s.Employees.TryGetValue(id, out var e) && e.IsActive)
                .Select(id => s.Person(id, start.UtcDateTime, end.UtcDateTime, excludeId))
                .OrderBy(r => r.Blockers.Length > 0).ThenBy(r => r.Label);
            var vehicles = s.Vehicles.Values.Where(v => v.Status != VehicleStatus.Sold)
                .Select(v => s.Vehicle(v.Id, start.UtcDateTime, end.UtcDateTime, excludeId))
                .OrderBy(r => r.Blockers.Length > 0).ThenBy(r => r.Label);
            return Results.Ok(new { people, vehicles });
        });

        group.MapGet("/service-orders/customers", async (string? search, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok((await CustomersAsync(db, tenant.TenantId.Value, search, null, ct)).Select(c => new { c.Id, c.Name })));

        group.MapGet("/service-orders/sales-orders", async (string? search, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await SalesOrdersAsync(db, tenant.TenantId.Value, search, null, onlyOpen: true, ct)));

        group.MapPost("/service-orders", async (SaveServiceOrderRequest req, HttpContext http, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var now = clock.GetUtcNow();
            var o = new ServiceOrder { Id = Guid.NewGuid(), TenantId = tenantId, CreatedBy = FleetModule.UserName(http), CreatedAtUtc = now.UtcDateTime };
            if (await ApplyAsync(db, tenantId, o, req, now, ct) is { } error) return error;
            db.ServiceOrders.Add(o);
            // Número correlativo por empresa; si dos se crean a la vez, el índice único obliga a reintentar.
            for (var attempt = 0; ; attempt++)
            {
                o.Number = await NextNumberAsync(db, tenantId, ct);
                try
                {
                    await db.SaveChangesAsync(ct);
                    break;
                }
                catch (DbUpdateException ex) when (attempt < 3 && ex.InnerException is Npgsql.PostgresException { SqlState: Npgsql.PostgresErrorCodes.UniqueViolation })
                {
                }
            }
            var view = ToView(o, await Snapshot.LoadAsync(db, tenantId, now, ct));
            return Results.Created($"/api/v1/fleet/service-orders/{o.Id}", view);
        });

        group.MapPut("/service-orders/{id:guid}", async (Guid id, SaveServiceOrderRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var o = await db.ServiceOrders.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (o is null) return Results.NotFound(new { detail = "Orden no encontrada." });
            if (o.Status is ServiceOrderStatus.Completed or ServiceOrderStatus.Cancelled) return Problem("Una orden terminada o cancelada ya no se modifica.");
            if (o.Status == ServiceOrderStatus.InProgress && req.Start is null) return Problem("Una orden en curso tiene que tener inicio y fin.");
            if (await ApplyAsync(db, tenantId, o, req, clock.GetUtcNow(), ct) is { } error) return error;
            await db.SaveChangesAsync(ct);
            return await ViewAsync(db, tenantId, o, clock, ct);
        });

        group.MapPost("/service-orders/{id:guid}/start", async (Guid id, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var o = await db.ServiceOrders.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (o is null) return Results.NotFound(new { detail = "Orden no encontrada." });
            if (o.Status != ServiceOrderStatus.Scheduled) return Problem("Solo se inicia una orden programada (con fecha).");
            o.Status = ServiceOrderStatus.InProgress;
            await db.SaveChangesAsync(ct);
            return await ViewAsync(db, tenantId, o, clock, ct);
        });

        group.MapPost("/service-orders/{id:guid}/complete", async (Guid id, CompleteServiceOrderRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var o = await db.ServiceOrders.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (o is null) return Results.NotFound(new { detail = "Orden no encontrada." });
            if (o.Status is not (ServiceOrderStatus.Scheduled or ServiceOrderStatus.InProgress)) return Problem("Solo se termina una orden programada o en curso.");
            if (string.IsNullOrWhiteSpace(req.WorkPerformed)) return Problem("Contá qué trabajo se hizo.");
            if (req.WorkPerformed.Trim().Length > 4000 || (req.Observations ?? "").Trim().Length > 2000) return Problem("El texto es demasiado largo.");
            o.Status = ServiceOrderStatus.Completed;
            o.WorkPerformed = req.WorkPerformed.Trim();
            o.Observations = string.IsNullOrWhiteSpace(req.Observations) ? null : req.Observations.Trim();
            o.CompletedAtUtc = clock.GetUtcNow().UtcDateTime;
            await db.SaveChangesAsync(ct);
            return await ViewAsync(db, tenantId, o, clock, ct);
        });

        group.MapPost("/service-orders/{id:guid}/cancel", async (Guid id, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var o = await db.ServiceOrders.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
            if (o is null) return Results.NotFound(new { detail = "Orden no encontrada." });
            if (o.Status == ServiceOrderStatus.Completed) return Problem("Una orden terminada no se cancela.");
            o.Status = ServiceOrderStatus.Cancelled;
            await db.SaveChangesAsync(ct);
            return await ViewAsync(db, tenantId, o, clock, ct);
        });

        // Agenda: órdenes del período, vencimientos, talleres programados, órdenes sin fecha y pedidos sin coordinar.
        group.MapGet("/agenda", async (string? from, int? days, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            var start = FleetRules.TryParseDate(from, out var parsed) ? parsed : today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
            var span = Math.Clamp(days ?? 7, 1, 42);
            var end = start.AddDays(span - 1);
            // Días civiles de Argentina (UTC-3) como instantes.
            var startUtc = new DateTime(start.Year, start.Month, start.Day, 3, 0, 0, DateTimeKind.Utc);
            var endUtc = new DateTime(end.Year, end.Month, end.Day, 3, 0, 0, DateTimeKind.Utc).AddDays(1);

            var snapshot = await Snapshot.LoadAsync(db, tenantId, clock.GetUtcNow(), ct);
            var orders = await db.ServiceOrders.AsNoTracking()
                .Where(o => o.TenantId == tenantId && o.Status != ServiceOrderStatus.Cancelled && o.StartUtc < endUtc && o.EndUtc > startUtc)
                .OrderBy(o => o.StartUtc).ToListAsync(ct);
            var unscheduled = await db.ServiceOrders.AsNoTracking()
                .Where(o => o.TenantId == tenantId && o.Status == ServiceOrderStatus.Pending)
                .OrderBy(o => o.Number).Take(50).ToListAsync(ct);

            var events = new List<AgendaEvent>();
            foreach (var v in snapshot.Vehicles.Values.Where(v => v.Status != VehicleStatus.Sold))
                foreach (var d in snapshot.Documents[v.Id])
                {
                    var day = FleetRules.FromStoredDate(d.ExpirationDateUtc);
                    if (day >= start && day <= end)
                        events.Add(new AgendaEvent(day.ToString("yyyy-MM-dd"), "expiration", $"{FleetModule.Label(v)} — vence {FleetRules.DocumentLabel(d.DocumentType)}", null, $"/flota/vehiculos/{v.Id}"));
                }
            foreach (var (employeeId, member) in snapshot.Members)
                foreach (var c in snapshot.Credentials[employeeId])
                {
                    var day = FleetRules.FromStoredDate(c.ExpirationDateUtc);
                    if (day >= start && day <= end)
                        events.Add(new AgendaEvent(day.ToString("yyyy-MM-dd"), "expiration",
                            $"{(snapshot.Employees.TryGetValue(employeeId, out var e) ? e.FullName : "?")} — vence {FleetRules.CredentialLabel(c.Type)}", null, $"/flota/personas/{member.Id}"));
                }
            foreach (var m in snapshot.OpenShopJobs)
            {
                var day = FleetRules.FromStoredDate(m.ServiceDateUtc);
                var label = snapshot.Vehicles.TryGetValue(m.VehicleId, out var v) ? FleetModule.Label(v) : "?";
                if (m.Status == MaintenanceStatus.InProgress || (day >= start && day <= end))
                    events.Add(new AgendaEvent((m.Status == MaintenanceStatus.InProgress && day < start ? start : day).ToString("yyyy-MM-dd"), "shop",
                        $"{label} — {(m.Status == MaintenanceStatus.InProgress ? "en taller" : "taller")}: {m.Title}", null, $"/flota/vehiculos/{m.VehicleId}"));
            }

            var toCoordinate = (await SalesOrdersAsync(db, tenantId, null, null, onlyOpen: true, ct)).Where(s => s.ServiceOrders == 0).Take(20);
            return Results.Ok(new
            {
                from = start.ToString("yyyy-MM-dd"),
                to = end.ToString("yyyy-MM-dd"),
                orders = orders.Select(o => ToView(o, snapshot)),
                events = events.OrderBy(e => e.Date).ThenBy(e => e.Title),
                unscheduled = unscheduled.Select(o => ToView(o, snapshot)),
                toCoordinate
            });
        });
    }

    /// <summary>Órdenes programadas de los próximos días con algo vencido u ocupado (para los avisos).</summary>
    public static async Task<List<(ServiceOrder Order, string[] Problems)>> UpcomingProblemsAsync(FleetDbContext db, Guid tenantId, DateOnly today, CancellationToken ct)
    {
        // Desde el comienzo del día de Argentina.
        var now = new DateTime(today.Year, today.Month, today.Day, 3, 0, 0, DateTimeKind.Utc);
        var until = now.AddDays(15);
        var orders = await db.ServiceOrders.AsNoTracking()
            .Where(o => o.TenantId == tenantId && (o.Status == ServiceOrderStatus.Scheduled || o.Status == ServiceOrderStatus.InProgress)
                && o.EndUtc > now && o.StartUtc < until)
            .OrderBy(o => o.StartUtc).ToListAsync(ct);
        if (orders.Count == 0) return [];
        var snapshot = await Snapshot.LoadAsync(db, tenantId, new DateTimeOffset(now), ct);
        return orders.Select(o => (o, snapshot.Problems(o))).Where(x => x.Item2.Length > 0).ToList();
    }
}
