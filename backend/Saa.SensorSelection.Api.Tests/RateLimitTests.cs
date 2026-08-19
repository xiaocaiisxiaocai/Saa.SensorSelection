using System.Net;
using System.Net.Http.Json;

namespace Saa.SensorSelection.Api.Tests;

public class RateLimitTests
{
    private static Task<HttpResponseMessage> LoginAsync(
        HttpClient client,
        string username,
        string password) =>
        client.PostAsJsonAsync(
            "/api/auth/login",
            new { username, password });

    [Fact]
    public async Task Login_AfterRepeatedFailures_Returns429AndBlocksValidCredentials()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        // 默认配置：5 次失败后锁定（RateLimit:MaxFailures=5）
        for (var i = 0; i < 5; i++)
        {
            var failed = await LoginAsync(client, "admin", "wrong-password");
            Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);
        }

        var blocked = await LoginAsync(client, "admin", "wrong-password");
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        var body = await blocked.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.True(body.GetProperty("message").GetString()?.Contains("分钟") == true);

        // 锁定期间即使密码正确也拒绝（限流在密码校验之前）
        var blockedValid = await LoginAsync(client, "admin", "admin123");
        Assert.Equal(HttpStatusCode.TooManyRequests, blockedValid.StatusCode);
    }

    [Fact]
    public async Task Login_RateLimitIsPerUsername_OtherUserNotBlocked()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        for (var i = 0; i < 5; i++)
        {
            await LoginAsync(client, "admin", "wrong-password");
        }

        // 不同用户名不受 admin 的限流影响（仍按未知用户返回 401）
        var other = await LoginAsync(client, "another-user", "wrong-password");
        Assert.Equal(HttpStatusCode.Unauthorized, other.StatusCode);
    }
}
