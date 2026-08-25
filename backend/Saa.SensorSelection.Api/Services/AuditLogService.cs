using System.Net;
using System.Security.Claims;

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
    string? Error);

public record AuditLogPage(IReadOnlyList<AuditLogItem> Items, int Total);

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
        CancellationToken ct = default)
    {
        try
        {
            username ??= http.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
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

    /// <summary>分页查询操作日志（按时间倒序），支持按用户/操作/结果/时间范围筛选。</summary>
    public async Task<AuditLogPage> QueryAsync(
        int page = 1,
        int pageSize = 20,
        string? action = null,
        string? username = null,
        string? target = null,
        bool? result = null,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
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
            query = query.Where(log => log.Username == username);
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
        var items = await query
            .OrderByDescending(log => log.Id)
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
                log.Error))
            .ToArrayAsync(ct);

        return new AuditLogPage(
            items.Select(item => item with
            {
                Detail = NormalizeDetail(item),
                Ip = NormalizeIp(item.Ip),
            }).ToArray(),
            total);
    }
}
