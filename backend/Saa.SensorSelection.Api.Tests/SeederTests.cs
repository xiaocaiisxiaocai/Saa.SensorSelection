using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Saa.SensorSelection.Api.Tests;

public class SeederTests
{
    [Fact]
    public async Task Seeder_CreatesDefaultOrganizationHierarchy()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "admin", password = "admin123" });
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            body.GetProperty("token").GetString());

        var orgs = await client.GetFromJsonAsync<JsonElement>("/api/rbac/org-units");
        var nodes = orgs.EnumerateArray().ToDictionary(
            item => item.GetProperty("name").GetString()!,
            item => item);

        Assert.Equal(3, nodes.Count);
        Assert.Equal("事业部", nodes["制造事业部"].GetProperty("level").GetString());
        Assert.Null(nodes["制造事业部"].GetProperty("parentId").GetString());
        Assert.Equal("部门", nodes["标准件组"].GetProperty("level").GetString());
        Assert.Equal(
            nodes["制造事业部"].GetProperty("id").GetInt32(),
            nodes["标准件组"].GetProperty("parentId").GetInt32());
        Assert.Equal("课别", nodes["选型课"].GetProperty("level").GetString());
        Assert.Equal(
            nodes["标准件组"].GetProperty("id").GetInt32(),
            nodes["选型课"].GetProperty("parentId").GetInt32());
    }

    [Fact]
    public async Task Seeder_IsIdempotent_AcrossRestartsOnSameDatabase()
    {
        // 使用同一个数据库文件启动两次（模拟服务重启），种子必须幂等：
        // 已存在的角色只补缺不重复，RolePermission/UserRole 不产生唯一键冲突。
        var dbPath = Path.Combine(
            Path.GetTempPath(),
            $"saa-sensor-selection-api-seeder-{Guid.NewGuid():N}.db");
        try
        {
            await using (var first = new ApiFactory(dbPath))
            {
                using var client = first.CreateClient();
                var login = await client.PostAsJsonAsync(
                    "/api/auth/login",
                    new { username = "admin", password = "admin123" });
                Assert.Equal(HttpStatusCode.OK, login.StatusCode);
                var body = await login.Content.ReadFromJsonAsync<JsonElement>();
                Assert.Contains(
                    body.GetProperty("permissions").EnumerateArray(),
                    item => item.GetString() == "selection:read");
            }

            // 第二次启动同一数据库：EnsureSeeded 走“已存在”分支，不能抛异常
            await using var second = new ApiFactory(dbPath);
            using var client2 = second.CreateClient();
            var response = await client2.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "admin", password = "admin123" });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body2 = await response.Content.ReadFromJsonAsync<JsonElement>();
            var roles = body2.GetProperty("roles").EnumerateArray().ToArray();
            Assert.Contains(roles, role => role.GetProperty("code").GetString() == "admin");
        }
        finally
        {
            foreach (var suffix in new[] { string.Empty, "-wal", "-shm" })
            {
                try
                {
                    if (File.Exists(dbPath + suffix))
                    {
                        File.Delete(dbPath + suffix);
                    }
                }
                catch (IOException)
                {
                    // 忽略文件占用
                }
            }
        }
    }
}
