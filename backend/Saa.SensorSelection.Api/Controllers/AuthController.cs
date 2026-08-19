using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    AppDbContext db,
    JwtService jwt,
    ProfileService profiles,
    LoginRateLimiter rateLimiter,
    AuditLogService audit,
    ILogger<AuthController> logger) : ControllerBase
{
    // 注意：record 主构造函数参数上的验证特性必须直接标在参数上（不能加 property: 目标），
    // 否则 ASP.NET Core 会在模型验证时抛出 InvalidOperationException。
    public record LoginRequest(
        [Required(ErrorMessage = "请输入用户名")] string Username,
        [Required(ErrorMessage = "请输入密码")] string Password);

    public record LoginResponse(
        string Token,
        string Username,
        string DisplayName,
        DateTime ExpiresAt,
        IReadOnlyList<RoleInfo> Roles,
        IReadOnlyList<string> Permissions,
        OrgUnitInfo? OrgUnit);

    /// <summary>账号密码登录，签发 JWT（含角色/权限/组织声明）。</summary>
    [AllowAnonymous]
    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var rateKey = $"{username}|{ip}";
        var now = DateTimeOffset.UtcNow;

        if (rateLimiter.IsBlocked(rateKey, now))
        {
            logger.LogWarning("登录限流：用户 {Username}（{Ip}）尝试过于频繁", username, ip);
            await audit.WriteAsync(
                "auth.login",
                target: username,
                success: false,
                error: "失败次数过多，已限流",
                username: username,
                ip: ip);
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                message = $"失败次数过多，请 {rateLimiter.WindowMinutes} 分钟后再试",
            });
        }

        var user = await db.Users.FirstOrDefaultAsync(item => item.Username == username);
        if (user == null)
        {
            // 用户不存在也执行一次哈希校验，避免通过响应时间枚举用户名
            PasswordService.Verify(request.Password ?? string.Empty, PasswordService.DummyHash);
            rateLimiter.RecordFailure(rateKey, now);
            logger.LogWarning("登录失败：用户名 {Username}（{Ip}）", username, ip);
            await audit.WriteAsync(
                "auth.login",
                target: username,
                success: false,
                error: "用户名或密码错误",
                username: username,
                ip: ip);
            return Unauthorized(new { message = "用户名或密码错误" });
        }

        if (string.IsNullOrEmpty(request.Password) ||
            !PasswordService.Verify(request.Password, user.PasswordHash))
        {
            rateLimiter.RecordFailure(rateKey, now);
            logger.LogWarning("登录失败：用户名 {Username}（{Ip}）", username, ip);
            await audit.WriteAsync(
                "auth.login",
                target: username,
                success: false,
                error: "用户名或密码错误",
                username: username,
                ip: ip);
            return Unauthorized(new { message = "用户名或密码错误" });
        }

        if (!user.IsActive)
        {
            rateLimiter.RecordFailure(rateKey, now);
            logger.LogWarning("登录被拒绝：账号 {Username}（{Ip}）已停用", username, ip);
            await audit.WriteAsync(
                "auth.login",
                target: username,
                success: false,
                error: "账号已停用",
                username: username,
                ip: ip);
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "账号已停用，请联系管理员" });
        }

        rateLimiter.Reset(rateKey);
        var profile = await profiles.BuildAsync(user.Id);
        if (profile == null)
        {
            await audit.WriteAsync(
                "auth.login",
                target: username,
                success: false,
                error: "用户名或密码错误",
                username: username,
                ip: ip);
            return Unauthorized(new { message = "用户名或密码错误" });
        }

        var token = jwt.CreateToken(user, profile.Roles.Select(role => role.Code).ToArray(),
            profile.Permissions, profile.OrgClaim);
        logger.LogInformation("用户 {Username} 登录成功（角色：{Roles}）", username, string.Join(",", profile.Roles.Select(role => role.Code)));
        await audit.WriteAsync(
            "auth.login",
            target: username,
            username: username,
            ip: ip);
        return Ok(new LoginResponse(
            token.Token,
            user.Username,
            user.DisplayName,
            token.ExpiresAt,
            profile.Roles,
            profile.Permissions,
            profile.OrgUnit));
    }

    /// <summary>返回当前登录用户的资料（角色/权限/组织），前端初始化权限用。</summary>
    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType(typeof(UserProfile), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Me()
    {
        // JWT 的 sub 声明经默认映射为 ClaimTypes.NameIdentifier（Identity.Name 是 name 声明=显示名）
        var username = User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier);
        var user = await db.Users.FirstOrDefaultAsync(item => item.Username == username);
        if (user == null || !user.IsActive)
        {
            return Unauthorized(new { message = "登录已失效，请重新登录" });
        }

        var profile = await profiles.BuildAsync(user.Id);
        return profile == null
            ? Unauthorized(new { message = "登录已失效，请重新登录" })
            : Ok(profile);
    }
}
