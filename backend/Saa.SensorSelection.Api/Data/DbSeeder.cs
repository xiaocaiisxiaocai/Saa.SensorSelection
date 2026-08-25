using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Models;
using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Data;

public static class DbSeeder
{
    /// <summary>
    /// 启动时应用 EF Core Migrations 建库/升级架构，并幂等写入：
    /// 1. 权限清单（RbacDefaults）
    /// 2. 内置角色（admin/editor/viewer，admin 为系统角色）
    /// 3. 默认组织架构（制造事业部 → 标准件组 → 选型课）
    /// 4. 默认管理员账号（appsettings Seed 节），并授予 admin 角色
    /// </summary>
    public static void EnsureSeeded(AppDbContext db, IConfiguration configuration)
    {
        db.Database.Migrate();

        EnsurePermissions(db);
        EnsureRoles(db);
        EnsureOrganizationHierarchy(db);
        EnsureAdminUser(db, configuration);
    }

    private static void EnsureOrganizationHierarchy(AppDbContext db)
    {
        // 只在全新数据库中写入基础组织，绝不覆盖已有组织或用户关联。
        if (db.OrgUnits.Any())
        {
            return;
        }

        var division = new OrgUnit
        {
            Name = "制造事业部",
            Level = "事业部",
            SortOrder = 0,
        };
        var department = new OrgUnit
        {
            Name = "标准件组",
            Level = "部门",
            SortOrder = 0,
            Parent = division,
        };
        var section = new OrgUnit
        {
            Name = "选型课",
            Level = "课别",
            SortOrder = 0,
            Parent = department,
        };

        db.OrgUnits.AddRange(division, department, section);
        db.SaveChanges();
    }

    private static void EnsurePermissions(AppDbContext db)
    {
        foreach (var (code, name, module) in RbacDefaults.Permissions)
        {
            if (db.Permissions.Any(permission => permission.Code == code))
            {
                continue;
            }
            db.Permissions.Add(new Permission { Code = code, Name = name, Module = module });
        }
        db.SaveChanges();
    }

    private static void EnsureRoles(AppDbContext db)
    {
        var permissionsByCode = db.Permissions.ToDictionary(permission => permission.Code);
        foreach (var (code, name, description, isSystem, permissionCodes) in RbacDefaults.Roles)
        {
            // 必须加载 Permissions 集合：否则已存在的角色会被当作无权限，
            // 补种时重复插入 RolePermission 关联 → UNIQUE 冲突
            var role = db.Roles
                .Include(item => item.Permissions)
                .FirstOrDefault(item => item.Code == code);
            if (role is null)
            {
                role = new Role
                {
                    Code = code,
                    Name = name,
                    Description = description,
                    IsSystem = isSystem,
                };
                role.Permissions.AddRange(
                    permissionCodes
                        .Select(permissionCode => permissionsByCode[permissionCode]));
                db.Roles.Add(role);
                continue;
            }

            // 已存在的内置角色：名称/描述同步更新；权限只补不删（系统角色除外——admin 始终保持全部权限）
            role.Name = name;
            role.Description = description;
            var existingCodes = role.Permissions.Select(permission => permission.Code).ToHashSet();
            var missing = permissionCodes
                .Where(permissionCode => !existingCodes.Contains(permissionCode))
                .Select(permissionCode => permissionsByCode[permissionCode])
                .ToList();
            role.Permissions.AddRange(missing);
            if (isSystem)
            {
                var removed = role.Permissions
                    .Where(permission => !permissionCodes.Contains(permission.Code))
                    .ToList();
                foreach (var permission in removed)
                {
                    role.Permissions.Remove(permission);
                }
            }
        }
        db.SaveChanges();
    }

    private static void EnsureAdminUser(AppDbContext db, IConfiguration configuration)
    {
        var username = configuration["Seed:AdminUsername"]?.Trim() ?? "admin";
        var user = db.Users
            .Include(item => item.Roles)
            .FirstOrDefault(item => item.Username == username);

        if (user is null)
        {
            var password = configuration["Seed:AdminPassword"] ?? "admin123";
            user = new User
            {
                Username = username,
                DisplayName = configuration["Seed:AdminDisplayName"]?.Trim() ?? "管理员",
                PasswordHash = PasswordService.Hash(password),
                CreatedAt = DateTime.UtcNow,
            };
            db.Users.Add(user);
        }

        // 确保默认管理员拥有系统管理员角色（迁移前创建的 admin 也会补上）
        var adminRole = db.Roles.First(role => role.Code == RbacDefaults.SystemAdminRoleCode);
        if (user.Roles.All(role => role.Id != adminRole.Id))
        {
            user.Roles.Add(adminRole);
        }
        db.SaveChanges();
    }
}
