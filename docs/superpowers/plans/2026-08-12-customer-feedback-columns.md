# 厂外反馈问题项列结构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将客户管理「厂外反馈问题项」改为：问题分类、适用机型、问题点、改善对策、反馈时间、处理状态（+ 操作）。

**Architecture:** 重写 `TimelineItem` 字段为 `type/machine/problem/measure/date/status`；更新字典默认 8 类；`normalizeCrudItems` / `saveCrud` 按新必填与校验；`TimelinePanel.vue` 表格与表单对齐；合同测试先行（TDD）。

**Tech Stack:** Vue 3、Pinia、Element Plus、localStorage `symtek_crud_store`、`scripts/vben-migration.contract-test.cjs`

---

## File map

| File | Role |
|------|------|
| `scripts/vben-migration.contract-test.cjs` | 回归：8 类默认、新字段保存/归一化、级联改名 |
| `apps/web-ele/src/modules/selection/data.js` | `FEEDBACK_TYPE_DEFAULTS` + seed `customer-feedback` |
| `apps/web-ele/src/modules/selection/data.d.ts` | `TimelineItem` 类型 |
| `apps/web-ele/src/modules/selection/domain.js` | normalize + `saveCrud` 必填 `problem` |
| `apps/web-ele/src/modules/selection/components/TimelinePanel.vue` | 表格/表单/搜索/校验文案 |

---

### Task 1: Contract tests (RED)

**Files:** `scripts/vben-migration.contract-test.cjs`

- [ ] **Step 1: 更新厂外反馈相关断言**

定位现有块（约 `feedbackTypes.length === 3` 与 `saveCrud` 用 `title`），改为：

```js
const feedbackTypes = repository.getDictionaryItems('customer-feedback')
assert.equal(feedbackTypes.length, 8)
assert.deepEqual(
  feedbackTypes.map((item) => item.name),
  [
    '感应器异常',
    '测板厚异常',
    '智能化异常',
    '选型配置异常',
    '客户要求',
    '料件损坏',
    '厂外改善',
    '其他',
  ],
)

const addedType = repository.saveDictionaryItem('customer-feedback', {
  name: '现场临时异常',
  sort: 9,
})
assert.equal(addedType.ok, true)
assert.equal(repository.getDictionaryItems('customer-feedback').length, 9)

// ... duplicateType 保持 ...

const statusTypes = repository.getDictionaryItems('customer-feedback-status')
assert.equal(statusTypes.length, 3)
assert.equal(statusTypes[0].name, '待处理')

const savedFeedback = repository.saveCrud('customer-feedback', customer, {
  type: '现场临时异常',
  machine: '六轴上板机',
  problem: '字典分类验证',
  measure: '更换真空表头',
  date: '2026-08-11',
  status: '待处理',
})
assert.equal(savedFeedback.ok, true)
assert.equal(savedFeedback.item.problem, '字典分类验证')
assert.equal(savedFeedback.item.machine, '六轴上板机')
assert.equal(savedFeedback.item.measure, '更换真空表头')
assert.equal(savedFeedback.item.title, undefined)
assert.equal(savedFeedback.item.desc, undefined)
assert.equal(savedFeedback.item.actions, undefined)

const missingProblem = repository.saveCrud('customer-feedback', customer, {
  type: '感应器异常',
  machine: '',
  problem: '  ',
  measure: '',
  date: '2026-08-12',
  status: '待处理',
})
assert.deepEqual(missingProblem, { ok: false, reason: 'validation' })

const optionalFields = repository.saveCrud('customer-feedback', customer, {
  type: '其他',
  machine: '',
  problem: '仅问题点',
  measure: '',
  date: '',
  status: '处理中',
})
assert.equal(optionalFields.ok, true)
assert.equal(optionalFields.item.machine, '')
assert.equal(optionalFields.item.measure, '')

// 级联改名断言中改查 item.type / item.status（已有）
// getCrud 断言：.some((item) => item.type === '现场临时异常-改') 保持
```

另加归一化形状（可紧挨上述保存断言）：

```js
const memory = {
  [/* 若测试里已有 createRepository 用空 storage，可直接 save 后 get */]: null,
}
// 更稳妥：对 getCrud 结果断言 keys
const row = repository
  .getCrud('customer-feedback', customer)
  .find((item) => item.problem === '字典分类验证')
assert.deepEqual(Object.keys(row).sort(), [
  'date',
  'id',
  'machine',
  'measure',
  'problem',
  'status',
  'type',
].sort())
```

- [ ] **Step 2: 跑测试确认 RED**

Run: `pnpm run test:selection`  
Expected: FAIL（默认分类仍为 3 项，或 `title` 必填导致新断言失败）

- [ ] **Step 3: Commit**

```powershell
git add scripts/vben-migration.contract-test.cjs
git commit -m "test: 厂外反馈新列结构合同断言"
```

---

### Task 2: Data defaults + TimelineItem type (GREEN partial)

**Files:**
- `apps/web-ele/src/modules/selection/data.js`
- `apps/web-ele/src/modules/selection/data.d.ts`

- [ ] **Step 1: 更新类型**

`data.d.ts` 中：

```ts
export interface TimelineItem {
  id: number;
  type: string;
  machine: string;
  problem: string;
  measure: string;
  date: string;
  status: string;
}
```

- [ ] **Step 2: 更新默认分类与种子**

`data.js`：

```js
export const FEEDBACK_TYPE_DEFAULTS = [
  { id: 1, name: '感应器异常', sort: 1 },
  { id: 2, name: '测板厚异常', sort: 2 },
  { id: 3, name: '智能化异常', sort: 3 },
  { id: 4, name: '选型配置异常', sort: 4 },
  { id: 5, name: '客户要求', sort: 5 },
  { id: 6, name: '料件损坏', sort: 6 },
  { id: 7, name: '厂外改善', sort: 7 },
  { id: 8, name: '其他', sort: 8 },
];
```

`'customer-feedback'` seed：

```js
'customer-feedback': () => [
  {
    id: 1,
    type: '选型配置异常',
    machine: '六轴上板机',
    problem: '快速运行时吸板失败率偏高，影响产能。',
    measure: '更换快速响应型真空表头后恢复稳定。',
    date: '2024-10-15',
    status: '已解决',
  },
  {
    id: 2,
    type: '感应器异常',
    machine: 'AOI 段',
    problem: '光纤传感器镜头积灰导致定位偏移。',
    measure: '清洁镜头并增加每周清洁提醒。',
    date: '2024-09-22',
    status: '已解决',
  },
],
```

- [ ] **Step 3: Commit**

```powershell
git add apps/web-ele/src/modules/selection/data.js apps/web-ele/src/modules/selection/data.d.ts
git commit -m "feat: 厂外反馈字典默认与 TimelineItem 新字段"
```

---

### Task 3: Domain normalize + saveCrud (GREEN)

**Files:** `apps/web-ele/src/modules/selection/domain.js`

- [ ] **Step 1: 改 `normalizeCrudItems` 中 `customer-feedback` 分支**

```js
if (listId === 'customer-feedback') {
  const statusAliases = {
    pending: '待处理',
    processing: '处理中',
    resolved: '已解决',
  };
  const rawStatus = storedText(item.status).trim();
  const status =
    statusAliases[rawStatus] ||
    rawStatus ||
    createDictionaryDefaults('customer-feedback-status')[0]?.name ||
    '待处理';
  const type =
    storedText(item.type).trim() ||
    createDictionaryDefaults('customer-feedback')[0]?.name ||
    '';
  return {
    id,
    type,
    machine: storedText(item.machine),
    problem: storedText(item.problem),
    measure: storedText(item.measure),
    date: storedText(item.date),
    status,
  };
}
```

- [ ] **Step 2: 改 `saveCrud` 必填**

```js
const isTimeline = listId === 'customer-feedback';
const requiredValue = isTimeline ? payload.problem : payload.name;
if (!storedText(requiredValue).trim())
  return { ok: false, reason: 'validation' };
```

其余 `type` / `status` 字典校验保持不变。

- [ ] **Step 3: 跑测试确认 GREEN**

Run: `pnpm run test:selection`  
Expected: PASS

- [ ] **Step 4: Commit**

```powershell
git add apps/web-ele/src/modules/selection/domain.js
git commit -m "feat: 厂外反馈归一化与保存校验改用 problem"
```

---

### Task 4: TimelinePanel UI

**Files:** `apps/web-ele/src/modules/selection/components/TimelinePanel.vue`

- [ ] **Step 1: 表单与搜索改字段**

```ts
const form = reactive({
  type: '',
  machine: '',
  problem: '',
  measure: '',
  date: '',
  status: '',
});

const filteredItems = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  if (!value) return items.value;
  return items.value.filter((item) =>
    [
      item.type,
      item.machine,
      item.problem,
      item.measure,
      item.date,
      item.status,
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(value),
  );
});

function failureMessage(reason: string) {
  if (reason === 'storage') return '浏览器本地存储不可用，本次修改未保存';
  if (reason === 'stale') return '该反馈已被其他页面删除';
  if (reason === 'validation') return '请填写问题点并选择有效分类与处理状态';
  return '保存失败，请重试';
}

function resetForm() {
  editId.value = undefined;
  Object.assign(form, {
    type: defaultType.value,
    machine: '',
    problem: '',
    measure: '',
    date: formatLocalDate(new Date()),
    status: defaultStatus.value,
  });
}

function saveItem() {
  const payload = {
    ...form,
    type: form.type.trim() || defaultType.value,
    machine: form.machine.trim(),
    problem: form.problem.trim(),
    measure: form.measure.trim(),
    status: form.status.trim() || defaultStatus.value,
  };
  // store.saveCrud 同现有
}

async function deleteItem(item: TimelineItem) {
  await ElMessageBox.confirm(
    `确认删除“${item.problem || '该反馈'}”吗？`,
    '删除反馈',
    { cancelButtonText: '取消', confirmButtonText: '删除', type: 'warning' },
  );
  // deleteCrud 同现有
}
```

- [ ] **Step 2: 表格列与弹窗**

表格列顺序：

1. `问题分类` → `type`
2. `适用机型` → `machine`
3. `问题点` → `problem`
4. `改善对策` → `measure`
5. `反馈时间` → `date`
6. `处理状态` → `status`（保留 ElTag）
7. `操作`

弹窗字段：分类、适用机型（Input）、问题点（textarea required）、改善对策（textarea）、反馈时间（DatePicker）、处理状态。

搜索 placeholder：`搜索分类、机型、问题点、对策、时间或状态`

- [ ] **Step 3: 浏览器 spot-check（可选）**

打开客户 → 庆鼎 → 厂外反馈：列与新增弹窗符合设计；清空本地 `symtek_crud_store` 后可见新种子与 8 类字典。

- [ ] **Step 4: Commit**

```powershell
git add apps/web-ele/src/modules/selection/components/TimelinePanel.vue
git commit -m "feat: 厂外反馈表格与表单对齐新列"
```

---

## Spec coverage

| Spec 项 | Task |
|---------|------|
| 新列与字段名 | 2–4 |
| 8 类字典默认、可改 | 1–2 |
| 处理状态保留 + 文案 | 4 |
| 旧数据不迁移 | 3 normalize 忽略旧字段 |
| 合同测试 | 1 |

## Notes for implementer

- 已有浏览器 localStorage 若已写入旧字典/旧反馈，不会自动变成 8 类；需清 `symtek_crud_store` 或在字典管理手动调整。规格明确不迁旧数据。
- 全局搜索不索引单条反馈（现状如此），只改页内搜索。
