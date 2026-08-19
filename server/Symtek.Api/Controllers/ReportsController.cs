using System.Text;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Symtek.Api.Models;
using Symtek.Api.Services;

namespace Symtek.Api.Controllers;

/// <summary>报告文档生成接口。</summary>
[ApiController]
[Route("api/reports")]
public sealed class ReportsController(MachineSchematicReportService reportService) : ControllerBase
{
    /// <summary>
    /// 由服务端生成机型结构示意图 HTML 文档。客户端可直接打开并打印为 PDF。
    /// 读取权限与业务 Store 一致，匿名只读预览也可以生成报告。
    /// </summary>
    [HttpPost("machine-schematic")]
    [AllowAnonymous]
    [RequestSizeLimit(10_000_000)]
    public IActionResult BuildMachineSchematic([FromBody] MachineSchematicReportRequest request)
    {
        var result = reportService.Build(request);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        var fileName = $"machine-schematic-report-{DateTime.Now:yyyyMMdd-HHmmss}.html";
        return File(
            Encoding.UTF8.GetBytes(result.Html!),
            "text/html",
            fileName);
    }
}
