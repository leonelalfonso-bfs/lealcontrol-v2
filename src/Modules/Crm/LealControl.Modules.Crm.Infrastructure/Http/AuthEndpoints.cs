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
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;

namespace LealControl.Modules.Crm.Infrastructure.Http;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var auth = endpoints.MapGroup("/api/v1/auth").WithTags("Authentication & Tenancy");

        // 1. Login
        auth.MapPost("/login", async ([FromBody] LoginRequest req, CrmDbContext db, IServiceProvider sp, CancellationToken ct) =>
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            {
                return Results.BadRequest(new { message = "Email y contraseña son obligatorios." });
            }

            var email = req.Email.Trim().ToLowerInvariant();
            var users = await db.TenantUsers.Where(u => u.Email.ToLower() == email && u.IsActive).ToListAsync(ct);

            // If user found in local DB
            if (users.Count > 0)
            {
                TenantUser? matchingUser = null;
                if (req.TenantId.HasValue && req.TenantId.Value != Guid.Empty)
                {
                    var reqTid = new TenantId(req.TenantId.Value);
                    matchingUser = users.FirstOrDefault(u => u.TenantId == reqTid && u.VerifyPassword(req.Password));
                }

                matchingUser ??= users.FirstOrDefault(u => u.VerifyPassword(req.Password));

                if (matchingUser == null)
                {
                    return Results.BadRequest(new { message = "Contraseña incorrecta." });
                }

                matchingUser.RecordLogin();
                await db.SaveChangesAsync(ct);

                var tenantSettings = await db.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == matchingUser.TenantId, ct);
                var tenantName = tenantSettings?.LegalName ?? tenantSettings?.TradeName ?? "LEAL CONTROL ERP S.A.";
                var docNumber = tenantSettings?.DocumentNumber ?? "30715489629";

                var token = SimpleJwt.CreateToken(matchingUser.Id, matchingUser.Email, matchingUser.FullName, matchingUser.Role, matchingUser.TenantId.Value, tenantName);

                // Available tenants ONLY for this specific user (never leak other clients' companies!)
                var userTenantIds = users.Where(u => u.VerifyPassword(req.Password)).Select(u => u.TenantId).Distinct().ToList();
                var availableTenants = await db.CompanySettings
                    .AsNoTracking()
                    .Where(s => userTenantIds.Contains(s.TenantId))
                    .Select(s => new TenantSummaryDto(s.TenantId.Value, s.LegalName, s.TradeName, s.DocumentNumber))
                    .ToListAsync(ct);

                return Results.Ok(new AuthResponse(
                    token,
                    new UserDto(matchingUser.Id, matchingUser.FullName, matchingUser.Email, matchingUser.Role, matchingUser.AllowedModulesJson),
                    new TenantSummaryDto(matchingUser.TenantId.Value, tenantName, tenantSettings?.TradeName, docNumber),
                    availableTenants
                ));
            }

            // If not found in primary DB, check Master Catalog for dedicated tenant databases
            try
            {
                var connStr = db.Database.GetConnectionString() ?? "Host=localhost;Port=5432;Database=lealcontrol;Username=leal;Password=leal";
                using var masterConn = new NpgsqlConnection(connStr);
                await masterConn.OpenAsync(ct);

                using var masterCmd = new NpgsqlCommand("SELECT \"Id\", \"Name\", \"DbName\", \"AdminFullName\" FROM public.master_tenants WHERE lower(\"AdminEmail\") = @email AND \"IsActive\" = true LIMIT 1", masterConn);
                masterCmd.Parameters.AddWithValue("email", email);
                using var reader = await masterCmd.ExecuteReaderAsync(ct);
                if (await reader.ReadAsync(ct))
                {
                    var tenantId = reader.GetGuid(0);
                    var tenantName = reader.GetString(1);
                    var dbName = reader.GetString(2);
                    var adminFullName = reader.IsDBNull(3) ? "Administrador" : reader.GetString(3);
                    await reader.CloseAsync();

                    // Check password in tenant's DB
                    var tenantBuilder = new NpgsqlConnectionStringBuilder(connStr) { Database = dbName };
                    using var tenantConn = new NpgsqlConnection(tenantBuilder.ConnectionString);
                    await tenantConn.OpenAsync(ct);

                        using var checkCmd = new NpgsqlCommand("SELECT \"Id\", \"PasswordHash\", \"Role\" FROM public.tenant_users WHERE lower(\"Email\") = @email AND \"IsActive\" = true LIMIT 1", tenantConn);
                    checkCmd.Parameters.AddWithValue("email", email);
                    using var userReader = await checkCmd.ExecuteReaderAsync(ct);
                    if (await userReader.ReadAsync(ct))
                    {
                        var userId = userReader.GetGuid(0);
                        var pwdHash = userReader.GetString(1);
                        var role = userReader.IsDBNull(2) ? "Admin" : userReader.GetString(2);
                        await userReader.CloseAsync();

                        if (!PasswordSecurity.VerifyPassword(req.Password, pwdHash))
                        {
                            return Results.BadRequest(new { message = "Contraseña incorrecta." });
                        }

                        var token = SimpleJwt.CreateToken(userId, email, adminFullName, role, tenantId, tenantName);
                        var singleTenantList = new List<TenantSummaryDto>
                        {
                            new(tenantId, tenantName, tenantName, "")
                        };

                        return Results.Ok(new AuthResponse(
                            token,
                            new UserDto(userId, adminFullName, email, role),
                            new TenantSummaryDto(tenantId, tenantName, tenantName, ""),
                            singleTenantList
                        ));
                    }
                }
            }
            catch
            {
                // Fallthrough to not found
            }

            // Fallback for default development admin
            if (email == "admin@lealcontrol.com" || email == "admin@leal.com" || email == "admin")
            {
                var devTenantId = new TenantId(Guid.Parse("11111111-1111-1111-1111-111111111111"));
                var newAdmin = TenantUser.Create(devTenantId, "Administrador Leal", email, "Admin", "admin123");
                db.TenantUsers.Add(newAdmin);
                await db.SaveChangesAsync(ct);

                var devSettings = await db.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == devTenantId, ct);
                var token = SimpleJwt.CreateToken(newAdmin.Id, newAdmin.Email, newAdmin.FullName, newAdmin.Role, devTenantId.Value, devSettings?.LegalName ?? "LEAL CONTROL ERP S.A.");

                return Results.Ok(new AuthResponse(
                    token,
                    new UserDto(newAdmin.Id, newAdmin.FullName, newAdmin.Email, newAdmin.Role, newAdmin.AllowedModulesJson),
                    new TenantSummaryDto(devTenantId.Value, devSettings?.LegalName ?? "LEAL CONTROL ERP S.A.", devSettings?.TradeName, devSettings?.DocumentNumber ?? "30715489629"),
                    new List<TenantSummaryDto> { new(devTenantId.Value, devSettings?.LegalName ?? "LEAL CONTROL ERP S.A.", devSettings?.TradeName, devSettings?.DocumentNumber ?? "30715489629") }
                ));
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

            var token = SimpleJwt.CreateToken(adminUser.Id, adminUser.Email, adminUser.FullName, adminUser.Role, newTenantId.Value, companyName);

            var availableTenants = new List<TenantSummaryDto>
            {
                new(newTenantId.Value, companyName, companyName, docNumber)
            };

            return Results.Ok(new AuthResponse(
                token,
                new UserDto(adminUser.Id, adminUser.FullName, adminUser.Email, adminUser.Role, adminUser.AllowedModulesJson),
                new TenantSummaryDto(newTenantId.Value, companyName, companyName, docNumber),
                availableTenants
            ));
        }).RequireRateLimiting("auth-policy").AllowAnonymous();

        // 3. Me
        auth.MapGet("/me", async (HttpContext http, ITenantContext tenantContext, CrmDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var tenantSettings = await db.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
            var tenantName = tenantSettings?.LegalName ?? tenantSettings?.TradeName ?? "LEAL CONTROL ERP S.A.";

            // Resolve exact user from JWT Bearer token
            TenantUser? user = null;
            var authHeader = http.Request.Headers["Authorization"].ToString();
            if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                var token = authHeader.Substring(7).Trim();
                var tokenUser = SimpleJwt.DecodeToken(token);
                if (tokenUser?.UserId != null)
                {
                    user = await db.TenantUsers.FirstOrDefaultAsync(u => u.Id == tokenUser.UserId.Value && u.TenantId == tenantId && u.IsActive, ct);
                }
                if (user == null && !string.IsNullOrWhiteSpace(tokenUser?.Email))
                {
                    user = await db.TenantUsers.FirstOrDefaultAsync(u => u.Email.ToLower() == tokenUser.Email.ToLower() && u.TenantId == tenantId && u.IsActive, ct);
                }
            }

            user ??= await db.TenantUsers.FirstOrDefaultAsync(u => u.TenantId == tenantId && u.IsActive, ct);

            // ONLY return the caller's tenant
            var availableTenants = new List<TenantSummaryDto>
            {
                new(tenantId.Value, tenantName, tenantSettings?.TradeName, tenantSettings?.DocumentNumber ?? "")
            };

            return Results.Ok(new
            {
                User = user != null ? new UserDto(user.Id, user.FullName, user.Email, user.Role, user.AllowedModulesJson) : null,
                Tenant = new TenantSummaryDto(tenantId.Value, tenantName, tenantSettings?.TradeName, tenantSettings?.DocumentNumber ?? ""),
                AvailableTenants = availableTenants
            });
        });

        // 4. Switch Tenant
        auth.MapPost("/switch-tenant", async ([FromBody] SwitchTenantRequest req, HttpContext http, ITenantContext tenantContext, CrmDbContext db, CancellationToken ct) =>
        {
            if (req == null) return Results.BadRequest(new { message = "Petición inválida." });

            var targetTenantId = new TenantId(req.TenantId);
            var tenantSettings = await db.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == targetTenantId, ct);
            if (tenantSettings == null)
            {
                return Results.BadRequest(new { message = "La empresa seleccionada no existe." });
            }

            // Look for matching user by email from current token if available
            TenantUser? user = null;
            var authHeader = http.Request.Headers["Authorization"].ToString();
            if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                var token = authHeader.Substring(7).Trim();
                var tokenUser = SimpleJwt.DecodeToken(token);
                if (!string.IsNullOrWhiteSpace(tokenUser?.Email))
                {
                    user = await db.TenantUsers.FirstOrDefaultAsync(u => u.Email.ToLower() == tokenUser.Email.ToLower() && u.TenantId == targetTenantId && u.IsActive, ct);
                }
            }

            if (user == null)
            {
                return Results.Json(new { message = "No tenés acceso a esa empresa." }, statusCode: StatusCodes.Status403Forbidden);
            }

            var tokenOut = SimpleJwt.CreateToken(user.Id, user.Email, user.FullName, user.Role, targetTenantId.Value, tenantSettings.LegalName);

            var availableTenants = new List<TenantSummaryDto>
            {
                new(targetTenantId.Value, tenantSettings.LegalName, tenantSettings.TradeName, tenantSettings.DocumentNumber)
            };

            return Results.Ok(new AuthResponse(
                tokenOut,
                new UserDto(user.Id, user.FullName, user.Email, user.Role, user.AllowedModulesJson),
                new TenantSummaryDto(targetTenantId.Value, tenantSettings.LegalName, tenantSettings.TradeName, tenantSettings.DocumentNumber),
                availableTenants
            ));
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

    public static string CreateToken(Guid userId, string email, string fullName, string role, Guid tenantId, string tenantName)
    {
        var now = DateTimeOffset.UtcNow;
        var header = new { alg = "HS256", typ = "JWT" };
        var payload = new
        {
            iss = Issuer,
            aud = Audience,
            sub = userId.ToString(),
            email = email,
            name = fullName,
            role = role,
            tenant_id = tenantId.ToString(),
            tenant_name = tenantName,
            nbf = now.ToUnixTimeSeconds(),
            iat = now.ToUnixTimeSeconds(),
            exp = now.AddHours(LifetimeHours).ToUnixTimeSeconds()
        };

        string headerB64 = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(header));
        string payloadB64 = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(payload));
        string signatureB64 = ComputeSignature($"{headerB64}.{payloadB64}");

        return $"{headerB64}.{payloadB64}.{signatureB64}";
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
public sealed record UserDto(Guid Id, string FullName, string Email, string Role, string? AllowedModulesJson = null);
public sealed record TenantSummaryDto(Guid Id, string LegalName, string? TradeName, string DocumentNumber);
public sealed record AuthResponse(string Token, UserDto User, TenantSummaryDto Tenant, IReadOnlyList<TenantSummaryDto> AvailableTenants);
