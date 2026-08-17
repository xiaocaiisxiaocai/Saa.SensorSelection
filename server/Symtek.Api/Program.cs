using System.Text;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

using Symtek.Api;
using Symtek.Api.Data;
using Symtek.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// JWT 配置：Options 模式绑定 + 启动时快速失败（缺密钥/生产用默认开发密钥直接拒绝启动）
var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwtOptions.Key))
{
    throw new InvalidOperationException("缺少配置 Jwt:Key");
}

if (builder.Environment.IsProduction() &&
    jwtOptions.Key == "symtek-selection-dev-key-change-me-0123456789abcdef")
{
    throw new InvalidOperationException(
        "生产环境必须通过环境变量 Jwt__Key 覆盖默认开发密钥");
}

builder.Services
    .AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.AddSingleton<JwtService>();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
        };
    });
builder.Services.AddAuthorization();

// 内网部署：允许跨域直连（前端使用 Bearer Token，不依赖 Cookie）。
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Symtek 感应器选型 API",
        Version = "v1",
        Description = "ASP.NET Core 8 + EF Core + SQLite + JWT",
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "输入登录接口返回的 JWT Token",
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer",
                },
            },
            Array.Empty<string>()
        },
    });
});

// 统一异常处理：未捕获异常返回 JSON ProblemDetails，避免泄露堆栈。
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddScoped<DbInitializer>();
builder.Services.AddScoped<StoreService>();

var app = builder.Build();

// 启动时建库 + 种子用户（确保 SQLite 文件目录存在）。
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<DbInitializer>().EnsureReady();
}

app.UseExceptionHandler();
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

/// <summary>程序集入口标记：供集成测试（WebApplicationFactory&lt;Program&gt;）引用。</summary>
public partial class Program
{
}
