using System.Text.Json;

using Saa.SensorSelection.Api.Services;

namespace Saa.SensorSelection.Api.Tests;

public class AuditChangesTests
{
    private static JsonElement Parse(string? json)
    {
        Assert.NotNull(json);
        return JsonDocument.Parse(json!).RootElement;
    }

    [Fact]
    public void DiffArrays_PairsRowsById_AndListsChangedFields()
    {
        var before = """[{"id":1,"type":"01 sensor标准","content":"旧内容","source":"02 厂外改善"},{"id":2,"type":"02","content":"要删的"}]""";
        var after = """[{"id":1,"type":"01 sensor标准","content":"新内容","source":"03 客户要求"},{"id":3,"type":"03","content":"新加的"}]""";

        var changes = Parse(AuditChanges.DiffArrays(before, after));

        Assert.Equal(1, changes.GetProperty("addedCount").GetInt32());
        Assert.Equal(1, changes.GetProperty("removedCount").GetInt32());
        Assert.Equal(1, changes.GetProperty("modifiedCount").GetInt32());
        var modified = changes.GetProperty("modified")[0];
        // 记录名优先取内容类字段，改动只列真的变了的字段
        Assert.Equal("新内容", modified.GetProperty("label").GetString());
        var fields = modified.GetProperty("fields").EnumerateArray()
            .Select(field => field.GetProperty("name").GetString()!)
            .ToArray();
        Assert.Equal(["content", "source"], fields);
        Assert.Equal("旧内容", modified.GetProperty("fields")[0].GetProperty("before").GetString());
        Assert.Equal("新内容", modified.GetProperty("fields")[0].GetProperty("after").GetString());
        Assert.Equal("要删的", changes.GetProperty("removed")[0].GetProperty("label").GetString());
        Assert.Equal("新加的", changes.GetProperty("added")[0].GetProperty("label").GetString());
    }

    [Fact]
    public void DiffArrays_WritesSiteRegionsAsSiteAndRegionPairs()
    {
        var before = """[{"name":"鹏鼎集团","items":["淮安一厂"],"regions":{"淮安一厂":"华东"}}]""";
        var after = """[{"name":"鹏鼎集团","items":["淮安一厂"],"regions":{"淮安一厂":"华南"}}]""";

        var field = Parse(AuditChanges.DiffArrays(before, after))
            .GetProperty("modified")[0].GetProperty("fields")[0];

        Assert.Equal("regions", field.GetProperty("name").GetString());
        Assert.Equal("淮安一厂：华东", field.GetProperty("before").GetString());
        Assert.Equal("淮安一厂：华南", field.GetProperty("after").GetString());
    }

    [Fact]
    public void DiffArrays_StoresChineseUnescaped_SoKeywordSearchFindsIt()
    {
        var json = AuditChanges.DiffArrays(null, """[{"id":1,"name":"输送机构"}]""");

        Assert.Contains("输送机构", json);
    }

    [Fact]
    public void DiffArrays_ReportsReorderOnly_AndNullWhenNothingChanged()
    {
        var a = """[{"id":1,"name":"A"},{"id":2,"name":"B"}]""";
        var b = """[{"id":2,"name":"B"},{"id":1,"name":"A"}]""";

        Assert.True(Parse(AuditChanges.DiffArrays(a, b)).GetProperty("reordered").GetBoolean());
        Assert.Null(AuditChanges.DiffArrays(a, a));
        // 空串和缺字段在界面上是一回事
        Assert.Null(AuditChanges.DiffArrays("""[{"id":1,"note":""}]""", """[{"id":1}]"""));
    }

    [Fact]
    public void DiffArrays_DeleteListsEveryRemovedRow()
    {
        var changes = Parse(AuditChanges.DiffArrays("""[{"id":1,"name":"A"},{"id":2,"name":"B"}]""", null));

        Assert.Equal(2, changes.GetProperty("removedCount").GetInt32());
        Assert.Equal("A", changes.GetProperty("removed")[0].GetProperty("fields")[0].GetProperty("before").GetString());
    }

    [Fact]
    public void DiffArrays_TruncatesLongListsButKeepsTotals()
    {
        var rows = string.Join(",", Enumerable.Range(1, AuditChanges.MaxRows + 5).Select(id => $$"""{"id":{{id}},"name":"R{{id}}"}"""));

        var changes = Parse(AuditChanges.DiffArrays(null, $"[{rows}]"));

        Assert.True(changes.GetProperty("truncated").GetBoolean());
        Assert.Equal(AuditChanges.MaxRows + 5, changes.GetProperty("addedCount").GetInt32());
        Assert.Equal(AuditChanges.MaxRows, changes.GetProperty("added").GetArrayLength());
    }

    [Fact]
    public void DiffArrays_WritesNamedChildrenReadably()
    {
        var before = """[{"name":"输送机构","items":[],"configurations":[{"name":"SFC","items":["01 单段"]}]}]""";
        var after = """[{"name":"输送机构","items":[],"configurations":[{"name":"SFC","items":["01 单段","02 多段"]}]}]""";

        var field = Parse(AuditChanges.DiffArrays(before, after)).GetProperty("modified")[0].GetProperty("fields")[0];

        Assert.Equal("configurations", field.GetProperty("name").GetString());
        Assert.Equal("SFC（01 单段）", field.GetProperty("before").GetString());
        Assert.Equal("SFC（01 单段、02 多段）", field.GetProperty("after").GetString());
    }

    [Fact]
    public void DiffRecord_CoversCreateUpdateAndDelete()
    {
        KeyValuePair<string, string?>[] before = [new("名称", "编辑"), new("权限", "查看业务数据")];
        KeyValuePair<string, string?>[] after = [new("名称", "编辑"), new("权限", "查看业务数据、编辑业务数据")];

        var update = Parse(AuditChanges.DiffRecord("编辑", before, after)).GetProperty("modified")[0];
        Assert.Equal("权限", update.GetProperty("fields")[0].GetProperty("name").GetString());
        Assert.Equal(1, update.GetProperty("fields").GetArrayLength());
        Assert.Equal(1, Parse(AuditChanges.DiffRecord("编辑", null, after)).GetProperty("addedCount").GetInt32());
        Assert.Equal(1, Parse(AuditChanges.DiffRecord("编辑", before, null)).GetProperty("removedCount").GetInt32());
        Assert.Null(AuditChanges.DiffRecord("编辑", before, before));
    }
}
