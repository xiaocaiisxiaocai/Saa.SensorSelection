using System.Security.Claims;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

using Symtek.Api.Data;
using Symtek.Api.Models;

namespace Symtek.Api.Services;

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
            ip ??= http.HttpContext?.Connection.RemoteIpAddress?.ToString();

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

            // 保留上限：超出后先清理最旧记录再写入（只在本批次内检查，避免高频统计）
            if (options.Value.MaxEntries > 0)
            {
                var toRemove = await db.AuditLogs.CountAsync(ct) - options.Value.MaxEntries;
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

            await db.SaveChangesAsync(ct);
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

        return new AuditLogPage(items, total);
    }
}
