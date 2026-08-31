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
}
