# 客户通用要求项列结构 设计

日期：2026-08-12

## 目标

客户管理 → 客户通用要求项表格与表单对齐业务表头：

| 列 | 含义 |
|----|------|
| 要求分类 | 字典可选分类（保持现有默认） |
| 适用机型 | 自由文本（可填 `ALL`） |
| 适用制程 | 自由文本 |
| 要求内容 | 必填说明 |
| 来源 | 字典可选来源 |
| 备注 | 可选备注 |
| 操作 | 编辑 / 删除 |

旧 `CrudItem` 字段（`name` / `desc`）不再用于本列表；历史本地数据不迁移。

## 方案

采用独立类型 + 专用面板（方案 A），与厂外反馈 `TimelinePanel` 同模式。`customer-proc`（制程注意事项）继续使用现有 `CrudTable` / `CrudItem`，不受影响。

## 数据

持久化仍为 `symtek_crud_store`，列表 id 仍为 `customer-req`。

新增 `CustomerReqItem`：

| 字段 | 说明 |
|------|------|
| `id` | 正整数 |
| `type` | 要求分类，字典 `customer-req` |
| `machine` | 适用机型，自由文本，可空 |
| `process` | 适用制程，自由文本，可空 |
| `content` | 要求内容，必填 |
| `source` | 来源，字典 `customer-req-source` |
| `note` | 备注，可空 |

归一化：只读新字段；缺省给空串；`type` / `source` 空时回落到各自字典首项；忽略旧字段 `name` / `desc`。

保存校验：

- `content` trim 后非空
- `type` 落在 `customer-req` 字典名
- `source` 落在 `customer-req-source` 字典名
- 存储失败回滚并提示（`validation` / `storage` / `stale`）

## 字典

`customer-req`（要求分类）默认不变：

输送段、掉板检测、真空吸附、位置确认、AOI段、特殊要求

新增 `customer-req-source`（来源），默认：

1. 验收规范  
2. 厂外改善  
3. 客户要求  
4. 产品更新迭代  
5. 其他  

配置：`field: 'source'`，`listIds: ['customer-req']`，改名级联更新已有要求的 `source`（沿用现有字典级联机制）。数据字典页自动出现该项。

## 界面

- 新建 `CustomerReqPanel.vue`（或同等命名），在 `EntityWorkspace`「客户通用要求」Tab 替换 `CrudTable`
- 表格列顺序与上表一致；弹窗字段一致
- 适用机型 / 适用制程 / 备注：单行输入；要求内容：多行必填
- 搜索 haystack：`type`、`machine`、`process`、`content`、`source`、`note`

## 种子数据

`customer-req` 默认示例按新字段重写 2～4 条（分类取现有类，来源取新字典，机型示例可含 `ALL`）。

## 回归

扩展 `pnpm run test:selection`：

- 来源字典默认 5 项，首项「验收规范」
- 保存要求 `content` + 合法 `type` / `source`；`machine` / `process` / `note` 可空
- 归一化输出仅为新字段形状
- 来源字典改名级联到 `source`
- `customer-proc` 仍为旧 `CrudItem` 形状且可读写
