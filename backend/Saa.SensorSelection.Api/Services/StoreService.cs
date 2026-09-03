using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Nodes;

using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;

namespace Saa.SensorSelection.Api.Services;

/// <summary>数据仓库业务逻辑：key → JSON 数组的读、写、整体替换与删除。</summary>
public class StoreService(AppDbContext db, StoredFileService storedFiles)
{
    private static readonly HashSet<string> EntityKinds =
        new(StringComparer.OrdinalIgnoreCase) { "customer", "machine" };

    /// <summary>读取全部 key → JSON 数组。</summary>
    public async Task<JsonObject> GetAllAsync(CancellationToken ct = default)
    {
        var entries = await db.StoreEntries.AsNoTracking().OrderBy(e => e.Key).ToListAsync(ct);
        var payload = new JsonObject();
        foreach (var entry in entries)
        {
            payload[entry.Key] = JsonNode.Parse(entry.Json);
        }

        return payload;
    }

    /// <summary>读取单个 key 的 JSON 文本。</summary>
    public async Task<StoreReadResult> GetByKeyAsync(string key, CancellationToken ct = default)
    {
        var entry = await db.StoreEntries.AsNoTracking().FirstOrDefaultAsync(e => e.Key == key, ct);
        return entry == null
            ? new StoreReadResult(false, null)
            : new StoreReadResult(true, entry.Json);
    }

    /// <summary>整体导入：以提交对象全量替换数据仓库（首次接入时迁移 localStorage 数据用）。</summary>
    public async Task<StoreWriteResult> ReplaceAllAsync(JsonElement store, CancellationToken ct = default)
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

        var detached = new Dictionary<string, FileDetachmentResult>();
        foreach (var property in store.EnumerateObject())
        {
            var result = storedFiles.Detach(property.Value);
            if (!result.Success) return StoreWriteResult.Validation(result.Error!);
            detached[property.Name] = result;
        }

        var now = DateTime.UtcNow;
        var existing = await db.StoreEntries
            .Where(e => submittedKeys.Contains(e.Key))
            .ToDictionaryAsync(e => e.Key, ct);

        foreach (var property in store.EnumerateObject())
        {
            var result = detached[property.Name];
            var json = result.Json!;
            db.StoredFiles.AddRange(result.Files);
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
            .ExecuteDeleteAsync(ct);

        await db.SaveChangesAsync(ct);
        await storedFiles.DeleteOrphansAsync();
        return StoreWriteResult.Ok();
    }

    /// <summary>写入单个 key 的 JSON 数组（新增或覆盖，并发首写冲突时回退为覆盖更新）。</summary>
    public async Task<StoreWriteResult> UpsertAsync(string key, JsonElement value, CancellationToken ct = default)
    {
        if (key.Length == 0 || key.Length > 200)
        {
            return StoreWriteResult.Validation("key 非法");
        }

        if (value.ValueKind != JsonValueKind.Array)
        {
            return StoreWriteResult.Validation("值必须是 JSON 数组");
        }

        var detached = storedFiles.Detach(value);
        if (!detached.Success)
        {
            return StoreWriteResult.Validation(detached.Error!);
        }

        var json = detached.Json!;
        db.StoredFiles.AddRange(detached.Files);
        var entry = await db.StoreEntries.FirstOrDefaultAsync(e => e.Key == key, ct);
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
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // 并发首次写入同 key（主键冲突）：放弃本次插入，改为覆盖更新
                db.Entry(added.Entity).State = EntityState.Detached;
                var existing = await db.StoreEntries.FindAsync([key], ct);
                if (existing == null)
                {
                    throw;
                }

                existing.Json = json;
                existing.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }
        }
        else
        {
            entry.Json = json;
            entry.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        await storedFiles.DeleteOrphansAsync();
        return StoreWriteResult.Ok(json);
    }

    /// <summary>
    /// 持久化客户/机型分类及其条目顺序。排序使用专用契约，避免前端任意改写实体树结构。
    /// </summary>
    public async Task<StoreWriteResult> ReplaceEntityGroupsAsync(
        string kind,
        JsonElement value,
        CancellationToken ct = default)
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

            string? machineType = null;
            if (normalizedKind == "machine")
            {
                machineType = name == "专案机型" ? "project" : "mechanism";
                if (group.TryGetProperty("machineType", out var machineTypeProperty))
                {
                    if (machineTypeProperty.ValueKind != JsonValueKind.String ||
                        machineTypeProperty.GetString() is not ("mechanism" or "project"))
                    {
                        return StoreWriteResult.Validation("机型分类类型必须是 mechanism 或 project");
                    }

                    machineType = machineTypeProperty.GetString();
                }
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

            List<EntityConfigurationPayload>? configurations = null;
            if (group.TryGetProperty("configurations", out var configurationsProperty))
            {
                if (normalizedKind != "machine")
                {
                    return StoreWriteResult.Validation("只有机型分类支持配置层级");
                }

                if (configurationsProperty.ValueKind != JsonValueKind.Array)
                {
                    return StoreWriteResult.Validation($"配置必须是数组: {name}");
                }

                configurations = new List<EntityConfigurationPayload>();
                var configurationNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var configuration in configurationsProperty.EnumerateArray())
                {
                    if (configuration.ValueKind != JsonValueKind.Object ||
                        !configuration.TryGetProperty("name", out var configurationNameProperty) ||
                        configurationNameProperty.ValueKind != JsonValueKind.String ||
                        !configuration.TryGetProperty("items", out var configurationItemsProperty) ||
                        configurationItemsProperty.ValueKind != JsonValueKind.Array)
                    {
                        return StoreWriteResult.Validation($"配置必须包含 name 字符串和 items 数组: {name}");
                    }

                    var configurationName = configurationNameProperty.GetString()?.Trim() ?? string.Empty;
                    if (configurationName.Length == 0 || configurationName.Length > 40)
                    {
                        return StoreWriteResult.Validation("配置名称长度必须为 1-40 个字符");
                    }

                    if (!configurationNames.Add(configurationName))
                    {
                        return StoreWriteResult.Validation($"配置重复: {configurationName}");
                    }

                    var configurationItems = new List<string>();
                    var configurationItemNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var item in configurationItemsProperty.EnumerateArray())
                    {
                        if (item.ValueKind != JsonValueKind.String)
                        {
                            return StoreWriteResult.Validation($"配置条目必须是字符串: {configurationName}");
                        }

                        var itemName = item.GetString()?.Trim() ?? string.Empty;
                        if (itemName.Length == 0 || itemName.Length > 40)
                        {
                            return StoreWriteResult.Validation("条目名称长度必须为 1-40 个字符");
                        }

                        if (!configurationItemNames.Add(itemName))
                        {
                            return StoreWriteResult.Validation($"条目重复: {itemName}");
                        }

                        configurationItems.Add(itemName);
                    }

                    configurations.Add(new EntityConfigurationPayload(configurationName, configurationItems));
                }
            }

            groups.Add(new EntityGroupPayload(name, items, configurations, machineType));
        }

        if (groups.Count == 0)
        {
            return StoreWriteResult.Validation("至少需要一个分类");
        }

        var normalized = JsonSerializer.SerializeToElement(groups);
        return await UpsertAsync($"entity-groups:{normalizedKind}", normalized, ct);
    }

    /// <summary>删除单个 key，返回是否实际存在。</summary>
    public async Task<StoreDeleteResult> DeleteAsync(string key, CancellationToken ct = default)
    {
        var entry = await db.StoreEntries.FirstOrDefaultAsync(e => e.Key == key, ct);
        if (entry == null)
        {
            return new StoreDeleteResult(false);
        }

        db.StoreEntries.Remove(entry);
        await db.SaveChangesAsync(ct);
        await storedFiles.DeleteOrphansAsync();
        return new StoreDeleteResult(true);
    }
}

/// <summary>单个 key 的读取结果。</summary>
public record StoreReadResult(bool Found, string? Json);

/// <summary>写操作结果：Success=false 且 Error 非空表示校验失败。</summary>
public record StoreWriteResult(bool Success, string? Error, string? Json)
{
    public static StoreWriteResult Ok(string? json = null) => new(true, null, json);

    public static StoreWriteResult Validation(string message) => new(false, message, null);
}

/// <summary>删除结果：Found=false 表示 key 不存在。</summary>
public record StoreDeleteResult(bool Found);

/// <summary>实体分类排序的后端存储形状。</summary>
public sealed record EntityGroupPayload(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("items")] IReadOnlyList<string> Items,
    [property: JsonPropertyName("configurations"),
     JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    IReadOnlyList<EntityConfigurationPayload>? Configurations = null,
    [property: JsonPropertyName("machineType"),
     JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? MachineType = null);

/// <summary>机型分类下的配置层级，数组顺序即显示顺序。</summary>
public sealed record EntityConfigurationPayload(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("items")] IReadOnlyList<string> Items);
