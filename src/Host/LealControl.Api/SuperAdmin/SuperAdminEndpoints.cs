using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LealControl.Api.SuperAdmin;

public static class SuperAdminEndpoints
{
    public static IEndpointRouteBuilder MapSuperAdminModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/superadmin")
            .WithTags("SuperAdmin Master SaaS")
            .AddEndpointFilter(async (invocationContext, next) =>
            {
                var http = invocationContext.HttpContext;
                var path = http.Request.Path.Value ?? string.Empty;

                // 1. Permitir login maestro sin token previo
                if (path.EndsWith("/auth/login", StringComparison.OrdinalIgnoreCase))
                {
                    return await next(invocationContext);
                }

                // 2. Verificar autenticacion (JWT Bearer via middleware)
                var user = http.User;
                var role = user?.Identity?.IsAuthenticated == true
                    ? user.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? user.FindFirst("role")?.Value
                    : null;

                if (string.IsNullOrWhiteSpace(role))
                {
                    return Results.Json(new { message = "Acceso no autorizado. Se requieren credenciales de SuperAdmin." }, statusCode: StatusCodes.Status401Unauthorized);
                }

                if (!string.Equals(role, "SuperAdmin", StringComparison.OrdinalIgnoreCase))
                {
                    return Results.Json(new { message = "Permisos insuficientes. Se requiere rol SuperAdmin." }, statusCode: StatusCodes.Status403Forbidden);
                }

                return await next(invocationContext);
            });

        // 1. SuperAdmin Login
        group.MapPost("/auth/login", async (
            SuperAdminLoginRequest req,
            MasterDbContext masterDb,
            IConfiguration config,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            {
                return Results.BadRequest(new { message = "Email y contraseña son obligatorios." });
            }

            var email = req.Email.Trim().ToLowerInvariant();
            var user = await masterDb.SuperAdmins.FirstOrDefaultAsync(u => u.Email.ToLower() == email && u.IsActive, ct);

            if (user == null || !MasterDbContext.VerifyPassword(req.Password, user.PasswordHash))
            {
                return Results.BadRequest(new { message = "Credenciales maestras inválidas." });
            }

            user.LastLoginUtc = DateTime.UtcNow;
            await masterDb.SaveChangesAsync(ct);

            var jwtString = LealControl.Modules.Crm.Infrastructure.Http.SimpleJwt.CreateToken(
                user.Id,
                user.Email,
                user.FullName,
                "SuperAdmin",
                Guid.Empty,
                "LEAL Master Platform");

            return Results.Ok(new
            {
                token = jwtString,
                user = new
                {
                    user.Id,
                    user.FullName,
                    user.Email,
                    user.Role
                }
            });
        }).RequireRateLimiting("auth-policy").AllowAnonymous();

        // 2. Change SuperAdmin Password
        group.MapPost("/auth/change-password", async (
            ChangeSuperAdminPasswordRequest req,
            MasterDbContext masterDb,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.CurrentPassword) || string.IsNullOrWhiteSpace(req.NewPassword))
            {
                return Results.BadRequest(new { message = "Todos los campos son obligatorios." });
            }

            var email = req.Email.Trim().ToLowerInvariant();
            var user = await masterDb.SuperAdmins.FirstOrDefaultAsync(u => u.Email.ToLower() == email && u.IsActive, ct);

            if (user == null || !MasterDbContext.VerifyPassword(req.CurrentPassword, user.PasswordHash))
            {
                return Results.BadRequest(new { message = "Contraseña actual incorrecta." });
            }

            user.PasswordHash = MasterDbContext.HashPassword(req.NewPassword);
            await masterDb.SaveChangesAsync(ct);

            return Results.Ok(new { success = true, message = "Contraseña maestra actualizada con éxito." });
        });

        // 3. SaaS Dashboard Metrics
        group.MapGet("/dashboard", async (
            MasterDbContext masterDb,
            ITenantProvisionerService provisioner,
            CancellationToken ct) =>
        {
            var tenants = await masterDb.Tenants.AsNoTracking().ToListAsync(ct);
            var plans = await masterDb.Plans.AsNoTracking().ToListAsync(ct);

            var totalTenants = tenants.Count;
            var activeTenants = tenants.Count(t => t.Status == "Active");
            var suspendedTenants = tenants.Count(t => t.Status == "Suspended");
            var mrrArs = tenants.Where(t => t.Status == "Active").Sum(t => t.MonthlyPriceArs);
            var mrrUsd = tenants.Where(t => t.Status == "Active").Sum(t => t.MonthlyPriceUsd);
            var totalStorageMb = tenants.Sum(t => t.StorageMb);

            var planBreakdown = plans.Select(p => new
            {
                p.Code,
                p.Name,
                p.EnabledModulesJson,
                Count = tenants.Count(t => t.PlanCode == p.Code),
                RevenueArs = tenants.Where(t => t.PlanCode == p.Code && t.Status == "Active").Sum(t => t.MonthlyPriceArs)
            }).ToList();

            var recentTenants = tenants.OrderByDescending(t => t.CreatedAtUtc).Take(10).ToList();

            return Results.Ok(new
            {
                totalTenants,
                activeTenants,
                suspendedTenants,
                mrrArs,
                mrrUsd,
                totalStorageMb,
                planBreakdown,
                recentTenants
            });
        });

        // 4. List All Tenants
        group.MapGet("/tenants", async (
            MasterDbContext masterDb,
            ITenantProvisionerService provisioner,
            CancellationToken ct) =>
        {
            var tenants = await masterDb.Tenants.AsNoTracking().OrderByDescending(t => t.CreatedAtUtc).ToListAsync(ct);
            return Results.Ok(tenants);
        });

        // 5. Provision New Tenant (With Modular Plan & Physical Database)
        group.MapPost("/tenants", async (
            ProvisionTenantRequest req,
            ITenantProvisionerService provisioner,
            MasterDbContext masterDb,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.AdminEmail) || string.IsNullOrWhiteSpace(req.AdminPassword))
            {
                return Results.BadRequest(new { message = "Nombre, email del administrador y contraseña son obligatorios." });
            }

            var plan = await masterDb.Plans.FirstOrDefaultAsync(p => p.Code == req.PlanCode, ct);
            var modules = !string.IsNullOrWhiteSpace(req.EnabledModulesJson) 
                ? req.EnabledModulesJson 
                : (plan?.EnabledModulesJson ?? @"[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr""]");

            var result = await provisioner.ProvisionTenantAsync(
                req.Name,
                req.Slug ?? req.Name,
                req.PlanCode ?? "pyme",
                req.AdminFullName ?? "Administrador",
                req.AdminEmail,
                req.AdminPassword,
                req.AdminPhone,
                req.MonthlyPriceArs,
                req.MonthlyPriceUsd,
                modules,
                ct);

            if (!result.Success)
            {
                return Results.BadRequest(new { success = false, message = result.Message });
            }

            return Results.Created($"/api/v1/superadmin/tenants/{result.DbName}", new
            {
                success = true,
                dbName = result.DbName,
                message = result.Message
            });
        });

        // 6. Update Tenant Modules & Plan
        group.MapPut("/tenants/{id:guid}/modules", async (
            Guid id,
            UpdateTenantModulesRequest req,
            MasterDbContext masterDb,
            ITenantProvisionerService provisioner,
            CancellationToken ct) =>
        {
            var tenant = await masterDb.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tenant == null) return Results.NotFound(new { message = "Empresa no encontrada." });

            if (!string.IsNullOrWhiteSpace(req.EnabledModulesJson))
            {
                tenant.EnabledModulesJson = TenantProvisionerService.NormalizeModulesJson(req.EnabledModulesJson);
                await provisioner.SyncTenantUsersModulesAsync(tenant.DbName, tenant.EnabledModulesJson, ct);
            }

            if (!string.IsNullOrWhiteSpace(req.PlanCode))
                tenant.PlanCode = req.PlanCode;

            if (req.MonthlyPriceArs.HasValue)
                tenant.MonthlyPriceArs = req.MonthlyPriceArs.Value;

            await masterDb.SaveChangesAsync(ct);
            return Results.Ok(new
            {
                tenant.Id,
                tenant.Name,
                tenant.DbName,
                tenant.PlanCode,
                tenant.EnabledModulesJson,
                tenant.MonthlyPriceArs,
                message = "Módulos actualizados. Los usuarios deben volver a iniciar sesión para ver el cambio."
            });
        });

        // 7. Update Tenant Status (Suspend / Activate / Notes)
        group.MapPut("/tenants/{id:guid}/status", async (
            Guid id,
            UpdateTenantStatusRequest req,
            MasterDbContext masterDb,
            CancellationToken ct) =>
        {
            var tenant = await masterDb.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tenant == null) return Results.NotFound(new { message = "Empresa no encontrada." });

            tenant.Status = req.Status;
            if (req.ExpiresAtUtc.HasValue) tenant.ExpiresAtUtc = req.ExpiresAtUtc;
            if (req.MonthlyPriceArs.HasValue) tenant.MonthlyPriceArs = req.MonthlyPriceArs.Value;
            if (!string.IsNullOrWhiteSpace(req.PlanCode)) tenant.PlanCode = req.PlanCode;
            if (req.Notes != null) tenant.Notes = req.Notes;

            await masterDb.SaveChangesAsync(ct);
            return Results.Ok(tenant);
        });

        // 8. Download Tenant Backup (.sql.gz)
        group.MapGet("/tenants/{id:guid}/backup", async (
            Guid id,
            MasterDbContext masterDb,
            ITenantProvisionerService provisioner,
            CancellationToken ct) =>
        {
            var tenant = await masterDb.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tenant == null) return Results.NotFound(new { message = "Empresa no encontrada." });

            var dumpGzip = await provisioner.ExportDatabaseDumpGzipAsync(tenant.DbName, ct);
            var filename = $"backup_leal_{tenant.Slug}_{DateTime.UtcNow:yyyyMMdd_HHmm}.sql.gz";

            return Results.File(dumpGzip, "application/gzip", filename);
        });

        // 9. Subscription Plans CRUD (Custom Modular Plans)
        group.MapGet("/plans", async (MasterDbContext masterDb, CancellationToken ct) =>
        {
            var plans = await masterDb.Plans.AsNoTracking().OrderBy(p => p.PriceArs).ToListAsync(ct);
            return Results.Ok(plans);
        });

        group.MapPost("/plans", async (CreatePlanRequest req, MasterDbContext masterDb, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Code) || string.IsNullOrWhiteSpace(req.Name))
            {
                return Results.BadRequest(new { message = "Código y nombre del plan son obligatorios." });
            }

            var plan = new SubscriptionPlan
            {
                Code = req.Code.Trim().ToLowerInvariant(),
                Name = req.Name.Trim(),
                PriceArs = req.PriceArs,
                PriceUsd = req.PriceUsd,
                MaxUsers = req.MaxUsers > 0 ? req.MaxUsers : 10,
                Description = req.Description ?? "",
                FeaturesJson = req.FeaturesJson ?? "[]",
                EnabledModulesJson = req.EnabledModulesJson ?? @"[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]"
            };

            masterDb.Plans.Add(plan);
            await masterDb.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/superadmin/plans/{plan.Id}", plan);
        });

        group.MapPut("/plans/{id:guid}", async (Guid id, UpdatePlanRequest req, MasterDbContext masterDb, CancellationToken ct) =>
        {
            var plan = await masterDb.Plans.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (plan == null) return Results.NotFound(new { message = "Plan no encontrado." });

            plan.Name = req.Name;
            plan.PriceArs = req.PriceArs;
            plan.PriceUsd = req.PriceUsd;
            plan.MaxUsers = req.MaxUsers;
            plan.Description = req.Description;
            plan.FeaturesJson = req.FeaturesJson;
            if (!string.IsNullOrWhiteSpace(req.EnabledModulesJson))
                plan.EnabledModulesJson = req.EnabledModulesJson;

            await masterDb.SaveChangesAsync(ct);
            return Results.Ok(plan);
        });

        // 10. Generate MercadoPago Payment Preference / Link
        group.MapPost("/tenants/{id:guid}/payment-link", async (
            Guid id,
            MasterDbContext masterDb,
            IConfiguration config,
            CancellationToken ct) =>
        {
            var tenant = await masterDb.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tenant == null) return Results.NotFound(new { message = "Empresa no encontrada." });

            var mpAccessToken = config["MercadoPago:AccessToken"] 
                ?? Environment.GetEnvironmentVariable("MP_ACCESS_TOKEN");

            var amount = tenant.MonthlyPriceArs > 0 ? tenant.MonthlyPriceArs : 95000;
            var title = $"Abono Mensual LEAL Control ERP - {tenant.Name} (Plan {tenant.PlanCode.ToUpper()})";

            // If MP token is configured, create live MercadoPago Preference via REST API
            if (!string.IsNullOrWhiteSpace(mpAccessToken))
            {
                try
                {
                    using var http = new HttpClient();
                    http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", mpAccessToken);

                    var preferenceBody = new
                    {
                        items = new[]
                        {
                            new
                            {
                                title = title,
                                quantity = 1,
                                currency_id = "ARS",
                                unit_price = amount
                            }
                        },
                        payer = new
                        {
                            email = tenant.AdminEmail,
                            name = tenant.AdminFullName
                        },
                        external_reference = tenant.Id.ToString(),
                        back_urls = new
                        {
                            success = "https://erp.lealcontrol.com/superadmin/payment-success",
                            failure = "https://erp.lealcontrol.com/superadmin/payment-failure",
                            pending = "https://erp.lealcontrol.com/superadmin/payment-pending"
                        },
                        auto_return = "approved",
                        notification_url = $"{ResolvePublicApiBaseUrl(config)}/api/v1/public/webhooks/mercadopago"
                    };

                    var res = await http.PostAsJsonAsync("https://api.mercadopago.com/checkout/preferences", preferenceBody, ct);
                    if (res.IsSuccessStatusCode)
                    {
                        var json = await res.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
                        var initPoint = json.GetProperty("init_point").GetString();
                        var prefId = json.GetProperty("id").GetString();

                        masterDb.Payments.Add(new TenantPaymentRecord
                        {
                            TenantId = tenant.Id,
                            ExternalPaymentId = prefId ?? "",
                            Amount = amount,
                            Currency = "ARS",
                            Status = "Pending",
                            PayerEmail = tenant.AdminEmail,
                            RawPayloadJson = json.ToString()
                        });
                        await masterDb.SaveChangesAsync(ct);

                        return Results.Ok(new
                        {
                            success = true,
                            paymentUrl = initPoint,
                            preferenceId = prefId,
                            amount = amount
                        });
                    }
                }
                catch (Exception)
                {
                    // Fallback
                }
            }

            // Fallback generated payment link format
            var fallbackUrl = $"https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=LEAL-{tenant.Slug}-{DateTime.UtcNow.Ticks}";
            return Results.Ok(new
            {
                success = true,
                paymentUrl = fallbackUrl,
                amount = amount,
                message = "Link de pago generado para " + tenant.Name
            });
        });

        // 12. Public Demo Request Intake
        endpoints.MapPost("/api/v1/public/demo-requests", async (
            CreateDemoRequestDto req,
            MasterDbContext masterDb,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.CompanyName) || string.IsNullOrWhiteSpace(req.ContactFullName) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Phone))
            {
                return Results.BadRequest(new { message = "Nombre de empresa, contacto, email y teléfono son obligatorios." });
            }

            var demo = new MasterDemoRequest
            {
                CompanyName = req.CompanyName.Trim(),
                Cuit = req.Cuit?.Trim() ?? "",
                ContactFullName = req.ContactFullName.Trim(),
                Email = req.Email.Trim().ToLowerInvariant(),
                Phone = req.Phone.Trim(),
                EstimatedUsers = req.EstimatedUsers?.Trim() ?? "1-5",
                InterestedModulesJson = req.InterestedModulesJson ?? "[]",
                Message = req.Message?.Trim(),
                Status = "Pending",
                CreatedAtUtc = DateTime.UtcNow
            };

            masterDb.DemoRequests.Add(demo);
            await masterDb.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                success = true,
                message = "Solicitud de Demo recibida con éxito. Nuestro equipo te contactará a la brevedad.",
                requestId = demo.Id
            });
        }).WithTags("Public Landing").RequireRateLimiting("auth-policy").AllowAnonymous();

        // 13. List Demo Requests (SuperAdmin)
        group.MapGet("/demo-requests", async (MasterDbContext masterDb, CancellationToken ct) =>
        {
            var list = await masterDb.DemoRequests
                .AsNoTracking()
                .OrderByDescending(d => d.CreatedAtUtc)
                .ToListAsync(ct);
            return Results.Ok(list);
        });

        // 14. Update Demo Request Status
        group.MapPut("/demo-requests/{id:guid}/status", async (Guid id, UpdateDemoRequestStatusDto req, MasterDbContext masterDb, CancellationToken ct) =>
        {
            var demo = await masterDb.DemoRequests.FirstOrDefaultAsync(d => d.Id == id, ct);
            if (demo == null) return Results.NotFound(new { message = "Solicitud no encontrada." });

            demo.Status = req.Status;
            await masterDb.SaveChangesAsync(ct);
            return Results.Ok(demo);
        });

        // 15. Provision tenant from demo request
        group.MapPost("/demo-requests/{id:guid}/provision", async (
            Guid id,
            ProvisionFromDemoRequest req,
            MasterDbContext masterDb,
            ITenantProvisionerService provisioner,
            CancellationToken ct) =>
        {
            var demo = await masterDb.DemoRequests.FirstOrDefaultAsync(d => d.Id == id, ct);
            if (demo == null)
            {
                return Results.NotFound(new { message = "Solicitud no encontrada." });
            }

            if (string.Equals(demo.Status, "Provisioned", StringComparison.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { message = "Esta solicitud ya fue aprovisionada." });
            }

            if (string.IsNullOrWhiteSpace(req.AdminPassword))
            {
                return Results.BadRequest(new { message = "La contraseña del administrador es obligatoria." });
            }

            var planCode = string.IsNullOrWhiteSpace(req.PlanCode) ? "pyme" : req.PlanCode.Trim();
            var plan = await masterDb.Plans.FirstOrDefaultAsync(p => p.Code == planCode, ct);
            var modules = !string.IsNullOrWhiteSpace(req.EnabledModulesJson)
                ? req.EnabledModulesJson
                : (!string.IsNullOrWhiteSpace(demo.InterestedModulesJson) && demo.InterestedModulesJson != "[]"
                    ? demo.InterestedModulesJson
                    : (plan?.EnabledModulesJson ?? @"[""sales"", ""crm"", ""purchases"", ""inventory"", ""finance"", ""fleet"", ""hr"", ""grains""]"));

            var slug = string.IsNullOrWhiteSpace(req.Slug) ? demo.CompanyName : req.Slug;
            var adminName = string.IsNullOrWhiteSpace(req.AdminFullName) ? demo.ContactFullName : req.AdminFullName;
            var monthlyArs = req.MonthlyPriceArs ?? plan?.PriceArs ?? 95000m;

            var result = await provisioner.ProvisionTenantAsync(
                demo.CompanyName.Trim(),
                slug,
                planCode,
                adminName.Trim(),
                demo.Email.Trim().ToLowerInvariant(),
                req.AdminPassword,
                demo.Phone,
                monthlyArs,
                plan?.PriceUsd ?? 0m,
                modules,
                ct);

            if (!result.Success)
            {
                return Results.BadRequest(new { success = false, message = result.Message });
            }

            var tenant = await masterDb.Tenants.FirstOrDefaultAsync(t => t.DbName == result.DbName, ct);
            if (tenant != null && !string.IsNullOrWhiteSpace(demo.Cuit))
            {
                tenant.Notes = $"CUIT demo: {demo.Cuit}";
                await masterDb.SaveChangesAsync(ct);
            }

            demo.Status = "Provisioned";
            await masterDb.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                success = true,
                dbName = result.DbName,
                message = result.Message,
                demo,
                loginUrl = "https://erp.lealcontrol.com/login",
                adminEmail = demo.Email
            });
        });

        return endpoints;
    }

    public static IEndpointRouteBuilder MapTenantBackupSelfService(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/v1/company/backup/export-sql", async (
            HttpContext http,
            ITenantContext tenantContext,
            MasterDbContext masterDb,
            ITenantProvisionerService provisioner,
            CancellationToken ct) =>
        {
            var user = http.User;
            var role = user?.Identity?.IsAuthenticated == true
                ? user.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? user.FindFirst("role")?.Value
                : null;
            Guid? tokenTenantId = null;
            if (user?.Identity?.IsAuthenticated == true)
            {
                var tid = user.FindFirst("tenant_id")?.Value;
                if (Guid.TryParse(tid, out var parsedTid))
                {
                    tokenTenantId = parsedTid;
                }
            }

            var isSuperAdmin = string.Equals(role, "SuperAdmin", StringComparison.OrdinalIgnoreCase);
            var isAdmin = string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase) 
                       || string.Equals(role, "Administrador", StringComparison.OrdinalIgnoreCase);

            if (!isSuperAdmin && !isAdmin)
            {
                return Results.Json(new { message = "Se requieren privilegios de Administrador para exportar la base de datos." }, statusCode: StatusCodes.Status403Forbidden);
            }

            var tenantId = tenantContext.TenantId.Value;
            if (tenantId == Guid.Empty)
            {
                return Results.Json(new { message = "Identificador de empresa no válido." }, statusCode: StatusCodes.Status400BadRequest);
            }

            // Si no es SuperAdmin, el usuario solo puede exportar la base de datos de su propio tenant
            if (!isSuperAdmin && tokenTenantId.HasValue && tokenTenantId.Value != tenantId)
            {
                return Results.Json(new { message = "No tiene autorización para descargar datos de otra empresa." }, statusCode: StatusCodes.Status403Forbidden);
            }

            var tenant = await masterDb.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId, ct);
            var dbName = tenant?.DbName ?? "lealcontrol";
            var slug = tenant?.Slug ?? "empresa";

            var dumpGzip = await provisioner.ExportDatabaseDumpGzipAsync(dbName, ct);
            var filename = $"backup_{slug}_{DateTime.UtcNow:yyyyMMdd_HHmm}.sql.gz";

            return Results.File(dumpGzip, "application/gzip", filename);
        }).WithTags("Company Settings");

        return endpoints;
    }

    private static string ResolvePublicApiBaseUrl(IConfiguration config)
    {
        var configured = config["PublicBaseUrl"]
            ?? Environment.GetEnvironmentVariable("PUBLIC_BASE_URL");
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured.Trim().TrimEnd('/');
        }

        return "https://erp.lealcontrol.com";
    }
}

public sealed record SuperAdminLoginRequest(string Email, string Password);
public sealed record ChangeSuperAdminPasswordRequest(string Email, string CurrentPassword, string NewPassword);
public sealed record ProvisionTenantRequest(
    string Name,
    string? Slug,
    string? PlanCode,
    string? AdminFullName,
    string AdminEmail,
    string AdminPassword,
    string? AdminPhone,
    decimal MonthlyPriceArs,
    decimal MonthlyPriceUsd,
    string? EnabledModulesJson = null
);
public sealed record UpdateTenantStatusRequest(string Status, DateTime? ExpiresAtUtc, decimal? MonthlyPriceArs, string? PlanCode, string? Notes);
public sealed record UpdateTenantModulesRequest(string? EnabledModulesJson, string? PlanCode, decimal? MonthlyPriceArs);
public sealed record CreatePlanRequest(string Code, string Name, decimal PriceArs, decimal PriceUsd, int MaxUsers, string? Description, string? FeaturesJson, string? EnabledModulesJson);
public sealed record UpdatePlanRequest(string Name, decimal PriceArs, decimal PriceUsd, int MaxUsers, string Description, string FeaturesJson, string? EnabledModulesJson);
public sealed record CreateDemoRequestDto(string CompanyName, string? Cuit, string ContactFullName, string Email, string Phone, string? EstimatedUsers, string? InterestedModulesJson, string? Message);
public sealed record UpdateDemoRequestStatusDto(string Status);
public sealed record ProvisionFromDemoRequest(
    string AdminPassword,
    string? Slug = null,
    string? PlanCode = null,
    string? AdminFullName = null,
    string? EnabledModulesJson = null,
    decimal? MonthlyPriceArs = null);
