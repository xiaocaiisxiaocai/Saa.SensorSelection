using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Symtek.Api.Tests;

public class AuthTests
{
    private static Task<HttpResponseMessage> LoginAsync(
        HttpClient client,
        string username,
        string? password = "admin123")
    {
        object payload = password == null
            ? new { username }
            : new { username, password };
        return client.PostAsJsonAsync("/api/auth/login", payload);
    }

    [Fact]
    public async Task Health_ReturnsOk()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("ok", body.GetProperty("status").GetString());
        Assert.Equal("ok", body.GetProperty("db").GetString());
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsTokenAndProfile()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await LoginAsync(client, "admin");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("token").GetString()));
        Assert.Equal("admin", body.GetProperty("username").GetString());
        Assert.Equal("管理员", body.GetProperty("displayName").GetString());

        // ExpiresAt 应来自真实签发（默认 ExpireHours=12），而非硬编码
        var expiresAt = body.GetProperty("expiresAt").GetDateTimeOffset();
        var now = DateTimeOffset.UtcNow;
        Assert.True(expiresAt > now.AddHours(11), "ExpiresAt 应约为当前时间 + 12 小时");
        Assert.True(expiresAt < now.AddHours(13), "ExpiresAt 应约为当前时间 + 12 小时");
    }

    [Fact]
    public async Task Login_WithWrongPassword_Returns401WithMessage()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await LoginAsync(client, "admin", "wrong-password");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("用户名或密码错误", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Login_WithUnknownUser_Returns401()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await LoginAsync(client, "no-such-user");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithMissingPassword_Returns400()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await LoginAsync(client, "admin", password: null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
