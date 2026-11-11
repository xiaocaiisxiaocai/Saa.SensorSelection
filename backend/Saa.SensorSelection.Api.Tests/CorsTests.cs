using System.Net;

using Microsoft.AspNetCore.Hosting;

namespace Saa.SensorSelection.Api.Tests;

public class CorsTests
{
    [Fact]
    public async Task Cors_ExposesStoreEtagForConditionalCrossOriginWrites()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateRawClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/store");
        request.Headers.Add("Origin", "http://localhost:5188");
        using var response = await client.SendAsync(request);
        Assert.NotNull(response.Headers.ETag);
        Assert.Contains("ETag", response.Headers.GetValues("Access-Control-Expose-Headers"));
    }

    private static HttpRequestMessage Preflight(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/health");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "GET");
        return request;
    }

    private static bool HasAllowOrigin(HttpResponseMessage response) =>
        response.Headers.TryGetValues(
            "Access-Control-Allow-Origin",
            out var values) && values.Any();

    [Fact]
    public async Task Cors_WithConfiguredOrigins_AllowsMatchingOriginOnly()
    {
        await using var factory = new ApiFactory()
            .WithWebHostBuilder(builder =>
                builder.UseSetting("Cors:AllowedOrigins", "http://localhost:5178"));
        using var client = factory.CreateClient();

        var allowed = await client.SendAsync(Preflight("http://localhost:5178"));
        Assert.True(HasAllowOrigin(allowed), "配置的来源应返回 Access-Control-Allow-Origin");

        var denied = await client.SendAsync(Preflight("http://evil.example"));
        Assert.False(HasAllowOrigin(denied), "未配置的来源不应返回 Access-Control-Allow-Origin");
    }

    [Fact]
    public async Task Cors_WithoutConfiguration_AllowsAnyOrigin()
    {
        await using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Preflight("http://anything.example"));
        Assert.True(HasAllowOrigin(response), "未配置时保持任意来源宽松策略");
    }

    [Fact]
    public async Task Cors_SupportsCommaSeparatedOrigins()
    {
        await using var factory = new ApiFactory()
            .WithWebHostBuilder(builder =>
                builder.UseSetting(
                    "Cors:AllowedOrigins",
                    "http://localhost:5178, https://sensor.symtek.local"));
        using var client = factory.CreateClient();

        var first = await client.SendAsync(Preflight("http://localhost:5178"));
        Assert.True(HasAllowOrigin(first));

        var second = await client.SendAsync(Preflight("https://sensor.symtek.local"));
        Assert.True(HasAllowOrigin(second));
    }
}
