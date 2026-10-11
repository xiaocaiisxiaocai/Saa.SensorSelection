# 02 · 组件用法：直接使用 ant-design-vue

业务页直接使用 ant-design-vue 的 `a-*` 组件（`main.ts` 里 `app.use(Antd)` 全局注册），
不再有 `A*` 包装组件库。`src/ui/` 只保留 antd 没有对应组件的两个：

| 组件 | 用途 |
| --- | --- |
| `APdfViewer` | 基于 pdf.js 的连续页 PDF 预览（缩放、适应宽度） |
| `AHighlightText` | 搜索结果里高亮关键词 |

## 常用写法对照

| 场景 | 写法 |
| --- | --- |
| 主按钮 / 普通 / 文字 / 危险 | `a-button type="primary"` / 默认 / `type="text"` / `danger` |
| 图标按钮 | `a-tooltip` 包 `a-button type="text" size="small" aria-label="…"`，图标放 `#icon` 插槽（Lucide） |
| 输入 / 密码 / 多行 / 数字 | `a-input allow-clear`、`a-input-password`、`a-textarea show-count`、`a-input-number` |
| 单选 / 多选下拉 | `a-select`、`a-select mode="multiple" :max-tag-count="1"` |
| 搜索框 | `a-input allow-clear`，`#prefix` 放 Lucide `Search` |
| 日期 / 日期范围 | `a-date-picker` / `a-range-picker`，都用 `value-format="YYYY-MM-DD"` |
| 树形下拉 | `a-tree-select`（数据用 `{ title, value, key, children }`） |
| 表格 | `a-table` + `#bodyCell`；列定义用 antd 的 `TableColumnType` |
| 分页 | 表格内置分页，或页面自行分页时用独立的 `a-pagination` |
| 弹窗 | `a-modal destroy-on-close`，自定义 `#footer` |
| 确认框 | `pages/shared/confirm.ts` 的 `dialogs.confirm()`（`Modal.confirm` 的 Promise 版） |
| 轻提示 | `import { message } from 'ant-design-vue'` |
| 分类切换 | `a-tabs`（标签上的计数用 `a-badge` + `TAB_COUNT_STYLE`）；同一视图内的小切换用 `a-segmented` |
| 状态 | `a-tag`（预设色，见 `01-design-system.md`） |
| 空状态 | `a-empty` |
| 上传 | `a-upload-dragger :before-upload :show-upload-list="false"`，校验与合批用 `createFilePicker` |
| 图片 | `a-image` / `a-image-preview-group`（自带点击放大） |
| 下拉菜单 | `a-dropdown` + `a-menu` |
| 目录树 | `pages/selection/EntityTree.vue`（基于 `a-tree`：勾选、拖拽排序、行内「更多」菜单） |

## 共享工具（`src/pages/shared/`）

| 模块 | 内容 |
| --- | --- |
| `table.ts` | `sortBy` / `sortRows` / `sortOrderOf` / `sortFromChange`（受控排序）、`rowClick`（整行点击，忽略行内按钮）、`scrollX`（各列宽度之和）、`cellText`（空值显示「—」）、`PAGE_SIZE_OPTIONS`（20/50/100） |
| `form.ts` | `fieldError(message)`：`<a-form-item v-bind="fieldError(err)">` |
| `confirm.ts` | `dialogs.confirm()` |
| `dirty-guard.ts` | 弹窗未保存确认：`@cancel="cancelDialog"`，`cancelDialog` 里先 `await dirtyGuard.confirmClose()` |
| `file-rules.ts` | 文件类型/大小规则、`combineFileRules`、`createFilePicker` |
| `save-feedback.ts` | `notifyResult`（按领域层结果提示成功/失败）、`confirmDelete` |
| `tabs.ts` | `TAB_COUNT_STYLE`（标签计数的中性徽标样式） |

## 表单约定

- 业务校验在领域层完成，**不要用 antd 的表单校验**：`a-form` 不传 `:model`，`a-form-item` 不写 `name`
  （有 `name` + `required` 时 antd 会自动注册必填规则并弹出自己的文案）。
- 标签关联：`a-form-item html-for="页面-字段"`，内部控件写同名 `id`。
- 错误展示：`v-bind="fieldError(validationAttempted && !form.name.trim() ? '请输入名称' : undefined)"`。

## 测试

- `src/test-setup.ts` 全局注册 Antd，并向 `lib/` 构建的 `configProviderKey` 注入配置
  （vitest 用 Node 加载的是 CJS 的 `lib/`，从 `es/` 取键会对不上）。
- `src/test-helpers.ts` 封装了操作 antd 组件的常用写法：`findSelect` / `chooseSelect`、`clickTab`、
  `columnWidths`、`treeNodes` / `toggleTreeCheck` / `runTreeAction`、`chooseSegment`、`tagColor` 等。
