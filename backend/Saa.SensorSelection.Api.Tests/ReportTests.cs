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
                                images = new[]
                                {
                                    new
                                    {
                                        dataUrl = "data:image/png;base64,AAAA",
                                        fileName = "输送机构示意图.png",
                                        mimeType = "image/png",
                                        size = 4,
                                    },
                                },
                                rows = new[]
                                {
                                    new
                                    {
                                        id = 1,
                                        role = "进板检测",
                                        sensorType = "漫反射传感器",
                                        spec = "OMRON E3Z-D61",
                                        purpose = "安装于进板口",
                                        name = "",
                                        desc = "",
                                        note = "板件前缘到位信号",
                                        image = (object?)null,
                                    },
                                },
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
        Assert.Contains("输送机构示意图.png", html);
        Assert.Contains("report-image-overview", html);
        Assert.DoesNotContain("SAA · SENSOR SELECTION", html);
        Assert.DoesNotContain("已选机型：", html);
        Assert.DoesNotContain("按“结构模块 → 机型 → 传感器记录”拼接生成", html);
        Assert.True(
            html.IndexOf("<section class=\"report-image-overview\"", StringComparison.Ordinal)
            < html.IndexOf("<section class=\"report-section\"", StringComparison.Ordinal));
        Assert.Equal(1, CountOccurrences(html, "data:image/png;base64,AAAA"));
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
