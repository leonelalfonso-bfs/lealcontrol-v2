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
            if (user?.Identity?.IsAuthenticated != true)
            {
                return new TenantId(Guid.Empty);
            }

            var headerValue = _http.HttpContext?.Request.Headers[HeaderName].ToString();
            var role = user.FindFirst(ClaimTypes.Role)?.Value ?? user.FindFirst("role")?.Value;
            var isSuperAdmin = string.Equals(role, "SuperAdmin", StringComparison.OrdinalIgnoreCase);

            if (isSuperAdmin && Guid.TryParse(headerValue, out var superAdminTargetTenant) && superAdminTargetTenant != Guid.Empty)
            {
                return new TenantId(superAdminTargetTenant);
            }

            var claim = user.FindFirst("tenant_id")?.Value;
            if (!string.IsNullOrWhiteSpace(claim) && Guid.TryParse(claim, out var fromClaim) && fromClaim != Guid.Empty)
            {
                return new TenantId(fromClaim);
            }

            if (_env.IsDevelopment() && _options.DevelopmentTenantId != Guid.Empty)
            {
                return new TenantId(_options.DevelopmentTenantId);
            }

            return new TenantId(Guid.Empty);
        }
    }

    public bool HasTenant => TenantId.Value != Guid.Empty;
}
