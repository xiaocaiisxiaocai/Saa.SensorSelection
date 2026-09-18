using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Controllers;

/// <summary>
/// 文件正文接口：写入走 multipart 上传（不再把 base64 夹在 Store JSON 里），
/// 读取按需流式返回；读取权限与匿名可读的业务 Store 保持一致。
/// </summary>
[ApiController]
[Route("api/files")]
public class FilesController(StoredFileService storedFiles, AuditLogService audit) : ControllerBase
{
    // multipart 边界、表单头等额外开销留 1 MB 余量。
    private const long MaxUploadRequestBytes = StoredFileService.MaxFileBytes + 1024 * 1024;

    private static readonly HashSet<string> InlineMimeTypes =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/webp",
        };

    /// <summary>上传单个文件，返回写入 Store 时使用的稳定引用。</summary>
    [HttpPost]
    [Authorize(Policy = "selection:write")]
    [RequestSizeLimit(MaxUploadRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxUploadRequestBytes)]
    public async Task<IActionResult> Upload(IFormFile? file, CancellationToken ct)
    {
        if (file is null)
        {
            return BadRequest(new { ok = false, reason = "validation", message = "缺少文件" });
        }

        var result = await storedFiles.SaveUploadAsync(file, ct);
        await audit.WriteAsync(
            "file.upload",
            target: result.File is null ? null : result.File.Id.ToString("D"),
            detail: $"文件名：{file.FileName}；大小：{file.Length} B",
            success: result.Success,
            error: result.Error,
            ct: ct);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        var stored = result.File!;
        return Ok(new
        {
            fileId = stored.Id.ToString("D"),
            dataUrl = StoredFileService.ContentUrl(stored.Id),
            fileName = stored.FileName,
            mimeType = stored.MimeType,
            size = stored.Size,
        });
    }

    [HttpGet("{id:guid}/content")]
    [AllowAnonymous]
    public async Task<IActionResult> GetContent(Guid id, CancellationToken ct)
    {
        // 文件 id 一经写入内容即不可变，命中 ETag 时无需打开正文。
        var etag = $"\"{id:N}\"";
        if (Request.Headers.IfNoneMatch.Any(value => value == etag))
        {
            Response.Headers.ETag = etag;
            return StatusCode(StatusCodes.Status304NotModified);
        }

        var file = await storedFiles.OpenReadAsync(id, ct);
        if (file is null) return NotFound(new { message = "文件不存在或已被删除" });
        HttpContext.Response.RegisterForDisposeAsync(file.Connection);

        Response.Headers.ETag = etag;
        Response.Headers.CacheControl = "public,max-age=31536000,immutable";
        Response.Headers.XContentTypeOptions = "nosniff";
        var inline = InlineMimeTypes.Contains(file.MimeType);
        Response.Headers.ContentDisposition =
            $"{(inline ? "inline" : "attachment")}; filename*=UTF-8''{Uri.EscapeDataString(file.FileName)}";

        return File(
            file.Content,
            inline ? file.MimeType : "application/octet-stream",
            enableRangeProcessing: true);
    }
}
