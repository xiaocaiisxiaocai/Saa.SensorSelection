using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Saa.SensorSelection.Api.Tests;

public class StoreTests
{
    private static string StoreRoute(string key) =>
        $"/api/store/by-key?key={Uri.EscapeDataString(key)}";

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
    public async Task Store_Read_WithoutToken_ReturnsStore()
    {
        // 匿名只读预览：未登录也能读取业务数据（客户/制程/机型/Sensor 型号）
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var body = await client.GetFromJsonAsync<JsonElement>("/api/store");
        Assert.Equal(JsonValueKind.Object, body.ValueKind);
    }

    [Fact]
    public async Task Store_Read_UsesCompression_WhenClientAcceptsGzip()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.AcceptEncoding.ParseAdd("gzip");

        var response = await client.GetAsync("/api/store");

        response.EnsureSuccessStatusCode();
        Assert.Contains("gzip", response.Content.Headers.ContentEncoding);
    }

    [Fact]
    public async Task Store_Write_WithoutToken_Returns401()
    {
        // 匿名只读：写入仍要求登录
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.PutAsJsonAsync(
            StoreRoute("customer-req:匿名写"),
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":1}]"));
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
        var route = StoreRoute("customer-req:测试");
        var first = await client.PutAsJsonAsync(
            route,
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":1,\"content\":\"第一行\"}]"));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // 单 key 读取
        var single = await client.GetFromJsonAsync<JsonElement>(route);
        Assert.Equal(1, single[0].GetProperty("id").GetInt32());
        Assert.Equal("第一行", single[0].GetProperty("content").GetString());

        // 全量读取
        var all = await client.GetFromJsonAsync<JsonElement>("/api/store");
        Assert.Single(all.EnumerateObject());

        // 覆盖写入
        await client.PutAsJsonAsync(
            route,
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":2,\"content\":\"第二行\"}]"));
        single = await client.GetFromJsonAsync<JsonElement>(route);
        Assert.Equal(2, single[0].GetProperty("id").GetInt32());
        Assert.Equal("第二行", single[0].GetProperty("content").GetString());

        // 删除 → 再读 404
        var deleted = await client.DeleteAsync(route);
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        var afterDelete = await client.GetAsync(route);
        Assert.Equal(HttpStatusCode.NotFound, afterDelete.StatusCode);
    }

    [Fact]
    public async Task Store_QueryKeyCrudRoundtrip_PreservesEncodedSlashLikeText()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);
        var key = "machine-section-rows:2:06 入料输送（平板%2FBOX）";
        var route = StoreRoute(key);

        var saved = await client.PutAsJsonAsync(
            route,
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":1}]"));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var all = await client.GetFromJsonAsync<JsonElement>("/api/store");
        Assert.True(all.TryGetProperty(key, out _));
        Assert.False(all.TryGetProperty("by-key", out _));

        var single = await client.GetFromJsonAsync<JsonElement>(route);
        Assert.Equal(1, single[0].GetProperty("id").GetInt32());

        var deleted = await client.DeleteAsync(route);
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(route)).StatusCode);
    }

    [Fact]
    public async Task Store_LegacyPathKeyRoutes_AreNotExposed()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);
        const string legacyRoute = "/api/store/customer-req:legacy-route";

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(legacyRoute)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync(
                legacyRoute,
                JsonSerializer.Deserialize<JsonElement>("[{\"id\":1}]"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(legacyRoute)).StatusCode);
    }

    [Fact]
    public async Task Store_Upsert_RejectsNonArrayValue()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        var response = await client.PutAsJsonAsync(
            StoreRoute("bad:key"),
            JsonSerializer.Deserialize<JsonElement>("{\"not\":\"array\"}"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation", body.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Store_EntityGroupsOrder_UsesDedicatedBackendContract()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        var payload = JsonSerializer.Deserialize<JsonElement>(
            "[{\"name\":\"华南\",\"items\":[\"健鼎\",\"庆鼎\"]},{\"name\":\"华东\",\"items\":[\"沪士\"]}]");
        var response = await client.PutAsJsonAsync(
            "/api/store/entity-groups/customer",
            payload);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var stored = await client.GetFromJsonAsync<JsonElement>(
            StoreRoute("entity-groups:customer"));
        Assert.Equal("华南", stored[0].GetProperty("name").GetString());
        Assert.Equal("健鼎", stored[0].GetProperty("items")[0].GetString());
    }

    [Fact]
    public async Task Store_EntityGroupsOrder_RejectsDuplicateItems()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        var payload = JsonSerializer.Deserialize<JsonElement>(
            "[{\"name\":\"华东\",\"items\":[\"庆鼎\"]},{\"name\":\"华南\",\"items\":[\"庆鼎\"]}]");
        var response = await client.PutAsJsonAsync(
            "/api/store/entity-groups/customer",
            payload);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation", body.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Store_MachineEntityGroups_PreservesConfigurationHierarchy()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        var payload = JsonSerializer.Deserialize<JsonElement>(
            "[{\"name\":\"输送机构\",\"items\":[\"直属机型\"],\"machineType\":\"mechanism\",\"configurations\":[{\"name\":\"标准输送段配置\",\"items\":[\"01 单段\",\"02 多段\"]}]},{\"name\":\"专案机型\",\"items\":[\"CSL(U)R-802（插框机）\"],\"machineType\":\"project\"}]");
        var response = await client.PutAsJsonAsync(
            "/api/store/entity-groups/machine",
            payload);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var stored = await client.GetFromJsonAsync<JsonElement>(
            StoreRoute("entity-groups:machine"));
        Assert.Equal(
            "标准输送段配置",
            stored[0].GetProperty("configurations")[0].GetProperty("name").GetString());
        Assert.Equal(
            "01 单段",
            stored[0].GetProperty("configurations")[0].GetProperty("items")[0].GetString());
        Assert.Equal("mechanism", stored[0].GetProperty("machineType").GetString());
        Assert.Equal("project", stored[1].GetProperty("machineType").GetString());
        Assert.Equal(
            "CSL(U)R-802（插框机）",
            stored[1].GetProperty("items")[0].GetString());
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
