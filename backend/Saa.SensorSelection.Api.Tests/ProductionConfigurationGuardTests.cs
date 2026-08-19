using Microsoft.Extensions.Configuration;

using Saa.SensorSelection.Api.Configuration;

namespace Saa.SensorSelection.Api.Tests;

public class ProductionConfigurationGuardTests
{
    [Fact]
    public void Production_RejectsDefaultJwtKey()
    {
        var configuration = BuildConfiguration(
            jwtKey: ProductionConfigurationGuard.DefaultJwtKey,
            adminPassword: "strong-admin-password",
            allowedOrigins: "http://localhost:5777");

        var exception = Assert.Throws<InvalidOperationException>(() =>
            ProductionConfigurationGuard.Validate("Production", configuration));

        Assert.Contains("Jwt__Key", exception.Message);
    }

    [Fact]
    public void Production_RejectsDefaultAdminPassword()
    {
        var configuration = BuildConfiguration(
            jwtKey: "strong-jwt-key-0123456789abcdef",
            adminPassword: ProductionConfigurationGuard.DefaultAdminPassword,
            allowedOrigins: "http://localhost:5777");

        var exception = Assert.Throws<InvalidOperationException>(() =>
            ProductionConfigurationGuard.Validate("Production", configuration));

        Assert.Contains("Seed__AdminPassword", exception.Message);
    }

    [Fact]
    public void Production_RejectsMissingCorsOrigins()
    {
        var configuration = BuildConfiguration(
            jwtKey: "strong-jwt-key-0123456789abcdef",
            adminPassword: "strong-admin-password",
            allowedOrigins: null);

        var exception = Assert.Throws<InvalidOperationException>(() =>
            ProductionConfigurationGuard.Validate("Production", configuration));

        Assert.Contains("Cors__AllowedOrigins", exception.Message);
    }

    [Fact]
    public void Production_AllowsExplicitOverrides()
    {
        var configuration = BuildConfiguration(
            jwtKey: "strong-jwt-key-0123456789abcdef",
            adminPassword: "strong-admin-password",
            allowedOrigins: "http://localhost:5777");

        var exception = Record.Exception(() =>
            ProductionConfigurationGuard.Validate("Production", configuration));

        Assert.Null(exception);
    }

    [Fact]
    public void Development_AllowsDevelopmentDefaults()
    {
        var configuration = BuildConfiguration(
            jwtKey: ProductionConfigurationGuard.DefaultJwtKey,
            adminPassword: ProductionConfigurationGuard.DefaultAdminPassword,
            allowedOrigins: null);

        var exception = Record.Exception(() =>
            ProductionConfigurationGuard.Validate("Development", configuration));

        Assert.Null(exception);
    }

    private static IConfiguration BuildConfiguration(
        string? jwtKey,
        string? adminPassword,
        string? allowedOrigins)
    {
        var values = new Dictionary<string, string?>
        {
            ["Jwt:Key"] = jwtKey,
            ["Seed:AdminPassword"] = adminPassword,
            ["Cors:AllowedOrigins"] = allowedOrigins,
        };
        return new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();
    }
}
