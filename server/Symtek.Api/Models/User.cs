namespace Symtek.Api.Models;

/// <summary>
/// 登录用户（默认种子账号见 appsettings Seed 节）。
/// 通过 UserRole 多对多关联角色；角色携带权限码决定可访问的功能。
/// </summary>
public class User
{
    public int Id { get; set; }

    public string Username { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    /// <summary>PBKDF2 哈希，格式：salt:hash（Base64）。</summary>
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>所属组织节点（可空，表示未挂组织）。</summary>
    public int? OrgUnitId { get; set; }

    public OrgUnit? OrgUnit { get; set; }

    /// <summary>停用后无法登录。</summary>
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<Role> Roles { get; set; } = [];
}
