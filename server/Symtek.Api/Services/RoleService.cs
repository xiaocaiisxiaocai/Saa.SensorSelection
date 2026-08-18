using Microsoft.EntityFrameworkCore;

using Symtek.Api.Data;
using Symtek.Api.Models;
using Symtek.Api.Models.Dtos;

namespace Symtek.Api.Services;

/// <summary>
/// 角色与权限管理。系统内置角色（admin）受保护：不可修改权限、不可删除；
/// 删除角色时若已分配给用户则拒绝。
/// </summary>
public class RoleService(AppDbContext db)
{
    public async Task<IReadOnlyList<RoleListItem>> ListAsync(CancellationToken ct = default)
    {
        var roles = await db.Roles
            .AsNoTracking()
            .Include(role => role.Permissions)
            .OrderBy(role => role.Code)
            .ToListAsync(ct);
        return roles
            .Select(role => new RoleListItem(
                role.Id,
                role.Code,
                role.Name,
                role.Description,
                role.IsSystem,
                role.Permissions
                    .OrderBy(permission => permission.Module)
                    .ThenBy(permission => permission.Code)
                    .Select(permission => new PermissionInfo(
                        permission.Id,
                        permission.Code,
                        permission.Name,
                        permission.Module))
                    .ToArray(),
                role.CreatedAt))
            .ToArray();
    }

    /// <summary>全部权限清单（角色编辑界面勾选用）。</summary>
    public async Task<IReadOnlyList<PermissionInfo>> ListPermissionsAsync(
        CancellationToken ct = default)
    {
        var permissions = await db.Permissions
            .AsNoTracking()
            .OrderBy(permission => permission.Module)
            .ThenBy(permission => permission.Code)
            .ToListAsync(ct);
        return permissions
            .Select(permission => new PermissionInfo(
                permission.Id,
                permission.Code,
                permission.Name,
                permission.Module))
            .ToArray();
    }

    public async Task<RbacResult<RoleListItem>> CreateAsync(
        CreateRoleRequest request,
        CancellationToken ct = default)
    {
        var code = request.Code.Trim();
        if (await db.Roles.AnyAsync(role => role.Code == code, ct))
        {
            return RbacResult<RoleListItem>.Fail("角色标识已存在");
        }

        var permissions = await ResolvePermissionsAsync(request.PermissionIds ?? [], ct);
        if (permissions.Count != (request.PermissionIds ?? []).Distinct().Count())
        {
            return RbacResult<RoleListItem>.Fail("所选权限不存在");
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
        CancellationToken ct = default)
    {
        var role = await db.Roles
            .Include(item => item.Permissions)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (role is null)
        {
            return RbacResult<RoleListItem>.Fail("角色不存在");
        }
        if (role.IsSystem)
        {
            return RbacResult<RoleListItem>.Fail("系统内置角色不可修改");
        }

        var permissions = await ResolvePermissionsAsync(request.PermissionIds ?? [], ct);
        if (permissions.Count != (request.PermissionIds ?? []).Distinct().Count())
        {
            return RbacResult<RoleListItem>.Fail("所选权限不存在");
        }

        role.Name = request.Name.Trim();
        role.Description = request.Description?.Trim();
        role.Permissions.Clear();
        role.Permissions.AddRange(permissions);
        await db.SaveChangesAsync(ct);

        return RbacResult<RoleListItem>.Ok(await BuildListItemAsync(role.Id, ct));
    }

    public async Task<RbacResult> DeleteAsync(int id, CancellationToken ct = default)
    {
        var role = await db.Roles
            .Include(item => item.Users)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (role is null)
        {
            return RbacResult.Fail("角色不存在");
        }
        if (role.IsSystem)
        {
            return RbacResult.Fail("系统内置角色不可删除");
        }
        if (role.Users.Count > 0)
        {
            return RbacResult.Fail("该角色已分配给用户，请先移除后再删除");
        }

        db.Roles.Remove(role);
        await db.SaveChangesAsync(ct);
        return RbacResult.Ok();
    }

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
