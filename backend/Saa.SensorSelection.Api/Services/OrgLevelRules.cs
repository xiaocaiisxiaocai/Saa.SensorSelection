namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 组织层级：事业部 &gt; 部门 &gt; 课别。允许跳级，禁止倒挂。
/// 课别是最末一级，下面不能再有任何组织。
/// 其余情况下未填写或自定义层级不参与比较。
/// </summary>
public static class OrgLevelRules
{
    public const string InvertedMessage = "层级不能倒挂（事业部 > 部门 > 课别，允许跳级）";

    public const string LeafMessage = "课别是最末一级，下面不能再新建组织";

    public const string LeafLevel = "课别";

    private static readonly Dictionary<string, int> Ranks = new(StringComparer.Ordinal)
    {
        ["事业部"] = 3,
        ["部门"] = 2,
        ["课别"] = 1,
    };

    public static bool CanPlace(string? parentLevel, string? childLevel)
    {
        if (!TryRank(parentLevel, out var parent) || !TryRank(childLevel, out var child))
        {
            return true;
        }

        return parent >= child;
    }

    /// <summary>课别下面不能挂任何子组织（不论子组织填什么层级）。</summary>
    public static bool CanHaveChildren(string? level) =>
        !string.Equals(level?.Trim(), LeafLevel, StringComparison.Ordinal);

    private static bool TryRank(string? level, out int rank)
    {
        if (string.IsNullOrWhiteSpace(level))
        {
            rank = 0;
            return false;
        }

        return Ranks.TryGetValue(level.Trim(), out rank);
    }
}
