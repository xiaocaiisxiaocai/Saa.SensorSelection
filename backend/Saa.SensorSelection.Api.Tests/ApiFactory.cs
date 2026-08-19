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

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
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
}
