using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace LealControl.Modules.Crm.Infrastructure.Persistence;

internal sealed class CrmDbContextFactory : IDesignTimeDbContextFactory<CrmDbContext>
{
    public CrmDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<CrmDbContext>()
            .UseNpgsql(
                "Host=localhost;Port=5432;Database=lealcontrol;Username=leal;Password=leal",
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", CrmDbContext.Schema))
            .Options;

        return new CrmDbContext(options);
    }
}
