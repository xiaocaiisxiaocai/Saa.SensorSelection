# 02 · 组件库规格

`src/ui/` 下的组件**不含任何业务逻辑**，不 import `stores/`、不 import `domain/`。全部通过 props / emits / slots 通信。

浮层与表单控件（`APopover`、`ASelect`、`AMenu`、`ASheet`、`ATooltip`、`ADatePicker`、`ATreeSelect`）的键盘导航与 ARIA **用 Radix Vue / Reka UI 做无样式底座**（`06-open-decisions.md` 决策 3）。样式 100% 自写，只准用 `tokens.css`，不引入底座默认皮肤。

命名：文件用 `PascalCase.vue`，组件名统一 `A` 前缀（`AButton`、`ATable`），避免和 HTML 元素及旧代码混淆。

---

## 1. Element Plus → 新组件对照表

用来确认没有遗漏。左列是旧前端实际用到的 Element Plus 组件。

| Element Plus | 新组件 | 差异说明 |
| --- | --- | --- |
| `ElButton` | `AButton` | 5 种变体替代 `type`；`circle` → `AIconButton` |
| `ElInput` | `AField` | 单行；带清除按钮、字数上限 |
| `ElInput type="textarea"` | `ATextArea` | 自动增高 |
| `ElInputNumber` | `AStepper` | macOS 步进器（上下箭头贴右侧） |
| `ElSelect` | `ASelect` | 弹出菜单，不是原生 select；支持 `filterable` |
| `ElSelect multiple` | `ATokenField` | 多选 + 折叠计数（机型行关联传感器用） |
| `ElOption` | `ASelect` 的 `options` prop | 改为数据驱动，不用子组件 |
| `ElTabs` / `ElTabPane` | `ASegmentedControl` + `ATabBar` | 少量固定 tab 用分段控件；动态可增删 tab 用 `ATabBar` |
| `ElTable` / `ElTableColumn` | `ATable` | 列用 `columns` 配置数组 |
| `ElPagination` | `APagination` | |
| `ElDialog` | `ASheet` | 居中面板 + 缩放淡入 |
| `ElMessageBox.confirm` | `AAlert`（命令式 `alert.confirm()`） | Apple 警告框样式 |
| `ElMessage` | `AToast`（命令式 `toast.success()` 等） | 顶部 HUD |
| `ElTooltip` | `ATooltip` | |
| `ElTag` | `ABadge` | 状态胶囊 |
| `ElEmpty` | `AEmptyState` | |
| `ElDatePicker` | `ADatePicker` | 单日期 + 日期范围（操作日志用） |
| `ElTreeSelect` | `ATreeSelect` | 组织架构选择（支持跳级） |
| `ElSwitch` | `ASwitch` | iOS 开关 |
| `ElCheckbox` | `ACheckbox` | |
| 无（原生 input） | `ASearchField` | 胶囊搜索框 |
| 无 | `APopover` / `AMenu` | 用户菜单、下拉容器 |
| 无 | `ASourceList` | 侧栏源列表（分组 + 折叠 + 拖拽 + 复选 + 可调宽） |
| 无 | `AImageViewer` | 缩放/平移图片预览 |
| 无 | `APdfViewer` | pdf.js 预览 |
| 无 | `AFileDrop` | 文件上传 |
| 无 | `ASpinner` / `AProgressBar` | 加载态 |
| 无 | `ABanner` | 后端状态横幅 |

---

## 2. 组件逐个规格

每个组件都给出：props / emits / 插槽 / 状态 / 无障碍契约。

### 2.1 `AButton`

```ts
variant: 'filled' | 'tinted' | 'plain' | 'borderless' | 'destructive'  // 默认 'plain'
size: 'small' | 'medium' | 'large' | 'xlarge'                          // 默认 'medium'
loading?: boolean
disabled?: boolean
block?: boolean          // 撑满宽度（登录按钮）
```

| 变体 | 静态 | 悬停 | 按下 | 用途 |
| --- | --- | --- | --- | --- |
| `filled` | `--sys-blue` 底 + 白字 | 亮度 ×1.08 | `opacity 0.7` | 页面唯一主操作 |
| `tinted` | `--sys-blue` 12% 底 + 蓝字 | 底 18% | `opacity 0.7` | 次要但需要强调 |
| `plain` | `--bg-content` 底 + `--separator` 发丝边 + `--label` 字 | `--fill-4` 底 | `opacity 0.7` | 默认（取消、普通操作） |
| `borderless` | 无底无边 + 蓝字 | `--fill-4` 底 | `opacity 0.7` | 工具栏文字按钮 |
| `destructive` | `--sys-red` 12% 底 + 红字 | 底 18% | `opacity 0.7` | 删除 |

- `loading` 时左侧插入 12px `ASpinner`，文字保留，按钮禁用但**宽度不跳**（预留 spinner 宽度）。
- `disabled` 时 `opacity: 0.4`，`cursor: not-allowed`，且移除 `:hover` 效果。
- 无障碍：`<button type="button">`；有图标无文字时必须传 `aria-label`（用 `AIconButton` 更合适）。

### 2.2 `AIconButton`

```ts
icon: Component            // Lucide 组件
label: string              // 必填，作为 aria-label 与 tooltip 文案
variant?: 'plain' | 'borderless' | 'destructive'   // 默认 'borderless'
size?: 'small' | 'medium' | 'large'
```

- 自动包 `ATooltip`（内容 = `label`），delay 500ms。
- 命中区通过 `::before` 扩到 44×44；表格内 `size="small"` 时不扩（桌面场景）。
- 强制 `aria-label={label}`，`label` 为空时开发环境抛错。

### 2.3 `AField` / `ATextArea`

```ts
modelValue: string
placeholder?: string
maxlength?: number
clearable?: boolean       // 默认 true
prefixIcon?: Component
type?: 'text' | 'password'
invalid?: boolean
disabled?: boolean
rows?: number             // 仅 ATextArea，默认 3，自动增高上限 10 行
```

- 静态：`--fill-2` 底、无边框、`--radius-md`。聚焦：`--bg-content` 底 + `--sys-blue` 边 + 焦点环。
- `type="password"` 右侧显示「显示/隐藏」眼睛图标按钮。
- `maxlength` 存在时右下角显示 `已输入/上限` 计数，仅在聚焦或超过 80% 时出现。
- `clearable` 的清除按钮仅在有值且聚焦/悬停时出现。
- 无障碍：外部 `AFormRow` 负责 `<label for>` 关联；`invalid` 时加 `aria-invalid="true"` 并用 `aria-describedby` 指向错误文字。

### 2.4 `ASelect`

```ts
modelValue: string | number | null
options: Array<{ label: string; value: string | number; disabled?: boolean; hint?: string }>
placeholder?: string
filterable?: boolean
clearable?: boolean
size?: ControlSize
```

- 触发器外观同 `AField`，右侧 `chevron-down` 图标。
- 弹出层：`APopover` 承载，`--material-menu-bg` + 模糊，`--shadow-3`，`--radius-lg`，最大高度 320px 滚动。
- 选中项左侧显示 `check` 图标（Apple 菜单的选中表达），不是高亮整行。
- `filterable` 时弹层顶部出现搜索输入。
- 键盘：`↑↓` 移动、`Enter` 选中、`Esc` 关闭、`Home/End` 首末项、输入字符首字母匹配。
- 无障碍：触发器 `role="combobox"` + `aria-expanded` + `aria-controls`；选项 `role="option"` + `aria-selected`。

### 2.5 `ATokenField`（多选）

在 `ASelect` 基础上：

```ts
modelValue: Array<string | number>
maxVisibleTokens?: number   // 默认 2，超出显示「+N」
```

- 已选项在触发器内以 `ABadge` 形式展示，每个带 `×` 移除。
- 超出 `maxVisibleTokens` 折叠为 `+N`，悬停用 `ATooltip` 列出全部。
- 弹层里已选项显示 `check`，可反选。
- 用于「机型结构 → 关联传感器（可多选）」，选项标签形如 `漫反射 · OMRON E3Z-D61 · 检测距离 0~300mm（备选）`。

### 2.6 `ASegmentedControl`

```ts
modelValue: string
segments: Array<{ label: string; value: string; badge?: number }>
size?: 'medium' | 'large'
```

- 外框 `--fill-1` 底、`--radius-lg`、内边距 2px。选中滑块 `--bg-content` 底 + `--shadow-1` + `--radius-md`。
- 切换时滑块用 `transform` 位移（`--dur-2` `--ease-in-out`），文字不动。
- 段之间有 1px `--separator` 竖线，选中段两侧的竖线淡出。
- 用于：客户详情 4 个 tab、制程 2 个 tab、Sensor 状态 tab。
- 无障碍：`role="tablist"`，段 `role="tab"` + `aria-selected`，`←→` 键切换。

### 2.7 `ATabBar`（可增删 tab）

分段控件装不下动态数量的 tab，机型结构页需要单独组件。

```ts
modelValue: string
tabs: Array<{ label: string; value: string; closable?: boolean; renamable?: boolean }>
addable?: boolean
```

- 横向排列，下方 2px `--sys-blue` 指示条随选中项滑动。
- 溢出时横向滚动，两端出现渐隐遮罩 + 滚动按钮。
- `renamable` / `closable` 的 tab 悬停时在标签右侧淡入铅笔 / 垃圾桶图标按钮（`opacity 0.35 → 1`，沿用旧交互）。
- `addable` 时最右侧固定「+」按钮（不随滚动）。
- emits：`update:modelValue`、`rename`、`close`、`add`。

### 2.8 `ATable`

这是最重要也最复杂的组件。参照 macOS Finder 列表视图。

```ts
columns: Array<{
  key: string
  label: string
  width?: number
  minWidth?: number
  align?: 'start' | 'center' | 'end'
  ellipsis?: boolean          // 正文自动换行；开启时保留全文 tooltip
  mono?: boolean              // 等宽字体（料号/时间）
  fixed?: 'end'               // 固定右侧（操作列）
}>
rows: T[]
rowKey: keyof T | ((row: T) => string | number)
emptyText?: string
loading?: boolean
striped?: boolean             // 默认 false
rowHeight?: 'compact' | 'loose'   // 32px / 40px
```

视觉：
- 对齐：表头与正文单元格默认左对齐；列通过 `align` 显式指定时按列配置覆盖。
- 表头：`--text-control-em`、`--label` 色、`--bg-content` 底、`position: sticky`，底部一条发丝线；滚动时表头下方出现 `--shadow-1`。
- 行：最小高 40px，正文超出列宽时自动换行并撑高整行；行间使用发丝线（`inset 0 -0.5px`），**不画竖线**。
- 悬停：`--fill-4` 底。选中（如有）：`--sys-blue` 12% 底。
- 斑马纹默认关闭 —— Apple 的列表靠发丝线分隔，斑马纹是 Element 的习惯。旧前端部分表开了 `stripe`，新前端统一关闭。
- 操作列 `fixed="end"`：右侧固定，左侧有一条发丝线和 8px 渐变遮罩表示内容被遮挡。
- 正文单元格：`overflow-wrap: anywhere` + `white-space: normal`，长文本自动换行；`ellipsis` 列仍可通过 `ATooltip` 查看全文。表头保持单行省略。虚拟滚动依赖固定行高，因此显式 `virtual` 模式仍保持正文单行。

插槽：`cell-{key}` 自定义单元格，`empty` 自定义空状态。

状态：
- `loading`：表体覆盖半透明层 + 居中 `ASpinner`，`aria-busy="true"`。
- 空：居中 `AEmptyState`，高度至少 200px。

无障碍：真 `<table>` / `<thead>` / `<tbody>` / `<th scope="col">`；行 `↑↓` 键移动焦点。

### 2.9 `APagination`

```ts
page: number
pageSize: number
total: number
pageSizes?: number[]      // 默认 [20, 50, 100]
```

- 布局：左侧「共 N 条」+ 每页条数 `ASelect`（small），右侧上一页 / 页码 / 下一页。
- 页码按钮 `borderless`，当前页 `filled`。
- 只在 `total > pageSize` 时渲染（沿用旧行为）。

### 2.10 `ASheet`（弹窗）

```ts
open: boolean
title: string
width?: number | string      // 默认 520
closeOnOverlay?: boolean     // 默认 true
```

- 遮罩：`rgb(0 0 0 / 24%)`（深色 40%）+ `blur(2px)`。
- 面板：`--bg-elevated`、`--radius-2xl`、`--shadow-4`、`--separator` 发丝边。
- 结构：标题栏（`--text-title-2` 居中，右上角关闭图标按钮）→ 内容区（`--space-6` 内边距，超高时内部滚动）→ 底部操作栏（右对齐，取消在左、主操作在右）。
- 进出动画见 `01-design-system.md` 7.2。
- 焦点管理：打开时焦点移到第一个可聚焦元素、Tab 锁在面板内、`Esc` 关闭、关闭后焦点归还触发元素。打开时 `<body>` 加 `overflow: hidden`。
- 无障碍：`role="dialog"` `aria-modal="true"` `aria-labelledby`。

### 2.11 `AAlert`（确认框，命令式）

```ts
alert.confirm({
  title: string
  message: string
  confirmText?: string        // 默认「确定」
  cancelText?: string         // 默认「取消」
  destructive?: boolean       // 确认按钮用 destructive 变体
}): Promise<boolean>
```

- Apple 警告框样式：窄（320px）、居中、标题 `--text-title-2` 加粗居中、正文 `--text-body` 居中、按钮**上下排列**（destructive 在上、取消在下）或左右排列（两个等宽）。本项目用左右等宽，符合 macOS 习惯。
- 全部删除确认走这个组件，替代 `ElMessageBox.confirm`。用户取消时 resolve `false`（旧代码用 try/catch 捕获 reject，新接口更清晰）。

### 2.12 `AToast`（提示，命令式）

```ts
toast.success(message: string)
toast.error(message: string)
toast.warning(message: string)
toast.info(message: string)
```

- 顶部居中 HUD：`--material-menu-bg` + 模糊、`--radius-pill`、`--shadow-3`、左侧状态图标 + `--text-body` 文字。
- 从上方 8px 滑入淡入，停留 2.4s（错误 4s）后淡出。同时最多 3 条，纵向堆叠。
- 无障碍：容器 `aria-live="polite"`（错误用 `assertive`）。
- 替代全部 `ElMessage.*` 调用。

### 2.13 `ABadge`

```ts
label: string
tone?: 'neutral' | 'blue' | 'green' | 'orange' | 'red' | 'yellow' | 'indigo'
```

- 胶囊：对应系统色 14% 底 + 同色文字（深色模式 22% 底），`--text-caption`、`--radius-pill`、内边距 `2px 8px`。
- **不使用纯色底白字**，Apple 的状态标签是浅色底深色字。

### 2.14 `ASourceList`（侧栏源列表）

复刻 `EntitySidebar.vue` 的全部能力，抽成通用组件。

```ts
groups: Array<{ name: string; items: string[]; count?: number }>
selected: string
checkedItems?: string[]         // 传入即启用复选（机型页示意图勾选）
searchable?: boolean            // 默认 true
editable?: boolean              // 是否显示增删改按钮（按写权限）
sortable?: boolean              // 是否启用拖拽排序
groupLabel: string              // 「区域」/「分类」
itemLabel: string               // 「客户」/「机型」
storageKey: string              // 宽度记忆键
```

能力清单（逐条对应旧行为）：
- 顶部搜索框，输入时过滤分组和条目，且**自动展开全部匹配分组**。
- 分组可折叠，`aria-expanded`；选中项所在分组自动展开。
- 分组头部：折叠箭头、名称、条目数、悬停显示「新建条目 / 编辑 / 删除」图标按钮。
- 条目行：可选复选框、名称、悬停显示「编辑 / 删除」图标按钮。
- 拖拽排序：分组之间、分组内条目之间；仅在有写权限且无搜索关键词时启用；拖拽手柄是左侧 `grip-vertical`（仅在可排序时出现）。排序失败时回滚并提示。
- 右边缘宽度手柄：拖拽调整 220–520px，`←→` 键 ±16px（`Shift` ±40px），`Home/End` 到最小/最大，宽度存 `localStorage`。
- 空状态：有搜索词显示「没有匹配"xxx"的结果」，否则「暂无{itemLabel}，请先新建{groupLabel}」。

emits：`select`、`toggleCheck`、`createGroup`、`editGroup`、`deleteGroup`、`createItem`、`editItem`、`deleteItem`、`reorderGroups`、`reorderItems`。

### 2.15 `ASearchField`

```ts
modelValue: string
placeholder?: string
shortcut?: string            // 显示 '⌘K' / 'Ctrl K' 徽标
```

- 胶囊形（`--radius-pill`）、`--fill-2` 底、左侧放大镜、右侧清除按钮。
- `shortcut` 存在时右侧显示灰色快捷键徽标，聚焦后隐藏。
- 全局搜索用它，页面内表格筛选也用它（尺寸 small）。

### 2.16 其余组件（要点）

| 组件 | 关键点 |
| --- | --- |
| `ASwitch` | iOS 开关：51×31（`large`）/ 38×24（`medium`），滑块白圆 + `--shadow-2`，开启 `--sys-green`，`--dur-2` |
| `ACheckbox` | 16×16 圆角 4px，选中 `--sys-blue` 底 + 白勾（勾用 SVG 描边动画 `--dur-1`） |
| `AStepper` | 输入框 + 右侧上下箭头（上下各 14px 高，中间发丝线分隔），支持 `min`/`max`/`step` |
| `ADatePicker` | 触发器同 `AField`；弹层日历：周起始一、今日蓝点、选中蓝圆、区间浅蓝底；支持 `range` 模式（操作日志时间范围） |
| `ATreeSelect` | 组织架构；缩进 16px/级、折叠箭头、可选任意层级（跳级）、搜索过滤时展开命中路径 |
| `ATooltip` | `--material-menu-bg` + 模糊、`--radius-sm`、`--text-caption`、延迟 500ms 出现 / 100ms 消失、8px 偏移、自动翻转 |
| `APopover` | 定位引擎（自动翻转 + 视口贴边 + 箭头指向），供 `ASelect`/`AMenu`/`ATooltip`/`ADatePicker` 复用。**先实现这个**，其他浮层都依赖它 |
| `AMenu` | 用户菜单；项含图标 + 文字 + 可选快捷键，分隔组用 `--separator`，破坏性项红色 |
| `AEmptyState` | 居中：48px 线性图标（`--label-3`）+ `--text-body` 主文字 + 可选说明 + 可选主操作按钮 |
| `ASpinner` | Apple 风格：8 段辐条依次淡出（不是旋转圆环），尺寸 12/16/24/32 |
| `AProgressBar` | 4px 高胶囊，`--fill-2` 槽 + `--sys-blue` 条；不确定进度时用往复动画 |
| `ABanner` | 顶部通栏：状态图标 + 文字 + 可选操作按钮 + 关闭；用于后端 offline/unauthorized 提示 |
| `AFileDrop` | 虚线框（`--separator` 2px dashed、`--radius-xl`）；拖入时边框变 `--sys-blue`、底变 12% 蓝；显示允许的类型与大小上限；校验失败用 `toast.error` |
| `AImageViewer` | 复刻旧交互：滚轮缩放 0.25–5 倍（步长 0.25）、>1 倍可拖拽平移、缩小/放大/重置按钮、显示当前百分比 |
| `APdfViewer` | pdf.js；工具栏：页码跳转、上下页、缩放、适应宽度；**卸载时必须调 `destroy()`**（旧前端修过的 worker 泄漏，不能回退） |
| `AFormRow` | 表单行容器：顶部标签（`--text-control-em`）+ 必填红点 + 控件 + 错误文字（`--sys-red`、`--text-caption`）+ 帮助文字（`--label-2`） |
| `AFormGrid` | 表单两列 / 三列网格（`--space-4` 间距），窄屏降为单列 |

---

## 3. 实现顺序

有依赖关系，必须按序：

1. `tokens.css` → `reset.css` → `global.css`
2. 安装 Radix Vue / Reka UI，先接 `APopover`（定位 + 焦点），其他浮层都依赖它
3. `AButton` / `AIconButton` / `ASpinner` / `ABadge`
4. `AField` / `ATextArea` / `ASearchField` / `ACheckbox` / `ASwitch` / `AStepper`
5. `ATooltip` / `AMenu` / `ASelect` / `ATokenField`（依赖 `APopover`）
6. `AToast` / `AAlert` / `ASheet`（命令式 API + 焦点管理）
7. `ATable` / `APagination` / `AEmptyState`
8. `ASegmentedControl` / `ATabBar`
9. `ASourceList`（依赖前面全部）
10. `ADatePicker` / `ATreeSelect` / `AFileDrop` / `AImageViewer` / `APdfViewer` / `ABanner`

---

## 4. 组件库验收

每个组件交付时必须满足：

- [ ] 只用 `tokens.css` 的变量，无硬编码值
- [ ] 浅色 + 深色都验证过
- [ ] 键盘可完整操作，焦点环可见
- [ ] `prefers-reduced-motion` 下不产生位移动画
- [ ] 有 Vitest 用例覆盖：默认渲染、交互 emit、禁用态、无障碍属性
- [ ] 在 `/dev/gallery` 组件示例页里有一个展示所有状态的条目

组件示例页（`/dev/gallery`，仅开发环境路由）是自查工具，不是交付物，但能显著降低回归成本。

页面规格见 `03-pages.md`。
