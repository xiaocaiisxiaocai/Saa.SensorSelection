using System.Net;
using System.Text;

using Symtek.Api.Models;

namespace Symtek.Api.Services;

/// <summary>
/// 在服务端生成独立的机型结构报告文档。
/// HTML 是可归档的文档格式，也可通过文档内的打印入口保存为 PDF。
/// </summary>
public sealed class MachineSchematicReportService
{
    private const int MaxMachines = 50;
    private const int MaxSections = 30;
    private const int MaxBlocksPerSection = 50;
    private const int MaxRowsPerBlock = 500;
    private const int MaxTextLength = 2000;
    private const int MaxImageDataLength = 3_000_000;

    public ReportBuildResult Build(MachineSchematicReportRequest? request)
    {
        if (request?.MachineNames is not { Count: > 0 } machineNames)
        {
            return ReportBuildResult.Validation("至少选择一个机型");
        }

        if (machineNames.Count > MaxMachines)
        {
            return ReportBuildResult.Validation($"最多选择 {MaxMachines} 个机型");
        }

        var normalizedMachines = new List<string>(machineNames.Count);
        var machineSet = new HashSet<string>(StringComparer.Ordinal);
        foreach (var machineName in machineNames)
        {
            var normalized = Normalize(machineName, MaxTextLength);
            if (normalized.Length == 0 || normalized.Length > 80)
            {
                return ReportBuildResult.Validation("机型名称不能为空且不能超过 80 个字符");
            }

            if (!machineSet.Add(normalized))
            {
                return ReportBuildResult.Validation($"机型重复: {normalized}");
            }

            normalizedMachines.Add(normalized);
        }

        var sections = request.Sections ?? Array.Empty<MachineSchematicReportSection>();
        if (sections.Count > MaxSections)
        {
            return ReportBuildResult.Validation($"最多包含 {MaxSections} 个结构模块");
        }

        var normalizedSections = new List<NormalizedSection>(sections.Count);
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

            var normalizedBlocks = new List<NormalizedBlock>(blocks.Count);
            foreach (var block in blocks)
            {
                var machineName = Normalize(block.MachineName, 80);
                if (machineName.Length == 0 || !machineSet.Contains(machineName))
                {
                    return ReportBuildResult.Validation($"结构模块「{displayName}」包含未选择的机型");
                }

                var rows = block.Rows ?? Array.Empty<MachineSchematicReportRow>();
                if (rows.Count > MaxRowsPerBlock)
                {
                    return ReportBuildResult.Validation($"机型「{machineName}」的记录数量超出限制");
                }

                normalizedBlocks.Add(new NormalizedBlock(
                    machineName,
                    rows.Select(row => NormalizeRow(row)).ToArray(),
                    NormalizeImages(block.Images)));
            }

            normalizedSections.Add(new NormalizedSection(
                displayName,
                section.Sort,
                kind,
                normalizedBlocks.ToArray()));
        }

        var html = Render(normalizedMachines, normalizedSections);
        return ReportBuildResult.Created(html);
    }

    private static NormalizedRow NormalizeRow(MachineSchematicReportRow row)
    {
        var image = row.Image;
        var imageData = image is not null && IsSafeImageDataUrl(image.DataUrl)
            && image.DataUrl!.Length <= MaxImageDataLength
            ? image.DataUrl
            : null;
        return new NormalizedRow(
            Normalize(row.Role, MaxTextLength),
            Normalize(row.SensorType, MaxTextLength),
            Normalize(row.Spec, MaxTextLength),
            Normalize(row.Purpose, MaxTextLength),
            Normalize(row.Name, MaxTextLength),
            Normalize(row.Desc, MaxTextLength),
            Normalize(row.Note, MaxTextLength),
            imageData,
            Normalize(image?.FileName, 120));
    }

    private static IReadOnlyList<NormalizedImage> NormalizeImages(
        IReadOnlyList<MachineSchematicReportImage>? images) =>
        (images ?? Array.Empty<MachineSchematicReportImage>())
            .Select(image => NormalizeImage(image))
            .Where(image => image is not null)
            .Cast<NormalizedImage>()
            .Take(2)
            .ToArray();

    private static NormalizedImage? NormalizeImage(MachineSchematicReportImage image)
    {
        var data = IsSafeImageDataUrl(image.DataUrl) && image.DataUrl!.Length <= MaxImageDataLength
            ? image.DataUrl
            : null;
        return data is null ? null : new NormalizedImage(data, Normalize(image.FileName, 120));
    }

    private static bool IsSafeImageDataUrl(string? value) =>
        value is not null &&
        (value.StartsWith("data:image/png;base64,", StringComparison.OrdinalIgnoreCase) ||
         value.StartsWith("data:image/jpeg;base64,", StringComparison.OrdinalIgnoreCase) ||
         value.StartsWith("data:image/jpg;base64,", StringComparison.OrdinalIgnoreCase) ||
         value.StartsWith("data:image/webp;base64,", StringComparison.OrdinalIgnoreCase));

    private static string Normalize(string? value, int maxLength) =>
        (value ?? string.Empty).Trim().Length <= maxLength
            ? (value ?? string.Empty).Trim()
            : (value ?? string.Empty).Trim()[..maxLength];

    private static string H(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

    private static string Render(
        IReadOnlyList<string> machines,
        IReadOnlyList<NormalizedSection> sections)
    {
        var sectionMarkup = string.Join(
            string.Empty,
            sections.Select((section, index) => RenderSection(section, index + 1)));
        var machineMarkup = string.Join("、", machines.Select(H));
        var generatedAt = H(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));

        return $$"""
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>机型结构示意图报告</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      :root { color-scheme: light; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #172033; background: #eef2f6; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; }
      .report-shell { max-width: 1180px; margin: 0 auto; background: #fff; padding: 30px 34px 40px; box-shadow: 0 12px 38px rgba(19,35,58,.12); }
      .report-actions { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 18px; }
      .report-actions button { border: 0; border-radius: 6px; padding: 9px 16px; color: #fff; background: #b45309; cursor: pointer; font-size: 14px; }
      .report-actions button.secondary { color: #344054; background: #eef2f6; }
      .report-header { border-bottom: 2px solid #b45309; padding-bottom: 18px; margin-bottom: 24px; }
      .report-kicker { color: #b45309; font-size: 13px; letter-spacing: .08em; }
      h1 { margin: 6px 0 8px; font-size: 28px; }
      .report-meta { margin: 0; color: #667085; font-size: 14px; line-height: 1.7; }
      .report-meta strong { color: #172033; }
      .report-section { break-inside: avoid; margin: 0 0 26px; }
      .report-section__heading { display: flex; gap: 12px; align-items: flex-start; border-bottom: 1px solid #d8dee8; padding-bottom: 10px; }
      .report-section__number { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 50%; color: #fff; background: #b45309; font-size: 14px; font-weight: 700; }
      .report-section h2 { margin: 0; font-size: 20px; }
      .report-section__heading p { margin: 3px 0 0; color: #667085; font-size: 13px; }
      .report-section__content { padding-top: 12px; }
      .report-machine-block { margin-bottom: 18px; break-inside: avoid; }
      .report-machine-block > h3 { margin: 0; padding: 8px 12px; border-left: 3px solid #b45309; background: #fff7ed; color: #92400e; font-size: 16px; }
      .report-machine-block__content { padding: 0 12px; }
      .report-row { display: grid; grid-template-columns: 30px 1fr; gap: 14px; border-bottom: 1px solid #edf0f4; padding: 12px 0; break-inside: avoid; }
      .report-row__index { color: #98a2b3; font-size: 13px; padding-top: 3px; text-align: center; }
      .report-structure-images { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 12px 0; }
      .report-structure-images img { display: block; width: 100%; height: 180px; object-fit: contain; border: 1px solid #e4e7ec; border-radius: 6px; background: #fafbfc; }
      .report-row h4, .report-note-row h4 { margin: 0 0 7px; font-size: 15px; color: #172033; }
      dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 24px; margin: 0; }
      dl > div { display: grid; grid-template-columns: 72px 1fr; gap: 8px; font-size: 13px; line-height: 1.55; }
      dt { color: #98a2b3; } dd { margin: 0; color: #344054; word-break: break-word; }
      .report-note-row { display: grid; grid-template-columns: 30px 1fr; gap: 14px; border-bottom: 1px solid #edf0f4; padding: 12px 0; break-inside: avoid; }
      .report-note-row p { margin: 0 0 5px; color: #344054; font-size: 14px; line-height: 1.65; }
      .report-note-row small { color: #667085; }
      .report-muted, .report-empty { color: #98a2b3; font-size: 13px; }
      .report-empty { margin: 8px 0; }
      .report-footer { margin-top: 30px; color: #98a2b3; font-size: 12px; text-align: right; }
      @media (max-width: 700px) { body { padding: 0; } .report-shell { padding: 20px; box-shadow: none; } .report-row { grid-template-columns: 24px 1fr; gap: 9px; } .report-structure-images { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; } }
      @media print { body { padding: 0; background: #fff; } .report-shell { max-width: none; padding: 0; box-shadow: none; } .report-actions { display: none; } }
    </style>
  </head>
  <body>
    <main class="report-shell">
      <div class="report-actions"><button class="secondary" type="button" onclick="window.close()">关闭</button><button type="button" onclick="window.print()">打印 / 保存 PDF</button></div>
      <header class="report-header"><div class="report-kicker">SAA · SENSOR SELECTION</div><h1>机型结构示意图报告</h1><p class="report-meta">已选机型：<strong>{{machineMarkup}}</strong><br />按“结构模块 → 机型 → 传感器记录”拼接生成 · 共 {{machines.Count}} 个机型、{{sections.Count}} 个模块</p></header>
      {{sectionMarkup}}
      <footer class="report-footer">生成时间：{{generatedAt}}</footer>
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
        var imageMarkup = string.Join(
            string.Empty,
            block.Images.Select(image =>
                $"<img src=\"{H(image.DataUrl)}\" alt=\"{H(image.FileName)}\" />"));
        var images = !notes && block.Images.Count > 0
            ? $"<div class=\"report-structure-images\">{imageMarkup}</div>"
            : string.Empty;
        var rows = block.Rows.Count == 0
            ? "<p class=\"report-empty\">此机型在该模块暂无记录。</p>"
            : string.Join(
                string.Empty,
                block.Rows.Select((row, index) => notes
                    ? RenderNotesRow(row, index + 1)
                    : RenderRow(row, index + 1)));
        return $"<article class=\"report-machine-block\"><h3>{H(block.MachineName)}</h3><div class=\"report-machine-block__content\">{images}{rows}</div></article>";
    }

    private static string RenderNotesRow(NormalizedRow row, int index)
    {
        var heading = H(string.IsNullOrWhiteSpace(row.Name) ? row.Role : row.Name);
        if (heading.Length == 0) heading = $"事项 {index}";
        var description = Value(row.Desc);
        var note = string.IsNullOrWhiteSpace(row.Note) ? string.Empty : $"<small>{H(row.Note)}</small>";
        return $"<article class=\"report-note-row\"><div class=\"report-row__index\">{index}</div><div><h4>{heading}</h4><p>{description}</p>{note}</div></article>";
    }

    private static string RenderRow(NormalizedRow row, int index)
    {
        var heading = H(string.IsNullOrWhiteSpace(row.Role) ? row.SensorType : row.Role);
        if (heading.Length == 0) heading = $"记录 {index}";
        return $"<article class=\"report-row\"><div class=\"report-row__index\">{index}</div><div class=\"report-row__body\"><h4>{heading}</h4><dl><div><dt>传感器类型</dt><dd>{Value(row.SensorType)}</dd></div><div><dt>规格</dt><dd>{Value(row.Spec)}</dd></div><div><dt>作用</dt><dd>{Value(row.Purpose)}</dd></div><div><dt>备注</dt><dd>{Value(row.Note)}</dd></div></dl></div></article>";
    }

    private static string Value(string value) => string.IsNullOrWhiteSpace(value) ? "-" : H(value);

    private sealed record NormalizedSection(string DisplayName, int Sort, string Kind, IReadOnlyList<NormalizedBlock> Blocks);
    private sealed record NormalizedBlock(string MachineName, IReadOnlyList<NormalizedRow> Rows, IReadOnlyList<NormalizedImage> Images);
    private sealed record NormalizedImage(string DataUrl, string FileName);
    private sealed record NormalizedRow(string Role, string SensorType, string Spec, string Purpose, string Name, string Desc, string Note, string? ImageDataUrl, string ImageFileName);
}

public sealed record ReportBuildResult(bool Success, string? Html, string? Error)
{
    public static ReportBuildResult Created(string html) => new(true, html, null);
    public static ReportBuildResult Validation(string message) => new(false, null, message);
}
