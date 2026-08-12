# 机型结构行列表结构 设计

日期：2026-08-12

## 目标

机型结构中：

1. **结构类 Tab**（输送机构、手臂机构、台车工位结构等）表格对齐：

| 列 | 含义 |
|----|------|
| 功能作用 | 自由文本，必填 |
| 传感器类型 | 自由文本，必填 |
| 规格 | 自由文本，可选 |
| 作用 | 自由文本，可选 |
| 附加图片 | 可选，规则不变 |
| 备注 | 可选 |
| 操作 | 编辑 / 删除 |

2. **机型注意事项**：列名仍为 注意分类 / 事项名称 / 说明 / 备注；「注意分类」改为自由文本，去掉预置下拉。

旧行数据不迁移。

## 方案

方案 A：同一 `MachineSectionRow` 按 section `kind` 使用不同字段子集；结构用新字段，注意事项用 `role`（注意分类）+ `name` + `desc` + `note`。

## 数据

`MachineSectionRow` 改为：

| 字段 | 结构 Tab | 注意事项 |
|------|----------|----------|
| `id` | ✓ | ✓ |
| `role` | 功能作用 | 注意分类 |
| `sensorType` | 传感器类型 | （空） |
| `spec` | 规格 | （空） |
| `purpose` | 作用 | （空） |
| `name` | （空） | 事项名称 |
| `desc` | （空） | 说明 |
| `note` | 备注 | 备注 |
| `image?` | 可选 | 不允许 |

归一化：

- 忽略旧字段 `type`（及结构场景下旧 `name`/`desc` 语义）
- `allowImage === false` 时不保留 `image`
- 结构行过滤条件改为 `role` 与 `sensorType` 均非空；注意事项过滤改为 `role` 与 `name` 均非空（替代现有仅滤空 `name`）

保存校验：

- 结构：`role`、`sensorType` trim 非空
- 注意事项：`role`、`name` trim 非空
- 图片规则与失败回滚保持现有行为

## 删除预置类型

- 删除 / 停用 `machineSectionTypeOptions` 及 `CRUD_TYPE_OPTIONS` 中仅服务于机型行类型下拉的 `machine-conveyor` / `machine-arm` / `machine-platform` / `machine-notes` 键（若无其它引用）
- UI 不再出现类型 `ElSelect`；结构「功能作用」、注意事项「注意分类」均为 `ElInput`

数据字典页本就没有独立「注意分类」字典项；本变更确保不会再引入，并去掉代码内预置选项。

## 界面

- `MachineSectionTable.vue`：按 `isStructure` 切换列与表单
- 结构搜索 haystack：`role`、`sensorType`、`spec`、`purpose`、`note`
- 注意事项搜索：`role`、`name`、`desc`、`note`
- 全局搜索索引中机型行标题/副标题改用新字段

## 种子

结构相关 `CRUD_DEFAULTS['machine-*']` 与 legacy 迁入行按新字段重写；注意事项种子用自由文本 `role`。

## 回归

扩展 `pnpm run test:selection`：

- 结构行保存新字段；缺 `role`/`sensorType` → validation
- 注意事项保存自由文本 `role`；无类型白名单校验
- 归一化形状正确；旧 `type` 不保留
- 搜索索引含 `sensorType` / `spec` / `purpose`（若已有机型行搜索断言则更新）
