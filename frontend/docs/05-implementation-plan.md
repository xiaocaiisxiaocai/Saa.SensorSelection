# 05 · 实施计划

原则：**每个阶段结束时都能跑起来、能看、能验收。** 旧前端在整个过程中保持可用。按已确认决策：领域层 TypeScript 从零重写；**全部做完再一次性切换**（`06-open-decisions.md` 决策 4、8）。

**开工闸门：等你通知后才写代码。** 开工第一件事是写满 `07-domain-spec.md`。

---

## Phase 0 · 地基（1 个阶段）

搭出能跑的空壳，把设计规范固化成代码。

- [x] `apple-frontend/package.json`（独立，无 `workspace:*`）、`tsconfig.json`、`vite.config.ts`（含 `/api` 代理、`@` 别名、`VITE_*` 环境变量）
- [x] 自托管 Inter + Noto Sans SC 子集（决策 1）
- [x] 安装 Radix Vue / Reka UI（决策 3，本阶段只进依赖，不写业务组件）
- [x] `src/styles/tokens.css` —— 把 `01-design-system.md` 的全部令牌落成变量（浅色 + 深色）
- [x] `src/styles/reset.css`、`global.css`
- [x] `App.vue` + 路由骨架 + `AppShell` 布局（工具栏 + 导航侧栏，材质与模糊；**无多标签页**）
- [x] 主题切换（浅色 / 深色 / 跟随系统，存 `apple-frontend:theme`）
- [x] `/dev/gallery` 组件示例页路由（仅开发环境）
- [x] stylelint 规则：禁止组件内硬编码颜色 / 字号 / 时长（只允许 `var(--*)`）
- [x] eslint + prettier + vitest 配置
- [x] **字体样张**：Windows 下验收 Inter + Noto Sans SC 覆盖（数字、拉丁、常用汉字）

**验收**：`pnpm dev` 起得来，能看到空壳 + 侧栏 + 深浅色切换；`/dev/gallery` 可访问。

---

## Phase 1 · 组件库（2–3 个阶段）

按 `02-component-library.md` 第 3 节的依赖顺序实现。浮层走 Radix Vue / Reka UI 无样式底座。

- [x] 1a：`APopover` + `AButton` / `AIconButton` / `ASpinner` / `ABadge`
- [x] 1b：`AField` / `ATextArea` / `ASearchField` / `ACheckbox` / `ASwitch` / `AStepper` / `AFormRow` / `AFormGrid`
- [x] 1c：`ATooltip` / `AMenu` / `ASelect` / `ATokenField`
- [x] 1d：`AToast` / `AAlert` / `ASheet`（含焦点陷阱）
- [x] 1e：`ATable` / `APagination` / `AEmptyState`
- [x] 1f：`ASegmentedControl` / `ATabBar`
- [x] 1g：`ASourceList`（含拖拽排序、宽度拖拽、复选）
- [x] 1h：`ADatePicker` / `ATreeSelect` / `AFileDrop` / `AImageViewer` / `APdfViewer` / `ABanner`

**验收**：`/dev/gallery` 展示全部组件的全部状态；每个组件有 Vitest 用例；键盘走一遍全部组件无死路；深色模式无异常。

---

## Phase 2 · 领域层 TypeScript 重写（2–3 个阶段）

对照旧实现写规格，按规格写新代码。**不拷贝旧 JS。**

- [x] 2a：写满 `07-domain-spec.md`（每个方法的校验 / 成功 / 失败 reason）
- [x] 2b：`types.ts` / `keys.ts` / `normalize.ts` / `seed.ts`，先把纯函数和合同测试里能覆盖的归一化跑绿
- [x] 2c：`repository.ts`（CRUD、树、字典、Sensor 替换、机型结构、受控文档）
- [x] 2d：`storage.ts`（BackendStorage 状态机）+ `search.ts` + `schematic-report.ts`
- [x] 2e：新领域层由 `apple-frontend` Vitest 覆盖；合同测试增加新文件存在性检查。运行时仍测旧 JS（生产前端未切换）；Phase 6 一次性改 import 路径

**验收**：合同测试通过；故意让 `setItem` 返回 `false` 时内存回滚；空库种子与版本化回填行为与旧前端一致。

---

## Phase 3 · API、登录与壳（1 个阶段）

- [x] 重写 `src/api/index.ts`（薄客户端，保留四类错误分型）
- [x] `src/stores/auth.ts`（token、profile、权限码、`useAccess()`）
- [x] `src/stores/selection.ts`（包装 repository，保留 `revision` 触发重算的模式）
- [x] 路由守卫（匿名只读、会话失效跳登录、按权限码过滤系统管理路由）
- [x] 登录页
- [x] 后端状态横幅 + 重连

**验收**：能登录、能登出、游客能进只读、后端停掉后刷新仍能只读。

---

## Phase 4 · 业务页面（3–4 个阶段）

按复杂度从低到高。**全部页面做完才进入切换**，不提前接生产。

- [x] 4a：数据字典页
- [x] 4b：制程管理页
- [x] 4c：客户管理页
- [x] 4d：Sensor 型号字典页
- [x] 4e：机型结构页
- [x] 4f：全局搜索页
- [x] 4g：系统管理四页（用户 / 角色 / 组织 / 日志）

**每页验收**：对照 `03-pages.md` 的列名、字段、校验、提示文案逐条勾；新旧前端并排开（5178 vs 5777）做一次同操作对比。

---

## Phase 5 · 收口（1 个阶段）

- [x] 走完 `03-pages.md` 第 10 节的复刻勾选表
- [x] 无障碍走查：键盘全流程、读屏抽查关键页、三种系统偏好
- [x] 深色模式全页面走查
- [x] 响应式：1280 / 1440 / 1920 三档 + 平板窄屏降级
- [x] 性能：构建产物体积、首屏、大表格（500 行）滚动
- [x] 生产构建 + `scripts/deploy-iis.ps1` 适配新目录
- [x] 新增 README（开发命令、目录说明）

**验收**：全部质量门禁通过，你实际用一遍确认。

---

## Phase 6 · 切换与清理（需要你明确同意）

**在你确认之前不执行任何删除。**

- [x] 你验收通过
- [x] `apple-frontend` 目录改名为 `frontend`（决策 6）
- [x] 删除 `apps/`、`packages/`、`internal/`
- [x] 删除根 `turbo.json`、`pnpm-workspace.yaml`、根 `package.json` 里的 Vben 依赖与 turbo 脚本
- [x] 根 `package.json` 只保留跨端脚本（`test:backend`、`backup:db`）或直接删掉，命令下沉到 `frontend/` 和 `backend/`
- [x] 更新 `README.md`、`CLAUDE.md`、`backend/README.md` 的路径与架构描述
- [x] 更新 `scripts/vben-migration.contract-test.cjs`（可考虑改名为 `selection-contract-test.cjs`）
- [x] 更新 `scripts/deploy-iis.ps1` 的 dist 路径
- [x] 一次独立提交，便于回滚

切换后的仓库结构：

```
frontend/     前端（全部）
backend/      后端
scripts/      部署与回归脚本
```

---

## 质量门禁

每个阶段结束都要过：

```powershell
cd frontend
pnpm run lint          # eslint + stylelint（含禁止硬编码令牌）
pnpm run check:type    # vue-tsc
pnpm run test          # vitest
pnpm run build         # 生产构建

cd ..
pnpm run test:selection   # 领域合同回归
pnpm run test:backend     # 后端用例，确认没碰坏后端
```

---

## 回滚方案

- Phase 6 完成后：前端在 `frontend/`，旧 Vben 目录已删除。出问题 `git revert` 该提交即可恢复。
- Phase 6 是独立提交：出问题 `git revert` 该提交即可恢复旧前端。
- 数据无风险：后端和数据库全程不动；`localStorage` 主键不变，新旧前端读的是同一份数据。

---

## 工作量说明

按已确认决策，这是 **11–14 个工作阶段**：约 12000 行业务代码重写（含领域层 TypeScript）+ 25 个组件的组件库。

不再用这些削减项：

- 不做深色模式 —— 不削减
- 系统管理四页后做 / 分两次上线 —— **已否决**，一次切换
- 无障碍底座手写 —— **已否决**，用 Radix Vue / Reka UI
- 领域层原样复用 —— **已否决**，TypeScript 从零重写

