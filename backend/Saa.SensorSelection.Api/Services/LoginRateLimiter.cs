using System.Collections.Concurrent;

using Microsoft.Extensions.Options;

namespace Saa.SensorSelection.Api.Services;

/// <summary>登录失败限流：按「用户名 + 客户端 IP」在滑动窗口内累计失败次数，超限后拒绝登录。</summary>
public class LoginRateLimiter(IOptions<RateLimitOptions> options)
{
    private readonly RateLimitOptions _options = options.Value;
    private readonly ConcurrentDictionary<string, Queue<DateTimeOffset>> _failures = new();

    /// <summary>统计窗口分钟数（供错误提示使用）。</summary>
    public int WindowMinutes => _options.WindowMinutes;

    /// <summary>当前是否已超限（窗口内失败次数达到上限）。</summary>
    public bool IsBlocked(string key, DateTimeOffset now)
    {
        var queue = _failures.GetValueOrDefault(key);
        if (queue == null)
        {
            return false;
        }

        lock (queue)
        {
            Prune(queue, now);
            var blocked = queue.Count >= _options.MaxFailures;
            if (queue.Count == 0)
            {
                _failures.TryRemove(key, out _);
            }
            return blocked;
        }
    }

    /// <summary>记录一次失败（登录成功前按用户名清理）。</summary>
    public void RecordFailure(string key, DateTimeOffset now)
    {
        var queue = _failures.GetOrAdd(key, _ => new Queue<DateTimeOffset>());
        lock (queue)
        {
            queue.Enqueue(now);
            Prune(queue, now);
        }
        CleanupStaleKeys(now, key);
    }

    /// <summary>登录成功时清除该用户的失败记录。</summary>
    public void Reset(string key)
    {
        _failures.TryRemove(key, out _);
    }

    private void Prune(Queue<DateTimeOffset> queue, DateTimeOffset now)
    {
        while (queue.Count > 0 && now - queue.Peek() > _options.Window)
        {
            queue.Dequeue();
        }
    }

    private void CleanupStaleKeys(DateTimeOffset now, string currentKey)
    {
        if (_failures.Count <= _options.MaxTrackedKeys) return;

        foreach (var entry in _failures)
        {
            lock (entry.Value)
            {
                Prune(entry.Value, now);
                if (entry.Value.Count == 0)
                {
                    _failures.TryRemove(entry.Key, out _);
                }
            }
        }

        // Keep the dictionary bounded even when every tracked key is active.
        foreach (var entry in _failures)
        {
            if (_failures.Count <= _options.MaxTrackedKeys || entry.Key == currentKey)
            {
                continue;
            }
            _failures.TryRemove(entry.Key, out _);
        }
    }
}

/// <summary>登录限流配置：见 appsettings.json 的 RateLimit 节。</summary>
public class RateLimitOptions
{
    public const string SectionName = "RateLimit";

    /// <summary>窗口内允许的最大失败次数。</summary>
    public int MaxFailures { get; set; } = 5;

    /// <summary>统计窗口（分钟）。</summary>
    public int WindowMinutes { get; set; } = 10;

    /// <summary>最多保留的用户名/IP 组合数，避免随机 key 持续占用内存。</summary>
    public int MaxTrackedKeys { get; set; } = 10_000;

    public TimeSpan Window => TimeSpan.FromMinutes(WindowMinutes);
}
