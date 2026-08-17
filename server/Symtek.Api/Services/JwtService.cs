using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

using Symtek.Api.Models;

namespace Symtek.Api.Services;

/// <summary>JWT 签发（HS256），密钥与有效期来自 Jwt 配置节。</summary>
public class JwtService(IOptions<JwtOptions> options)
{
    private readonly JwtOptions _options = options.Value;

    private readonly SymmetricSecurityKey _key =
        new(Encoding.UTF8.GetBytes(options.Value.Key));

    /// <summary>为指定用户签发 token，并返回真实过期时间（供接口响应使用）。</summary>
    public TokenResult CreateToken(User user)
    {
        var credentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;
        var expiresAt = now.AddHours(_options.ExpireHours);
        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Username),
                new Claim(JwtRegisteredClaimNames.Name, user.DisplayName),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            ],
            notBefore: now,
            expires: expiresAt,
            signingCredentials: credentials);
        return new TokenResult(
            new JwtSecurityTokenHandler().WriteToken(token),
            expiresAt);
    }
}

/// <summary>签发结果：Token 与真实过期时间。</summary>
public record TokenResult(string Token, DateTime ExpiresAt);
