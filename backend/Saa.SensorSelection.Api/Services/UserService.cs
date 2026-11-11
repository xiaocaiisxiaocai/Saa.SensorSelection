using System.Data;

using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;
using Saa.SensorSelection.Api.Models.Dtos;

namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 用户管理：创建/更新/删除/重置密码，以及角色、组织引用的合法性校验。
/// 保护规则：用户名唯一；每名用户最多绑定一个角色；不能删除自己；至少保留一名系统管理员。
/// 当前登录用户改自己的密码走 ChangeOwnPasswordAsync，需验证当前密码。
/// </summary>
public class UserService(AppDbContext db, ProfileService profiles)
{
    /// <summary>操作日志用：删除前先取用户名，删掉后就查不到了。</summary>
    public Task<string?> FindUsernameAsync(int id, CancellationToken ct = default) =>
        db.Users.Where(user => user.Id == id).Select(user => (string?)user.Username).FirstOrDefaultAsync(ct);

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
        var pathCache = await profiles.BuildPathsAsync(orgIds, ct);

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
        int actorUserId,
        CancellationToken ct = default)
    {
        var actor = await LoadActorAsync(actorUserId, ct);
        if (actor is null)
        {
            return RbacResult<UserListItem>.Fail("登录已失效，请重新登录");
        }

        var username = request.Username.Trim();
        if (string.IsNullOrWhiteSpace(username) ||
            string.IsNullOrWhiteSpace(request.DisplayName))
        {
            return RbacResult<UserListItem>.Fail("用户名和显示名不能为空");
        }
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
        if (roleIds.Length > 1)
        {
            return RbacResult<UserListItem>.Fail("每个用户最多只能绑定一个角色");
        }
        var roles = await ResolveRolesAsync(roleIds, ct);
        if (roles.Count != roleIds.Length)
        {
            return RbacResult<UserListItem>.Fail("所选角色不存在");
        }
        if (!CanAssignRoles(actor, roles))
        {
            return RbacResult<UserListItem>.Fail("不能授予超出自身权限范围的角色");
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
        int actorUserId,
        CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            ct);
        var actor = await LoadActorAsync(actorUserId, ct);
        if (actor is null)
        {
            return RbacResult<UserListItem>.Fail("登录已失效，请重新登录");
        }

        var user = await db.Users
            .Include(item => item.Roles)
            .ThenInclude(role => role.Permissions)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (user is null)
        {
            return RbacResult<UserListItem>.Fail("用户不存在");
        }
        if (!CanManageTarget(actor, user))
        {
            return RbacResult<UserListItem>.Fail("不能管理权限高于自身或系统管理员账号");
        }

        if (string.IsNullOrWhiteSpace(request.DisplayName))
        {
            return RbacResult<UserListItem>.Fail("显示名不能为空");
        }

        if (request.OrgUnitId is int orgId &&
            !await db.OrgUnits.AnyAsync(org => org.Id == orgId, ct))
        {
            return RbacResult<UserListItem>.Fail("所选组织不存在");
        }

        var roleIds = request.RoleIds ?? [];
        if (roleIds.Length > 1)
        {
            return RbacResult<UserListItem>.Fail("每个用户最多只能绑定一个角色");
        }
        var roles = await ResolveRolesAsync(roleIds, ct);
        if (roles.Count != roleIds.Length)
        {
            return RbacResult<UserListItem>.Fail("所选角色不存在");
        }
        if (!CanAssignRoles(actor, roles))
        {
            return RbacResult<UserListItem>.Fail("不能授予超出自身权限范围的角色");
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
        await transaction.CommitAsync(ct);

        return RbacResult<UserListItem>.Ok(await BuildListItemAsync(user.Id, ct));
    }

    public async Task<RbacResult> ResetPasswordAsync(
        int id,
        string password,
        int actorUserId,
        CancellationToken ct = default)
    {
        var actor = await LoadActorAsync(actorUserId, ct);
        if (actor is null)
        {
            return RbacResult.Fail("登录已失效，请重新登录");
        }
        var user = await db.Users
            .Include(item => item.Roles)
            .ThenInclude(role => role.Permissions)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (user is null)
        {
            return RbacResult.Fail("用户不存在");
        }
        if (!CanManageTarget(actor, user))
        {
            return RbacResult.Fail("不能管理权限高于自身或系统管理员账号");
        }
        user.PasswordHash = PasswordService.Hash(password);
        await db.SaveChangesAsync(ct);
        return RbacResult.Ok();
    }

    public async Task<RbacResult> ChangeOwnPasswordAsync(
        int userId,
        string currentPassword,
        string newPassword,
        CancellationToken ct = default)
    {
        var user = await db.Users.FirstOrDefaultAsync(
            item => item.Id == userId,
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
        int actorUserId,
        CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            ct);
        var actor = await LoadActorAsync(actorUserId, ct);
        if (actor is null)
        {
            return RbacResult.Fail("登录已失效，请重新登录");
        }
        var user = await db.Users
            .Include(item => item.Roles)
            .ThenInclude(role => role.Permissions)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (user is null)
        {
            return RbacResult.Fail("用户不存在");
        }
        if (user.Id == actorUserId)
        {
            return RbacResult.Fail("不能删除当前登录账号");
        }
        if (!CanManageTarget(actor, user))
        {
            return RbacResult.Fail("不能管理权限高于自身或系统管理员账号");
        }
        if (user.Roles.Any(role => role.Code == RbacDefaults.SystemAdminRoleCode) &&
            await CountOtherAdminsAsync(id, ct) == 0)
        {
            return RbacResult.Fail("至少保留一名系统管理员");
        }

        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
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

    private static bool CanManageTarget(ActorScope actor, User target)
    {
        if (actor.IsSystemAdmin)
        {
            return true;
        }
        if (target.Roles.Any(role => role.Code == RbacDefaults.SystemAdminRoleCode))
        {
            return false;
        }
        return target.Roles
            .SelectMany(role => role.Permissions)
            .Select(permission => permission.Code)
            .All(actor.Permissions.Contains);
    }

    private static bool CanAssignRoles(ActorScope actor, IEnumerable<Role> roles)
    {
        if (actor.IsSystemAdmin)
        {
            return true;
        }

        var roleList = roles.ToList();
        return roleList.All(role => role.Code != RbacDefaults.SystemAdminRoleCode) &&
            roleList
                .SelectMany(role => role.Permissions)
                .Select(permission => permission.Code)
                .All(actor.Permissions.Contains);
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
            .Include(role => role.Permissions)
            .Where(role => roleIds.Contains(role.Id))
            .ToListAsync(ct);
    }

    private Task<int> CountOtherAdminsAsync(int userId, CancellationToken ct)
    {
        return db.Users.CountAsync(
            user => user.Id != userId &&
                    user.IsActive &&
                    user.Roles.Any(role => role.Code == RbacDefaults.SystemAdminRoleCode),
            ct);
    }

    private async Task<UserListItem> BuildListItemAsync(int userId, CancellationToken ct)
    {
        var users = await ListAsync(ct);
        return users.First(item => item.Id == userId);
    }
}
