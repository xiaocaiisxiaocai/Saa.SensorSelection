using System.Text.Json;
using System.Text.Json.Nodes;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Saa.SensorSelection.Api.Models;
using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Controllers;

/// <summary>
/// 数据仓库接口：每个 key（listId:entityName）对应一份 JSON 数组，
/// 与前端 symtek_crud_store 的存储结构一致，业务校验由 StoreService 完成。
///
/// 读接口对匿名开放：未登录用户可以只读预览业务数据（客户/制程/机型/Sensor 型号），
/// 写接口要求 selection:write 权限（写入失败时前端引导登录）。
/// </summary>
[ApiController]
[Route("api/store")]
public class StoreController(StoreService store, AuditLogService audit) : ControllerBase
{
    private const string TableColumnSettingsKey = "table-columns:global";

    /// <summary>返回全部 key → JSON 数组（匿名可读）。</summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var payload = await store.GetAllAsync(ct);
        Response.Headers.ETag = StoreService.EntityTag(payload);
        return Ok(payload);
    }

    /// <summary>通过查询参数读取单个 key，避免代理二次解码业务键。</summary>
    [HttpGet("by-key")]
    [AllowAnonymous]
    public async Task<IActionResult> GetByQueryKey([FromQuery] string key, CancellationToken ct)
    {
        var result = await store.GetByKeyAsync(key, ct);
        Response.Headers.ETag = result.EntityTag;
        if (!result.Found)
        {
            return NotFound(new { message = $"key 不存在: {key}" });
        }

        // Found=true 时 Json 必非空（编译器无法自动收窄 record 属性）
        return Content(result.Json!, "application/json; charset=utf-8");
    }

    /// <summary>持久化客户/机型分类及条目排序。</summary>
    [HttpPut("entity-groups/{kind}")]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> ReplaceEntityGroups(
        string kind,
        [FromBody] JsonElement payload,
        CancellationToken ct)
    {
        if (!TryGetIfMatch(out var expectedEntityTag, out var preconditionError))
        {
            return preconditionError!;
        }
        var result = await store.ReplaceEntityGroupsAsync(kind, payload, expectedEntityTag!, ct);
        var target = $"entity-groups:{kind}";
        await audit.WriteAsync(
            "store.entity-groups.reorder",
            target: target,
            detail: payload.ValueKind == JsonValueKind.Array
                ? $"数据类型：数组；分类数：{payload.GetArrayLength()}"
                : $"数据类型：{JsonKind(payload.ValueKind)}",
            success: result.Success,
            error: result.Error,
            changes: result.Success ? AuditChanges.DiffArrays(result.PreviousJson, result.Json) : null,
            ct: ct);
        if (result.PreconditionFailed)
        {
            return StatusCode(StatusCodes.Status412PreconditionFailed, ConflictBody(result.Error));
        }
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        Response.Headers.ETag = StoreService.EntityTag(result.Json!);
        return Ok(new { ok = true });
    }

    /// <summary>整体导入：以提交对象全量替换数据仓库（首次接入时迁移 localStorage 数据用）。</summary>
    [HttpPut]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> ReplaceAll([FromBody] JsonElement payload, CancellationToken ct)
    {
        if (!TryGetIfMatch(out var expectedEntityTag, out var preconditionError))
        {
            return preconditionError!;
        }
        var currentSettings = await store.GetByKeyAsync(TableColumnSettingsKey, ct);
        var replacesSettings = payload.ValueKind == JsonValueKind.Object &&
            payload.EnumerateObject().Any(property => IsTableColumnSettingsKey(property.Name));
        if (!IsSystemAdmin && (currentSettings.Found || replacesSettings))
        {
            return Forbid();
        }

        var result = await store.ReplaceAllAsync(payload, expectedEntityTag!, ct);
        var keyCount = payload.ValueKind == JsonValueKind.Object
            ? payload.EnumerateObject().Count()
            : 0;
        await audit.WriteAsync(
            "store.replace-all",
            detail: $"数据类型：{JsonKind(payload.ValueKind)}；key数：{keyCount}",
            success: result.Success,
            error: result.Error,
            ct: ct);
        if (result.PreconditionFailed)
        {
            return StatusCode(StatusCodes.Status412PreconditionFailed, ConflictBody(result.Error));
        }
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        var current = await store.GetAllAsync(ct);
        Response.Headers.ETag = StoreService.EntityTag(current);
        return Ok(new { ok = true });
    }

    /// <summary>通过查询参数写入单个 key（新增或覆盖）。</summary>
    [HttpPut("by-key")]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> UpsertByQueryKey(
        [FromQuery] string key,
        [FromBody] JsonElement value,
        CancellationToken ct)
    {
        if (!TryGetIfMatch(out var expectedEntityTag, out var preconditionError))
        {
            return preconditionError!;
        }
        if (IsTableColumnSettingsKey(key) && !IsSystemAdmin)
        {
            return Forbid();
        }

        var result = await store.UpsertAsync(key, value, expectedEntityTag!, ct);
        var itemCount = value.ValueKind == JsonValueKind.Array ? value.GetArrayLength() : 0;
        await audit.WriteAsync(
            "store.upsert",
            target: key,
            detail: $"数据类型：{JsonKind(value.ValueKind)}；记录数：{itemCount}",
            success: result.Success,
            error: result.Error,
            changes: result.Success ? AuditChanges.DiffArrays(result.PreviousJson, result.Json) : null,
            ct: ct);
        if (result.PreconditionFailed)
        {
            return StatusCode(StatusCodes.Status412PreconditionFailed, ConflictBody(result.Error));
        }
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        Response.Headers.ETag = StoreService.EntityTag(result.Json!);
        return Ok(new
        {
            ok = true,
            value = result.Json is null ? null : JsonNode.Parse(result.Json),
        });
    }

    /// <summary>带显式期望值的原子批次：任一冲突或校验失败均不写入。</summary>
    [HttpPost("batch")]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> ApplyBatch([FromBody] JsonElement payload, CancellationToken ct)
    {
        if (payload.ValueKind != JsonValueKind.Object ||
            !payload.TryGetProperty("changes", out var changesElement) ||
            changesElement.ValueKind != JsonValueKind.Array)
        {
            return BadRequest(ValidationBody("请求体必须包含 changes 数组"));
        }
        if (changesElement.GetArrayLength() == 0)
        {
            return BadRequest(ValidationBody("changes 不能为空"));
        }

        var changes = new List<StoreBatchChange>(changesElement.GetArrayLength());
        foreach (var item in changesElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object ||
                !item.TryGetProperty("key", out var keyElement) ||
                keyElement.ValueKind != JsonValueKind.String)
            {
                return BadRequest(ValidationBody("每个 change 必须包含 key 字符串"));
            }
            if (!item.TryGetProperty("expected", out var expectedElement))
            {
                return StatusCode(
                    StatusCodes.Status428PreconditionRequired,
                    new { ok = false, reason = "precondition-required", message = "每个 change 必须显式包含 expected" });
            }
            if (expectedElement.ValueKind is not (JsonValueKind.Array or JsonValueKind.Null))
            {
                return BadRequest(ValidationBody("expected 必须是数组或 null"));
            }
            if (!item.TryGetProperty("value", out var valueElement) ||
                valueElement.ValueKind is not (JsonValueKind.Array or JsonValueKind.Null))
            {
                return BadRequest(ValidationBody("value 必须是数组或 null"));
            }

            changes.Add(new StoreBatchChange(
                keyElement.GetString() ?? string.Empty,
                expectedElement.ValueKind == JsonValueKind.Null ? null : expectedElement.Clone(),
                valueElement.ValueKind == JsonValueKind.Null ? null : valueElement.Clone()));
        }

        if (!IsSystemAdmin && changes.Any(change => IsTableColumnSettingsKey(change.Key)))
        {
            return Forbid();
        }

        var result = await store.ApplyBatchAsync(changes, ct);
        if (result.Success)
        {
            foreach (var change in changes)
            {
                result.PreviousValues.TryGetValue(change.Key, out var previousJson);
                result.Values.TryGetValue(change.Key, out var currentJson);
                var action = change.Value is null
                    ? "store.delete"
                    : change.Key.StartsWith("entity-groups:", StringComparison.OrdinalIgnoreCase)
                        ? "store.entity-groups.reorder"
                        : "store.upsert";
                await audit.WriteAsync(
                    action,
                    target: change.Key,
                    detail: change.Value is null
                        ? $"删除目标：{change.Key}"
                        : $"批次写入：{change.Key}",
                    changes: AuditChanges.DiffArrays(previousJson, currentJson),
                    ct: ct);
            }
        }
        else
        {
            await audit.WriteAsync(
                "store.batch",
                detail: $"变更 key 数：{changes.Count}",
                success: false,
                error: result.Error,
                ct: ct);
        }
        if (result.ConflictKey is not null)
        {
            return Conflict(new
            {
                ok = false,
                reason = "conflict",
                key = result.ConflictKey,
                message = result.Error,
            });
        }
        if (!result.Success)
        {
            return BadRequest(ValidationBody(result.Error ?? "批次校验失败"));
        }

        var values = new JsonObject();
        foreach (var (key, json) in result.Values)
        {
            values[key] = json is null ? null : JsonNode.Parse(json);
        }
        return Ok(new { ok = true, values });
    }

    /// <summary>通过查询参数删除单个 key。</summary>
    [HttpDelete("by-key")]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> DeleteByQueryKey([FromQuery] string key, CancellationToken ct)
    {
        if (!TryGetIfMatch(out var expectedEntityTag, out var preconditionError))
        {
            return preconditionError!;
        }
        if (IsTableColumnSettingsKey(key) && !IsSystemAdmin)
        {
            return Forbid();
        }
        if (key.StartsWith("entity-groups:", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(ValidationBody("实体目录不能通过单 key 接口删除"));
        }

        var result = await store.DeleteAsync(key, expectedEntityTag!, ct);
        await audit.WriteAsync(
            "store.delete",
            target: key,
            detail: result.Found ? $"删除目标：{key}" : "删除目标不存在",
            success: result.Found,
            error: result.Found ? null : "key 不存在",
            changes: result.Found ? AuditChanges.DiffArrays(result.PreviousJson, null) : null,
            ct: ct);
        if (result.PreconditionFailed)
        {
            return StatusCode(StatusCodes.Status412PreconditionFailed, ConflictBody(result.Error));
        }
        if (!result.Found)
        {
            return NotFound(new { message = $"key 不存在: {key}" });
        }

        Response.Headers.ETag = StoreService.MissingEntityTag;
        return Ok(new { ok = true });
    }

    private bool IsSystemAdmin =>
        User.IsInRole(RbacDefaults.SystemAdminRoleCode);

    private bool TryGetIfMatch(out string? entityTag, out IActionResult? error)
    {
        entityTag = null;
        error = null;
        var raw = Request.Headers.IfMatch.ToString().Trim();
        if (raw.Length == 0)
        {
            error = StatusCode(
                StatusCodes.Status428PreconditionRequired,
                new { ok = false, reason = "precondition-required", message = "缺少 If-Match，请先读取最新数据" });
            return false;
        }
        if (raw == "*" || raw.StartsWith("W/", StringComparison.OrdinalIgnoreCase) ||
            raw.Contains(',') || raw.Length < 2 || raw[0] != '"' || raw[^1] != '"')
        {
            error = BadRequest(ValidationBody("If-Match 必须是单个强 ETag"));
            return false;
        }

        entityTag = raw;
        return true;
    }

    private static object ValidationBody(string message) =>
        new { ok = false, reason = "validation", message };

    private static object ConflictBody(string? message) =>
        new { ok = false, reason = "conflict", message = message ?? "数据已被其他用户修改，请刷新后重试" };

    private static bool IsTableColumnSettingsKey(string key) =>
        string.Equals(key, TableColumnSettingsKey, StringComparison.OrdinalIgnoreCase);

    private static string JsonKind(JsonValueKind kind)
    {
        return kind switch
        {
            JsonValueKind.Array => "数组",
            JsonValueKind.Object => "对象",
            JsonValueKind.String => "字符串",
            JsonValueKind.Number => "数字",
            JsonValueKind.True or JsonValueKind.False => "布尔值",
            JsonValueKind.Null => "空值",
            _ => "未定义",
        };
    }
}
