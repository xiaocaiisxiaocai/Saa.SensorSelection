# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是 Symtek Automation China 的感应器选型软件。前端在 `frontend/`，采用 Vue 3、Vite、TypeScript、Pinia 与自建 Apple 规范组件库（Reka UI 无样式底座，不使用 Element Plus / Tailwind）。后端是 ASP.NET Core 8 + EF Core + SQLite（`backend/Saa.SensorSelection.slnx`），提供 JWT 登录、RBAC、审计日志和选型数据仓库。

## 开发命令

项目只使用 pnpm，要求 Node.js 20.10 以上、pnpm 9.12 以上。后端需要 .NET 8 SDK。根目录的 `pnpm run <script>` 都是 `frontend/` 内同名脚本或仓库脚本的转发。

```powershell
cd frontend
pnpm install
pnpm dev                       # 前端开发服务器，默认 http://localhost:5178
cd ..
dotnet run --launch-profile http --project backend/Saa.SensorSelection.Api   # 后端 API，默认 http://localhost:5080

pnpm run test:selection        # 领域合同回归（scripts/selection-contract-test.cjs），修改持久化/路由/搜索前必须先扩展这里
pnpm run test:unit             # 等价于 pnpm run test，vitest run（frontend/src/**/*.test.ts）
pnpm run check:type            # vue-tsc --noEmit
pnpm run lint                  # eslint src && stylelint "src/**/*.{css,vue}"
pnpm run build                 # vue-tsc --noEmit && vite build
pnpm run test:backend          # dotnet test backend/Saa.SensorSelection.slnx
pnpm run backup:db             # node backend/scripts/backup-db.mjs
```

单独跑一个前端测试文件：`pnpm --dir frontend exec vitest run src/domain/repository.test.ts`。
单独跑一个后端测试：`dotnet test backend/Saa.SensorSelection.slnx --filter FullyQualifiedName~RbacTests`。

端到端回归需要前端（5178）与后端（5080）**都已启动**，运行结束会自动清理自己创建的数据；`test:ui` 首次运行前需要 `pnpm exec playwright install chromium`：

```powershell
pnpm run test:api    # scripts/e2e/api-crud-test.mjs：后端 API 全量增删改查 + 权限矩阵
pnpm run test:ui     # scripts/e2e/ui-e2e-test.mjs：浏览器端全量增删改查 + 字体/间距/热区/无障碍审计（--headed 可观察，失败截图在 scripts/e2e/artifacts/）
```

开发登录默认账号 `admin` / `admin123`。IIS 合并发布用 `scripts/deploy-iis.ps1`（前后端打包进同一物理目录，不生成压缩包，pnpm 依赖强制 `--offline --frozen-lockfile`）。

## 架构

### 前端（`frontend/src`）

- `api/index.ts`：后端薄客户端，所有 HTTP 调用的唯一出入口。
- `domain/`：领域层，纯 TypeScript、无 UI 依赖，是业务规则的权威来源。
  - `repository.ts`：全部业务校验、归一化、CRUD、旧数据迁移、搜索索引（体量最大，改动前先读）。
  - `storage.ts`（`BackendStorage`）：在线时把 SQLite 数据仓库当唯一真相源，写入走串行队列；把完整 store 快照到本地 `StorageLike`（浏览器 `localStorage`，主键 `symtek_crud_store`）供后端不可达时降级读取；写入失败必须回滚内存态并上抛，不能静默吞掉。
  - `normalize.ts` / `seed.ts` / `seed-migration.ts`：存储内容归一化与内置种子数据、旧数据迁移语义。
  - `search.ts`：跨客户/制程/机型/Sensor 型号的全局搜索索引。
  - `schematic-report.ts`：机型示意图报告生成。
- `stores/`（Pinia）：`selection.ts` 包裹领域仓库供页面消费，`auth.ts` 持有 JWT 与当前用户权限（token 键 `symtek_token`）。
- `router/guards.ts`：路由级权限守卫，按页面所需权限码放行/拦截。
- `pages/selection`：客户、制程、机型、Sensor 型号字典、全局搜索业务页。
- `pages/system`：用户、角色、组织、操作日志系统管理页（各自对应下方权限码）。
- `ui/`：自建 Apple 规范组件库（`A*` 前缀组件），无业务逻辑，Reka UI 作无样式底座；设计规范见 `frontend/docs/01-design-system.md`、`02-component-library.md`。
- `shell/AppShell.vue`：整体布局（侧栏 + 工具栏 + 内容区）。

### 后端（`backend/Saa.SensorSelection.Api`）

- `Controllers/`：`AuthController`（登录/JWT）、`StoreController`（选型数据仓库读写）、`UsersController` / `RolesController` / `OrgUnitsController`（RBAC）、`AuditLogsController`、`FilesController`、`ReportsController`。
- `Services/`：`JwtService`、`PasswordService`、`LoginRateLimiter`、`RoleService` / `OrgUnitService` / `UserService`（RBAC 判定见 `RbacResult.cs`）、`AuditLogService`、`StoreService`、`MachineSchematicReportService`。
- `Models/RbacDefaults.cs`：权限码与内置角色的唯一定义源，新增权限/角色在此补充，`DbSeeder` 重启后幂等补齐。当前权限码：`selection:read`、`selection:write`、`rbac:view`、`rbac:user:write`、`rbac:role:write`、`rbac:org:write`、`audit:view`。内置角色：`admin`（全部权限，系统角色不可改删）、`editor`（读写业务数据）、`viewer`（只读业务数据）。
- `Data/`：`AppDbContext`、`DbInitializer` / `DbSeeder`（种子与迁移）、SQLite pragma 拦截器。
- 集成测试在独立项目 `backend/Saa.SensorSelection.Api.Tests`（`ApiFactory.cs` 起 in-memory host）。

## 数据兼容

业务数据主键仍为 `symtek_crud_store`。在线时以 SQLite 数据仓库为准，并把完整 store 快照到本地，供后端不可达时继续使用。存储内容必须经过归一化，禁止直接把存储内容拼接成 HTML。写入失败必须回滚内存修改并向用户反馈。

## 关键约定

- 不恢复 Next.js、iframe、`public/index.html` 旧入口，也不恢复 Vben / Element Plus 前端。
- 新业务代码放在 `frontend/src/pages`、`frontend/src/domain` 或 `frontend/src/ui` 内。
- 未登录允许只读预览业务数据；写入需要 JWT 与 `selection:write`。
- 操作按钮使用 Lucide 图标和 tooltip；表单、表格、弹窗使用自建 `A*` 组件。
- 修改持久化、路由或搜索行为时，先扩展 `test:selection` 回归，再实现变更。
- 后端接口、权限码、数据库结构变更需要同步更新 `RbacDefaults.cs` 与对应的 `Api.Tests`，不要绕开 `DbSeeder` 手改数据。
