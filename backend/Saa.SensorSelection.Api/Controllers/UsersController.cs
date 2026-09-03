using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Saa.SensorSelection.Api.Models.Dtos;
using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Controllers;

[ApiController]
[Route("api/rbac/users")]
[Authorize(Policy = "rbac:view")]
public class UsersController(UserService users, AuditLogService audit) : ControllerBase
{
    /// <summary>用户列表（含角色、所属组织）。</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<UserListItem>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        return Ok(await users.ListAsync(ct));
    }

    /// <summary>创建用户。</summary>
    [HttpPost]
    [Authorize(Policy = "rbac:user:write")]
    [ProducesResponseType(typeof(UserListItem), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request, CancellationToken ct)
    {
        var result = await users.CreateAsync(request, ct);
        await audit.WriteAsync(
            "user.create",
            target: result.Value?.Username ?? request.Username,
            detail: result.Success ? FormatDetail(result.Value!) : null,
            success: result.Success,
            error: result.Error,
            ct: ct);
        return result.Success
            ? Ok(result.Value)
            : BadRequest(new { message = result.Error });
    }

    /// <summary>更新用户（显示名/启用状态/角色/组织）。</summary>
    [HttpPut("{id:int}")]
    [Authorize(Policy = "rbac:user:write")]
    [ProducesResponseType(typeof(UserListItem), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateUserRequest request, CancellationToken ct)
    {
        var result = await users.UpdateAsync(id, request, ct);
        await audit.WriteAsync(
            "user.update",
            target: result.Value?.Username ?? $"#{id}",
            detail: result.Success ? FormatDetail(result.Value!) : null,
            success: result.Success,
            error: result.Error,
            ct: ct);
        return result.Success
            ? Ok(result.Value)
            : BadRequest(new { message = result.Error });
    }

    /// <summary>重置用户密码。</summary>
    [HttpPut("{id:int}/password")]
    [Authorize(Policy = "rbac:user:write")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ResetPassword(int id, [FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        var result = await users.ResetPasswordAsync(id, request.Password, ct);
        await audit.WriteAsync(
            "user.reset-password",
            target: $"#{id}",
            detail: result.Success ? "密码已重置" : "密码重置失败",
            success: result.Success,
            error: result.Error,
            ct: ct);
        return result.Success
            ? Ok(new { ok = true })
            : BadRequest(new { message = result.Error });
    }

    /// <summary>删除用户（不能删除自己，且至少保留一名系统管理员）。</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = "rbac:user:write")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var username = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        var result = await users.DeleteAsync(id, username, ct);
        await audit.WriteAsync(
            "user.delete",
            target: $"#{id}",
            detail: $"用户ID：{id}",
            success: result.Success,
            error: result.Error,
            ct: ct);
        return result.Success
            ? Ok(new { ok = true })
            : BadRequest(new { message = result.Error });
    }

    private static string FormatDetail(UserListItem user)
    {
        var roles = user.Roles.Count == 0
            ? "无"
            : string.Join("、", user.Roles.Select(role => role.Name));
        return $"显示名：{user.DisplayName}；状态：{(user.IsActive ? "启用" : "停用")}；角色：{roles}；组织：{user.OrgUnit?.Path ?? "未分配"}";
    }
}
