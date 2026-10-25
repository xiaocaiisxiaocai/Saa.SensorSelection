using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 操作日志的变更明细：比较写入前后的内容，记下新增 / 删除 / 修改了哪些记录，
/// 修改的记录再记下哪些字段从什么改成什么。
///
/// 数据仓库的值是 JSON 数组，按记录的 id（没有 id 用 name，标量数组用值本身）配对；
/// 用户 / 角色 / 组织用 <see cref="DiffRecord"/> 比较两份字段快照。
/// 明细只用于审计展示：每类最多 <see cref="MaxRows"/> 条、每个值最多 <see cref="MaxValue"/> 字，
/// 超出时 Truncated=true，总数仍在 *Count 里。
/// </summary>
public static class AuditChanges
{
    public const int MaxRows = 50;
    public const int MaxFields = 40;
    public const int MaxValue = 300;
    private const int MaxLabel = 60;

    /// <summary>挑记录名称时依次看这些字段。</summary>
    private static readonly string[] LabelFields =
        ["name", "model", "fileName", "title", "content", "problem", "type", "layer", "username", "code"];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        // 中文原样存：日志搜索按包含匹配，转义成 \uXXXX 就搜不到了
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public sealed record FieldChange(string Name, string? Before, string? After);

    public sealed record RowChange(string Label, IReadOnlyList<FieldChange> Fields);

    public sealed record Summary(
        IReadOnlyList<RowChange> Added,
        IReadOnlyList<RowChange> Removed,
        IReadOnlyList<RowChange> Modified,
        int AddedCount,
        int RemovedCount,
        int ModifiedCount,
        bool Reordered,
        bool Truncated);

    /// <summary>比较两份 JSON 数组（null 视为空数组）。没有任何变化时返回 null。</summary>
    public static string? DiffArrays(string? beforeJson, string? afterJson)
    {
        var before = ReadRows(beforeJson);
        var after = ReadRows(afterJson);
        if (before is null || after is null)
        {
            return null;
        }

        var beforeByKey = before.ToDictionary(row => row.Key);
        var afterByKey = after.ToDictionary(row => row.Key);

        var added = after.Where(row => !beforeByKey.ContainsKey(row.Key))
            .Select(row => new RowChange(row.Label, Snapshot(row.Fields, isBefore: false)))
            .ToList();
        var removed = before.Where(row => !afterByKey.ContainsKey(row.Key))
            .Select(row => new RowChange(row.Label, Snapshot(row.Fields, isBefore: true)))
            .ToList();
        var modified = new List<RowChange>();
        foreach (var row in after)
        {
            if (!beforeByKey.TryGetValue(row.Key, out var previous))
            {
                continue;
            }
            var fields = CompareFields(previous.Fields, row.Fields);
            if (fields.Count > 0)
            {
                modified.Add(new RowChange(row.Label, fields));
            }
        }

        var reordered = false;
        if (added.Count == 0 && removed.Count == 0)
        {
            reordered = !before.Select(row => row.Key).SequenceEqual(after.Select(row => row.Key));
        }

        return Serialize(added, removed, modified, reordered);
    }

    /// <summary>
    /// 比较一条记录的两份字段快照（字段名直接用中文）。before 为 null 是新建，
    /// after 为 null 是删除。没有任何变化时返回 null。
    /// </summary>
    public static string? DiffRecord(
        string label,
        IReadOnlyList<KeyValuePair<string, string?>>? before,
        IReadOnlyList<KeyValuePair<string, string?>>? after)
    {
        var added = new List<RowChange>();
        var removed = new List<RowChange>();
        var modified = new List<RowChange>();
        if (before is null && after is not null)
        {
            added.Add(new RowChange(label, Snapshot(after, isBefore: false)));
        }
        else if (before is not null && after is null)
        {
            removed.Add(new RowChange(label, Snapshot(before, isBefore: true)));
        }
        else if (before is not null && after is not null)
        {
            var fields = CompareFields(before, after);
            if (fields.Count > 0)
            {
                modified.Add(new RowChange(label, fields));
            }
        }

        return Serialize(added, removed, modified, reordered: false);
    }

    private static string? Serialize(
        List<RowChange> added,
        List<RowChange> removed,
        List<RowChange> modified,
        bool reordered)
    {
        if (added.Count == 0 && removed.Count == 0 && modified.Count == 0 && !reordered)
        {
            return null;
        }

        var truncated = added.Count > MaxRows || removed.Count > MaxRows || modified.Count > MaxRows;
        var summary = new Summary(
            added.Take(MaxRows).ToList(),
            removed.Take(MaxRows).ToList(),
            modified.Take(MaxRows).ToList(),
            added.Count,
            removed.Count,
            modified.Count,
            reordered,
            truncated);
        return JsonSerializer.Serialize(summary, JsonOptions);
    }

    private sealed record Row(string Key, string Label, IReadOnlyList<KeyValuePair<string, string?>> Fields);

    private static List<Row>? ReadRows(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(json);
        }
        catch (JsonException)
        {
            return null;
        }

        using (document)
        {
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var rows = new List<Row>();
            var seen = new Dictionary<string, int>(StringComparer.Ordinal);
            var index = 0;
            foreach (var element in document.RootElement.EnumerateArray())
            {
                index++;
                var (key, label, fields) = element.ValueKind == JsonValueKind.Object
                    ? ReadObject(element, index)
                    : ("value:" + element.GetRawText(), Truncate(FormatValue(element) ?? "", MaxLabel), []);
                // 同一个键出现多次（数据本身重复）时按出现次序区分，保证能配对
                var occurrence = seen.TryGetValue(key, out var count) ? count + 1 : 1;
                seen[key] = occurrence;
                rows.Add(new Row(occurrence == 1 ? key : $"{key}#{occurrence}", label, fields));
            }

            return rows;
        }
    }

    private static (string Key, string Label, IReadOnlyList<KeyValuePair<string, string?>> Fields) ReadObject(
        JsonElement element,
        int index)
    {
        var fields = new List<KeyValuePair<string, string?>>();
        string? id = null;
        string? name = null;
        foreach (var property in element.EnumerateObject())
        {
            if (property.NameEquals("id"))
            {
                id = property.Value.GetRawText();
                continue;
            }
            if (property.NameEquals("name") && property.Value.ValueKind == JsonValueKind.String)
            {
                name = property.Value.GetString();
            }
            fields.Add(new KeyValuePair<string, string?>(property.Name, FormatValue(property.Value)));
        }

        var key = id is not null ? "id:" + id : name is not null ? "name:" + name : "row:" + element.GetRawText();
        var label = LabelFields
            .Select(field => fields.FirstOrDefault(pair => pair.Key == field).Value)
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
        label ??= id is not null ? $"#{id.Trim('"')}" : $"第 {index} 条";
        return (key, Truncate(label, MaxLabel), fields);
    }

    /// <summary>把一个 JSON 值写成人能读的一行字。</summary>
    private static string? FormatValue(JsonElement value)
    {
        var text = value.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            JsonValueKind.String => value.GetString(),
            JsonValueKind.True => "是",
            JsonValueKind.False => "否",
            JsonValueKind.Array => string.Join("、", value.EnumerateArray().Select(FormatItem)),
            JsonValueKind.Object when IsTextMap(value) => string.Join(
                "、",
                value.EnumerateObject().Select(property => $"{property.Name}：{property.Value.GetString()}")),
            JsonValueKind.Object => FormatItem(value),
            _ => value.GetRawText(),
        };
        return text is null ? null : Truncate(text, MaxValue);
    }

    /// <summary>没有 name、值全是字符串的对象（如客户厂区 → 区域）按「键：值」逐项写。</summary>
    private static bool IsTextMap(JsonElement value)
    {
        return !value.TryGetProperty("name", out _) &&
            value.EnumerateObject().All(property => property.Value.ValueKind == JsonValueKind.String);
    }

    /// <summary>数组里的一项：有名字的对象写名字（带下级条目），其余写原文。</summary>
    private static string FormatItem(JsonElement item)
    {
        if (item.ValueKind == JsonValueKind.String)
        {
            return item.GetString() ?? "";
        }
        if (item.ValueKind == JsonValueKind.Object &&
            item.TryGetProperty("name", out var name) &&
            name.ValueKind == JsonValueKind.String)
        {
            var text = name.GetString() ?? "";
            if (item.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
            {
                text += "（" + string.Join("、", items.EnumerateArray().Select(FormatItem)) + "）";
            }
            return text;
        }
        if (item.ValueKind == JsonValueKind.Object &&
            item.TryGetProperty("fileName", out var fileName) &&
            fileName.ValueKind == JsonValueKind.String)
        {
            return fileName.GetString() ?? "";
        }
        return item.ValueKind is JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False
            ? FormatValue(item) ?? ""
            : item.GetRawText();
    }

    private static List<FieldChange> Snapshot(IEnumerable<KeyValuePair<string, string?>> fields, bool isBefore)
    {
        return fields
            .Where(pair => !string.IsNullOrWhiteSpace(pair.Value))
            .Take(MaxFields)
            .Select(pair => isBefore
                ? new FieldChange(pair.Key, pair.Value, null)
                : new FieldChange(pair.Key, null, pair.Value))
            .ToList();
    }

    private static List<FieldChange> CompareFields(
        IReadOnlyList<KeyValuePair<string, string?>> before,
        IReadOnlyList<KeyValuePair<string, string?>> after)
    {
        var beforeMap = ToMap(before);
        var afterMap = ToMap(after);
        var names = before.Select(pair => pair.Key)
            .Concat(after.Select(pair => pair.Key).Where(name => !beforeMap.ContainsKey(name)));
        var changes = new List<FieldChange>();
        foreach (var name in names)
        {
            beforeMap.TryGetValue(name, out var previous);
            afterMap.TryGetValue(name, out var next);
            // 空串和缺字段在界面上是一回事，不算改动
            if (string.IsNullOrEmpty(previous) && string.IsNullOrEmpty(next))
            {
                continue;
            }
            if (!string.Equals(previous, next, StringComparison.Ordinal))
            {
                changes.Add(new FieldChange(name, previous, next));
            }
        }

        return changes.Take(MaxFields).ToList();
    }

    private static Dictionary<string, string?> ToMap(IEnumerable<KeyValuePair<string, string?>> fields)
    {
        var map = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var pair in fields)
        {
            map[pair.Key] = pair.Value;
        }
        return map;
    }

    private static string Truncate(string text, int max)
    {
        return text.Length <= max ? text : text[..max] + "…";
    }
}
