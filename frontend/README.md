# frontend

感应器选型软件前端：**自建 Apple 设计规范组件库 + Vue 3 单一应用**。

开发端口 **5178**。生产构建使用 hash 路由（`.env.production` 中 `VITE_ROUTER_HISTORY=hash`）。

## 命令

```powershell
cd frontend
pnpm install
pnpm dev              # http://localhost:5178 ，/api 代理到 http://localhost:5080
pnpm run lint         # eslint + stylelint（禁止硬编码色值 / 字号 / 时长）
pnpm run check:type
pnpm run test
pnpm run build
```

登录：`admin` / `admin123`。未登录可只读预览业务数据；写入需要 JWT 与 `selection:write`。

后端：

```powershell
dotnet run --launch-profile http --project backend/Saa.SensorSelection.Api
```

IIS 打包（从仓库根，产物来自 `frontend/dist`）：

```powershell
.\scripts\deploy-iis.ps1
.\scripts\deploy-iis.ps1 -SkipInstall -Zip
```

## 目录

```
frontend/
  docs/                 设计与实施文档
  public/               静态资源（logo、favicon）
  src/
    api/                后端薄客户端
    domain/             选型领域层（TypeScript）
    pages/              业务页、登录、系统管理
    router/             路由与守卫
    shell/              工具栏、侧栏、用户菜单
    stores/             auth / selection / theme
    styles/             令牌、reset、全局、无障碍
    theme/              浅色 / 深色 / 跟随系统
    ui/                 组件库
  index.html
  package.json
```

关键路由：`/selection/customer|process|machine|sensor|dictionary|search`，`/system/user|role|org|audit-log`。

## 布局与质量约定

- 工具栏 52px + 导航侧栏；**无多标签页**。⌘K / Ctrl+K 聚焦全局搜索。
- 写权限用 `useAccess().canWrite()`：**隐藏**写入入口，不禁用。
- 业务数据主键仍为 `symtek_crud_store`；token 为 `symtek_token`。
- 表格分页 20 / 50 / 100，避免大表一次性铺开。
- 窄屏（约 960px / 60rem）下降级为单列；侧栏与机型示意图改为上下堆叠。
- 颜色 / 字号 / 时长只允许 `var(--*)`。深色模式走 `apple-frontend:theme`（兼容已有本地设置）。
