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
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Http;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var auth = endpoints.MapGroup("/api/v1/auth").WithTags("Authentication & Tenancy");

        // 1. Login
        auth.MapPost("/login", async (LoginRequest req, CrmDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            {
                return Results.BadRequest(new { message = "Email y contraseña son obligatorios." });
            }

            var email = req.Email.Trim().ToLowerInvariant();
            var users = await db.TenantUsers.Where(u => u.Email.ToLower() == email && u.IsActive).ToListAsync(ct);

            if (users.Count == 0)
            {
                // Fallback for default development admin
                var devTenantId = new TenantId(Guid.Parse("11111111-1111-1111-1111-111111111111"));
                if (email == "admin@lealcontrol.com" || email == "admin@leal.com" || email == "admin")
                {
                    var newAdmin = TenantUser.Create(devTenantId, "Administrador Leal", email, "Admin", "admin123");
                    db.TenantUsers.Add(newAdmin);
                    await db.SaveChangesAsync(ct);
                    users.Add(newAdmin);
                }
                else
                {
                    return Results.BadRequest(new { message = "Usuario no encontrado o inactivo." });
                }
            }

            // Find matching user (if TenantId requested, filter by it)
            TenantUser? user = null;
            if (req.TenantId.HasValue && req.TenantId.Value != Guid.Empty)
            {
                var reqTid = new TenantId(req.TenantId.Value);
                user = users.FirstOrDefault(u => u.TenantId == reqTid);
            }

            user ??= users.FirstOrDefault();

            if (user == null || !user.VerifyPassword(req.Password))
            {
                return Results.BadRequest(new { message = "Contraseña incorrecta." });
            }

            user.RecordLogin();
            await db.SaveChangesAsync(ct);

            // Fetch Tenant Info
            var tenantSettings = await db.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == user.TenantId, ct);
            var tenantName = tenantSettings?.LegalName ?? tenantSettings?.TradeName ?? "LEAL CONTROL ERP S.A.";
            var documentNumber = tenantSettings?.DocumentNumber ?? "30712345678";

            // Generate standard JWT
            var token = SimpleJwt.CreateToken(user.Id, user.Email, user.FullName, user.Role, user.TenantId.Value, tenantName);

            var availableTenants = await db.CompanySettings
                .AsNoTracking()
                .Select(s => new TenantSummaryDto(s.TenantId.Value, s.LegalName, s.TradeName, s.DocumentNumber))
                .ToListAsync(ct);

            return Results.Ok(new AuthResponse(
                token,
                new UserDto(user.Id, user.FullName, user.Email, user.Role),
                new TenantSummaryDto(user.TenantId.Value, tenantName, tenantSettings?.TradeName, documentNumber),
                availableTenants
            ));
        });

        // 2. Register new Tenant from scratch
        auth.MapPost("/register-tenant", async (RegisterTenantRequest req, CrmDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.CompanyName))
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

            // 1. Create CompanySettings
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

            // 2. Create Admin User
            var adminUser = TenantUser.Create(newTenantId, adminName, email, "Admin", req.Password);
            db.TenantUsers.Add(adminUser);

            await db.SaveChangesAsync(ct);

            // Generate standard JWT
            var token = SimpleJwt.CreateToken(adminUser.Id, adminUser.Email, adminUser.FullName, adminUser.Role, newTenantId.Value, companyName);

            var availableTenants = await db.CompanySettings
                .AsNoTracking()
                .Select(s => new TenantSummaryDto(s.TenantId.Value, s.LegalName, s.TradeName, s.DocumentNumber))
                .ToListAsync(ct);

            return Results.Ok(new AuthResponse(
                token,
                new UserDto(adminUser.Id, adminUser.FullName, adminUser.Email, adminUser.Role),
                new TenantSummaryDto(newTenantId.Value, companyName, companyName, docNumber),
                availableTenants
            ));
        });

        // 3. Me
        auth.MapGet("/me", async (ITenantContext tenantContext, CrmDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId;
            var tenantSettings = await db.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
            var tenantName = tenantSettings?.LegalName ?? tenantSettings?.TradeName ?? "LEAL CONTROL ERP S.A.";

            var users = await db.TenantUsers.Where(u => u.TenantId == tenantId && u.IsActive).ToListAsync(ct);
            var user = users.FirstOrDefault();

            var availableTenants = await db.CompanySettings
                .AsNoTracking()
                .Select(s => new TenantSummaryDto(s.TenantId.Value, s.LegalName, s.TradeName, s.DocumentNumber))
                .ToListAsync(ct);

            return Results.Ok(new
            {
                User = user != null ? new UserDto(user.Id, user.FullName, user.Email, user.Role) : null,
                Tenant = new TenantSummaryDto(tenantId.Value, tenantName, tenantSettings?.TradeName, tenantSettings?.DocumentNumber ?? ""),
                AvailableTenants = availableTenants
            });
        });

        // 4. Switch Tenant
        auth.MapPost("/switch-tenant", async (SwitchTenantRequest req, CrmDbContext db, CancellationToken ct) =>
        {
            var targetTenantId = new TenantId(req.TenantId);
            var tenantSettings = await db.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == targetTenantId, ct);
            if (tenantSettings == null)
            {
                return Results.BadRequest(new { message = "La empresa seleccionada no existe." });
            }

            var users = await db.TenantUsers.Where(u => u.TenantId == targetTenantId && u.IsActive).ToListAsync(ct);
            var user = users.FirstOrDefault() ?? TenantUser.Create(targetTenantId, "Administrador", "admin@lealcontrol.com", "Admin", "admin123");
            if (!users.Any())
            {
                db.TenantUsers.Add(user);
                await db.SaveChangesAsync(ct);
            }

            var token = SimpleJwt.CreateToken(user.Id, user.Email, user.FullName, user.Role, targetTenantId.Value, tenantSettings.LegalName);

            var availableTenants = await db.CompanySettings
                .AsNoTracking()
                .Select(s => new TenantSummaryDto(s.TenantId.Value, s.LegalName, s.TradeName, s.DocumentNumber))
                .ToListAsync(ct);

            return Results.Ok(new AuthResponse(
                token,
                new UserDto(user.Id, user.FullName, user.Email, user.Role),
                new TenantSummaryDto(targetTenantId.Value, tenantSettings.LegalName, tenantSettings.TradeName, tenantSettings.DocumentNumber),
                availableTenants
            ));
        });

        // 5. List all registered Tenants
        auth.MapGet("/tenants", async (CrmDbContext db, CancellationToken ct) =>
        {
            var list = await db.CompanySettings
                .AsNoTracking()
                .Select(s => new TenantSummaryDto(s.TenantId.Value, s.LegalName, s.TradeName, s.DocumentNumber))
                .ToListAsync(ct);

            return Results.Ok(list);
        });

        return endpoints;
    }
}

public static class SimpleJwt
{
    private static readonly byte[] SecretBytes = Encoding.UTF8.GetBytes("LealControl_Enterprise_JWT_Signing_Key_2026_Secret_Key_Super_Secure_!");

    public static string CreateToken(Guid userId, string email, string fullName, string role, Guid tenantId, string tenantName)
    {
        var header = new { alg = "HS256", typ = "JWT" };
        var payload = new
        {
            sub = userId.ToString(),
            email = email,
            name = fullName,
            role = role,
            tenant_id = tenantId.ToString(),
            tenant_name = tenantName,
            exp = DateTimeOffset.UtcNow.AddDays(30).ToUnixTimeSeconds()
        };

        string headerB64 = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(header));
        string payloadB64 = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(payload));
        string signatureB64 = ComputeSignature($"{headerB64}.{payloadB64}");

        return $"{headerB64}.{payloadB64}.{signatureB64}";
    }

    private static string ComputeSignature(string data)
    {
        using var hmac = new HMACSHA256(SecretBytes);
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
}

public sealed record LoginRequest(string Email, string Password, Guid? TenantId);
public sealed record RegisterTenantRequest(string CompanyName, string? Cuit, string? Phone, string? AdminFullName, string Email, string Password);
public sealed record SwitchTenantRequest(Guid TenantId);
public sealed record UserDto(Guid Id, string FullName, string Email, string Role);
public sealed record TenantSummaryDto(Guid Id, string LegalName, string? TradeName, string DocumentNumber);
public sealed record AuthResponse(string Token, UserDto User, TenantSummaryDto Tenant, IReadOnlyList<TenantSummaryDto> AvailableTenants);
