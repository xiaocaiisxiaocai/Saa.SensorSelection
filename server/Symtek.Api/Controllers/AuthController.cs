using System.ComponentModel.DataAnnotations;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using Symtek.Api.Data;
using Symtek.Api.Services;

namespace Symtek.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    AppDbContext db,
    JwtService jwt,
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
        DateTime ExpiresAt);

    /// <summary>账号密码登录，签发 JWT。</summary>
    [AllowAnonymous]
    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        var user = await db.Users.FirstOrDefaultAsync(item => item.Username == username);
        if (user == null)
        {
            // 用户不存在也执行一次哈希校验，避免通过响应时间枚举用户名
            PasswordService.Verify(request.Password ?? string.Empty, PasswordService.DummyHash);
            return Unauthorized(new { message = "用户名或密码错误" });
        }

        if (string.IsNullOrEmpty(request.Password) ||
            !PasswordService.Verify(request.Password, user.PasswordHash))
        {
            logger.LogWarning("登录失败：用户名 {Username}", username);
            return Unauthorized(new { message = "用户名或密码错误" });
        }

        var token = jwt.CreateToken(user);
        logger.LogInformation("用户 {Username} 登录成功", username);
        return Ok(new LoginResponse(
            token.Token,
            user.Username,
            user.DisplayName,
            token.ExpiresAt));
    }
}
