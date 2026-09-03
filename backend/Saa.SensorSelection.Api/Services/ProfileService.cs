using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;

namespace Saa.SensorSelection.Api.Services;

public record RoleInfo(int Id, string Code, string Name);

public record OrgUnitInfo(int Id, string Name, string? Level, string Path);

/// <summary>登录用户资料：身份 + 角色 + 权限码 + 所属组织。</summary>
public record UserProfile(
    string Username,
    string DisplayName,
    IReadOnlyList<RoleInfo> Roles,
    IReadOnlyList<string> Permissions,
    OrgUnitInfo? OrgUnit)
{
    /// <summary>JWT org 声明值：id:路径。</summary>
    public string? OrgClaim => OrgUnit == null ? null : $"{OrgUnit.Id}:{OrgUnit.Path}";
}

/// <summary>组装用户资料，登录与 /me 共用同一实现，保证返回结构一致。</summary>
public class ProfileService(AppDbContext db)
{
    public async Task<UserProfile?> BuildAsync(int userId, CancellationToken ct = default)
    {
        var user = await db.Users
            .AsNoTracking()
            .AsSplitQuery()
            .Include(item => item.Roles)
            .ThenInclude(role => role.Permissions)
            .Include(item => item.OrgUnit)
            .FirstOrDefaultAsync(item => item.Id == userId, ct);
        if (user == null)
        {
            return null;
        }

        var roles = user.Roles
            .OrderBy(role => role.Code)
            .Select(role => new RoleInfo(role.Id, role.Code, role.Name))
            .ToArray();
        var permissions = user.Roles
            .SelectMany(role => role.Permissions)
            .Select(permission => permission.Code)
            .Distinct()
            .OrderBy(code => code)
            .ToArray();

        OrgUnitInfo? org = null;
        if (user.OrgUnit != null)
        {
            org = new OrgUnitInfo(
                user.OrgUnit.Id,
                user.OrgUnit.Name,
                user.OrgUnit.Level,
                await BuildPathAsync(user.OrgUnit.Id, ct));
        }

        return new UserProfile(
            user.Username,
            user.DisplayName,
            roles,
            permissions,
            org);
    }

    /// <summary>从节点向上回溯父链，生成「事业部 / 部门 / 课别」路径。</summary>
    public async Task<string> BuildPathAsync(int orgUnitId, CancellationToken ct = default)
    {
        var paths = await BuildPathsAsync([orgUnitId], ct);
        return paths.GetValueOrDefault(orgUnitId, string.Empty);
    }

    /// <summary>一次加载组织树，为同一请求中的多个用户批量生成路径。</summary>
    public async Task<IReadOnlyDictionary<int, string>> BuildPathsAsync(
        IEnumerable<int> orgUnitIds,
        CancellationToken ct = default)
    {
        var all = await db.OrgUnits
            .AsNoTracking()
            .Select(org => new { org.Id, org.Name, org.ParentId })
            .ToArrayAsync(ct);
        var byId = all.ToDictionary(item => item.Id);
        var result = new Dictionary<int, string>();
        foreach (var orgUnitId in orgUnitIds.Distinct())
        {
            var names = new List<string>();
            var visited = new HashSet<int>();
            var current = orgUnitId;
            while (byId.TryGetValue(current, out var node) && visited.Add(current))
            {
                names.Add(node.Name);
                if (node.ParentId is not int parentId)
                {
                    break;
                }
                current = parentId;
            }
            names.Reverse();
            result[orgUnitId] = string.Join(" / ", names);
        }
        return result;
    }
}
