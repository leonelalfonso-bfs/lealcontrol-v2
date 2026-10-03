using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;

[DbContext(typeof(SalesDbContext))]
[Migration("20261002180000_FiscalReservationSeriesGuard")]
public sealed class FiscalReservationSeriesGuard : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.Sql(FiscalReservationSchema.UpgradeSql);

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // No quitar Reserved del CHECK: podría invalidar reservas ya persistidas.
        migrationBuilder.Sql("DROP INDEX IF EXISTS sales.\"UX_fiscal_attempt_unresolved_series\";");
    }
}
