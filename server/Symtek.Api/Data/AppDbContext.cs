using Microsoft.EntityFrameworkCore;

using Symtek.Api.Models;

namespace Symtek.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<StoreEntry> StoreEntries => Set<StoreEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(user => user.Id);
            entity.Property(user => user.Username).HasMaxLength(64).IsRequired();
            entity.HasIndex(user => user.Username).IsUnique();
            entity.Property(user => user.DisplayName).HasMaxLength(64).IsRequired();
        });

        modelBuilder.Entity<StoreEntry>(entity =>
        {
            entity.HasKey(entry => entry.Key);
            entity.Property(entry => entry.Key).HasMaxLength(200).IsRequired();
            entity.Property(entry => entry.Json).HasColumnType("TEXT").IsRequired();
        });
    }
}
