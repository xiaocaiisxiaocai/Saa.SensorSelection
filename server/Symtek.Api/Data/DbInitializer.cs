using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Symtek.Api.Data;

/// <summary>
/// 启动初始化：确保 SQLite 数据目录存在、建库、写入种子用户。
/// 从 Program.cs 中拆出，让组合根只负责装配。
/// </summary>
public class DbInitializer(
    AppDbContext db,
    IConfiguration configuration,
    IHostEnvironment environment)
{
    public void EnsureReady()
    {
        EnsureDataDirectory();
        DbSeeder.EnsureSeeded(db, configuration);
        // WAL：读写不互斥（持久设置，写入库文件）；busy_timeout 由连接拦截器按连接设置
        db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
    }

    private void EnsureDataDirectory()
    {
        var connectionString = configuration.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        var dataSource = new SqliteConnectionStringBuilder(connectionString).DataSource;
        if (string.IsNullOrEmpty(dataSource) || dataSource == ":memory:")
        {
            return;
        }

        if (!Path.IsPathRooted(dataSource))
        {
            dataSource = Path.Combine(environment.ContentRootPath, dataSource);
        }

        var directory = Path.GetDirectoryName(dataSource);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
    }
}
