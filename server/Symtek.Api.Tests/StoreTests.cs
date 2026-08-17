using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Symtek.Api.Tests;

public class StoreTests
{
    private static async Task<string> LoginTokenAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "admin", password = "admin123" });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("token").GetString()!;
    }

    private static HttpClient CreateAuthorizedClient(ApiFactory factory, string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static async Task<HttpClient> CreateLoggedInClientAsync(ApiFactory factory)
    {
        using var login = factory.CreateClient();
        return CreateAuthorizedClient(factory, await LoginTokenAsync(login));
    }

    [Fact]
    public async Task Store_WithoutToken_Returns401()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/store");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Store_CrudRoundtrip_Works()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        // 初始为空
        var initial = await client.GetFromJsonAsync<JsonElement>("/api/store");
        Assert.Equal(JsonValueKind.Object, initial.ValueKind);
        Assert.Empty(initial.EnumerateObject());

        // 写入
        var first = await client.PutAsJsonAsync(
            "/api/store/customer-req:测试",
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":1,\"content\":\"第一行\"}]"));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // 单 key 读取
        var single = await client.GetFromJsonAsync<JsonElement>("/api/store/customer-req:测试");
        Assert.Equal(1, single[0].GetProperty("id").GetInt32());
        Assert.Equal("第一行", single[0].GetProperty("content").GetString());

        // 全量读取
        var all = await client.GetFromJsonAsync<JsonElement>("/api/store");
        Assert.Single(all.EnumerateObject());

        // 覆盖写入
        await client.PutAsJsonAsync(
            "/api/store/customer-req:测试",
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":2,\"content\":\"第二行\"}]"));
        single = await client.GetFromJsonAsync<JsonElement>("/api/store/customer-req:测试");
        Assert.Equal(2, single[0].GetProperty("id").GetInt32());
        Assert.Equal("第二行", single[0].GetProperty("content").GetString());

        // 删除 → 再读 404
        var deleted = await client.DeleteAsync("/api/store/customer-req:测试");
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        var afterDelete = await client.GetAsync("/api/store/customer-req:测试");
        Assert.Equal(HttpStatusCode.NotFound, afterDelete.StatusCode);
    }

    [Fact]
    public async Task Store_Upsert_RejectsNonArrayValue()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        var response = await client.PutAsJsonAsync(
            "/api/store/bad:key",
            JsonSerializer.Deserialize<JsonElement>("{\"not\":\"array\"}"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation", body.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Store_ReplaceAll_ValidatesInputAndRemovesStaleKeys()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        // 非对象 → 400
        var bad = await client.PutAsJsonAsync(
            "/api/store",
            JsonSerializer.Deserialize<JsonElement>("[1,2]"));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        // key 值非数组 → 400
        bad = await client.PutAsJsonAsync(
            "/api/store",
            JsonSerializer.Deserialize<JsonElement>("{\"a\":1}"));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        // 合法整体替换
        var ok = await client.PutAsJsonAsync(
            "/api/store",
            JsonSerializer.Deserialize<JsonElement>("{\"k1\":[1],\"k2\":[2]}"));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var all = await client.GetFromJsonAsync<JsonElement>("/api/store");
        Assert.Equal(2, all.EnumerateObject().Count());

        // 再次整体替换：未提交的旧 key 应被清除
        await client.PutAsJsonAsync(
            "/api/store",
            JsonSerializer.Deserialize<JsonElement>("{\"k3\":[3]}"));
        all = await client.GetFromJsonAsync<JsonElement>("/api/store");
        Assert.Single(all.EnumerateObject());
        Assert.Equal(JsonValueKind.Array, all.GetProperty("k3").ValueKind);
    }
}
