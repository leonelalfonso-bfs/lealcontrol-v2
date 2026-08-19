using System.Text.Json.Serialization;
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
using LealControl.Api.Automation;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi.Models;
using Serilog;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((context, services, configuration) =>
        configuration.ReadFrom.Configuration(context.Configuration).WriteTo.Console());

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
    builder.Services.ConfigureHttpJsonOptions(options =>
        options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "Leal Control ERP 2.0",
            Version = "v1",
            Description = "API modular. Módulos: CRM + Sales + Finance + RRHH + Flota."
        });
    });
    builder.Services.AddHealthChecks()
        .AddDbContextCheck<CrmDbContext>("crm-db")
        .AddDbContextCheck<SalesDbContext>("sales-db")
        .AddDbContextCheck<CommunicationsDbContext>("communications-db");
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("web", policy =>
            policy.WithOrigins(
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                    "http://localhost:5273",
                    "http://127.0.0.1:5273")
                .AllowAnyHeader()
                .AllowAnyMethod());
    });

    var app = builder.Build();

    app.UseSerilogRequestLogging();
    app.UseCors("web");

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    // Cada instancia, incluida la de pruebas/producción, debe crear y actualizar
    // su esquema antes de atender solicitudes. EF registra las migraciones aplicadas.
    await using (var scope = app.Services.CreateAsyncScope())
    {
        var crm = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        await crm.Database.MigrateAsync();
        await crm.EnsureCrmTablesAsync();
        var sales = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        await sales.Database.MigrateAsync();
        await sales.EnsureTablesCreatedAsync();
        var communications = scope.ServiceProvider.GetRequiredService<CommunicationsDbContext>();
        await communications.Database.MigrateAsync();
        await communications.EnsureTablesCreatedAsync();
        var finance = scope.ServiceProvider.GetRequiredService<FinanceDbContext>();
        await finance.EnsureFinanceTablesAsync();
        var hr = scope.ServiceProvider.GetRequiredService<HumanResourcesDbContext>();
        await hr.EnsureHrTablesAsync();
        var fleet = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        await fleet.EnsureFleetTablesAsync();
    }

    app.MapGet("/", () => Results.Redirect("/swagger"));
    app.MapHealthChecks("/health");
    app.MapCrmModule();
    app.MapSalesModule();
    app.MapCommunicationsModule();
    app.MapFinanceModule();
    app.MapHumanResourcesModule();
    app.MapFleetModule();
    app.MapAutomationEndpoints();

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
