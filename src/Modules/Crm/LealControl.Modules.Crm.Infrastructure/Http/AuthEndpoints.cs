using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Settings;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace LealControl.Modules.Crm.Infrastructure.Http;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var auth = endpoints.MapGroup("/api/v1/auth").WithTags("Authentication & Tenancy");

        // 1. Login
        auth.MapPost("/login", async ([FromBody] LoginRequest req, CrmDbContext db, IConfiguration configuration, CancellationToken ct) =>
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            {
                return Results.BadRequest(new { message = "Email y contraseña son obligatorios." });
            }

            var email = req.Email.Trim().ToLowerInvariant();
            var masterConnStr = configuration.GetConnectionString("Database")
                ?? db.Database.GetConnectionString()
                ?? throw new InvalidOperationException("ConnectionStrings:Database no configurada.");

            var memberships = await MultiTenantAuthResolver.FindAllAsync(masterConnStr, email, req.Password, ct);

            if (memberships.Count > 1 && (!req.TenantId.HasValue || req.TenantId.Value == Guid.Empty))
            {
                return Results.Ok(new
                {
                    requiresTenantSelection = true,
                    availableTenants = MultiTenantAuthResolver.ToSummaries(memberships)
                });
            }

            if (memberships.Count > 0)
            {
                TenantMembership active;
                if (req.TenantId.HasValue && req.TenantId.Value != Guid.Empty)
                {
                    var selected = memberships.FirstOrDefault(m => m.TenantId == req.TenantId.Value);
                    if (selected == null)
                    {
                        return Results.BadRequest(new { message = "No tenés acceso a la empresa seleccionada." });
                    }

                    active = selected;
                }
                else
                {
                    active = memberships[0];
                }

                var sharedUser = await db.TenantUsers
                    .FirstOrDefaultAsync(u => u.Id == active.UserId && u.TenantId == new TenantId(active.TenantId) && u.IsActive, ct);
                if (sharedUser != null)
                {
                    sharedUser.RecordLogin();
                    await db.SaveChangesAsync(ct);
                }

                return Results.Ok(MultiTenantAuthResolver.ToAuthResponse(active, memberships));
            }

            return Results.BadRequest(new { message = "Usuario no encontrado o inactivo." });
        }).RequireRateLimiting("auth-policy").AllowAnonymous();

        // 2. Register new Tenant from scratch (disabled in Production — use SuperAdmin provisioning)
        auth.MapPost("/register-tenant", async ([FromBody] RegisterTenantRequest req, CrmDbContext db, IHostEnvironment env, CancellationToken ct) =>
        {
            if (env.IsProduction())
            {
                return Results.Json(
                    new { message = "El registro público está deshabilitado. Solicitá una demo en www.lealcontrol.com" },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            if (req == null || string.IsNullOrWhiteSpace(req.CompanyName))
            {
                return Results.BadRequest(new { message = "El nombre de la empresa es obligatorio." });
            }
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            {
                return Results.BadRequest(new { message = "Email y contraseña del administrador son obligatorios." });
            }

            var newTenantId = new TenantId(Guid.NewGuid());
            var companyName = req.CompanyName.Trim();
            var docNumber = string.IsNullOrWhiteSpace(req.Cuit) ? "30000000001" : req.Cuit.Trim();
            var adminName = string.IsNullOrWhiteSpace(req.AdminFullName) ? "Administrador" : req.AdminFullName.Trim();
            var email = req.Email.Trim().ToLowerInvariant();

            var settings = new CompanySettings
            {
                TenantId = newTenantId,
                LegalName = companyName,
                TradeName = companyName,
                DocumentType = "Cuit",
                DocumentNumber = docNumber,
                TaxCondition = "ResponsableInscripto",
                IibbRegime = "ConvenioMultilateral",
                Email = email,
                Phone = req.Phone?.Trim(),
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            db.CompanySettings.Add(settings);

            var adminUser = TenantUser.Create(newTenantId, adminName, email, "Admin", req.Password);
            db.TenantUsers.Add(adminUser);

            await db.SaveChangesAsync(ct);

            var token = SimpleJwt.CreateToken(
                adminUser.Id,
                adminUser.Email,
                adminUser.FullName,
                adminUser.Role,
                newTenantId.Value,
                companyName,
                adminUser.AllowedModulesJson,
                adminUser.IsTechnicalDirector);

            var availableTenants = new List<TenantSummaryDto>
            {
                new(newTenantId.Value, companyName, companyName, docNumber)
            };

            return Results.Ok(new AuthResponse(
                token,
                new UserDto(adminUser.Id, adminUser.FullName, adminUser.Email, adminUser.Role, adminUser.AllowedModulesJson, adminUser.IsTechnicalDirector),
                new TenantSummaryDto(newTenantId.Value, companyName, companyName, docNumber),
                availableTenants
            ));
        }).RequireRateLimiting("auth-policy").AllowAnonymous();

        // 3. Me
        auth.MapGet("/me", async (HttpContext http, ITenantContext tenantContext, CrmDbContext db, IConfiguration configuration, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var masterConnStr = configuration.GetConnectionString("Database")
                ?? db.Database.GetConnectionString()
                ?? throw new InvalidOperationException("ConnectionStrings:Database no configurada.");

            var emailFromToken = http.User.FindFirst("email")?.Value;
            TenantUser? user = null;
            if (Guid.TryParse(http.User.FindFirst("sub")?.Value, out var userIdFromToken))
            {
                user = await db.TenantUsers.FirstOrDefaultAsync(
                    u => u.Id == userIdFromToken && u.TenantId == tenantId && u.IsActive,
                    ct);
            }

            if (user == null && !string.IsNullOrWhiteSpace(emailFromToken))
            {
                user = await db.TenantUsers.FirstOrDefaultAsync(
                    u => u.Email.ToLower() == emailFromToken.ToLower() && u.TenantId == tenantId && u.IsActive,
                    ct);
            }

            IReadOnlyList<TenantMembership> memberships = [];
            if (!string.IsNullOrWhiteSpace(emailFromToken))
            {
                memberships = await MultiTenantAuthResolver.FindAllAsync(masterConnStr, emailFromToken, password: null, ct);
            }

            var activeMembership = memberships.FirstOrDefault(m => m.TenantId == tenantId.Value);
            var tenantSettings = await db.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
            var tenantName = activeMembership?.LegalName
                ?? tenantSettings?.LegalName
                ?? tenantSettings?.TradeName
                ?? "LEAL CONTROL ERP S.A.";
            var tradeName = activeMembership?.TradeName ?? tenantSettings?.TradeName;
            var docNumber = activeMembership?.DocumentNumber ?? tenantSettings?.DocumentNumber ?? "";

            UserDto? userDto = null;
            if (user != null)
            {
                userDto = new UserDto(user.Id, user.FullName, user.Email, user.Role, user.AllowedModulesJson, user.IsTechnicalDirector);
            }
            else if (activeMembership != null)
            {
                userDto = new UserDto(
                    activeMembership.UserId,
                    activeMembership.FullName,
                    activeMembership.Email,
                    activeMembership.Role,
                    activeMembership.AllowedModulesJson,
                    activeMembership.IsTechnicalDirector);
            }

            var availableTenants = memberships.Count > 0
                ? MultiTenantAuthResolver.ToSummaries(memberships)
                : new List<TenantSummaryDto>
                {
                    new(tenantId.Value, tenantName, tradeName, docNumber)
                };

            if (userDto is null)
            {
                return Results.Json(
                    new { message = "Sesión inválida. Volvé a iniciar sesión." },
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            return Results.Ok(new
            {
                User = userDto,
                Tenant = new TenantSummaryDto(tenantId.Value, tenantName, tradeName, docNumber),
                AvailableTenants = availableTenants
            });
        });

        // 4. Switch Tenant
        auth.MapPost("/switch-tenant", async ([FromBody] SwitchTenantRequest req, HttpContext http, CrmDbContext db, IConfiguration configuration, CancellationToken ct) =>
        {
            if (req == null) return Results.BadRequest(new { message = "Petición inválida." });

            var targetTenantId = req.TenantId;
            var masterConnStr = configuration.GetConnectionString("Database")
                ?? db.Database.GetConnectionString()
                ?? throw new InvalidOperationException("ConnectionStrings:Database no configurada.");

            var email = http.User.FindFirst("email")?.Value;
            if (string.IsNullOrWhiteSpace(email))
            {
                return Results.Json(new { message = "Sesión inválida." }, statusCode: StatusCodes.Status401Unauthorized);
            }

            var memberships = await MultiTenantAuthResolver.FindAllAsync(masterConnStr, email, password: null, ct);
            var active = memberships.FirstOrDefault(m => m.TenantId == targetTenantId);
            if (active == null)
            {
                return Results.Json(new { message = "No tenés acceso a esa empresa." }, statusCode: StatusCodes.Status403Forbidden);
            }

            return Results.Ok(MultiTenantAuthResolver.ToAuthResponse(active, memberships));
        }).RequireRateLimiting("auth-policy");

        // 5. List all registered Tenants
        auth.MapGet("/tenants", async (ITenantContext tenantContext, CrmDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var list = await db.CompanySettings
                .AsNoTracking()
                .Where(s => s.TenantId == tenantId)
                .Select(s => new TenantSummaryDto(s.TenantId.Value, s.LegalName, s.TradeName, s.DocumentNumber))
                .ToListAsync(ct);

            return Results.Ok(list);
        });

        return endpoints;
    }
}

public sealed record DecodedToken(Guid? UserId, string? Email, string? FullName, string? Role, Guid? TenantId);

public static class SimpleJwt
{
    public static string SecretKey { get; set; } =
        Environment.GetEnvironmentVariable("JWT_SECRET")
        ?? "DevOnly_LealControl_Local_JWT_Key_Not_For_Production_Use_32b!";

    public static string Issuer { get; set; } = "lealcontrol";

    public static string Audience { get; set; } = "lealcontrol-web";

    public static int LifetimeHours { get; set; } = 8;

    public static byte[] GetSecretBytes() => Encoding.UTF8.GetBytes(SecretKey);

    public static string CreateToken(
        Guid userId,
        string email,
        string fullName,
        string role,
        Guid tenantId,
        string tenantName,
        string? allowedModulesJson = null,
        bool isTechnicalDirector = false)
    {
        var now = DateTimeOffset.UtcNow;
        var header = new { alg = "HS256", typ = "JWT" };
        var allowedModules = ParseAllowedModules(allowedModulesJson);
        // Guardar como string JSON (no array nativo) para que JwtBearer entregue un solo claim
        // que ContractedModuleMiddleware pueda deserializar de forma fiable.
        var payload = new Dictionary<string, object>
        {
            ["iss"] = Issuer,
            ["aud"] = Audience,
            ["sub"] = userId.ToString(),
            ["email"] = email,
            ["name"] = fullName,
            ["role"] = role,
            ["tenant_id"] = tenantId.ToString(),
            ["tenant_name"] = tenantName,
            ["allowed_modules"] = JsonSerializer.Serialize(allowedModules),
            ["technical_director"] = isTechnicalDirector ? "true" : "false",
            ["nbf"] = now.ToUnixTimeSeconds(),
            ["iat"] = now.ToUnixTimeSeconds(),
            ["exp"] = now.AddHours(LifetimeHours).ToUnixTimeSeconds()
        };

        string headerB64 = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(header));
        string payloadB64 = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(payload));
        string signatureB64 = ComputeSignature($"{headerB64}.{payloadB64}");

        return $"{headerB64}.{payloadB64}.{signatureB64}";
    }

    private static readonly HashSet<string> TemporarilyDisabledModules = new(StringComparer.OrdinalIgnoreCase)
    {
        "crm"
    };

    private static string[] ParseAllowedModules(string? allowedModulesJson)
    {
        if (string.IsNullOrWhiteSpace(allowedModulesJson))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<string[]>(allowedModulesJson)?
                .Where(m => !string.IsNullOrWhiteSpace(m) && !TemporarilyDisabledModules.Contains(m)
                    && (string.Equals(Environment.GetEnvironmentVariable("Communications__InboxEnabled"), "true", StringComparison.OrdinalIgnoreCase)
                        || !string.Equals(m, "communications", StringComparison.OrdinalIgnoreCase)))
                .ToArray()
                ?? [];
        }
        catch
        {
            return [];
        }
    }

    public static DecodedToken? DecodeToken(string token)
    {
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 3) return null;

            // Verify signature
            var expectedSignature = ComputeSignature($"{parts[0]}.{parts[1]}");
            var sigBytes = Encoding.UTF8.GetBytes(parts[2]);
            var expectedBytes = Encoding.UTF8.GetBytes(expectedSignature);
            if (!CryptographicOperations.FixedTimeEquals(sigBytes, expectedBytes))
            {
                return null;
            }

            var payloadJson = Encoding.UTF8.GetString(Base64UrlDecode(parts[1]));
            using var doc = JsonDocument.Parse(payloadJson);
            var root = doc.RootElement;

            // Verify expiration
            if (root.TryGetProperty("exp", out var expProp) && expProp.TryGetInt64(out var expUnix))
            {
                if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expUnix)
                    return null;
            }

            Guid? userId = root.TryGetProperty("sub", out var sub) && Guid.TryParse(sub.GetString(), out var uid) ? uid : null;
            string? email = root.TryGetProperty("email", out var em) ? em.GetString() : null;
            string? name = root.TryGetProperty("name", out var nm) ? nm.GetString() : null;
            string? role = root.TryGetProperty("role", out var rl) ? rl.GetString() : null;
            Guid? tenantId = root.TryGetProperty("tenant_id", out var tid) && Guid.TryParse(tid.GetString(), out var tGuid) ? tGuid : null;

            return new DecodedToken(userId, email, name, role, tenantId);
        }
        catch
        {
            return null;
        }
    }

    private static string ComputeSignature(string data)
    {
        using var hmac = new HMACSHA256(GetSecretBytes());
        byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(data));
        return Base64UrlEncode(hash);
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static byte[] Base64UrlDecode(string input)
    {
        string output = input.Replace('-', '+').Replace('_', '/');
        switch (output.Length % 4)
        {
            case 2: output += "=="; break;
            case 3: output += "="; break;
        }
        return Convert.FromBase64String(output);
    }
}

public sealed record LoginRequest(string Email, string Password, Guid? TenantId);
public sealed record RegisterTenantRequest(string CompanyName, string? Cuit, string? Phone, string? AdminFullName, string Email, string Password);
public sealed record SwitchTenantRequest(Guid TenantId);
public sealed record UserDto(Guid Id, string FullName, string Email, string Role, string? AllowedModulesJson = null, bool IsTechnicalDirector = false);
public sealed record TenantSummaryDto(Guid Id, string LegalName, string? TradeName, string DocumentNumber);
public sealed record AuthResponse(string Token, UserDto User, TenantSummaryDto Tenant, IReadOnlyList<TenantSummaryDto> AvailableTenants);
