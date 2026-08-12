# 制程注意事项列结构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将客户管理「制程注意事项」改为：制程分类、制程作用、制程特性、sensor使用注意事项、备注（+ 操作）。

**Architecture:** 新增 `CustomerProcItem`；`normalizeCrudItems` / `saveCrud` 对 `customer-proc` 独立分支；新建 `CustomerProcPanel.vue`；删除仅服务旧结构的 `CrudTable`。合同测试先行（TDD）。

**Tech Stack:** Vue 3、Pinia、Element Plus、localStorage `symtek_crud_store`、`scripts/vben-migration.contract-test.cjs`

---

## File map

| File | Role |
|------|------|
| `scripts/vben-migration.contract-test.cjs` | 替换旧 `savedProc` 断言为新字段 |
| `apps/web-ele/src/modules/selection/data.js` / `data.d.ts` | 类型、种子；移除 `CRUD_COLUMN_LABELS` |
| `apps/web-ele/src/modules/selection/domain.js` / `domain.d.ts` | normalize + 双必填校验 |
| `apps/web-ele/src/modules/selection/store.ts` | 联合类型含 `CustomerProcItem` |
| `apps/web-ele/src/modules/selection/components/CustomerProcPanel.vue` | 新建 |
| `apps/web-ele/src/modules/selection/components/EntityWorkspace.vue` | 换组件 |
| `apps/web-ele/src/modules/selection/components/CrudTable.vue` | 删除 |

---

### Task 1: Contract tests (RED)

**Files:** `scripts/vben-migration.contract-test.cjs`

- [ ] **Step 1: 替换现有 `savedProc` 块**（约 454 行）为：

```js
const savedProc = repository.saveCrud('customer-proc', customer, {
  type: 'DES 制程',
  role: '板件传送检测',
  feature: '进出口设置漫反射传感器',
  sensorNote: '注意检测距离',
  note: '防止空喷损耗',
})
assert.equal(savedProc.ok, true)
assert.equal(savedProc.item.role, '板件传送检测')
assert.equal(savedProc.item.feature, '进出口设置漫反射传感器')
assert.equal(savedProc.item.sensorNote, '注意检测距离')
assert.equal(savedProc.item.name, undefined)
assert.equal(savedProc.item.desc, undefined)

const procRow = repository
  .getCrud('customer-proc', customer)
  .find((item) => item.role === '板件传送检测')
assert.ok(procRow)
assert.deepEqual(Object.keys(procRow).sort(), [
  'feature',
  'id',
  'note',
  'role',
  'sensorNote',
  'type',
])

const missingRole = repository.saveCrud('customer-proc', customer, {
  type: 'AOI 制程',
  role: '  ',
  feature: '有特性',
  sensorNote: '',
  note: '',
})
assert.deepEqual(missingRole, { ok: false, reason: 'validation' })

const missingFeature = repository.saveCrud('customer-proc', customer, {
  type: 'AOI 制程',
  role: '有作用',
  feature: '  ',
  sensorNote: '',
  note: '',
})
assert.deepEqual(missingFeature, { ok: false, reason: 'validation' })

const optionalProc = repository.saveCrud('customer-proc', customer, {
  type: '通用',
  role: '仅作用与特性',
  feature: '特性正文',
  sensorNote: '',
  note: '',
})
assert.equal(optionalProc.ok, true)
assert.equal(optionalProc.item.sensorNote, '')
assert.equal(optionalProc.item.note, '')
```

- [ ] **Step 2:** `pnpm run test:selection` → FAIL  
- [ ] **Step 3:** Commit `test: 制程注意事项新列结构合同断言`

---

### Task 2: Data types + seed

**Files:** `data.d.ts`, `data.js`

- [ ] **Step 1: 类型**

```ts
export interface CustomerProcItem {
  id: number;
  type: string;
  role: string;
  feature: string;
  sensorNote: string;
  note: string;
}
```

- [ ] **Step 2: 种子**（示例可压缩为 2 条）

```js
'customer-proc': () => [
  {
    id: 1,
    type: 'DES 制程',
    role: '板件传送检测',
    feature: '进出口设置漫反射传感器',
    sensorNote: '',
    note: '防止空喷损耗',
  },
  {
    id: 2,
    type: 'AOI 制程',
    role: '板件定位',
    feature: '定位精度不大于 0.1mm',
    sensorNote: '镜头保持清洁',
    note: 'Keyence FS 系列',
  },
],
```

删除整个 `CRUD_COLUMN_LABELS` 导出（及 `data.d.ts` 对应声明）。

- [ ] **Step 3:** Commit `feat: CustomerProcItem 类型与制程注意种子`

---

### Task 3: Domain + types (GREEN)

**Files:** `domain.js`, `domain.d.ts`, `store.ts`

- [ ] **Step 1: normalize 分支**

```js
if (listId === 'customer-proc') {
  const type =
    storedText(item.type).trim() ||
    createDictionaryDefaults('customer-proc')[0]?.name ||
    '';
  return {
    id,
    type,
    role: storedText(item.role),
    feature: storedText(item.feature),
    sensorNote: storedText(item.sensorNote),
    note: storedText(item.note),
  };
}
```

- [ ] **Step 2: saveCrud 必填**

```js
const isTimeline = listId === 'customer-feedback';
const isCustomerReq = listId === 'customer-req';
const isCustomerProc = listId === 'customer-proc';

if (isCustomerProc) {
  if (
    !storedText(payload.role).trim() ||
    !storedText(payload.feature).trim()
  ) {
    return { ok: false, reason: 'validation' };
  }
} else {
  const requiredValue = isTimeline
    ? payload.problem
    : isCustomerReq
      ? payload.content
      : payload.name;
  if (!storedText(requiredValue).trim())
    return { ok: false, reason: 'validation' };
}
```

（保持现有 `customer-req` / `customer-feedback` 的字典附加校验不变。）

- [ ] **Step 3:** 联合类型加入 `CustomerProcItem`（`domain.d.ts` / `store.ts` / `data.d.ts` 的 `CRUD_DEFAULTS`）

- [ ] **Step 4:** `pnpm run test:selection` → PASS  
- [ ] **Step 5:** Commit `feat: 制程注意归一化与双必填校验`

---

### Task 4: UI + 删除 CrudTable

**Files:** Create `CustomerProcPanel.vue`；Modify `EntityWorkspace.vue`；Delete `CrudTable.vue`

- [ ] **Step 1: 面板**（照抄 `CustomerReqPanel` 结构）

字段：`type/role/feature/sensorNote/note`  
字典：`customer-proc`  
必填：分类、制程作用、制程特性  
表头：制程分类 / 制程作用 / 制程特性 / sensor使用注意事项 / 备注 / 操作  
文案：`请填写制程作用、制程特性并选择有效分类`

- [ ] **Step 2: EntityWorkspace**

```vue
import CustomerProcPanel from './CustomerProcPanel.vue';
<ElTabPane label="制程注意事项" lazy name="proc">
  <CustomerProcPanel :entity-name="selection.item" />
</ElTabPane>
```

移除 `CrudTable` import。

- [ ] **Step 3: 删除** `CrudTable.vue`；确认无引用。

- [ ] **Step 4:** `pnpm run test:selection` → PASS  
- [ ] **Step 5:** Commit `feat: 制程注意事项对齐新列并移除 CrudTable`

---

## Spec coverage

| Spec | Task |
|------|------|
| 新列与双必填 | 1–4 |
| 分类字典不变 | 2 |
| 旧数据不迁 | 3 |
| 删死代码 CrudTable | 4 |
| 合同测试 | 1 |
