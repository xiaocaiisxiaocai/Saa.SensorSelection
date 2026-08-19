using System.Text.Json;

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
    public async Task<IActionResult> GetAll()
    {
        return Ok(await store.GetAllAsync());
    }

    /// <summary>读取单个 key 的 JSON 数组（匿名可读）。</summary>
    [HttpGet("{key}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetByKey(string key)
    {
        var result = await store.GetByKeyAsync(key);
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
        [FromBody] JsonElement payload)
    {
        var result = await store.ReplaceEntityGroupsAsync(kind, payload);
        var target = $"entity-groups:{kind}";
        await audit.WriteAsync(
            "store.entity-groups.reorder",
            target: target,
            detail: payload.ValueKind == JsonValueKind.Array
                ? $"{payload.GetArrayLength()} 个分类"
                : null,
            success: result.Success,
            error: result.Error);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        return Ok(new { ok = true });
    }

    /// <summary>整体导入：以提交对象全量替换数据仓库（首次接入时迁移 localStorage 数据用）。</summary>
    [HttpPut]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> ReplaceAll([FromBody] JsonElement payload)
    {
        var result = await store.ReplaceAllAsync(payload);
        var keyCount = payload.ValueKind == JsonValueKind.Object
            ? payload.EnumerateObject().Count()
            : 0;
        await audit.WriteAsync(
            "store.replace-all",
            detail: $"{keyCount} 个 key",
            success: result.Success,
            error: result.Error);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        return Ok(new { ok = true });
    }

    /// <summary>写入单个 key 的 JSON 数组（新增或覆盖）。</summary>
    [HttpPut("{key}")]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> Upsert(string key, [FromBody] JsonElement value)
    {
        var result = await store.UpsertAsync(key, value);
        var itemCount = value.ValueKind == JsonValueKind.Array ? value.GetArrayLength() : 0;
        await audit.WriteAsync(
            "store.upsert",
            target: key,
            detail: $"{itemCount} 条记录",
            success: result.Success,
            error: result.Error);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        return Ok(new { ok = true });
    }

    /// <summary>删除单个 key。</summary>
    [HttpDelete("{key}")]
    [Authorize(Policy = "selection:write")]
    public async Task<IActionResult> Delete(string key)
    {
        var result = await store.DeleteAsync(key);
        await audit.WriteAsync(
            "store.delete",
            target: key,
            success: result.Found,
            error: result.Found ? null : "key 不存在");
        if (!result.Found)
        {
            return NotFound(new { message = $"key 不存在: {key}" });
        }

        return Ok(new { ok = true });
    }
}
