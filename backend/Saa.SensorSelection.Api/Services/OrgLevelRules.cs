namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 组织层级：事业部 &gt; 部门 &gt; 课别。允许跳级，禁止倒挂。
/// 未填写或自定义层级不参与比较。
/// </summary>
public static class OrgLevelRules
{
    public const string InvertedMessage = "层级不能倒挂（事业部 > 部门 > 课别，允许跳级）";

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
