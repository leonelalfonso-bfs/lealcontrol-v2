using System.IO;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Crm.Infrastructure;
using LealControl.Modules.Crm.Infrastructure.Http;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using LealControl.Modules.Sales.Infrastructure;
using LealControl.Modules.Sales.Infrastructure.Http;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure;
using LealControl.Modules.Communications.Infrastructure.Http;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.Modules.HumanResources.Infrastructure;
using LealControl.Modules.Fleet.Infrastructure;
using LealControl.Modules.Accounting.Infrastructure;
using LealControl.Modules.Metrology.Infrastructure;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Api.SuperAdmin;
using LealControl.Api.Automation;
using LealControl.Api.Public;
using LealControl.Api.Security;
using LealControl.Api.Logging;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Services.AddHttpContextAccessor();

    builder.Host.UseSerilog((context, services, configuration) =>
        configuration
            .ReadFrom.Configuration(context.Configuration)
            .Enrich.FromLogContext()
            .Enrich.With(services.GetRequiredService<TenantIdEnricher>())
            .WriteTo.Console());

    builder.WebHost.ConfigureKestrel(options =>
    {
        options.Limits.MaxRequestBodySize = 52428800; // 50MB
    });

    var dbConnectionString = builder.Configuration.GetConnectionString("Database")
        ?? throw new InvalidOperationException(
            "ConnectionStrings:Database es obligatorio. En desarrollo usá appsettings.Development.json o user-secrets.");

    builder.Services.AddSingleton<TenantIdEnricher>();

    builder.Services.AddDbContext<MasterDbContext>(options =>
        options.UseNpgsql(dbConnectionString));
    builder.Services.AddSingleton<ITenantConnectionProvider, TenantConnectionProvider>();
    builder.Services.AddScoped<ITenantProvisionerService, TenantProvisionerService>();

    builder.Services.AddSingleton<IClock, SystemClock>();
    builder.Services.AddHttpClient<GeminiApiClient>();
    builder.Services.AddHttpClient<BcraApiClient>();
    builder.Services.AddHttpClient<AskLealService>();
    builder.Services.AddScoped<LealDiagnosticService>();
    builder.Services.AddCrmModule(builder.Configuration);
    builder.Services.AddSalesModule(builder.Configuration);
    builder.Services.AddCommunicationsModule(builder.Configuration);
    builder.Services.AddFinanceModule(builder.Configuration);
    builder.Services.AddHumanResourcesModule(builder.Configuration);
    builder.Services.AddFleetModule(builder.Configuration);
    builder.Services.AddAccountingModule(builder.Configuration);
    builder.Services.AddMetrologyModule(builder.Configuration);
    builder.Services.ConfigureHttpJsonOptions(options =>
        options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

    var jwtSecret = builder.Configuration["Jwt:Secret"]
        ?? builder.Configuration["JWT_SECRET"]
        ?? Environment.GetEnvironmentVariable("JWT_SECRET");

    if (string.IsNullOrWhiteSpace(jwtSecret))
    {
        if (builder.Environment.IsProduction())
        {
            throw new InvalidOperationException(
                "JWT_SECRET (o Jwt:Secret) es obligatorio en Production. No hay clave de respaldo en el código.");
        }

        jwtSecret = "DevOnly_LealControl_Local_JWT_Key_Not_For_Production_Use_32b!";
        Log.Warning("Usando clave JWT local de desarrollo. Definí Jwt:Secret o JWT_SECRET para coincidir con los tests.");
    }

    var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "lealcontrol";
    var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "lealcontrol-web";
    var jwtLifetimeHours = 8;
    if (int.TryParse(builder.Configuration["Jwt:LifetimeHours"], out var parsedHours) && parsedHours > 0)
    {
        jwtLifetimeHours = parsedHours;
    }

    var requireHttpsMetadata = builder.Configuration.GetValue("Jwt:RequireHttpsMetadata", false);

    SimpleJwt.SecretKey = jwtSecret;
    SimpleJwt.Issuer = jwtIssuer;
    SimpleJwt.Audience = jwtAudience;
    SimpleJwt.LifetimeHours = jwtLifetimeHours;
    var jwtKeyBytes = Encoding.UTF8.GetBytes(jwtSecret);

    builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = requireHttpsMetadata;
        options.SaveToken = true;
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(jwtKeyBytes),
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
            RoleClaimType = "role",
            NameClaimType = "sub"
        };
    });
    builder.Services.AddAuthorization(options =>
    {
        options.AddPolicy("RequireAdmin", policy =>
            policy.RequireRole("Admin", "Administrador", "SuperAdmin"));
        options.AddPolicy("RequireFinance", policy =>
            policy.RequireRole("Admin", "Administrador", "SuperAdmin", "Tesorero", "Contador"));
        options.AddPolicy("RequireAccounting", policy =>
            policy.RequireRole("Admin", "Administrador", "SuperAdmin", "Contador"));
        options.AddPolicy("RequireSales", policy =>
            policy.RequireRole("Admin", "Administrador", "SuperAdmin", "Comercial", "Contador"));
        options.AddPolicy("RequirePurchases", policy =>
            policy.RequireRole("Admin", "Administrador", "SuperAdmin", "Compras", "Contador"));
        options.FallbackPolicy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .Build();
    });

    builder.Services.AddProblemDetails();

    // Persistencia de Llaves Criptográficas (Data Protection)
    var keysFolder = builder.Configuration["DataProtection:KeysFolder"]
        ?? Environment.GetEnvironmentVariable("DATAPROTECTION_KEYS_FOLDER")
        ?? (builder.Environment.IsDevelopment()
            ? Path.Combine(Path.GetTempPath(), "lealcontrol-dataprotection-keys")
            : "/root/.aspnet/DataProtection-Keys");

    try
    {
        if (!Directory.Exists(keysFolder)) Directory.CreateDirectory(keysFolder);
        builder.Services.AddDataProtection()
            .PersistKeysToFileSystem(new DirectoryInfo(keysFolder))
            .SetApplicationName("LealControl");
    }
    catch (Exception ex)
    {
        Log.Warning(ex, "No se pudo inicializar la persistencia de DataProtection en {Folder}. Se utilizará el proveedor en memoria.", keysFolder);
    }

    // Rate Limiting: global + auth
    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
        {
            var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 200,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            });
        });
        options.AddPolicy("auth-policy", httpContext =>
        {
            var ip = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0
            });
        });
    });

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "Leal Control ERP 2.0",
            Version = "v1",
            Description = "API modular. Módulos: CRM + Sales + Finance + RRHH + Flota."
        });

        options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Description = "JWT Authorization header using the Bearer scheme. Formato: Bearer {token}",
            Name = "Authorization",
            In = ParameterLocation.Header,
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT"
        });

        options.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference
                    {
                        Type = ReferenceType.SecurityScheme,
                        Id = "Bearer"
                    }
                },
                Array.Empty<string>()
            }
        });
    });
    builder.Services.AddHealthChecks()
        .AddDbContextCheck<MasterDbContext>("master-db")
        .AddDbContextCheck<CrmDbContext>("crm-db")
        .AddDbContextCheck<SalesDbContext>("sales-db")
        .AddDbContextCheck<CommunicationsDbContext>("communications-db")
        .AddDbContextCheck<FinanceDbContext>("finance-db")
        .AddDbContextCheck<AccountingDbContext>("accounting-db")
        .AddDbContextCheck<HumanResourcesDbContext>("hr-db")
        .AddDbContextCheck<FleetDbContext>("fleet-db")
        .AddDbContextCheck<MetrologyDbContext>("metrology-db");
    var configuredOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
        ?.Where(o => !string.IsNullOrWhiteSpace(o))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray() ?? Array.Empty<string>();

    if (configuredOrigins.Length == 0)
    {
        configuredOrigins =
        [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5273",
            "http://127.0.0.1:5273"
        ];
    }

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("web", policy =>
            policy.WithOrigins(configuredOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod());
    });

    var app = builder.Build();

    if (!app.Environment.IsDevelopment())
    {
        app.UseExceptionHandler(exceptionHandlerApp =>
        {
            exceptionHandlerApp.Run(async context =>
            {
                context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                context.Response.ContentType = "application/problem+json";
                await context.Response.WriteAsJsonAsync(new Microsoft.AspNetCore.Mvc.ProblemDetails
                {
                    Status = StatusCodes.Status500InternalServerError,
                    Title = "Error interno del servidor",
                    Type = "https://tools.ietf.org/html/rfc7231#section-6.6.1"
                });
            });
        });
        app.UseHttpsRedirection();
        app.UseHsts();
    }

    app.UseSerilogRequestLogging();
    app.UseCors("web");
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseMiddleware<ContractedModuleMiddleware>();
    app.UseAuthorization();
    app.Use(async (context, next) =>
    {
        try
        {
            await next();
        }
        catch (TenantNotFoundException ex)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { message = ex.Message });
        }
    });

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    // Cada instancia debe crear/actualizar esquema en la base maestra y en cada BD de tenant.
    await TenantDatabaseBootstrapper.InitializeAllAsync(app.Services, app.Configuration, app.Environment);

    app.MapGet("/", () => Results.Redirect("/swagger")).AllowAnonymous();
    app.MapHealthChecks("/health").AllowAnonymous();
    app.MapCrmModule();
    app.MapSalesModule();
    app.MapCommunicationsModule();
    app.MapFinanceModule();
    app.MapHumanResourcesModule();
    app.MapFleetModule();
    app.MapAccountingModule();
    app.MapMetrologyModule();
    app.MapAutomationEndpoints();
    app.MapPublicWebhookEndpoints();
    app.MapSuperAdminModule();
    app.MapTenantBackupSelfService();

    await app.RunAsync();
}
catch (HostAbortedException)
{
    throw;
}
catch (Exception exception)
{
    Log.Fatal(exception, "La API no pudo iniciar.");
    throw;
}
finally
{
    await Log.CloseAndFlushAsync();
}

public partial class Program;
