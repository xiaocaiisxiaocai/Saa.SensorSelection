using System.Data.Common;

using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Saa.SensorSelection.Api.Data;

/// <summary>
/// 每个连接打开时执行 SQLite PRAGMA。
/// busy_timeout：多客户端并发写入时等待锁而不是立即报 "database is locked"。
/// 连接池会复用已设置过的连接，但多线程并发会新建连接，因此必须按连接设置。
/// </summary>
public sealed class SqlitePragmaInterceptor : DbConnectionInterceptor
{
    public override void ConnectionOpened(
        DbConnection connection,
        ConnectionEndEventData eventData)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA busy_timeout=30000;";
        command.ExecuteNonQuery();
        base.ConnectionOpened(connection, eventData);
    }
}
