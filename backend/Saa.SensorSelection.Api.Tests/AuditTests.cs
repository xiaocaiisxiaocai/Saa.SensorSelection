using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

using Microsoft.Extensions.DependencyInjection;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;
using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Tests;

public class AuditTests
{
    private static string StoreRoute(string key) =>
        $"/api/store/by-key?key={Uri.EscapeDataString(key)}";

    [Fact]
    public void AuditLogIpNormalization_UsesIpv4LoopbackForIpv6Loopback()
    {
        Assert.Equal("127.0.0.1", AuditLogService.NormalizeIp("::1"));
        Assert.Equal("127.0.0.1", AuditLogService.NormalizeIp("::ffff:127.0.0.1"));
        Assert.Equal("192.0.2.10", AuditLogService.NormalizeIp("192.0.2.10"));
        Assert.Equal("127.0.0.2", AuditLogService.NormalizeIp("127.0.0.2"));
    }

    private static async Task<string> LoginTokenAsync(
        HttpClient client,
        string username = "admin",
        string password = "admin123")
    {
        var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { username, password });
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

    private static async Task<HttpClient> CreateAdminClientAsync(ApiFactory factory)
    {
        using var login = factory.CreateClient();
        return CreateAuthorizedClient(factory, await LoginTokenAsync(login));
    }

    private static async Task<JsonElement> QueryAuditLogsAsync(
        HttpClient client,
        string query = "")
    {
        var response = await client.GetAsync($"/api/audit-logs{query}");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Login_SuccessAndFailure_WriteAuditEntries()
    {
        await using var factory = new ApiFactory();
        using var anon = factory.CreateClient();

        // 错误密码 → 失败审计
        var failed = await anon.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "admin", password = "wrong-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);

        // 正确密码 → 成功审计
        var ok = await anon.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "admin", password = "admin123" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);

        // 管理员读取操作日志，应同时看到成功与失败记录
        using var admin = await CreateAdminClientAsync(factory);
        var page = await QueryAuditLogsAsync(admin, "?action=auth.login&username=admin");
        var entries = page.GetProperty("items").EnumerateArray().ToArray();

        Assert.True(page.GetProperty("total").GetInt32() >= 2);
        Assert.Contains(entries, item =>
            item.GetProperty("action").GetString() == "auth.login" &&
            item.GetProperty("result").GetBoolean());
        Assert.Contains(entries, item =>
            item.GetProperty("action").GetString() == "auth.login" &&
            !item.GetProperty("result").GetBoolean() &&
            item.GetProperty("error").GetString() == "用户名或密码错误");
        // 登录失败的目标（用户名）与错误信息都在
        var failedEntry = entries.First(item => !item.GetProperty("result").GetBoolean());
        Assert.Equal("admin", failedEntry.GetProperty("target").GetString());
        Assert.Equal("admin", failedEntry.GetProperty("username").GetString());
        var successEntry = entries.First(item => item.GetProperty("result").GetBoolean());
        Assert.Contains("登录成功", successEntry.GetProperty("detail").GetString());
        // 权限写中文名（按定义顺序），不写权限码
        Assert.Contains("权限：查看业务数据、编辑业务数据、查看系统管理", successEntry.GetProperty("detail").GetString());
        Assert.DoesNotContain("selection:read", successEntry.GetProperty("detail").GetString());
        // TestServer 没有真实 socket 地址，生产 Kestrel 的 ::1/映射地址由
        // AuditLogService.NormalizeIp 统一转为 127.0.0.1；此处只防止回归为 ::1。
        Assert.NotEqual("::1", successEntry.GetProperty("ip").GetString());

        // 用户筛选是搜索框，输入部分用户名也能筛到；不匹配的则为空
        var partial = await QueryAuditLogsAsync(admin, "?action=auth.login&username=adm");
        Assert.Equal(page.GetProperty("total").GetInt32(), partial.GetProperty("total").GetInt32());
        var none = await QueryAuditLogsAsync(admin, "?action=auth.login&username=nobody");
        Assert.Equal(0, none.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task AuditLogs_EnrichLegacyDetailsWithoutChangingStoredEntries()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AuditLogs.AddRange(
                new AuditLog
                {
                    Action = "auth.login",
                    Target = "admin",
                    Result = true,
                    Ip = "::1",
                },
                new AuditLog
                {
                    Action = "store.upsert",
                    Target = "customer-req:历史客户",
                    Detail = "2 条记录",
                    Result = true,
                    Ip = "::ffff:127.0.0.1",
                });
            await db.SaveChangesAsync();
        }

        var page = await QueryAuditLogsAsync(admin, "?pageSize=20");
        var entries = page.GetProperty("items").EnumerateArray().ToArray();
        Assert.Contains(entries, item =>
            item.GetProperty("action").GetString() == "auth.login" &&
            item.GetProperty("target").GetString() == "admin" &&
            item.GetProperty("detail").GetString() == "登录成功" &&
            item.GetProperty("ip").GetString() == "127.0.0.1");
        Assert.Contains(entries, item =>
            item.GetProperty("action").GetString() == "store.upsert" &&
            item.GetProperty("target").GetString() == "customer-req:历史客户" &&
            item.GetProperty("detail").GetString() == "数据类型：数组；记录数：2");
    }

    [Fact]
    public async Task AuditLogs_FilterByTimeRange()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AuditLogs.AddRange(
                new AuditLog
                {
                    Action = "test.range",
                    Target = "before",
                    Result = true,
                    Timestamp = new DateTimeOffset(2026, 1, 1, 10, 0, 0, TimeSpan.Zero),
                },
                new AuditLog
                {
                    // 非 UTC 偏移也按 UTC 存，范围比较才正确（= 2026-01-02 10:00Z）
                    Action = "test.range",
                    Target = "inside",
                    Result = true,
                    Timestamp = new DateTimeOffset(2026, 1, 2, 18, 0, 0, TimeSpan.FromHours(8)),
                },
                new AuditLog
                {
                    Action = "test.range",
                    Target = "after",
                    Result = true,
                    Timestamp = new DateTimeOffset(2026, 1, 3, 10, 0, 0, TimeSpan.Zero),
                });
            await db.SaveChangesAsync();
        }

        var page = await QueryAuditLogsAsync(
            admin,
            "?action=test.range" +
            $"&from={Uri.EscapeDataString("2026-01-02T00:00:00.000Z")}" +
            $"&to={Uri.EscapeDataString("2026-01-02T23:59:59.999Z")}");

        Assert.Equal(1, page.GetProperty("total").GetInt32());
        var entry = Assert.Single(page.GetProperty("items").EnumerateArray());
        Assert.Equal("inside", entry.GetProperty("target").GetString());
        Assert.Equal(
            new DateTimeOffset(2026, 1, 2, 10, 0, 0, TimeSpan.Zero),
            entry.GetProperty("timestamp").GetDateTimeOffset());
    }

    [Fact]
    public async Task StoreWrite_SuccessAndValidationFailure_WriteAuditEntries()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        // 成功写入
        var write = await admin.PutAsJsonAsync(
            StoreRoute("customer-req:测试客户"),
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":1,\"name\":\"测试\"}]"));
        Assert.Equal(HttpStatusCode.OK, write.StatusCode);

        // 校验失败写入（非数组）→ 400，仍要记失败审计
        var invalid = await admin.PutAsJsonAsync(
            StoreRoute("customer-req:测试客户"),
            JsonSerializer.Deserialize<JsonElement>("{\"not\":\"array\"}"));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var page = await QueryAuditLogsAsync(
            admin,
            "?action=store.upsert&username=admin&result=true");
        var successEntries = page.GetProperty("items").EnumerateArray().ToArray();
        var success = successEntries.First(item =>
            item.GetProperty("target").GetString() == "customer-req:测试客户");
        Assert.Equal("数据类型：数组；记录数：1", success.GetProperty("detail").GetString());

        var failedPage = await QueryAuditLogsAsync(
            admin,
            "?action=store.upsert&username=admin&result=false");
        var failedEntries = failedPage.GetProperty("items").EnumerateArray().ToArray();
        Assert.Contains(failedEntries, item =>
            item.GetProperty("error").GetString() == "值必须是 JSON 数组");
    }

    [Fact]
    public async Task StoreDelete_WritesAuditEntry()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        await admin.PutAsJsonAsync(
            StoreRoute("customer-req:待删除"),
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":1}]"));
        var deleted = await admin.DeleteAsync(StoreRoute("customer-req:待删除"));
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);

        // 删除不存在的 key → 404，也记失败
        var missing = await admin.DeleteAsync(StoreRoute("customer-req:不存在"));
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        var page = await QueryAuditLogsAsync(admin, "?action=store.delete&username=admin");
        var entries = page.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, entries.Length);
        Assert.Contains(entries, item =>
            item.GetProperty("target").GetString() == "customer-req:待删除" &&
            item.GetProperty("result").GetBoolean());
        Assert.Contains(entries, item =>
            item.GetProperty("target").GetString() == "customer-req:不存在" &&
            !item.GetProperty("result").GetBoolean() &&
            item.GetProperty("error").GetString() == "key 不存在");
    }

    [Fact]
    public async Task RbacManagement_WritesAuditEntries()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        // 创建用户（成功）
        var create = await admin.PostAsJsonAsync(
            "/api/rbac/users",
            new { username = "audit_user", password = "pass123456", displayName = "审计测试" });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var userId = (await create.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        // 创建重复用户名（失败）
        var duplicate = await admin.PostAsJsonAsync(
            "/api/rbac/users",
            new { username = "audit_user", password = "pass123456", displayName = "重复" });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        // 组织创建（成功）
        var org = await admin.PostAsJsonAsync(
            "/api/rbac/org-units",
            new { name = "审计部", level = "事业部" });
        Assert.Equal(HttpStatusCode.OK, org.StatusCode);

        var page = await QueryAuditLogsAsync(admin, "?username=admin");
        var entries = page.GetProperty("items").EnumerateArray().ToArray();
        Assert.Contains(entries, item =>
            item.GetProperty("action").GetString() == "user.create" &&
            item.GetProperty("target").GetString() == "audit_user" &&
            item.GetProperty("result").GetBoolean());
        Assert.Contains(entries, item =>
            item.GetProperty("action").GetString() == "user.create" &&
            item.GetProperty("target").GetString() == "audit_user" &&
            !item.GetProperty("result").GetBoolean() &&
            item.GetProperty("error").GetString() == "用户名已存在");
        // 删除后目标仍写名称，而不是只剩 #id
        var orgId = (await org.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        Assert.Equal(HttpStatusCode.OK, (await admin.DeleteAsync($"/api/rbac/users/{userId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.DeleteAsync($"/api/rbac/org-units/{orgId}")).StatusCode);
        var deletes = (await QueryAuditLogsAsync(admin, "?username=admin"))
            .GetProperty("items").EnumerateArray().ToArray();
        Assert.Contains(deletes, item =>
            item.GetProperty("action").GetString() == "user.delete" &&
            item.GetProperty("target").GetString() == "audit_user");
        Assert.Contains(deletes, item =>
            item.GetProperty("action").GetString() == "org.delete" &&
            item.GetProperty("target").GetString() == "审计部");

        Assert.Contains(entries, item =>
            item.GetProperty("action").GetString() == "org.create" &&
            item.GetProperty("target").GetString() == "审计部" &&
            item.GetProperty("detail").GetString() == "层级：事业部；父级：无；排序：0；子级：0；用户：0");
    }

    private static HttpRequestMessage StoreWrite(string key, string json, string operationId, string? label = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, StoreRoute(key))
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json"),
        };
        request.Headers.Add(AuditLogService.OperationIdHeader, operationId);
        if (label is not null)
        {
            request.Headers.Add(AuditLogService.OperationLabelHeader, Uri.EscapeDataString(label));
        }
        return request;
    }

    [Fact]
    public async Task Operations_GroupWritesOfOneOperation_AndRecordWhatChanged()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        await admin.SendAsync(StoreWrite("customer-req:分组客户", """[{"id":1,"content":"旧要求"}]""", "op-first-0001"));
        // 同一次操作的两次写入：带同一个操作编号和名称
        (await admin.SendAsync(StoreWrite(
            "customer-req:分组客户",
            """[{"id":1,"content":"新要求"},{"id":2,"content":"加一条"}]""",
            "op-second-0002",
            "保存客户通用要求"))).EnsureSuccessStatusCode();
        (await admin.SendAsync(StoreWrite(
            "customer-proc:分组客户",
            """[{"id":1,"content":"注意事项"}]""",
            "op-second-0002",
            "保存客户通用要求"))).EnsureSuccessStatusCode();

        var page = await admin.GetFromJsonAsync<JsonElement>("/api/audit-logs/operations?hideLogin=true");
        var latest = page.GetProperty("items")[0];
        Assert.Equal("保存客户通用要求", latest.GetProperty("label").GetString());
        Assert.Equal("管理员", latest.GetProperty("displayName").GetString());
        Assert.Equal(2, latest.GetProperty("entryCount").GetInt32());
        Assert.True(latest.GetProperty("result").GetBoolean());
        var changes = JsonDocument.Parse(
            latest.GetProperty("entries")[0].GetProperty("changes").GetString()!).RootElement;
        Assert.Equal(1, changes.GetProperty("addedCount").GetInt32());
        var field = changes.GetProperty("modified")[0].GetProperty("fields")[0];
        Assert.Equal("旧要求", field.GetProperty("before").GetString());
        Assert.Equal("新要求", field.GetProperty("after").GetString());
        // 编号前面加了用户名，别的用户伪造同一个编号也串不进来
        Assert.StartsWith("admin:", latest.GetProperty("operationId").GetString());

        // 关键词也搜变更明细；隐藏登录后没有登录组
        var search = await admin.GetFromJsonAsync<JsonElement>("/api/audit-logs/operations?keyword=加一条");
        Assert.Equal(1, search.GetProperty("total").GetInt32());
        var all = await admin.GetFromJsonAsync<JsonElement>("/api/audit-logs/operations?hideLogin=true&action=store.upsert");
        Assert.DoesNotContain(all.GetProperty("items").EnumerateArray(), item =>
            item.GetProperty("entries").EnumerateArray().Any(entry =>
                entry.GetProperty("action").GetString() == "auth.login"));
        Assert.Equal(2, all.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Operations_FilterByResult_TreatsAnOperationAsSuccessfulOnlyWhenEveryWriteSucceeded()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        // 一次操作里一条成功、一条失败（不是数组）
        (await admin.SendAsync(StoreWrite("customer-req:结果客户", """[{"id":1}]""", "op-mixed-0001", "保存结果客户"))).EnsureSuccessStatusCode();
        var failed = await admin.SendAsync(StoreWrite("customer-proc:结果客户", """{"not":"array"}""", "op-mixed-0001", "保存结果客户"));
        Assert.Equal(HttpStatusCode.BadRequest, failed.StatusCode);
        (await admin.SendAsync(StoreWrite("customer-req:结果客户", """[{"id":2}]""", "op-clean-0002", "全部成功"))).EnsureSuccessStatusCode();

        var succeeded = await admin.GetFromJsonAsync<JsonElement>("/api/audit-logs/operations?hideLogin=true&result=true");
        var labels = succeeded.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("label").GetString()).ToArray();
        Assert.Contains("全部成功", labels);
        Assert.DoesNotContain("保存结果客户", labels);
        Assert.All(succeeded.GetProperty("items").EnumerateArray(), item => Assert.True(item.GetProperty("result").GetBoolean()));

        var failures = await admin.GetFromJsonAsync<JsonElement>("/api/audit-logs/operations?hideLogin=true&result=false");
        var mixed = Assert.Single(failures.GetProperty("items").EnumerateArray());
        Assert.Equal("保存结果客户", mixed.GetProperty("label").GetString());
        Assert.False(mixed.GetProperty("result").GetBoolean());
        Assert.Equal(2, mixed.GetProperty("entryCount").GetInt32());
    }

    [Theory]
    [InlineData("删除机型「04 特殊定位」", "删除机型")]
    [InlineData("新增选型记录 · 机型A", "新增选型记录")]
    [InlineData("编辑区域「华东」→「华南」", "编辑区域")]
    [InlineData("新建 Tab「输送」", "新建 Tab")]
    [InlineData("删除 Sensor 型号", "删除 Sensor 型号")]
    [InlineData("  ", null)]
    [InlineData(null, null)]
    public void OperationKind_DropsTheObjectFromTheLabel(string? label, string? kind)
    {
        Assert.Equal(kind, AuditLogService.OperationKindOf(label));
    }

    [Fact]
    public async Task Operations_FilterByKind_FallingBackToActionWithoutLabel()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        (await admin.SendAsync(StoreWrite(
            "customer-req:类型客户",
            """[{"id":1,"content":"A"}]""",
            "op-kind-0001",
            "新增客户通用要求 · 类型客户"))).EnsureSuccessStatusCode();
        (await admin.SendAsync(StoreWrite(
            "customer-req:类型客户",
            """[{"id":1,"content":"B"}]""",
            "op-kind-0002",
            "编辑客户通用要求 · 类型客户"))).EnsureSuccessStatusCode();

        var kinds = await admin.GetFromJsonAsync<string[]>("/api/audit-logs/operations/kinds");
        Assert.Contains("新增客户通用要求", kinds!);
        Assert.Contains("编辑客户通用要求", kinds!);
        // 登录没有操作名称，按操作码出现
        Assert.Contains("auth.login", kinds!);

        var edited = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/audit-logs/operations?kind={Uri.EscapeDataString("编辑客户通用要求")}");
        Assert.Equal(1, edited.GetProperty("total").GetInt32());
        Assert.Equal("编辑客户通用要求 · 类型客户", edited.GetProperty("items")[0].GetProperty("label").GetString());

        var logins = await admin.GetFromJsonAsync<JsonElement>("/api/audit-logs/operations?kind=auth.login");
        Assert.All(logins.GetProperty("items").EnumerateArray(), item =>
            Assert.Equal("auth.login", item.GetProperty("entries")[0].GetProperty("action").GetString()));
        Assert.True(logins.GetProperty("total").GetInt32() >= 1);
    }

    [Fact]
    public async Task RoleUpdate_RecordsPermissionsBeforeAndAfter()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);
        var permissions = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/roles/permissions");
        int PermissionId(string code) => permissions.EnumerateArray()
            .First(item => item.GetProperty("code").GetString() == code).GetProperty("id").GetInt32();

        var created = await admin.PostAsJsonAsync(
            "/api/rbac/roles",
            new { code = "audit_diff", name = "审计比对", permissionIds = new[] { PermissionId("selection:read") } });
        var roleId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        (await admin.PutAsJsonAsync(
            $"/api/rbac/roles/{roleId}",
            new { name = "审计比对", permissionIds = new[] { PermissionId("selection:read"), PermissionId("selection:write") } }))
            .EnsureSuccessStatusCode();

        var page = await QueryAuditLogsAsync(admin, "?action=role.update");
        var changes = JsonDocument.Parse(page.GetProperty("items")[0].GetProperty("changes").GetString()!).RootElement;
        var field = changes.GetProperty("modified")[0].GetProperty("fields")[0];
        Assert.Equal("权限", field.GetProperty("name").GetString());
        Assert.Equal("查看业务数据", field.GetProperty("before").GetString());
        Assert.Equal("查看业务数据、编辑业务数据", field.GetProperty("after").GetString());
    }

    [Fact]
    public async Task UserWithoutAuditPermission_ReadAuditLogs_Returns403()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        // 建一个只有业务读写的 editor 用户
        var roles = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/roles");
        var editorRoleId = roles.EnumerateArray()
            .First(role => role.GetProperty("code").GetString() == "editor")
            .GetProperty("id").GetInt32();
        var create = await admin.PostAsJsonAsync(
            "/api/rbac/users",
            new
            {
                username = "editor_user",
                password = "pass123456",
                displayName = "编辑用户",
                roleIds = new[] { editorRoleId },
            });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);

        using var login = factory.CreateClient();
        var token = await LoginTokenAsync(login, "editor_user", "pass123456");
        using var editor = CreateAuthorizedClient(factory, token);

        var response = await editor.GetAsync("/api/audit-logs");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("无权限执行此操作", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task AuditLogs_PaginationAndFilters()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        // 制造 5 条 store.upsert 记录
        for (var i = 0; i < 5; i++)
        {
            var write = await admin.PutAsJsonAsync(
                StoreRoute($"customer-req:客户{i}"),
                JsonSerializer.Deserialize<JsonElement>("[{\"id\":1}]"));
            Assert.Equal(HttpStatusCode.OK, write.StatusCode);
        }

        // pageSize 取 2
        var page1 = await QueryAuditLogsAsync(admin, "?action=store.upsert&page=1&pageSize=2");
        Assert.Equal(5, page1.GetProperty("total").GetInt32());
        Assert.Equal(2, page1.GetProperty("items").EnumerateArray().Count());

        // 第 3 页只剩 1 条
        var page3 = await QueryAuditLogsAsync(admin, "?action=store.upsert&page=3&pageSize=2");
        Assert.Single(page3.GetProperty("items").EnumerateArray());

        // 按目标筛选（URL 编码中文 key）
        var filtered = await QueryAuditLogsAsync(
            admin,
            $"?action=store.upsert&pageSize=10&target={Uri.EscapeDataString("customer-req:客户1")}");
        Assert.Equal(1, filtered.GetProperty("total").GetInt32());
        Assert.Equal("customer-req:客户1",
            filtered.GetProperty("items")[0].GetProperty("target").GetString());
    }

    [Fact]
    public async Task Query_SortsAcrossThePagedResultSet_NotJustOnePage()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        for (var i = 1; i <= 5; i++)
        {
            var write = await admin.PutAsJsonAsync(
                StoreRoute($"customer-req:排序{i}"),
                JsonSerializer.Deserialize<JsonElement>("[{\"id\":1}]"));
            Assert.Equal(HttpStatusCode.OK, write.StatusCode);
        }

        // 默认时间倒序：第一页第一条是最后写入的那次。
        var newestFirst = await QueryAuditLogsAsync(
            admin,
            "?action=store.upsert&page=1&pageSize=1");
        Assert.Equal(
            "customer-req:排序5",
            newestFirst.GetProperty("items")[0].GetProperty("target").GetString());

        // 升序：第一页第一条必须是整个结果集里最旧的那条，而不是
        // 「把倒序的第一页那一条就地翻转」得到的结果。
        var oldestFirst = await QueryAuditLogsAsync(
            admin,
            "?action=store.upsert&page=1&pageSize=1&sort=timestamp&direction=asc");
        Assert.Equal(
            "customer-req:排序1",
            oldestFirst.GetProperty("items")[0].GetProperty("target").GetString());

        // 未知列回落到默认时间倒序，不报错也不返回乱序。
        var unknownColumn = await QueryAuditLogsAsync(
            admin,
            "?action=store.upsert&page=1&pageSize=1&sort=drop%20table&direction=asc");
        Assert.Equal(
            "customer-req:排序1",
            unknownColumn.GetProperty("items")[0].GetProperty("target").GetString());
    }

    [Fact]
    public async Task Query_SortsByUsernameAcrossPages()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);
        using var anon = factory.CreateClient();

        // 匿名登录失败会写入一条 username 为 zzz_last 的日志。
        var failed = await anon.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "zzz_last", password = "wrong-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);

        var ascending = await QueryAuditLogsAsync(
            admin,
            "?action=auth.login&pageSize=50&sort=username&direction=asc");
        var names = ascending.GetProperty("items")
            .EnumerateArray()
            .Select(item => item.GetProperty("username").GetString())
            .ToArray();

        Assert.Equal(names.OrderBy(name => name, StringComparer.Ordinal), names);
    }
}
