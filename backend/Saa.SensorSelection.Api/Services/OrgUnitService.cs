using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;
using Saa.SensorSelection.Api.Models.Dtos;

namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 组织架构管理：自引用树（支持跳级；层级事业部 > 部门 > 课别，禁止倒挂）。
/// 保护规则：父节点不能是自身或其后代（防环）；有子级或已挂用户的节点不可删除。
/// </summary>
public class OrgUnitService(AppDbContext db)
{
    public async Task<IReadOnlyList<OrgUnitListItem>> ListAsync(CancellationToken ct = default)
    {
        var orgUnits = await db.OrgUnits
            .AsNoTracking()
            .OrderBy(org => org.SortOrder)
            .ThenBy(org => org.Id)
            .ToListAsync(ct);
        var childCounts = orgUnits
            .Where(org => org.ParentId is not null)
            .GroupBy(org => org.ParentId!.Value)
            .ToDictionary(group => group.Key, group => group.Count());
        var userCounts = await db.Users
            .Where(user => user.OrgUnitId != null)
            .GroupBy(user => user.OrgUnitId!.Value)
            .Select(group => new { OrgUnitId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.OrgUnitId, item => item.Count, ct);

        return orgUnits
            .Select(org => new OrgUnitListItem(
                org.Id,
                org.Name,
                org.ParentId,
                org.Level,
                org.SortOrder,
                childCounts.GetValueOrDefault(org.Id),
                userCounts.GetValueOrDefault(org.Id)))
            .ToArray();
    }

    public async Task<RbacResult<OrgUnitListItem>> CreateAsync(
        CreateOrgUnitRequest request,
        CancellationToken ct = default)
    {
        if (request.ParentId is int parentId)
        {
            var parent = await db.OrgUnits.FirstOrDefaultAsync(org => org.Id == parentId, ct);
            if (parent is null)
            {
                return RbacResult<OrgUnitListItem>.Fail("父级组织不存在");
            }
            if (!OrgLevelRules.CanPlace(parent.Level, request.Level))
            {
                return RbacResult<OrgUnitListItem>.Fail(OrgLevelRules.InvertedMessage);
            }
        }

        var org = new OrgUnit
        {
            Name = request.Name.Trim(),
            ParentId = request.ParentId,
            Level = string.IsNullOrWhiteSpace(request.Level) ? null : request.Level.Trim(),
            SortOrder = request.SortOrder,
        };
        db.OrgUnits.Add(org);
        await db.SaveChangesAsync(ct);
        return RbacResult<OrgUnitListItem>.Ok(await BuildListItemAsync(org.Id, ct));
    }

    public async Task<RbacResult<OrgUnitListItem>> UpdateAsync(
        int id,
        UpdateOrgUnitRequest request,
        CancellationToken ct = default)
    {
        var org = await db.OrgUnits.FirstOrDefaultAsync(item => item.Id == id, ct);
        if (org is null)
        {
            return RbacResult<OrgUnitListItem>.Fail("组织不存在");
        }

        if (request.ParentId is int parentId)
        {
            if (parentId == id)
            {
                return RbacResult<OrgUnitListItem>.Fail("父级不能是自身");
            }
            var parent = await db.OrgUnits.FirstOrDefaultAsync(item => item.Id == parentId, ct);
            if (parent is null)
            {
                return RbacResult<OrgUnitListItem>.Fail("父级组织不存在");
            }
            if (await IsDescendantAsync(parentId, id, ct))
            {
                return RbacResult<OrgUnitListItem>.Fail("父级不能是自己的子级（会造成循环）");
            }
            if (!OrgLevelRules.CanPlace(parent.Level, request.Level))
            {
                return RbacResult<OrgUnitListItem>.Fail(OrgLevelRules.InvertedMessage);
            }
        }

        var level = string.IsNullOrWhiteSpace(request.Level) ? null : request.Level.Trim();
        foreach (var descendantLevel in await DescendantLevelsAsync(id, ct))
        {
            if (!OrgLevelRules.CanPlace(level, descendantLevel))
            {
                return RbacResult<OrgUnitListItem>.Fail(OrgLevelRules.InvertedMessage);
            }
        }

        org.Name = request.Name.Trim();
        org.ParentId = request.ParentId;
        org.Level = level;
        org.SortOrder = request.SortOrder;
        await db.SaveChangesAsync(ct);
        return RbacResult<OrgUnitListItem>.Ok(await BuildListItemAsync(org.Id, ct));
    }

    public async Task<RbacResult> DeleteAsync(int id, CancellationToken ct = default)
    {
        var org = await db.OrgUnits.FirstOrDefaultAsync(item => item.Id == id, ct);
        if (org is null)
        {
            return RbacResult.Fail("组织不存在");
        }
        if (await db.OrgUnits.AnyAsync(item => item.ParentId == id, ct))
        {
            return RbacResult.Fail("该组织下仍有子级，请先删除子级组织");
        }
        if (await db.Users.AnyAsync(user => user.OrgUnitId == id, ct))
        {
            return RbacResult.Fail("该组织下仍有用户，请先移除用户");
        }

        db.OrgUnits.Remove(org);
        await db.SaveChangesAsync(ct);
        return RbacResult.Ok();
    }

    /// <summary>判断 candidate 是否为 target 的后代（沿父链向上检查）。</summary>
    private async Task<bool> IsDescendantAsync(
        int candidate,
        int target,
        CancellationToken ct)
    {
        var all = await db.OrgUnits
            .AsNoTracking()
            .Select(org => new { org.Id, org.ParentId })
            .ToArrayAsync(ct);
        var byId = all.ToDictionary(item => item.Id);
        var current = candidate;
        while (byId.TryGetValue(current, out var node))
        {
            if (node.ParentId is int parentId)
            {
                if (parentId == target)
                {
                    return true;
                }
                current = parentId;
            }
            else
            {
                return false;
            }
        }
        return false;
    }

    private async Task<List<string>> DescendantLevelsAsync(int id, CancellationToken ct)
    {
        var all = await db.OrgUnits
            .AsNoTracking()
            .Select(org => new { org.Id, org.ParentId, org.Level })
            .ToArrayAsync(ct);
        var children = all.ToLookup(org => org.ParentId);
        var levels = new List<string>();
        var stack = new Stack<int>([id]);
        var skipSelf = true;
        while (stack.Count > 0)
        {
            var current = stack.Pop();
            if (!skipSelf)
            {
                var node = all.First(item => item.Id == current);
                if (!string.IsNullOrWhiteSpace(node.Level))
                {
                    levels.Add(node.Level);
                }
            }
            skipSelf = false;
            foreach (var child in children[current])
            {
                stack.Push(child.Id);
            }
        }
        return levels;
    }

    private async Task<OrgUnitListItem> BuildListItemAsync(int orgId, CancellationToken ct)
    {
        var items = await ListAsync(ct);
        return items.First(item => item.Id == orgId);
    }
}
