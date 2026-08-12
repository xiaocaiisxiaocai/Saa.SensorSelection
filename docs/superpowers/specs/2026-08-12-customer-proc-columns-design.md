# 制程注意事项列结构 设计

日期：2026-08-12

## 目标

客户管理 → 制程注意事项表格与表单对齐业务表头：

| 列 | 含义 |
|----|------|
| 制程分类 | 字典可选分类（保持现有默认） |
| 制程作用 | 必填 |
| 制程特性 | 必填 |
| sensor使用注意事项 | 可选 |
| 备注 | 可选 |
| 操作 | 编辑 / 删除 |

旧 `CrudItem` 字段（`name` / `desc`）不再用于本列表；历史本地数据不迁移。

## 方案

采用独立类型 + 专用面板（方案 A），与 `CustomerReqPanel` / `TimelinePanel` 同模式。

## 数据

持久化仍为 `symtek_crud_store`，列表 id 仍为 `customer-proc`。

新增 `CustomerProcItem`：

| 字段 | 说明 |
|------|------|
| `id` | 正整数 |
| `type` | 制程分类，字典 `customer-proc` |
| `role` | 制程作用，必填 |
| `feature` | 制程特性，必填 |
| `sensorNote` | sensor使用注意事项，可空 |
| `note` | 备注，可空 |

归一化：只读新字段；缺省给空串；`type` 空时回落到字典首项；忽略旧字段 `name` / `desc`。

保存校验：

- `role`、`feature` trim 后均非空
- `type` 落在 `customer-proc` 字典名
- 存储失败回滚并提示（`validation` / `storage` / `stale`）

## 字典

`customer-proc` 默认不变：DES 制程、AOI 制程、压合制程、防焊制程、通用。改名仍级联更新 `type`。

## 界面

- 新建 `CustomerProcPanel.vue`，在 `EntityWorkspace`「制程注意事项」Tab 替换 `CrudTable`
- 若 `CrudTable` 无其它引用则删除相关死代码（含仅服务旧 `customer-proc` 的列标签）
- 搜索 haystack：`type`、`role`、`feature`、`sensorNote`、`note`
- 校验失败文案：`请填写制程作用、制程特性并选择有效分类`

## 种子数据

按新字段重写 2～4 条示例（分类取现有制程类）。

## 回归

扩展 `pnpm run test:selection`：

- 保存要求 `role` + `feature` + 合法 `type`；`sensorNote` / `note` 可空
- 缺 `role` 或缺 `feature` → `validation`
- 归一化输出仅为新字段形状
- 字典改名仍级联到 `type`
