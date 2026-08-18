using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Migrations
{
    public partial class EnhanceQuotesModule : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "LocationId",
                schema: "sales",
                table: "quotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ContactId",
                schema: "sales",
                table: "quotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRateUsdBillete",
                schema: "sales",
                table: "quotes",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 1510.00m);

            migrationBuilder.AddColumn<decimal>(
                name: "ExchangeRateUsdDivisa",
                schema: "sales",
                table: "quotes",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 1487.50m);

            migrationBuilder.AddColumn<string>(
                name: "PaymentTerms",
                schema: "sales",
                table: "quotes",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentMethod",
                schema: "sales",
                table: "quotes",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DeliveryTimeDays",
                schema: "sales",
                table: "quotes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Transportation",
                schema: "sales",
                table: "quotes",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Warranty",
                schema: "sales",
                table: "quotes",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProductId",
                schema: "sales",
                table: "quote_lines",
                type: "uuid",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "LocationId", schema: "sales", table: "quotes");
            migrationBuilder.DropColumn(name: "ContactId", schema: "sales", table: "quotes");
            migrationBuilder.DropColumn(name: "ExchangeRateUsdBillete", schema: "sales", table: "quotes");
            migrationBuilder.DropColumn(name: "ExchangeRateUsdDivisa", schema: "sales", table: "quotes");
            migrationBuilder.DropColumn(name: "PaymentTerms", schema: "sales", table: "quotes");
            migrationBuilder.DropColumn(name: "PaymentMethod", schema: "sales", table: "quotes");
            migrationBuilder.DropColumn(name: "DeliveryTimeDays", schema: "sales", table: "quotes");
            migrationBuilder.DropColumn(name: "Transportation", schema: "sales", table: "quotes");
            migrationBuilder.DropColumn(name: "Warranty", schema: "sales", table: "quotes");
            migrationBuilder.DropColumn(name: "ProductId", schema: "sales", table: "quote_lines");
        }
    }
}
