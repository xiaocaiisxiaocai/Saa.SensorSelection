using Microsoft.EntityFrameworkCore;

using Symtek.Api.Models;

namespace Symtek.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<StoreEntry> StoreEntries => Set<StoreEntry>();

    public DbSet<OrgUnit> OrgUnits => Set<OrgUnit>();

    public DbSet<Role> Roles => Set<Role>();

    public DbSet<Permission> Permissions => Set<Permission>();

    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(user => user.Id);
            entity.Property(user => user.Username).HasMaxLength(64).IsRequired();
            entity.HasIndex(user => user.Username).IsUnique();
            entity.Property(user => user.DisplayName).HasMaxLength(64).IsRequired();
            entity
                .HasOne(user => user.OrgUnit)
                .WithMany(org => org.Users)
                .HasForeignKey(user => user.OrgUnitId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StoreEntry>(entity =>
        {
            entity.HasKey(entry => entry.Key);
            entity.Property(entry => entry.Key).HasMaxLength(200).IsRequired();
            entity.Property(entry => entry.Json).HasColumnType("TEXT").IsRequired();
        });

        modelBuilder.Entity<OrgUnit>(entity =>
        {
            entity.HasKey(org => org.Id);
            entity.Property(org => org.Name).HasMaxLength(64).IsRequired();
            entity.Property(org => org.Level).HasMaxLength(32);
            entity
                .HasOne(org => org.Parent)
                .WithMany(org => org.Children)
                .HasForeignKey(org => org.ParentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasKey(role => role.Id);
            entity.Property(role => role.Code).HasMaxLength(64).IsRequired();
            entity.HasIndex(role => role.Code).IsUnique();
            entity.Property(role => role.Name).HasMaxLength(64).IsRequired();
            entity.Property(role => role.Description).HasMaxLength(200);
        });

        modelBuilder.Entity<Permission>(entity =>
        {
            entity.HasKey(permission => permission.Id);
            entity.Property(permission => permission.Code).HasMaxLength(64).IsRequired();
            entity.HasIndex(permission => permission.Code).IsUnique();
            entity.Property(permission => permission.Name).HasMaxLength(64).IsRequired();
            entity.Property(permission => permission.Module).HasMaxLength(32);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(log => log.Id);
            entity.Property(log => log.Username).HasMaxLength(64);
            entity.Property(log => log.Action).HasMaxLength(64).IsRequired();
            entity.Property(log => log.Target).HasMaxLength(200);
            entity.Property(log => log.Ip).HasMaxLength(64);
            entity.HasIndex(log => log.Timestamp);
            entity.HasIndex(log => log.Username);
            entity.HasIndex(log => log.Action);
        });

        // 多对多：User ↔ Role、Role ↔ Permission（EF 自动建中间表）
        modelBuilder.Entity<User>().HasMany(user => user.Roles).WithMany(role => role.Users);
        modelBuilder
            .Entity<Role>()
            .HasMany(role => role.Permissions)
            .WithMany(permission => permission.Roles);
    }
}
