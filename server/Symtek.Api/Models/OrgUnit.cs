namespace Symtek.Api.Models;

/// <summary>
/// 组织架构节点：自引用树，支持任意层级。
/// Level 为自由文本（如：事业部/部门/课别，可自定义扩展），
/// 父节点可自由指定，天然支持跳级（如课别直接挂在事业部下）。
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
