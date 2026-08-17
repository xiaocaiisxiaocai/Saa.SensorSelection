using Microsoft.EntityFrameworkCore;

using Symtek.Api.Models;
using Symtek.Api.Services;

namespace Symtek.Api.Data;

public static class DbSeeder
{
    /// <summary>
    /// 启动时应用 EF Core Migrations 建库/升级架构，并写入默认管理员（已存在则跳过）。
    /// 正式部署请修改 appsettings.json 的 Seed 配置，或通过数据库自行维护用户。
    /// </summary>
    public static void EnsureSeeded(AppDbContext db, IConfiguration configuration)
    {
        db.Database.Migrate();

        var username = configuration["Seed:AdminUsername"]?.Trim() ?? "admin";
        if (db.Users.Any(user => user.Username == username))
        {
            return;
        }

        var password = configuration["Seed:AdminPassword"] ?? "admin123";
        db.Users.Add(new User
        {
            Username = username,
            DisplayName = configuration["Seed:AdminDisplayName"]?.Trim() ?? "管理员",
            PasswordHash = PasswordService.Hash(password),
            CreatedAt = DateTime.UtcNow,
        });
        db.SaveChanges();
    }
}
