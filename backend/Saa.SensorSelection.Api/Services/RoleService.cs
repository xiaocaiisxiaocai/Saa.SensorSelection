using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;
using Saa.SensorSelection.Api.Models.Dtos;

namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 角色与权限管理。系统内置角色（admin）受保护：不可修改权限、不可删除；
/// 删除角色时若已分配给用户则拒绝。
/// </summary>
public class RoleService(AppDbContext db)
{
    /// <summary>操作日志用：删除前先取角色标识，删掉后就查不到了。</summary>
    public Task<string?> FindCodeAsync(int id, CancellationToken ct = default) =>
        db.Roles.Where(role => role.Id == id).Select(role => (string?)role.Code).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<RoleListItem>> ListAsync(CancellationToken ct = default)
    {
        var roles = await db.Roles
            .AsNoTracking()
            .Include(role => role.Permissions)
            .OrderBy(role => role.Code)
            .ToListAsync(ct);
        var userCounts = await db.Roles
            .AsNoTracking()
            .Select(role => new { role.Id, Count = role.Users.Count })
            .ToDictionaryAsync(item => item.Id, item => item.Count, ct);
        return roles
            .Select(role => new RoleListItem(
                role.Id,
                role.Code,
                role.Name,
                role.Description,
                role.IsSystem,
                role.Permissions
                    .OrderBy(permission => RbacDefaults.PermissionOrder(permission.Code))
                    .ThenBy(permission => permission.Code, StringComparer.Ordinal)
                    .Select(permission => new PermissionInfo(
                        permission.Id,
                        permission.Code,
                        permission.Name,
                        permission.Module))
                    .ToArray(),
                role.CreatedAt,
                userCounts.GetValueOrDefault(role.Id)))
            .ToArray();
    }

    /// <summary>全部权限清单（角色编辑界面勾选用）。</summary>
    public async Task<IReadOnlyList<PermissionInfo>> ListPermissionsAsync(
        CancellationToken ct = default)
    {
        var permissions = await db.Permissions
            .AsNoTracking()
            .ToListAsync(ct);
        return permissions
            .OrderBy(permission => RbacDefaults.PermissionOrder(permission.Code))
            .ThenBy(permission => permission.Code, StringComparer.Ordinal)
            .Select(permission => new PermissionInfo(
                permission.Id,
                permission.Code,
                permission.Name,
                permission.Module))
            .ToArray();
    }

    public async Task<RbacResult<RoleListItem>> CreateAsync(
        CreateRoleRequest request,
        int actorUserId,
        CancellationToken ct = default)
    {
        var actor = await LoadActorAsync(actorUserId, ct);
        if (actor is null)
        {
            return RbacResult<RoleListItem>.Fail("登录已失效，请重新登录");
        }
        var code = request.Code.Trim();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(request.Name))
        {
            return RbacResult<RoleListItem>.Fail("角色标识和角色名称不能为空");
        }
        if (await db.Roles.AnyAsync(role => role.Code == code, ct))
        {
            return RbacResult<RoleListItem>.Fail("角色标识已存在");
        }

        var permissions = await ResolvePermissionsAsync(request.PermissionIds ?? [], ct);
        if (permissions.Count != (request.PermissionIds ?? []).Distinct().Count())
        {
            return RbacResult<RoleListItem>.Fail("所选权限不存在");
        }
        if (!CanGrantPermissions(actor, permissions))
        {
            return RbacResult<RoleListItem>.Fail("不能授予超出自身范围的权限");
        }

        var role = new Role
        {
            Code = code,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            IsSystem = false,
        };
        role.Permissions.AddRange(permissions);
        db.Roles.Add(role);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return RbacResult<RoleListItem>.Fail("角色标识已存在");
        }

        return RbacResult<RoleListItem>.Ok(await BuildListItemAsync(role.Id, ct));
    }

    public async Task<RbacResult<RoleListItem>> UpdateAsync(
        int id,
        UpdateRoleRequest request,
        int actorUserId,
        CancellationToken ct = default)
    {
        var actor = await LoadActorAsync(actorUserId, ct);
        if (actor is null)
        {
            return RbacResult<RoleListItem>.Fail("登录已失效，请重新登录");
        }
        var role = await db.Roles
            .Include(item => item.Permissions)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (role is null)
        {
            return RbacResult<RoleListItem>.Fail("角色不存在");
        }
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return RbacResult<RoleListItem>.Fail("角色名称不能为空");
        }
        if (role.IsSystem)
        {
            return RbacResult<RoleListItem>.Fail("系统内置角色不可修改");
        }
        if (!CanManageRole(actor, role))
        {
            return RbacResult<RoleListItem>.Fail("不能管理权限高于自身的角色");
        }

        var permissions = await ResolvePermissionsAsync(request.PermissionIds ?? [], ct);
        if (permissions.Count != (request.PermissionIds ?? []).Distinct().Count())
        {
            return RbacResult<RoleListItem>.Fail("所选权限不存在");
        }
        if (!CanGrantPermissions(actor, permissions))
        {
            return RbacResult<RoleListItem>.Fail("不能授予超出自身范围的权限");
        }

        role.Name = request.Name.Trim();
        role.Description = request.Description?.Trim();
        role.Permissions.Clear();
        role.Permissions.AddRange(permissions);
        await db.SaveChangesAsync(ct);

        return RbacResult<RoleListItem>.Ok(await BuildListItemAsync(role.Id, ct));
    }

    public async Task<RbacResult> DeleteAsync(
        int id,
        int actorUserId,
        CancellationToken ct = default)
    {
        var actor = await LoadActorAsync(actorUserId, ct);
        if (actor is null)
        {
            return RbacResult.Fail("登录已失效，请重新登录");
        }
        var role = await db.Roles
            .Include(item => item.Users)
            .Include(item => item.Permissions)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (role is null)
        {
            return RbacResult.Fail("角色不存在");
        }
        if (role.IsSystem)
        {
            return RbacResult.Fail("系统内置角色不可删除");
        }
        if (!CanManageRole(actor, role))
        {
            return RbacResult.Fail("不能管理权限高于自身的角色");
        }
        if (role.Users.Count > 0)
        {
            return RbacResult.Fail("该角色已分配给用户，请先移除后再删除");
        }

        db.Roles.Remove(role);
        await db.SaveChangesAsync(ct);
        return RbacResult.Ok();
    }

    private sealed record ActorScope(bool IsSystemAdmin, HashSet<string> Permissions);

    private async Task<ActorScope?> LoadActorAsync(int actorUserId, CancellationToken ct)
    {
        var actor = await db.Users
            .AsNoTracking()
            .AsSplitQuery()
            .Include(user => user.Roles)
            .ThenInclude(role => role.Permissions)
            .FirstOrDefaultAsync(user => user.Id == actorUserId && user.IsActive, ct);
        if (actor is null)
        {
            return null;
        }

        return new ActorScope(
            actor.Roles.Any(role => role.Code == RbacDefaults.SystemAdminRoleCode),
            actor.Roles
                .SelectMany(role => role.Permissions)
                .Select(permission => permission.Code)
                .ToHashSet(StringComparer.Ordinal));
    }

    private static bool CanGrantPermissions(
        ActorScope actor,
        IEnumerable<Permission> permissions) =>
        actor.IsSystemAdmin || permissions.All(permission => actor.Permissions.Contains(permission.Code));

    private static bool CanManageRole(ActorScope actor, Role role) =>
        actor.IsSystemAdmin || role.Permissions.All(permission => actor.Permissions.Contains(permission.Code));

    private async Task<List<Permission>> ResolvePermissionsAsync(
        IReadOnlyCollection<int> permissionIds,
        CancellationToken ct)
    {
        if (permissionIds.Count == 0)
        {
            return [];
        }
        return await db.Permissions
            .Where(permission => permissionIds.Contains(permission.Id))
            .ToListAsync(ct);
    }

    private async Task<RoleListItem> BuildListItemAsync(int roleId, CancellationToken ct)
    {
        var roles = await ListAsync(ct);
        return roles.First(item => item.Id == roleId);
    }
}
