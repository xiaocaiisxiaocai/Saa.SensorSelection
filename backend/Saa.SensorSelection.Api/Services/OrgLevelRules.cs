namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 组织层级：事业部 &gt; 部门 &gt; 课别，必须逐级，不能跳级。
/// 层级由位置决定：顶层是事业部，事业部下是部门，部门下是课别；课别是最末一级。
/// </summary>
public static class OrgLevelRules
{
    public const string SkipMessage = "层级必须逐级：事业部 > 部门 > 课别，不能跳级";

    public const string LeafMessage = "课别是最末一级，下面不能再新建组织";

    public const string ParentLevelMissingMessage = "上级组织没有设置层级，请先编辑上级组织";

    public const string ChildrenLevelMessage = "有下级的组织不能改变层级";

    public const string LeafLevel = "课别";

    private static readonly string[] Levels = ["事业部", "部门", "课别"];

    public static bool IsStandard(string? level) =>
        level is not null && Levels.Contains(level.Trim(), StringComparer.Ordinal);

    /// <summary>课别下面不能挂任何子组织。</summary>
    public static bool CanHaveChildren(string? level) =>
        !string.Equals(level?.Trim(), LeafLevel, StringComparison.Ordinal);

    /// <summary>
    /// 按上级算出子组织的层级：没有上级是事业部，其余是上级的下一级。
    /// 上级是课别或没有标准层级时返回失败原因。
    /// </summary>
    public static (string? Level, string? Error) LevelUnder(bool isRoot, string? parentLevel)
    {
        if (isRoot)
        {
            return (Levels[0], null);
        }
        if (!CanHaveChildren(parentLevel))
        {
            return (null, LeafMessage);
        }
        var index = Array.IndexOf(Levels, parentLevel?.Trim());
        return index < 0 ? (null, ParentLevelMissingMessage) : (Levels[index + 1], null);
    }
}
