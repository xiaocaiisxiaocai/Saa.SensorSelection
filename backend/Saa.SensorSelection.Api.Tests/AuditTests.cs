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
        Assert.Contains("权限：", successEntry.GetProperty("detail").GetString());
        // TestServer 没有真实 socket 地址，生产 Kestrel 的 ::1/映射地址由
        // AuditLogService.NormalizeIp 统一转为 127.0.0.1；此处只防止回归为 ::1。
        Assert.NotEqual("::1", successEntry.GetProperty("ip").GetString());
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
    public async Task StoreWrite_SuccessAndValidationFailure_WriteAuditEntries()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        // 成功写入
        var write = await admin.PutAsJsonAsync(
            "/api/store/customer-req:测试客户",
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":1,\"name\":\"测试\"}]"));
        Assert.Equal(HttpStatusCode.OK, write.StatusCode);

        // 校验失败写入（非数组）→ 400，仍要记失败审计
        var invalid = await admin.PutAsJsonAsync(
            "/api/store/customer-req:测试客户",
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
            "/api/store/customer-req:待删除",
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":1}]"));
        var deleted = await admin.DeleteAsync("/api/store/customer-req:待删除");
        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);

        // 删除不存在的 key → 404，也记失败
        var missing = await admin.DeleteAsync("/api/store/customer-req:不存在");
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
            new { name = "审计部", level = "部门" });
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
        Assert.Contains(entries, item =>
            item.GetProperty("action").GetString() == "org.create" &&
            item.GetProperty("target").GetString() == "审计部" &&
            item.GetProperty("detail").GetString() == "层级：部门；父级：无；排序：0；子级：0；用户：0");
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
                $"/api/store/customer-req:客户{i}",
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
}
