using System.Text;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

using Symtek.Api;
using Symtek.Api.Configuration;
using Symtek.Api.Data;
using Symtek.Api.Infrastructure;
using Symtek.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// JWT 配置：Options 模式绑定 + 启动时快速失败（缺密钥/生产用默认开发密钥直接拒绝启动）
var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwtOptions.Key))
{
    throw new InvalidOperationException("缺少配置 Jwt:Key");
}

ProductionConfigurationGuard.Validate(
    builder.Environment.EnvironmentName,
    builder.Configuration);

builder.Services
    .AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.AddSingleton<JwtService>();

builder.Services
    .AddOptions<RateLimitOptions>()
    .Bind(builder.Configuration.GetSection(RateLimitOptions.SectionName));
builder.Services.AddSingleton<LoginRateLimiter>();

builder.Services.AddDbContext<AppDbContext>(options =>
    options
        .UseSqlite(builder.Configuration.GetConnectionString("Default"))
        .AddInterceptors(new SqlitePragmaInterceptor()));

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
// 授权策略：按 JWT 中的 perm 声明（权限码）校验，权限码由角色 → 用户派生并随 token 签发
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("selection:read", policy =>
        policy.RequireClaim("perm", "selection:read"));
    options.AddPolicy("selection:write", policy =>
        policy.RequireClaim("perm", "selection:write"));
    options.AddPolicy("rbac:view", policy =>
        policy.RequireClaim("perm", "rbac:view"));
    options.AddPolicy("rbac:user:write", policy =>
        policy.RequireClaim("perm", "rbac:user:write"));
    options.AddPolicy("rbac:role:write", policy =>
        policy.RequireClaim("perm", "rbac:role:write"));
    options.AddPolicy("rbac:org:write", policy =>
        policy.RequireClaim("perm", "rbac:org:write"));
    options.AddPolicy("audit:view", policy =>
        policy.RequireClaim("perm", "audit:view"));
});
// 403（已登录但无权限）返回 JSON 提示，而不是空响应体
builder.Services.AddSingleton<
    Microsoft.AspNetCore.Authorization.IAuthorizationMiddlewareResultHandler,
    JsonAuthorizationMiddlewareResultHandler>();

// CORS：优先使用配置的 Cors:AllowedOrigins（逗号分隔）；生产环境由启动保护强制配置。
// 前端使用 Bearer Token、无 Cookie 依赖，跨域直连仅需 Origin/Header/Method 放行。
var corsOrigins = (builder.Configuration["Cors:AllowedOrigins"] ?? string.Empty)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
    {
        if (corsOrigins.Length > 0)
        {
            policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod();
        }
        else
        {
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
        }
    }));

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

builder.Services.AddHttpContextAccessor();

builder.Services
    .AddOptions<AuditOptions>()
    .Bind(builder.Configuration.GetSection(AuditOptions.SectionName));
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddScoped<DbInitializer>();
builder.Services.AddScoped<StoreService>();
builder.Services.AddScoped<ProfileService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<RoleService>();
builder.Services.AddScoped<OrgUnitService>();
builder.Services.AddScoped<MachineSchematicReportService>();

var app = builder.Build();

// 启动时建库 + 种子用户（确保 SQLite 文件目录存在）。
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<DbInitializer>().EnsureReady();
}

app.UseExceptionHandler();

// Swagger 仅开发环境暴露（生产不开放 API 文档入口）
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

/// <summary>程序集入口标记：供集成测试（WebApplicationFactory&lt;Program&gt;）引用。</summary>
public partial class Program
{
}
