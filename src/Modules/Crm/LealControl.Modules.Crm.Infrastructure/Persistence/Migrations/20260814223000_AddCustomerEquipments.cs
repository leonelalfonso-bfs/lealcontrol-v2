using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LealControl.Modules.Crm.Infrastructure.Persistence.Migrations
{
    public partial class AddCustomerEquipments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "customer_equipments",
                schema: "crm",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    internal_code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    equipment_type = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    brand = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    model = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    serial_number = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    max_capacity = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    division_scale = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    location_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    last_calibration_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    calibration_interval_months = table.Column<int>(type: "integer", nullable: true),
                    next_calibration_due_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    custom_attributes = table.Column<Dictionary<string, string>>(type: "jsonb", nullable: true),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_customer_equipments", x => x.id);
                    table.ForeignKey(
                        name: "fk_customer_equipments_customers_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "crm",
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_customer_equipments_customer_id",
                schema: "crm",
                table: "customer_equipments",
                column: "customer_id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_equipments",
                schema: "crm");
        }
    }
}
