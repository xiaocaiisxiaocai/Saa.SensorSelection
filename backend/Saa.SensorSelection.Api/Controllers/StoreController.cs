using System.Text.Json;
using System.Text.Json.Nodes;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

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
    /// <summary>返回全部 key → JSON 数组（匿名可读）。</summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        return Ok(await store.GetAllAsync(ct));
    }

    /// <summary>通过查询参数读取单个 key，避免代理二次解码业务键。</summary>
    [HttpGet("by-key")]
    [AllowAnonymous]
    public async Task<IActionResult> GetByQueryKey([FromQuery] string key, CancellationToken ct)
    {
        var result = await store.GetByKeyAsync(key, ct);
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
        var result = await store.ReplaceEntityGroupsAsync(kind, payload, ct);
        var target = $"entity-groups:{kind}";
        await audit.WriteAsync(
            "store.entity-groups.reorder",
            target: target,
            detail: payload.ValueKind == JsonValueKind.Array
                ? $"数据类型：数组；分类数：{payload.GetArrayLength()}"
                : $"数据类型：{JsonKind(payload.ValueKind)}",
            success: result.Success,
            error: result.Error,
            ct: ct);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        return Ok(new { ok = true });
    }

    /// <summary>整体导入：以提交对象全量替换数据仓库（首次接入时迁移 localStorage 数据用）。</summary>
    [HttpPut]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> ReplaceAll([FromBody] JsonElement payload, CancellationToken ct)
    {
        var result = await store.ReplaceAllAsync(payload, ct);
        var keyCount = payload.ValueKind == JsonValueKind.Object
            ? payload.EnumerateObject().Count()
            : 0;
        await audit.WriteAsync(
            "store.replace-all",
            detail: $"数据类型：{JsonKind(payload.ValueKind)}；key数：{keyCount}",
            success: result.Success,
            error: result.Error,
            ct: ct);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

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
        var result = await store.UpsertAsync(key, value, ct);
        var itemCount = value.ValueKind == JsonValueKind.Array ? value.GetArrayLength() : 0;
        await audit.WriteAsync(
            "store.upsert",
            target: key,
            detail: $"数据类型：{JsonKind(value.ValueKind)}；记录数：{itemCount}",
            success: result.Success,
            error: result.Error,
            ct: ct);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        return Ok(new
        {
            ok = true,
            value = result.Json is null ? null : JsonNode.Parse(result.Json),
        });
    }

    /// <summary>通过查询参数删除单个 key。</summary>
    [HttpDelete("by-key")]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> DeleteByQueryKey([FromQuery] string key, CancellationToken ct)
    {
        var result = await store.DeleteAsync(key, ct);
        await audit.WriteAsync(
            "store.delete",
            target: key,
            detail: result.Found ? $"删除目标：{key}" : "删除目标不存在",
            success: result.Found,
            error: result.Found ? null : "key 不存在",
            ct: ct);
        if (!result.Found)
        {
            return NotFound(new { message = $"key 不存在: {key}" });
        }

        return Ok(new { ok = true });
    }

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
