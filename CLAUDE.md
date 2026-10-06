# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是 Symtek Automation China 的感应器选型软件。前端在 `frontend/`，采用 Vue 3、Vite、TypeScript、Pinia 与自建 Apple 规范组件库（Reka UI 无样式底座，不使用 Element Plus / Tailwind）。后端是 ASP.NET Core 8 + EF Core + SQLite（`backend/Saa.SensorSelection.slnx`），提供 JWT 登录、RBAC、审计日志和选型数据仓库。

## 开发命令

项目只使用 pnpm，要求 Node.js 20.10 以上、pnpm 9.12 以上。后端需要 .NET 8 SDK。根目录的 `pnpm run <script>` 都是 `frontend/` 内同名脚本或仓库脚本的转发。

```powershell
cd frontend
pnpm install
pnpm dev                       # 前端开发服务器，默认 http://localhost:5178（strictPort，/api 代理到 5080）
cd ..
dotnet run --launch-profile http --project backend/Saa.SensorSelection.Api   # 后端 API，默认 http://localhost:5080，Swagger 仅 Development 下 /swagger

pnpm run test:selection        # 领域合同回归（scripts/selection-contract-test.cjs），修改持久化/路由/搜索前必须先扩展这里
pnpm run test:unit             # 等价于 pnpm run test，vitest run（frontend/src/**/*.test.ts，happy-dom，单 worker）
pnpm run check:type            # vue-tsc --noEmit
pnpm run lint                  # eslint src && stylelint "src/**/*.{css,vue}"
pnpm run build                 # vue-tsc --noEmit && vite build
pnpm run test:backend          # dotnet test backend/Saa.SensorSelection.slnx
pnpm run backup:db             # node backend/scripts/backup-db.mjs（KEEP / BACKUP_DIR 环境变量可调）
```

单独跑一个前端测试文件：`pnpm --dir frontend exec vitest run src/domain/repository.test.ts`。
单独跑一个后端测试：`dotnet test backend/Saa.SensorSelection.slnx --filter FullyQualifiedName~RbacTests`。

后端 5080 被占用时：`VITE_API_TARGET=http://localhost:5081 pnpm --dir frontend dev`。

`test:selection` 直接加载 `frontend/node_modules` 里的 Vite，并用 SSR 方式导入 `frontend/src/domain/index.ts`，所以需要先在 `frontend/` 装好依赖；被测的领域函数必须从 `domain/index.ts` 导出。它同时断言仓库结构（必须是 pnpm、不存在 `package-lock.json` / `public/index.html` / `app/page.tsx` 等旧入口）。

端到端回归需要前端（5178）与后端（5080）**都已启动**，运行结束会自动清理自己创建的数据；`test:ui` 首次运行前需要 `pnpm exec playwright install chromium`：

```powershell
pnpm run test:api    # scripts/e2e/api-crud-test.mjs：后端 API 全量增删改查 + 权限矩阵
pnpm run test:ui     # scripts/e2e/ui-e2e-test.mjs：浏览器端全量增删改查 + 字体/间距/热区/无障碍审计（--headed 可观察，失败截图在 scripts/e2e/artifacts/）
node scripts/e2e/file-upload-regression.mjs   # 未挂到 package.json；需设置 E2E_PDF_PATH、E2E_PPT_PATH、E2E_IMAGE_PATH 指向真实文件
```

EF Core 迁移（启动时 `DbInitializer → DbSeeder` 自动 `Migrate()`，只有改模型时才需手动生成）：

```powershell
cd backend
dotnet tool restore
dotnet tool run dotnet-ef migrations add YourChange --project Saa.SensorSelection.Api
```

开发登录默认账号 `admin` / `admin123`。IIS 合并发布用 `scripts/deploy-iis.ps1`（前后端打包进同一物理目录，默认 `deploy/iis`，不生成压缩包，pnpm 依赖强制 `--offline --frozen-lockfile`）。

## 架构

### 数据流（跨前后端）

- **后端是通用 `key → JSON 数组` 仓库，不做业务校验**；全部业务规则、归一化、迁移都在前端 `frontend/src/domain`。key 构造集中在 `domain/keys.ts`（如 `customer-req:客户名`、`machine-section-rows:{sectionId}:{机型}`），与浏览器 `symtek_crud_store` 快照里的 key 一一对应。
- 写入按 key 增量同步：`PUT/DELETE /api/store/by-key?key=...`。key 必须放查询参数（避免 IIS / 反代把 `%2F` 解码成路径分隔符），不要再加路径参数形式的单 key 接口。`PUT /api/store` 仅用于整体导入。
- 前端不再给后端灌数据：`stores/selection.ts` 创建 `BackendStorage` 时 `migrateOnEmpty: false`、不传 `local` / `seedDefaults`，后端为空就显示为空（种子/演示数据由后端 `DbSeeder` 负责）。`BackendStorage` 里的本地快照导入、`seedDefaults` 回填和 `seedMigration` 分支只剩合同测试在用。
- **种子版本**：`seed.ts` 的 `SEED_VERSION` 写入 store 的 `meta:seed-version`；`seed-migration.ts` 的 `migrateSelectionSeedStore` 按 `currentVersion < XXX_VERSION` 逐步迁移，目前只在仓库 `demoData`（Vitest 夹具）模式下执行。修改内置种子数据要同时递增 `SEED_VERSION`，并在 `seed-migration.ts` 加一个按版本门控的步骤（配套 `seed-migration.test.ts`）。
- **文件**：前端经 `api.uploadFile` 以 multipart 方式 `POST /api/files`（需 `selection:write`）。正文以 BLOB 存在 SQLite `StoredFiles.Content`，store JSON 里只保留 `/api/files/{id}/content` 引用。`StoreService` / `StoredFileService` 在写入时拆出内嵌的 data URL，并释放不再被引用的文件。
- 鉴权错误：后端 401 表示登录失效，403 表示已登录但无权限（`{"message":"无权限执行此操作"}`）；`api/index.ts` 把它们抛成 `ApiError` 的 `unauthorized` / `forbidden` 两种 kind。`BackendStorage` 遇到任何写入失败都会回滚该 key，并把 401/403 都映射为 `unauthorized` 同步状态；`AppShell` 在持有 token 时据此跳转 `/login`。

### 前端（`frontend/src`）

- `api/index.ts`：后端薄客户端，所有 HTTP 调用的唯一出入口（`VITE_API_BASE` 默认 `/api`）。
- `domain/`：领域层，纯 TypeScript、无 UI 依赖，是业务规则的权威来源；规格见 `frontend/docs/07-domain-spec.md`（不变量）与 `04-data-api.md`（存储键与接口契约）。
  - `repository.ts`：全部业务校验、归一化、CRUD、旧数据迁移、搜索索引（体量最大，约 2800 行，改动前先读）。
  - `storage.ts`（`BackendStorage`）：在线时把 SQLite 数据仓库当唯一真相源，写入走串行队列；浏览器不缓存业务数据，后端不可达时页面显示离线横幅并自动退避重连（重连期间页面保持挂载，重建前先排空旧队列）。写入失败时 bridge 回滚该 key，并通过 `onWriteFailure` 让 store 按回滚后的缓存重建仓库内存态；4xx 只回滚不掉线，网络错误/5xx 进入 offline，401/403 进入 unauthorized（重新登录后 `ensureBackendInit` 会重建 bridge）。仓库的读取 getter 不能调用 `persist`（访客/只读用户也会走到）；多步写入用 `transaction` 合成一次提交。
  - `normalize.ts` / `seed.ts` / `seed-migration.ts`：存储内容归一化与内置种子数据、旧数据迁移语义。
  - `search.ts`：跨客户/制程/机型/Sensor 型号的全局搜索索引。
  - `schematic-report.ts`：机型示意图报告生成（后端 `POST /api/reports/machine-schematic` 对应 `MachineSchematicReportService`）。
- `stores/`（Pinia）：`selection.ts` 包裹领域仓库供页面消费，负责创建 `BackendStorage` 和断线重连；`auth.ts` 持有 JWT 与当前用户权限（token 键 `symtek_token`），并提供 `useAccess()`。
- `router/guards.ts`：路由级权限守卫，按页面所需权限码放行/拦截。生产构建用 hash 路由（`.env.production` 中 `VITE_ROUTER_HISTORY=hash`）。
- `pages/selection`：客户、制程、机型、Sensor 型号、字典、全局搜索业务页（`/selection/customer|process|machine|sensor|dictionary|search`）；`pages/shared` 放跨页复用逻辑（如文件上传）。
- `pages/system`：用户、角色、组织、操作日志系统管理页（`/system/user|role|org|audit-log`，各自对应下方权限码）。
- `ui/`：自建 Apple 规范组件库（`A*` 前缀组件），无业务逻辑，Reka UI 作无样式底座；设计规范见 `frontend/docs/01-design-system.md`、`02-component-library.md`。
- `styles/tokens.css`：唯一允许写字面量颜色/字号/时长的地方；`theme/` 管浅色/深色/跟随系统（本地键 `apple-frontend:theme`）。
- `shell/AppShell.vue`：整体布局（52px 工具栏 + 侧栏 + 内容区，无多标签页，⌘K / Ctrl+K 聚焦全局搜索）。

### 后端（`backend/Saa.SensorSelection.Api`）

- `Controllers/`：`AuthController`（登录/JWT）、`StoreController`（选型数据仓库读写）、`UsersController` / `RolesController` / `OrgUnitsController`（RBAC）、`AuditLogsController`、`FilesController`、`ReportsController`、`HealthController`。
- `Services/`：`JwtService`、`PasswordService`、`LoginRateLimiter`、`RoleService` / `OrgUnitService` / `UserService`（RBAC 判定见 `RbacResult.cs`，组织层级规则见 `OrgLevelRules.cs`）、`AuditLogService`、`StoreService`、`StoredFileService`、`MachineSchematicReportService`。
- `Models/RbacDefaults.cs`：权限码与内置角色的唯一定义源，新增权限/角色在此补充，`DbSeeder` 重启后幂等补齐。当前权限码：`selection:read`、`selection:write`、`rbac:view`、`rbac:user:write`、`rbac:role:write`、`rbac:org:write`、`audit:view`。内置角色：`admin`（全部权限，系统角色不可改删）、`editor`（读写业务数据）、`viewer`（只读业务数据）。
- `Configuration/ProductionConfigurationGuard.cs`：`Production` 环境下，若仍用默认 `Jwt:Key` / 默认管理员密码，或未配置 `Cors:AllowedOrigins`，直接拒绝启动。
- `Data/`：`AppDbContext`、`DbInitializer` / `DbSeeder`（种子与迁移）、SQLite pragma 拦截器（WAL + `busy_timeout=30000`）。数据库默认 `App_Data/symtek.db`（历史文件名，不要改）。
- 集成测试在独立项目 `backend/Saa.SensorSelection.Api.Tests`（`ApiFactory.cs` 通过 `WebApplicationFactory` 启动含迁移与种子的完整应用，每个测试使用独立的临时 SQLite 文件）。

## 数据兼容

业务数据主键仍为 `symtek_crud_store`。以 SQLite 数据仓库为唯一数据源，浏览器不再缓存业务数据快照。存储内容必须经过归一化，禁止直接把存储内容拼接成 HTML。写入失败必须回滚内存修改并向用户反馈。

## 关键约定

- 不恢复 Next.js、iframe、`public/index.html` 旧入口，也不恢复 Vben / Element Plus 前端。
- 新业务代码放在 `frontend/src/pages`、`frontend/src/domain` 或 `frontend/src/ui` 内。
- 未登录允许只读预览业务数据；写入需要 JWT 与 `selection:write`。页面用 `useAccess().canWrite()` **隐藏**写入入口，而不是禁用。
- 操作按钮使用 Lucide 图标和 tooltip；表单、表格、弹窗使用自建 `A*` 组件。表格分页档位 20 / 50 / 100。
- stylelint 禁止在 `tokens.css` 以外硬编码颜色、`font-size`、过渡/动画时长，一律用 `var(--*)`；class 选择器必须是 kebab-case（允许 BEM 的 `__` / `--`）。
- 修改持久化、路由或搜索行为时，先扩展 `test:selection` 回归，再实现变更。
- 后端接口、权限码、数据库结构变更需要同步更新 `RbacDefaults.cs` 与对应的 `Api.Tests`，不要绕开 `DbSeeder` 手改数据。
