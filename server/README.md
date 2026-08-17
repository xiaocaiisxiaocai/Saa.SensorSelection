# Symtek.Api — 感应器选型后端

ASP.NET Core 8 + EF Core + SQLite + JWT 的轻量后端，为前端 `apps/web-ele` 提供数据仓库持久化与登录鉴权。业务校验仍由前端 `modules/selection/domain.js` 完成，后端只负责按 `key → JSON 数组` 的通用结构存取数据。

## 技术栈

- .NET 8 / ASP.NET Core Web API（C# 12、主构造函数、Nullable 开启）
- EF Core 8 + SQLite
- JWT Bearer 认证（HS256，Options 模式配置）
- Swagger / OpenAPI（Swashbuckle）
- xUnit + `WebApplicationFactory` 集成测试

## 目录结构

```
server/
├── Symtek.slnx                # 解决方案（API + Tests）
├── Symtek.Api/                # 主项目
│   ├── Program.cs             # 组合根：DI、认证、Swagger、中间件
│   ├── GlobalExceptionHandler.cs
│   ├── Controllers/           # AuthController / StoreController / HealthController（薄控制器）
│   ├── Services/              # JwtService / JwtOptions / StoreService / PasswordService
│   ├── Data/                  # AppDbContext / DbSeeder / DbInitializer
│   ├── Models/                # User / StoreEntry
│   └── Migrations/            # EF Core 迁移（启动自动应用）
└── Symtek.Api.Tests/          # 集成测试
```

## 开发运行

前置：.NET 8 SDK（`dotnet --list-sdks` 应含 8.x）。

```bash
cd server/Symtek.Api
dotnet run    # 默认 http://localhost:5080（launchSettings 的 http profile）
```

- Swagger：http://localhost:5080/swagger
- 前端开发代理：`apps/web-ele/vite.config.mts` 把 `/api` 转发到 `http://localhost:5080`
- 首次启动自动完成：创建 SQLite 数据目录 → 应用 EF Migrations → 种子 admin 用户

## 配置项（appsettings.json）

| 配置键 | 默认值 | 说明 |
| --- | --- | --- |
| `ConnectionStrings:Default` | `Data Source=App_Data/symtek.db` | SQLite 连接串，可用绝对路径 |
| `Jwt:Issuer` | `Symtek.Api` | token 签发者 |
| `Jwt:Audience` | `Symtek.Selection` | token 受众 |
| `Jwt:Key` | 开发密钥（见下） | **生产必须覆盖** |
| `Jwt:ExpireHours` | `12` | token 有效期（小时），登录响应 `expiresAt` 取真实值 |
| `Seed:AdminUsername` | `admin` | 种子账号用户名 |
| `Seed:AdminPassword` | `admin123` | 种子账号密码（首次启动写入，之后不覆盖） |
| `Seed:AdminDisplayName` | `管理员` | 显示名 |
| `Kestrel:Limits:MaxRequestBodySize` | `104857600` (100MB) | 受控文档等 base64 文件较大，放宽默认 30MB |
| `AllowedHosts` | `*` | 内网部署放开 |

## 生产密钥注入（重要）

默认开发密钥 `symtek-selection-dev-key-change-me-0123456789abcdef` **仅限开发**。当 `ASPNETCORE_ENVIRONMENT=Production` 时若仍使用该密钥，启动会抛出异常拒绝运行（防呆）。

注入方式任选其一：

```bash
# 1. 环境变量（键用 __ 表示层级）
#    Linux/macOS
export Jwt__Key="<随机 32+ 字节密钥>"
#    Windows PowerShell
$env:Jwt__Key="<随机 32+ 字节密钥>"

# 2. 用户机密（仅本机开发，不会进 git）
cd server/Symtek.Api
dotnet user-secrets set "Jwt:Key" "<随机 32+ 字节密钥>"

# 3. 部署平台环境变量（IIS/nginx/systemd 等）
```

其余配置同理：`Jwt__ExpireHours`、`Seed__AdminPassword` 等。生成密钥示例：`openssl rand -base64 48`。

## EF Core Migrations

启动时由 `DbInitializer → DbSeeder` 自动调用 `Database.Migrate()` 应用待迁移，日常运行无需手动操作。开发时用 dotnet-ef 本地工具（清单在仓库根 `dotnet-tools.json`）：

```bash
# 修改模型后新增迁移
dotnet tool run dotnet-ef migrations add YourChange --project server/Symtek.Api

# 查看待应用/已应用迁移
dotnet tool run dotnet-ef migrations list --project server/Symtek.Api

# 回滚最近一次（仅删除生成文件，不改数据库）
dotnet tool run dotnet-ef migrations remove --project server/Symtek.Api

# 生成 SQL 脚本（交付评审/手工执行）
dotnet tool run dotnet-ef migrations script --project server/Symtek.Api
```

> 注意：旧版本用 `EnsureCreated` 建库（无 `__EFMigrationsHistory` 表），直接 `Migrate()` 会因表已存在而失败。升级路径：先备份 `App_Data`，删除旧库让迁移重建，或手工向 `__EFMigrationsHistory` 补记录。本次迁移已把 `App_Data.bak-ensurecreated` 保留作备份示例。

## 测试

```bash
dotnet test server/Symtek.slnx      # 或 pnpm run test:backend
```

集成测试通过 `WebApplicationFactory<Program>` 启动**完整应用**（含迁移与种子），每个测试用独立临时 SQLite 文件。覆盖：健康检查、登录成功/失败/缺字段、未授权访问、存储 CRUD 往返、整体替换校验与旧 key 清除语义。

## 发布部署

```bash
dotnet publish server/Symtek.Api -c Release -o publish/symtek-api
```

产物为可独立运行的目录：

```bash
# 生产环境变量
ASPNETCORE_ENVIRONMENT=Production
Jwt__Key=<生产密钥>

# 可选：覆盖数据目录（默认相对内容根 App_Data/symtek.db）
ConnectionStrings__Default="Data Source=/data/symtek/symtek.db"

# 运行
./Symtek.Api            # Linux
Symtek.Api.exe          # Windows
```

部署形态二选一：
- **内网直连 Kestrel**：`--urls http://0.0.0.0:5080`，前端把 `VITE_API_BASE` 指向该地址；
- **反向代理**：IIS / nginx / systemd 代理到 Kestrel，适合统一 443/域名入口。

## 数据兼容

存储结构 `key → JSON 数组`，key 形如 `customer-req:客户名`、`sensor-catalog:all`、`dict:xxx`，与前端 `symtek_crud_store` 一一对应。前端首次连接后端（空库）时，桥接层会自动把 localStorage 旧数据整体导入（`PUT /api/store`），此后按 key 增量同步（`PUT/DELETE /api/store/{key}`）。

## API 一览

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | 匿名 | 账号密码登录，返回 JWT 与过期时间 |
| `GET` | `/api/health` | 匿名 | 健康检查 |
| `GET` | `/api/store` | Bearer | 全部 key → JSON 数组 |
| `GET` | `/api/store/{key}` | Bearer | 单个 key |
| `PUT` | `/api/store` | Bearer | 整体替换（迁移导入） |
| `PUT` | `/api/store/{key}` | Bearer | 写入/覆盖单个 key |
| `DELETE` | `/api/store/{key}` | Bearer | 删除单个 key |
