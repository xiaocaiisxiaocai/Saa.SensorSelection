using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Saa.SensorSelection.Api.Migrations
{
    /// <inheritdoc />
    public partial class AuditOperationsAndChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Changes",
                table: "AuditLogs",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OperationId",
                table: "AuditLogs",
                type: "TEXT",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OperationLabel",
                table: "AuditLogs",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_OperationId",
                table: "AuditLogs",
                column: "OperationId");

            // 旧日志没有操作编号：每条自成一组，按操作分页时不会全挤进同一个 NULL 组
            migrationBuilder.Sql("UPDATE AuditLogs SET OperationId = 'legacy-' || Id WHERE OperationId IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AuditLogs_OperationId",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "Changes",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "OperationId",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "OperationLabel",
                table: "AuditLogs");
        }
    }
}
