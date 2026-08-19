using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Saa.SensorSelection.Api.Models.Dtos;
using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Controllers;

[ApiController]
[Route("api/rbac/roles")]
[Authorize(Policy = "rbac:view")]
public class RolesController(RoleService roles, AuditLogService audit) : ControllerBase
{
    /// <summary>角色列表（含权限）。</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<RoleListItem>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List()
    {
        return Ok(await roles.ListAsync());
    }

    /// <summary>全部权限清单（角色编辑界面勾选用）。</summary>
    [HttpGet("permissions")]
    [ProducesResponseType(typeof(IReadOnlyList<PermissionInfo>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ListPermissions()
    {
        return Ok(await roles.ListPermissionsAsync());
    }

    /// <summary>创建角色。</summary>
    [HttpPost]
    [Authorize(Policy = "rbac:role:write")]
    [ProducesResponseType(typeof(RoleListItem), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateRoleRequest request)
    {
        var result = await roles.CreateAsync(request);
        await audit.WriteAsync(
            "role.create",
            target: result.Value?.Code ?? request.Code,
            detail: result.Success ? $"{result.Value!.Permissions.Count} 项权限" : null,
            success: result.Success,
            error: result.Error);
        return result.Success
            ? Ok(result.Value)
            : BadRequest(new { message = result.Error });
    }

    /// <summary>更新角色（名称/描述/权限；系统内置角色不可改）。</summary>
    [HttpPut("{id:int}")]
    [Authorize(Policy = "rbac:role:write")]
    [ProducesResponseType(typeof(RoleListItem), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateRoleRequest request)
    {
        var result = await roles.UpdateAsync(id, request);
        await audit.WriteAsync(
            "role.update",
            target: result.Value?.Code ?? $"#{id}",
            detail: result.Success ? $"{result.Value!.Permissions.Count} 项权限" : null,
            success: result.Success,
            error: result.Error);
        return result.Success
            ? Ok(result.Value)
            : BadRequest(new { message = result.Error });
    }

    /// <summary>删除角色（内置角色不可删、已分配用户的角色不可删）。</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = "rbac:role:write")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await roles.DeleteAsync(id);
        await audit.WriteAsync(
            "role.delete",
            target: $"#{id}",
            success: result.Success,
            error: result.Error);
        return result.Success
            ? Ok(new { ok = true })
            : BadRequest(new { message = result.Error });
    }
}
