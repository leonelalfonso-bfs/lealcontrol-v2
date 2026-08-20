using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace LealControl.Api.SuperAdmin;

public static class SuperAdminEndpoints
{
    public static IEndpointRouteBuilder MapSuperAdminModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/superadmin").WithTags("SuperAdmin");

        // SuperAdmin Auth
        group.MapPost("/auth/login", async (SuperAdminLoginRequest request, MasterDbContext masterDb, IConfiguration config, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.BadRequest(new { error = "Email y contraseña requeridos." });
            }

            var cleanEmail = request.Email.Trim().ToLowerInvariant();
            var user = await masterDb.SuperAdmins.FirstOrDefaultAsync(u => u.Email.ToLower() == cleanEmail && u.IsActive, ct);

            if (user == null || !MasterDbContext.VerifyPassword(request.Password, user.PasswordHash))
            {
                return Results.Unauthorized();
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
        });

        // Dashboard KPIs
        group.MapGet("/dashboard", async (MasterDbContext masterDb, CancellationToken ct) =>
        {
            var tenants = await masterDb.Tenants.AsNoTracking().ToListAsync(ct);
            var plans = await masterDb.Plans.AsNoTracking().ToListAsync(ct);

            var total = tenants.Count;
            var active = tenants.Count(t => t.IsActive && t.Status == "Active");
            var suspended = tenants.Count(t => t.Status == "Suspended");
            var mrrArs = tenants.Where(t => t.IsActive).Sum(t => t.MonthlyPriceArs);
            var mrrUsd = tenants.Where(t => t.IsActive).Sum(t => t.MonthlyPriceUsd);
            var totalStorageMb = tenants.Sum(t => t.StorageMb);

            var planBreakdown = plans.Select(p => new
            {
                p.Code,
                p.Name,
                Count = tenants.Count(t => t.PlanCode == p.Code),
                RevenueArs = tenants.Where(t => t.PlanCode == p.Code && t.IsActive).Sum(t => t.MonthlyPriceArs)
            }).ToList();

            var recentTenants = tenants.OrderByDescending(t => t.CreatedAtUtc).Take(6).ToList();

            return Results.Ok(new
            {
                totalTenants = total,
                activeTenants = active,
                suspendedTenants = suspended,
                mrrArs,
                mrrUsd,
                totalStorageMb,
                planBreakdown,
                recentTenants
            });
        });

        // Tenants List
        group.MapGet("/tenants", async (MasterDbContext masterDb, ITenantProvisionerService provisioner, CancellationToken ct) =>
        {
            var tenants = await masterDb.Tenants.AsNoTracking().OrderByDescending(t => t.CreatedAtUtc).ToListAsync(ct);
            
            // Refresh storage size in background or on list
            var result = new List<object>();
            foreach (var t in tenants)
            {
                var sizeMb = await provisioner.GetDatabaseSizeMbAsync(t.DbName, ct);
                result.Add(new
                {
                    t.Id,
                    t.Name,
                    t.Slug,
                    t.DbName,
                    t.PlanCode,
                    t.Status,
                    t.MonthlyPriceArs,
                    t.MonthlyPriceUsd,
                    t.AdminFullName,
                    t.AdminEmail,
                    t.AdminPhone,
                    t.CreatedAtUtc,
                    t.ExpiresAtUtc,
                    t.IsActive,
                    storageMb = sizeMb > 0 ? sizeMb : t.StorageMb,
                    t.UserCount
                });
            }

            return Results.Ok(result);
        });

        // Provision New Tenant & Physical Database
        group.MapPost("/tenants", async (
            CreateTenantProvisionRequest request,
            ITenantProvisionerService provisioner,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.AdminEmail) || string.IsNullOrWhiteSpace(request.AdminPassword))
            {
                return Results.BadRequest(new { error = "Nombre de empresa, Email del administrador y Contraseña son obligatorios." });
            }

            var slug = string.IsNullOrWhiteSpace(request.Slug) ? request.Name : request.Slug;
            var result = await provisioner.ProvisionTenantAsync(
                request.Name.Trim(),
                slug.Trim(),
                request.PlanCode ?? "pyme",
                request.AdminFullName?.Trim() ?? "Administrador",
                request.AdminEmail.Trim().ToLowerInvariant(),
                request.AdminPassword,
                request.AdminPhone,
                request.MonthlyPriceArs,
                request.MonthlyPriceUsd,
                ct);

            if (!result.Success)
            {
                return Results.BadRequest(new { error = result.Message });
            }

            return Results.Created($"/api/v1/superadmin/tenants", new
            {
                success = true,
                dbName = result.DbName,
                message = result.Message
            });
        });

        // Update Tenant Status (Suspend / Activate)
        group.MapPut("/tenants/{id:guid}/status", async (
            Guid id,
            UpdateTenantStatusRequest request,
            MasterDbContext masterDb,
            ITenantConnectionProvider connProvider,
            CancellationToken ct) =>
        {
            var tenant = await masterDb.Tenants.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tenant == null)
            {
                return Results.NotFound(new { error = "Empresa no encontrada." });
            }

            tenant.Status = request.Status;
            tenant.IsActive = request.Status == "Active";
            if (request.ExpiresAtUtc.HasValue)
            {
                tenant.ExpiresAtUtc = request.ExpiresAtUtc.Value;
            }
            if (request.MonthlyPriceArs.HasValue)
            {
                tenant.MonthlyPriceArs = request.MonthlyPriceArs.Value;
            }
            if (!string.IsNullOrWhiteSpace(request.PlanCode))
            {
                tenant.PlanCode = request.PlanCode;
            }

            await masterDb.SaveChangesAsync(ct);
            connProvider.InvalidateCache(new TenantId(id));

            return Results.Ok(tenant);
        });

        // SuperAdmin Export Tenant Database
        group.MapGet("/tenants/{id:guid}/backup", async (
            Guid id,
            MasterDbContext masterDb,
            ITenantProvisionerService provisioner,
            CancellationToken ct) =>
        {
            var tenant = await masterDb.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tenant == null)
            {
                return Results.NotFound(new { error = "Empresa no encontrada." });
            }

            var gzipBytes = await provisioner.ExportDatabaseDumpGzipAsync(tenant.DbName, ct);
            var fileName = $"backup_superadmin_{tenant.Slug}_{DateTime.UtcNow:yyyyMMdd_HHmm}.sql.gz";
            return Results.File(gzipBytes, "application/gzip", fileName);
        });

        // Plans List & Update
        group.MapGet("/plans", async (MasterDbContext masterDb, CancellationToken ct) =>
        {
            var plans = await masterDb.Plans.AsNoTracking().OrderBy(p => p.PriceArs).ToListAsync(ct);
            return Results.Ok(plans);
        });

        group.MapPut("/plans/{id:guid}", async (Guid id, SubscriptionPlan plan, MasterDbContext masterDb, CancellationToken ct) =>
        {
            var existing = await masterDb.Plans.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (existing == null) return Results.NotFound();

            existing.Name = plan.Name;
            existing.PriceArs = plan.PriceArs;
            existing.PriceUsd = plan.PriceUsd;
            existing.MaxUsers = plan.MaxUsers;
            existing.Description = plan.Description;
            existing.FeaturesJson = plan.FeaturesJson;
            existing.IsActive = plan.IsActive;

            await masterDb.SaveChangesAsync(ct);
            return Results.Ok(existing);
        });

        return endpoints;
    }

    public static IEndpointRouteBuilder MapTenantBackupSelfService(this IEndpointRouteBuilder endpoints)
    {
        // Tenant Self-Service Backup Export Endpoint
        endpoints.MapGet("/api/v1/company/backup/export-sql", async (
            ITenantContext tenantContext,
            MasterDbContext masterDb,
            ITenantProvisionerService provisioner,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId.Value;
            var tenant = await masterDb.Tenants.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tenantId, ct);
            var dbName = tenant?.DbName ?? "lealcontrol";
            var slug = tenant?.Slug ?? "empresa";

            var gzipBytes = await provisioner.ExportDatabaseDumpGzipAsync(dbName, ct);
            var fileName = $"backup_leal_{slug}_{DateTime.UtcNow:yyyyMMdd_HHmm}.sql.gz";

            return Results.File(gzipBytes, "application/gzip", fileName);
        }).WithTags("CompanySettings");

        return endpoints;
    }
}

public sealed record SuperAdminLoginRequest(string Email, string Password);

public sealed record CreateTenantProvisionRequest(
    string Name,
    string? Slug,
    string? PlanCode,
    string? AdminFullName,
    string AdminEmail,
    string AdminPassword,
    string? AdminPhone,
    decimal MonthlyPriceArs,
    decimal MonthlyPriceUsd);

public sealed record UpdateTenantStatusRequest(
    string Status,
    DateTime? ExpiresAtUtc,
    decimal? MonthlyPriceArs,
    string? PlanCode);
