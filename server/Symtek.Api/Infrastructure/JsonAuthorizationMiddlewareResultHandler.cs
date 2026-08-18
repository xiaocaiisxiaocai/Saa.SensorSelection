using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy; // PolicyAuthorizationResult

namespace Symtek.Api.Infrastructure;

/// <summary>
/// 把授权策略失败（已登录但无权限，403）改写为 JSON 响应体，
/// 前端可透出「无权限执行此操作」而非收到空 403。
/// 未认证（challenge，401）仍走默认处理器（JwtBearer 返回 401）。
/// </summary>
public sealed class JsonAuthorizationMiddlewareResultHandler
    : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _defaultHandler = new();

    public async Task HandleAsync(
        RequestDelegate next,
        HttpContext context,
        AuthorizationPolicy policy,
        PolicyAuthorizationResult authorizeResult)
    {
        if (authorizeResult.Forbidden && !authorizeResult.Challenged)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsJsonAsync(new { message = "无权限执行此操作" });
            return;
        }

        await _defaultHandler.HandleAsync(next, context, policy, authorizeResult);
    }
}
