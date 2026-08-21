# 00 · 总览：目标、范围与关键决策

## 1. 要解决的两个问题

1. **UI 不好看。** 现有界面是 Vben Admin 默认外观 + Element Plus 默认控件，视觉语言不统一（Vben 的 shadcn 变量、Element Plus 的 `--el-*` 变量、`selection.css` 里 1180 行自定义样式三套并存）。
2. **前端文件散落在整个仓库。** Vben monorepo 把应用放 `apps/web-ele`、共享 UI 放 `packages/`、构建配置放 `internal/`、依赖装在仓库根。

新前端同时解决这两点：**一套自建的 Apple 规范设计系统 + 一个自包含的目录**。

## 2. 范围

### 要做

- 复刻现有全部页面与交互（8 个路由、23 个业务组件的功能，详见 `03-pages.md`）
- 复刻现有内置种子数据（客户/制程/机型分组、Sensor 目录、9 类数据字典，详见 `04-data-api.md`）
- 完整接入现有后端（JWT 登录、RBAC、审计日志、数据仓库、示意图报告）
- 保持数据兼容：`localStorage` 主键仍为 `symtek_crud_store`，token 键仍为 `symtek_token`
- 深色模式、键盘导航、无障碍标签

### 不做

- 不改后端。后端接口、权限码、数据库结构一行不动。
- 不改业务规则。校验、归一化、迁移语义与现有领域层**行为等价**；实现用 TypeScript 从零重写，不拷贝旧 JS。
- 不做移动端 App 壳。响应式做到平板可用即可，主目标是桌面。
- 不引入新的业务功能。这次是等价替换 + 视觉重做。

### 完成的定义

旧前端能做的每一件事，新前端都能做，且 `pnpm run test:selection` 领域合同回归通过。

## 3. 技术选型

| 层 | 选择 | 理由 |
| --- | --- | --- |
| 构建 | Vite 6 | 现有项目已在用，团队熟悉 |
| 框架 | Vue 3.5（`<script setup>` + TS） | 与现有代码同栈；领域层也改写成 TypeScript |
| 路由 | Vue Router 4 | 同上 |
| 状态 | Pinia | 同上 |
| UI 库 | **无。自建组件库** | 这是重点：Element Plus 的视觉语言与 Apple 规范冲突，改主题改不出来，必须自建 |
| 样式 | 原生 CSS + CSS 自定义属性（设计令牌） | Apple 规范核心是精确的字号/行高/间距/材质，令牌化比工具类更可控；不引入 Tailwind |
| 图标 | Lucide（ISC 许可），统一 1.5px 描边圆头 | 见下方许可说明 |
| PDF 预览 | pdf.js（`pdfjs-dist`） | 复用现有实现 |
| 拖拽排序 | `sortablejs` | 复用现有实现 |
| 测试 | Vitest + `@vue/test-utils` | 与现有单测同栈 |

### 依赖数量目标

生产依赖控制在这些以内：`vue`、`vue-router`、`pinia`、`pdfjs-dist`、`sortablejs`、`lucide-vue-next`、Radix Vue / Reka UI（无样式底座，决策 3）、必要的日期处理。**不装** Element Plus、不装 Vben 任何包、不装 Tailwind。字体文件自托管 Inter + Noto Sans SC 子集（决策 1）。

## 4. 三个关键决策

### 决策 A：领域层用 TypeScript 从零重写（已确认）

现有 `apps/web-ele/src/modules/selection/` 下这几个文件是**纯逻辑、无 UI 依赖、有测试覆盖**，作为对照规格，不拷贝进新目录：

| 文件 | 行数 | 作用 |
| --- | --- | --- |
| `domain.js` | 2316 | 全部业务校验、归一化、CRUD、旧数据迁移、搜索索引 |
| `data.js` | 617 | 内置种子数据与全部选项清单 |
| `backend-storage.js` | 296 | 后端桥接：乐观更新、串行队列、失败回滚、离线降级 |
| `schematic-report.ts` | 187 | 机型示意图报告生成 |
| `*.d.ts` | 518 | 类型声明 |

**按 `07-domain-spec.md` 用 TypeScript 重写到 `apple-frontend/src/domain/`。** 行为必须与旧实现等价：写入失败回滚、`setItem` 返回 `false` 视为拒绝、机型行 `sensorIds` 多选后规格实时解析、旧 key 迁移、种子版本化回填不覆盖用户数据。

`scripts/vben-migration.contract-test.cjs` 改路径后继续当护栏。规格没写满之前不写领域层代码。详见 `06-open-decisions.md` 决策 8。

### 决策 B：完全独立，不进 pnpm workspace

`apple-frontend/package.json` 里没有任何 `workspace:*` 依赖，有自己的 `node_modules`，命令在自己目录里跑：

```powershell
cd apple-frontend
pnpm install
pnpm dev
```

切换完成后可以删掉 `apps/`、`packages/`、`internal/`、根 `turbo.json`、根 `pnpm-workspace.yaml`。

代价：`pdfjs-dist` 之类的依赖会在新旧前端各装一份，过渡期磁盘多占几百 MB。切换完成后旧的一起删掉。这个代价换「一个文件夹装完前端」，值得。

### 决策 C：以 macOS 桌面端为设计基准，不是 iOS

Apple 的 HIG 分平台。这个软件是数据密集的桌面工具（大量表格、侧栏、多标签），对应的 Apple 参照物是 **macOS**（Finder 的源列表、Mail 的三栏、Numbers 的表格），不是 iOS Settings。

具体影响：
- 主体字号用 macOS 的 13pt/15pt 体系，不用 iOS 的 17pt body。iOS 的 17pt 放到表格里密度会崩。
- 侧栏用 macOS 半透明源列表（`backdrop-filter`），不用 iOS 的分组列表。
- 弹窗用 macOS 居中面板 + 缩放淡入，不用 iOS 的底部抽屉。
- 表单在弹窗里用 macOS 的右对齐标签/左侧控件，但考虑到中文标签长度差异大，实际采用顶部标签（详见 `01-design-system.md` 的偏移说明）。

字号偏移的完整理由和数值见 `01-design-system.md` 第 3 节。

## 5. 必须说清的限制

### SF Pro 与 SF Symbols 不能用

Apple 的字体（SF Pro）和图标库（SF Symbols）授权范围仅限 Apple 平台的应用，**不能在 Web 上分发**。这不是技术问题，是许可问题。

应对（已确认，见 `06-open-decisions.md`）：
- 字体：自托管 Inter + Noto Sans SC 子集；Apple 设备优先系统 SF Pro / PingFang SC。Phase 0 出 Windows 样张验收覆盖，不再重选方案。
- 图标用 Lucide（ISC 许可，可商用），统一调成 1.5px 描边、圆头圆角，视觉上接近 SF Symbols 的几何感，但不声称是 SF Symbols。

### Apple 没有「表格」规范

HIG 里没有企业级数据表格的规范。Apple 自家的密集列表参照物是 Finder 列表视图、Mail 消息列表、Xcode 的 issue 列表。本项目的表格规范是**基于这些参照物推导**的，会在 `01-design-system.md` 里写明推导依据，避免以后有人问「HIG 哪一页写了这个」。

### 工作量

现有前端业务代码约 12000 行（不含 Vben 基座）。其中：

| 部分 | 行数 | 处理方式 |
| --- | --- | --- |
| 领域层 + 种子 + 桥接 | ~3900 | TypeScript 从零重写（行为等价） |
| 业务 UI（组件 + 视图 + CSS） | ~7000 | 重写 |
| API 客户端 + 路由 + 权限 | ~1100 | 重写（薄层） |

需要重写的是约 12000 行，另外要新写一套约 25 个组件的组件库。按 **11–14 个工作阶段** 估。一次做完再切换。分阶段计划见 `05-implementation-plan.md`。

## 6. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 自建组件库的表格性能不如 Element Plus | 大数据量卡顿 | 现有页面都有分页（默认 20 条/页），单页 DOM 量可控；先不做虚拟滚动，实测超过 100 行再加 |
| 无障碍能力从零建，容易漏 | 键盘不可达、读屏无标签 | 组件库每个组件的规格里都写死 ARIA 契约，`02-component-library.md` 逐条列出；旧代码里已有的 `aria-label` 全部保留 |
| 复刻遗漏功能 | 上线后发现少东西 | `03-pages.md` 是逐列逐字段抄下来的清单，实施时当勾选表用；切换前做一次新旧并行对照 |
| 领域层 TypeScript 重写丢掉已修过的语义 | 写入不回滚、旧数据读坏、种子覆盖用户数据 | 先写满 `07-domain-spec.md`；合同测试必须通过；禁止拷贝旧 JS |
| Windows 下字体不好看 | 视觉打折 | 已确认自托管 Inter + Noto Sans SC；Phase 0 出样张验收子集覆盖 |
| 过渡期两套前端都要维护 | 双份改动 | 过渡期冻结旧前端的功能改动，只修致命 bug；一次切换，不提前接生产 |

## 7. 目录结构

```
apple-frontend/
├─ docs/                      规划文档（本目录）
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ src/
   ├─ main.ts
   ├─ App.vue
   ├─ styles/                 设计令牌与全局样式
   │  ├─ tokens.css           颜色/字体/间距/圆角/动效变量
   │  ├─ reset.css
   │  └─ global.css
   ├─ ui/                     Apple 规范组件库（无业务逻辑）
   │  ├─ button/  field/  select/  table/  sheet/  ...
   │  └─ index.ts
   ├─ domain/                 TypeScript 领域层（按 07-domain-spec.md 重写）
   │  ├─ types.ts  keys.ts  normalize.ts  seed.ts
   │  ├─ repository.ts  search.ts  storage.ts
   │  └─ schematic-report.ts
   ├─ api/                    HTTP 客户端（重写，薄层）
   │  └─ index.ts
   ├─ stores/                 Pinia：selection / auth
   ├─ router/                 路由 + 权限守卫
   ├─ layouts/                AppShell（侧栏 + 工具栏 + 内容区）
   └─ pages/                  业务页面
      ├─ login/
      ├─ selection/           customer / process / machine / sensor / dictionary / search
      └─ system/              user / role / org / audit-log
```

设计规范见 `01-design-system.md`。
