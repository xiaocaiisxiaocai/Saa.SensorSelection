using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;
using Saa.SensorSelection.Api.Models.Dtos;

namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 用户管理：创建/更新/删除/重置密码，以及角色、组织引用的合法性校验。
/// 保护规则：用户名唯一；不能删除自己；至少保留一名系统管理员。
/// 当前登录用户改自己的密码走 ChangeOwnPasswordAsync，需验证当前密码。
/// </summary>
public class UserService(AppDbContext db, ProfileService profiles)
{
    public async Task<IReadOnlyList<UserListItem>> ListAsync(CancellationToken ct = default)
    {
        var users = await db.Users
            .AsNoTracking()
            .Include(user => user.Roles)
            .Include(user => user.OrgUnit)
            .OrderBy(user => user.Id)
            .ToListAsync(ct);

        var orgIds = users
            .Where(user => user.OrgUnitId is not null)
            .Select(user => user.OrgUnitId!.Value)
            .Distinct()
            .ToArray();
        var pathCache = new Dictionary<int, string>();
        foreach (var orgId in orgIds)
        {
            pathCache[orgId] = await profiles.BuildPathAsync(orgId, ct);
        }

        return users
            .Select(user => new UserListItem(
                user.Id,
                user.Username,
                user.DisplayName,
                user.IsActive,
                user.CreatedAt,
                user.Roles
                    .OrderBy(role => role.Code)
                    .Select(role => new RoleInfo(role.Id, role.Code, role.Name))
                    .ToArray(),
                user.OrgUnit is null
                    ? null
                    : new OrgUnitInfo(
                        user.OrgUnit.Id,
                        user.OrgUnit.Name,
                        user.OrgUnit.Level,
                        pathCache.GetValueOrDefault(user.OrgUnit.Id, user.OrgUnit.Name))))
            .ToArray();
    }

    public async Task<RbacResult<UserListItem>> CreateAsync(
        CreateUserRequest request,
        CancellationToken ct = default)
    {
        var username = request.Username.Trim();
        if (await db.Users.AnyAsync(user => user.Username == username, ct))
        {
            return RbacResult<UserListItem>.Fail("用户名已存在");
        }

        if (request.OrgUnitId is int orgId &&
            !await db.OrgUnits.AnyAsync(org => org.Id == orgId, ct))
        {
            return RbacResult<UserListItem>.Fail("所选组织不存在");
        }

        var roleIds = request.RoleIds ?? [];
        var roles = await ResolveRolesAsync(roleIds, ct);
        if (roles.Count != roleIds.Distinct().Count())
        {
            return RbacResult<UserListItem>.Fail("所选角色不存在");
        }

        var user = new User
        {
            Username = username,
            DisplayName = request.DisplayName.Trim(),
            PasswordHash = PasswordService.Hash(request.Password),
            IsActive = request.IsActive,
            OrgUnitId = request.OrgUnitId,
        };
        user.Roles.AddRange(roles);

        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // 唯一索引兜底（并发创建同用户名）
            return RbacResult<UserListItem>.Fail("用户名已存在");
        }

        return RbacResult<UserListItem>.Ok(await BuildListItemAsync(user.Id, ct));
    }

    public async Task<RbacResult<UserListItem>> UpdateAsync(
        int id,
        UpdateUserRequest request,
        CancellationToken ct = default)
    {
        var user = await db.Users
            .Include(item => item.Roles)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (user is null)
        {
            return RbacResult<UserListItem>.Fail("用户不存在");
        }

        if (request.OrgUnitId is int orgId &&
            !await db.OrgUnits.AnyAsync(org => org.Id == orgId, ct))
        {
            return RbacResult<UserListItem>.Fail("所选组织不存在");
        }

        var roleIds = request.RoleIds ?? [];
        var roles = await ResolveRolesAsync(roleIds, ct);
        if (roles.Count != roleIds.Distinct().Count())
        {
            return RbacResult<UserListItem>.Fail("所选角色不存在");
        }

        // 系统管理员兜底：不能把最后一个管理员移除/停用
        var hadAdmin = user.Roles.Any(role => role.Code == RbacDefaults.SystemAdminRoleCode);
        var nowHasAdmin = roles.Any(role => role.Code == RbacDefaults.SystemAdminRoleCode);
        if ((hadAdmin && !nowHasAdmin || hadAdmin && !request.IsActive) &&
            await CountOtherAdminsAsync(id, ct) == 0)
        {
            return RbacResult<UserListItem>.Fail("至少保留一名系统管理员");
        }

        user.DisplayName = request.DisplayName.Trim();
        user.IsActive = request.IsActive;
        user.OrgUnitId = request.OrgUnitId;
        user.Roles.Clear();
        user.Roles.AddRange(roles);
        await db.SaveChangesAsync(ct);

        return RbacResult<UserListItem>.Ok(await BuildListItemAsync(user.Id, ct));
    }

    public async Task<RbacResult> ResetPasswordAsync(
        int id,
        string password,
        CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(item => item.Id == id, ct);
        if (user is null)
        {
            return RbacResult.Fail("用户不存在");
        }
        user.PasswordHash = PasswordService.Hash(password);
        await db.SaveChangesAsync(ct);
        return RbacResult.Ok();
    }

    public async Task<RbacResult> ChangeOwnPasswordAsync(
        string username,
        string currentPassword,
        string newPassword,
        CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(
            item => item.Username == username,
            ct);
        if (user is null)
        {
            return RbacResult.Fail("登录已失效，请重新登录");
        }
        if (string.IsNullOrEmpty(currentPassword) ||
            !PasswordService.Verify(currentPassword, user.PasswordHash))
        {
            return RbacResult.Fail("当前密码不正确");
        }
        if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 4)
        {
            return RbacResult.Fail("新密码至少 4 位");
        }

        user.PasswordHash = PasswordService.Hash(newPassword);
        await db.SaveChangesAsync(ct);
        return RbacResult.Ok();
    }

    public async Task<RbacResult> DeleteAsync(
        int id,
        string currentUsername,
        CancellationToken ct = default)
    {
        var user = await db.Users
            .Include(item => item.Roles)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (user is null)
        {
            return RbacResult.Fail("用户不存在");
        }
        if (string.Equals(user.Username, currentUsername, StringComparison.Ordinal))
        {
            return RbacResult.Fail("不能删除当前登录账号");
        }
        if (user.Roles.Any(role => role.Code == RbacDefaults.SystemAdminRoleCode) &&
            await CountOtherAdminsAsync(id, ct) == 0)
        {
            return RbacResult.Fail("至少保留一名系统管理员");
        }

        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
        return RbacResult.Ok();
    }

    private async Task<List<Role>> ResolveRolesAsync(
        IReadOnlyCollection<int> roleIds,
        CancellationToken ct)
    {
        if (roleIds.Count == 0)
        {
            return [];
        }
        return await db.Roles
            .Where(role => roleIds.Contains(role.Id))
            .ToListAsync(ct);
    }

    private Task<int> CountOtherAdminsAsync(int userId, CancellationToken ct)
    {
        return db.Users.CountAsync(
            user => user.Id != userId &&
                    user.Roles.Any(role => role.Code == RbacDefaults.SystemAdminRoleCode),
            ct);
    }

    private async Task<UserListItem> BuildListItemAsync(int userId, CancellationToken ct)
    {
        var users = await ListAsync(ct);
        return users.First(item => item.Id == userId);
    }
}
