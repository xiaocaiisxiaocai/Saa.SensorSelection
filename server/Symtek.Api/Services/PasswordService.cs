using System.Security.Cryptography;

namespace Symtek.Api.Services;

/// <summary>
/// PBKDF2-SHA256 密码哈希，无第三方依赖。
/// 存储格式：salt:hash（均 Base64）。
/// </summary>
public static class PasswordService
{
    private const int SaltSize = 16;

    private const int HashSize = 32;

    private const int Iterations = 100_000;

    /// <summary>
    /// 占位哈希：用户不存在时也执行一次完整校验，避免通过响应时间枚举用户名。
    /// 进程内固定，内容无意义。
    /// </summary>
    public static readonly string DummyHash = Hash("symtek-dummy-password");

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            Iterations,
            HashAlgorithmName.SHA256,
            HashSize);
        return $"{Convert.ToBase64String(salt)}:{Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split(':');
        if (parts.Length != 2)
        {
            return false;
        }

        try
        {
            var salt = Convert.FromBase64String(parts[0]);
            var expected = Convert.FromBase64String(parts[1]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(
                password,
                salt,
                Iterations,
                HashAlgorithmName.SHA256,
                HashSize);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
