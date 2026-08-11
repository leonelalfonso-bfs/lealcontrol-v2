using System.Text.Json.Serialization;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Crm.Infrastructure;
using LealControl.Modules.Crm.Infrastructure.Http;
using LealControl.Modules.Crm.Infrastructure.Persistence;
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
    builder.Services.AddCrmModule(builder.Configuration);
    builder.Services.ConfigureHttpJsonOptions(options =>
        options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "Leal Control ERP 2.0",
            Version = "v1",
            Description = "API modular. Primer módulo: CRM."
        });
    });
    builder.Services.AddHealthChecks().AddDbContextCheck<CrmDbContext>("crm-db");
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("web", policy =>
            policy.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
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

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
        await db.Database.MigrateAsync();
    }

    app.MapGet("/", () => Results.Redirect("/swagger"));
    app.MapHealthChecks("/health");
    app.MapCrmModule();

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
