# 客户通用要求项列结构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将客户管理「客户通用要求」改为：要求分类、适用机型、适用制程、要求内容、来源、备注（+ 操作），并新增来源字典。

**Architecture:** 新增 `CustomerReqItem`；`normalizeCrudItems` / `saveCrud` 对 `customer-req` 走独立分支；新建 `CustomerReqPanel.vue` 替换该 Tab 的 `CrudTable`；`customer-proc` 保持旧 `CrudItem`。合同测试先行（TDD）。

**Tech Stack:** Vue 3、Pinia、Element Plus、localStorage `symtek_crud_store`、`scripts/vben-migration.contract-test.cjs`

---

## File map

| File | Role |
|------|------|
| `scripts/vben-migration.contract-test.cjs` | 回归：来源字典、新字段保存/归一化、级联、`customer-proc` 仍旧形 |
| `apps/web-ele/src/modules/selection/data.js` | 来源默认、种子、`DICTIONARY_DEFINITIONS`、清理 `CRUD_COLUMN_LABELS['customer-req']` |
| `apps/web-ele/src/modules/selection/data.d.ts` | `CustomerReqItem` 类型 |
| `apps/web-ele/src/modules/selection/domain.js` / `domain.d.ts` | normalize + save 校验；类型导出 |
| `apps/web-ele/src/modules/selection/store.ts` | payload 联合类型含 `CustomerReqItem` |
| `apps/web-ele/src/modules/selection/components/CustomerReqPanel.vue` | 新建表格/表单 |
| `apps/web-ele/src/modules/selection/components/EntityWorkspace.vue` | Tab 换组件 |

---

### Task 1: Contract tests (RED)

**Files:** `scripts/vben-migration.contract-test.cjs`

- [ ] **Step 1: 在反馈断言附近增加客户要求断言**

在现有 `reqTypes` / `renamedReq` 附近扩展（或紧接反馈块后）：

```js
const reqSourceTypes = repository.getDictionaryItems('customer-req-source')
assert.equal(reqSourceTypes.length, 5)
assert.deepEqual(
  reqSourceTypes.map((item) => item.name),
  ['验收规范', '厂外改善', '客户要求', '产品更新迭代', '其他'],
)

const savedReq = repository.saveCrud('customer-req', customer, {
  type: '输送段',
  machine: 'ALL',
  process: 'DES',
  content: '板件有无检测距离不大于 300mm',
  source: '验收规范',
  note: '示例备注',
})
assert.equal(savedReq.ok, true)
assert.equal(savedReq.item.content, '板件有无检测距离不大于 300mm')
assert.equal(savedReq.item.machine, 'ALL')
assert.equal(savedReq.item.source, '验收规范')
assert.equal(savedReq.item.name, undefined)
assert.equal(savedReq.item.desc, undefined)

const reqRow = repository
  .getCrud('customer-req', customer)
  .find((item) => item.content === '板件有无检测距离不大于 300mm')
assert.ok(reqRow)
assert.deepEqual(Object.keys(reqRow).sort(), [
  'content',
  'id',
  'machine',
  'note',
  'process',
  'source',
  'type',
])

const missingContent = repository.saveCrud('customer-req', customer, {
  type: '输送段',
  machine: '',
  process: '',
  content: '  ',
  source: '其他',
  note: '',
})
assert.deepEqual(missingContent, { ok: false, reason: 'validation' })

const optionalReq = repository.saveCrud('customer-req', customer, {
  type: '特殊要求',
  machine: '',
  process: '',
  content: '仅要求内容',
  source: '客户要求',
  note: '',
})
assert.equal(optionalReq.ok, true)
assert.equal(optionalReq.item.machine, '')
assert.equal(optionalReq.item.process, '')
assert.equal(optionalReq.item.note, '')

const renamedSource = repository.saveDictionaryItem(
  'customer-req-source',
  { name: '验收规范-改', sort: 1 },
  reqSourceTypes[0].id,
)
assert.equal(renamedSource.ok, true)
assert.equal(
  repository
    .getCrud('customer-req', customer)
    .some((item) => item.source === '验收规范-改'),
  true,
)

// customer-proc 仍为旧形状
const savedProc = repository.saveCrud('customer-proc', customer, {
  type: 'DES 制程',
  name: '板件传送检测',
  desc: '进出口设置漫反射传感器',
  note: '防止空喷损耗',
})
assert.equal(savedProc.ok, true)
assert.equal(savedProc.item.name, '板件传送检测')
assert.equal(savedProc.item.content, undefined)
```

若测试里 `customer` 变量已有（庆鼎等），直接复用；否则用同一 fixture 客户名。

保留现有 `renamedReq`（改名 `输送段` → `输送段-改`）断言；保存用新字段后，级联应改 `type`。

- [ ] **Step 2: 跑测试确认 RED**

Run: `pnpm run test:selection`  
Expected: FAIL（尚无 `customer-req-source` 或仍要求 `name`）

- [ ] **Step 3: Commit**

```powershell
git add scripts/vben-migration.contract-test.cjs
git commit -m "test: 客户通用要求新列结构合同断言"
```

---

### Task 2: Data types + defaults + dictionary

**Files:**
- `apps/web-ele/src/modules/selection/data.d.ts`
- `apps/web-ele/src/modules/selection/data.js`

- [ ] **Step 1: 类型**

```ts
export interface CustomerReqItem {
  id: number;
  type: string;
  machine: string;
  process: string;
  content: string;
  source: string;
  note: string;
}
```

- [ ] **Step 2: 来源默认与种子**

```js
export const CUSTOMER_REQ_SOURCE_DEFAULTS = [
  { id: 1, name: '验收规范', sort: 1 },
  { id: 2, name: '厂外改善', sort: 2 },
  { id: 3, name: '客户要求', sort: 3 },
  { id: 4, name: '产品更新迭代', sort: 4 },
  { id: 5, name: '其他', sort: 5 },
];

export const CUSTOMER_REQ_SOURCE_OPTIONS = CUSTOMER_REQ_SOURCE_DEFAULTS.map(
  (item) => item.name,
);
```

`'customer-req'` seed 示例：

```js
'customer-req': () => [
  {
    id: 1,
    type: '输送段',
    machine: 'ALL',
    process: '',
    content: '板件有无检测，检测距离不大于 300mm',
    source: '验收规范',
    note: 'OMRON E3Z-D61 或同等级',
  },
  {
    id: 2,
    type: '掉板检测',
    machine: 'ALL',
    process: '',
    content: '传送路径中段与末端双重设置',
    source: '客户要求',
    note: '零容忍掉板要求',
  },
],
```

在 `DICTIONARY_DEFINITIONS` 的 `customer-req` 条目后插入：

```js
{
  code: 'customer-req-source',
  title: '要求来源',
  description: '客户通用要求项中的来源，全局共用',
  field: 'source',
  listIds: ['customer-req'],
  defaults: CUSTOMER_REQ_SOURCE_OPTIONS,
},
```

从 `CRUD_COLUMN_LABELS` 删除 `'customer-req'` 键（改由专用面板写死表头）。

`data.d.ts` 导出新常量类型（与现有 `FEEDBACK_TYPE_*` 并列）。

- [ ] **Step 3: Commit**

```powershell
git add apps/web-ele/src/modules/selection/data.js apps/web-ele/src/modules/selection/data.d.ts
git commit -m "feat: 客户要求来源字典与 CustomerReqItem 默认"
```

---

### Task 3: Domain normalize + saveCrud (GREEN)

**Files:**
- `apps/web-ele/src/modules/selection/domain.js`
- `apps/web-ele/src/modules/selection/domain.d.ts`
- `apps/web-ele/src/modules/selection/store.ts`

- [ ] **Step 1: `normalizeCrudItems` 增加 `customer-req` 分支**（在 feedback 分支旁）

```js
if (listId === 'customer-req') {
  const type =
    storedText(item.type).trim() ||
    createDictionaryDefaults('customer-req')[0]?.name ||
    '';
  const source =
    storedText(item.source).trim() ||
    createDictionaryDefaults('customer-req-source')[0]?.name ||
    '';
  return {
    id,
    type,
    machine: storedText(item.machine),
    process: storedText(item.process),
    content: storedText(item.content),
    source,
    note: storedText(item.note),
  };
}
```

- [ ] **Step 2: `saveCrud` 必填与来源校验**

```js
const isTimeline = listId === 'customer-feedback';
const isCustomerReq = listId === 'customer-req';
const requiredValue = isTimeline
  ? payload.problem
  : isCustomerReq
    ? payload.content
    : payload.name;
if (!storedText(requiredValue).trim())
  return { ok: false, reason: 'validation' };

// ... existing type dictionary check ...

if (listId === 'customer-req') {
  const sourceName = storedText(payload.source).trim();
  const allowedSource = getDictionaryItems('customer-req-source').some(
    (item) => item.name === sourceName,
  );
  if (!sourceName || !allowedSource) {
    return { ok: false, reason: 'validation' };
  }
}
```

- [ ] **Step 3: 类型导出**

`domain.d.ts` / `store.ts`：`getCrud` / `saveCrud` 联合类型加入 `CustomerReqItem`（从 `data.js` 导入）。

- [ ] **Step 4: 跑测试**

Run: `pnpm run test:selection`  
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/web-ele/src/modules/selection/domain.js apps/web-ele/src/modules/selection/domain.d.ts apps/web-ele/src/modules/selection/store.ts
git commit -m "feat: 客户要求归一化与保存校验改用 content/source"
```

---

### Task 4: CustomerReqPanel UI + wire Tab

**Files:**
- Create: `apps/web-ele/src/modules/selection/components/CustomerReqPanel.vue`
- Modify: `apps/web-ele/src/modules/selection/components/EntityWorkspace.vue`

- [ ] **Step 1: 新建面板**（结构对齐 `TimelinePanel.vue`，字段如下）

```ts
const form = reactive({
  type: '',
  machine: '',
  process: '',
  content: '',
  source: '',
  note: '',
});
const typeNames = computed(() => store.dictionaryNames('customer-req'));
const sourceNames = computed(() =>
  store.dictionaryNames('customer-req-source'),
);
```

表格列：要求分类 / 适用机型 / 适用制程 / 要求内容 / 来源 / 备注 / 操作  
校验失败文案：`请填写要求内容并选择有效分类与来源`  
搜索 placeholder：`搜索分类、机型、制程、内容、来源或备注`  
删除确认用 `item.content`。

- [ ] **Step 2: EntityWorkspace**

```vue
import CustomerReqPanel from './CustomerReqPanel.vue';
<!-- ... -->
<ElTabPane label="客户通用要求" lazy name="req">
  <CustomerReqPanel :entity-name="selection.item" />
</ElTabPane>
```

- [ ] **Step 3: 再跑 `pnpm run test:selection` → PASS**

- [ ] **Step 4: Commit**

```powershell
git add apps/web-ele/src/modules/selection/components/CustomerReqPanel.vue apps/web-ele/src/modules/selection/components/EntityWorkspace.vue
git commit -m "feat: 客户通用要求表格与表单对齐新列"
```

---

## Spec coverage

| Spec 项 | Task |
|---------|------|
| 新列与字段 | 2–4 |
| 来源字典可管 | 1–2 |
| 要求分类默认不变 | 2（不改 `CRUD_TYPE_OPTIONS['customer-req']`） |
| 旧数据不迁移 | 3 normalize |
| `customer-proc` 不动 | 1 断言 + 4 不改 CrudTable |
| 合同测试 | 1 |

## Notes

- 已有 localStorage 若已有旧 `customer-req` 行，打开后 `content` 为空需用户重填或清 `symtek_crud_store`。
- 字典页靠 `DICTIONARY_DEFINITIONS` 自动列出「要求来源」，无需改 `DictionaryWorkspace.vue`。
