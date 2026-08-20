# CLAUDE.md

## 项目概述

这是 Symtek Automation China 的感应器选型软件。前端基于 `purest-admin` 仓库中的 Vue Vben Admin 5.5.1 基座，采用 Vue 3、Vite、TypeScript、Pinia 与 Element Plus。后端是 ASP.NET Core 8 + EF Core + SQLite，提供 JWT 登录、RBAC、审计日志和选型数据仓库。

目标基座来源：`https://github.com/dymproject/purest-admin`，迁移时参考提交 `c8c593ea252db481d72b2aae438c23cc1ee817e2` 下的 `client-vue/vben-admin`。

## 开发命令

项目只使用 pnpm，要求 Node.js 20.10 以上、pnpm 9.12 以上。后端需要 .NET 8 SDK。

```powershell
pnpm install --frozen-lockfile
pnpm run dev
dotnet run --launch-profile http --project backend/Saa.SensorSelection.Api
pnpm run test:selection
pnpm run test:unit
pnpm run test:backend
pnpm run check:type
pnpm run lint
pnpm run build
```

主应用默认开发端口为 `5777`，后端 API 为 `http://localhost:5080`（Vite 把 `/api` 代理到该地址）。开发登录默认账号 `admin` / `admin123`。

## 架构

- Vben monorepo 基础包：`internal/`、`packages/`、`scripts/`
- 应用入口：`apps/web-ele`
- 业务模块：`apps/web-ele/src/modules/selection`
- RBAC 模块：`apps/web-ele/src/modules/rbac`
- 业务路由：`apps/web-ele/src/router/routes/modules/selection.ts`
- 领域仓库：`apps/web-ele/src/modules/selection/domain.js`
- 后端桥接：`apps/web-ele/src/modules/selection/backend-storage.js`
- Pinia 适配层：`apps/web-ele/src/modules/selection/store.ts`
- 后端 API：`backend/Saa.SensorSelection.Api`
- 领域合同测试：`scripts/vben-migration.contract-test.cjs`

## 业务模块

- 客户管理：客户要求、制程注意、受控文档和厂外反馈
- 制程管理：制程报告、制程特性和感应器选用标准
- 机型结构：输送机构、手臂机构、台车工位和注意事项
- Sensor 型号字典：状态筛选、搜索和型号增删改
- 全局搜索：跨客户、制程、机型和 Sensor 型号
- 系统管理：用户、角色、组织、操作日志（需对应权限码）

## 数据兼容

业务数据主键仍为 `symtek_crud_store`。在线时以 SQLite 数据仓库为准，并把完整 store 快照到本地，供后端不可达时继续使用。存储内容必须经过归一化，禁止直接把存储内容拼接成 HTML。写入失败必须回滚内存修改并向用户反馈。

## 关键约定

- 不恢复 Next.js、iframe 或 `public/index.html` 旧入口。
- 新业务代码放在 `modules/selection` 或 `modules/rbac` 内，不修改 Vben 核心包来实现业务功能。
- 未登录允许只读预览业务数据；写入需要 JWT 与 `selection:write`。路由使用 Vben frontend 权限模式。
- 操作按钮使用 Lucide 图标和 tooltip；表单、表格、弹窗使用 Element Plus。
- 修改持久化、路由或搜索行为时，先扩展 `test:selection` 回归，再实现变更。
