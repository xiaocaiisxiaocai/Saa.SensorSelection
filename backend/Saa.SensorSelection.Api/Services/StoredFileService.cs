using System.Text.Json;
using System.Text.Json.Nodes;

using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;

namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// StoredFiles 表的唯一出入口：multipart 上传与按需流式读取（经 SqliteBlob 分块读写，
/// 不把整份文件读进内存），兼容剥离 Store JSON 中的历史 data URL，并维护文件引用生命周期。
/// </summary>
public class StoredFileService(AppDbContext db)
{
    public const int MaxFileBytes = 64 * 1024 * 1024;

    /// <summary>上传后到写入 Store 之间的保护期；超过保护期仍无引用的上传视为放弃。</summary>
    private static readonly TimeSpan PendingUploadGrace = TimeSpan.FromHours(1);

    private const string ContentTable = "StoredFiles";
    private const string ContentColumn = "Content";
    private const string FileRoutePrefix = "/api/files/";
    private const string FileRouteSuffix = "/content";

    /// <summary>
    /// 保存一次 multipart 上传：先以 zeroblob 占位插入，再把请求流分块写进 BLOB，
    /// 整个过程在同一事务内，失败不会留下半截文件。
    /// </summary>
    public async Task<StoredFileUploadResult> SaveUploadAsync(IFormFile upload, CancellationToken ct = default)
    {
        if (upload.Length <= 0 || upload.Length > MaxFileBytes)
            return StoredFileUploadResult.Validation($"单个文件大小必须为 1 B-{MaxFileBytes / 1024 / 1024} MB");

        var file = new StoredFile
        {
            Id = Guid.NewGuid(),
            FileName = SafeFileName(upload.FileName),
            MimeType = SafeMimeType(upload.ContentType),
            Size = upload.Length,
            CreatedAt = DateTime.UtcNow,
        };

        var connection = (SqliteConnection)db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(ct);
            var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText =
                $"INSERT INTO {ContentTable} (Id, FileName, MimeType, Size, {ContentColumn}, CreatedAt) " +
                "VALUES ($id, $fileName, $mimeType, $size, zeroblob($size), $createdAt); " +
                "SELECT last_insert_rowid();";
            insert.Parameters.AddWithValue("$id", StorageId(file.Id));
            insert.Parameters.AddWithValue("$fileName", file.FileName);
            insert.Parameters.AddWithValue("$mimeType", file.MimeType);
            insert.Parameters.AddWithValue("$size", file.Size);
            insert.Parameters.AddWithValue("$createdAt", file.CreatedAt);
            var rowId = (long)(await insert.ExecuteScalarAsync(ct))!;

            await using (var source = upload.OpenReadStream())
            await using (var target = new SqliteBlob(connection, ContentTable, ContentColumn, rowId))
            {
                await source.CopyToAsync(target, ct);
            }

            await transaction.CommitAsync(ct);
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }

        await SweepAsync(ct);
        return StoredFileUploadResult.Ok(file);
    }

    /// <summary>
    /// 打开文件正文的只读流。流基于独立连接上的 SqliteBlob，调用方负责在响应结束后释放连接。
    /// </summary>
    public async Task<StoredFileContent?> OpenReadAsync(Guid id, CancellationToken ct = default)
    {
        var connection = new SqliteConnection(db.Database.GetConnectionString());
        try
        {
            await connection.OpenAsync(ct);
            var query = connection.CreateCommand();
            query.CommandText = $"SELECT rowid, FileName, MimeType FROM {ContentTable} WHERE Id = $id";
            query.Parameters.AddWithValue("$id", StorageId(id));
            long rowId;
            string fileName;
            string mimeType;
            await using (var reader = await query.ExecuteReaderAsync(ct))
            {
                if (!await reader.ReadAsync(ct))
                {
                    await connection.DisposeAsync();
                    return null;
                }

                rowId = reader.GetInt64(0);
                fileName = reader.GetString(1);
                mimeType = reader.GetString(2);
            }

            var stream = new SqliteBlob(connection, ContentTable, ContentColumn, rowId, readOnly: true);
            return new StoredFileContent(fileName, mimeType, stream, connection);
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

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
        await SweepAsync();
    }

    /// <summary>提取一段 Store JSON 引用的全部文件 id；无法解析的 JSON 返回空集。</summary>
    public static HashSet<Guid> ReferencedFileIds(string? json)
    {
        var result = new HashSet<Guid>();
        if (string.IsNullOrEmpty(json)) return result;
        try
        {
            CollectFileIds(JsonNode.Parse(json), result);
        }
        catch (JsonException)
        {
            // 损坏的历史记录不参与增量释放，交给全量清理的保守分支处理。
        }
        return result;
    }

    /// <summary>
    /// 释放本次写入不再引用的文件：只要任一 Store 记录仍提到该 id 就保留。
    /// 只检查本次变动涉及的 id，避免每次写入都解析整个数据仓库。
    /// </summary>
    public async Task ReleaseAsync(IEnumerable<Guid> candidates, CancellationToken ct = default)
    {
        var unreferenced = new List<Guid>();
        foreach (var id in candidates.Distinct())
        {
            var pattern = $"%{id:D}%";
            var stillReferenced = await db.StoreEntries.AsNoTracking()
                .AnyAsync(entry => EF.Functions.Like(entry.Json, pattern), ct);
            if (!stillReferenced) unreferenced.Add(id);
        }

        if (unreferenced.Count == 0) return;
        await db.StoredFiles.Where(file => unreferenced.Contains(file.Id)).ExecuteDeleteAsync(ct);
    }

    /// <summary>
    /// 全量清理：删除不被任何 StoreEntry 引用、且已过上传保护期的文件
    /// （保护期内的文件可能是刚上传、尚未写入 Store 的附件）。
    /// </summary>
    public async Task SweepAsync(CancellationToken ct = default)
    {
        var referenced = new HashSet<Guid>();
        var jsonValues = await db.StoreEntries.AsNoTracking().Select(entry => entry.Json).ToListAsync(ct);
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

        var cutoff = DateTime.UtcNow - PendingUploadGrace;
        await db.StoredFiles
            .Where(file => file.CreatedAt < cutoff && !referenced.Contains(file.Id))
            .ExecuteDeleteAsync(ct);
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

        return DataUrlDecodeResult.Ok(content, SafeMimeType(headerParts[0]));
    }

    private static string SafeMimeType(string? value)
    {
        var mimeType = (value ?? string.Empty).Trim();
        return mimeType.Length == 0 || mimeType.Length > 120 || mimeType.Any(char.IsControl)
            ? "application/octet-stream"
            : mimeType;
    }

    /// <summary>EF Core 的 SQLite 提供程序把 Guid 存成大写 TEXT，原生 SQL 必须使用同一形式。</summary>
    private static string StorageId(Guid id) => id.ToString("D").ToUpperInvariant();

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

public sealed record StoredFileUploadResult(bool Success, StoredFile? File, string? Error)
{
    public static StoredFileUploadResult Ok(StoredFile file) => new(true, file, null);

    public static StoredFileUploadResult Validation(string error) => new(false, null, error);
}

/// <summary>文件正文的只读流；Connection 必须在流读完后释放。</summary>
public sealed record StoredFileContent(
    string FileName,
    string MimeType,
    Stream Content,
    SqliteConnection Connection);

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
