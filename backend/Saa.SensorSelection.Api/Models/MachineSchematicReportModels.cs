using System.Text.Json.Serialization;

namespace Saa.SensorSelection.Api.Models;

/// <summary>
/// 机型结构示意图报告导出模型。报告按「结构模块 → 机型 → 传感器记录」组织。
/// </summary>
public sealed record MachineSchematicReportRequest(
    [property: JsonPropertyName("machineNames")] IReadOnlyList<string>? MachineNames,
    [property: JsonPropertyName("sections")] IReadOnlyList<MachineSchematicReportSection>? Sections);

public sealed record MachineSchematicReportSection(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("displayName")] string? DisplayName,
    [property: JsonPropertyName("sort")] int Sort,
    [property: JsonPropertyName("kind")] string? Kind,
    [property: JsonPropertyName("blocks")] IReadOnlyList<MachineSchematicReportMachineBlock>? Blocks);

public sealed record MachineSchematicReportMachineBlock(
    [property: JsonPropertyName("machineName")] string? MachineName,
    [property: JsonPropertyName("rows")] IReadOnlyList<MachineSchematicReportRow>? Rows,
    [property: JsonPropertyName("images")] IReadOnlyList<MachineSchematicReportImage>? Images,
    [property: JsonPropertyName("sensors")] IReadOnlyList<MachineSchematicReportSensor>? Sensors);

public sealed record MachineSchematicReportRow(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("role")] string? Role,
    [property: JsonPropertyName("sensorType")] string? SensorType,
    [property: JsonPropertyName("spec")] string? Spec,
    [property: JsonPropertyName("purpose")] string? Purpose,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("desc")] string? Desc,
    [property: JsonPropertyName("note")] string? Note,
    [property: JsonPropertyName("sensorIds")] IReadOnlyList<int>? SensorIds,
    [property: JsonPropertyName("image")] MachineSchematicReportImage? Image);

public sealed record MachineSchematicReportSensor(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("sensorType")] string? SensorType,
    [property: JsonPropertyName("brand")] string? Brand,
    [property: JsonPropertyName("model")] string? Model,
    [property: JsonPropertyName("spec")] string? Spec);

public sealed record MachineSchematicReportImage(
    [property: JsonPropertyName("dataUrl")] string? DataUrl,
    [property: JsonPropertyName("fileName")] string? FileName,
    [property: JsonPropertyName("mimeType")] string? MimeType,
    [property: JsonPropertyName("size")] int Size);
