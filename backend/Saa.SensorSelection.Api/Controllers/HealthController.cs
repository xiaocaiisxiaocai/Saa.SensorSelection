using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Saa.SensorSelection.Api.Data;

namespace Saa.SensorSelection.Api.Controllers;

[ApiController]
[Route("api/health")]
[AllowAnonymous]
public class HealthController(AppDbContext db) : ControllerBase
{
    /// <summary>健康检查：同时探测数据库连通性（部署探活/排障用）。</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var dbOk = await db.Database.CanConnectAsync(ct);
        if (!dbOk)
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { status = "error", db = "error", time = DateTime.UtcNow });
        }

        return Ok(new { status = "ok", db = "ok", time = DateTime.UtcNow });
    }
}
