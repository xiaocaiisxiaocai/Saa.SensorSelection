using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

using Microsoft.Data.Sqlite;

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

    [Fact]
    public async Task Seeder_AddsFileDownloadToExistingAdmin_AndNotToEditorOrViewer()
    {
        var dbPath = Path.Combine(
            Path.GetTempPath(),
            $"saa-sensor-selection-api-file-download-{Guid.NewGuid():N}.db");
        try
        {
            await using (var first = new ApiFactory(dbPath))
            {
                using var client = first.CreateClient();
                var login = await client.PostAsJsonAsync(
                    "/api/auth/login",
                    new { username = "admin", password = "admin123" });
                Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            }

            await using (var connection = new SqliteConnection($"Data Source={dbPath};Pooling=False"))
            {
                await connection.OpenAsync();
                var command = connection.CreateCommand();
                command.CommandText =
                    """
                    DELETE FROM PermissionRole
                    WHERE PermissionsId IN (SELECT Id FROM Permissions WHERE Code = 'file:download');
                    DELETE FROM Permissions WHERE Code = 'file:download';
                    """;
                await command.ExecuteNonQueryAsync();
            }

            await using var second = new ApiFactory(dbPath);
            using var client2 = second.CreateClient();
            var response = await client2.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "admin", password = "admin123" });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            var loginPermissions = body.GetProperty("permissions")
                .EnumerateArray()
                .Select(item => item.GetString())
                .ToArray();
            Assert.Contains("file:download", loginPermissions);

            client2.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                body.GetProperty("token").GetString());
            var roles = await client2.GetFromJsonAsync<JsonElement>("/api/rbac/roles");
            foreach (var role in roles.EnumerateArray())
            {
                var codes = role.GetProperty("permissions")
                    .EnumerateArray()
                    .Select(item => item.GetProperty("code").GetString())
                    .ToArray();
                var roleCode = role.GetProperty("code").GetString();
                if (roleCode == "admin")
                {
                    Assert.Contains("file:download", codes);
                }
                else if (roleCode is "editor" or "viewer")
                {
                    Assert.DoesNotContain("file:download", codes);
                }
            }

            var catalogue = await client2.GetFromJsonAsync<JsonElement>("/api/rbac/roles/permissions");
            var listed = catalogue.EnumerateArray().ToArray();
            var codesInOrder = listed.Select(item => item.GetProperty("code").GetString()).ToArray();
            var writeIndex = Array.IndexOf(codesInOrder, "selection:write");
            Assert.Equal("file:download", codesInOrder[writeIndex + 1]);
            var permission = listed.Single(item => item.GetProperty("code").GetString() == "file:download");
            Assert.Equal("下载文件", permission.GetProperty("name").GetString());
            Assert.Equal("业务", permission.GetProperty("module").GetString());
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

    [Fact]
    public async Task Seeder_AddsDataTransferToExistingAdmin_AndNotToEditorOrViewer()
    {
        var dbPath = Path.Combine(
            Path.GetTempPath(),
            $"saa-sensor-selection-api-data-transfer-{Guid.NewGuid():N}.db");
        try
        {
            await using (var first = new ApiFactory(dbPath))
            {
                using var client = first.CreateClient();
                var login = await client.PostAsJsonAsync(
                    "/api/auth/login",
                    new { username = "admin", password = "admin123" });
                Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            }

            await using (var connection = new SqliteConnection($"Data Source={dbPath};Pooling=False"))
            {
                await connection.OpenAsync();
                var command = connection.CreateCommand();
                command.CommandText =
                    """
                    DELETE FROM PermissionRole
                    WHERE PermissionsId IN (SELECT Id FROM Permissions WHERE Code = 'data:transfer');
                    DELETE FROM Permissions WHERE Code = 'data:transfer';
                    """;
                await command.ExecuteNonQueryAsync();
            }

            await using var second = new ApiFactory(dbPath);
            using var client2 = second.CreateClient();
            var response = await client2.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "admin", password = "admin123" });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            var loginPermissions = body.GetProperty("permissions")
                .EnumerateArray()
                .Select(item => item.GetString())
                .ToArray();
            Assert.Contains("data:transfer", loginPermissions);

            client2.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                body.GetProperty("token").GetString());
            var roles = await client2.GetFromJsonAsync<JsonElement>("/api/rbac/roles");
            foreach (var role in roles.EnumerateArray())
            {
                var codes = role.GetProperty("permissions")
                    .EnumerateArray()
                    .Select(item => item.GetProperty("code").GetString())
                    .ToArray();
                var roleCode = role.GetProperty("code").GetString();
                if (roleCode == "admin")
                {
                    Assert.Contains("data:transfer", codes);
                }
                else if (roleCode is "editor" or "viewer")
                {
                    Assert.DoesNotContain("data:transfer", codes);
                }
            }

            var catalogue = await client2.GetFromJsonAsync<JsonElement>("/api/rbac/roles/permissions");
            var listed = catalogue.EnumerateArray().ToArray();
            var codesInOrder = listed.Select(item => item.GetProperty("code").GetString()).ToArray();
            var downloadIndex = Array.IndexOf(codesInOrder, "file:download");
            Assert.Equal("data:transfer", codesInOrder[downloadIndex + 1]);
            var permission = listed.Single(item => item.GetProperty("code").GetString() == "data:transfer");
            Assert.Equal("导入导出数据", permission.GetProperty("name").GetString());
            Assert.Equal("业务", permission.GetProperty("module").GetString());
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

    [Fact]
    public async Task Restart_DoesNotRestoreDeletedSeedAdminOrRevokedEditorPermission()
    {
        var dbPath = Path.Combine(
            Path.GetTempPath(),
            $"saa-sensor-selection-api-seed-lifecycle-{Guid.NewGuid():N}.db");
        try
        {
            await using (var first = new ApiFactory(dbPath))
            {
                using var admin = first.CreateClient();
                var login = await admin.PostAsJsonAsync(
                    "/api/auth/login",
                    new { username = "admin", password = "admin123" });
                login.EnsureSuccessStatusCode();
                var loginBody = await login.Content.ReadFromJsonAsync<JsonElement>();
                admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                    "Bearer",
                    loginBody.GetProperty("token").GetString());

                var roles = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/roles");
                var adminRoleId = roles.EnumerateArray()
                    .Single(role => role.GetProperty("code").GetString() == "admin")
                    .GetProperty("id").GetInt32();
                var editorRoleId = roles.EnumerateArray()
                    .Single(role => role.GetProperty("code").GetString() == "editor")
                    .GetProperty("id").GetInt32();
                var permissions = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/roles/permissions");
                var readPermissionId = permissions.EnumerateArray()
                    .Single(permission => permission.GetProperty("code").GetString() == "selection:read")
                    .GetProperty("id").GetInt32();

                var revokeEditorWrite = await admin.PutAsJsonAsync(
                    $"/api/rbac/roles/{editorRoleId}",
                    new
                    {
                        name = "业务维护员",
                        description = "已撤销写入权限",
                        permissionIds = new[] { readPermissionId },
                    });
                revokeEditorWrite.EnsureSuccessStatusCode();

                var createSecond = await admin.PostAsJsonAsync(
                    "/api/rbac/users",
                    new
                    {
                        username = "persistent-admin",
                        password = "persistent-password",
                        displayName = "持久管理员",
                        roleIds = new[] { adminRoleId },
                    });
                createSecond.EnsureSuccessStatusCode();

                using var secondAdmin = first.CreateClient();
                var secondLogin = await secondAdmin.PostAsJsonAsync(
                    "/api/auth/login",
                    new { username = "persistent-admin", password = "persistent-password" });
                secondLogin.EnsureSuccessStatusCode();
                var secondBody = await secondLogin.Content.ReadFromJsonAsync<JsonElement>();
                secondAdmin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                    "Bearer",
                    secondBody.GetProperty("token").GetString());
                var users = await secondAdmin.GetFromJsonAsync<JsonElement>("/api/rbac/users");
                var seedAdminId = users.EnumerateArray()
                    .Single(user => user.GetProperty("username").GetString() == "admin")
                    .GetProperty("id").GetInt32();
                var deleteSeedAdmin = await secondAdmin.DeleteAsync($"/api/rbac/users/{seedAdminId}");
                deleteSeedAdmin.EnsureSuccessStatusCode();
            }

            await using var restarted = new ApiFactory(dbPath);
            using var client = restarted.CreateClient();
            var deletedAdminLogin = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "admin", password = "admin123" });
            Assert.Equal(HttpStatusCode.Unauthorized, deletedAdminLogin.StatusCode);

            var persistentLogin = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { username = "persistent-admin", password = "persistent-password" });
            persistentLogin.EnsureSuccessStatusCode();
            var persistentBody = await persistentLogin.Content.ReadFromJsonAsync<JsonElement>();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                persistentBody.GetProperty("token").GetString());
            var rolesAfterRestart = await client.GetFromJsonAsync<JsonElement>("/api/rbac/roles");
            var editorPermissions = rolesAfterRestart.EnumerateArray()
                .Single(role => role.GetProperty("code").GetString() == "editor")
                .GetProperty("permissions")
                .EnumerateArray()
                .Select(permission => permission.GetProperty("code").GetString())
                .ToArray();
            Assert.Contains("selection:read", editorPermissions);
            Assert.DoesNotContain("selection:write", editorPermissions);
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
                    // 文件可能仍被进程短暂占用，忽略即可
                }
            }
        }
    }
}
