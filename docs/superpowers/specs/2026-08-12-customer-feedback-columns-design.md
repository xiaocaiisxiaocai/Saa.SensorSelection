# 厂外反馈问题项列结构 设计

日期：2026-08-12

## 目标

客户管理 → 厂外反馈问题项表格与表单对齐业务表头：

| 列 | 含义 |
|----|------|
| 问题分类 | 字典可选分类 |
| 适用机型 | 自由文本 |
| 问题点 | 必填说明 |
| 改善对策 | 可选措施 |
| 反馈时间 | 日期 |
| 处理状态 | 原状态字典 |
| 操作 | 编辑 / 删除 |

旧字段结构与示例数据不再保留或迁移。

## 方案

采用新字段名（方案 A），不复用 `title` / `desc` / `actions` 语义错位的旧名。

## 数据

持久化仍为 `symtek_crud_store`，列表 id 仍为 `customer-feedback`。

`TimelineItem` 改为：

| 字段 | 说明 |
|------|------|
| `id` | 正整数 |
| `type` | 问题分类，来自字典 `customer-feedback` |
| `machine` | 适用机型，自由文本，可空 |
| `problem` | 问题点，必填 |
| `measure` | 改善对策，可空 |
| `date` | 反馈时间，`YYYY-MM-DD`，可空；新增默认今天 |
| `status` | 处理状态，来自字典 `customer-feedback-status` |

归一化：只读新字段；缺省给空串；`type` / `status` 空时回落到各自字典首项；忽略旧字段 `title` / `desc` / `actions`。不把旧本地反馈记录映射进新语义。

保存校验：

- `problem` trim 后非空
- `type` 必须落在当前 `customer-feedback` 字典名
- `status` 必须落在当前 `customer-feedback-status` 字典名
- 存储失败回滚并提示（沿用现有 reason：`validation` / `storage` / `stale`）

## 字典

`customer-feedback` 默认项（可在字典管理增删改）：

1. 感应器异常  
2. 测板厚异常  
3. 智能化异常  
4. 选型配置异常  
5. 客户要求  
6. 料件损坏  
7. 厂外改善  
8. 其他  

`customer-feedback-status` 不变：待处理、处理中、已解决。界面文案由「状态」改为「处理状态」。

字典改名仍级联更新已有反馈的 `type` / `status`（沿用现有行为）。

## 界面

- `TimelinePanel.vue`：表格列与新增/编辑弹窗字段与上表一致
- 适用机型：单行输入
- 问题点、改善对策：多行输入（问题点必填）
- 反馈时间：日期选择器
- 搜索框 haystack：`type`、`machine`、`problem`、`measure`、`date`、`status`
- 占位与校验提示文案同步更新

## 种子数据

`customer-feedback` 默认示例按新字段重写（或清空后写 1～2 条符合新分类的样例），不再出现「电料选型或配置问题」等旧分类名。

## 回归

扩展 `pnpm run test:selection`：

- 默认问题分类为上述 8 项，首项为「感应器异常」
- 保存反馈要求 `problem` + 合法 `type` / `status`；`machine` / `measure` 可空
- 归一化输出仅含新字段形状
- 字典改名仍级联到反馈 `type` / `status`
