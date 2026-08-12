# 机型结构 Tab 与附加图片设计

日期：2026-08-11

## 目标

机型结构右侧改为可维护的 Section（Tab）模型：

- 全局 Tab 在数据字典维护；机型页只能**额外新增**本机 Tab，不能隐藏全局 Tab
- 「机型注意事项」为固定 notes Tab：不可删、无附加图片列
- 其余 structure Tab 的每一行预留并支持最多 1 张附加图片（jpg/png/webp，缩略图 + 预览）
- 采用独立 `MachineWorkspace` 与清晰的 section + row 模型（方案 B），不再硬编码 `machine-conveyor` 等 Tab

不改动客户管理、制程管理。

## 方案

新建机型详情工作区（方案 B），与现有客户 `EntityWorkspace` 分支解耦。

## 数据

持久化仍使用 `symtek_crud_store`。

### 全局 Section（数据字典）

- 字典 code：`machine-section`
- 项字段：`id`、`name`、`sort`、`kind`（`structure` | `notes`）
- 默认种子：
  - 输送机构 / 手臂机构 / 台车工位结构（`structure`）
  - 机型注意事项（`notes`，锁定：不可删除；`kind` 不可改为 `structure`）

### 机型额外 Section

- 键：`machine-extra-sections:{机型名}`
- 项字段：`id`、`name`、`sort`、`kind`（仅允许 `structure`）
- 展示顺序：全局 sections（按 sort）→ 本机额外 sections（按 sort）

### 行数据

- 键：`machine-section-rows:{sectionId}:{机型名}`
- 字段：`id`、`type`、`name`、`desc`、`note`
- `image?`（仅 structure）：`{ dataUrl, fileName, mimeType, size }`，每行最多 1 张
- notes section 行不持久化 / 不展示 `image`
- 行「类型」下拉：四个默认全局 section 沿用原 `CRUD_TYPE_OPTIONS`（conveyor/arm/platform/notes）；新建全局或本机 structure section 默认 `['其他']`，后续如需可再挂字典

### 迁移

首次读取某机型时，若新行键为空且存在旧键，则映射：

| 旧 listId | 目标全局 section（按默认名/稳定 seed id） |
|-----------|------------------------------------------|
| `machine-conveyor` | 输送机构 |
| `machine-arm` | 手臂机构 |
| `machine-platform` | 台车工位结构 |
| `machine-notes` | 机型注意事项 |

迁入后新读写走新键；旧键保留只读或标记已迁移，避免丢数据。

### 联动规则

- 机型改名：迁移 `machine-extra-sections` 与全部 `machine-section-rows:*:{旧名}`
- 删机型：各 section 行与本机额外 Tab 均须为空（扩展现有 `entityHasData`）
- 删本机 Tab / 删全局 structure Tab：对应 scope 下行数据为空才可删
- 全局 Tab 改名：只改标题，`sectionId` 不变，行数据不丢
- 图片与行数据一并归一化存储；写入失败回滚内存修改并提示；禁止把存储内容直接拼进 HTML

## 界面

### 机型结构页 → `MachineWorkspace`

- 左侧：沿用现有机型树（分类 / 机型 CRUD）
- 右侧 Tab = 全局 + 本机额外
- 「+ 本机 Tab」：仅新增本机 structure Tab；本机 Tab 可改名、删除（删前行数据须空）
- 全局 Tab：机型页不可删、不可改名（改在数据字典）
- structure 表列：类型、名称、说明、**附加图片**、备注、操作  
  编辑弹窗支持上传 / 替换 / 清除 1 张图；表内缩略图，点击预览
- notes 表列：注意分类、事项名称、说明、备注、操作（无图片）
- 图片格式 jpg/png/webp；建议单张上限约 2MB；本地 dataUrl

### 数据字典

- 侧栏新增「机型结构 Tab」
- 维护全局 section：名称、排序、类型、操作
- notes 行不可删；类型不可改为 structure
- 删全局 structure：任意机型在该 section 下仍有行 → 拒绝并提示先清空

### 路由 / 搜索

- `/selection/machine` 不变；query 可选 `section` 定位 Tab
- 全局搜索命中机型配置行时，跳到对应机型 + section

## 验收

1. 字典可增改全局 structure Tab，排序生效；notes 不可删
2. 所有机型立刻看到新全局 Tab；机型页可加本机 Tab，不影响其它机型
3. structure 行可上传 / 预览 / 替换 / 清除 1 张图；notes 无图片列
4. 旧 `machine-*` 配置数据迁移后仍可见
5. `pnpm run test:selection`、`check:type`、`lint` 通过

## 非目标

- 不支持对本机隐藏全局 Tab
- 不支持每行多图
- 不改客户 / 制程模块
