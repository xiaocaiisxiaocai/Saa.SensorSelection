namespace Saa.SensorSelection.Api.Models;

/// <summary>
/// RBAC 默认数据：权限清单与内置角色（种子时幂等写入）。
/// 新增权限/角色时在此补充，重启应用后由 DbSeeder 自动补齐。
/// </summary>
public static class RbacDefaults
{
    public const string SystemAdminRoleCode = "admin";

    public static readonly (string Code, string Name, string Module)[] Permissions =
    [
        ("selection:read", "查看业务数据", "业务"),
        ("selection:write", "编辑业务数据", "业务"),
        ("file:download", "下载文件", "业务"),
        ("data:transfer", "导入导出数据", "业务"),
        ("rbac:view", "查看系统管理", "系统"),
        ("rbac:user:write", "管理用户", "系统"),
        ("rbac:role:write", "管理角色", "系统"),
        ("rbac:org:write", "管理组织架构", "系统"),
        ("audit:view", "查看操作日志", "系统"),
    ];

    /// <summary>
    /// 权限在界面上的展示顺序：按上面的定义顺序（业务 → 系统 → 日志）。
    /// 不按 Module/Name 字符串排序——中文按区域文化排序会把「系统」排到「业务」前面。
    /// 未定义的权限码排在最后。
    /// </summary>
    public static int PermissionOrder(string code)
    {
        var index = Array.FindIndex(Permissions, permission => permission.Code == code);
        return index < 0 ? int.MaxValue : index;
    }

    /// <summary>权限码在界面和日志里的中文名；未定义的权限码原样返回。</summary>
    public static string PermissionName(string code) =>
        Array.Find(Permissions, permission => permission.Code == code).Name ?? code;

    public static readonly (string Code, string Name, string Description, bool IsSystem, string[] Permissions)[] Roles =
    [
        (
            SystemAdminRoleCode,
            "系统管理员",
            "拥有全部权限（内置角色，不可修改/删除）",
            IsSystem: true,
            Permissions: Permissions.Select(item => item.Code).ToArray()),
        (
            "editor",
            "业务维护员",
            "可查看和编辑业务数据",
            IsSystem: false,
            Permissions: ["selection:read", "selection:write"]),
        (
            "viewer",
            "只读用户",
            "仅可查看业务数据",
            IsSystem: false,
            Permissions: ["selection:read"]),
    ];
}
