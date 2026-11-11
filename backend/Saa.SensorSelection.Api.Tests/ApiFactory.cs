using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Saa.SensorSelection.Api.Tests;

/// <summary>
/// 启动真实应用（含 DbInitializer 自动 Migrate + 种子 admin），
/// 每个实例使用独立的临时 SQLite 文件，保证测试互不干扰。
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath;

    public ApiFactory()
        : this(Path.Combine(Path.GetTempPath(), $"saa-sensor-selection-api-test-{Guid.NewGuid():N}.db"))
    {
    }

    /// <summary>指定数据库文件（用于验证种子/迁移在存量库上的幂等性）。</summary>
    public ApiFactory(string dbPath)
    {
        _dbPath = dbPath;
    }

    /// <summary>
    /// 旧的顺序 CRUD 测试使用此客户端；它只为兼容 Store 旧端点先读 ETag 再带 If-Match。
    /// 并发与前置条件测试必须使用 CreateRawClient，避免辅助器掩盖边界。
    /// </summary>
    public new HttpClient CreateClient() =>
        CreateDefaultClient(new StorePreconditionHandler());

    public HttpClient CreateRawClient() => base.CreateClient();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // 测试必须使用隔离配置，不能加载开发环境的业务演示种子。
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbPath}");
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        foreach (var suffix in new[] { string.Empty, "-wal", "-shm" })
        {
            try
            {
                var file = _dbPath + suffix;
                if (File.Exists(file))
                {
                    File.Delete(file);
                }
            }
            catch (IOException)
            {
                // 文件可能仍被进程短暂占用，忽略即可
            }
        }
    }

    private sealed class StorePreconditionHandler : DelegatingHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            if (request.Headers.IfMatch.Count == 0 && TryGetProbePath(request, out var probePath))
            {
                var probeUri = new Uri(request.RequestUri!, probePath);
                using var probe = new HttpRequestMessage(HttpMethod.Get, probeUri);
                using var response = await base.SendAsync(probe, cancellationToken);
                if (response.Headers.ETag is not null)
                {
                    request.Headers.IfMatch.Add(response.Headers.ETag);
                }
            }
            return await base.SendAsync(request, cancellationToken);
        }

        private static bool TryGetProbePath(HttpRequestMessage request, out string path)
        {
            path = string.Empty;
            var uri = request.RequestUri;
            if (uri is null) return false;
            var absolutePath = uri.AbsolutePath;
            if (request.Method == HttpMethod.Put && absolutePath == "/api/store")
            {
                path = "/api/store";
                return true;
            }
            if ((request.Method == HttpMethod.Put || request.Method == HttpMethod.Delete) &&
                absolutePath == "/api/store/by-key")
            {
                path = absolutePath + uri.Query;
                return true;
            }
            const string entityGroupsPrefix = "/api/store/entity-groups/";
            if (request.Method == HttpMethod.Put && absolutePath.StartsWith(entityGroupsPrefix, StringComparison.Ordinal))
            {
                var kind = Uri.UnescapeDataString(absolutePath[entityGroupsPrefix.Length..]);
                path = $"/api/store/by-key?key={Uri.EscapeDataString($"entity-groups:{kind}")}";
                return true;
            }
            return false;
        }
    }
}
