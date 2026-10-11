# 01 · 设计系统：ant-design-vue

界面完全采用 ant-design-vue 4 的默认设计语言（Ant Design 5 视觉规范），**不再遵循 Apple 规范**。
主题、组件外观与交互都以 antd 为准，项目只补充 antd 没有覆盖的少量布局。

## 原则

1. **能用 antd 组件表达的，就直接用 `a-*`。** 不另写同功能的自定义组件，也不用 CSS 改造 antd 组件的外观。
2. **主题就是 antd 默认主题。** `App.vue` 的 `a-config-provider` 只设置 `zh_CN` 语言和 `auto-insert-space-in-button=false`，不传 `:theme`。
3. **只有浅色模式。** 不提供主题切换。
4. **系统字体。** 使用 antd 默认字体栈，不额外加载 Web 字体。

## 设计令牌（`src/styles/tokens.css`）

`tokens.css` 是唯一允许写字面量颜色、字号、时长的地方（stylelint 强制）。令牌**取值与 antd 默认主题一致**，
命名对应 antd 的 token 名：

| 类别 | CSS 变量 | 对应 antd token |
| --- | --- | --- |
| 品牌/功能色 | `--color-primary`、`--color-success`、`--color-warning`、`--color-error`、`--color-info` 及 `-bg` / `-hover` | `colorPrimary`… |
| 文本 | `--color-text`、`--color-text-secondary`、`--color-text-tertiary`、`--color-text-quaternary` | `colorText`… |
| 边框 | `--color-border`、`--color-border-secondary`、`--color-split` | `colorBorder`… |
| 填充/背景 | `--color-fill*`、`--color-bg-layout`、`--color-bg-container`、`--color-bg-elevated`、`--color-bg-mask` | `colorFill`… |
| 字体 | `--font-family`、`--font-body`（14/22）、`--font-sm`（12/20）、`--font-lg`、`--font-heading-3/4/5` | `fontFamily`、`fontSize`… |
| 圆角 | `--radius-xs/sm/md/lg`（2/4/6/8） | `borderRadiusXS…LG` |
| 控件高度 | `--control-height-sm`、`--control-height`、`--control-height-lg`（24/32/40） | `controlHeight*` |
| 动效 | `--motion-duration-fast/mid/slow`、`--motion-ease-out`、`--motion-ease-in-out` | `motionDuration*`… |
| 阴影 | `--box-shadow`、`--box-shadow-tertiary` | `boxShadow*` |
| 间距 | `--space-1`…`--space-9`（2/4/8/12/16/20/24/32/40） | 与 `padding*` / `margin*` 档位对齐 |

`src/styles/tokens.test.ts` 用 `theme.defaultAlgorithm(theme.defaultSeed)` 逐项比对这些取值，
升级 antd 或改令牌时如果偏离默认主题会直接失败。

## 布局

- 外壳：`a-layout` + 暗色 `a-layout-sider`（可折叠，960px 以下改为 `a-drawer`）+ `a-layout-header` + `a-layout-content`。
- 业务页：白底圆角卡片 `.selection-page`；左侧目录树 + 右侧内容的页面用 `.selection-split`；
  表格占满剩余高度并在内部滚动，筛选栏与分页始终可见（见 `pages/shared/selection-page.css`）。
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
- 长文本截断用 CSS（`text-overflow: ellipsis` + `title`），不要用 `a-typography` 的 `ellipsis`：后者会把 DOM 里的文字截短，读屏和页内查找拿不到完整内容。
