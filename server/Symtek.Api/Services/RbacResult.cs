namespace Symtek.Api.Services;

/// <summary>RBAC 写操作结果：成功或业务错误信息（由控制器映射为 HTTP 状态码）。</summary>
public sealed record RbacResult(bool Success, string? Error = null)
{
    public static RbacResult Ok() => new(true);

    public static RbacResult Fail(string error) => new(false, error);
}

/// <summary>带载荷的 RBAC 操作结果。</summary>
public sealed record RbacResult<T>(bool Success, T? Value = default, string? Error = null)
{
    public static RbacResult<T> Ok(T value) => new(true, value);

    public static RbacResult<T> Fail(string error) => new(false, default, error);
}
