using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using Microsoft.Data.Sqlite;

namespace Saa.SensorSelection.Api.Tests;

public class StoredFileTests
{
    private static string StoreRoute(string key) =>
        $"/api/store/by-key?key={Uri.EscapeDataString(key)}";

    private static async Task<HttpClient> CreateLoggedInClientAsync(ApiFactory factory)
    {
        using var login = factory.CreateClient();
        var response = await login.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "admin", password = "admin123" });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", body.GetProperty("token").GetString());
        return client;
    }

    [Fact]
    public async Task Store_FilePayload_IsDetachedAndLoadedOnlyFromFileEndpoint()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);
        var originalBytes = Encoding.UTF8.GetBytes("%PDF-1.7\nroot-cause-regression");
        var dataUrl = $"data:application/pdf;base64,{Convert.ToBase64String(originalBytes)}";
        var key = "sensor-sop:detached-file-test";
        var route = StoreRoute(key);

        var saved = await client.PutAsJsonAsync(route, new[]
        {
            new
            {
                id = 1,
                title = "按需加载测试",
                fileName = "按需加载测试.pdf",
                mimeType = "application/pdf",
                size = originalBytes.Length,
                dataUrl,
            },
        });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var storeResponse = await client.GetAsync("/api/store");
        storeResponse.EnsureSuccessStatusCode();
        var storeJson = await storeResponse.Content.ReadAsStringAsync();
        Assert.DoesNotContain("base64", storeJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Convert.ToBase64String(originalBytes), storeJson, StringComparison.Ordinal);

        var store = JsonSerializer.Deserialize<JsonElement>(storeJson);
        var storedFile = store.GetProperty(key)[0];
        var contentUrl = storedFile.GetProperty("dataUrl").GetString();
        Assert.Matches("^/api/files/[0-9a-f-]{36}/content$", contentUrl);
        Assert.Equal(36, storedFile.GetProperty("fileId").GetString()?.Length);

        using var anonymous = factory.CreateClient();
        var content = await anonymous.GetAsync(contentUrl);
        Assert.Equal(HttpStatusCode.OK, content.StatusCode);
        Assert.Equal("application/pdf", content.Content.Headers.ContentType?.MediaType);
        Assert.Equal(originalBytes, await content.Content.ReadAsByteArrayAsync());

        var replaced = await client.PutAsJsonAsync(route, Array.Empty<object>());
        Assert.Equal(HttpStatusCode.OK, replaced.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(contentUrl)).StatusCode);
    }

    private static async Task<HttpResponseMessage> UploadAsync(
        HttpClient client,
        byte[] bytes,
        string fileName = "上传测试.pdf",
        string mimeType = "application/pdf")
    {
        using var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(mimeType);
        form.Add(content, "file", fileName);
        return await client.PostAsync("/api/files", form);
    }

    [Fact]
    public async Task Upload_Multipart_IsStoredAndServedWithRangeSupport()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);
        var bytes = Encoding.UTF8.GetBytes("%PDF-1.7\nmultipart-upload-regression");

        var uploaded = await UploadAsync(client, bytes);
        Assert.Equal(HttpStatusCode.OK, uploaded.StatusCode);
        var body = await uploaded.Content.ReadFromJsonAsync<JsonElement>();
        var contentUrl = body.GetProperty("dataUrl").GetString();
        Assert.Matches("^/api/files/[0-9a-f-]{36}/content$", contentUrl);
        Assert.Equal("上传测试.pdf", body.GetProperty("fileName").GetString());
        Assert.Equal("application/pdf", body.GetProperty("mimeType").GetString());
        Assert.Equal(bytes.Length, body.GetProperty("size").GetInt64());

        using var anonymous = factory.CreateClient();
        var content = await anonymous.GetAsync(contentUrl);
        Assert.Equal(HttpStatusCode.OK, content.StatusCode);
        Assert.Equal(bytes, await content.Content.ReadAsByteArrayAsync());

        using var rangeRequest = new HttpRequestMessage(HttpMethod.Get, contentUrl);
        rangeRequest.Headers.Range = new RangeHeaderValue(0, 7);
        var partial = await anonymous.SendAsync(rangeRequest);
        Assert.Equal(HttpStatusCode.PartialContent, partial.StatusCode);
        Assert.Equal(bytes[..8], await partial.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Upload_RequiresWritePermissionAndNonEmptyFile()
    {
        await using var factory = new ApiFactory();
        using var anonymous = factory.CreateClient();
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await UploadAsync(anonymous, Encoding.UTF8.GetBytes("x"))).StatusCode);

        using var client = await CreateLoggedInClientAsync(factory);
        Assert.Equal(HttpStatusCode.BadRequest, (await UploadAsync(client, [])).StatusCode);
    }

    [Fact]
    public async Task Upload_PendingFileSurvivesUnrelatedWritesUntilReferencedAndReleased()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);
        var bytes = Encoding.UTF8.GetBytes("%PDF-1.7\npending-upload");
        var uploaded = await (await UploadAsync(client, bytes)).Content.ReadFromJsonAsync<JsonElement>();
        var contentUrl = uploaded.GetProperty("dataUrl").GetString()!;
        var fileId = uploaded.GetProperty("fileId").GetString()!;
        using var anonymous = factory.CreateClient();

        // 上传完成、尚未写入 Store 之前的其他写入，不能把这个文件当孤儿删掉。
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.PutAsJsonAsync(StoreRoute("sensor-sop:unrelated"), Array.Empty<object>())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(contentUrl)).StatusCode);

        var item = new
        {
            id = 1,
            fileName = "共享.pdf",
            mimeType = "application/pdf",
            size = bytes.Length,
            fileId,
            dataUrl = contentUrl,
        };
        var first = StoreRoute("customer-sop:共享A");
        var second = StoreRoute("customer-sop:共享B");
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(first, new[] { item })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(second, new[] { item })).StatusCode);

        // 仍被另一个 key 引用时不能删除。
        Assert.Equal(HttpStatusCode.OK, (await client.DeleteAsync(first)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(contentUrl)).StatusCode);

        // 最后一个引用移除后立即清理。
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(second, Array.Empty<object>())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(contentUrl)).StatusCode);
    }

    [Fact]
    public async Task Upload_AbandonedFileIsSweptAfterGracePeriod()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"saa-stored-file-sweep-{Guid.NewGuid():N}.db");
        await using var factory = new ApiFactory(dbPath);
        using var client = await CreateLoggedInClientAsync(factory);
        var abandoned = await (await UploadAsync(client, Encoding.UTF8.GetBytes("abandoned")))
            .Content.ReadFromJsonAsync<JsonElement>();
        var abandonedUrl = abandoned.GetProperty("dataUrl").GetString();

        await using (var connection = new SqliteConnection($"Data Source={dbPath};Pooling=False"))
        {
            await connection.OpenAsync();
            var command = connection.CreateCommand();
            command.CommandText = "UPDATE StoredFiles SET CreatedAt = $createdAt";
            command.Parameters.AddWithValue("$createdAt", DateTime.UtcNow.AddDays(-2));
            Assert.Equal(1, await command.ExecuteNonQueryAsync());
        }

        var fresh = await (await UploadAsync(client, Encoding.UTF8.GetBytes("fresh")))
            .Content.ReadFromJsonAsync<JsonElement>();
        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(abandonedUrl)).StatusCode);
        Assert.Equal(
            HttpStatusCode.OK,
            (await anonymous.GetAsync(fresh.GetProperty("dataUrl").GetString())).StatusCode);
    }

    [Fact]
    public async Task Startup_MigratesLegacyBase64FilesWithoutLosingContent()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"saa-stored-file-migration-{Guid.NewGuid():N}.db");
        var legacyBytes = Encoding.UTF8.GetBytes("%PDF-1.7\nlegacy-file");
        var legacyJson = JsonSerializer.Serialize(new[]
        {
            new
            {
                id = 9,
                fileName = "历史资料.pdf",
                mimeType = "application/pdf",
                size = legacyBytes.Length,
                dataUrl = $"data:application/pdf;base64,{Convert.ToBase64String(legacyBytes)}",
            },
        });

        await using var firstFactory = new ApiFactory(dbPath);
        using (var firstClient = firstFactory.CreateClient())
        {
            (await firstClient.GetAsync("/api/store")).EnsureSuccessStatusCode();
        }

        await using (var connection = new SqliteConnection($"Data Source={dbPath}"))
        {
            await connection.OpenAsync();
            var command = connection.CreateCommand();
            command.CommandText =
                "INSERT INTO StoreEntries (Key, Json, UpdatedAt) VALUES ($key, $json, $updatedAt)";
            command.Parameters.AddWithValue("$key", "customer-sop:legacy");
            command.Parameters.AddWithValue("$json", legacyJson);
            command.Parameters.AddWithValue("$updatedAt", DateTime.UtcNow);
            await command.ExecuteNonQueryAsync();
        }

        await using var migratedFactory = new ApiFactory(dbPath);
        using var migratedClient = migratedFactory.CreateClient();
        var store = await migratedClient.GetFromJsonAsync<JsonElement>("/api/store");
        var item = store.GetProperty("customer-sop:legacy")[0];
        var contentUrl = item.GetProperty("dataUrl").GetString();
        Assert.StartsWith("/api/files/", contentUrl, StringComparison.Ordinal);
        Assert.DoesNotContain("base64", item.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal(legacyBytes, await migratedClient.GetByteArrayAsync(contentUrl));
    }

    [Fact]
    public async Task Store_InvalidBase64File_IsRejectedWithoutCreatingTheKey()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);
        var route = StoreRoute("sensor-sop:invalid-file");

        var response = await client.PutAsJsonAsync(route, new[]
        {
            new
            {
                fileName = "bad.pdf",
                mimeType = "application/pdf",
                size = 3,
                dataUrl = "data:application/pdf;base64,***not-base64***",
            },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(route)).StatusCode);
    }

    private static async Task<HttpClient> CreateRoleClientAsync(
        ApiFactory factory,
        string roleCode,
        string username)
    {
        using var admin = await CreateLoggedInClientAsync(factory);
        var roles = await admin.GetFromJsonAsync<JsonElement>("/api/rbac/roles");
        var roleId = roles.EnumerateArray()
            .First(role => role.GetProperty("code").GetString() == roleCode)
            .GetProperty("id")
            .GetInt32();
        var created = await admin.PostAsJsonAsync(
            "/api/rbac/users",
            new
            {
                username,
                password = "pass123456",
                displayName = username,
                isActive = true,
                roleIds = new[] { roleId },
            });
        created.EnsureSuccessStatusCode();

        using var login = factory.CreateClient();
        var response = await login.PostAsJsonAsync(
            "/api/auth/login",
            new { username, password = "pass123456" });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", body.GetProperty("token").GetString());
        return client;
    }

    private static string DownloadRoute(string fileId) => $"/api/files/{fileId}/download";

    [Fact]
    public async Task Download_RequiresFileDownloadPermission_AndWritesAudit()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateLoggedInClientAsync(factory);
        var bytes = Encoding.UTF8.GetBytes("%PDF-1.7\ndownload-permission");
        var uploaded = await (await UploadAsync(admin, bytes, "下载 测试.pdf"))
            .Content.ReadFromJsonAsync<JsonElement>();
        var fileId = uploaded.GetProperty("fileId").GetString()!;
        var route = DownloadRoute(fileId);

        using var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(route)).StatusCode);

        using var viewer = await CreateRoleClientAsync(factory, "viewer", "download-viewer");
        var viewerResponse = await viewer.GetAsync(route);
        Assert.Equal(HttpStatusCode.Forbidden, viewerResponse.StatusCode);
        Assert.Equal(
            "无权限执行此操作",
            (await viewerResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("message").GetString());

        using var editor = await CreateRoleClientAsync(factory, "editor", "download-editor");
        Assert.Equal(HttpStatusCode.Forbidden, (await editor.GetAsync(route)).StatusCode);

        var content = await admin.GetAsync(route);
        Assert.Equal(HttpStatusCode.OK, content.StatusCode);
        Assert.Equal(bytes, await content.Content.ReadAsByteArrayAsync());
        Assert.Equal("application/pdf", content.Content.Headers.ContentType?.MediaType);
        Assert.Equal("no-store", content.Headers.CacheControl?.ToString());
        Assert.Equal("nosniff", content.Headers.GetValues("X-Content-Type-Options").Single());
        var disposition = content.Content.Headers.GetValues("Content-Disposition").Single();
        Assert.StartsWith("attachment;", disposition, StringComparison.Ordinal);
        Assert.Contains(
            $"filename*=UTF-8''{Uri.EscapeDataString("下载 测试.pdf")}",
            disposition,
            StringComparison.Ordinal);

        // 预览端点仍匿名可读。
        Assert.Equal(
            HttpStatusCode.OK,
            (await anonymous.GetAsync(uploaded.GetProperty("dataUrl").GetString())).StatusCode);

        var logs = await admin.GetFromJsonAsync<JsonElement>("/api/audit-logs?action=file.download");
        var entry = logs.GetProperty("items").EnumerateArray().Single(item =>
            item.GetProperty("result").GetBoolean() &&
            item.GetProperty("target").GetString() == fileId);
        Assert.Equal("file.download", entry.GetProperty("action").GetString());
        Assert.Contains("文件名：下载 测试.pdf", entry.GetProperty("detail").GetString());
        Assert.Contains($"大小：{bytes.Length} B", entry.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Download_MissingFile_Returns404AndFailedAudit()
    {
        await using var factory = new ApiFactory();
        using var admin = await CreateLoggedInClientAsync(factory);
        var missingId = Guid.NewGuid();

        var response = await admin.GetAsync(DownloadRoute(missingId.ToString("D")));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(
            "文件不存在或已被删除",
            (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("message").GetString());

        var logs = await admin.GetFromJsonAsync<JsonElement>("/api/audit-logs?action=file.download");
        var entry = logs.GetProperty("items").EnumerateArray().Single();
        Assert.False(entry.GetProperty("result").GetBoolean());
        Assert.Equal(missingId.ToString("D"), entry.GetProperty("target").GetString());
        Assert.Equal("文件不存在或已被删除", entry.GetProperty("error").GetString());
    }
}
