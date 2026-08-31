using System.Text.Json;
using System.Text.Json.Nodes;

using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;

namespace Saa.SensorSelection.Api.Services;

/// <summary>将 Store JSON 中内嵌的 data URL 剥离到 StoredFiles 表，并维护文件引用生命周期。</summary>
public class StoredFileService(AppDbContext db)
{
    private const int MaxFileBytes = 64 * 1024 * 1024;
    private const string FileRoutePrefix = "/api/files/";
    private const string FileRouteSuffix = "/content";

    public FileDetachmentResult Detach(JsonElement value, bool preserveInvalidLegacyData = false)
    {
        var node = JsonNode.Parse(value.GetRawText());
        if (node is null) return FileDetachmentResult.Validation("文件数据为空");
        var files = new List<StoredFile>();
        var error = DetachNode(node, files, preserveInvalidLegacyData);
        return error is null
            ? FileDetachmentResult.Ok(node.ToJsonString(), files)
            : FileDetachmentResult.Validation(error);
    }

    /// <summary>启动时幂等迁移历史 data URL；非法旧值原样保留，避免迁移造成数据丢失。</summary>
    public async Task MigrateLegacyDataUrlsAsync()
    {
        var entries = await db.StoreEntries.ToListAsync();
        var changed = false;
        foreach (var entry in entries)
        {
            using var document = JsonDocument.Parse(entry.Json);
            var result = Detach(document.RootElement, preserveInvalidLegacyData: true);
            if (!result.Success || result.Files.Count == 0) continue;
            db.StoredFiles.AddRange(result.Files);
            entry.Json = result.Json!;
            entry.UpdatedAt = DateTime.UtcNow;
            changed = true;
        }

        if (changed) await db.SaveChangesAsync();
        await DeleteOrphansAsync();
    }

    /// <summary>删除已不再被任何 StoreEntry 引用的文件，替换/删除记录不会遗留大块数据。</summary>
    public async Task DeleteOrphansAsync()
    {
        var referenced = new HashSet<Guid>();
        var jsonValues = await db.StoreEntries.AsNoTracking().Select(entry => entry.Json).ToListAsync();
        foreach (var json in jsonValues)
        {
            try
            {
                CollectFileIds(JsonNode.Parse(json), referenced);
            }
            catch (JsonException)
            {
                // 损坏的历史记录不应导致清理误删文件。
                return;
            }
        }

        if (referenced.Count == 0)
        {
            await db.StoredFiles.ExecuteDeleteAsync();
            return;
        }
        await db.StoredFiles.Where(file => !referenced.Contains(file.Id)).ExecuteDeleteAsync();
    }

    public static string ContentUrl(Guid id) => $"{FileRoutePrefix}{id:D}{FileRouteSuffix}";

    public static bool TryParseContentUrl(string? value, out Guid id)
    {
        id = Guid.Empty;
        if (string.IsNullOrWhiteSpace(value) ||
            !value.StartsWith(FileRoutePrefix, StringComparison.OrdinalIgnoreCase) ||
            !value.EndsWith(FileRouteSuffix, StringComparison.OrdinalIgnoreCase)) return false;
        var rawId = value[FileRoutePrefix.Length..^FileRouteSuffix.Length];
        return Guid.TryParse(rawId, out id);
    }

    private static string? DetachNode(
        JsonNode node,
        ICollection<StoredFile> files,
        bool preserveInvalidLegacyData)
    {
        if (node is JsonArray array)
        {
            foreach (var child in array)
            {
                if (child is null) continue;
                var error = DetachNode(child, files, preserveInvalidLegacyData);
                if (error is not null) return error;
            }
            return null;
        }
        if (node is not JsonObject obj) return null;

        if (obj["dataUrl"] is JsonValue dataValue &&
            dataValue.TryGetValue<string>(out var dataUrl) &&
            dataUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            var parsed = TryDecodeDataUrl(dataUrl);
            if (!parsed.Success) return preserveInvalidLegacyData ? null : parsed.Error;

            var file = new StoredFile
            {
                Id = Guid.NewGuid(),
                FileName = SafeFileName(obj["fileName"]?.GetValue<string>()),
                MimeType = parsed.MimeType!,
                Size = parsed.Content!.LongLength,
                Content = parsed.Content,
                CreatedAt = DateTime.UtcNow,
            };
            files.Add(file);
            obj["fileId"] = file.Id.ToString("D");
            obj["dataUrl"] = ContentUrl(file.Id);
            obj["mimeType"] = file.MimeType;
            obj["size"] = file.Size;
        }

        foreach (var property in obj.ToList())
        {
            if (property.Value is null || property.Key is "dataUrl" or "fileId") continue;
            var error = DetachNode(property.Value, files, preserveInvalidLegacyData);
            if (error is not null) return error;
        }
        return null;
    }

    private static void CollectFileIds(JsonNode? node, ISet<Guid> result)
    {
        if (node is JsonArray array)
        {
            foreach (var child in array) CollectFileIds(child, result);
            return;
        }
        if (node is not JsonObject obj) return;

        if (obj["fileId"] is JsonValue idValue &&
            idValue.TryGetValue<string>(out var rawId) &&
            Guid.TryParse(rawId, out var fileId)) result.Add(fileId);
        else if (obj["dataUrl"] is JsonValue sourceValue &&
                 sourceValue.TryGetValue<string>(out var source) &&
                 TryParseContentUrl(source, out fileId)) result.Add(fileId);

        foreach (var property in obj) CollectFileIds(property.Value, result);
    }

    private static DataUrlDecodeResult TryDecodeDataUrl(string value)
    {
        var separator = value.IndexOf(',');
        if (separator <= 5 || separator == value.Length - 1)
            return DataUrlDecodeResult.Validation("文件 data URL 格式无效");

        var headerParts = value[5..separator].Split(';', StringSplitOptions.RemoveEmptyEntries);
        if (headerParts.Length < 2 ||
            !headerParts.Skip(1).Any(part => part.Equals("base64", StringComparison.OrdinalIgnoreCase)))
            return DataUrlDecodeResult.Validation("文件必须使用 Base64 data URL");

        byte[] content;
        try { content = Convert.FromBase64String(value[(separator + 1)..]); }
        catch (FormatException) { return DataUrlDecodeResult.Validation("文件 Base64 内容无效"); }

        if (content.Length == 0 || content.Length > MaxFileBytes)
            return DataUrlDecodeResult.Validation($"单个文件大小必须为 1-{MaxFileBytes / 1024 / 1024} MB");

        var mimeType = headerParts[0].Trim();
        if (mimeType.Length == 0 || mimeType.Length > 120 || mimeType.Any(char.IsControl))
            mimeType = "application/octet-stream";
        return DataUrlDecodeResult.Ok(content, mimeType);
    }

    private static string SafeFileName(string? value)
    {
        var fileName = Path.GetFileName((value ?? string.Empty).Trim());
        if (fileName.Length == 0) return "file";
        return fileName.Length <= 200 ? fileName : fileName[..200];
    }

    private sealed record DataUrlDecodeResult(bool Success, byte[]? Content, string? MimeType, string? Error)
    {
        public static DataUrlDecodeResult Ok(byte[] content, string mimeType) => new(true, content, mimeType, null);
        public static DataUrlDecodeResult Validation(string error) => new(false, null, null, error);
    }
}

public sealed record FileDetachmentResult(
    bool Success,
    string? Json,
    string? Error,
    IReadOnlyList<StoredFile> Files)
{
    public static FileDetachmentResult Ok(string json, IReadOnlyList<StoredFile> files) =>
        new(true, json, null, files);

    public static FileDetachmentResult Validation(string error) =>
        new(false, null, error, Array.Empty<StoredFile>());
}
