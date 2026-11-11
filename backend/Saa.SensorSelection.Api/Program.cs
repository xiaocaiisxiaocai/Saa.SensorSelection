using System.IO.Compression;
using System.Security.Claims;
using System.Text;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

using Saa.SensorSelection.Api;
using Saa.SensorSelection.Api.Configuration;
using Saa.SensorSelection.Api.Data;
using Saa.SensorSelection.Api.Infrastructure;
using Saa.SensorSelection.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// JWT 配置：Options 模式绑定 + 启动时快速失败（缺密钥/生产用默认开发密钥直接拒绝启动）
var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? new JwtOptions();
if (!JwtOptions.HasValidSigningKey(jwtOptions.Key))
{
    throw new InvalidOperationException($"Jwt:Key 必须至少 {JwtOptions.MinimumKeyBytes} 字节");
}
if (string.IsNullOrWhiteSpace(jwtOptions.Issuer) ||
    string.IsNullOrWhiteSpace(jwtOptions.Audience) ||
    jwtOptions.ExpireHours <= 0)
{
    throw new InvalidOperationException("Jwt:Issuer、Jwt:Audience 必须填写，Jwt:ExpireHours 必须大于 0");
}

ProductionConfigurationGuard.Validate(
    builder.Environment.EnvironmentName,
    builder.Configuration);

builder.Services
    .AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
    .Validate(options => JwtOptions.HasValidSigningKey(options.Key),
        $"Jwt:Key 必须至少 {JwtOptions.MinimumKeyBytes} 字节")
    .Validate(options => !string.IsNullOrWhiteSpace(options.Issuer), "Jwt:Issuer 不能为空")
    .Validate(options => !string.IsNullOrWhiteSpace(options.Audience), "Jwt:Audience 不能为空")
    .Validate(options => options.ExpireHours > 0, "Jwt:ExpireHours 必须大于 0")
    .ValidateOnStart();
builder.Services.AddSingleton<JwtService>();

builder.Services
    .AddOptions<RateLimitOptions>()
    .Bind(builder.Configuration.GetSection(RateLimitOptions.SectionName))
    .Validate(options => options.MaxFailures > 0, "RateLimit:MaxFailures 必须大于 0")
    .Validate(options => options.WindowMinutes > 0, "RateLimit:WindowMinutes 必须大于 0")
    .Validate(options => options.MaxTrackedKeys > 0, "RateLimit:MaxTrackedKeys 必须大于 0")
    .ValidateOnStart();
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
        // 每个请求都回查不可复用的用户主键、启用状态和会话指纹。
        // 改密、角色/权限变化、停用、删除或同名重建都会立即使旧 token 失效。
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var subject = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
                var fingerprint = context.Principal?.FindFirstValue(JwtService.SessionFingerprintClaim);
                if (!int.TryParse(
                        subject,
                        System.Globalization.NumberStyles.None,
                        System.Globalization.CultureInfo.InvariantCulture,
                        out var userId) ||
                    string.IsNullOrWhiteSpace(fingerprint))
                {
                    context.Fail("token 缺少身份声明");
                    return;
                }

                var db = context.HttpContext.RequestServices
                    .GetRequiredService<AppDbContext>();
                var user = await db.Users
                    .AsNoTracking()
                    .AsSplitQuery()
                    .Include(item => item.Roles)
                    .ThenInclude(role => role.Permissions)
                    .FirstOrDefaultAsync(
                        item => item.Id == userId && item.IsActive,
                        context.HttpContext.RequestAborted);
                if (user is null)
                {
                    context.Fail("账号已停用或已删除");
                    return;
                }

                var roles = user.Roles.Select(role => role.Code);
                var permissions = user.Roles
                    .SelectMany(role => role.Permissions)
                    .Select(permission => permission.Code);
                var jwt = context.HttpContext.RequestServices.GetRequiredService<JwtService>();
                if (!jwt.IsSessionFingerprintValid(fingerprint, user, roles, permissions))
                {
                    context.Fail("账号权限或凭据已变更");
                }
            },
        };
    });
// 授权策略：按 JWT 中的 perm 声明（权限码）校验，权限码由角色 → 用户派生并随 token 签发
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("selection:read", policy =>
        policy.RequireClaim("perm", "selection:read"));
    options.AddPolicy("selection:write", policy =>
        policy.RequireClaim("perm", "selection:write"));
    options.AddPolicy("file:download", policy =>
        policy.RequireClaim("perm", "file:download"));
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
var corsOrigins = ProductionConfigurationGuard.ParseAllowedOrigins(
    builder.Configuration["Cors:AllowedOrigins"]);
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
    {
        if (corsOrigins.Length > 0)
        {
            policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("ETag");
        }
        else
        {
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("ETag");
        }
    }));

// JSON 元数据仍启用 gzip；PDF/图片正文由 /api/files 按需返回，不进入 /api/store。
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(
        ["application/problem+json"]);
});
builder.Services.Configure<GzipCompressionProviderOptions>(options =>
    options.Level = CompressionLevel.Fastest);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "SAA 感应器选型 API",
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
builder.Services.AddScoped<StoredFileService>();
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
app.UseResponseCompression();

// IIS 单目录部署：前端构建产物由打包脚本复制到后端发布目录的 wwwroot。
// 生产使用 hash 路由，因此不需要 URL Rewrite；默认文档负责提供 index.html。
app.UseDefaultFiles();
app.UseStaticFiles();

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
