namespace Symtek.Api.Models;

/// <summary>
/// 登录用户（默认种子账号见 appsettings Seed 节）。
/// </summary>
public class User
{
    public int Id { get; set; }

    public string Username { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    /// <summary>PBKDF2 哈希，格式：salt:hash（Base64）。</summary>
    public string PasswordHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
