namespace Symtek.Api.Models;

/// <summary>角色。IsSystem=true 的内置角色（admin）受保护：不可删除、权限不可修改。</summary>
public class Role
{
    public int Id { get; set; }

    /// <summary>角色标识（如 admin/editor/viewer），唯一。</summary>
    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    /// <summary>内置系统角色（种子数据，受保护）。</summary>
    public bool IsSystem { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<Permission> Permissions { get; set; } = [];

    public List<User> Users { get; set; } = [];
}

/// <summary>权限码（如 selection:read / rbac:user:write），进入 JWT claims 并用于授权策略。</summary>
public class Permission
{
    public int Id { get; set; }

    /// <summary>权限标识，唯一。</summary>
    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    /// <summary>分组（业务/系统），仅用于界面展示。</summary>
    public string? Module { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<Role> Roles { get; set; } = [];
}
