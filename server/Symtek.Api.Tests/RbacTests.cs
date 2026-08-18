using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Symtek.Api.Tests;

public class RbacTests
{
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

    private static async Task<int> CreateUserAsync(
        HttpClient client,
        string username,
        string password = "pass123456",
        bool isActive = true,
        int[]? roleIds = null,
        int? orgUnitId = null)
    {
        var response = await client.PostAsJsonAsync(
            "/api/rbac/users",
            new
            {
                username,
                password,
                displayName = $"用户-{username}",
                isActive,
                roleIds,
                orgUnitId,
            });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("id").GetInt32();
    }

    private static async Task<int> GetRoleIdAsync(HttpClient client, string code)
    {
        var roles = await client.GetFromJsonAsync<JsonElement>("/api/rbac/roles");
        foreach (var role in roles.EnumerateArray())
        {
            if (role.GetProperty("code").GetString() == code)
            {
                return role.GetProperty("id").GetInt32();
            }
        }
        throw new InvalidOperationException($"角色 {code} 未找到");
    }

    [Fact]
    public async Task Login_ReturnsProfileWithRolesAndPermissions()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "admin", password = "admin123" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        var roles = body.GetProperty("roles").EnumerateArray().ToArray();
        Assert.Contains(roles, role => role.GetProperty("code").GetString() == "admin");

        var permissions = body.GetProperty("permissions")
            .EnumerateArray()
            .Select(item => item.GetString())
            .ToArray();
        Assert.Contains("selection:read", permissions);
        Assert.Contains("selection:write", permissions);
        Assert.Contains("rbac:view", permissions);
        Assert.Contains("rbac:user:write", permissions);
    }

    [Fact]
    public async Task Me_ReturnsCurrentUserProfile()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateAdminClientAsync(factory);

        var response = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("admin", body.GetProperty("username").GetString());
        Assert.Contains(
            body.GetProperty("permissions").EnumerateArray(),
            item => item.GetString() == "rbac:view");
    }

    [Fact]
    public async Task Viewer_CanReadStore_ButWriteReturns403()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);
        var viewerRoleId = await GetRoleIdAsync(admin, "viewer");
        await CreateUserAsync(admin, "zhangsan", roleIds: [viewerRoleId]);

        // viewer 登录
        using var login = factory.CreateClient();
        var viewerToken = await LoginTokenAsync(login, "zhangsan", "pass123456");
        using var viewer = CreateAuthorizedClient(factory, viewerToken);

        // 读：200
        var read = await viewer.GetAsync("/api/store");
        Assert.Equal(HttpStatusCode.OK, read.StatusCode);

        // 写：403 + JSON 提示（不应是登录失效）
        var write = await viewer.PutAsJsonAsync(
            "/api/store/customer-req:测试",
            JsonSerializer.Deserialize<JsonElement>("[{\"id\":1}]"));
        Assert.Equal(HttpStatusCode.Forbidden, write.StatusCode);
        var body = await write.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("无权限执行此操作", body.GetProperty("message").GetString());

        // 删除：403
        var delete = await viewer.DeleteAsync("/api/store/customer-req:测试");
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);

        // RBAC 管理接口：403
        var rbac = await viewer.GetAsync("/api/rbac/users");
        Assert.Equal(HttpStatusCode.Forbidden, rbac.StatusCode);
    }

    [Fact]
    public async Task User_Manage_Flow()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);
        var viewerRoleId = await GetRoleIdAsync(admin, "viewer");
        var editorRoleId = await GetRoleIdAsync(admin, "editor");

        // 创建组织
        var orgResponse = await admin.PostAsJsonAsync(
            "/api/rbac/org-units",
            new { name = "制造事业部", level = "事业部" });
        Assert.Equal(HttpStatusCode.OK, orgResponse.StatusCode);
        var orgId = (await orgResponse.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        // 创建用户（挂组织 + viewer 角色）
        var userId = await CreateUserAsync(
            admin, "lisi", roleIds: [viewerRoleId], orgUnitId: orgId);
        Assert.True(userId > 0);

        // 重复用户名 → 400
        var duplicate = await admin.PostAsJsonAsync(
            "/api/rbac/users",
            new { username = "lisi", password = "pass123456", displayName = "重复" });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        // 更新：改为 editor 角色
        var update = await admin.PutAsJsonAsync(
            $"/api/rbac/users/{userId}",
            new { displayName = "李四", isActive = true, roleIds = new[] { editorRoleId }, orgUnitId = orgId });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = await update.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("李四", updated.GetProperty("displayName").GetString());
        var updatedRoles = updated.GetProperty("roles").EnumerateArray().ToArray();
        Assert.Contains(updatedRoles, role => role.GetProperty("code").GetString() == "editor");

        // 重置密码 → 新密码可登录
        var reset = await admin.PutAsJsonAsync(
            $"/api/rbac/users/{userId}/password",
            new { password = "newpass123" });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        using var login = factory.CreateClient();
        var newLogin = await login.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "lisi", password = "newpass123" });
        Assert.Equal(HttpStatusCode.OK, newLogin.StatusCode);

        // 删除用户
        var delete = await admin.DeleteAsync($"/api/rbac/users/{userId}");
        Assert.Equal(HttpStatusCode.OK, delete.StatusCode);
    }

    [Fact]
    public async Task User_DeactivatingLastAdmin_IsRejected()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        var users = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/users");
        var adminUser = users.EnumerateArray().First(item =>
            item.GetProperty("username").GetString() == "admin");
        var adminId = adminUser.GetProperty("id").GetInt32();

        // 停用唯一的管理员 → 400
        var update = await admin.PutAsJsonAsync(
            $"/api/rbac/users/{adminId}",
            new { displayName = "管理员", isActive = false });
        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);
        var body = await update.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("至少保留一名系统管理员", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task InactiveUser_CannotLogin()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);
        var viewerRoleId = await GetRoleIdAsync(admin, "viewer");
        var userId = await CreateUserAsync(
            admin, "wangwu", roleIds: [viewerRoleId], isActive: false);

        using var login = factory.CreateClient();
        var response = await login.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "wangwu", password = "pass123456" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("账号已停用，请联系管理员", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Role_Manage_Flow()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        // 系统内置角色不可删除
        var roles = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/roles");
        var adminRole = roles.EnumerateArray().First(item =>
            item.GetProperty("code").GetString() == "admin");
        var deleteSystem = await admin.DeleteAsync(
            $"/api/rbac/roles/{adminRole.GetProperty("id").GetInt32()}");
        Assert.Equal(HttpStatusCode.BadRequest, deleteSystem.StatusCode);

        // 创建自定义角色（带 selection:read 权限）
        var permissions = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/roles/permissions");
        var readPermission = permissions.EnumerateArray().First(item =>
            item.GetProperty("code").GetString() == "selection:read");
        var create = await admin.PostAsJsonAsync(
            "/api/rbac/roles",
            new
            {
                code = "temp_reader",
                name = "临时只读",
                description = "测试角色",
                permissionIds = new[] { readPermission.GetProperty("id").GetInt32() },
            });
        Assert.Equal(HttpStatusCode.OK, create.StatusCode);
        var roleId = (await create.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        // 重复 code → 400
        var duplicate = await admin.PostAsJsonAsync(
            "/api/rbac/roles",
            new { code = "temp_reader", name = "重复" });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        // 更新名称
        var update = await admin.PutAsJsonAsync(
            $"/api/rbac/roles/{roleId}",
            new { name = "临时只读-改", description = "测试", permissionIds = new[] { readPermission.GetProperty("id").GetInt32() } });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        // 删除
        var delete = await admin.DeleteAsync($"/api/rbac/roles/{roleId}");
        Assert.Equal(HttpStatusCode.OK, delete.StatusCode);
    }

    [Fact]
    public async Task Role_AssignedToUser_CannotBeDeleted()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);
        var viewerRoleId = await GetRoleIdAsync(admin, "viewer");
        await CreateUserAsync(admin, "zhaoliu", roleIds: [viewerRoleId]);

        var delete = await admin.DeleteAsync($"/api/rbac/roles/{viewerRoleId}");
        Assert.Equal(HttpStatusCode.BadRequest, delete.StatusCode);
        var body = await delete.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("该角色已分配给用户，请先移除后再删除", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task OrgUnit_Manage_Flow_SupportsSkipLevel()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateAdminClientAsync(factory);

        // 事业部 → 课别（跳级，不建部门）
        var division = await admin.PostAsJsonAsync(
            "/api/rbac/org-units",
            new { name = "电控事业部", level = "事业部" });
        var divisionId = (await division.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        var section = await admin.PostAsJsonAsync(
            "/api/rbac/org-units",
            new { name = "选型课", level = "课别", parentId = divisionId });
        Assert.Equal(HttpStatusCode.OK, section.StatusCode);
        var sectionId = (await section.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetInt32();

        // 部门挂在课别下（任意层级）
        var department = await admin.PostAsJsonAsync(
            "/api/rbac/org-units",
            new { name = "标准件组", level = "部门", parentId = sectionId });
        Assert.Equal(HttpStatusCode.OK, department.StatusCode);

        // 列表返回层级信息
        var list = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/org-units");
        var divisionNode = list.EnumerateArray().First(item =>
            item.GetProperty("id").GetInt32() == divisionId);
        Assert.Equal(1, divisionNode.GetProperty("childCount").GetInt32());

        // 有子级不可删除
        var deleteParent = await admin.DeleteAsync($"/api/rbac/org-units/{divisionId}");
        Assert.Equal(HttpStatusCode.BadRequest, deleteParent.StatusCode);

        // 环检测：把事业部挂到自己的孙节点下 → 400
        var cycle = await admin.PutAsJsonAsync(
            $"/api/rbac/org-units/{divisionId}",
            new { name = "电控事业部", level = "事业部", parentId = sectionId });
        Assert.Equal(HttpStatusCode.BadRequest, cycle.StatusCode);

        // 先删子级再删父级（删叶后其父可能成为新叶，循环直到只剩事业部）
        for (var i = 0; i < 10; i++)
        {
            var current = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/org-units");
            var nodes = current.EnumerateArray().ToArray();
            if (nodes.Length <= 1)
            {
                break;
            }
            var leaves = nodes
                .Where(item =>
                    item.GetProperty("childCount").GetInt32() == 0 &&
                    item.GetProperty("id").GetInt32() != divisionId)
                .ToArray();
            foreach (var node in leaves)
            {
                var deleted = await admin.DeleteAsync(
                    $"/api/rbac/org-units/{node.GetProperty("id").GetInt32()}");
                Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
            }
        }
        var finalDelete = await admin.DeleteAsync($"/api/rbac/org-units/{divisionId}");
        Assert.Equal(HttpStatusCode.OK, finalDelete.StatusCode);
    }
}
