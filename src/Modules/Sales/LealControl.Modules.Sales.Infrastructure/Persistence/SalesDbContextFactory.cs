using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

internal sealed class SalesDbContextFactory : IDesignTimeDbContextFactory<SalesDbContext>
{
    public SalesDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<SalesDbContext>()
            .UseNpgsql(
                "Host=localhost;Port=5432;Database=lealcontrol;Username=leal;Password=leal",
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", SalesDbContext.Schema))
            .Options;

        return new SalesDbContext(options);
    }
}
