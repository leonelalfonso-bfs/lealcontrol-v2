using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LealControl.Modules.Crm.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OpportunityClassification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OwnerName",
                schema: "crm",
                table: "opportunities",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Priority",
                schema: "crm",
                table: "opportunities",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Normal");

            migrationBuilder.AddColumn<List<string>>(
                name: "tags",
                schema: "crm",
                table: "opportunities",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'");

            migrationBuilder.CreateIndex(
                name: "IX_opportunities_TenantId_Priority",
                schema: "crm",
                table: "opportunities",
                columns: new[] { "TenantId", "Priority" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_opportunities_TenantId_Priority",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "OwnerName",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "Priority",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "tags",
                schema: "crm",
                table: "opportunities");
        }
    }
}
