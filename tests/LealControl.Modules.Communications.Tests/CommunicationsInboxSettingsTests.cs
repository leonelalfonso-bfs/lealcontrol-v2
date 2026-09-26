using LealControl.Api.SuperAdmin;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class CommunicationsInboxSettingsTests
{
    [Fact]
    public async Task TogglePersistsAndCanBeReadByAnotherRequest()
    {
        await using var postgres = new PostgreSqlBuilder()
            .WithImage("postgres:16-alpine")
            .WithDatabase("communications_settings_tests")
            .WithUsername("leal")
            .WithPassword("leal")
            .Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<MasterDbContext>()
            .UseNpgsql(postgres.GetConnectionString()).Options;
        await using (var setup = new MasterDbContext(options))
            await setup.Database.EnsureCreatedAsync();

        await using (var firstRequest = new MasterDbContext(options))
        {
            var settings = new CommunicationsInboxSettings(firstRequest);
            Assert.False(await settings.IsEnabledAsync());
            await settings.SetEnabledAsync(true);
        }

        await using (var nextRequest = new MasterDbContext(options))
        {
            var settings = new CommunicationsInboxSettings(nextRequest);
            Assert.True(await settings.IsEnabledAsync());
            await settings.SetEnabledAsync(false);
        }

        await using var afterDisable = new MasterDbContext(options);
        Assert.False(await new CommunicationsInboxSettings(afterDisable).IsEnabledAsync());
    }
}
