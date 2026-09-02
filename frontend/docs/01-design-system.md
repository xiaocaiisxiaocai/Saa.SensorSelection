# 01 · 设计系统：Apple 规范落地

这份文档是唯一的视觉与交互事实来源。所有组件必须只使用这里定义的令牌，**不允许出现硬编码的颜色、字号、间距、圆角、时长**。

参照基准：Apple Human Interface Guidelines（macOS 部分为主）、Apple Design Resources 的系统颜色定义、macOS 系统应用（Finder / Mail / Numbers / 系统设置）的实际度量。

---

## 1. 设计原则（决定取舍时的依据）

1. **内容优先，界面退让。** 边框、阴影、分隔线一律做到最轻。能用留白分隔就不画线，能用一条 0.5px 发丝线就不用 1px。
2. **层级靠材质，不靠描边。** 浮层（侧栏、工具栏、弹窗、菜单）用半透明 + 背景模糊建立层级，而不是加粗边框。
3. **一个页面一个主操作。** 主按钮（filled 蓝）每个视图只出现一次，其余降级为 tinted / plain / borderless。
4. **动效表达空间关系。** 弹窗从中心缩放、菜单从触发点展开、侧栏推入。不做装饰性动画。
5. **状态永远可见。** 加载、空、错误、无权限，每个都有明确的视觉表达，不留白屏。
6. **深色模式是同等公民。** 不是把颜色反过来，而是每个令牌都有独立的深色值。

---

## 2. 颜色

### 2.1 系统强调色

取自 Apple 系统颜色定义。**这些是唯一允许的彩色**，业务不得自定义色值。

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--sys-blue` | `#007AFF` | `#0A84FF` | 主操作、选中、链接、焦点环 |
| `--sys-green` | `#34C759` | `#30D158` | 成功、「现用」状态、启用 |
| `--sys-red` | `#FF3B30` | `#FF453A` | 破坏性操作、失败、错误、Sensor 停用状态 |
| `--sys-orange` | `#FF9500` | `#FF9F0A` | 警告、反馈处理中或测试中状态 |
| `--sys-yellow` | `#FFCC00` | `#FFD60A` | 提醒 |
| `--sys-teal` | `#30B0C7` | `#40C8E0` | 辅助分类 |
| `--sys-indigo` | `#5856D6` | `#5E5CE6` | 辅助分类 |
| `--sys-purple` | `#AF52DE` | `#BF5AF2` | 辅助分类 |
| `--sys-pink` | `#FF2D55` | `#FF375F` | 辅助分类 |
| `--sys-gray` | `#8E8E93` | `#8E8E93` | 中性、禁用 |

> 旧前端每个模块用了一个自定义主题色（客户 `#0f766e`、制程 `#6d28d9`、机型 `#b45309`）。新前端**取消模块主题色**：Apple 的做法是全局单一强调色，模块区分靠图标和标题，不靠换色。这是有意的偏离，理由是三个手调的深色在 Apple 调色板里不存在，且和 `--sys-blue` 同屏时会脏。

### 2.2 灰阶

| 令牌 | 浅色 | 深色 |
| --- | --- | --- |
| `--gray-1` | `#8E8E93` | `#8E8E93` |
| `--gray-2` | `#AEAEB2` | `#636366` |
| `--gray-3` | `#C7C7CC` | `#48484A` |
| `--gray-4` | `#D1D1D6` | `#3A3A3C` |
| `--gray-5` | `#E5E5EA` | `#2C2C2E` |
| `--gray-6` | `#F2F2F7` | `#1C1C1E` |

### 2.3 文字（Label）

Apple 用**同一个色相的不同不透明度**表达文字层级，不用不同灰色。必须照做。

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--label` | `rgb(0 0 0)` | `rgb(255 255 255)` | 正文、标题 |
| `--label-2` | `rgb(60 60 67 / 71%)` | `rgb(235 235 245 / 60%)` | 次要说明、辅助文字 |
| `--label-3` | `rgb(60 60 67 / 30%)` | `rgb(235 235 245 / 30%)` | 占位符、禁用文字 |
| `--label-4` | `rgb(60 60 67 / 18%)` | `rgb(235 235 245 / 16%)` | 极弱（水印级） |

### 2.4 分隔线

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--separator` | `rgb(60 60 67 / 29%)` | `rgb(84 84 88 / 65%)` | 半透明发丝线（列表行间） |
| `--separator-opaque` | `#C6C6C8` | `#38383A` | 不透明分隔（区块边界） |

**发丝线实现**：不用 `border: 1px`。用 `box-shadow: inset 0 -0.5px 0 var(--separator)`，或在高 DPI 下用 `transform: scaleY(0.5)` 的伪元素。1px 边框在 Apple 界面里显得重。

### 2.5 填充（Fill）

用于控件底色、悬停态、选中态。半透明，因此能叠在任何背景上。

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--fill-1` | `rgb(120 120 128 / 20%)` | `rgb(120 120 128 / 36%)` | 分段控件滑块底 |
| `--fill-2` | `rgb(120 120 128 / 16%)` | `rgb(120 120 128 / 32%)` | 输入框底、tag 底 |
| `--fill-3` | `rgb(118 118 128 / 12%)` | `rgb(118 118 128 / 24%)` | 悬停 |
| `--fill-4` | `rgb(116 116 128 / 8%)` | `rgb(118 118 128 / 18%)` | 斑马纹、极弱悬停 |

### 2.6 背景

桌面端分「窗口层」和「内容层」。

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--bg-window` | `#ECECEE` | `#1E1E1E` | 应用最底层（侧栏透出它） |
| `--bg-content` | `#FFFFFF` | `#1C1C1E` | 主内容区、表格、卡片 |
| `--bg-grouped` | `#F2F2F7` | `#000000` | 分组表单背景 |
| `--bg-elevated` | `#FFFFFF` | `#2C2C2E` | 弹窗、菜单、气泡 |

### 2.7 材质（Vibrancy）

半透明 + 背景模糊。这是 Apple 界面最标志性的部分，**侧栏和工具栏必须用**。

```css
--material-sidebar-bg:  rgb(246 246 248 / 72%);   /* 深色 rgb(30 30 32 / 72%) */
--material-toolbar-bg:  rgb(255 255 255 / 72%);   /* 深色 rgb(28 28 30 / 72%) */
--material-menu-bg:     rgb(250 250 252 / 80%);   /* 深色 rgb(44 44 46 / 80%) */
--material-blur:        saturate(180%) blur(20px);
```

用法：

```css
.sidebar {
  background: var(--material-sidebar-bg);
  backdrop-filter: var(--material-blur);
  -webkit-backdrop-filter: var(--material-blur);
}
```

**降级**：`@supports not (backdrop-filter: blur(1px))` 时换成不透明的 `--bg-window`。另外必须响应 `prefers-reduced-transparency`（见第 9 节）。

### 2.8 语义映射

业务状态到颜色的映射固定下来，避免各页面自己发挥：

| 业务状态 | 颜色 | 出现位置 |
| --- | --- | --- |
| Sensor 现用 | `--sys-green` | Sensor 型号字典状态列 |
| Sensor 备选（备用） | `--sys-yellow` | 同上 |
| Sensor 停用 | `--sys-red` | 同上 |
| 反馈 已解决 | `--sys-green` | 厂外反馈状态列 |
| 反馈 处理中 | `--sys-orange` | 同上 |
| 反馈 测试中 | `--sys-orange` | 同上 |
| 反馈 待处理 | `--sys-gray` | 同上 |
| 后端 online | `--sys-green` | 状态横幅 |
| 后端 connecting | `--sys-gray` | 同上 |
| 后端 offline | `--sys-orange` | 同上 |
| 后端 unauthorized | `--sys-red` | 同上 |
| 用户启用 / 停用 | `--sys-green` / `--sys-gray` | 用户管理状态列 |
| 审计结果 成功 / 失败 | `--sys-green` / `--sys-red` | 操作日志结果列 |
| 系统内置角色 | `--sys-indigo` | 角色管理类型列 |

---

## 3. 字体

### 3.1 字体栈

```css
--font-ui:
  -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
  "Inter var", "Inter",
  "PingFang SC", "Noto Sans SC", "HarmonyOS Sans SC",
  "Microsoft YaHei UI", "Microsoft YaHei",
  system-ui, sans-serif;

--font-mono:
  ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Mono",
  Consolas, monospace;
```

- macOS / iOS：优先系统 SF Pro + PingFang SC。
- Windows：**已确认**自托管 Inter（拉丁）+ Noto Sans SC 子集（中文），再落到系统微软雅黑。Inter 的字形骨架接近 SF Pro。
- `--font-mono` 用于料号、型号、IP、时间戳等需要对齐的内容。

字体栈实施时把 `"Noto Sans SC"` 插在 PingFang SC 之后、微软雅黑之前。见 `06-open-decisions.md` 决策 1。

### 3.2 字号阶梯

**默认按 Windows 桌面阅读距离设定，比 macOS 系统应用略松。** macOS 控件常用 13pt，在高分屏 + 中文（Noto Sans SC / 微软雅黑）下偏虚、偏小。本项目表格和筛选是主界面，字号上调一档，保证单屏仍能看清多行。

对照依据：正文与表格 15px、侧栏与按钮 15px、辅助说明 13px、区块标题 22px。

| 令牌 | 字号/行高 | 字重 | 字距 | 用途 |
| --- | --- | --- | --- | --- |
| `--text-display` | 32 / 40 | 700 | -0.5px | 登录页主标题 |
| `--text-title-1` | 28 / 34 | 600 | -0.4px | 页面标题 |
| `--text-title-2` | 22 / 28 | 600 | -0.3px | 区块标题、弹窗标题 |
| `--text-headline` | 17 / 24 | 600 | -0.2px | 列表项主文字、强调 |
| `--text-body` | 17 / 24 | 400 | 0 | 正文、说明 |
| `--text-control` | 15 / 22 | 400 | 0 | **默认**：按钮、输入框、表格单元格 |
| `--text-control-em` | 15 / 22 | 600 | 0 | 表头、tag |
| `--text-caption` | 13 / 18 | 400 | 0 | 辅助说明、计数、时间戳 |

规则：
- 页面默认字号是 `--text-control`（15px），不是 `--text-body`。
- 中文不使用 300 以下字重（微软雅黑 Light 在 Windows 下发虚）。
- 全部字号只能取上表值。禁止 14px、16px 这类中间值。
- 负字距只加在 17px 以上。15px 及以下用 0，避免中文挤在一起。

---

## 4. 间距

**4pt 基础网格，8pt 主节奏。**

| 令牌 | 值 | 典型用途 |
| --- | --- | --- |
| `--space-1` | 2px | 图标与文字的微调 |
| `--space-2` | 4px | tag 内边距、紧密图标组 |
| `--space-3` | 8px | 控件内边距、按钮间距 |
| `--space-4` | 12px | 表单项之间、单元格横向内边距 |
| `--space-5` | 16px | 卡片内边距、区块间距 |
| `--space-6` | 20px | 弹窗内边距 |
| `--space-7` | 24px | 页面内边距 |
| `--space-8` | 32px | 大区块分隔 |
| `--space-9` | 40px | 空状态上下留白 |

固定布局尺寸：

| 令牌 | 值 | 说明 |
| --- | --- | --- |
| `--sidebar-width` | 200px | 主导航侧栏（不可调） |
| `--source-list-width` | 220px | 页面内实体侧栏（可拖拽 160–320） |
| `--toolbar-height` | 60px | 顶部工具栏 |
| `--row-height` | 40px | 表格行 |
| `--row-height-loose` | 48px | 带头像/多行内容的行 |

---

## 5. 圆角

Apple 用连续曲率（squircle），Web 上无法精确实现。用略大的 `border-radius` 近似，并在 4px 以上避免出现明显的圆弧突变。

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--radius-xs` | 4px | tag、极小控件 |
| `--radius-sm` | 6px | 小尺寸按钮、输入框内部元素 |
| `--radius-md` | 8px | **默认**：按钮、输入框、选择器 |
| `--radius-lg` | 10px | 分段控件外框、菜单 |
| `--radius-xl` | 12px | 卡片、气泡 |
| `--radius-2xl` | 16px | 弹窗面板 |
| `--radius-pill` | 999px | 搜索框、状态胶囊 |

嵌套规则：内层圆角 = 外层圆角 − 内边距。分段控件外 10px、内边距 2px，滑块就是 8px。

---

## 6. 阴影与高度

Apple 的阴影极轻，且**总是配一条发丝边**（阴影负责空间，边框负责边界）。

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--shadow-1` | `0 1px 2px rgb(0 0 0 / 4%)` | 静态卡片 |
| `--shadow-2` | `0 4px 12px rgb(0 0 0 / 8%)` | 悬停抬起、tag 拖拽 |
| `--shadow-3` | `0 8px 24px rgb(0 0 0 / 12%)` | 菜单、气泡、下拉 |
| `--shadow-4` | `0 24px 64px rgb(0 0 0 / 20%)` | 弹窗面板 |

深色模式下阴影不够用（黑底上看不出），额外靠 `--bg-elevated` 的提亮和 `--separator` 的边框区分层级。

---

## 7. 动效

### 7.1 时长与曲线

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--dur-1` | 120ms | 悬停、按下、颜色变化 |
| `--dur-2` | 200ms | 展开/收起、tag 增删 |
| `--dur-3` | 300ms | 弹窗进出、页面切换 |
| `--dur-4` | 400ms | 侧栏折叠 |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 进入（快起慢停），默认 |
| `--ease-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | 退出 |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | 位移 |
| `--ease-sheet` | `cubic-bezier(0.32, 0.72, 0, 1)` | 弹窗/抽屉（Apple 的面板曲线） |

### 7.2 标准转场

| 场景 | 动画 |
| --- | --- |
| 弹窗进入 | `opacity 0→1` + `scale 0.94→1`，`--dur-3` `--ease-sheet`；遮罩 `opacity 0→1` 同时 |
| 弹窗退出 | 反向，`--dur-2` `--ease-in` |
| 菜单/下拉 | `opacity 0→1` + `scale 0.96→1`，`transform-origin` 指向触发点，`--dur-2` |
| 提示 HUD | 从上方 `translateY(-8px)→0` + 淡入，`--dur-2`；2.4s 后自动淡出 |
| 分段控件滑块 | `transform` 位移，`--dur-2` `--ease-in-out`（滑块动，文字不动） |
| 侧栏折叠 | `width` + `opacity`，`--dur-4` `--ease-in-out` |
| 表格行悬停 | `background-color`，`--dur-1` |
| 展开/收起分组 | `grid-template-rows` 或高度动画，`--dur-2` |

按下反馈：可点击元素 `:active` 时 `opacity: 0.7`（Apple 的标准按下反馈），不做位移。

---

## 8. 控件度量

| 尺寸 | 高度 | 横向内边距 | 字号 | 圆角 |
| --- | --- | --- | --- | --- |
| `small` | 28px | 8px | 13px | 6px |
| `medium`（默认） | 32px | 12px | 15px | 8px |
| `large` | 40px | 16px | 15px | 8px |
| `xlarge` | 48px | 20px | 17px | 10px |

- 图标按钮：正方形，`small` 28、`medium` 32、`large` 40，圆角同上或 `--radius-pill`。
- **触控目标最小 44×44**：视觉尺寸可以是 32px，但可点击区域用透明内边距撑到 44px（`::before` 扩展命中区）。
- 表格里的图标按钮例外，允许 28px 命中区（桌面鼠标场景，且行高 40px）。

---

## 9. 无障碍

以下每一条都是**硬要求**，组件库里逐个组件验收。

### 对比度
- 正文对背景 ≥ 4.5:1，大字号（≥15px 600 字重）≥ 3:1。
- `--label-3` 只能用于占位符和禁用态，不能承载必要信息。
- 状态**不能只靠颜色**：Sensor 状态列同时显示文字（现用/备选/停用），审计结果列显示「成功/失败」文字加图标。

### 键盘
- 所有交互元素可 Tab 到达，顺序符合视觉顺序。
- 焦点环统一：`box-shadow: var(--focus-ring)`（2px 实色蓝环）。输入框只在容器上画一圈，避免内描边和外发光叠成重影。按钮用 `:focus-visible`，鼠标点击不显示。
- 弹窗打开时焦点移入弹窗、Tab 循环锁在弹窗内、`Esc` 关闭、关闭后焦点回到触发元素。
- 菜单/下拉：`↑↓` 移动、`Enter` 选中、`Esc` 关闭、输入字符跳转首字母匹配项。
- 表格：`↑↓` 移动行焦点，`Enter` 触发主操作。
- 保留旧前端的 `Ctrl/⌘ + K` 聚焦全局搜索。

### 读屏
- 图标按钮必须有 `aria-label`（旧代码里已有的中文标签全部保留，见 `03-pages.md`）。
- 表格用 `<table>` 语义标签，表头 `<th scope="col">`。
- 弹窗 `role="dialog"` + `aria-modal="true"` + `aria-labelledby` 指向标题。
- 提示 HUD 用 `role="status"`（普通）/ `role="alert"`（错误）。
- 加载态用 `aria-busy`，不是只转个圈。
- 侧栏分组用 `aria-expanded`；侧栏宽度手柄用 `role="separator"` + `aria-valuenow`（旧代码已实现，保留）。

### 系统偏好
```css
@media (prefers-reduced-motion: reduce) {
  /* 全部 transform 动画降为 opacity 或直接取消，时长归零 */
}
@media (prefers-reduced-transparency: reduce) {
  /* 材质换成不透明背景，去掉 backdrop-filter */
}
@media (prefers-contrast: more) {
  /* 分隔线换 --separator-opaque，文字层级提一档，焦点环加粗到 4px */
}
```

---

## 10. 深色模式

- 令牌在 `:root` 定义浅色，在 `:root[data-theme='dark']` 覆盖深色。
- 默认跟随系统（`prefers-color-scheme`），用户可在工具栏用户菜单里手动切「浅色 / 深色 / 跟随系统」，存 `localStorage` 键 `apple-frontend:theme`。
- 切换时给 `<html>` 加 200ms 的 `background-color` / `color` 过渡，但**不给** `transform` 加过渡，避免全页面重排抖动。
- 图片和 PDF 预览区在深色下不反色，底色用 `--gray-6`。

---

## 11. 令牌文件骨架

`src/styles/tokens.css` 的结构（实施时按上表填全）：

```css
:root {
  /* 1. 系统色 */
  --sys-blue: #007aff;
  /* ... */

  /* 2. 灰阶 */
  /* 3. 文字 */
  /* 4. 分隔线 */
  /* 5. 填充 */
  /* 6. 背景 */
  /* 7. 材质 */
  /* 8. 字体 */
  /* 9. 间距 */
  /* 10. 圆角 */
  /* 11. 阴影 */
  /* 12. 动效 */
  /* 13. 控件度量 */
}

:root[data-theme='dark'] {
  /* 仅覆盖有深色值的令牌 */
}
```

**约束：组件样式里出现任何硬编码色值、字号、时长，视为实现错误。** 建议加一条 stylelint 规则拦截（见 `05-implementation-plan.md` Phase 0）。

组件规格见 `02-component-library.md`。
