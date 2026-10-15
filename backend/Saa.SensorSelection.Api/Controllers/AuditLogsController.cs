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
    /// 支持筛选：action（操作码）、username（操作用户，包含匹配）、target（操作目标，如数据 key）、
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

    /// <summary>
    /// 按操作分页查询：同一次界面操作产生的多条日志归成一组（最新的在前）。
    /// 筛选：keyword（用户名 / 显示名 / 操作名称 / 目标 / 详情 / 变更明细，包含匹配）、
    /// action（可重复，多选操作码）、kind（可重复，多选操作类型；没有操作名称的日志按操作码匹配）、
    /// result（true/false）、from/to（UTC，ISO 8601）、hideLogin（隐藏登录）。
    /// </summary>
    [HttpGet("operations")]
    [ProducesResponseType(typeof(AuditOperationPage), StatusCodes.Status200OK)]
    public async Task<IActionResult> Operations(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? keyword = null,
        [FromQuery(Name = "action")] string[]? actions = null,
        [FromQuery] bool? result = null,
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null,
        [FromQuery] bool hideLogin = false,
        [FromQuery(Name = "kind")] string[]? kinds = null,
        CancellationToken ct = default)
    {
        return Ok(await auditLogs.QueryOperationsAsync(
            page,
            pageSize,
            keyword,
            actions,
            result,
            from,
            to,
            hideLogin,
            kinds,
            ct));
    }

    /// <summary>日志里出现过的操作类型（如「删除机型」；没有操作名称的是操作码），供「操作」筛选。</summary>
    [HttpGet("operations/kinds")]
    [ProducesResponseType(typeof(IReadOnlyList<string>), StatusCodes.Status200OK)]
    public async Task<IActionResult> OperationKinds(CancellationToken ct)
    {
        return Ok(await auditLogs.ListOperationKindsAsync(ct));
    }
}
