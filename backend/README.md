# Saa.SensorSelection.Api — 感应器选型后端

ASP.NET Core 8 + EF Core + SQLite + JWT 的轻量后端，为前端 `frontend/` 提供数据仓库持久化与登录鉴权。业务规则由前端 `frontend/src/domain` 负责；后端在 `key → JSON 数组` 边界执行目录契约、CAS 前置条件、原子批次和文件引用完整性校验。

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
- 前端开发代理：`frontend/vite.config.ts` 把 `/api` 转发到 `http://localhost:5080`（端口被占用时可用 `VITE_API_TARGET=http://localhost:5081 pnpm --dir frontend dev` 覆盖）
- 首次初始化自动完成：创建 SQLite 数据目录 → 应用 EF Migrations → 写入权限目录、内置角色、默认组织和种子 admin。后续启动只补权限目录及系统管理员角色需要的新权限，不复活已删除账号，也不恢复管理员主动撤销的普通角色权限。

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
| `Kestrel:Limits:MaxRequestBodySize` | `104857600` (100MB) | 首次上传仍以 data URL 到达 API，放宽默认 30MB；落库前会立即剥离正文 |
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

启动时由 `DbInitializer → DbSeeder` 自动调用 `Database.Migrate()` 应用待迁移，日常运行无需手动操作。开发时用 dotnet-ef 本地工具（清单在 `backend/dotnet-tools.json`）：

```bash
cd backend
dotnet tool restore

# 修改模型后新增迁移
dotnet tool run dotnet-ef migrations add YourChange --project Saa.SensorSelection.Api

# 查看待应用/已应用迁移
dotnet tool run dotnet-ef migrations list --project Saa.SensorSelection.Api

# 回滚最近一次（仅删除生成文件，不改数据库）
dotnet tool run dotnet-ef migrations remove --project Saa.SensorSelection.Api

# 生成 SQL 脚本（交付评审/手工执行）
dotnet tool run dotnet-ef migrations script --project Saa.SensorSelection.Api
```

> 旧版本用 `EnsureCreated` 建库且没有 `__EFMigrationsHistory` 时，不得删除业务库重建，也不得手工伪造迁移历史。先生成一致备份，在隔离的离线副本上执行专用转换并完成完整性、业务数据与恢复演练；确认转换脚本和回退路径后，再单独审批生产部署。本轮安全修复没有新增数据库 schema 迁移，也没有执行真实部署。

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

IIS 合并制品使用仓库根目录的 `scripts/deploy-iis.ps1`。脚本先在同盘暂存目录完成构建和内容检查，成功后才替换带本项目所有权标记的旧制品。它会拒绝源码目录、磁盘根、未知既有目录，以及任何包含 `App_Data` 的目录。不要把正在使用的 IIS 站点目录作为 `-OutputDir`；更新站点时应先备份数据库，保留站点原有 `App_Data`，再复制新制品。

部署形态二选一：
- **内网直连 Kestrel**：`--urls http://0.0.0.0:5080`，前端把 `VITE_API_BASE` 指向该地址；
- **反向代理**：IIS / nginx / systemd 代理到 Kestrel，适合统一 443/域名入口。

## 数据备份

数据集中在单个 SQLite 文件（`App_Data/symtek.db`），建议定期备份：

```bash
pnpm run backup:db              # 默认保留最近 10 份到 backups/
KEEP=30 pnpm run backup:db      # 保留 30 份
BACKUP_DIR=/data/saa-sensor-selection-backups pnpm run backup:db
DB_PATH=/data/saa-sensor-selection/symtek.db pnpm run backup:db
```

脚本要求 Node.js 22.13+ 的 `node:sqlite`，只使用 SQLite `VACUUM INTO` 生成一致快照，并在轮替旧备份前执行 `PRAGMA integrity_check`。不支持 `node:sqlite` 时会直接失败，不会退回到分别复制主库和 WAL。数据库路径优先取 `DB_PATH`，其次解析 `ConnectionStrings__Default` 的 `Data Source`，均未设置时使用项目默认库；相对连接串路径以 API 内容根解析。

## SQLite 并发说明

启动时自动启用 `WAL` 日志模式（持久），每个连接打开时设置 `busy_timeout=30000`——多客户端同时写入时等待锁而不是直接报 "database is locked"。

## RBAC 权限模型

### 权限码（进入 JWT claims，后端 `RequireClaim("perm", ...)` 策略强制校验）

| 权限码 | 说明 | 归属 |
| --- | --- | --- |
| `selection:read` | 查看业务数据（客户/制程/机型/Sensor/字典/搜索） | 业务 |
| `selection:write` | 编辑业务数据（增删改） | 业务 |
| `file:download` | 下载文件 | 业务 |
| `data:transfer` | 导入导出数据（Sensor 型号与数据字典的 Excel；导入还要有 `selection:write`） | 业务 |
| `rbac:view` | 进入系统管理（用户/角色/组织页面） | 系统 |
| `rbac:user:write` | 管理用户（增删改/重置密码） | 系统 |
| `rbac:role:write` | 管理角色 | 系统 |
| `rbac:org:write` | 管理组织架构 | 系统 |
| `audit:view` | 查看操作日志 | 系统 |

### 内置角色（仅首次身份初始化）

| 角色 | 权限 | 说明 |
| --- | --- | --- |
| `admin` 系统管理员 | 全部 | **内置系统角色**：不可修改权限、不可删除（防呆：不能删除自己、至少保留一名系统管理员） |
| `editor` 业务维护员 | `selection:read` + `selection:write` | 可读写业务数据，无系统管理权限 |
| `viewer` 只读用户 | `selection:read` | 仅可查看 |

全新开发库默认账号为 `admin / admin123`（`Seed` 节可改），首次初始化时获得系统管理员角色；生产制品默认生成随机初始密码。初始化完成后，服务重启不会恢复已删除种子账号或管理员主动撤销的普通角色权限。

### 组织架构

- `OrgUnit` 自引用树（`ParentId`），层级必须逐级 **事业部 > 部门 > 课别**，不能跳级，由位置决定：顶层是事业部，事业部下是部门，部门下是课别（请求里的 `level` 可省略，由后端算出；传了就必须一致）。课别是最末一级，下面不能再挂任何组织；有下级的组织不能改变层级（例如挪到别的层）。上级没有标准层级的历史数据，要先编辑上级补上层级。
- 用户通过「所属组织」挂到某个节点（可空）；登录响应与 `/api/auth/me` 会返回组织路径（如 `制造事业部 / 装配部 / 选型课`）。
- 删除保护：有子级或已挂用户的节点不可删除；父级不能是自身或其后代（防环）。

### 鉴权流程

1. 登录（`POST /api/auth/login`）→ 返回 JWT + 角色 + 权限码 + 组织；JWT 以不可复用的用户 ID 为主体，并携带 HMAC 会话指纹、`role`/`perm`/`org` 声明。指纹绑定用户 ID、密码哈希和当前角色/权限，但 JWT 不暴露密码哈希。
2. 前端启动/首次导航 → `GET /api/auth/me` 拉取资料 → 权限码写入前端 access store，路由与菜单按 `meta.authority`（权限码）过滤，业务页面写操作按钮按 `selection:write` 显示/隐藏。
3. 后端所有写接口带 `selection:write` 策略、RBAC 管理接口带 `rbac:*` 策略；**已登录但无权限返回 403 + `{"message":"无权限执行此操作"}`**（与 401 登录失效区分，前端不会误跳转登录页）。
4. 改密、停用、删除、降权或角色权限变化会使旧 token 的指纹立即失效；同名账号重建也不能复用旧身份。前端收到 401 清理会话并重新登录，403 只表示当前身份无权限，不作为登录失效处理。

### 匿名只读预览与登录页

- **业务数据读接口对匿名开放**（`GET /api/store` 等不带 token 也可读），未登录用户可以**只读预览**客户管理、制程管理、机型结构、Sensor型号——前端隐藏所有写操作按钮，后端写接口仍要求 `selection:write`（匿名写返回 401）。PDF 和图片正文允许匿名内联预览；Word、PPT 等其他附件的 `/content` 与 `/download` 都要求 `file:download`，并记录下载审计。
- 前端提供独立登录页 `/login`：token 失效或匿名用户点右上角「登录」时进入；可账号密码登录，或选「游客浏览（只读）」。主动退出会清除会话并返回客户只读页。
- 系统管理（用户/角色/组织/操作日志）仅登录后按权限码显示，游客不可见、直接访问 URL 404、调接口 403。

## 操作日志（审计）

后端自动记录关键操作到 `AuditLogs` 表（成功与失败都记），管理员在「系统管理 → 操作日志」页面查看（需 `audit:view` 权限，内置 admin 角色自动拥有）。

记录范围：

- 登录成功/失败/停用/限流（`auth.login`，失败带原因）
- 业务数据写入/删除/整体导入（`store.upsert` / `store.delete` / `store.replace-all`，含 key 与条目数）
- 用户/角色/组织管理（`user.*` / `role.*` / `org.*`）

每条记录包含：时间、操作人、操作码、目标、详情、结果、失败原因、客户端 IP，以及变更明细（`Changes`：数据写入按记录比较前后，新增 / 删除 / 修改了哪些记录、哪些字段从什么改成什么；用户 / 角色 / 组织记改前改后的字段快照，见 `Services/AuditChanges.cs`）和操作编号 / 名称（`OperationId` / `OperationLabel`：前端用 `X-Operation-Id` / `X-Operation-Label` 请求头传入，同一次界面操作的多条日志归成一组）。审计写入失败只记服务端日志、**不影响主业务请求**；超过 `Audit:MaxEntries`（默认 5 万条）自动清理最旧记录。**敏感字段（密码等）绝不会写入日志**。

查询接口：`GET /api/audit-logs?page=&pageSize=&action=&username=&target=&result=&from=&to=`（逐条分页 + 多条件筛选，时间倒序）；`GET /api/audit-logs/operations?page=&pageSize=&keyword=&action=&result=&from=&to=&hideLogin=`（按操作分页，日志页使用）。

## 数据存储结构

存储结构 `key → JSON 数组`，key 形如 `customer-req:客户/厂区`、`sensor-catalog:all`、`dict:xxx`。PDF、图片等文件正文独立保存在 SQLite 的 `StoredFiles.Content` BLOB 中，Store JSON 只保留 `/api/files/{id}/content` 引用。SQLite 是在线业务数据的唯一来源；浏览器不保存业务快照，空库也不会由前端自动导入本地数据或前端种子。

`GET /api/store` 和单 key GET 返回强 ETag。旧 `PUT/DELETE` 写接口必须携带上次读取的 `If-Match`：缺失返回 428，陈旧返回 412。一次领域操作涉及多个 key 时，前端提交 `POST /api/store/batch`，每个 change 都携带显式 `expected`；服务端在一个 SQLite 事务中完成比较、校验、文件引用处理和全部写删，任一冲突返回 409 且整批不写入。页面等待服务端确认后才显示保存成功。

## API 一览

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | 匿名 | 账号密码登录，返回 JWT + 角色/权限/组织 |
| `GET` | `/api/auth/me` | Bearer | 当前用户资料（角色/权限/组织） |
| `GET` | `/api/health` | 匿名 | 健康检查（含数据库连通性，DB 不可用返回 503） |
| `GET` | `/api/store` | 匿名 | 全部 key → JSON 数组并返回全库 ETag |
| `GET` | `/api/store/by-key?key={key}` | 匿名 | 单个 key 并返回该 key 的 ETag；不存在也返回 missing ETag |
| `POST` | `/api/store/batch` | `selection:write` | `{ changes: [{ key, expected, value }] }` 原子 CAS；`value:null` 删除 |
| `PUT` | `/api/store` | `selection:write` | 整体替换；必须带全库 `If-Match` |
| `PUT` | `/api/store/by-key?key={key}` | `selection:write` | 单 key 兼容接口；必须带 `If-Match` |
| `PUT` | `/api/store/entity-groups/{kind}` | `selection:write` | 目录专用校验；必须带 `If-Match` |
| `DELETE` | `/api/store/by-key?key={key}` | `selection:write` | 单 key 删除；必须带 `If-Match`，目录不能由此删除 |
| `GET` | `/api/files/{id}/content` | PDF/图片匿名预览；其他类型需 `file:download` | 按需读取正文，支持 Range；受保护附件不公开缓存 |
| `GET` | `/api/files/{id}/download` | `file:download` | 附件下载并记录审计 |
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
| `GET` | `/api/audit-logs/operations` | `audit:view` | 按操作分页查询（同一次操作的多条日志归组） |
