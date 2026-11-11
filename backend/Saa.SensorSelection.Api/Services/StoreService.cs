using System.Security.Cryptography;
using System.Text;
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
    public const string MissingEntityTag = "\"missing\"";

    private static readonly HashSet<string> EntityKinds =
        new(StringComparer.OrdinalIgnoreCase) { "customer", "machine" };

    // 录入、启用日期由服务端控制，普通编辑及批量导入不能改写既有日期。
    private static string ApplySensorDates(string key, string json, string? previousJson)
    {
        if (key != "sensor-catalog:all") return json;
        var rows = JsonNode.Parse(json) as JsonArray;
        if (rows == null) return json;
        var previous = (JsonNode.Parse(previousJson ?? "[]") as JsonArray)?
            .OfType<JsonObject>()
            .Where(row => row["id"] != null)
            .GroupBy(row => row["id"]!.ToJsonString())
            .ToDictionary(group => group.Key, group => group.Last());
        var today = DateTime.Now.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        static string Text(JsonObject? row, string field) => row?[field] is JsonValue value &&
            value.TryGetValue<string>(out var text) ? text : "";
        static bool Current(JsonObject row) => System.Text.RegularExpressions.Regex.IsMatch(
            Text(row, "status").Trim(), @"^(?:\d+\s*)?现用$");
        foreach (var row in rows.OfType<JsonObject>())
        {
            JsonObject? old = null;
            if (row["id"] != null) previous?.TryGetValue(row["id"]!.ToJsonString(), out old);
            var entered = Text(old, "enteredAt");
            row["enteredAt"] = old == null ? today : entered[..Math.Min(10, entered.Length)];
            row["usedAt"] = Current(row) && (old == null || !Current(old))
                ? today : Text(old, "usedAt");
        }
        return rows.ToJsonString();
    }

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
            ? new StoreReadResult(false, null, MissingEntityTag)
            : new StoreReadResult(true, entry.Json, EntityTag(entry.Json));
    }

    public static string EntityTag(string json)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(json));
        return $"\"sha256-{Convert.ToHexString(hash).ToLowerInvariant()}\"";
    }

    public static string EntityTag(JsonObject store) => EntityTag(store.ToJsonString());

    private static bool MatchesEntityTag(string expectedEntityTag, string? json, bool found) =>
        string.Equals(
            expectedEntityTag,
            found ? EntityTag(json!) : MissingEntityTag,
            StringComparison.Ordinal);

    /// <summary>整体导入：以提交对象全量替换数据仓库（首次接入时迁移 localStorage 数据用）。</summary>
    public async Task<StoreWriteResult> ReplaceAllAsync(
        JsonElement store,
        string expectedEntityTag,
        CancellationToken ct = default)
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

            if (property.Name.Length == 0 || property.Name.Length > 200)
            {
                return StoreWriteResult.Validation("key 长度不合法");
            }

            submittedKeys.Add(property.Name);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var currentEntries = await db.StoreEntries.OrderBy(entry => entry.Key).ToListAsync(ct);
        var currentStore = new JsonObject();
        foreach (var entry in currentEntries)
        {
            currentStore[entry.Key] = JsonNode.Parse(entry.Json);
        }
        if (!string.Equals(expectedEntityTag, EntityTag(currentStore), StringComparison.Ordinal))
        {
            return StoreWriteResult.Precondition("数据已被其他用户修改，请刷新后重试");
        }
        var removedEntityGroup = currentEntries.FirstOrDefault(entry =>
            entry.Key.StartsWith("entity-groups:", StringComparison.OrdinalIgnoreCase) &&
            !submittedKeys.Contains(entry.Key));
        if (removedEntityGroup is not null)
        {
            return StoreWriteResult.Validation("整体替换不能删除实体目录");
        }

        var currentByKey = currentEntries.ToDictionary(entry => entry.Key, StringComparer.Ordinal);
        var detached = new Dictionary<string, FileDetachmentResult>();
        foreach (var property in store.EnumerateObject())
        {
            currentByKey.TryGetValue(property.Name, out var previous);
            var result = PrepareValue(property.Name, property.Value, previous?.Json);
            if (!result.Success) return StoreWriteResult.Validation(result.Error!);
            detached[property.Name] = result;
        }

        var previousFileIds = new HashSet<Guid>();
        foreach (var json in currentEntries.Select(entry => entry.Json))
        {
            previousFileIds.UnionWith(StoredFileService.ReferencedFileIds(json));
        }

        var now = DateTime.UtcNow;
        var existing = currentEntries
            .Where(e => submittedKeys.Contains(e.Key))
            .ToDictionary(e => e.Key);

        foreach (var property in store.EnumerateObject())
        {
            var result = detached[property.Name];
            existing.TryGetValue(property.Name, out var previous);
            var json = ApplySensorDates(property.Name, result.Json!, previous?.Json);
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

        var missingFiles = await storedFiles.FindMissingReferencesAsync(
            detached.Values.Select(result => result.Json!),
            ct);
        if (missingFiles.Count > 0)
        {
            db.ChangeTracker.Clear();
            return StoreWriteResult.Validation("引用的文件不存在或已被删除");
        }

        // 一次数据库调用删除所有不在本次提交中的旧 key
        await db.StoreEntries
            .Where(e => !submittedKeys.Contains(e.Key))
            .ExecuteDeleteAsync(ct);

        await db.SaveChangesAsync(ct);
        await storedFiles.ReleaseAsync(previousFileIds, ct);
        await transaction.CommitAsync(ct);
        return StoreWriteResult.Ok();
    }

    /// <summary>写入单个 key 的 JSON 数组（新增或覆盖，并发首写冲突时回退为覆盖更新）。</summary>
    public async Task<StoreWriteResult> UpsertAsync(
        string key,
        JsonElement value,
        string expectedEntityTag,
        CancellationToken ct = default)
    {
        if (key.Length == 0 || key.Length > 200)
        {
            return StoreWriteResult.Validation("key 非法");
        }

        if (value.ValueKind != JsonValueKind.Array)
        {
            return StoreWriteResult.Validation("值必须是 JSON 数组");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var entry = await db.StoreEntries.FirstOrDefaultAsync(e => e.Key == key, ct);
        if (!MatchesEntityTag(expectedEntityTag, entry?.Json, entry is not null))
        {
            return StoreWriteResult.Precondition("数据已被其他用户修改，请刷新后重试");
        }

        var detached = PrepareValue(key, value, entry?.Json);
        if (!detached.Success)
        {
            return StoreWriteResult.Validation(detached.Error!);
        }

        var json = detached.Json!;
        db.StoredFiles.AddRange(detached.Files);
        var droppedFileIds = StoredFileService.ReferencedFileIds(entry?.Json);
        var previousJson = entry?.Json;
        json = ApplySensorDates(key, json, previousJson);
        var missingFiles = await storedFiles.FindMissingReferencesAsync([json], ct);
        if (missingFiles.Count > 0)
        {
            db.ChangeTracker.Clear();
            return StoreWriteResult.Validation("引用的文件不存在或已被删除");
        }
        if (entry == null)
        {
            db.StoreEntries.Add(new StoreEntry
            {
                Key = key,
                Json = json,
                UpdatedAt = DateTime.UtcNow,
            });
        }
        else
        {
            entry.Json = json;
            entry.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        droppedFileIds.ExceptWith(StoredFileService.ReferencedFileIds(json));
        await storedFiles.ReleaseAsync(droppedFileIds, ct);
        await transaction.CommitAsync(ct);
        return StoreWriteResult.Ok(json, previousJson);
    }

    /// <summary>
    /// 持久化客户/机型分类及其条目顺序。排序使用专用契约，避免前端任意改写实体树结构。
    /// </summary>
    public async Task<StoreWriteResult> ReplaceEntityGroupsAsync(
        string kind,
        JsonElement value,
        string expectedEntityTag,
        CancellationToken ct = default)
    {
        var normalizedKind = kind.Trim().ToLowerInvariant();
        return await UpsertAsync(
            $"entity-groups:{normalizedKind}",
            value,
            expectedEntityTag,
            ct);
    }

    private FileDetachmentResult PrepareValue(string key, JsonElement value, string? previousJson)
    {
        if (!key.StartsWith("entity-groups:", StringComparison.OrdinalIgnoreCase))
        {
            return storedFiles.Detach(value);
        }

        var kind = key["entity-groups:".Length..];
        if (kind is not ("customer" or "machine"))
        {
            return FileDetachmentResult.Validation(
                "实体目录 key 必须是 entity-groups:customer 或 entity-groups:machine");
        }
        var normalized = NormalizeEntityGroups(kind, value, previousJson);
        return normalized.Success
            ? FileDetachmentResult.Ok(normalized.Json!, [])
            : FileDetachmentResult.Validation(normalized.Error!);
    }

    private static StoreWriteResult NormalizeEntityGroups(
        string kind,
        JsonElement value,
        string? previousJson)
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

        // 客户目录是「客户 → 厂区」：厂区名在不同客户下会重复（多个客户都有深圳厂），
        // 只要求在同一客户内唯一；业务数据按「客户/厂区」落键，所以两级名称都不能含「/」。
        // 每个厂区的区域放在客户的 regions（厂区名 → 区域）里；区域是否在字典里由前端领域层判断。
        // 机型名全局唯一（数据按机型名落键）。
        var isCustomer = normalizedKind == "customer";
        var groups = new List<EntityGroupPayload>();
        var groupNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var machineItemCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
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

            if (isCustomer && name.Contains('/'))
            {
                return StoreWriteResult.Validation($"客户名称不能包含“/”: {name}");
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
            var customerItemNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
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

                if (isCustomer && itemName.Contains('/'))
                {
                    return StoreWriteResult.Validation($"厂区名称不能包含“/”: {itemName}");
                }

                if (isCustomer && !customerItemNames.Add(itemName))
                {
                    return StoreWriteResult.Validation($"条目重复: {itemName}");
                }
                if (!isCustomer)
                {
                    machineItemCounts[itemName] = machineItemCounts.GetValueOrDefault(itemName) + 1;
                }

                items.Add(itemName);
            }

            Dictionary<string, string>? regions = null;
            if (group.TryGetProperty("regions", out var regionsProperty))
            {
                if (!isCustomer)
                {
                    return StoreWriteResult.Validation("只有客户分类支持区域");
                }

                if (regionsProperty.ValueKind != JsonValueKind.Object)
                {
                    return StoreWriteResult.Validation($"区域必须是对象: {name}");
                }

                regions = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var region in regionsProperty.EnumerateObject())
                {
                    var site = region.Name.Trim();
                    if (!items.Contains(site, StringComparer.Ordinal))
                    {
                        return StoreWriteResult.Validation($"区域对应的厂区不存在: {site}");
                    }

                    if (region.Value.ValueKind != JsonValueKind.String)
                    {
                        return StoreWriteResult.Validation($"厂区的区域必须是字符串: {site}");
                    }

                    var regionName = region.Value.GetString()?.Trim() ?? string.Empty;
                    if (regionName.Length == 0 || regionName.Length > 40)
                    {
                        return StoreWriteResult.Validation("区域名称长度必须为 1-40 个字符");
                    }

                    regions[site] = regionName;
                }
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

                        machineItemCounts[itemName] = machineItemCounts.GetValueOrDefault(itemName) + 1;
                        configurationItems.Add(itemName);
                    }

                    configurations.Add(new EntityConfigurationPayload(configurationName, configurationItems));
                }
            }

            groups.Add(new EntityGroupPayload(name, items, configurations, machineType, regions));
        }

        if (groups.Count == 0)
        {
            return StoreWriteResult.Validation("至少需要一个分类");
        }

        if (!isCustomer)
        {
            var previousCounts = MachineNameCounts(previousJson);
            foreach (var (name, count) in machineItemCounts)
            {
                if (count > 1 && count > previousCounts.GetValueOrDefault(name))
                {
                    return StoreWriteResult.Validation($"条目重复: {name}");
                }
            }
        }

        var normalized = JsonSerializer.Serialize(groups);
        return StoreWriteResult.Ok(normalized);
    }

    private static Dictionary<string, int> MachineNameCounts(string? json)
    {
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(json)) return counts;
        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Array) return counts;
            foreach (var group in document.RootElement.EnumerateArray())
            {
                AddItems(group, "items", counts);
                if (!group.TryGetProperty("configurations", out var configurations) ||
                    configurations.ValueKind != JsonValueKind.Array) continue;
                foreach (var configuration in configurations.EnumerateArray())
                {
                    AddItems(configuration, "items", counts);
                }
            }
        }
        catch (JsonException)
        {
            // 损坏的旧目录不放宽新写入；新值仍按严格唯一规则处理。
        }
        return counts;

        static void AddItems(
            JsonElement owner,
            string propertyName,
            Dictionary<string, int> result)
        {
            if (owner.ValueKind != JsonValueKind.Object ||
                !owner.TryGetProperty(propertyName, out var items) ||
                items.ValueKind != JsonValueKind.Array) return;
            foreach (var item in items.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.String) continue;
                var name = item.GetString()?.Trim();
                if (string.IsNullOrEmpty(name)) continue;
                result[name] = result.GetValueOrDefault(name) + 1;
            }
        }
    }

    public async Task<StoreBatchResult> ApplyBatchAsync(
        IReadOnlyList<StoreBatchChange> changes,
        CancellationToken ct = default)
    {
        if (changes.Count == 0)
        {
            return StoreBatchResult.Validation("changes 不能为空");
        }

        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var change in changes)
        {
            if (change.Key.Length == 0 || change.Key.Length > 200)
            {
                return StoreBatchResult.Validation("key 非法");
            }
            if (!keys.Add(change.Key))
            {
                return StoreBatchResult.Validation($"批次中 key 重复: {change.Key}");
            }
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var entries = await db.StoreEntries
            .Where(entry => keys.Contains(entry.Key))
            .ToDictionaryAsync(entry => entry.Key, StringComparer.Ordinal, ct);

        foreach (var change in changes)
        {
            entries.TryGetValue(change.Key, out var entry);
            if (!MatchesExpected(change.Expected, entry?.Json, entry is not null))
            {
                return StoreBatchResult.Conflict(change.Key);
            }
        }

        var prepared = new List<PreparedBatchChange>(changes.Count);
        foreach (var change in changes)
        {
            entries.TryGetValue(change.Key, out var entry);
            if (change.Value is null)
            {
                if (change.Key.StartsWith("entity-groups:", StringComparison.OrdinalIgnoreCase))
                {
                    return StoreBatchResult.Validation("实体目录不能通过批次删除");
                }
                prepared.Add(new PreparedBatchChange(change.Key, null, [], entry?.Json));
                continue;
            }

            var detached = PrepareValue(change.Key, change.Value.Value, entry?.Json);
            if (!detached.Success)
            {
                return StoreBatchResult.Validation(detached.Error!);
            }

            var json = detached.Json!;
            json = ApplySensorDates(change.Key, json, entry?.Json);
            prepared.Add(new PreparedBatchChange(change.Key, json, detached.Files, entry?.Json));
        }

        var droppedFileIds = new HashSet<Guid>();
        var now = DateTime.UtcNow;
        foreach (var change in prepared)
        {
            droppedFileIds.UnionWith(StoredFileService.ReferencedFileIds(change.PreviousJson));
            db.StoredFiles.AddRange(change.Files);
            entries.TryGetValue(change.Key, out var entry);
            if (change.Json is null)
            {
                if (entry is not null) db.StoreEntries.Remove(entry);
                continue;
            }

            if (entry is null)
            {
                db.StoreEntries.Add(new StoreEntry
                {
                    Key = change.Key,
                    Json = change.Json,
                    UpdatedAt = now,
                });
            }
            else
            {
                entry.Json = change.Json;
                entry.UpdatedAt = now;
            }
        }


        var missingFiles = await storedFiles.FindMissingReferencesAsync(
            prepared.Where(change => change.Json is not null).Select(change => change.Json!),
            ct);
        if (missingFiles.Count > 0)
        {
            db.ChangeTracker.Clear();
            return StoreBatchResult.Validation("引用的文件不存在或已被删除");
        }

        await db.SaveChangesAsync(ct);
        await storedFiles.ReleaseAsync(droppedFileIds, ct);
        await transaction.CommitAsync(ct);

        return StoreBatchResult.Ok(
            prepared.ToDictionary(
                change => change.Key,
                change => change.Json,
                StringComparer.Ordinal),
            prepared.ToDictionary(
                change => change.Key,
                change => change.PreviousJson,
                StringComparer.Ordinal));
    }

    private static bool MatchesExpected(JsonElement? expected, string? currentJson, bool found)
    {
        if (expected is null) return !found;
        if (!found) return false;
        return JsonNode.DeepEquals(
            JsonNode.Parse(expected.Value.GetRawText()),
            JsonNode.Parse(currentJson!));
    }

    private sealed record PreparedBatchChange(
        string Key,
        string? Json,
        IReadOnlyList<StoredFile> Files,
        string? PreviousJson);

    /// <summary>删除单个 key，返回是否实际存在。</summary>
    public async Task<StoreDeleteResult> DeleteAsync(
        string key,
        string expectedEntityTag,
        CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var entry = await db.StoreEntries.FirstOrDefaultAsync(e => e.Key == key, ct);
        if (!MatchesEntityTag(expectedEntityTag, entry?.Json, entry is not null))
        {
            return StoreDeleteResult.Precondition("数据已被其他用户修改，请刷新后重试");
        }
        if (entry == null)
        {
            return new StoreDeleteResult(false);
        }

        var previousJson = entry.Json;
        var droppedFileIds = StoredFileService.ReferencedFileIds(entry.Json);
        db.StoreEntries.Remove(entry);
        await db.SaveChangesAsync(ct);
        await storedFiles.ReleaseAsync(droppedFileIds, ct);
        await transaction.CommitAsync(ct);
        return new StoreDeleteResult(true, previousJson);
    }
}

/// <summary>单个 key 的读取结果。</summary>
public record StoreReadResult(bool Found, string? Json, string EntityTag);

/// <summary>
/// 写操作结果：Success=false 且 Error 非空表示校验失败。
/// PreviousJson 是写入前的值（新 key 为 null），供操作日志比较改了什么。
/// </summary>
public record StoreWriteResult(
    bool Success,
    string? Error,
    string? Json,
    string? PreviousJson = null,
    bool PreconditionFailed = false)
{
    public static StoreWriteResult Ok(string? json = null, string? previousJson = null) =>
        new(true, null, json, previousJson);

    public static StoreWriteResult Validation(string message) => new(false, message, null);

    public static StoreWriteResult Precondition(string message) =>
        new(false, message, null, PreconditionFailed: true);
}

/// <summary>删除结果：Found=false 表示 key 不存在；PreviousJson 是删掉的值。</summary>
public record StoreDeleteResult(
    bool Found,
    string? PreviousJson = null,
    bool PreconditionFailed = false,
    string? Error = null)
{
    public static StoreDeleteResult Precondition(string message) =>
        new(false, PreconditionFailed: true, Error: message);
}

public sealed record StoreBatchChange(string Key, JsonElement? Expected, JsonElement? Value);

public sealed record StoreBatchResult(
    bool Success,
    string? Error,
    string? ConflictKey,
    IReadOnlyDictionary<string, string?> Values,
    IReadOnlyDictionary<string, string?> PreviousValues)
{
    public static StoreBatchResult Ok(
        IReadOnlyDictionary<string, string?> values,
        IReadOnlyDictionary<string, string?> previousValues) =>
        new(true, null, null, values, previousValues);

    public static StoreBatchResult Validation(string message) =>
        new(false, message, null, new Dictionary<string, string?>(), new Dictionary<string, string?>());

    public static StoreBatchResult Conflict(string key) =>
        new(
            false,
            "数据已被其他用户修改，请刷新后重试",
            key,
            new Dictionary<string, string?>(),
            new Dictionary<string, string?>());
}

/// <summary>实体分类排序的后端存储形状。</summary>
public sealed record EntityGroupPayload(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("items")] IReadOnlyList<string> Items,
    [property: JsonPropertyName("configurations"),
     JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    IReadOnlyList<EntityConfigurationPayload>? Configurations = null,
    [property: JsonPropertyName("machineType"),
     JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? MachineType = null,
    [property: JsonPropertyName("regions"),
     JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    IReadOnlyDictionary<string, string>? Regions = null);

/// <summary>机型分类下的配置层级，数组顺序即显示顺序。</summary>
public sealed record EntityConfigurationPayload(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("items")] IReadOnlyList<string> Items);
