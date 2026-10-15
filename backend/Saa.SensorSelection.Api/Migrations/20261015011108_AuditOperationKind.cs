using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Saa.SensorSelection.Api.Migrations
{
    /// <inheritdoc />
    public partial class AuditOperationKind : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OperationKind",
                table: "AuditLogs",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_OperationKind",
                table: "AuditLogs",
                column: "OperationKind");

            // 已有日志按同一规则（AuditLogService.OperationKindOf）补上操作类型：
            // 截到第一个「「」或「 · 」之前
            migrationBuilder.Sql(
                """
                UPDATE AuditLogs SET OperationKind = trim(
                    CASE
                        WHEN instr(OperationLabel, '「') > 1
                            AND (instr(OperationLabel, ' · ') <= 1 OR instr(OperationLabel, '「') < instr(OperationLabel, ' · '))
                            THEN substr(OperationLabel, 1, instr(OperationLabel, '「') - 1)
                        WHEN instr(OperationLabel, ' · ') > 1
                            THEN substr(OperationLabel, 1, instr(OperationLabel, ' · ') - 1)
                        ELSE OperationLabel
                    END)
                WHERE OperationLabel IS NOT NULL AND trim(OperationLabel) <> '';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AuditLogs_OperationKind",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "OperationKind",
                table: "AuditLogs");
        }
    }
}
