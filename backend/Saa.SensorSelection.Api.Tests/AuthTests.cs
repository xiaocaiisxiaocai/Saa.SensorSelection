using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Saa.SensorSelection.Api.Tests;

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

    [Fact]
    public async Task ChangePassword_WithCurrentPassword_UpdatesLogin()
    {
        await using var factory = new ApiFactory();
        using var login = factory.CreateClient();
        var tokenResponse = await LoginAsync(login, "admin");
        tokenResponse.EnsureSuccessStatusCode();
        var tokenBody = await tokenResponse.Content.ReadFromJsonAsync<JsonElement>();
        var token = tokenBody.GetProperty("token").GetString();

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        var changed = await client.PutAsJsonAsync(
            "/api/auth/password",
            new { currentPassword = "admin123", newPassword = "admin456" });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);

        using var after = factory.CreateClient();
        var oldLogin = await LoginAsync(after, "admin", "admin123");
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);
        var newLogin = await LoginAsync(after, "admin", "admin456");
        Assert.Equal(HttpStatusCode.OK, newLogin.StatusCode);
    }

    [Fact]
    public async Task ChangePassword_WithWrongCurrentPassword_Returns400()
    {
        await using var factory = new ApiFactory();
        using var login = factory.CreateClient();
        var tokenResponse = await LoginAsync(login, "admin");
        tokenResponse.EnsureSuccessStatusCode();
        var tokenBody = await tokenResponse.Content.ReadFromJsonAsync<JsonElement>();
        var token = tokenBody.GetProperty("token").GetString();

        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        var response = await client.PutAsJsonAsync(
            "/api/auth/password",
            new { currentPassword = "wrong-password", newPassword = "admin456" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("当前密码不正确", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ChangePassword_WithoutToken_Returns401()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.PutAsJsonAsync(
            "/api/auth/password",
            new { currentPassword = "admin123", newPassword = "admin456" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
