namespace Saa.SensorSelection.Api.Services;

/// <summary>
/// JWT 配置（appsettings.json 的 Jwt 节），经 Options 模式绑定。
/// </summary>
public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "Saa.SensorSelection.Api";

    public string Audience { get; set; } = "Saa.SensorSelection";

    public string Key { get; set; } = string.Empty;

    public int ExpireHours { get; set; } = 12;
}
