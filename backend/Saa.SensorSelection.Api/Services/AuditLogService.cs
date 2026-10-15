using System.Net;
using System.Security.Claims;
using System.Text.RegularExpressions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Models;

namespace Saa.SensorSelection.Api.Services;

/// <summary>审计日志保留上限配置（Audit 节）。0 = 不限制。</summary>
public class AuditOptions
{
    public const string SectionName = "Audit";

    /// <summary>最多保留的日志条数，超出后清理最旧记录（默认 50000，0 = 不限制）。</summary>
    public int MaxEntries { get; set; } = 50_000;
}

public record AuditLogItem(
    int Id,
    DateTimeOffset Timestamp,
    string? Username,
    string Action,
    string? Target,
    string? Detail,
    string? Ip,
    bool Result,
    string? Error,
    string? Changes = null,
    string? OperationId = null,
    string? OperationLabel = null);

public record AuditLogPage(IReadOnlyList<AuditLogItem> Items, int Total);

/// <summary>
/// 一次操作：同一个操作编号下的全部日志。列表按操作分页，一行就是用户在界面上做的一件事。
/// Result 只有全部成功才为 true；Entries 最多 <see cref="AuditLogService.MaxEntriesPerOperation"/> 条，
/// EntryCount 是实际条数。
/// </summary>
public record AuditOperationItem(
    string OperationId,
    string? Label,
    DateTimeOffset Timestamp,
    string? Username,
    string? DisplayName,
    string? Ip,
    bool Result,
    int EntryCount,
    IReadOnlyList<AuditLogItem> Entries);

public record AuditOperationPage(IReadOnlyList<AuditOperationItem> Items, int Total);

/// <summary>
/// 操作日志写入与查询。
/// 写入从当前请求自动取用户名/IP（匿名场景可显式传入），
/// 审计写入失败只记日志、绝不中断主业务请求；超上限时清理最旧记录。
/// </summary>
public class AuditLogService(
    AppDbContext db,
    IHttpContextAccessor http,
    IOptions<AuditOptions> options,
    ILogger<AuditLogService> logger)
{
    public const string OperationIdHeader = "X-Operation-Id";
    public const string OperationLabelHeader = "X-Operation-Label";
    public const int MaxEntriesPerOperation = 200;
    private const int MaxOperationLabel = 120;

    private static readonly Regex OperationIdPattern = new("^[A-Za-z0-9-]{8,64}$", RegexOptions.Compiled);

    /// <summary>
    /// 本次请求的操作编号：前端传来的编号加上用户名前缀（别人伪造同一个编号也串不进来），
    /// 没传或格式不对时每条日志单独一个编号。
    /// </summary>
    private string ResolveOperationId(string? username)
    {
        var header = http.HttpContext?.Request.Headers[OperationIdHeader].ToString();
        return !string.IsNullOrEmpty(header) && OperationIdPattern.IsMatch(header)
            ? $"{username ?? "anonymous"}:{header}"
            : Guid.NewGuid().ToString("N");
    }

    /// <summary>
    /// 操作类型：去掉操作名称里的具体对象，只留动作 + 对象种类。
    /// 「删除机型「04 特殊定位」」→「删除机型」，「新增选型记录 · 机型A」→「新增选型记录」。
    /// </summary>
    public static string? OperationKindOf(string? label)
    {
        if (string.IsNullOrWhiteSpace(label))
        {
            return null;
        }
        var end = label.Length;
        foreach (var marker in new[] { "「", " · " })
        {
            var at = label.IndexOf(marker, StringComparison.Ordinal);
            if (at > 0 && at < end)
            {
                end = at;
            }
        }
        var kind = label[..end].Trim();
        return kind.Length == 0 ? null : kind;
    }

    /// <summary>操作名称：请求头只能放 ASCII，前端按 URL 编码传中文。</summary>
    private string? ResolveOperationLabel()
    {
        var header = http.HttpContext?.Request.Headers[OperationLabelHeader].ToString();
        if (string.IsNullOrWhiteSpace(header))
        {
            return null;
        }
        string decoded;
        try
        {
            decoded = Uri.UnescapeDataString(header);
        }
        catch (UriFormatException)
        {
            return null;
        }
        var label = new string(decoded.Where(ch => !char.IsControl(ch)).ToArray()).Trim();
        if (label.Length == 0)
        {
            return null;
        }
        return label.Length <= MaxOperationLabel ? label : label[..MaxOperationLabel];
    }
    /// <summary>
    /// 将本机回环地址及 IPv4 映射 IPv6 地址统一为 IPv4 文本。
    /// 其他真实 IPv6 地址保持 IPv6，避免伪造或丢失客户端地址。
    /// </summary>
    public static string? NormalizeIp(string? ip)
    {
        if (string.IsNullOrWhiteSpace(ip) || !IPAddress.TryParse(ip, out var address))
        {
            return ip;
        }

        if (address.Equals(IPAddress.IPv6Loopback))
        {
            return IPAddress.Loopback.ToString();
        }

        return address.IsIPv4MappedToIPv6
            ? address.MapToIPv4().ToString()
            : address.ToString();
    }

    /// <summary>
    /// 为早期格式的日志补充可从既有字段确定的展示详情。
    /// 仅转换查询结果，不回写历史审计记录，避免改变原始证据。
    /// </summary>
    private static string? NormalizeDetail(AuditLogItem item)
    {
        var detail = item.Detail?.Trim();
        if (!string.IsNullOrWhiteSpace(detail))
        {
            if (item.Action == "store.upsert" &&
                TryReadCount(detail, "条记录", out var recordCount))
            {
                return $"数据类型：{(item.Result ? "数组" : "未记录")}；记录数：{recordCount}";
            }
            if (item.Action == "store.entity-groups.reorder" &&
                TryReadCount(detail, "个分类", out var groupCount))
            {
                return $"数据类型：数组；分类数：{groupCount}";
            }
            if (item.Action == "store.replace-all" &&
                TryReadCount(detail, "个 key", out var keyCount))
            {
                return $"数据类型：对象；key数：{keyCount}";
            }
            if ((item.Action == "role.create" || item.Action == "role.update") &&
                TryReadCount(detail, "项权限", out var permissionCount))
            {
                return $"权限数：{permissionCount}";
            }

            return detail;
        }

        return item.Action switch
        {
            "auth.login" => item.Result
                ? "登录成功"
                : $"登录失败；原因：{item.Error ?? "未记录"}",
            "auth.change-password" => item.Result ? "密码修改成功" : "密码修改失败",
            "org.delete" => $"组织ID：{TargetId(item.Target)}",
            "role.delete" => $"角色ID：{TargetId(item.Target)}",
            "store.delete" => item.Result
                ? $"删除目标：{item.Target ?? "未记录"}"
                : "删除目标不存在",
            "user.delete" => $"用户ID：{TargetId(item.Target)}",
            _ when !item.Result && !string.IsNullOrWhiteSpace(item.Error)
                => $"操作失败；原因：{item.Error}",
            _ => null,
        };
    }

    private static bool TryReadCount(string detail, string suffix, out int count)
    {
        count = 0;
        return detail.EndsWith(suffix, StringComparison.Ordinal) &&
            int.TryParse(detail[..^suffix.Length].Trim(), out count);
    }

    private static string TargetId(string? target)
    {
        return string.IsNullOrWhiteSpace(target) ? "未知" : target.TrimStart('#');
    }

    /// <summary>
    /// 写入一条操作日志。用户名/IP 默认从当前请求取，匿名场景（登录失败等）显式传入。
    /// </summary>
    public async Task WriteAsync(
        string action,
        string? target = null,
        string? detail = null,
        bool success = true,
        string? error = null,
        string? username = null,
        string? ip = null,
        string? changes = null,
        CancellationToken ct = default)
    {
        try
        {
            username ??= http.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            var operationId = ResolveOperationId(username);
            var operationLabel = ResolveOperationLabel();
            ip = NormalizeIp(ip ?? http.HttpContext?.Connection.RemoteIpAddress?.ToString());

            // 事务包裹：确保计数→删除→写入在同一个数据库快照内执行，
            // 避免并发请求同时 CountAsync 并重叠执行 ExecuteDeleteAsync 导致多删日志。
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            if (options.Value.MaxEntries > 0)
            {
                var toRemove = await db.AuditLogs.CountAsync(ct) - options.Value.MaxEntries + 1;
                if (toRemove > 0)
                {
                    var oldest = await db.AuditLogs
                        .OrderBy(log => log.Id)
                        .Take(toRemove)
                        .Select(log => log.Id)
                        .ToArrayAsync(ct);
                    await db.AuditLogs
                        .Where(log => oldest.Contains(log.Id))
                        .ExecuteDeleteAsync(ct);
                }
            }

            db.AuditLogs.Add(new AuditLog
            {
                Timestamp = DateTimeOffset.UtcNow,
                Username = username,
                Action = action,
                Target = target,
                Detail = detail,
                Ip = ip,
                Result = success,
                Error = error,
                OperationId = operationId,
                OperationLabel = operationLabel,
                OperationKind = OperationKindOf(operationLabel),
                Changes = changes,
            });

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            // 审计失败不应影响主业务：仅记录日志
            logger.LogError(
                ex,
                "写入操作日志失败：Action={Action} Target={Target}",
                action,
                target);
        }
    }

    /// <summary>
    /// 日志排序只能落在服务端：一页只有几十条，前端排序排不动整个结果集。
    /// 白名单之外的列一律回落到时间倒序，Id 兼作稳定的次级排序键。
    /// </summary>
    private static IQueryable<AuditLog> ApplyOrder(
        IQueryable<AuditLog> query,
        string? sort,
        string? direction)
    {
        var ascending = string.Equals(direction, "asc", StringComparison.OrdinalIgnoreCase);
        return sort?.Trim().ToLowerInvariant() switch
        {
            "username" => ascending
                ? query.OrderBy(log => log.Username).ThenBy(log => log.Id)
                : query.OrderByDescending(log => log.Username).ThenByDescending(log => log.Id),
            "action" => ascending
                ? query.OrderBy(log => log.Action).ThenBy(log => log.Id)
                : query.OrderByDescending(log => log.Action).ThenByDescending(log => log.Id),
            "result" => ascending
                ? query.OrderBy(log => log.Result).ThenBy(log => log.Id)
                : query.OrderByDescending(log => log.Result).ThenByDescending(log => log.Id),
            _ => ascending
                ? query.OrderBy(log => log.Id)
                : query.OrderByDescending(log => log.Id),
        };
    }

    /// <summary>分页查询操作日志（默认时间倒序），支持按用户/操作/结果/时间范围筛选与排序。</summary>
    public async Task<AuditLogPage> QueryAsync(
        int page = 1,
        int pageSize = 20,
        string? action = null,
        string? username = null,
        string? target = null,
        bool? result = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        string? sort = null,
        string? direction = null,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = db.AuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(action))
        {
            query = query.Where(log => log.Action == action);
        }
        if (!string.IsNullOrWhiteSpace(username))
        {
            // 工具栏是搜索框：按包含匹配，输入部分用户名也能筛到
            var keyword = username.Trim();
            query = query.Where(log => log.Username != null && log.Username.Contains(keyword));
        }
        if (!string.IsNullOrWhiteSpace(target))
        {
            query = query.Where(log => log.Target == target);
        }
        if (result is bool expected)
        {
            query = query.Where(log => log.Result == expected);
        }
        if (from is not null)
        {
            query = query.Where(log => log.Timestamp >= from.Value);
        }
        if (to is not null)
        {
            query = query.Where(log => log.Timestamp <= to.Value);
        }

        var total = await query.CountAsync(ct);
        var items = await ApplyOrder(query, sort, direction)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(log => new AuditLogItem(
                log.Id,
                log.Timestamp,
                log.Username,
                log.Action,
                log.Target,
                log.Detail,
                log.Ip,
                log.Result,
                log.Error,
                log.Changes,
                log.OperationId,
                log.OperationLabel))
            .ToArrayAsync(ct);

        return new AuditLogPage(
            items.Select(item => item with
            {
                Detail = NormalizeDetail(item),
                Ip = NormalizeIp(item.Ip),
            }).ToArray(),
            total);
    }

    /// <summary>日志里出现过的操作类型（没有操作名称的用操作码），供日志页的「操作」筛选。</summary>
    public async Task<IReadOnlyList<string>> ListOperationKindsAsync(CancellationToken ct = default)
    {
        return await db.AuditLogs.AsNoTracking()
            .Select(log => log.OperationKind ?? log.Action)
            .Distinct()
            .OrderBy(kind => kind)
            .ToListAsync(ct);
    }

    /// <summary>
    /// 按操作分页查询：先按条件筛出日志，再按操作编号归组（任一条命中，整组都显示），
    /// 按组里最新一条倒序。keyword 同时搜用户名、显示名、操作名称、目标、详情、失败原因和变更明细。
    /// </summary>
    public async Task<AuditOperationPage> QueryOperationsAsync(
        int page = 1,
        int pageSize = 20,
        string? keyword = null,
        IReadOnlyCollection<string>? actions = null,
        bool? result = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        bool hideLogin = false,
        IReadOnlyCollection<string>? kinds = null,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = db.AuditLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(keyword))
        {
            var text = keyword.Trim();
            var matchedUsers = await db.Users.AsNoTracking()
                .Where(user => user.DisplayName.Contains(text))
                .Select(user => user.Username)
                .ToListAsync(ct);
            query = query.Where(log =>
                (log.Username != null && (log.Username.Contains(text) || matchedUsers.Contains(log.Username))) ||
                (log.OperationLabel != null && log.OperationLabel.Contains(text)) ||
                (log.Target != null && log.Target.Contains(text)) ||
                (log.Detail != null && log.Detail.Contains(text)) ||
                (log.Error != null && log.Error.Contains(text)) ||
                (log.Changes != null && log.Changes.Contains(text)));
        }
        if (actions is { Count: > 0 })
        {
            query = query.Where(log => actions.Contains(log.Action));
        }
        if (kinds is { Count: > 0 })
        {
            // 有操作名称的按操作类型，没有的（登录、直接调接口的写入）按操作码
            query = query.Where(log => kinds.Contains(log.OperationKind ?? log.Action));
        }
        if (hideLogin)
        {
            query = query.Where(log => log.Action != "auth.login");
        }
        if (result == false)
        {
            query = query.Where(log => !log.Result);
        }
        else if (result == true)
        {
            // 一次操作只有全部成功才算成功：有任一条失败的整组都不算
            query = query.Where(log => !db.AuditLogs.Any(other => other.OperationId == log.OperationId && !other.Result));
        }
        if (from is not null)
        {
            query = query.Where(log => log.Timestamp >= from.Value);
        }
        if (to is not null)
        {
            query = query.Where(log => log.Timestamp <= to.Value);
        }

        var groups = query
            .GroupBy(log => log.OperationId)
            .Select(group => new { OperationId = group.Key, LastId = group.Max(log => log.Id) });
        var total = await groups.CountAsync(ct);
        var pageGroups = await groups
            .OrderByDescending(group => group.LastId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);
        var operationIds = pageGroups.Select(group => group.OperationId).ToList();

        var rows = await db.AuditLogs.AsNoTracking()
            .Where(log => operationIds.Contains(log.OperationId))
            .OrderBy(log => log.Id)
            .Select(log => new AuditLogItem(
                log.Id,
                log.Timestamp,
                log.Username,
                log.Action,
                log.Target,
                log.Detail,
                log.Ip,
                log.Result,
                log.Error,
                log.Changes,
                log.OperationId,
                log.OperationLabel))
            .ToListAsync(ct);
        var usernames = rows.Select(row => row.Username).OfType<string>().Distinct().ToList();
        var displayNames = await db.Users.AsNoTracking()
            .Where(user => usernames.Contains(user.Username))
            .ToDictionaryAsync(user => user.Username, user => user.DisplayName, ct);

        var byOperation = rows
            .Select(row => row with { Detail = NormalizeDetail(row), Ip = NormalizeIp(row.Ip) })
            .GroupBy(row => row.OperationId ?? "")
            .ToDictionary(group => group.Key, group => group.ToList());
        var items = pageGroups.Select(group =>
        {
            var entries = byOperation.GetValueOrDefault(group.OperationId ?? "") ?? [];
            var username = entries.Select(entry => entry.Username).FirstOrDefault(name => name is not null);
            return new AuditOperationItem(
                group.OperationId ?? "",
                entries.Select(entry => entry.OperationLabel).FirstOrDefault(label => label is not null),
                entries.Count > 0 ? entries[^1].Timestamp : DateTimeOffset.MinValue,
                username,
                username is not null ? displayNames.GetValueOrDefault(username) : null,
                entries.Select(entry => entry.Ip).FirstOrDefault(ip => ip is not null),
                entries.All(entry => entry.Result),
                entries.Count,
                entries.Take(MaxEntriesPerOperation).ToList());
        }).ToList();

        return new AuditOperationPage(items, total);
    }
}
