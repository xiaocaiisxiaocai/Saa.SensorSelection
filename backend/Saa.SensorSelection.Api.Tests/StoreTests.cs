using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;
using Saa.SensorSelection.Api.Services;

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

    private static async Task<HttpClient> CreateRawLoggedInClientAsync(ApiFactory factory)
    {
        using var login = factory.CreateRawClient();
        var client = factory.CreateRawClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await LoginTokenAsync(login));
        return client;
    }

    private static async Task ExecuteSqlAsync(ApiFactory factory, string sql)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync(sql);
    }

    private static async Task<int> StoredFileCountAsync(ApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.StoredFiles.CountAsync();
    }

    private static async Task SetStoreEntryAsync(
        ApiFactory factory,
        string key,
        string json)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entry = await db.StoreEntries.FindAsync(key);
        if (entry is null)
        {
            db.StoreEntries.Add(new StoreEntry { Key = key, Json = json, UpdatedAt = DateTime.UtcNow });
        }
        else
        {
            entry.Json = json;
            entry.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Sensor_Dates_AreAutomatic_AndPreservedOnEdit()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);
        var route = StoreRoute("sensor-catalog:all");
        async Task<JsonElement> Save(string status, string enteredAt, string usedAt)
        {
            var response = await client.PutAsJsonAsync(route,
                new[] { new { id = 900001, model = "AUTO-DATE", status, enteredAt, usedAt } });
            response.EnsureSuccessStatusCode();
            var rows = await client.GetFromJsonAsync<JsonElement>(route);
            return rows[0];
        }
        var today = DateTime.Now.ToString("yyyy-MM-dd");
        var alternate = await Save("02 备选", "2000-01-01", "2000-01-01");
        Assert.Equal(today, alternate.GetProperty("enteredAt").GetString());
        Assert.Equal("", alternate.GetProperty("usedAt").GetString());
        var current = await Save("01 现用", "2000-01-01", "2000-01-01");
        Assert.Equal(today, current.GetProperty("usedAt").GetString());
        var edited = await Save("01 现用", "2000-01-01", "2000-01-01");
        Assert.Equal(today, edited.GetProperty("enteredAt").GetString());
        Assert.Equal(today, edited.GetProperty("usedAt").GetString());
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

        // 客户 → 厂区：同一厂区名可以出现在不同客户下，每个厂区的区域放在 regions 里
        var payload = JsonSerializer.Deserialize<JsonElement>(
            "[{\"name\":\"健鼎\",\"items\":[\"华南\",\"华东\"],\"regions\":{\"华南\":\"华南\",\"华东\":\" 华东 \"}},{\"name\":\"沪士\",\"items\":[\"华东\"]}]");
        var response = await client.PutAsJsonAsync(
            "/api/store/entity-groups/customer",
            payload);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var stored = await client.GetFromJsonAsync<JsonElement>(
            StoreRoute("entity-groups:customer"));
        Assert.Equal("健鼎", stored[0].GetProperty("name").GetString());
        Assert.Equal("华南", stored[0].GetProperty("items")[0].GetString());
        Assert.Equal("华东", stored[1].GetProperty("items")[0].GetString());
        Assert.Equal("华南", stored[0].GetProperty("regions").GetProperty("华南").GetString());
        Assert.Equal("华东", stored[0].GetProperty("regions").GetProperty("华东").GetString());
        // 旧客户端不带 regions 时原样不写
        Assert.False(stored[1].TryGetProperty("regions", out _));
    }

    [Theory]
    // 同一客户下厂区重复
    [InlineData("customer", "[{\"name\":\"庆鼎\",\"items\":[\"华东\",\"华东\"]}]")]
    // 客户/厂区名称含「/」（数据键用它拼接）
    [InlineData("customer", "[{\"name\":\"庆/鼎\",\"items\":[\"华东\"]}]")]
    [InlineData("customer", "[{\"name\":\"庆鼎\",\"items\":[\"华/东\"]}]")]
    // 区域只能指向本客户现有的厂区，且必须是 1-40 字的字符串
    [InlineData("customer", "[{\"name\":\"庆鼎\",\"items\":[\"一厂\"],\"regions\":{\"二厂\":\"华东\"}}]")]
    [InlineData("customer", "[{\"name\":\"庆鼎\",\"items\":[\"一厂\"],\"regions\":{\"一厂\":\" \"}}]")]
    [InlineData("customer", "[{\"name\":\"庆鼎\",\"items\":[\"一厂\"],\"regions\":{\"一厂\":1}}]")]
    [InlineData("customer", "[{\"name\":\"庆鼎\",\"items\":[\"一厂\"],\"regions\":[\"华东\"]}]")]
    // 机型分类没有区域
    [InlineData("machine", "[{\"name\":\"输送机构\",\"items\":[\"A\"],\"regions\":{\"A\":\"华东\"}}]")]
    // 机型名仍然全局唯一
    [InlineData("machine", "[{\"name\":\"输送机构\",\"items\":[\"A\"]},{\"name\":\"收板机\",\"items\":[\"A\"]}]")]
    public async Task Store_EntityGroupsOrder_RejectsInvalidItems(string kind, string json)
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        var payload = JsonSerializer.Deserialize<JsonElement>(json);
        var response = await client.PutAsJsonAsync(
            $"/api/store/entity-groups/{kind}",
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

        // 空字符串 key → 400（与 UpsertAsync 的校验保持一致）
        bad = await client.PutAsJsonAsync(
            "/api/store",
            JsonSerializer.Deserialize<JsonElement>("{\"\":[1]}"));
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

    [Fact]
    public async Task Store_LegacyWrites_RequireCurrentStrongEntityTag()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateRawLoggedInClientAsync(factory);
        var route = StoreRoute("customer-req:etag-contract");

        var missing = await client.GetAsync(route);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(StoreService.MissingEntityTag, missing.Headers.ETag?.Tag);

        var withoutPrecondition = await client.PutAsJsonAsync(route, new[] { new { id = 1 } });
        Assert.Equal((HttpStatusCode)428, withoutPrecondition.StatusCode);

        using var create = new HttpRequestMessage(HttpMethod.Put, route)
        {
            Content = JsonContent.Create(new[] { new { id = 1 } }),
        };
        create.Headers.IfMatch.ParseAdd(StoreService.MissingEntityTag);
        var created = await client.SendAsync(create);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var originalTag = created.Headers.ETag?.Tag;
        Assert.NotNull(originalTag);

        using var firstUpdate = new HttpRequestMessage(HttpMethod.Put, route)
        {
            Content = JsonContent.Create(new[] { new { id = 1 }, new { id = 2 } }),
        };
        firstUpdate.Headers.IfMatch.ParseAdd(originalTag);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(firstUpdate)).StatusCode);

        using var staleUpdate = new HttpRequestMessage(HttpMethod.Put, route)
        {
            Content = JsonContent.Create(new[] { new { id = 3 } }),
        };
        staleUpdate.Headers.IfMatch.ParseAdd(originalTag);
        Assert.Equal(HttpStatusCode.PreconditionFailed, (await client.SendAsync(staleUpdate)).StatusCode);

        var stored = await client.GetFromJsonAsync<JsonElement>(route);
        Assert.Equal(2, stored.GetArrayLength());
    }

    [Fact]
    public async Task Store_Batch_IsAtomic_AndRejectsMissingOrStaleExpectedValues()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateRawLoggedInClientAsync(factory);

        var missingExpected = await client.PostAsJsonAsync(
            "/api/store/batch",
            new { changes = new[] { new { key = "batch:a", value = new[] { 1 } } } });
        Assert.Equal((HttpStatusCode)428, missingExpected.StatusCode);

        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/store/batch", new { changes = Array.Empty<object>() })).StatusCode);

        var create = await client.PostAsJsonAsync(
            "/api/store/batch",
            new
            {
                changes = new object[]
                {
                    new { key = "batch:a", expected = (object?)null, value = new[] { 1 } },
                    new { key = "batch:b", expected = (object?)null, value = new[] { 2 } },
                },
            });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, created.GetProperty("values").GetProperty("batch:a")[0].GetInt32());

        var conflict = await client.PostAsJsonAsync(
            "/api/store/batch",
            new
            {
                changes = new object[]
                {
                    new { key = "batch:a", expected = new[] { 999 }, value = new[] { 10 } },
                    new { key = "batch:b", expected = new[] { 2 }, value = new[] { 20 } },
                },
            });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        var conflictBody = await conflict.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("batch:a", conflictBody.GetProperty("key").GetString());
        Assert.Equal(1, (await client.GetFromJsonAsync<JsonElement>(StoreRoute("batch:a")))[0].GetInt32());
        Assert.Equal(2, (await client.GetFromJsonAsync<JsonElement>(StoreRoute("batch:b")))[0].GetInt32());

        var update = await client.PostAsJsonAsync(
            "/api/store/batch",
            new
            {
                changes = new object[]
                {
                    new { key = "batch:a", expected = new[] { 1 }, value = new[] { 10 } },
                    new { key = "batch:b", expected = new[] { 2 }, value = (object?)null },
                },
            });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(10, (await client.GetFromJsonAsync<JsonElement>(StoreRoute("batch:a")))[0].GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(StoreRoute("batch:b"))).StatusCode);
    }

    [Fact]
    public async Task Store_MachineEntityGroups_RejectsDuplicateNamesAcrossConfigurations()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        var response = await client.PutAsJsonAsync(
            "/api/store/entity-groups/machine",
            JsonSerializer.Deserialize<JsonElement>(
                "[{\"name\":\"结构\",\"items\":[\"重复机型\"],\"configurations\":[{\"name\":\"配置甲\",\"items\":[\"重复机型\"]}]}]"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Store_MachineEntityGroups_AllowsReducingLegacyDuplicates_ButNotExpandingAgain()
    {
        await using var factory = new ApiFactory();
        const string key = "entity-groups:machine";
        await SetStoreEntryAsync(
            factory,
            key,
            """
            [
              {"name":"分类甲","items":["历史重名"],"configurations":[{"name":"配置甲","items":["历史重名"]}]},
              {"name":"分类乙","items":[],"configurations":[{"name":"配置乙","items":["历史重名"]}]}
            ]
            """);
        using var client = await CreateLoggedInClientAsync(factory);

        var reordered = await client.PutAsJsonAsync(
            "/api/store/entity-groups/machine",
            JsonSerializer.Deserialize<JsonElement>(
                """
                [
                  {"name":"分类乙","items":[],"configurations":[{"name":"配置乙","items":["历史重名"]}]},
                  {"name":"分类甲","items":["历史重名"],"configurations":[{"name":"配置甲","items":["历史重名"]}]}
                ]
                """));
        Assert.Equal(HttpStatusCode.OK, reordered.StatusCode);

        var repaired = await client.PutAsJsonAsync(
            "/api/store/entity-groups/machine",
            JsonSerializer.Deserialize<JsonElement>(
                """
                [
                  {"name":"分类乙","items":[],"configurations":[{"name":"配置乙","items":["历史重名"]}]},
                  {"name":"分类甲","items":["已修复机型"],"configurations":[{"name":"配置甲","items":["历史重名"]}]}
                ]
                """));
        Assert.Equal(HttpStatusCode.OK, repaired.StatusCode);

        var expandedAgain = await client.PutAsJsonAsync(
            "/api/store/entity-groups/machine",
            JsonSerializer.Deserialize<JsonElement>(
                """
                [
                  {"name":"分类乙","items":[],"configurations":[{"name":"配置乙","items":["历史重名"]}]},
                  {"name":"分类甲","items":["已修复机型","历史重名"],"configurations":[{"name":"配置甲","items":["历史重名"]}]}
                ]
                """));
        Assert.Equal(HttpStatusCode.BadRequest, expandedAgain.StatusCode);

        var stored = await client.GetFromJsonAsync<JsonElement>(StoreRoute(key));
        var duplicateCount = stored.EnumerateArray().Sum(group =>
            group.GetProperty("items").EnumerateArray().Count(item => item.GetString() == "历史重名") +
            (group.TryGetProperty("configurations", out var configurations)
                ? configurations.EnumerateArray().Sum(configuration =>
                    configuration.GetProperty("items").EnumerateArray()
                        .Count(item => item.GetString() == "历史重名"))
                : 0));
        Assert.Equal(2, duplicateCount);
    }

    [Fact]
    public async Task Store_ReplaceAll_RollsBackDeletedKeys_WhenFinalSaveFails()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateRawLoggedInClientAsync(factory);
        var seeded = await client.PostAsJsonAsync(
            "/api/store/batch",
            new
            {
                changes = new object[]
                {
                    new { key = "rollback:old-a", expected = (object?)null, value = new[] { 1 } },
                    new { key = "rollback:old-b", expected = (object?)null, value = new[] { 2 } },
                },
            });
        Assert.Equal(HttpStatusCode.OK, seeded.StatusCode);

        await ExecuteSqlAsync(
            factory,
            """
            CREATE TRIGGER fail_replace_all_insert
            BEFORE INSERT ON StoreEntries
            WHEN NEW.Key = 'rollback:new'
            BEGIN
                SELECT RAISE(ABORT, 'injected replace-all failure');
            END;
            """);

        using var snapshot = await client.GetAsync("/api/store");
        var entityTag = snapshot.Headers.ETag?.Tag;
        Assert.NotNull(entityTag);
        using var replace = new HttpRequestMessage(HttpMethod.Put, "/api/store")
        {
            Content = JsonContent.Create(new Dictionary<string, int[]>
            {
                ["rollback:new"] = [3],
            }),
        };
        replace.Headers.IfMatch.ParseAdd(entityTag);
        Assert.Equal(HttpStatusCode.InternalServerError, (await client.SendAsync(replace)).StatusCode);

        var after = await client.GetFromJsonAsync<JsonElement>("/api/store");
        Assert.Equal(1, after.GetProperty("rollback:old-a")[0].GetInt32());
        Assert.Equal(2, after.GetProperty("rollback:old-b")[0].GetInt32());
        Assert.False(after.TryGetProperty("rollback:new", out _));
    }

    [Fact]
    public async Task Store_Batch_RollsBackKeysAndDetachedFiles_WhenFinalSaveFails()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateRawLoggedInClientAsync(factory);
        var originalBytes = System.Text.Encoding.UTF8.GetBytes("original-file");
        var originalDataUrl = $"data:application/pdf;base64,{Convert.ToBase64String(originalBytes)}";
        var seeded = await client.PostAsJsonAsync(
            "/api/store/batch",
            new
            {
                changes = new object[]
                {
                    new
                    {
                        key = "rollback:file",
                        expected = (object?)null,
                        value = new[]
                        {
                            new
                            {
                                id = 1,
                                fileName = "original.pdf",
                                mimeType = "application/pdf",
                                size = originalBytes.Length,
                                dataUrl = originalDataUrl,
                            },
                        },
                    },
                    new { key = "rollback:delete", expected = (object?)null, value = new[] { 2 } },
                },
            });
        Assert.Equal(HttpStatusCode.OK, seeded.StatusCode);
        var original = await client.GetFromJsonAsync<JsonElement>(StoreRoute("rollback:file"));
        var originalContentUrl = original[0].GetProperty("dataUrl").GetString();
        Assert.NotNull(originalContentUrl);
        var filesBefore = await StoredFileCountAsync(factory);

        await ExecuteSqlAsync(
            factory,
            """
            CREATE TRIGGER fail_batch_insert
            BEFORE INSERT ON StoreEntries
            WHEN NEW.Key = 'rollback:trigger'
            BEGIN
                SELECT RAISE(ABORT, 'injected batch failure');
            END;
            """);

        var replacementBytes = System.Text.Encoding.UTF8.GetBytes("replacement-file");
        var replacementDataUrl =
            $"data:application/pdf;base64,{Convert.ToBase64String(replacementBytes)}";
        var failed = await client.PostAsJsonAsync(
            "/api/store/batch",
            new
            {
                changes = new object[]
                {
                    new
                    {
                        key = "rollback:file",
                        expected = original,
                        value = new[]
                        {
                            new
                            {
                                id = 1,
                                fileName = "replacement.pdf",
                                mimeType = "application/pdf",
                                size = replacementBytes.Length,
                                dataUrl = replacementDataUrl,
                            },
                        },
                    },
                    new { key = "rollback:delete", expected = new[] { 2 }, value = (object?)null },
                    new { key = "rollback:trigger", expected = (object?)null, value = new[] { 3 } },
                },
            });
        Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);

        var afterFile = await client.GetFromJsonAsync<JsonElement>(StoreRoute("rollback:file"));
        Assert.Equal(originalContentUrl, afterFile[0].GetProperty("dataUrl").GetString());
        Assert.Equal(originalBytes, await client.GetByteArrayAsync(originalContentUrl));
        Assert.Equal(2, (await client.GetFromJsonAsync<JsonElement>(StoreRoute("rollback:delete")))[0].GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(StoreRoute("rollback:trigger"))).StatusCode);
        Assert.Equal(filesBefore, await StoredFileCountAsync(factory));
    }
}
