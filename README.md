# 感应器选型软件

Symtek Automation China 的客户、PCB 制程、机型结构与 Sensor 型号知识库。

前端是 Vue 3 + ant-design-vue 4 单一应用（`frontend/`，界面完全使用 antd 默认主题与组件）。后端是 ASP.NET Core 8 + EF Core + SQLite，提供 JWT 登录、RBAC、审计日志和选型数据仓库。

## 本地运行

要求 Node.js 20.10 以上、pnpm 9.12 以上，以及 .NET 8 SDK。

```powershell
cd frontend
pnpm install
pnpm dev
```

默认地址：`http://localhost:5178`（`/api` 代理到后端 `http://localhost:5080`）。

```powershell
dotnet run --launch-profile http --project backend/Saa.SensorSelection.Api
```

开发登录默认账号 `admin` / `admin123`。未登录可只读预览业务数据；写入需要 JWT 与 `selection:write`。

仓库根也提供同样的快捷命令：`pnpm dev`、`pnpm run build`、`pnpm run test`。

## 验证

```powershell
pnpm run test:selection
pnpm run test:unit
pnpm run check:type
pnpm run lint
pnpm run build
pnpm run test:backend
```

端到端回归只允许连接独立、可丢弃的测试服务和测试数据库。脚本不再提供 localhost 默认值，必须显式设置地址：

```powershell
$env:API_BASE = 'http://127.0.0.1:5081/api'
pnpm run test:api

$env:E2E_BASE_URL = 'http://127.0.0.1:5179'
$env:API_BASE = 'http://127.0.0.1:5081/api'
pnpm run test:ui
```

`test:ui` 会写入并清理测试数据，不能指向日常开发库或生产环境。Windows 浏览器测试遵守全局 CORE-19：本机已知 Edge／Playwright Chromium 版本曾触发 SAC 认证锁定，未经隔离验证修复或规避方案，不得以 SAC 新启动这些版本；复用获授权会话，出现新的 4625／4740 立即停止。失败截图落在 `scripts/e2e/artifacts/`。

## 目录

```text
frontend/                             前端（Vue 3 + 自建组件库）
  src/api/                            后端薄客户端
  src/domain/                         选型领域层（TypeScript）
  src/pages/                          业务页、登录、系统管理
  src/ui/                             组件库
backend/                              后端（ASP.NET Core + SQLite）
  Saa.SensorSelection.Api/            Web API
  Saa.SensorSelection.Api.Tests/      集成测试
  scripts/backup-db.mjs               数据库备份
scripts/deploy-iis.ps1                IIS 前后端安全暂存、校验并生成无数据库发布制品
scripts/selection-contract-test.cjs   领域合同回归
```

业务数据在线以 SQLite 为唯一数据源，浏览器不缓存业务数据，也不会在空库时自动回灌本地数据或前端种子。Store 写入使用服务端 CAS：读取取得 ETag，旧单键写必须携带 `If-Match`，跨 key 修改通过原子 `POST /api/store/batch` 提交；界面只在服务端实际确认成功后提示保存完成。
