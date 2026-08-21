# 07 · 领域层规格（TypeScript 重写对照）

状态：**Phase 6 已完成。** 实现按本节逐条等价重写；禁止把旧 JS 复制进 `frontend/src/`。

合同护栏：`frontend/src/domain/*.test.ts`、`scripts/selection-contract-test.cjs`。

目标：新代码与旧行为**逐条等价**，只换语言和模块切分，不改业务规则。

---

## 1. 文件切分（新目录）

```
src/domain/
├─ types.ts                 实体、SaveFailure、SaveResult、StorageLike
├─ keys.ts                  STORAGE_KEY、keyFor、各存储键构造函数
├─ normalize.ts             全部 normalize* / parsePersistedStore / 校验纯函数
├─ seed.ts                  种子数据与 SEED_VERSION（从 data.js 迁成 TS）
├─ repository.ts            createSelectionRepository
├─ search.ts                buildSearchIndex
├─ storage.ts               BackendStorage
└─ schematic-report.ts      机型示意图报告
```

对外入口保持：

```ts
createSelectionRepository({ crudDefaults, sensorData, storage?: StorageLike })
```

`StorageLike.setItem` 可以返回 `void`（localStorage）或 `false`（桥接层拒绝）。`persist()` 必须把 `false` 和抛错都当成失败并回滚内存。

```ts
interface StorageLike {
  getItem(key: string): null | string;
  setItem(key: string, value: string): boolean | void;
}
```

构造仓库时：`storage?.getItem?.(STORAGE_KEY)` 抛错 → 内存 store 为空对象（`Object.create(null)`）。

---

## 2. 已锁定的不变量

这些在 `04-data-api.md` 也有，重写时一条都不能丢。

1. `STORAGE_KEY = 'symtek_crud_store'`。解析时跳过 `__proto__` / `prototype` / `constructor`，只收值为数组的 key。
2. `persist()`：`setItem` 返回 `false` 或抛错 → 内存回到 snapshot，操作返回 `{ ok: false, reason: 'storage' }`。
3. 在线成功写入后必须 `snapshotLocal()`。
4. 机型结构行以 `sensorIds` 为准；`sensorType` / `spec` 只做旧数据兼容。
5. `SEED_VERSION` 落后时只补缺失 key，不覆盖用户数据。
6. ID 分配：正整数、跳过已占用、损坏/重复 id 重分配。
7. 文本字段经 `storedText`：只接受 boolean / number / string，其余变 `''`。
8. 名称比较用 `toLocaleLowerCase('zh-CN')`（去重、排序、查重）。
9. 受控文档：PDF 与 Word 各 8 MB；机型示意图：jpg/png/webp、2 MB、每结构最多 2 张。
10. 旧 key 只读迁移、不再写入：见 §4。

失败原因枚举（与旧类型一致）：

```ts
type SaveFailure =
  | 'duplicate' | 'in-use' | 'not-empty'
  | 'size' | 'stale' | 'storage' | 'type' | 'validation'

type SaveResult<T> = { item: T; ok: true } | { ok: false; reason: SaveFailure }
type DeleteResult = { ok: true } | { ok: false; reason: Exclude<SaveFailure, 'duplicate'> }
type ReorderResult = { ok: true } | { ok: false; reason: 'stale' | 'storage' | 'validation' }
```

通用规则（所有写方法）：

- 先校验，再 `snapshot = cloneStore(store)`，再改内存，再 `persist(snapshot)`。
- `cloneStore` = `parsePersistedStore(JSON.stringify(store))`（深拷贝且走同一套安全解析）。
- `persist` 把**当前**内存 store 整包 `JSON.stringify` 写到 `STORAGE_KEY`。失败则 `store = snapshot`。
- 写成功形状一律 `{ ok: true, item }`；删/排序成功 `{ ok: true }`。
- 未单独列出的 `reason` 表示该方法**不会**返回该值。

---

## 3. 类型（`types.ts`）

字段名、空值约定必须与旧 `data.d.ts` / `domain.d.ts` 一致。

| 类型 | 字段 |
| --- | --- |
| `EntityKind` | `'customer' \| 'machine'` |
| `EntityGroup` | `name`, `items: string[]` |
| `EntityTreeItem` | `category`, `name` |
| `CrudItem` | `id`, `type`, `name`, `desc`, `note` |
| `CustomerReqItem` | `id`, `type`, `machine`, `process`, `content`, `source`, `note` |
| `CustomerProcItem` | `id`, `type`, `role`, `feature`, `sensorNote`, `note` |
| `TimelineItem`（厂外反馈） | `id`, `type`, `machine`, `problem`, `measure`, `date`, `status` |
| `DictionaryItem` | `id`, `name`, `sort` |
| `ProcessStepItem` | `id`, `layer`, `name`, `role`, `feature`, `note` |
| `SensorItem` | `id`, `status`, `partNumber`, `sensorType`, `brand`, `model`, `spec`, `feature`, `scene`, `sopId: number \| null`, `replacesId: number \| null`, `replacedById: number \| null`, `problemNote`, `replacedAt` |
| `SensorSopItem` | `id`, `title`, `dataUrl`, `fileName`, `mimeType`, `size`, `uploadedAt` |
| `SensorTypeDefinition` | `desc`, `notes`, `scenes: string[]`, `models: { brand, model, spec }[]` |
| `ControlledFileAttachment` | `dataUrl`, `fileName`, `mimeType`, `size`, `uploadedAt` |
| `ControlledFileItem` | 上表 + `id`, `kind: 'pdf' \| 'word'` |
| `MachineSectionKind` | `'notes' \| 'structure'` |
| `MachineSectionItem` | `id`, `name`, `sort`, `kind`, `locked?`, `scope: 'global' \| 'machine'` |
| `MachineRowImage` | `dataUrl`, `fileName`, `mimeType`, `size` |
| `MachineSectionRow` | `id`, `role`, `sensorIds: number[]`, `sensorType`, `spec`, `purpose`, `name`, `desc`, `note`, `image?` |
| `SearchItem` | `type: 'customer' \| 'machine' \| 'process' \| 'sensor'`, `title`, `category`, `sub`, `path`, `query: Record<string, string>` |
| `DictionaryDefinition` | `code`, `title`, `description`, `listIds`, `defaults: string[]`, `field?`, `catalog?` |
| `EntityKindDefinition` | `kind`, `label`, `groupLabel`, `listIds`, `hasControlledFiles`, `seedGroups` |

`sopId` / `replacesId` / `replacedById` 非法或缺失时为 `null`，不是 `0`。

---

## 4. 存储键（`keys.ts`）

`keyFor(listId, entityName)` → `` `${listId}:${entityName}` ``。

| 业务 key | 构造 | 内容 |
| --- | --- | --- |
| `entity-groups:customer` / `entity-groups:machine` | `keyFor('entity-groups', kind)` | 分组与条目顺序 |
| `customer-req:{客户名}` | `keyFor('customer-req', name)` | 客户通用要求 |
| `customer-proc:{客户名}` | | 制程注意事项 |
| `customer-feedback:{客户名}` | | 厂外反馈 |
| `customer-sop:{客户名}` | `keyFor('customer-sop', name)` | 受控文档。**活键是 `customer-sop:`，不是 `04-data-api.md` 写的 `controlled-docs:`**（文档漂移，实现跟旧代码） |
| `dict:{code}` | `keyFor('dict', code)` | 9 类数据字典 |
| `process-steps:all` | | 工艺制程 |
| `sensor-catalog:all` | | Sensor 型号目录 |
| `sensor-sop:all` | | Sensor SOP |
| `machine-global-sections:all` | | 全局结构 Tab |
| `machine-extra-sections:{机型名}` | | 本机附加 Tab |
| `machine-section-rows:{sectionId}:{机型名}` | 专用函数，**不用** `keyFor` | 结构/注意事项行 |
| `machine-section-images:{sectionId}:{机型名}` | 专用函数 | 结构示意图（最多 2 张） |
| `general-structure-labels:all` | | `{ id, name }[]`，覆盖通用结构显示名 |
| `meta:seed-version` | | `[{ version: number }]` |

只读迁移、读取后不再写入：

| 旧 key | 新 key |
| --- | --- |
| `machine-conveyor:{机型}` | `machine-section-rows:1:{机型}` |
| `machine-arm:{机型}` | `machine-section-rows:2:{机型}` |
| `machine-platform:{机型}` | `machine-section-rows:3:{机型}` |
| `machine-notes:{机型}` | `machine-section-rows:4:{机型}` |
| `dict-feedback-type:all` | `dict:customer-feedback` |

`MACHINE_SECTION_LEGACY_MAP`：`machine-conveyor→1`、`machine-arm→2`、`machine-platform→3`、`machine-notes→4`。

Token 键 `symtek_token` 不属于领域 store。

---

## 5. 内部工具

### `emptyStore()`

`Object.create(null)`。解析结果的原型必须是 `null`。

### `storedText(value)`

`typeof` 为 `'boolean' | 'number' | 'string'` → `String(value)`；否则 `''`。`null` / `undefined` / 对象 / 数组都变 `''`。

### `nextAvailableId(items)`

从 `1` 起找不在 `items.id` 集合里的最小正整数。

### `sameLocaleName(left, right)`

两边都 `storedText().trim().toLocaleLowerCase('zh-CN')` 后相等。

### `omitStoreKeys(store, keys)`

新空 store，拷贝除 `keys` 以外的条目。

### `fileExtension(fileName)`

最后一个 `.` 之后（含点）小写；无点则 `''`。

---

## 6. 纯函数（仓库外，必须导出）

每个函数：入参校验、成功形状、失败。归一化函数不抛、不写 storage。

### 6.1 `parsePersistedStore(raw)`

**校验**

- `raw` 假值（`null` / `''` / `undefined`）→ 空 store。
- `JSON.parse` 抛错 → 空 store。
- 解析结果不是普通对象，或是数组 → 空 store。

**成功**

- 新 `emptyStore()`。
- 跳过 key 为 `__proto__` / `prototype` / `constructor` 的项。
- 跳过值不是数组的项。
- 其余 key 原样放入（数组内容本函数不归一化）。

**失败**：无（永远返回 store 对象）。

### 6.2 ID 重分配（所有 `normalize*` 共用）

对每个对象项：

1. 跳过假值、非对象、数组。
2. `id = Number(item.id)`。若不是安全整数、`<= 0`、或已占用：从 `nextId`（初值 1）起跳过已占用，赋新 id。
3. 占用该 id；`nextId = max(nextId, id + 1)`。

### 6.3 `normalizeCrudItems(listId, sourceItems)`

非数组 `sourceItems` 当 `[]`。

**`customer-feedback`**

- `status`：`pending→待处理`，`processing→处理中`，`resolved→已解决`；否则 trim 后原文；空则字典 `customer-feedback-status` 第一项名，再退回 `'待处理'`。
- `type`：trim 后空则字典 `customer-feedback` 第一项名，再 `''`。
- 字段：`id, type, machine, problem, measure, date, status`（均 `storedText`，status/type 按上）。

**`customer-req`**

- `type` 空 → 字典 `customer-req` 第一项；`source` 空 → 字典 `customer-req-source` 第一项。
- 字段：`id, type, machine, process, content, source, note`。

**`customer-proc`**

- `type` 空 → 字典 `customer-proc` 第一项。
- 字段：`id, type, role, feature, sensorNote, note`。

**其他 `listId`**

- 字段：`id, type, name, desc, note`（全 `storedText`，不做 trim）。

**成功**：数组。无 `reason`。

合同例子：`listId='process-feat'`、`id: -1`、`type: 7`、`desc: null`、`note: {}` → 两个正 id、不重复、`type === '7'`、`note === ''`。

### 6.4 `normalizeSensorItems(source, allowedTypes=[], allowedStatuses=[])`

- `status`：trim 后若在 `allowedStatuses` 中则保留，否则 `allowedStatuses[0] || '现用'`。
- `sensorType`：trim 后若在 `allowedTypes` 中则保留，否则 `allowedTypes[0] || ''`。
- `partNumber`：`storedText().trim()`。
- `sopId` / `replacesId` / `replacedById`：安全正整数否则 `null`。
- `problemNote` / `replacedAt`：trim。
- 其余文本字段 `storedText`（`brand/model/spec/feature/scene` 不 trim，与旧实现一致）。

### 6.5 `createSensorCatalogDefaults(sensorData)`

按 `Object.entries` 顺序展开。每个类型下 `models[0]` 状态 `'现用'`，其余 `'备选'`。`id` 从 1 递增。`partNumber=''`，`feature` = `[desc, notes].filter(Boolean).join('；')`，`scene` = `scenes.join('、')`。关联字段全 `null` / `''`。种子共 **13** 条（合同测试断言）。

### 6.6 `normalizeProcessSteps(source)`

字段：`layer` trim 后空则 `'内层'`；`name` trim；`role/feature/note` `storedText`。**过滤掉 `name` 为空的项。**

### 6.7 `normalizeSensorSops(source)`

- `fileName` trim 且最长 200；`mimeType` trim 最长 120；`title` trim 最长 80，空则去掉 `.pdf` 后缀的 fileName。
- 缺 fileName、`dataUrl` 不以 `data:` 开头、`size` 非有限或 `<=0` → 丢弃。
- `detectControlledFileKind !== 'pdf'` → 丢弃。
- `uploadedAt` 空则 `formatLocalDate(new Date())`。
- `mimeType` 空则 `'application/pdf'`。

### 6.8 `normalizeMachineSections(source, { allowNotes = true })`

- `kind`：`item.kind === 'notes'` 才是 notes，否则 structure；`allowNotes === false` 时强制 structure。
- `name` trim 最长 40；空名丢弃。
- `sort` 非有限则用数组下标 `+ 1`。
- `scope`：仅 `'machine'` 保留，否则 `'global'`。
- `locked`：notes 恒 `true`；否则仅当 `item.locked` 为真才写 `locked: true`（structure 未锁定时**不**带该字段）。
- `allowNotes === false` 时再滤掉 notes。
- 按 `name` 的 zh-CN 小写去重，**保留先出现的**。
- 排序：`sort` 升序，同分 `id` 升序。

### 6.9 `validateMachineRowImage(fileName, mimeType, size)`

规则：`MACHINE_ROW_IMAGE_RULES`（扩展名 `.jpg/.jpeg/.png/.webp`，MIME 含 `image/jpeg|png|webp`，最大 2 MB）。

| 条件 | 返回 |
| --- | --- |
| `size` 非有限、`<=0`、或 `> maxBytes` | `{ ok: false, reason: 'size' }` |
| MIME 非空且不匹配 **并且** 扩展名不在白名单 | `{ ok: false, reason: 'type' }` |
| 空 MIME 只要扩展名合法即过；合法 MIME 即使扩展名怪也过 | `{ ok: true }` |

（旧 `d.ts` 的 `'validation'` 联合类型该方法实际用不到。）

### 6.10 `normalizeMachineRowImage(raw)`

非对象/数组 → `null`。`fileName` 最长 200；`mimeType` 小写最长 120；`dataUrl` 必须以 `data:image/` 开头；`size` 有限、`>0` 且 `≤ maxBytes`；再跑 `validateMachineRowImage`。失败 → `null`。成功 `{ dataUrl, fileName, mimeType, size }`（无 `uploadedAt`）。

### 6.11 `normalizeMachineSectionImages(source)`

映射 → 滤假值 → 按 `dataUrl` 去重 → **最多 2 张**。

### 6.12 `normalizeSensorIds(item, sensorItems=[])`（可内部不导出）

1. `sensorIds` 转正安全整数、去重。
2. 若结果非空，**或** `sensorItems.length === 0`，直接返回（哪怕空数组）。
3. 否则用旧字段 `sensorType`/`spec` 匹配目录：
   - 类型：空类型视为全匹配；否则全等，或去掉末尾「传感器」后全等。
   - 规格：`spec` trim 后 zh-CN 小写，与型号/规格/料号互相 `===` / `includes`。
   - 先取类型+规格都命中的全部 id；没有则取同类型且状态 `'现用'` 的第一条 id；再没有 `[]`。

### 6.13 `normalizeMachineSectionRows(source, { allowImage, sensorItems=[] })`

行字段：`role, sensorIds, sensorType, spec, purpose, name, desc, note`。`allowImage` 为真时可选保留归一化后的 `image`。

过滤：

- `allowImage` 真（结构行）：`role.trim()` 且（`sensorIds.length > 0` **或** `sensorType.trim()`）。
- `allowImage` 假（注意事项）：`role.trim()` 且 `name.trim()`。

### 6.14 `formatLocalDate(date)` / `formatLocalDateTime(date)`

非 `Date` 或 `NaN` → `''`。日期 `YYYY-MM-DD`（本地时区，月日补零）。日期时间 `YYYY-MM-DD HH:mm:ss`。

### 6.15 `detectControlledFileKind(fileName, mimeType)`

依次试 `pdf`、`word`。MIME 空视为通过 MIME 检查；MIME 非空需 `includes` 规则表中某一项。扩展名命中也可。都不中 → `null`。

### 6.16 `validateControlledUpload(kind, fileName, mimeType, size)`

| 条件 | reason |
| --- | --- |
| `kind` 不是 `pdf`/`word` | `validation` |
| size 非法或超 `8 * 1024 * 1024` | `size` |
| MIME 与扩展名都不合法 | `type` |
| 否则 | `{ ok: true }` |

### 6.17 `normalizeControlledDocuments(sourceItems)`

非数组 → `[]`。

若任一项同时有 `label` 自有属性、且有 `pdf` 或 `word` 自有属性 → **旧槽位格式**：每个 slot 抽 `pdf`/`word` 附件。

否则按扁平 `ControlledFileItem` 归一。非法附件丢弃。kind 优先用 `raw.kind`（仅 `'pdf'|'word'`），否则 `detectControlledFileKind`。

`createDefaultControlledDocuments()` → `[]`。

### 6.18 `normalizeDictionaryItems(source)`

`name` trim 最长 40；空名丢弃。`sort` 非有限用下标 `+1`。zh-CN 名去重留先到。按 `sort` 再 `id` 排序。

### 6.19 `createDictionaryDefaults(code)`

在 `DICTIONARY_DEFINITIONS` 里找 `code`，`defaults` 映射为 `{ id: i+1, name, sort: i+1 }`。未知 code → `[]`。

### 6.20 `normalizeEntityGroups(source)`

组名、条目名 trim 最长 40。空组名丢弃。组名 zh-CN 去重（跨列表）。条目名全局 zh-CN 去重（不同组也不能同名）。返回 `{ name, items }[]`。

### 6.21 `normalizeFeedbackTypes` / `createFeedbackTypeDefaults`

分别等于 `normalizeDictionaryItems` 与 `createDictionaryDefaults('customer-feedback')`。

### 6.22 `buildDefaultStore({ crudDefaults, sensorData })`

内存假 storage + 临时仓库，依次物化：

`getEntityGroups('customer'|'machine')`、全部 `DICTIONARY_DEFINITIONS` 的 `getDictionaryItems`、`getProcessSteps`、`getGlobalMachineSections`、`getGeneralStructureLabelMap`、`getSensors`、`getSensorSops`。

然后 `snapshotStore()`，再设 `meta:seed-version = [{ version: SEED_VERSION }]`。

**不**调用 `getCrud` / 不写入各客户示例行。

### 6.23 `buildSearchIndex({ customerGroups, machineDetails, machineGroups, machineSectionHits, processSteps, sensors })`

返回数组顺序：**sensor → process → machine（分组条目）→ machineSectionHits → customer**。

| type | title | category | sub | path | query |
| --- | --- | --- | --- | --- | --- |
| customer | 条目名 | 组名 | `` `${组名}区域 · PCB 制造客户` `` | `/selection/customer` | `{ category, item }` |
| process | `item.name` | `item.layer` | `layer · role · feature`（滤空） | `/selection/process` | `{ tab: 'steps', q: name }` |
| machine | 条目名 | 组名 | `` `${组名} · ${machineDetails[title].desc \|\| '机型结构'}` `` | `/selection/machine` | `{ category, item }` |
| machine（hits） | `item.title` 等原样 | | | `item.path \|\| '/selection/machine'` | 浅拷贝 `item.query` |
| sensor | `brand model partNumber` 滤空空格拼接 | `sensorType` | `status · partNumber · sensorType · spec · feature · scene · problemNote` 滤空 ` · ` 拼接 | `/selection/sensor` | `{ model }` |

`processSteps` 非数组当 `[]`。`machineSectionHits` 同理。

---

## 7. Repository 方法

除特别说明外，读方法在 key 缺失时写入种子到内存（不一定 persist）。

### 7.1 存储 / 快照

#### `replaceFromStorage(raw)`

**校验**：无。  
**成功**：`store = parsePersistedStore(raw)`，不 persist。  
**失败**：无。

#### `snapshotStore()`

**成功**：当前内存的深拷贝（全部值为数组）。  
**失败**：无。

#### `persist(snapshot)`（内部）

**成功**：`setItem` 未返回 `false` 且未抛 → `true`。`void` 视为成功。  
**失败**：`false` 或 throw → 恢复 `store = snapshot`，返回 `false`。调用方映射为 `{ ok: false, reason: 'storage' }`。

---

### 7.2 CRUD 列表

#### `getCrud(listId, entityName)`

key = `keyFor(listId, entityName)`。若值不是数组：有 `crudDefaults[listId]` 则 `factory(entityName)` 浅拷贝每项，否则 `[]`。然后 `normalizeCrudItems` 写回并返回。

#### `saveCrud(listId, entityName, payload, editId?)`

**校验**（先于 snapshot）

| 条件 | reason |
| --- | --- |
| `customer-proc`：`role` 或 `feature` trim 空 | `validation` |
| `customer-feedback`：`problem` trim 空 | `validation` |
| `customer-req`：`content` trim 空 | `validation` |
| 其他 listId：`name` trim 空 | `validation` |
| 该 list 在字典定义里 `field` 为 `type`（或缺省 type）：`type` 空或不在对应字典名中（**精确等于** `item.name`，不是 locale） | `validation` |
| `customer-feedback`：`status` 空或不在 `customer-feedback-status` | `validation` |
| `customer-req`：`source` 空或不在 `customer-req-source` | `validation` |
| `editId` 有值但列表找不到该 id | `stale` |

**成功**：新 id = `editId \|\| nextAvailableId(items)`；`normalizeCrudItems` 单条替换或 push。persist。`{ ok: true, item }`。  
**不查重**（同名可多条）。  
**失败**：上表 + `storage`。

#### `deleteCrud(listId, entityName, id)`

找不到 id → `stale`。否则 splice + persist。`storage`。

---

### 7.3 Sensor

#### `getSensors()`

key `sensor-catalog:all`。缺失则 `createSensorCatalogDefaults(sensorData)`。用当前 `sensor-type` / `sensor-status` 字典名做 `normalizeSensorItems`。

#### `saveSensor(payload, editId?)`

**校验**

| 条件 | reason |
| --- | --- |
| `model` trim 空，或 `sensorType` 不在类型字典，或 `status` 不在状态字典 | `validation` |
| 其他记录（`id !== editId`）型号 zh-CN 小写相同 | `duplicate` |
| `editId` 找不到 | `stale` |

`sopId`：仅当 payload **自有**该键且非 null/undefined 时解析；必须是已存在 SOP 的正安全整数，否则写成 `null`。编辑时若未传 `sopId` / `partNumber` / `replacesId` / `replacedById` / `problemNote` / `replacedAt`，保留旧值。

**成功**：写入后调用 `syncMachineSensorSnapshots()`（所有机型结构行按 `sensorIds` 重写 `sensorType`/`spec` 快照并归一化），再 persist。

#### `replaceSensorCurrent(alternateId, currentId, problemNote)`

**校验**

| 条件 | reason |
| --- | --- |
| `problemNote` trim 空 | `validation` |
| 两个 id 不是正安全整数，或相等 | `validation` |
| 状态字典缺「现用」「备选」「停用」任一 | `validation` |
| 找不到 alt 或 current | `stale` |
| alt 状态不是「备选」或 current 不是「现用」 | `validation` |

**成功**

- alt → 现用，`replacesId=currentId`，双方写入同一 `problemNote` 与 `replacedAt=formatLocalDate(now)`。
- current → 停用，`replacedById=altId`。
- 所有机型结构行：`sensorIds` 里的 `currentId` 换成 `altId` 并去重；主传感器（新数组第一项）刷新 type/spec 快照。
- 返回 `{ ok: true, item: 更新后的备选（现已现用）}`。

#### `deleteSensor(id)`

找不到 → `stale`。**不**检查机型引用（`in-use` 不用于此）。splice + persist。

#### `syncMachineSensorSnapshots()`（内部）

遍历全部机型已解析 Tab；仅 `kind === 'structure'`。按目录重写每行 type/spec；空关联则跳过该行快照。写回 `normalizeMachineSectionRows(..., { allowImage: true })`。

---

### 7.4 Sensor SOP

#### `getSensorSops()`

缺失 key → `[]`，再归一化。

#### `saveSensorSop(payload, editId?)`

| 条件 | reason |
| --- | --- |
| title / fileName 空，或 dataUrl 不以 `data:` 开头 | `validation` |
| `detectControlledFileKind !== 'pdf'` | `type` |
| `validateControlledUpload('pdf', ...)` 失败 | 其 `reason`（`size`/`type`） |
| 归一化后条目为假 | `validation` |
| `editId` 找不到 | `stale` |

title 最长 80，fileName 200，mime 120。`uploadedAt` 空则当天日期。成功后整表再 `normalizeSensorSops`。

#### `deleteSensorSop(id)`

找不到 → `stale`。任一 sensor.`sopId === id` → **`in-use`**。否则删除。

---

### 7.5 工艺制程

#### `getProcessSteps()`

缺失或归一化后长度为 0 → `createProcessStepDefaults()`。

#### `saveProcessStep(payload, editId?)`

| 条件 | reason |
| --- | --- |
| `name` trim 空（截断 40）或 `layer` 不在 `process-layer` 字典 | `validation` |
| 其他项 zh-CN 同名 | `duplicate` |
| `editId` 找不到 | `stale` |

#### `deleteProcessStep(id)`

找不到 → `stale`。删除后列表允许空（下次 get 会再种子）。

---

### 7.6 机型全局 / 本机 Tab

#### `getGlobalMachineSections()`

缺失或归一化后空 → `MACHINE_SECTION_SEED` 拷贝。然后：若 id 1/2/3 的名字分别是「标准输送段 / 六轴机械手 / 台车系统」且与种子名不同，改回种子名（输送机构 / 手臂机构 / 台车工位结构），并 **persist（不检查返回值）**。

#### `saveGlobalMachineSection(payload, editId?)`

| 条件 | reason |
| --- | --- |
| name trim 空（40） | `validation` |
| 其他全局 Tab zh-CN 同名 | `duplicate` |
| `editId` 找不到 | `stale` |

新建：`kind: 'structure'`，`scope: 'global'`，id = `nextAvailableId`。编辑：保留原 `kind`；notes 的 `locked` 恒 true。成功返回归一化后 **按 name 精确匹配** 的那一项。

#### `deleteGlobalMachineSection(id)`

| 条件 | reason |
| --- | --- |
| 找不到 | `stale` |
| `locked` 或 `kind === 'notes'` | `validation` |
| 任一机型该 section 仍有行或图片 | `not-empty` |

#### `getExtraMachineSections(machineName)`

缺失 → `[]`。`allowNotes: false` 归一化后每项强制 `kind: 'structure', scope: 'machine'`。

#### `saveExtraMachineSection(machineName, payload, editId?)`

| 条件 | reason |
| --- | --- |
| name 空 | `validation` |
| 与 **`listResolvedMachineSections`**（全局+本机）中其他 id 的 zh-CN 名冲突 | `duplicate` |
| `editId` 找不到 | `stale` |

新建 id 从 **1001** 起，跳过本机 extra id **和** 全部全局 id。

#### `deleteExtraMachineSection(machineName, id)`

找不到 → `stale`。本机该 id 仍有行或图 → `not-empty`。

#### `listResolvedMachineSections(machineName)`

`[...全局(scope:'global'), ...本机(kind:'structure', scope:'machine')]`，不按 sort 再合并排序（全局已排过，extra 接在后面）。

---

### 7.7 通用结构标签

常量：`GENERAL_STRUCTURE_CATEGORY = '通用结构'`。  
种子映射：`1→标准输送段`，`2→六轴机械手`，`3→台车系统`。

#### `getGeneralStructureLabelMap()`

以种子映射为底。key 缺失则写入 `[{id, name}, ...]`。再用 store 行覆盖：合法正 id + 非空 name。

#### `findGeneralStructureSection(itemName)`

先按标签 map **精确等于** itemName → `{ section, via: 'label' }`（全局里要找得到该 id）。否则找全局 `kind==='structure' && name===itemName` → `{ via: 'name' }`。否则 `null`。

#### `ensureGeneralStructureSection(itemName)`

name 空 → `validation`。已找到 → `{ ok: true, item: section }`。否则 `saveGlobalMachineSection({ name, sort: 全局.length+1 })`。

#### `syncGeneralStructureItemRename(fromName, toName)`

toName 空 → `validation`。找不到 from → `ensureGeneralStructureSection(toName)`。若 `via==='label'` **或** 该 section.id 属于种子映射的自有键 → 只改标签表（`persistGeneralStructureLabel`），**不改**全局 Tab 名。否则 `saveGlobalMachineSection({ name, sort }, id)`。

---

### 7.8 机型行 / 示意图

#### `sectionAllowsImage(sectionId)`（内部）

能在全局 Tab 找到则 `kind !== 'notes'`；找不到（本机 extra）→ `true`。

#### `migrateLegacyMachineRows(sectionId, machineName)`（内部，只读迁移）

若 **新 key 已是自有属性**（含有意的 `[]`）则跳过。无 legacy 映射则写 `[]`。有映射则读旧 key；旧 key 不是数组则用 `crudDefaults[legacyListId](machineName)`。写入新 key 后**不删除**旧 key。

#### `getMachineSectionRows(sectionId, machineName)`

先迁移，再按 `allowImage` + 当前目录归一化。

#### `getMachineSectionImages(sectionId, machineName)`

新 key 已存在 → 归一化。否则从行上的遗留 `row.image` 抽出，写入新 key（最多 2）。

#### `saveMachineSectionImages(sectionId, machineName, images)`

归一化后长度必须 **等于** 输入数组长度（非数组当 0）。不相等 → `validation`（含重复 dataUrl、非法图、超过 2 张被截断）。成功 `{ ok: true, item: { items } }`。

#### `saveMachineSectionRow(sectionId, machineName, payload, editId?)`

结构行（allowImage）：

| 条件 | reason |
| --- | --- |
| `role` 空或 `sensorIds` 去重后为空 | `validation` |
| 显式传 `image` 且校验失败 | `size` / `type`；`normalizeMachineRowImage` 失败则 `validation` |
| `image === null \| undefined` 表示清除 | 合法 |
| 未传 `image` 的编辑：保留旧图 | |
| 去重后的 id **没有一条**能在目录解析到 | `stale` |
| 归一化结果假 | `validation` |
| `editId` 找不到 | `stale` |

成功时用目录记录重写 `sensorType`（`、` 拼接）和 `spec`（`spec \|\| model`，`、` 拼接）。

注意事项行：`role` 与 `name` 都要 trim 非空，否则 `validation`。不要求 sensorIds。

#### `deleteMachineSectionRow(sectionId, machineName, id)`

找不到 → `stale`。

---

### 7.9 受控文档

活键：`customer-sop:{客户名}`。

#### `getControlledDocuments(entityName)`

缺失 → `[]`，再归一化。

#### `saveControlledFile(entityName, attachment)`

**只新增，不编辑。**

| 条件 | reason |
| --- | --- |
| 无法检测 kind | `type` |
| `validateControlledUpload` 失败 | `size` / `type` |
| `normalizeFileAttachment` 失败（无 fileName、dataUrl 不以 `data:` 开头、size 非法） | `validation` |

id = `nextAvailableId`。`uploadedAt` 来自附件，不自动填。

#### `deleteControlledFile(entityName, id)`

找不到 → `stale`。

---

### 7.10 数据字典

九个 code：`customer-req`、`customer-req-source`、`customer-proc`、`customer-feedback`、`customer-feedback-status`、`process-layer`、`sensor-status`、`sensor-type`、`machine-section`。

`dictionaryCodeForList(listId)`：定义里 `listIds` 包含该 list **且** `(field \|\| 'type') === 'type'` 的 code。因此 `customer-req-source`（field=`source`）不会当 CRUD 的 type 字典。

**`machine-section` 特例（UI 层）**：字典页改全局 Tab 必须走 §7.6，不能只调 `saveDictionaryItem('machine-section')`。后者只改 `dict:machine-section`，**不会**同步 `machine-global-sections:all`。`renameDictionaryValue` 对 `catalog === 'machine-section'` **无**特殊分支。

#### `getDictionaryItems(code)`

未知 code → `[]`（不写 store）。缺失 key：若 code 为 `customer-feedback` 且存在 `dict-feedback-type:all` 数组则用它，否则 `createDictionaryDefaults(code)`。归一化后长度为 0 再种子。

`sensor-status` 若没有名为「停用」的项：追加一项（id=`nextAvailableId`，sort=现有 max+1）并 **persist（不检查返回值）**。

#### `saveDictionaryItem(code, payload, editId?)`

| 条件 | reason |
| --- | --- |
| 未知 code | `validation` |
| name 空（40） | `validation` |
| 其他项 zh-CN 同名 | `duplicate` |
| `editId` 找不到 | `stale` |

编辑且改名：`renameDictionaryValue(definition, old, new)`。

`renameDictionaryValue`：

- 每个 `listIds`：所有 `listId:` 前缀的 store 数组，把 `item[field] === fromName`（精确）改成 `toName`，再 `normalizeCrudItems`。
- `catalog === 'sensor'`：改 `sensor-catalog:all` 的对应 field，再 `normalizeSensorItems`。
- `catalog === 'process-step'`：改 `process-steps:all` 的 layer，再 `normalizeProcessSteps`。

#### `deleteDictionaryItem(code, id)`

| 条件 | reason |
| --- | --- |
| 未知 code | `validation` |
| 删完会少于 1 项 | `validation` |
| 找不到 id | `stale` |

把已引用 `removed.name` 的数据改归 **剩下的第一项名**（空则种子第一项）。

#### `getFeedbackTypes` / `saveFeedbackType` / `deleteFeedbackType`

原样转发 `customer-feedback` 字典三方法。

---

### 7.11 客户 / 机型树

未知 `kind`：读返回 `[]`；写返回 `validation`。

#### `getEntityGroups(kind)`

缺失或归一化后空 → `createEntityGroupDefaults(kind)`（种子组来自 `CUSTOMER_GROUPS` / `MACHINE_GROUPS`）。

#### `saveEntityGroup(kind, { name }, editName?)`

| 条件 | reason |
| --- | --- |
| name 空（40） | `validation` |
| 其他组（`group.name !== editName`）zh-CN 同名 | `duplicate` |
| 编辑但找不到 `editName` 精确匹配 | `stale` |

新建 `items: []`。改名**不**迁移条目数据（条目仍在该组数组里）。

#### `deleteEntityGroup(kind, name)`

找不到精确名 → `stale`。`items.length > 0` → `not-empty`。

#### `reorderEntityGroups(kind, oldIndex, newIndex)`

索引必须是整数且都在 `[0, length)`。非法 → `validation`。`oldIndex === newIndex` → `{ ok: true }` **且不 persist**。

#### `reorderEntityItems(kind, groupName, oldIndex, newIndex)`

找不到组（精确名）→ `stale`。索引非法 → `validation`。同索引 → `{ ok: true }` 不 persist。

#### `entityHasData(kind, entityName)`

- machine：extra Tab 非空，或任一已解析 section 有行或图。
- customer：`entityDataKeys` 里任一数组长度 > 0（含 `customer-sop`）。

#### `saveEntityItem(kind, { category, name }, editName?)`

| 条件 | reason |
| --- | --- |
| name 或 category 空（各 40） | `validation` |
| 目标组（精确 `category`）不存在 | `validation` |
| 任意组里其他条目（`!== editName`）zh-CN 同名 | `duplicate` |
| 编辑但 `editName` 不在树中 | `stale` |

新建：推进目标组，并 `initEmptyEntityData`（机型：extra=`[]`，每个全局 section 的 rows=`[]`；客户：各 list + sop 置 `[]`）。  
编辑：从原组移除；若改名则 `migrateEntityDataKeys`（机型：extra、所有 `machine-section-rows/images` 后缀、四条 legacy key；客户：listIds + sop）；再推进目标组。

**persist 之后**（已落盘）：若 `kind==='machine' && category==='通用结构'`：新建调 `ensureGeneralStructureSection(name)`；改名再调 `syncGeneralStructureItemRename(editName, name)`。若同步失败，**返回该失败（树改动已 persist）**——与旧实现一致。

#### `deleteEntityItem(kind, name)`

| 条件 | reason |
| --- | --- |
| 树中无该精确名 | `stale` |
| `entityHasData` | `not-empty` |
| 机型且分类是「通用结构」，绑定到**非种子 id** 的全局 Tab，且**其他机型**该 Tab 仍有行 | `not-empty` |

成功：从树移除、`clearEntityDataKeys`、persist。若上面那种非种子绑定，再 `deleteGlobalMachineSection`；失败且 reason 不是 `stale` 则把该失败返回（树已 persist）。

---

## 8. BackendStorage（`storage.ts`）

实现 `StorageLike` 的同步 `getItem` / `setItem`。内部乐观更新 + **单队列** `this.queue = this.queue.then(...)`。

### 8.1 构造

`transport: { fetchStore, writeKey, deleteKey?, writeAll }`  
`local: StorageLike`  
`onStatus?` `onWriteFailure?`  
`migrateOnEmpty` 默认 true（显式 `false` 才关）  
`seedDefaults?` 全量 store 对象  

内部：`cache`、`synced` 为 `Map<业务key, 数组>`。`status` 初值 `'connecting'`。`lastError`。

**传输层路由不在本类**：`writeKey` 由调用方（未来 `stores/selection.ts`）实现：`entity-groups:customer|machine` → `PUT /store/entity-groups/{kind}`，其余 → `PUT /store/{key}`。

### 8.2 状态

| status | 含义 |
| --- | --- |
| `connecting` | `init()` 进行中 |
| `online` | 读写走后端 |
| `offline` | 启动时后端不可达，读写本地 |
| `unauthorized` | 需登录；读缓存或本地，禁止写 |

`isUnauthorized(error)`：`error.kind === 'unauthorized' || error.kind === 'forbidden'`。init 阶段 forbidden 也当要重新登录。

### 8.3 `init()`

1. status=`connecting`，emit。
2. `fetchStore()` 抛错 → `fallbackToLocal`：若 unauthorized/forbidden → `unauthorized` + 消息「登录已失效」；否则 `offline` + 「后端服务不可用」。**清空 cache/synced**，返回 `{ migrated:false, seeded:false, keyCount:0, status }`。
3. 远端 key 数为 0 且 `migrateOnEmpty`：
   - 本地 `parsePersistedStore` 有 key → `writeAll(local)` 成功则 `migrated=true`，`remote=local`；失败则继续当空库。
   - 本地也空且有 `seedDefaults` → `writeAll(seedDefaults)` 成功则 `seeded=true`。
4. 版本化回填：若 `seedDefaults` 的 `meta:seed-version[0].version` **大于** 远端同字段（缺省 0）：对种子里「不是 meta 且远端没有的 key」逐个 `writeKey`，最后写 meta。任一步抛错则中止回填，不阻断本次 init。
5. `cache = Map(entries(remote))`，`synced` 克隆，status=`online`，`snapshotLocal()`，emit。返回 `{ migrated, seeded, keyCount, status:'online' }`。

### 8.4 `getItem(key)`

- `offline`：直接 `local.getItem`。
- `key === STORAGE_KEY`：把 cache 组装成对象再 `JSON.stringify`。若 `unauthorized` 且组装结果无键 → 退回 `local.getItem`。
- 其他业务 key：cache 未命中时，unauthorized 退回 local，否则 `null`。命中则 `JSON.stringify(数组)`。

### 8.5 `setItem(key, value)`

| 状态 / 输入 | 行为 |
| --- | --- |
| `offline` | `writeLocal`：try `local.setItem`，成功 `true`，抛 `false` |
| 不是 `online`（connecting / unauthorized） | **`false`**（拒绝） |
| `key === STORAGE_KEY` | `syncStore(parseStoreJson(value))`，恒 `true`（乐观） |
| value 不是合法 JSON 或不是数组 | `false` |
| 与 cache 深等（`JSON.stringify` 比较） | `true`，不入队 |
| 否则 | 乐观写入 cache，`enqueueWrite`，`true` |

`parseStoreJson`：**只**要求值为数组；**不**跳过 `__proto__` 等键（与 `parsePersistedStore` 不同，保持旧桥接行为）。

`syncStore`：对比 cache 与 nextStore，变更的 key `enqueueWrite(prev=synced.get)`，消失的 key `enqueueDelete`。cache 换成 nextStore。返回 `true`。

`enqueueWrite` 成功：synced 更新、`lastError=null`、`snapshotLocal()`。失败：`handleFailure`。  
`enqueueDelete`：无 `deleteKey` 则只改 synced + snapshot；有则入队，失败用 prev 恢复。

`handleFailure`：该 key 回滚到 prev（prev 为 undefined 则 delete）；`snapshotLocal()`；`onWriteFailure(message)`；若是未授权且当前不是 unauthorized → 切状态（**不**清空整个 cache）。

### 8.6 `snapshotLocal()`

把 cache 组装后 `local.setItem(STORAGE_KEY, json)`。抛错吞掉。

---

## 9. 机型示意图报告（`schematic-report.ts`）

`buildMachineSchematicReportHtml(machineNames, sections)` → 完整 HTML 字符串。

安全：

- 所有插入文本经 `escapeHtml`（`& < > " '`）。
- 图片 `src` 仅当 `dataUrl` 匹配 `/^data:image\/(?:png|jpe?g|webp);base64,/i`，否则渲染「-」。
- 结构行字段：role/sensorType/spec/purpose/note；注意事项：name/role/desc/note。
- 空块文案：「已选机型在此模块暂无内容。」「此机型在该模块暂无记录。」「暂无已选择的机型。」
- 页脚生成时间 `toLocaleString('zh-CN')`。
- 内联 CSS 可保持与旧报告视觉等价（独立 HTML，不走应用 token）。

---

## 10. 种子（`seed.ts`）

`SEED_VERSION = 1`。改默认数据必须递增。

必须与旧 `data.js` **值等价**的导出：

- `CUSTOMER_GROUPS` / `MACHINE_GROUPS` / `PROCESS_GROUPS`
- `PROCESS_DETAILS` / `MACHINE_DETAILS`
- `SENSOR_DATA`（8 类：漫反射、对照式、近接式、静电容式、光纤式、激光式、超声波式、压力传感器；合计 13 型号）
- `CRUD_DEFAULTS`（`customer-req|proc|feedback` 及四条 legacy `machine-*` 工厂）
- `SENSOR_STATUS_OPTIONS = ['现用','备选','停用']`
- `SENSOR_TYPE_OPTIONS = Object.keys(SENSOR_DATA)`
- `FEEDBACK_TYPE_OPTIONS`、`FEEDBACK_STATUS_OPTIONS`、`CUSTOMER_REQ_SOURCE_OPTIONS`
- `CRUD_TYPE_OPTIONS`
- `PROCESS_LAYER_OPTIONS = ['内层','外层']`
- `MACHINE_SECTION_SEED`（id 1–4：输送机构 / 手臂机构 / 台车工位结构 / 机型注意事项 locked notes）
- `GENERAL_STRUCTURE_CATEGORY`、`GENERAL_STRUCTURE_SECTION_LABELS`、`MACHINE_SECTION_LEGACY_MAP`
- `MACHINE_ROW_IMAGE_RULES`
- `DICTIONARY_DEFINITIONS`、`ENTITY_KIND_DEFINITIONS`
- `createEntityGroupDefaults(kind)`、`createProcessStepDefaults()`

`createProcessStepDefaults`：跳过组名「制程介绍」；组名含「外层」则 layer=`外层` 否则 `内层`；`role` 取 `PROCESS_DETAILS[name].desc`。

`CONTROLLED_FILE_RULES` / `CONTROLLED_FILE_ACCEPT` 放 `normalize.ts`（与旧 domain 导出位置一致）。pdf/word 各 8 MB。

---

## 11. 验收

- [x] 本文每个对外方法都有「校验 / 成功 / 失败 reason」
- [x] 新 TypeScript 实现有 Vitest 覆盖（`frontend/src/domain/*.test.ts`）；根目录合同测试跑新领域层
- [x] 旧 JS 不出现在 `frontend/src/`
- [x] 故意 `setItem` 返回 `false` 时内存回滚
- [x] 空库种子与版本化回填与旧前端一致
