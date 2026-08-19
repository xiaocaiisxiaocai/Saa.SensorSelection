using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

using Saa.SensorSelection.Api.Models;

namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// JWT 签发（HS256），密钥与有效期来自 Jwt 配置节。
/// 除身份声明外，携带 role（每角色一条）、perm（每权限码一条）、org（组织）声明，
/// 授权策略通过 RequireClaim("perm", ...) 校验。
/// </summary>
public class JwtService(IOptions<JwtOptions> options)
{
    private readonly JwtOptions _options = options.Value;

    private readonly SymmetricSecurityKey _key =
        new(Encoding.UTF8.GetBytes(options.Value.Key));

    /// <summary>为指定用户签发 token，并返回真实过期时间（供接口响应使用）。</summary>
    public TokenResult CreateToken(
        User user,
        IReadOnlyList<string> roleCodes,
        IReadOnlyList<string> permissionCodes,
        string? orgClaim = null)
    {
        var credentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;
        var expiresAt = now.AddHours(_options.ExpireHours);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Username),
            new(JwtRegisteredClaimNames.Name, user.DisplayName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
        };
        claims.AddRange(roleCodes.Select(code => new Claim("role", code)));
        claims.AddRange(permissionCodes.Select(code => new Claim("perm", code)));
        if (!string.IsNullOrEmpty(orgClaim))
        {
            claims.Add(new Claim("org", orgClaim));
        }

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
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
