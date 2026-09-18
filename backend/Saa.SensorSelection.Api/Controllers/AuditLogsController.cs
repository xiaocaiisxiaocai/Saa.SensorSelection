using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Controllers;

[ApiController]
[Route("api/audit-logs")]
[Authorize(Policy = "audit:view")]
public class AuditLogsController(AuditLogService auditLogs) : ControllerBase
{
    /// <summary>
    /// 分页查询操作日志（默认按时间倒序）。
    /// 支持筛选：action（操作码）、username（操作用户）、target（操作目标，如数据 key）、
    /// result（true/false）、from/to（UTC 时间范围，ISO 8601）。
    /// 支持排序：sort（timestamp/username/action/result）、direction（asc/desc）。
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(AuditLogPage), StatusCodes.Status200OK)]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? action = null,
        [FromQuery] string? username = null,
        [FromQuery] string? target = null,
        [FromQuery] bool? result = null,
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null,
        [FromQuery] string? sort = null,
        [FromQuery] string? direction = null,
        CancellationToken ct = default)
    {
        return Ok(await auditLogs.QueryAsync(
            page,
            pageSize,
            action,
            username,
            target,
            result,
            from,
            to,
            sort,
            direction,
            ct));
    }
}
