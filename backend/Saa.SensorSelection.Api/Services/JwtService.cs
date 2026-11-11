using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
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
    public const string UsernameClaim = "username";

    public const string SessionFingerprintClaim = "authv";

    private readonly JwtOptions _options = options.Value;

    private readonly byte[] _keyBytes = Encoding.UTF8.GetBytes(options.Value.Key);

    private readonly SymmetricSecurityKey _key = new(
        Encoding.UTF8.GetBytes(options.Value.Key));

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
            // sub 使用不可复用的数据库主键；用户名删除后重建不会继承旧身份。
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            new(JwtRegisteredClaimNames.Name, user.DisplayName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(UsernameClaim, user.Username),
            new(SessionFingerprintClaim, CreateSessionFingerprint(user, roleCodes, permissionCodes)),
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

    /// <summary>
    /// 会话指纹绑定账号主键、密码以及当前角色/权限。JWT 只携带 HMAC 结果，
    /// 不暴露密码哈希；改密、降权、删除重建同名账号都会让旧 token 失效。
    /// </summary>
    public string CreateSessionFingerprint(
        User user,
        IEnumerable<string> roleCodes,
        IEnumerable<string> permissionCodes)
    {
        var roles = string.Join(",", roleCodes.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal));
        var permissions = string.Join(",", permissionCodes.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal));
        var canonical = string.Join(
            "\n",
            user.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
            user.PasswordHash,
            roles,
            permissions);
        var digest = HMACSHA256.HashData(_keyBytes, Encoding.UTF8.GetBytes(canonical));
        return Convert.ToHexString(digest);
    }

    public bool IsSessionFingerprintValid(
        string? actual,
        User user,
        IEnumerable<string> roleCodes,
        IEnumerable<string> permissionCodes)
    {
        if (string.IsNullOrWhiteSpace(actual))
        {
            return false;
        }

        var expected = CreateSessionFingerprint(user, roleCodes, permissionCodes);
        return CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(actual),
            Encoding.ASCII.GetBytes(expected));
    }
}

/// <summary>签发结果：Token 与真实过期时间。</summary>
public record TokenResult(string Token, DateTime ExpiresAt);
