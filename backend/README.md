# Saa.SensorSelection.Api — 感应器选型后端

ASP.NET Core 8 + EF Core + SQLite + JWT 的轻量后端，为前端 `apps/web-ele` 提供数据仓库持久化与登录鉴权。业务校验仍由前端 `modules/selection/domain.js` 完成，后端只负责按 `key → JSON 数组` 的通用结构存取数据。

## 技术栈

- .NET 8 / ASP.NET Core Web API（C# 12、主构造函数、Nullable 开启）
- EF Core 8 + SQLite
- JWT Bearer 认证（HS256，Options 模式配置）
- Swagger / OpenAPI（Swashbuckle）
- xUnit + `WebApplicationFactory` 集成测试

## 目录结构

```
backend/
├── Saa.SensorSelection.slnx                # 解决方案（API + Tests）
├── Saa.SensorSelection.Api/                # 主项目
│   ├── Program.cs             # 组合根：DI、认证、Swagger、中间件
│   ├── GlobalExceptionHandler.cs
│   ├── Controllers/           # Auth / Store / Health / RBAC(用户/角色/组织) / AuditLogs（薄控制器）
│   ├── Services/              # JwtService / StoreService / ProfileService / RBAC 服务 / AuditLogService
│   ├── Data/                  # AppDbContext / DbSeeder / DbInitializer
│   ├── Models/                # User / StoreEntry
│   └── Migrations/            # EF Core 迁移（启动自动应用）
└── Saa.SensorSelection.Api.Tests/          # 集成测试
```

## 开发运行

前置：.NET 8 SDK（`dotnet --list-sdks` 应含 8.x）。

```bash
cd backend/Saa.SensorSelection.Api
dotnet run    # 默认 http://localhost:5080（launchSettings 的 http profile）
```

- Swagger：http://localhost:5080/swagger（**仅 Development 环境启用**，生产不暴露 API 文档）
- 前端开发代理：`apps/web-ele/vite.config.mts` 把 `/api` 转发到 `http://localhost:5080`（端口被占用时可用 `VITE_API_TARGET=http://localhost:5081 pnpm run dev` 覆盖）
- 首次启动自动完成：创建 SQLite 数据目录 → 应用 EF Migrations → 种子权限/内置角色（admin/editor/viewer）→ 种子 admin 用户并授予系统管理员角色

## 配置项（appsettings.json）

| 配置键 | 默认值 | 说明 |
| --- | --- | --- |
| `ConnectionStrings:Default` | `Data Source=App_Data/symtek.db` | SQLite 连接串。`symtek.db` 是历史兼容文件名，迁移项目目录不会改变现有数据；可用绝对路径（启动自动启用 WAL，连接自动设 busy_timeout=30s） |
| `Jwt:Issuer` | `Saa.SensorSelection.Api` | token 签发者 |
| `Jwt:Audience` | `Saa.SensorSelection` | token 受众 |
| `Jwt:Key` | 开发密钥（见下） | **生产必须覆盖** |
| `Jwt:ExpireHours` | `12` | token 有效期（小时），登录响应 `expiresAt` 取真实值 |
| `Seed:AdminUsername` | `admin` | 种子账号用户名 |
| `Seed:AdminPassword` | `admin123`（仅开发） | 种子账号密码（首次启动写入，之后不覆盖；生产必须覆盖） |
| `Seed:AdminDisplayName` | `管理员` | 显示名 |
| `RateLimit:MaxFailures` | `5` | 登录失败限流：窗口内失败达到上限后拒绝登录（按用户名+IP） |
| `RateLimit:WindowMinutes` | `10` | 登录限流统计窗口（分钟） |
| `Audit:MaxEntries` | `50000` | 操作日志保留上限（条），超出自动清理最旧记录；`0`=不限制 |
| `Cors:AllowedOrigins` | 空（任意来源，仅开发） | 允许跨域的来源，逗号分隔；生产必须配置，否则拒绝启动 |
| `Kestrel:Limits:MaxRequestBodySize` | `104857600` (100MB) | 受控文档等 base64 文件较大，放宽默认 30MB |
| `AllowedHosts` | `*` | 内网部署放开 |

## 生产密钥注入（重要）

默认开发密钥 `saa-sensor-selection-dev-key-change-me-0123456789abcdef` 和默认管理员密码 `admin123` **仅限开发**。当 `ASPNETCORE_ENVIRONMENT=Production` 时若仍使用任一默认值，或未配置 `Cors:AllowedOrigins`，启动会抛出异常拒绝运行（防呆）。

注入方式任选其一：

```bash
# 1. 环境变量（键用 __ 表示层级）
#    Linux/macOS
export Jwt__Key="<随机 32+ 字节密钥>"
#    Windows PowerShell
$env:Jwt__Key="<随机 32+ 字节密钥>"

# 生产管理员种子密码（首次启动写入数据库）
$env:Seed__AdminPassword="<高强度初始密码>"

# 生产前端来源（逗号分隔）
$env:Cors__AllowedOrigins="https://sensor.example.com"

# 2. 用户机密（仅本机开发，不会进 git）
cd backend/Saa.SensorSelection.Api
dotnet user-secrets set "Jwt:Key" "<随机 32+ 字节密钥>"

# 3. 部署平台环境变量（IIS/nginx/systemd 等）
```

其余配置同理：`Jwt__ExpireHours`、`Seed__AdminPassword` 等。生成密钥示例：`openssl rand -base64 48`。

## EF Core Migrations

启动时由 `DbInitializer → DbSeeder` 自动调用 `Database.Migrate()` 应用待迁移，日常运行无需手动操作。开发时用 dotnet-ef 本地工具（清单在仓库根 `dotnet-tools.json`）：

```bash
# 修改模型后新增迁移
dotnet tool run dotnet-ef migrations add YourChange --project backend/Saa.SensorSelection.Api

# 查看待应用/已应用迁移
dotnet tool run dotnet-ef migrations list --project backend/Saa.SensorSelection.Api

# 回滚最近一次（仅删除生成文件，不改数据库）
dotnet tool run dotnet-ef migrations remove --project backend/Saa.SensorSelection.Api

# 生成 SQL 脚本（交付评审/手工执行）
dotnet tool run dotnet-ef migrations script --project backend/Saa.SensorSelection.Api
```

> 注意：旧版本用 `EnsureCreated` 建库（无 `__EFMigrationsHistory` 表），直接 `Migrate()` 会因表已存在而失败。升级路径：先备份 `App_Data`，删除旧库让迁移重建，或手工向 `__EFMigrationsHistory` 补记录。本次迁移已把 `App_Data.bak-ensurecreated` 保留作备份示例。

## 测试

```bash
dotnet test backend/Saa.SensorSelection.slnx      # 或 pnpm run test:backend
```

集成测试通过 `WebApplicationFactory<Program>` 启动**完整应用**（含迁移与种子），每个测试用独立临时 SQLite 文件。覆盖：健康检查、登录成功/失败/缺字段、未授权访问、存储 CRUD 往返、整体替换校验与旧 key 清除语义、RBAC 全流程（用户/角色/组织 CRUD 与保护规则）、登录限流、CORS 配置、种子幂等重启、操作日志（登录/写入/管理操作埋点、权限 403、筛选分页）。

## 发布部署

```bash
dotnet publish backend/Saa.SensorSelection.Api -c Release -o publish/saa-sensor-selection-api
```

产物为可独立运行的目录：

```bash
# 生产环境变量
ASPNETCORE_ENVIRONMENT=Production
Jwt__Key=<生产密钥>
Seed__AdminPassword=<生产初始管理员密码>
Cors__AllowedOrigins=https://sensor.example.com

# 可选：覆盖数据目录（默认相对内容根 App_Data/symtek.db）
ConnectionStrings__Default="Data Source=/data/saa-sensor-selection/symtek.db"

# 运行
./Saa.SensorSelection.Api            # Linux
Saa.SensorSelection.Api.exe          # Windows
```

部署形态二选一：
- **内网直连 Kestrel**：`--urls http://0.0.0.0:5080`，前端把 `VITE_API_BASE` 指向该地址；
- **反向代理**：IIS / nginx / systemd 代理到 Kestrel，适合统一 443/域名入口。

## 数据备份

数据集中在单个 SQLite 文件（`App_Data/symtek.db`），建议定期备份：

```bash
pnpm run backup:db              # 默认保留最近 10 份到 backups/
KEEP=30 pnpm run backup:db      # 保留 30 份
BACKUP_DIR=/data/saa-sensor-selection-backups pnpm run backup:db
```

脚本直接拷贝主库文件；若后端处于写操作中（WAL 模式），拷贝可能不含未 checkpoint 的尾部数据，对一致性要求高时建议停服备份或用 `sqlite3` 的 `VACUUM INTO`。

## SQLite 并发说明

启动时自动启用 `WAL` 日志模式（持久），每个连接打开时设置 `busy_timeout=30000`——多客户端同时写入时等待锁而不是直接报 "database is locked"。

## RBAC 权限模型

### 权限码（进入 JWT claims，后端 `RequireClaim("perm", ...)` 策略强制校验）

| 权限码 | 说明 | 归属 |
| --- | --- | --- |
| `selection:read` | 查看业务数据（客户/制程/机型/Sensor/字典/搜索） | 业务 |
| `selection:write` | 编辑业务数据（增删改） | 业务 |
| `rbac:view` | 进入系统管理（用户/角色/组织页面） | 系统 |
| `rbac:user:write` | 管理用户（增删改/重置密码） | 系统 |
| `rbac:role:write` | 管理角色 | 系统 |
| `rbac:org:write` | 管理组织架构 | 系统 |
| `audit:view` | 查看操作日志 | 系统 |

### 内置角色（种子，启动幂等补齐）

| 角色 | 权限 | 说明 |
| --- | --- | --- |
| `admin` 系统管理员 | 全部 | **内置系统角色**：不可修改权限、不可删除（防呆：不能删除自己、至少保留一名系统管理员） |
| `editor` 业务维护员 | `selection:read` + `selection:write` | 可读写业务数据，无系统管理权限 |
| `viewer` 只读用户 | `selection:read` | 仅可查看 |

默认账号 `admin / admin123`（`Seed` 节可改）自动获得系统管理员角色；**登录后建议立刻创建自己的账号并修改种子密码**。

### 组织架构

- `OrgUnit` 自引用树（`ParentId`），层级为自由文本（默认使用 事业部/部门/课别，允许自定义），**任意节点可挂在任意节点下——天然支持跳级**（如课别直接挂在事业部下）。
- 用户通过「所属组织」挂到某个节点（可空）；登录响应与 `/api/auth/me` 会返回组织路径（如 `制造事业部 / 装配部 / 选型课`）。
- 删除保护：有子级或已挂用户的节点不可删除；父级不能是自身或其后代（防环）。

### 鉴权流程

1. 登录（`POST /api/auth/login`）→ 返回 JWT + 角色 + 权限码 + 组织；JWT 携带 `role`/`perm`/`org` 声明。
2. 前端启动/首次导航 → `GET /api/auth/me` 拉取资料 → 权限码写入前端 access store，路由与菜单按 `meta.authority`（权限码）过滤，业务页面写操作按钮按 `selection:write` 显示/隐藏。
3. 后端所有写接口带 `selection:write` 策略、RBAC 管理接口带 `rbac:*` 策略；**已登录但无权限返回 403 + `{"message":"无权限执行此操作"}`**（与 401 登录失效区分，前端不会误跳转登录页）。
4. 权限/角色变更后无需重新部署——下次登录（或重新签发 token）即生效。

### 匿名只读预览与登录页

- **业务数据读接口对匿名开放**（`GET /api/store` 等不带 token 也可读），未登录用户可以**只读预览**客户管理、制程管理、机型结构、Sensor 型号字典——前端隐藏所有写操作按钮，后端写接口仍要求 `selection:write`（匿名写返回 401）。
- 前端提供独立登录页 `/login`（退出登录、token 失效、匿名用户点右上角「登录」都会进入）：可账号密码登录，或选「以游客身份预览（只读）」跳过登录直接浏览业务数据。
- 系统管理（用户/角色/组织/操作日志）仅登录后按权限码显示，游客不可见、直接访问 URL 404、调接口 403。

## 操作日志（审计）

后端自动记录关键操作到 `AuditLogs` 表（成功与失败都记），管理员在「系统管理 → 操作日志」页面查看（需 `audit:view` 权限，内置 admin 角色自动拥有）。

记录范围：

- 登录成功/失败/停用/限流（`auth.login`，失败带原因）
- 业务数据写入/删除/整体导入（`store.upsert` / `store.delete` / `store.replace-all`，含 key 与条目数）
- 用户/角色/组织管理（`user.*` / `role.*` / `org.*`）

每条记录包含：时间、操作人、操作码、目标、详情、结果、失败原因、客户端 IP。审计写入失败只记服务端日志、**不影响主业务请求**；超过 `Audit:MaxEntries`（默认 5 万条）自动清理最旧记录。**敏感字段（密码等）绝不会写入日志**。

查询接口：`GET /api/audit-logs?page=&pageSize=&action=&username=&target=&result=&from=&to=`（分页 + 多条件筛选，时间倒序）。

## 数据存储结构

存储结构 `key → JSON 数组`，key 形如 `customer-req:客户名`、`sensor-catalog:all`、`dict:xxx`，与前端 `symtek_crud_store` 一一对应。前端首次连接后端（空库）时，桥接层会自动处理：

1. 本地有旧数据 → 整体导入（`PUT /api/store`）；
2. 本地也无数据（全新环境）→ 把前端内置基础数据（数据字典、客户/机型分组、制程步骤、机型结构、Sensor 型号目录）种子导入后端，保证任何客户端看到一致的基础数据；

此后按 key 增量同步（`PUT/DELETE /api/store/{key}`）。

## API 一览

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | 匿名 | 账号密码登录，返回 JWT + 角色/权限/组织 |
| `GET` | `/api/auth/me` | Bearer | 当前用户资料（角色/权限/组织） |
| `GET` | `/api/health` | 匿名 | 健康检查（含数据库连通性，DB 不可用返回 503） |
| `GET` | `/api/store` | 匿名 | 全部 key → JSON 数组（匿名只读预览） |
| `GET` | `/api/store/{key}` | 匿名 | 单个 key（匿名只读预览） |
| `PUT` | `/api/store` | `selection:write` | 整体替换（迁移导入） |
| `PUT` | `/api/store/{key}` | `selection:write` | 写入/覆盖单个 key |
| `DELETE` | `/api/store/{key}` | `selection:write` | 删除单个 key |
| `GET` | `/api/rbac/users` | `rbac:view` | 用户列表（含角色/组织） |
| `POST` | `/api/rbac/users` | `rbac:user:write` | 创建用户 |
| `PUT` | `/api/rbac/users/{id}` | `rbac:user:write` | 更新用户 |
| `PUT` | `/api/rbac/users/{id}/password` | `rbac:user:write` | 重置密码 |
| `DELETE` | `/api/rbac/users/{id}` | `rbac:user:write` | 删除用户 |
| `GET` | `/api/rbac/roles` | `rbac:view` | 角色列表（含权限） |
| `GET` | `/api/rbac/roles/permissions` | `rbac:view` | 权限清单 |
| `POST` | `/api/rbac/roles` | `rbac:role:write` | 创建角色 |
| `PUT` | `/api/rbac/roles/{id}` | `rbac:role:write` | 更新角色 |
| `DELETE` | `/api/rbac/roles/{id}` | `rbac:role:write` | 删除角色 |
| `GET` | `/api/rbac/org-units` | `rbac:view` | 组织节点列表（扁平，含子级数/用户数） |
| `POST` | `/api/rbac/org-units` | `rbac:org:write` | 创建组织节点 |
| `PUT` | `/api/rbac/org-units/{id}` | `rbac:org:write` | 更新组织节点 |
| `DELETE` | `/api/rbac/org-units/{id}` | `rbac:org:write` | 删除组织节点 |
| `GET` | `/api/audit-logs` | `audit:view` | 操作日志分页查询（可筛选） |
