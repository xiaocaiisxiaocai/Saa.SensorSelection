namespace Saa.SensorSelection.Api.Models;

/// <summary>
/// 组织架构节点：自引用树。
/// Level 必须逐级：事业部 &gt; 部门 &gt; 课别，由所在位置算出（见 OrgLevelRules）；
/// 列仍是文本，历史数据里可能为空。
/// </summary>
public class OrgUnit
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>父节点 Id；null = 顶级节点。</summary>
    public int? ParentId { get; set; }

    public OrgUnit? Parent { get; set; }

    public List<OrgUnit> Children { get; set; } = [];

    /// <summary>层级名称（事业部/部门/课别等，允许自定义值）。</summary>
    public string? Level { get; set; }

    /// <summary>同级排序（小在前）。</summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<User> Users { get; set; } = [];
}
