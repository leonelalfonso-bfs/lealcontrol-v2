using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LealControl.Modules.Crm.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ProductionSchemaParity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.AddColumn<string>(
                name: "CustomFields",
                schema: "crm",
                table: "opportunities",
                type: "jsonb",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpectedCloseDate",
                schema: "crm",
                table: "opportunities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Probability",
                schema: "crm",
                table: "opportunities",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "RottingDays",
                schema: "crm",
                table: "opportunities",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<uint>(
                name: "xmin",
                schema: "crm",
                table: "opportunities",
                type: "xid",
                rowVersion: true,
                nullable: false,
                defaultValue: 0u);

            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedAtUtc",
                schema: "crm",
                table: "activities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DueDate",
                schema: "crm",
                table: "activities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDone",
                schema: "crm",
                table: "activities",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "customer_equipments",
                schema: "crm",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InternalCode = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    EquipmentType = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Brand = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Model = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    SerialNumber = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    MaxCapacity = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    DivisionScale = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    LastCalibrationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CalibrationIntervalMonths = table.Column<int>(type: "integer", nullable: true),
                    NextCalibrationDueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CustomAttributes = table.Column<string>(type: "jsonb", nullable: false),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_equipments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customer_equipments_customers_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "crm",
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "suppliers",
                schema: "crm",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    LegalName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    TradeName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    DocumentType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DocumentNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    TaxCondition = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Email = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Phone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ContactName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    FiscalStreet = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    FiscalCity = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    FiscalProvince = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    FiscalPostalCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PaymentTermsDays = table.Column<int>(type: "integer", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_suppliers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "tenant_settings",
                schema: "public",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    LegalName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    TradeName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    DocumentType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DocumentNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    TaxCondition = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IibbRegime = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IibbNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Email = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Phone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    WhatsApp = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Website = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    FiscalStreet = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    FiscalCity = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    FiscalProvince = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    FiscalPostalCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    LogoUrl = table.Column<string>(type: "text", nullable: true),
                    ArcaCertificateCrt = table.Column<string>(type: "text", nullable: true),
                    ArcaCertificateKey = table.Column<string>(type: "text", nullable: true),
                    ArcaEnvironment = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ArcaSignerCuit = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    BankName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    BankCbu = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    BankAlias = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    DefaultQuoteValidDays = table.Column<int>(type: "integer", nullable: false),
                    DefaultDeliveryDays = table.Column<int>(type: "integer", nullable: false),
                    DefaultWarranty = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    DefaultPaymentTerms = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tenant_settings", x => x.TenantId);
                });

            migrationBuilder.CreateTable(
                name: "tenant_users",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FullName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Email = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Role = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tenant_users", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_activities_TenantId_OpportunityId_IsDone_DueDate",
                schema: "crm",
                table: "activities",
                columns: new[] { "TenantId", "OpportunityId", "IsDone", "DueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_customer_equipments_customer_id",
                schema: "crm",
                table: "customer_equipments",
                column: "customer_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_equipments",
                schema: "crm");

            migrationBuilder.DropTable(
                name: "suppliers",
                schema: "crm");

            migrationBuilder.DropTable(
                name: "tenant_settings",
                schema: "public");

            migrationBuilder.DropTable(
                name: "tenant_users",
                schema: "public");

            migrationBuilder.DropIndex(
                name: "IX_activities_TenantId_OpportunityId_IsDone_DueDate",
                schema: "crm",
                table: "activities");

            migrationBuilder.DropColumn(
                name: "CustomFields",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "ExpectedCloseDate",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "Probability",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "RottingDays",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "xmin",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "CompletedAtUtc",
                schema: "crm",
                table: "activities");

            migrationBuilder.DropColumn(
                name: "DueDate",
                schema: "crm",
                table: "activities");

            migrationBuilder.DropColumn(
                name: "IsDone",
                schema: "crm",
                table: "activities");
        }
    }
}
