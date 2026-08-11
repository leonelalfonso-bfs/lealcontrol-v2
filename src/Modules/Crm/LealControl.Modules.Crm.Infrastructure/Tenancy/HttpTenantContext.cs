using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Http;
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

    public HttpTenantContext(IHttpContextAccessor http, IOptions<TenancyOptions> options)
    {
        _http = http;
        _options = options.Value;
    }

    public TenantId TenantId
    {
        get
        {
            var header = _http.HttpContext?.Request.Headers[HeaderName].ToString();
            if (Guid.TryParse(header, out var parsed))
            {
                return new TenantId(parsed);
            }

            return new TenantId(_options.DevelopmentTenantId);
        }
    }

    public bool HasTenant => TenantId.Value != Guid.Empty;
}
