# 01 · 设计系统：ant-design-vue

界面完全采用 ant-design-vue 4 的设计语言（Ant Design 5 视觉规范，紧凑尺寸），**不再遵循 Apple 规范**。
主题、组件外观与交互都以 antd 为准，项目只补充 antd 没有覆盖的少量布局。

## 原则

1. **能用 antd 组件表达的，就直接用 `a-*`。** 不另写同功能的自定义组件，也不用 CSS 改造 antd 组件的外观。
2. **紧凑主题。** `App.vue` 的 `a-config-provider` 设置 `zh_CN`、`auto-insert-space-in-button=false` 与 `:theme="appTheme"`（`src/styles/theme.ts`）。
   `compactAppAlgorithm` 在 antd `compactAlgorithm` 基础上把字号/行高还原为默认主题（正文 14px，compact 原本会降到 12px），
   并把 `controlHeightSM` 保持 24px（最小热区）。`main.ts` 的 `ConfigProvider.config` 给 `Modal.confirm` 等静态 API 套同一主题。
   不要在页面上再单独传 `size="small"` 之类去叠加压缩。
3. **只有浅色模式。** 不提供主题切换。
4. **系统字体。** 使用 antd 默认字体栈，不额外加载 Web 字体。

## 设计令牌（`src/styles/tokens.css`）

`tokens.css` 是唯一允许写字面量颜色、字号、时长的地方（stylelint 强制）。令牌的颜色/字号/圆角/动效**与 antd 默认主题一致**，控件高度与紧凑主题一致，
命名对应 antd 的 token 名：

| 类别 | CSS 变量 | 对应 antd token |
| --- | --- | --- |
| 品牌/功能色 | `--color-primary`、`--color-success`、`--color-warning`、`--color-error`、`--color-info` 及 `-bg` / `-hover` | `colorPrimary`… |
| 文本 | `--color-text`、`--color-text-secondary`、`--color-text-tertiary`、`--color-text-quaternary` | `colorText`… |
| 边框 | `--color-border`、`--color-border-secondary`、`--color-split` | `colorBorder`… |
| 填充/背景 | `--color-fill*`、`--color-bg-layout`、`--color-bg-container`、`--color-bg-elevated`、`--color-bg-mask` | `colorFill`… |
| 字体 | `--font-family`、`--font-body`（14/22）、`--font-sm`（12/20）、`--font-lg`、`--font-heading-3/4/5` | `fontFamily`、`fontSize`… |
| 圆角 | `--radius-xs/sm/md/lg`（2/4/6/8） | `borderRadiusXS…LG` |
| 控件高度 | `--control-height-sm`、`--control-height`、`--control-height-lg`（24/28/36，紧凑主题） | `controlHeight*` |
| 动效 | `--motion-duration-fast/mid/slow`、`--motion-ease-out`、`--motion-ease-in-out` | `motionDuration*`… |
| 阴影 | `--box-shadow`、`--box-shadow-tertiary` | `boxShadow*` |
| 间距 | `--space-1`…`--space-9`（2/4/8/12/16/20/24/32/40） | 与 `padding*` / `margin*` 档位对齐 |

`src/styles/tokens.test.ts` 用 `theme.defaultAlgorithm(theme.defaultSeed)` 与 `compactAppAlgorithm` 逐项比对这些取值，
升级 antd 或改令牌时如果偏离主题会直接失败。

## 布局

- 外壳：`a-layout` + 暗色 `a-layout-sider`（宽屏常驻、不可折叠，菜单项不带图标，分组标题 14px 加粗、白色实色（只有分组标题加粗）且仅多分组时显示、与品牌左对齐，组内菜单项缩进 16px；960px 以下改为 `a-drawer`）+ 48px `a-layout-header` + `a-layout-content`（内边距 12px）。
- 业务页：白底圆角卡片 `.selection-page`（内边距 16px）；左侧目录树 + 右侧内容的页面用 `.selection-split`；
  表格/列表占满剩余高度：表头固定、表体在内部滚动，分页条始终显示（单页也显示）并固定在卡片最下面（见 `pages/shared/selection-page.css`）。
- 表头不换行：列宽至少容得下标题文字 + 排序图标 + 左右 16px 内边距（两个汉字的可排序列 ≥ 88px）。
- 弹窗表单：`a-modal` + `a-form layout="vertical"`，多列用 `a-row` / `a-col`（`:span="12"` 两列，`8` 三列，`24` 整行）。

## 状态色

状态用 `a-tag` 的预设色表达，不自定义色值：

| 含义 | 预设色 |
| --- | --- |
| 现用 / 成功 / 已解决 / 启用 | `green` |
| 备选 | `gold` |
| 处理中 / 测试中 | `orange` |
| 停用 / 失败 | `red` |
| 其他 / 中性 | `default` |

Sensor 类型前的圆点用 `a-badge` 的预设色（`cyan`、`geekblue`、`purple`、`magenta`、`gold`），按类型名稳定映射。

## 无障碍

- 表单项用 `a-form-item html-for="x"` + 控件 `id="x"` 关联标签（不要依赖 `name`，见 `02-component-library.md`）。
- 图标按钮必须有 `aria-label`，并用 `a-tooltip` 给出同样的文字。
- 被禁用的操作保留按钮、设为 `disabled`，原因写在 `a-tooltip` 里。
- 内容完整显示，不截断：长文本折行（`overflow-wrap: anywhere`），不用 `text-overflow` / `line-clamp` / `a-typography` 的 `ellipsis`；
  表单多选不设 `max-tag-count`（工具栏筛选框除外）。表格要紧凑就重新分配列宽：内容短的列窄、长描述列宽，减少折行。
