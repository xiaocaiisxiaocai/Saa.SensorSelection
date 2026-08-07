# 感应器选型软件

Symtek Automation China 的客户、PCB 制程、机型结构与 Sensor 型号知识库。

前端已迁移到 [purest-admin](https://github.com/dymproject/purest-admin) 中的 Vue Vben Admin 5.5.1 基座，技术栈为 Vue 3、Vite、TypeScript、Pinia 和 Element Plus。迁移基线提交为 `c8c593ea252db481d72b2aae438c23cc1ee817e2`。

## 本地运行

要求 Node.js 20.10 以上和 pnpm 9.12 以上。

```powershell
pnpm install --frozen-lockfile
pnpm run dev
```

默认地址：`http://localhost:5777`

## 验证

```powershell
pnpm run test:selection
pnpm run check:type
pnpm run lint
pnpm run build
```

## 目录

```text
apps/web-ele/                         Vben Element Plus 应用
  src/modules/selection/              感应器选型业务模块
  src/router/routes/modules/          业务路由
internal/                             Vben 内部构建配置
packages/                             Vben 工作区基础包
scripts/vben-migration.contract-test.cjs
                                      迁移与领域行为回归
```

业务数据保存在浏览器 `localStorage` 的 `symtek_crud_store` 中，并兼容迁移前的数据格式。
