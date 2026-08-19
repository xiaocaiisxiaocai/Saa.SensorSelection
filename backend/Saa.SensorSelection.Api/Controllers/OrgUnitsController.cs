using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Saa.SensorSelection.Api.Models.Dtos;
using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Controllers;

[ApiController]
[Route("api/rbac/org-units")]
[Authorize(Policy = "rbac:view")]
public class OrgUnitsController(OrgUnitService orgUnits, AuditLogService audit) : ControllerBase
{
    /// <summary>组织节点列表（扁平，前端组树；含子级数与挂载用户数）。</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<OrgUnitListItem>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List()
    {
        return Ok(await orgUnits.ListAsync());
    }

    /// <summary>创建组织节点（父级可自由指定，支持跳级）。</summary>
    [HttpPost]
    [Authorize(Policy = "rbac:org:write")]
    [ProducesResponseType(typeof(OrgUnitListItem), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateOrgUnitRequest request)
    {
        var result = await orgUnits.CreateAsync(request);
        await audit.WriteAsync(
            "org.create",
            target: result.Value?.Name ?? request.Name,
            detail: result.Success
                ? (string.IsNullOrWhiteSpace(result.Value!.Level) ? "顶层组织" : $"层级：{result.Value.Level}")
                : null,
            success: result.Success,
            error: result.Error);
        return result.Success
            ? Ok(result.Value)
            : BadRequest(new { message = result.Error });
    }

    /// <summary>更新组织节点（改名/改父级/改层级/排序）。</summary>
    [HttpPut("{id:int}")]
    [Authorize(Policy = "rbac:org:write")]
    [ProducesResponseType(typeof(OrgUnitListItem), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateOrgUnitRequest request)
    {
        var result = await orgUnits.UpdateAsync(id, request);
        await audit.WriteAsync(
            "org.update",
            target: result.Value?.Name ?? $"#{id}",
            detail: result.Success
                ? (string.IsNullOrWhiteSpace(result.Value!.Level) ? "顶层组织" : $"层级：{result.Value.Level}")
                : null,
            success: result.Success,
            error: result.Error);
        return result.Success
            ? Ok(result.Value)
            : BadRequest(new { message = result.Error });
    }

    /// <summary>删除组织节点（有子级或已挂用户时拒绝）。</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = "rbac:org:write")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await orgUnits.DeleteAsync(id);
        await audit.WriteAsync(
            "org.delete",
            target: $"#{id}",
            success: result.Success,
            error: result.Error);
        return result.Success
            ? Ok(new { ok = true })
            : BadRequest(new { message = result.Error });
    }
}
