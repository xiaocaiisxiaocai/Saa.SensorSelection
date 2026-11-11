using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Saa.SensorSelection.Api.Tests;

public class ReportTests
{
    private static async Task<HttpClient> CreateLoggedInClientAsync(ApiFactory factory)
    {
        using var login = factory.CreateClient();
        var response = await login.PostAsJsonAsync(
            "/api/auth/login",
            new { username = "admin", password = "admin123" });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", body.GetProperty("token").GetString());
        return client;
    }

    private static async Task<JsonElement> UploadImageAsync(HttpClient client, byte[] bytes)
    {
        using var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(content, "file", "持久化示意图.png");
        using var response = await client.PostAsync("/api/files", form);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task MachineSchematicReport_WithoutLogin_Returns401()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/reports/machine-schematic",
            new
            {
                machineNames = new[] { "中间翻板机" },
                sections = Array.Empty<object>(),
            });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task MachineSchematicReport_GeneratesDownloadableHtml()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        var response = await client.PostAsJsonAsync(
            "/api/reports/machine-schematic",
            new
            {
                machineNames = new[] { "中间翻板机", "双边投板机", "压合专用机" },
                sections = new[]
                {
                    new
                    {
                        id = 1,
                        name = "输送机构",
                        displayName = "输送机构",
                        sort = 1,
                        kind = "structure",
                        blocks = new[]
                        {
                            new
                            {
                                machineName = "中间翻板机",
                                images = new object[]
                                {
                                    new
                                    {
                                        dataUrl = "data:image/png;base64,AAAA",
                                        fileName = "输送机构示意图.png",
                                        mimeType = "image/png",
                                        size = 4,
                                    },
                                },
                                rows = new object[]
                                {
                                    new
                                    {
                                        id = 1,
                                        role = "进板检测",
                                        processStepName = "内层 · DES 显影",
                                        sensorIds = new[] { 1, 2 },
                                        sensorType = "漫反射传感器",
                                        spec = "OMRON E3Z-D61",
                                        purpose = "安装于进板口",
                                        name = "",
                                        desc = "",
                                        note = "板件前缘到位信号",
                                        image = (object?)null,
                                    },
                                },
                                sensors = new object[]
                                {
                                    new
                                    {
                                        id = 1,
                                        sensorType = "漫反射传感器",
                                        brand = "OMRON",
                                        model = "E3Z-D61",
                                        spec = "OMRON E3Z-D61 · 检测距离 0~300mm",
                                    },
                                    new
                                    {
                                        id = 2,
                                        sensorType = "对射传感器",
                                        brand = "OMRON",
                                        model = "E3Z-T61",
                                        spec = "检测距离 0~10m",
                                    },
                                },
                            },
                            new
                            {
                                machineName = "双边投板机",
                                images = Array.Empty<object>(),
                                rows = new object[]
                                {
                                    new
                                    {
                                        id = 2,
                                        role = "出板检测",
                                        sensorIds = Array.Empty<int>(),
                                        sensorType = "光纤式",
                                        spec = "检测距离 4mm",
                                        purpose = "确认出板",
                                        name = "",
                                        desc = "",
                                        note = "",
                                        image = (object?)null,
                                    },
                                },
                                sensors = Array.Empty<object>(),
                            },
                        },
                    },
                },
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.NotNull(response.Content.Headers.ContentDisposition?.FileName);

        var html = await response.Content.ReadAsStringAsync();
        Assert.Contains("中间翻板机", html);
        Assert.Contains("输送机构", html);
        Assert.Contains("OMRON E3Z-D61", html);
        Assert.Contains("<th>工艺制程</th>", html);
        Assert.Contains("内层 &#183; DES 显影", html);
        Assert.Contains(
            "<tr><td class=\"report-structure-table__sensor\">对射传感器</td><td class=\"report-structure-table__spec\">检测距离 0~10m</td></tr>",
            html);
        Assert.Contains("class=\"report-structure-table__serial\" rowspan=\"2\"", html);
        Assert.Contains("<col class=\"report-structure-table__sensor-col\" />", html);
        Assert.DoesNotContain(".report-structure-table td:nth-child(1)", html);
        Assert.Contains("输送机构示意图.png", html);
        Assert.Contains("report-machine-block__layout--with-image", html);
        Assert.Contains("report-machine-block__layout--full", html);
        Assert.DoesNotContain("report-image-overview", html);
        Assert.Contains(
            "grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2fr);",
            html);
        Assert.Contains(
            ".report-machine-block__images img { display: block; width: 100%;",
            html);
        Assert.Contains(
            ".report-structure-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 14px; }",
            html);
        Assert.Contains(
            ".report-structure-table th, .report-structure-table td { padding: 7px 8px;",
            html);
        Assert.Contains("vertical-align: middle;", html);
        Assert.DoesNotContain("vertical-align: top;", html);
        Assert.Contains("line-height: 1.5;", html);
        Assert.Contains("@media print {", html);
        Assert.Contains(
            ":root { color-scheme: light; font-family: \"Microsoft YaHei\", \"PingFang SC\", sans-serif; color: #172033; background: #fff; }",
            html);
        Assert.Contains("body { margin: 0; padding: 24px; background: #eef2f6; }", html);
        Assert.Contains(".report-structure-table { font-size: 14px; }", html);
        Assert.DoesNotContain("SAA · SENSOR SELECTION", html);
        Assert.DoesNotContain("已选机型：", html);
        Assert.DoesNotContain("按“结构模块 → 机型 → 传感器记录”拼接生成", html);
        var firstMachineIndex = html.IndexOf("中间翻板机", StringComparison.Ordinal);
        var imageIndex = html.IndexOf("class=\"report-structure-image\"", StringComparison.Ordinal);
        var firstTableIndex = html.IndexOf("class=\"report-structure-table\"", StringComparison.Ordinal);
        Assert.True(firstMachineIndex < imageIndex);
        Assert.True(imageIndex < firstTableIndex);
        Assert.Equal(1, CountOccurrences(html, "data:image/png;base64,AAAA"));
    }

    [Fact]
    public async Task MachineSchematicReport_AcceptsFullMenuPathsAsMachineNames()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        // 机型名是完整选单路径：分类 / 配置 / 机型 / 二级 Tab，每级最多 40 字
        var level = new string('长', 40);
        var fullPath = $"{level} / {level} / {level} / {level}";
        object Request(string name) => new
        {
            machineNames = new[] { name },
            sections = new[]
            {
                new
                {
                    id = 1,
                    name = "输送机构",
                    displayName = "输送机构",
                    sort = 1,
                    kind = "structure",
                    blocks = new[] { new { machineName = name, rows = Array.Empty<object>() } },
                },
            },
        };

        var ok = await client.PostAsJsonAsync("/api/reports/machine-schematic", Request(fullPath));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Contains(fullPath, await ok.Content.ReadAsStringAsync());

        var tooLong = await client.PostAsJsonAsync(
            "/api/reports/machine-schematic",
            Request(new string('长', 201)));
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
    }

    [Fact]
    public async Task MachineSchematicReport_EmbedsStoredImagesAndKeepsMoreThanTwo()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);
        var storedBytes = new byte[] { 137, 80, 78, 71, 1, 2, 3, 4 };
        var uploaded = await UploadImageAsync(client, storedBytes);
        var storedUrl = uploaded.GetProperty("dataUrl").GetString()!;
        var second = Convert.ToBase64String(new byte[] { 137, 80, 78, 71, 5 });
        var third = Convert.ToBase64String(new byte[] { 137, 80, 78, 71, 6 });

        var response = await client.PostAsJsonAsync(
            "/api/reports/machine-schematic",
            new
            {
                machineNames = new[] { "测试机型" },
                sections = new[]
                {
                    new
                    {
                        id = 1,
                        name = "结构",
                        displayName = "结构",
                        sort = 1,
                        kind = "structure",
                        blocks = new[]
                        {
                            new
                            {
                                machineName = "测试机型",
                                rows = Array.Empty<object>(),
                                images = new object[]
                                {
                                    new { dataUrl = storedUrl, fileName = "持久化.png", mimeType = "image/png", size = storedBytes.Length },
                                    new { dataUrl = $"data:image/png;base64,{second}", fileName = "第二张.png", mimeType = "image/png", size = 5 },
                                    new { dataUrl = $"data:image/png;base64,{third}", fileName = "第三张.png", mimeType = "image/png", size = 5 },
                                },
                            },
                        },
                    },
                },
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var html = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(storedUrl, html, StringComparison.Ordinal);
        Assert.Contains($"data:image/png;base64,{Convert.ToBase64String(storedBytes)}", html);
        Assert.Contains($"data:image/png;base64,{second}", html);
        Assert.Contains($"data:image/png;base64,{third}", html);
        Assert.Equal(3, CountOccurrences(html, "class=\"report-structure-image\""));
    }

    [Fact]
    public async Task MachineSchematicReport_RejectsExcessiveSensorLinks()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);
        var response = await client.PostAsJsonAsync(
            "/api/reports/machine-schematic",
            new
            {
                machineNames = new[] { "测试机型" },
                sections = new[]
                {
                    new
                    {
                        id = 1,
                        name = "结构",
                        displayName = "结构",
                        sort = 1,
                        kind = "structure",
                        blocks = new[]
                        {
                            new
                            {
                                machineName = "测试机型",
                                images = Array.Empty<object>(),
                                rows = new[]
                                {
                                    new { id = 1, sensorIds = Enumerable.Range(1, 51).ToArray() },
                                },
                                sensors = Array.Empty<object>(),
                            },
                        },
                    },
                },
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            "最多关联 50 个 Sensor",
            (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("message").GetString());
    }

    [Fact]
    public async Task MachineSchematicReport_RejectsUnselectedMachineAndEscapesMarkup()
    {
        await using var factory = new ApiFactory();
        using var client = await CreateLoggedInClientAsync(factory);

        var invalid = await client.PostAsJsonAsync(
            "/api/reports/machine-schematic",
            new
            {
                machineNames = new[] { "机型 A" },
                sections = new[]
                {
                    new
                    {
                        id = 1,
                        name = "输送机构",
                        displayName = "输送机构",
                        sort = 1,
                        kind = "structure",
                        blocks = new[]
                        {
                            new { machineName = "机型 B", rows = Array.Empty<object>() },
                        },
                    },
                },
            });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var escaped = await client.PostAsJsonAsync(
            "/api/reports/machine-schematic",
            new
            {
                machineNames = new[] { "<机型>" },
                sections = new[]
                {
                    new
                    {
                        id = 1,
                        name = "输送机构",
                        displayName = "输送机构",
                        sort = 1,
                        kind = "structure",
                        blocks = new[]
                        {
                            new { machineName = "<机型>", rows = Array.Empty<object>() },
                        },
                    },
                },
            });
        Assert.Equal(HttpStatusCode.OK, escaped.StatusCode);
        var html = await escaped.Content.ReadAsStringAsync();
        Assert.Contains("&lt;机型&gt;", html);
        Assert.DoesNotContain("<机型>", html);
    }

    private static int CountOccurrences(string value, string marker)
    {
        var count = 0;
        var index = 0;
        while ((index = value.IndexOf(marker, index, StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += marker.Length;
        }

        return count;
    }
}
