# 感应器选型软件

Symtek Automation China 的客户、PCB 制程、机型结构与 Sensor 型号知识库。

前端是自建 Apple 设计规范组件库 + Vue 3 单一应用（`frontend/`）。后端是 ASP.NET Core 8 + EF Core + SQLite，提供 JWT 登录、RBAC、审计日志和选型数据仓库。

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

端到端回归需要前端（`5178`）与后端（`5080`）都已启动，会在运行结束时清理自己创建的全部数据：

```powershell
pnpm run test:api   # 后端 API 全量增删改查 + 权限矩阵
pnpm run test:ui    # 浏览器端全量增删改查 + 字体/间距/点击热区/无障碍审计
```

`test:ui` 依赖 Playwright 的 Chromium：首次运行前执行 `pnpm exec playwright install chromium`。加 `--headed` 可观察浏览器操作，失败截图落在 `scripts/e2e/artifacts/`。

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
scripts/deploy-iis.ps1                IIS 静态站点打包
scripts/selection-contract-test.cjs   领域合同回归
```

业务数据在线以 SQLite 为准，并快照到浏览器 `localStorage` 键 `symtek_crud_store`。
