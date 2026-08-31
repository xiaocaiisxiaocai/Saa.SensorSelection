namespace Saa.SensorSelection.Api.Models;

/// <summary>
/// 独立保存上传文件正文。StoreEntry 只保留文件元数据和本实体的稳定引用，
/// 避免读取业务 Store 时把全部 PDF/图片正文一并传给浏览器。
/// </summary>
public class StoredFile
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string MimeType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
    public byte[] Content { get; set; } = Array.Empty<byte>();
    public DateTime CreatedAt { get; set; }
}
