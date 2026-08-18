using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LealControl.Modules.Crm.Infrastructure.Persistence.Migrations
{
    public partial class OpportunityKanbanActivitySelling : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Probability",
                schema: "crm",
                table: "opportunities",
                type: "integer",
                nullable: false,
                defaultValue: 10);

            migrationBuilder.AddColumn<int>(
                name: "RottingDays",
                schema: "crm",
                table: "opportunities",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpectedCloseDate",
                schema: "crm",
                table: "opportunities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Dictionary<string, string>>(
                name: "CustomFields",
                schema: "crm",
                table: "opportunities",
                type: "jsonb",
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

            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedAtUtc",
                schema: "crm",
                table: "activities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_activities_TenantId_OpportunityId_IsDone_DueDate",
                schema: "crm",
                table: "activities",
                columns: new[] { "TenantId", "OpportunityId", "IsDone", "DueDate" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_activities_TenantId_OpportunityId_IsDone_DueDate",
                schema: "crm",
                table: "activities");

            migrationBuilder.DropColumn(
                name: "Probability",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "RottingDays",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "ExpectedCloseDate",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "CustomFields",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "xmin",
                schema: "crm",
                table: "opportunities");

            migrationBuilder.DropColumn(
                name: "DueDate",
                schema: "crm",
                table: "activities");

            migrationBuilder.DropColumn(
                name: "IsDone",
                schema: "crm",
                table: "activities");

            migrationBuilder.DropColumn(
                name: "CompletedAtUtc",
                schema: "crm",
                table: "activities");
        }
    }
}
