using System.Text.Json;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Symtek.Api.Services;

namespace Symtek.Api.Controllers;

/// <summary>
/// 数据仓库接口：每个 key（listId:entityName）对应一份 JSON 数组，
/// 与前端 symtek_crud_store 的存储结构一致，业务校验由 StoreService 完成。
/// </summary>
[ApiController]
[Route("api/store")]
[Authorize]
public class StoreController(StoreService store) : ControllerBase
{
    /// <summary>返回全部 key → JSON 数组。</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await store.GetAllAsync());
    }

    /// <summary>读取单个 key 的 JSON 数组。</summary>
    [HttpGet("{key}")]
    public async Task<IActionResult> GetByKey(string key)
    {
        var result = await store.GetByKeyAsync(key);
        if (!result.Found)
        {
            return NotFound(new { message = $"key 不存在: {key}" });
        }

        return Content(result.Json, "application/json; charset=utf-8");
    }

    /// <summary>整体导入：以提交对象全量替换数据仓库（首次接入时迁移 localStorage 数据用）。</summary>
    [HttpPut]
    public async Task<IActionResult> ReplaceAll([FromBody] JsonElement payload)
    {
        var result = await store.ReplaceAllAsync(payload);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        return Ok(new { ok = true });
    }

    /// <summary>写入单个 key 的 JSON 数组（新增或覆盖）。</summary>
    [HttpPut("{key}")]
    public async Task<IActionResult> Upsert(string key, [FromBody] JsonElement value)
    {
        var result = await store.UpsertAsync(key, value);
        if (!result.Success)
        {
            return BadRequest(new { ok = false, reason = "validation", message = result.Error });
        }

        return Ok(new { ok = true });
    }

    /// <summary>删除单个 key。</summary>
    [HttpDelete("{key}")]
    public async Task<IActionResult> Delete(string key)
    {
        var result = await store.DeleteAsync(key);
        if (!result.Found)
        {
            return NotFound(new { message = $"key 不存在: {key}" });
        }

        return Ok(new { ok = true });
    }
}
