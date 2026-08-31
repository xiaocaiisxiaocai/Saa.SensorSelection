using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;

namespace Saa.SensorSelection.Api.Controllers;

/// <summary>按需读取独立文件正文；读取权限与匿名可读的业务 Store 保持一致。</summary>
[ApiController]
[Route("api/files")]
public class FilesController(AppDbContext db) : ControllerBase
{
    private static readonly HashSet<string> InlineMimeTypes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/webp",
        };

    [HttpGet("{id:guid}/content")]
    [AllowAnonymous]
    public async Task<IActionResult> GetContent(Guid id)
    {
        var file = await db.StoredFiles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
        if (file is null) return NotFound(new { message = "文件不存在或已被删除" });

        var etag = $"\"{file.Id:N}\"";
        Response.Headers.ETag = etag;
        Response.Headers.CacheControl = "public,max-age=31536000,immutable";
        Response.Headers.XContentTypeOptions = "nosniff";
        var inline = InlineMimeTypes.Contains(file.MimeType);
        Response.Headers.ContentDisposition =
            $"{(inline ? "inline" : "attachment")}; filename*=UTF-8''{Uri.EscapeDataString(file.FileName)}";
        if (Request.Headers.IfNoneMatch.Any(value => value == etag))
            return StatusCode(StatusCodes.Status304NotModified);

        return File(
            file.Content,
            inline ? file.MimeType : "application/octet-stream",
            enableRangeProcessing: true);
    }
}
