namespace Saa.SensorSelection.Api.Models;

/// <summary>
/// 前端数据仓库按 key（listId:entityName）组织的列表数据。
/// 每个 key 保存一份 JSON 数组文本，与前端 symtek_crud_store 的存储结构一一对应。
/// </summary>
public class StoreEntry
{
    /// <summary>例如 sensor-catalog:all、customer-req:某客户。</summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>JSON 数组文本。</summary>
    public string Json { get; set; } = string.Empty;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
