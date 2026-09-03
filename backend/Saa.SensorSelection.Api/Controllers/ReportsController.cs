using System.Text;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Saa.SensorSelection.Api.Models;
using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Controllers;

/// <summary>报告文档生成接口。</summary>
[ApiController]
[Route("api/reports")]
public sealed class ReportsController(MachineSchematicReportService reportService) : ControllerBase
{
    /// <summary>
    /// 由服务端生成机型结构示意图 HTML 文档。客户端可直接打开并打印为 PDF。
    /// 报告生成与下载需要登录，匿名用户只能浏览业务数据。
    /// </summary>
    [HttpPost("machine-schematic")]
    [Authorize]
    [RequestSizeLimit(100_000_000)]
    public IActionResult BuildMachineSchematic([FromBody] MachineSchematicReportRequest request)
    {
        var result = reportService.Build(request);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        var fileName = $"machine-schematic-report-{DateTime.UtcNow:yyyyMMdd-HHmmss}.html";
        return File(
            Encoding.UTF8.GetBytes(result.Html!),
            "text/html",
            fileName);
    }
}
