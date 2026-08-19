using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Symtek.Api.Configuration;

/// <summary>
/// 拒绝生产环境沿用开发阶段的认证、种子账号和跨域默认值。
/// </summary>
public static class ProductionConfigurationGuard
{
    public const string DefaultJwtKey =
        "symtek-selection-dev-key-change-me-0123456789abcdef";

    public const string DefaultAdminPassword = "admin123";

    public static void Validate(string environmentName, IConfiguration configuration)
    {
        if (!string.Equals(environmentName, Environments.Production, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var jwtKey = configuration["Jwt:Key"];
        if (string.Equals(jwtKey, DefaultJwtKey, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "生产环境必须通过环境变量 Jwt__Key 覆盖默认开发密钥");
        }

        var adminPassword = configuration["Seed:AdminPassword"];
        if (string.IsNullOrWhiteSpace(adminPassword) ||
            string.Equals(adminPassword, DefaultAdminPassword, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "生产环境必须通过环境变量 Seed__AdminPassword 覆盖默认管理员密码");
        }

        if (string.IsNullOrWhiteSpace(configuration["Cors:AllowedOrigins"]))
        {
            throw new InvalidOperationException(
                "生产环境必须配置 Cors__AllowedOrigins，禁止允许任意来源");
        }
    }
}
