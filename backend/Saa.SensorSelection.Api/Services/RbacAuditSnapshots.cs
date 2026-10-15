using Saa.SensorSelection.Api.Models.Dtos;

namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 用户 / 角色 / 组织写进操作日志的字段快照（字段名直接用界面上的中文），
/// 由 <see cref="AuditChanges.DiffRecord"/> 比较前后两份得出改了什么。不含密码等敏感字段。
/// </summary>
public static class RbacAuditSnapshots
{
    public static IReadOnlyList<KeyValuePair<string, string?>> User(UserListItem user) =>
    [
        new("用户名", user.Username),
        new("显示名", user.DisplayName),
        new("状态", user.IsActive ? "启用" : "停用"),
        new("角色", string.Join("、", user.Roles.Select(role => role.Name))),
        new("所属组织", user.OrgUnit?.Path),
    ];

    public static IReadOnlyList<KeyValuePair<string, string?>> Role(RoleListItem role) =>
    [
        new("标识", role.Code),
        new("名称", role.Name),
        new("描述", role.Description),
        new("权限", string.Join(
            "、",
            role.Permissions
                .OrderBy(permission => Models.RbacDefaults.PermissionOrder(permission.Code))
                .Select(permission => permission.Name))),
    ];

    /// <param name="all">全部组织，用来把上级 id 写成名称。</param>
    public static IReadOnlyList<KeyValuePair<string, string?>> Org(
        OrgUnitListItem org,
        IReadOnlyList<OrgUnitListItem> all) =>
    [
        new("名称", org.Name),
        new("层级", org.Level),
        new("上级", org.ParentId is int parentId
            ? all.FirstOrDefault(item => item.Id == parentId)?.Name ?? $"#{parentId}"
            : null),
        new("排序", org.SortOrder.ToString(System.Globalization.CultureInfo.InvariantCulture)),
    ];
}
