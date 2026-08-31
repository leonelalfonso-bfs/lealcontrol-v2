using System;
using System.Security.Claims;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace LealControl.Modules.Crm.Infrastructure.Tenancy;

public sealed class TenancyOptions
{
    public const string SectionName = "Tenancy";

    public Guid DevelopmentTenantId { get; set; } = Guid.Parse("11111111-1111-1111-1111-111111111111");
}

public sealed class HttpTenantContext : ITenantContext
{
    public const string HeaderName = "X-Tenant-Id";

    private readonly IHttpContextAccessor _http;
    private readonly TenancyOptions _options;
    private readonly IHostEnvironment _env;

    public HttpTenantContext(
        IHttpContextAccessor http,
        IOptions<TenancyOptions> options,
        IHostEnvironment env)
    {
        _http = http;
        _options = options.Value;
        _env = env;
    }

    public TenantId TenantId
    {
        get
        {
            var user = _http.HttpContext?.User;
            var headerValue = _http.HttpContext?.Request.Headers[HeaderName].ToString();

            // 1. Authenticated user
            if (user?.Identity?.IsAuthenticated == true)
            {
                var role = user.FindFirst(ClaimTypes.Role)?.Value ?? user.FindFirst("role")?.Value;
                var isSuperAdmin = string.Equals(role, "SuperAdmin", StringComparison.OrdinalIgnoreCase);

                // SuperAdmin is permitted to act on behalf of a specific tenant via header
                if (isSuperAdmin && Guid.TryParse(headerValue, out var superAdminTargetTenant) && superAdminTargetTenant != Guid.Empty)
                {
                    return new TenantId(superAdminTargetTenant);
                }

                // Regular users are strictly locked to their verified JWT tenant claim
                var claim = user.FindFirst("tenant_id")?.Value;
                if (!string.IsNullOrWhiteSpace(claim) && Guid.TryParse(claim, out var fromClaim) && fromClaim != Guid.Empty)
                {
                    return new TenantId(fromClaim);
                }
            }

            // 2. Unauthenticated request: accept header if explicitly provided
            if (Guid.TryParse(headerValue, out var parsed) && parsed != Guid.Empty)
            {
                return new TenantId(parsed);
            }

            // 3. Fallback only in local development
            if (_env.IsDevelopment())
            {
                return new TenantId(_options.DevelopmentTenantId);
            }

            return new TenantId(Guid.Empty);
        }
    }

    public bool HasTenant => TenantId.Value != Guid.Empty;
}
