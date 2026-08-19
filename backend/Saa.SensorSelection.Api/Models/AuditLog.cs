namespace Saa.SensorSelection.Api.Models;

/// <summary>
/// 操作日志（审计日志）：记录登录、业务写入、RBAC 管理等关键操作。
/// 成功与失败都记录（失败带错误信息），便于追溯「谁在什么时间做了什么」。
/// </summary>
public class AuditLog
{
    public int Id { get; set; }

    /// <summary>操作时间（UTC）。</summary>
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>操作人用户名；匿名操作（如登录失败）可能为空。</summary>
    public string? Username { get; set; }

    /// <summary>操作码，如 auth.login / store.upsert / user.create。</summary>
    public string Action { get; set; } = string.Empty;

    /// <summary>操作目标标识（如数据 key、被操作用户名、组织名）。</summary>
    public string? Target { get; set; }

    /// <summary>简短详情（明文摘要，禁止记录密码等敏感字段）。</summary>
    public string? Detail { get; set; }

    /// <summary>客户端 IP（可能为空，如单元测试环境）。</summary>
    public string? Ip { get; set; }

    /// <summary>操作结果：true=成功，false=失败（业务校验失败/被拒绝等）。</summary>
    public bool Result { get; set; } = true;

    /// <summary>失败原因（Result=false 时的错误信息）。</summary>
    public string? Error { get; set; }
}
