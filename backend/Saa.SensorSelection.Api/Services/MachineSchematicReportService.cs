using System.Net;
using System.Text;

using Saa.SensorSelection.Api.Models;

namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// 在服务端生成独立的机型结构报告文档。
/// HTML 是可归档的文档格式，也可通过文档内的打印入口保存为 PDF。
/// </summary>
public sealed class MachineSchematicReportService(StoredFileService storedFiles)
{
    private const int MaxMachines = 50;
    private const int MaxSections = 30;
    private const int MaxBlocksPerSection = 50;
    private const int MaxRowsPerBlock = 500;
    private const int MaxTotalBlocks = 200;
    private const int MaxTotalRows = 5_000;
    private const int MaxImagesPerBlock = 100;
    private const int MaxTotalImages = 200;
    private const int MaxSensorsPerBlock = 1_000;
    private const int MaxSensorIdsPerRow = 50;
    private const int MaxTextLength = 2000;
    // 机型名是完整的选单路径（分类 / 配置 / 机型 / 二级 Tab，每级最多 40 字）
    private const int MaxMachineNameLength = 200;
    private const int MaxImageBytes = 3_000_000;
    private const int MaxTotalEmbeddedImageBytes = 20_000_000;

    public async Task<ReportBuildResult> BuildAsync(
        MachineSchematicReportRequest? request,
        CancellationToken ct = default)
    {
        if (request?.MachineNames is not { Count: > 0 } machineNames)
        {
            return ReportBuildResult.Validation("至少选择一个机型");
        }

        if (machineNames.Count > MaxMachines)
        {
            return ReportBuildResult.Validation($"最多选择 {MaxMachines} 个机型");
        }

        var machineSet = new HashSet<string>(StringComparer.Ordinal);
        foreach (var machineName in machineNames)
        {
            var normalized = Normalize(machineName, MaxTextLength);
            if (normalized.Length == 0 || normalized.Length > MaxMachineNameLength)
            {
                return ReportBuildResult.Validation($"机型名称不能为空且不能超过 {MaxMachineNameLength} 个字符");
            }

            if (!machineSet.Add(normalized))
            {
                return ReportBuildResult.Validation($"机型重复: {normalized}");
            }
        }

        var sections = request.Sections ?? Array.Empty<MachineSchematicReportSection>();
        if (sections.Count > MaxSections)
        {
            return ReportBuildResult.Validation($"最多包含 {MaxSections} 个结构模块");
        }

        var normalizedSections = new List<NormalizedSection>(sections.Count);
        var totalBlocks = 0;
        var totalRows = 0;
        var totalImages = 0;
        var totalImageBytes = 0;
        var imageCache = new Dictionary<string, ResolvedImage>(StringComparer.Ordinal);
        foreach (var section in sections.OrderBy(item => item.Sort).ThenBy(item => item.Id))
        {
            var displayName = Normalize(section.DisplayName ?? section.Name, 80);
            if (displayName.Length == 0)
            {
                return ReportBuildResult.Validation("结构模块名称不能为空");
            }

            var kind = string.Equals(section.Kind, "notes", StringComparison.OrdinalIgnoreCase)
                ? "notes"
                : "structure";
            var blocks = section.Blocks ?? Array.Empty<MachineSchematicReportMachineBlock>();
            if (blocks.Count > MaxBlocksPerSection)
            {
                return ReportBuildResult.Validation($"结构模块「{displayName}」的机型数量超出限制");
            }
            totalBlocks += blocks.Count;
            if (totalBlocks > MaxTotalBlocks)
            {
                return ReportBuildResult.Validation($"报告最多包含 {MaxTotalBlocks} 个机型区块");
            }

            var normalizedBlocks = new List<NormalizedBlock>(blocks.Count);
            foreach (var block in blocks)
            {
                var machineName = Normalize(block.MachineName, MaxMachineNameLength);
                if (machineName.Length == 0 || !machineSet.Contains(machineName))
                {
                    return ReportBuildResult.Validation($"结构模块「{displayName}」包含未选择的机型");
                }

                var rows = block.Rows ?? Array.Empty<MachineSchematicReportRow>();
                if (rows.Count > MaxRowsPerBlock)
                {
                    return ReportBuildResult.Validation($"机型「{machineName}」的记录数量超出限制");
                }
                totalRows += rows.Count;
                if (totalRows > MaxTotalRows)
                {
                    return ReportBuildResult.Validation($"报告最多包含 {MaxTotalRows} 条记录");
                }

                if (rows.Any(row => (row.SensorIds?.Count ?? 0) > MaxSensorIdsPerRow))
                {
                    return ReportBuildResult.Validation(
                        $"机型「{machineName}」的单条记录最多关联 {MaxSensorIdsPerRow} 个 Sensor");
                }

                var images = block.Images ?? Array.Empty<MachineSchematicReportImage>();
                if (images.Count > MaxImagesPerBlock)
                {
                    return ReportBuildResult.Validation(
                        $"机型「{machineName}」最多包含 {MaxImagesPerBlock} 张示意图");
                }
                totalImages += images.Count;
                if (totalImages > MaxTotalImages)
                {
                    return ReportBuildResult.Validation($"报告最多包含 {MaxTotalImages} 张示意图");
                }

                var normalizedImages = new List<NormalizedImage>(images.Count);
                foreach (var image in images)
                {
                    var resolved = await ResolveImageAsync(image, imageCache, ct);
                    if (!resolved.Success)
                    {
                        return ReportBuildResult.Validation(
                            $"机型「{machineName}」的示意图无效：{resolved.Error}");
                    }
                    if (resolved.Image is null) continue;
                    totalImageBytes += resolved.Image.ByteCount;
                    if (totalImageBytes > MaxTotalEmbeddedImageBytes)
                    {
                        return ReportBuildResult.Validation(
                            $"报告图片总大小不能超过 {MaxTotalEmbeddedImageBytes / 1_000_000} MB");
                    }
                    normalizedImages.Add(new NormalizedImage(
                        resolved.Image.DataUrl,
                        Normalize(image.FileName, 120).Length > 0
                            ? Normalize(image.FileName, 120)
                            : resolved.Image.FileName));
                }

                var sensors = block.Sensors ?? Array.Empty<MachineSchematicReportSensor>();
                if (sensors.Count > MaxSensorsPerBlock)
                {
                    return ReportBuildResult.Validation(
                        $"机型「{machineName}」最多包含 {MaxSensorsPerBlock} 个 Sensor");
                }
                var normalizedSensors = sensors
                    .Select(NormalizeSensor)
                    .GroupBy(sensor => sensor.Id)
                    .ToDictionary(group => group.Key, group => group.Last());

                normalizedBlocks.Add(new NormalizedBlock(
                    machineName,
                    rows.Select(row => NormalizeRow(row)).ToArray(),
                    normalizedImages,
                    normalizedSensors));
            }

            normalizedSections.Add(new NormalizedSection(
                displayName,
                section.Sort,
                kind,
                normalizedBlocks.ToArray()));
        }

        var html = Render(normalizedSections);
        return ReportBuildResult.Created(html);
    }

    private static NormalizedRow NormalizeRow(MachineSchematicReportRow row)
    {
        return new NormalizedRow(
            Normalize(row.Role, MaxTextLength),
            Normalize(row.ProcessStepName, MaxTextLength),
            Normalize(row.SensorType, MaxTextLength),
            Normalize(row.Spec, MaxTextLength),
            Normalize(row.Purpose, MaxTextLength),
            Normalize(row.Name, MaxTextLength),
            Normalize(row.Desc, MaxTextLength),
            Normalize(row.Note, MaxTextLength),
            (row.SensorIds ?? Array.Empty<int>()).Distinct().ToArray());
    }

    private static NormalizedSensor NormalizeSensor(MachineSchematicReportSensor sensor) =>
        new(
            sensor.Id,
            Normalize(sensor.SensorType, MaxTextLength),
            Normalize(sensor.Brand, 120),
            Normalize(sensor.Model, 120),
            Normalize(sensor.Spec, MaxTextLength));

    private async Task<ImageResolveResult> ResolveImageAsync(
        MachineSchematicReportImage image,
        IDictionary<string, ResolvedImage> cache,
        CancellationToken ct)
    {
        var source = image.DataUrl?.Trim();
        if (string.IsNullOrEmpty(source)) return ImageResolveResult.Validation("图片地址为空");
        if (cache.TryGetValue(source, out var cached)) return ImageResolveResult.Ok(cached);

        if (source.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            var separator = source.IndexOf(',');
            if (separator <= 5 || separator == source.Length - 1)
                return ImageResolveResult.Validation("data URL 格式无效");
            var header = source[5..separator];
            var headerParts = header.Split(';', StringSplitOptions.RemoveEmptyEntries);
            var mimeType = headerParts.FirstOrDefault();
            if (!IsInlineImageMimeType(mimeType) ||
                !headerParts.Skip(1).Any(part =>
                    part.Equals("base64", StringComparison.OrdinalIgnoreCase)))
                return ImageResolveResult.Validation("仅支持 PNG、JPEG 或 WebP 图片");
            byte[] bytes;
            try { bytes = Convert.FromBase64String(source[(separator + 1)..]); }
            catch (FormatException) { return ImageResolveResult.Validation("Base64 内容无效"); }
            if (bytes.Length == 0 || bytes.Length > MaxImageBytes)
                return ImageResolveResult.Validation($"单张图片不能超过 {MaxImageBytes / 1_000_000} MB");
            var resolved = new ResolvedImage(source, Normalize(image.FileName, 120), bytes.Length);
            cache[source] = resolved;
            return ImageResolveResult.Ok(resolved);
        }

        if (!StoredFileService.TryParseContentUrl(source, out var id))
            return ImageResolveResult.Validation("图片引用无效");
        var stored = await storedFiles.OpenReadAsync(id, ct);
        if (stored is null) return ImageResolveResult.Validation("图片不存在或已删除");
        await using var connection = stored.Connection;
        await using var content = stored.Content;
        if (!IsInlineImageMimeType(stored.MimeType))
            return ImageResolveResult.Validation("引用的文件不是支持的图片格式");
        if (content.CanSeek && (content.Length == 0 || content.Length > MaxImageBytes))
            return ImageResolveResult.Validation($"单张图片不能超过 {MaxImageBytes / 1_000_000} MB");
        await using var output = new MemoryStream();
        await content.CopyToAsync(output, ct);
        if (output.Length == 0 || output.Length > MaxImageBytes)
            return ImageResolveResult.Validation($"单张图片不能超过 {MaxImageBytes / 1_000_000} MB");
        var embedded = $"data:{stored.MimeType};base64,{Convert.ToBase64String(output.ToArray())}";
        var storedImage = new ResolvedImage(embedded, Normalize(stored.FileName, 120), checked((int)output.Length));
        cache[source] = storedImage;
        return ImageResolveResult.Ok(storedImage);
    }

    private static bool IsInlineImageMimeType(string? value) =>
        value is not null && value.ToLowerInvariant() is
            "image/png" or "image/jpeg" or "image/jpg" or "image/webp";

    private static string Normalize(string? value, int maxLength) =>
        (value ?? string.Empty).Trim().Length <= maxLength
            ? (value ?? string.Empty).Trim()
            : (value ?? string.Empty).Trim()[..maxLength];

    private static string H(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

    private static string Render(IReadOnlyList<NormalizedSection> sections)
    {
        var sectionMarkup = string.Join(
            string.Empty,
            sections.Select((section, index) => RenderSection(section, index + 1)));

        return $$"""
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>机型结构示意图报告</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      :root { color-scheme: light; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #172033; background: #fff; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; background: #eef2f6; }
      .report-shell { max-width: 1180px; margin: 0 auto; background: #fff; padding: 30px 34px 40px; box-shadow: 0 12px 38px rgba(19,35,58,.12); }
      .report-actions { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 18px; }
      .report-actions button { border: 0; border-radius: 6px; padding: 9px 16px; color: #fff; background: #b45309; cursor: pointer; font-size: 14px; }
      .report-actions button.secondary { color: #344054; background: #eef2f6; }
      .report-section { break-inside: avoid; margin: 0 0 26px; }
      .report-section__heading { display: flex; gap: 12px; align-items: flex-start; border-bottom: 1px solid #d8dee8; padding-bottom: 10px; }
      .report-section__number { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 50%; color: #fff; background: #b45309; font-size: 14px; font-weight: 700; }
      .report-section h2 { margin: 0; font-size: 20px; }
      .report-section__heading p { margin: 3px 0 0; color: #667085; font-size: 13px; }
      .report-section__content { padding-top: 12px; }
      .report-machine-block { margin-bottom: 18px; break-inside: avoid; }
      .report-machine-block > h3 { margin: 0; padding: 8px 12px; border-left: 3px solid #b45309; background: #fff7ed; color: #92400e; font-size: 16px; }
      .report-machine-block__layout { padding: 10px 12px 0; }
      .report-machine-block__layout--with-image { display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2fr); gap: 16px; align-items: start; }
      .report-machine-block__layout--full { display: block; }
      .report-machine-block__images { display: grid; gap: 8px; min-width: 0; }
      .report-machine-block__images img { display: block; width: 100%; max-height: 300px; object-fit: contain; border: 1px solid #e4e7ec; border-radius: 6px; background: #fafbfc; break-inside: avoid; }
      .report-machine-block__content { min-width: 0; }
      .report-row { display: grid; grid-template-columns: 30px 1fr; gap: 14px; border-bottom: 1px solid #edf0f4; padding: 12px 0; break-inside: avoid; }
      .report-row__index { color: #98a2b3; font-size: 13px; padding-top: 3px; text-align: center; }
      .report-structure-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 14px; }
      .report-structure-table th, .report-structure-table td { padding: 7px 8px; border-bottom: 1px solid #edf0f4; text-align: left; vertical-align: middle; line-height: 1.5; word-break: break-word; }
      .report-structure-table th { color: #667085; background: #f8fafc; font-weight: 600; }
      .report-structure-table__serial-col { width: 42px; }
      .report-structure-table__role-col { width: 13%; }
      .report-structure-table__process-col { width: 14%; }
      .report-structure-table__sensor-col { width: 12%; }
      .report-structure-table__spec-col { width: 22%; }
      .report-structure-table__purpose-col { width: 15%; }
      .report-structure-table__note-col { width: 17%; }
      .report-structure-table__serial { text-align: center !important; color: #98a2b3; }
      .report-structure-table tbody tr:last-child td { border-bottom-color: #d8dee8; }
      .report-row h4, .report-note-row h4 { margin: 0 0 7px; font-size: 15px; color: #172033; }
      dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 24px; margin: 0; }
      dl > div { display: grid; grid-template-columns: 72px 1fr; gap: 8px; font-size: 13px; line-height: 1.55; }
      dt { color: #98a2b3; } dd { margin: 0; color: #344054; word-break: break-word; }
      .report-note-row { display: grid; grid-template-columns: 30px 1fr; gap: 14px; border-bottom: 1px solid #edf0f4; padding: 12px 0; break-inside: avoid; }
      .report-note-row p { margin: 0 0 5px; color: #344054; font-size: 14px; line-height: 1.65; }
      .report-note-row small { color: #667085; }
      .report-muted, .report-empty { color: #98a2b3; font-size: 13px; }
      .report-empty { margin: 8px 0; }
      @media (max-width: 700px) { body { padding: 0; } .report-shell { padding: 20px; box-shadow: none; } .report-row { grid-template-columns: 24px 1fr; gap: 9px; } .report-machine-block__layout--with-image { grid-template-columns: 1fr; } .report-machine-block__images img { max-height: 240px; } .report-structure-table { font-size: 12px; } .report-structure-table th, .report-structure-table td { padding: 5px 6px; } dl { grid-template-columns: 1fr; } }
      @media print { body { padding: 0; background: #fff; } .report-shell { max-width: none; padding: 0; box-shadow: none; } .report-actions { display: none; } .report-structure-table { font-size: 14px; } }
    </style>
  </head>
  <body>
    <main class="report-shell">
      <div class="report-actions"><button class="secondary" type="button" onclick="window.close()">关闭</button><button type="button" onclick="window.print()">打印 / 保存 PDF</button></div>
      {{sectionMarkup}}
    </main>
  </body>
</html>
""";
    }

    private static string RenderSection(NormalizedSection section, int index)
    {
        var blocks = string.Join(
            string.Empty,
            section.Blocks.Select(block => RenderBlock(block, section.Kind == "notes")));
        return $"<section class=\"report-section\"><div class=\"report-section__heading\"><span class=\"report-section__number\">{index}</span><div><h2>{H(section.DisplayName)}</h2><p>{section.Blocks.Count} 个机型</p></div></div><div class=\"report-section__content\">{(blocks.Length == 0 ? "<p class=\"report-empty\">已选机型在此模块暂无内容。</p>" : blocks)}</div></section>";
    }

    private static string RenderBlock(NormalizedBlock block, bool notes)
    {
        var images = string.Join(
            string.Empty,
            block.Images.Select(image =>
                $"<img class=\"report-structure-image\" src=\"{H(image.DataUrl)}\" alt=\"{H(image.FileName)}\" />"));
        var hasImages = images.Length > 0;
        var layoutClass = hasImages
            ? "report-machine-block__layout--with-image"
            : "report-machine-block__layout--full";
        var imageColumn = hasImages
            ? $"<div class=\"report-machine-block__images\" aria-label=\"结构示意图\">{images}</div>"
            : string.Empty;
        var rows = block.Rows.Count == 0
            ? "<p class=\"report-empty\">此机型在该模块暂无记录。</p>"
            : notes
                ? string.Join(string.Empty, block.Rows.Select((row, index) => RenderNotesRow(row, index + 1)))
                : RenderStructureTable(block);
        return $"<article class=\"report-machine-block\"><h3>{H(block.MachineName)}</h3><div class=\"report-machine-block__layout {layoutClass}\">{imageColumn}<div class=\"report-machine-block__content\">{rows}</div></div></article>";
    }

    private static string RenderNotesRow(NormalizedRow row, int index)
    {
        var heading = H(string.IsNullOrWhiteSpace(row.Name) ? row.Role : row.Name);
        if (heading.Length == 0) heading = $"事项 {index}";
        var description = Value(row.Desc);
        var note = string.IsNullOrWhiteSpace(row.Note) ? string.Empty : $"<small>{H(row.Note)}</small>";
        return $"<article class=\"report-note-row\"><div class=\"report-row__index\">{index}</div><div><h4>{heading}</h4><p>{description}</p>{note}</div></article>";
    }

    private static string RenderStructureTable(NormalizedBlock block)
    {
        var rows = new StringBuilder();
        for (var index = 0; index < block.Rows.Count; index++)
        {
            var row = block.Rows[index];
            var sensors = row.SensorIds
                .Select(id => block.Sensors.GetValueOrDefault(id))
                .Where(sensor => sensor is not null)
                .Cast<NormalizedSensor>()
                .ToArray();
            var displaySensors = sensors.Length > 0
                ? sensors.Cast<NormalizedSensor?>().ToArray()
                : new NormalizedSensor?[] { null };
            var rowSpan = displaySensors.Length;
            for (var sensorIndex = 0; sensorIndex < displaySensors.Length; sensorIndex++)
            {
                var sensor = displaySensors[sensorIndex];
                var sensorType = sensor?.SensorType ?? row.SensorType;
                var spec = sensor is null
                    ? row.Spec
                    : string.IsNullOrWhiteSpace(sensor.Spec)
                        ? string.Join(" ", new[] { sensor.Brand, sensor.Model }.Where(value => !string.IsNullOrWhiteSpace(value)))
                        : sensor.Spec;
                var leadingCells = sensorIndex == 0
                    ? $"<td class=\"report-structure-table__serial\" rowspan=\"{rowSpan}\">{index + 1}</td><td class=\"report-structure-table__role\" rowspan=\"{rowSpan}\">{Value(string.IsNullOrWhiteSpace(row.Role) ? sensorType : row.Role)}</td><td class=\"report-structure-table__process\" rowspan=\"{rowSpan}\">{Value(row.ProcessStepName)}</td>"
                    : string.Empty;
                var trailingCells = sensorIndex == 0
                    ? $"<td class=\"report-structure-table__purpose\" rowspan=\"{rowSpan}\">{Value(row.Purpose)}</td><td class=\"report-structure-table__note\" rowspan=\"{rowSpan}\">{Value(row.Note)}</td>"
                    : string.Empty;
                rows.Append($"<tr>{leadingCells}<td class=\"report-structure-table__sensor\">{Value(sensorType)}</td><td class=\"report-structure-table__spec\">{Value(spec)}</td>{trailingCells}</tr>");
            }
        }

        return $"<table class=\"report-structure-table\"><colgroup><col class=\"report-structure-table__serial-col\" /><col class=\"report-structure-table__role-col\" /><col class=\"report-structure-table__process-col\" /><col class=\"report-structure-table__sensor-col\" /><col class=\"report-structure-table__spec-col\" /><col class=\"report-structure-table__purpose-col\" /><col class=\"report-structure-table__note-col\" /></colgroup><thead><tr><th class=\"report-structure-table__serial\">序号</th><th>功能作用</th><th>工艺制程</th><th>传感器类型</th><th>规格</th><th>作用</th><th>备注</th></tr></thead><tbody>{rows}</tbody></table>";
    }

    private static string Value(string value) => string.IsNullOrWhiteSpace(value) ? "-" : H(value);

    private sealed record NormalizedSection(string DisplayName, int Sort, string Kind, IReadOnlyList<NormalizedBlock> Blocks);
    private sealed record NormalizedBlock(string MachineName, IReadOnlyList<NormalizedRow> Rows, IReadOnlyList<NormalizedImage> Images, IReadOnlyDictionary<int, NormalizedSensor> Sensors);
    private sealed record NormalizedImage(string DataUrl, string FileName);
    private sealed record NormalizedSensor(int Id, string SensorType, string Brand, string Model, string Spec);
    private sealed record NormalizedRow(string Role, string ProcessStepName, string SensorType, string Spec, string Purpose, string Name, string Desc, string Note, IReadOnlyList<int> SensorIds);
    private sealed record ResolvedImage(string DataUrl, string FileName, int ByteCount);
    private sealed record ImageResolveResult(bool Success, ResolvedImage? Image, string? Error)
    {
        public static ImageResolveResult Ok(ResolvedImage image) => new(true, image, null);
        public static ImageResolveResult Validation(string error) => new(false, null, error);
    }
}

public sealed record ReportBuildResult(bool Success, string? Html, string? Error)
{
    public static ReportBuildResult Created(string html) => new(true, html, null);
    public static ReportBuildResult Validation(string message) => new(false, null, message);
}
