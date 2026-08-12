# 机型 Section Tab + 附加图片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 机型结构右侧改为可维护的全局/本机 Section Tab，结构类行支持单张附加图片，注意事项固定无图；独立 `MachineWorkspace` 承接详情。

**Architecture:** 在 `domain.js` 新增 machine-section / rows API（与旧 `machine-conveyor` 等解耦）；全局 section 挂数据字典 UI（`machine-section`）；机型页用 `MachineWorkspace` + `MachineSectionTable`；首次读取时从旧 listId 迁入新键。

**Tech Stack:** Vue 3、Pinia、Element Plus、localStorage `symtek_crud_store`、`pnpm run test:selection`

**Spec:** `docs/superpowers/specs/2026-08-11-machine-sections-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web-ele/src/modules/selection/data.js` / `data.d.ts` | `MachineSectionItem`、`MachineSectionRow`、种子、图片规则、type options 映射；`ENTITY_KIND` 去掉旧 machine listIds |
| `apps/web-ele/src/modules/selection/domain.js` / `domain.d.ts` | normalize、CRUD、迁移、entityHasData/改名联动 |
| `apps/web-ele/src/modules/selection/store.ts` | 暴露 section/row API |
| `apps/web-ele/src/modules/selection/components/MachineWorkspace.vue` | 左侧树 + 动态 Tab + 本机 Tab 维护 |
| `apps/web-ele/src/modules/selection/components/MachineSectionTable.vue` | 行表 + 图片列/上传/预览 |
| `apps/web-ele/src/modules/selection/components/DictionaryWorkspace.vue` | `machine-section`：kind 列、notes 锁定删除 |
| `apps/web-ele/src/modules/selection/components/EntityWorkspace.vue` | 仅保留 customer |
| `apps/web-ele/src/modules/selection/views/machine.vue` | 改挂 `MachineWorkspace` |
| `apps/web-ele/src/modules/selection/selection.css` | 缩略图等样式 |
| `scripts/vben-migration.contract-test.cjs` | 迁移、图片、删 Tab、字典锁定 |

---

### Task 1: Types + seeds + contract stubs

**Files:**
- Modify: `apps/web-ele/src/modules/selection/data.js`
- Modify: `apps/web-ele/src/modules/selection/data.d.ts`
- Modify: `scripts/vben-migration.contract-test.cjs`

- [ ] **Step 1: Add types and seeds in `data.d.ts` / `data.js`**

`data.d.ts` 增加：

```ts
export type MachineSectionKind = 'structure' | 'notes';

export interface MachineSectionItem {
  id: number;
  name: string;
  sort: number;
  kind: MachineSectionKind;
  locked?: boolean; // notes seed = true
  scope: 'global' | 'machine';
}

export interface MachineRowImage {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface MachineSectionRow {
  id: number;
  type: string;
  name: string;
  desc: string;
  note: string;
  image?: MachineRowImage | null;
}

export const MACHINE_SECTION_SEED: MachineSectionItem[];
export const MACHINE_SECTION_LEGACY_MAP: Record<string, number>; // old listId -> seed id
export const MACHINE_ROW_IMAGE_RULES: {
  accept: string;
  extensions: string[];
  maxBytes: number;
  mimeTypes: string[];
};
export function machineSectionTypeOptions(sectionId: number): string[];
```

`data.js` 种子（稳定 id）：

```js
export const MACHINE_SECTION_SEED = [
  { id: 1, name: '输送机构', sort: 1, kind: 'structure', scope: 'global' },
  { id: 2, name: '手臂机构', sort: 2, kind: 'structure', scope: 'global' },
  { id: 3, name: '台车工位结构', sort: 3, kind: 'structure', scope: 'global' },
  { id: 4, name: '机型注意事项', sort: 4, kind: 'notes', locked: true, scope: 'global' },
];

export const MACHINE_SECTION_LEGACY_MAP = {
  'machine-conveyor': 1,
  'machine-arm': 2,
  'machine-platform': 3,
  'machine-notes': 4,
};

export const MACHINE_ROW_IMAGE_RULES = {
  accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
  extensions: ['.jpg', '.jpeg', '.png', '.webp'],
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

export function machineSectionTypeOptions(sectionId) {
  const map = {
    1: CRUD_TYPE_OPTIONS['machine-conveyor'],
    2: CRUD_TYPE_OPTIONS['machine-arm'],
    3: CRUD_TYPE_OPTIONS['machine-platform'],
    4: CRUD_TYPE_OPTIONS['machine-notes'],
  };
  return map[sectionId] || ['其他'];
}
```

在 `DICTIONARY_DEFINITIONS` 增加（`defaults` 用名称列表仅作占位；真正种子走 `MACHINE_SECTION_SEED`）：

```js
{
  code: 'machine-section',
  title: '机型结构 Tab',
  description: '机型详情全局 Tab；注意事项锁定且无附加图片',
  field: 'type',
  listIds: [],
  catalog: 'machine-section',
  defaults: MACHINE_SECTION_SEED.map((item) => item.name),
},
```

将 `ENTITY_KIND_DEFINITIONS` 中 machine 的 `listIds` 改为 `[]`（业务数据改由 section rows / extra sections 判定）。

- [ ] **Step 2: Add failing contract asserts (API not yet present)**

在 `scripts/vben-migration.contract-test.cjs` 末尾、`buildSearchIndex` 之前加入：

```js
  const sections = repository.getGlobalMachineSections()
  assert.equal(sections.some((item) => item.name === '机型注意事项' && item.kind === 'notes' && item.locked), true)

  const machineName = '中间六轴机'
  const conveyorRows = repository.getMachineSectionRows(1, machineName)
  assert.ok(conveyorRows.length >= 1, 'legacy conveyor rows should migrate')

  const saved = repository.saveMachineSectionRow(1, machineName, {
    type: '进板检测',
    name: '测试图行',
    desc: '带图',
    note: '',
    image: {
      dataUrl: 'data:image/png;base64,aaa',
      fileName: 'a.png',
      mimeType: 'image/png',
      size: 3,
    },
  })
  assert.equal(saved.ok, true)
  assert.equal(Boolean(saved.item.image?.dataUrl), true)

  const notesSave = repository.saveMachineSectionRow(4, machineName, {
    type: '安装注意',
    name: '无图',
    desc: '',
    note: '',
    image: {
      dataUrl: 'data:image/png;base64,aaa',
      fileName: 'a.png',
      mimeType: 'image/png',
      size: 3,
    },
  })
  assert.equal(notesSave.ok, true)
  assert.equal(notesSave.item.image == null, true)

  const delNotes = repository.deleteGlobalMachineSection(
    sections.find((item) => item.kind === 'notes').id,
  )
  assert.equal(delNotes.ok, false)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm run test:selection`  
Expected: FAIL（`getGlobalMachineSections` is not a function 或类似）

- [ ] **Step 4: Commit only when user asks**（本仓库默认不自动 commit）

---

### Task 2: Domain normalize + section/row APIs + migration

**Files:**
- Modify: `apps/web-ele/src/modules/selection/domain.js`
- Modify: `apps/web-ele/src/modules/selection/domain.d.ts`

- [ ] **Step 1: Implement helpers**

键约定：

```js
keyFor('dict', 'machine-section') // 或专用 machine-global-sections:all — 推荐专用键更清晰：
keyFor('machine-global-sections', 'all')
keyFor('machine-extra-sections', machineName)
keyFor('machine-section-rows', `${sectionId}:${machineName}`) // 若 keyFor 只拼两段，用：
// `machine-section-rows:${sectionId}:${machineName}` 直接字符串
```

实现：

```js
export function normalizeMachineSections(source, { allowNotes = true } = {}) { /* id/name/sort/kind/locked/scope */ }
export function normalizeMachineRowImage(raw) { /* 校验 mime/size/dataUrl，失败返回 null */ }
export function normalizeMachineSectionRows(source, { allowImage }) { /* Crud 字段 + 条件 image */ }
export function validateMachineRowImage(fileName, mimeType, size) { /* 同 controlled 模式 */ }
```

- [ ] **Step 2: Repository methods**

```js
getGlobalMachineSections()
saveGlobalMachineSection(payload, editId) // notes: 不可改 kind；新建仅 structure
deleteGlobalMachineSection(id) // locked → validation；任意机型该 section 有行 → not-empty

getExtraMachineSections(machineName)
saveExtraMachineSection(machineName, payload, editId) // kind 强制 structure；id 用大段避开全局 seed（如 nextId starting > 1000 或独立命名空间）
deleteExtraMachineSection(machineName, id) // 该机该 section 有行 → not-empty

getMachineSectionRows(sectionId, machineName) // 内含 migrateLegacyMachineRows
saveMachineSectionRow(sectionId, machineName, payload, editId)
deleteMachineSectionRow(sectionId, machineName, id)

listResolvedMachineSections(machineName) // global sorted + extra sorted
```

迁移 `migrateLegacyMachineRows(sectionId, machineName)`：

```js
const legacyListId = Object.entries(MACHINE_SECTION_LEGACY_MAP).find(([, id]) => id === sectionId)?.[0]
const newKey = `machine-section-rows:${sectionId}:${machineName}`
if (Array.isArray(store[newKey]) && store[newKey].length > 0) return
if (!legacyListId) { store[newKey] = store[newKey] || []; return }
const legacyKey = keyFor(legacyListId, machineName)
if (!Array.isArray(store[legacyKey])) {
  store[newKey] = Array.isArray(store[newKey]) ? store[newKey] : []
  return
}
const allowImage = sectionId !== 4
store[newKey] = normalizeMachineSectionRows(store[legacyKey], { allowImage })
// 不删除旧键
```

新建机型 `initEmptyEntityData`：为全局各 section 写空 rows `[]`，extra sections 写 `[]`。

- [ ] **Step 3: Wire entity rename / hasData / delete**

```js
function entityHasData(kind, entityName) {
  if (kind === 'machine') {
    if (getExtraMachineSections(entityName).length > 0) return true
    return listResolvedMachineSections(entityName).some(
      (section) => getMachineSectionRows(section.id, entityName).length > 0,
    )
  }
  // existing customer logic
}

function migrateEntityDataKeys(kind, fromName, toName) {
  if (kind === 'machine') {
    // move machine-extra-sections:from → to
    // move every machine-section-rows:*:from → *:to
    // also keep migrating any leftover legacy machine-* keys for safety
  }
  // existing...
}
```

`createDictionaryDefaults('machine-section')`：若仍走字典 defaults，改为返回 `MACHINE_SECTION_SEED` 拷贝；或 `getGlobalMachineSections` 完全不走通用 dict API。

**推荐：** 全局 section 用专用 API，不复用 `saveDictionaryItem` 的 rename-to-fallback 删除语义；字典页对 `machine-section` 调用专用 store 方法。

- [ ] **Step 4: Export types on `domain.d.ts` + repository interface**

- [ ] **Step 5: Run `pnpm run test:selection`**  
Expected: Task 1 新增断言 PASS（若 image base64 校验过严，放宽 normalize 或换合法极小 png dataUrl）

---

### Task 3: Pinia store wiring

**Files:**
- Modify: `apps/web-ele/src/modules/selection/store.ts`

- [ ] **Step 1: Mirror repository methods**（与 `saveProcessStep` 相同 touch/lastFailure 模式）

暴露：`globalMachineSections`、`extraMachineSections(machine)`、`resolvedMachineSections(machine)`、`machineSectionRows`、save/delete 全局/额外/行。

- [ ] **Step 2: `pnpm run check:type`** Expected: PASS（或仅余 UI 未用告警，无错误）

---

### Task 4: `MachineSectionTable.vue`

**Files:**
- Create: `apps/web-ele/src/modules/selection/components/MachineSectionTable.vue`
- Modify: `apps/web-ele/src/modules/selection/selection.css`

- [ ] **Step 1: Props** `machineName: string`, `section: MachineSectionItem`

- [ ] **Step 2: Table behavior**
  - 复用 CrudTable 的搜索/分页/弹窗模式
  - `section.kind === 'structure'` 时显示「附加图片」列：缩略图按钮；无图显示「—」
  - 弹窗：structure 增加 file input（`MACHINE_ROW_IMAGE_RULES.accept`）、预览、清除
  - 读文件为 dataUrl 后写入 `saveMachineSectionRow`
  - 点击缩略图：`ElDialog` + `<img :src="dataUrl" alt="" />`（勿把未消毒字符串当 HTML 拼接）
  - notes：隐藏图片 UI；保存时不传 image

- [ ] **Step 3: Labels**
  - structure: `['类型','名称','说明','附加图片','备注']`（图片列单独 slot）
  - notes: `['注意分类','事项名称','说明','备注']`
  - type options: `machineSectionTypeOptions(section.id)`；本机新建 section（id∉1..4）用 `['其他']`

- [ ] **Step 4: CSS** `.machine-row-thumb` 约 40×40、object-fit cover、圆角

---

### Task 5: `MachineWorkspace.vue` + route view

**Files:**
- Create: `apps/web-ele/src/modules/selection/components/MachineWorkspace.vue`
- Modify: `apps/web-ele/src/modules/selection/views/machine.vue`
- Modify: `apps/web-ele/src/modules/selection/components/EntityWorkspace.vue`（去掉 machine 分支，仅 customer）

- [ ] **Step 1: MachineWorkspace**
  - 左侧 `EntitySidebar kind="machine"`
  - 右侧 `ElTabs`：`resolvedMachineSections(selection.item)`
  - query：`category`/`item`/`section`（section = sectionId 字符串）
  - Tab 栏旁「+ 本机 Tab」对话框（名称）；保存 `saveExtraMachineSection`
  - 本机 Tab（`scope==='machine'`）标签上提供改名/删除（行非空则 error）
  - 全局 Tab 无删除入口
  - 每个 pane：`<MachineSectionTable :machine-name="..." :section="..." />`

- [ ] **Step 2: `machine.vue` 改为 `<MachineWorkspace />`**

- [ ] **Step 3: `EntityWorkspace` 删除 machine tabs / `kind` 可保留仅 customer，或 `machine.vue` 不再引用它**

---

### Task 6: Dictionary UI for `machine-section`

**Files:**
- Modify: `apps/web-ele/src/modules/selection/components/DictionaryWorkspace.vue`

- [ ] **Step 1: When `activeCode === 'machine-section'`**
  - 数据源改为 `store.globalMachineSections`（不要用通用 `dictionaryItems`）
  - 表单增加 `kind` 选择（新建仅 structure；编辑 notes 禁用 kind）
  - 表格列：排序、名称、类型、操作
  - notes/`locked`：隐藏删除或删除时提示不可删
  - 删除 structure：调用 `deleteGlobalMachineSection`；`not-empty` →「请先清空各机型下该 Tab 的数据」
  - 保存：`saveGlobalMachineSection`

- [ ] **Step 2: 其它字典 code 保持原逻辑**

---

### Task 7: Search index (optional but in spec)

**Files:**
- Modify: `apps/web-ele/src/modules/selection/domain.js` `buildSearchIndex`
- Modify: `apps/web-ele/src/modules/selection/store.ts`

- [ ] **Step 1: For each machine × each section × rows，增加可搜索条目**（或至少 machine 名仍可搜；行级：title=row.name，query=`{category,item,section}`）

若时间紧：至少保证机型名搜索仍工作；行级跳转作为本 task 完成项。

---

### Task 8: Contract tests completeness + verify

**Files:**
- Modify: `scripts/vben-migration.contract-test.cjs`

- [ ] **Step 1: Add cases**
  - 额外 section 仅影响单机型
  - 有行时删全局 structure → `not-empty`
  - 机型改名后 rows / extra sections 键迁移
  - `entityHasData('machine', name)` 在仅有 section 行时为 true

- [ ] **Step 2: Run**

```powershell
pnpm run test:selection
pnpm run check:type
pnpm run lint
```

Expected: all PASS

---

## Self-review vs spec

| Spec requirement | Task |
|------------------|------|
| 全局模板 + 机型只能加 | 2, 5, 6 |
| notes 锁定无图 | 2, 4, 6 |
| 每行最多 1 图 jpg/png/webp | 1, 2, 4 |
| 字典维护全局 Tab | 1, 6 |
| MachineWorkspace 方案 B | 5 |
| 旧键迁移 | 2, 8 |
| 改名/删机型联动 | 2, 8 |
| 搜索 section query | 7 |
| 验收命令 | 8 |

无 TBD 占位；`MachineSectionItem.scope` 用于 UI 区分全局/本机；全局种子稳定 id 1–4 与 `MACHINE_SECTION_LEGACY_MAP` 一致。
