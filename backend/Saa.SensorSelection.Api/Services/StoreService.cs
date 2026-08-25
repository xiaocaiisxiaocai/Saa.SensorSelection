using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Nodes;

using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;

namespace Saa.SensorSelection.Api.Services;

/// <summary>数据仓库业务逻辑：key → JSON 数组的读、写、整体替换与删除。</summary>
public class StoreService(AppDbContext db)
{
    private static readonly HashSet<string> EntityKinds =
        new(StringComparer.OrdinalIgnoreCase) { "customer", "machine" };

    /// <summary>读取全部 key → JSON 数组。</summary>
    public async Task<JsonObject> GetAllAsync()
    {
        var entries = await db.StoreEntries.AsNoTracking().OrderBy(e => e.Key).ToListAsync();
        var payload = new JsonObject();
        foreach (var entry in entries)
        {
            payload[entry.Key] = JsonNode.Parse(entry.Json);
        }

        return payload;
    }

    /// <summary>读取单个 key 的 JSON 文本。</summary>
    public async Task<StoreReadResult> GetByKeyAsync(string key)
    {
        var entry = await db.StoreEntries.AsNoTracking().FirstOrDefaultAsync(e => e.Key == key);
        return entry == null
            ? new StoreReadResult(false, null)
            : new StoreReadResult(true, entry.Json);
    }

    /// <summary>整体导入：以提交对象全量替换数据仓库（首次接入时迁移 localStorage 数据用）。</summary>
    public async Task<StoreWriteResult> ReplaceAllAsync(JsonElement store)
    {
        if (store.ValueKind != JsonValueKind.Object)
        {
            return StoreWriteResult.Validation("请求体必须是对象");
        }

        var submittedKeys = new HashSet<string>();
        foreach (var property in store.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.Array)
            {
                return StoreWriteResult.Validation($"key 的值必须是数组: {property.Name}");
            }

            if (property.Name.Length > 200)
            {
                return StoreWriteResult.Validation("key 过长");
            }

            submittedKeys.Add(property.Name);
        }

        var now = DateTime.UtcNow;
        var existing = await db.StoreEntries
            .Where(e => submittedKeys.Contains(e.Key))
            .ToDictionaryAsync(e => e.Key);

        foreach (var property in store.EnumerateObject())
        {
            var json = property.Value.GetRawText();
            if (existing.TryGetValue(property.Name, out var entry))
            {
                entry.Json = json;
                entry.UpdatedAt = now;
            }
            else
            {
                db.StoreEntries.Add(new StoreEntry
                {
                    Key = property.Name,
                    Json = json,
                    UpdatedAt = now,
                });
            }
        }

        // 一次数据库调用删除所有不在本次提交中的旧 key
        await db.StoreEntries
            .Where(e => !submittedKeys.Contains(e.Key))
            .ExecuteDeleteAsync();

        await db.SaveChangesAsync();
        return StoreWriteResult.Ok();
    }

    /// <summary>写入单个 key 的 JSON 数组（新增或覆盖，并发首写冲突时回退为覆盖更新）。</summary>
    public async Task<StoreWriteResult> UpsertAsync(string key, JsonElement value)
    {
        if (key.Length == 0 || key.Length > 200)
        {
            return StoreWriteResult.Validation("key 非法");
        }

        if (value.ValueKind != JsonValueKind.Array)
        {
            return StoreWriteResult.Validation("值必须是 JSON 数组");
        }

        var json = value.GetRawText();
        var entry = await db.StoreEntries.FirstOrDefaultAsync(e => e.Key == key);
        if (entry == null)
        {
            var added = db.StoreEntries.Add(new StoreEntry
            {
                Key = key,
                Json = json,
                UpdatedAt = DateTime.UtcNow,
            });
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // 并发首次写入同 key（主键冲突）：放弃本次插入，改为覆盖更新
                db.Entry(added.Entity).State = EntityState.Detached;
                var existing = await db.StoreEntries.FindAsync(key);
                if (existing == null)
                {
                    throw;
                }

                existing.Json = json;
                existing.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
        }
        else
        {
            entry.Json = json;
            entry.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        return StoreWriteResult.Ok();
    }

    /// <summary>
    /// 持久化客户/机型分类及其条目顺序。排序使用专用契约，避免前端任意改写实体树结构。
    /// </summary>
    public async Task<StoreWriteResult> ReplaceEntityGroupsAsync(
        string kind,
        JsonElement value)
    {
        var normalizedKind = kind.Trim().ToLowerInvariant();
        if (!EntityKinds.Contains(normalizedKind))
        {
            return StoreWriteResult.Validation("实体类型必须是 customer 或 machine");
        }

        if (value.ValueKind != JsonValueKind.Array)
        {
            return StoreWriteResult.Validation("分类顺序必须是数组");
        }

        var groups = new List<EntityGroupPayload>();
        var groupNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var itemNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var group in value.EnumerateArray())
        {
            if (group.ValueKind != JsonValueKind.Object ||
                !group.TryGetProperty("name", out var nameProperty) ||
                nameProperty.ValueKind != JsonValueKind.String)
            {
                return StoreWriteResult.Validation("分类必须包含 name 字符串");
            }

            var name = nameProperty.GetString()?.Trim() ?? string.Empty;
            if (name.Length == 0 || name.Length > 40)
            {
                return StoreWriteResult.Validation("分类名称长度必须为 1-40 个字符");
            }

            if (!groupNames.Add(name))
            {
                return StoreWriteResult.Validation($"分类重复: {name}");
            }

            if (!group.TryGetProperty("items", out var itemsProperty) ||
                itemsProperty.ValueKind != JsonValueKind.Array)
            {
                return StoreWriteResult.Validation($"分类缺少 items 数组: {name}");
            }

            var items = new List<string>();
            foreach (var item in itemsProperty.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.String)
                {
                    return StoreWriteResult.Validation($"分类条目必须是字符串: {name}");
                }

                var itemName = item.GetString()?.Trim() ?? string.Empty;
                if (itemName.Length == 0 || itemName.Length > 40)
                {
                    return StoreWriteResult.Validation("条目名称长度必须为 1-40 个字符");
                }

                if (!itemNames.Add(itemName))
                {
                    return StoreWriteResult.Validation($"条目重复: {itemName}");
                }

                items.Add(itemName);
            }

            groups.Add(new EntityGroupPayload(name, items));
        }

        if (groups.Count == 0)
        {
            return StoreWriteResult.Validation("至少需要一个分类");
        }

        var normalized = JsonSerializer.SerializeToElement(groups);
        return await UpsertAsync($"entity-groups:{normalizedKind}", normalized);
    }

    /// <summary>删除单个 key，返回是否实际存在。</summary>
    public async Task<StoreDeleteResult> DeleteAsync(string key)
    {
        var entry = await db.StoreEntries.FirstOrDefaultAsync(e => e.Key == key);
        if (entry == null)
        {
            return new StoreDeleteResult(false);
        }

        db.StoreEntries.Remove(entry);
        await db.SaveChangesAsync();
        return new StoreDeleteResult(true);
    }
}

/// <summary>单个 key 的读取结果。</summary>
public record StoreReadResult(bool Found, string? Json);

/// <summary>写操作结果：Success=false 且 Error 非空表示校验失败。</summary>
public record StoreWriteResult(bool Success, string? Error)
{
    public static StoreWriteResult Ok() => new(true, null);

    public static StoreWriteResult Validation(string message) => new(false, message);
}

/// <summary>删除结果：Found=false 表示 key 不存在。</summary>
public record StoreDeleteResult(bool Found);

/// <summary>实体分类排序的后端存储形状。</summary>
public sealed record EntityGroupPayload(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("items")] IReadOnlyList<string> Items);
