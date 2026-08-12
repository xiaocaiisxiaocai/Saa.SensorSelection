# 机型结构行列表结构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 结构 Tab 改为：功能作用、传感器类型、规格、作用、附加图片、备注；注意事项「注意分类」改自由文本并去掉类型预置。

**Architecture:** 扩展 `MachineSectionRow`；`normalizeMachineSectionRows` / `saveMachineSectionRow` 按 `allowImage`（结构 vs 注意事项）分支字段与校验；`MachineSectionTable.vue` 切换列/表单；删除 `machineSectionTypeOptions` 预置。

**Tech Stack:** Vue 3、Pinia、Element Plus、localStorage、`scripts/vben-migration.contract-test.cjs`

---

## File map

| File | Role |
|------|------|
| `scripts/vben-migration.contract-test.cjs` | 更新机型行断言 |
| `apps/web-ele/src/modules/selection/data.js` / `data.d.ts` | 新字段类型、种子；删类型预置 |
| `apps/web-ele/src/modules/selection/domain.js` | normalize + save |
| `apps/web-ele/src/modules/selection/store.ts` | 搜索索引字段 |
| `apps/web-ele/src/modules/selection/components/MachineSectionTable.vue` | UI |

---

### Task 1: Contract tests (RED)

**Files:** `scripts/vben-migration.contract-test.cjs`

- [ ] **Step 1: 替换机型行相关 save 断言**

```js
const saved = repository.saveMachineSectionRow(1, machineName, {
  role: '进板检测',
  sensorType: '漫反射传感器',
  spec: 'OMRON E3Z-D61',
  purpose: '安装于进板口',
  note: '',
  image: {
    dataUrl: 'data:image/png;base64,aaa',
    fileName: 'a.png',
    mimeType: 'image/png',
    size: 3,
  },
})
assert.equal(saved.ok, true)
assert.equal(saved.item.role, '进板检测')
assert.equal(saved.item.sensorType, '漫反射传感器')
assert.equal(Boolean(saved.item.image?.dataUrl), true)
assert.equal(saved.item.type, undefined)
assert.equal(saved.item.name, undefined)

const missingRole = repository.saveMachineSectionRow(1, machineName, {
  role: '  ',
  sensorType: '有类型',
  spec: '',
  purpose: '',
  note: '',
})
assert.deepEqual(missingRole, { ok: false, reason: 'validation' })

const notesSave = repository.saveMachineSectionRow(4, machineName, {
  role: '自由注意分类',
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
assert.equal(notesSave.item.role, '自由注意分类')
assert.equal(notesSave.item.name, '无图')
assert.equal(notesSave.item.image == null, true)

// extraRow / onlyRow / search hits 同步改用新字段：
// structure: role + sensorType；title 用 sensorType 或 role；sub 含 role
const extraRow = repository.saveMachineSectionRow(
  extraSection.item.id,
  machineName,
  { role: '其他', sensorType: '专属行', spec: '', purpose: '', note: '' },
)
assert.equal(
  repository
    .getMachineSectionRows(extraSection.item.id, '中间六轴机-改')
    .some((item) => item.sensorType === '专属行'),
  true,
)

const onlyRow = repository.saveMachineSectionRow(1, '仅行数据机', {
  role: '进板检测',
  sensorType: '唯一行',
  spec: '',
  purpose: '',
  note: '',
})

// machineSectionHits:
title: row.sensorType || row.name || row.role
sub: [name, section.name, row.role].filter(Boolean).join(' · ')
```

种子迁移断言：`conveyorRows` 在新种子下仍 `length >= 1`，且行含 `role`/`sensorType`。

- [ ] **Step 2:** `pnpm run test:selection` → FAIL  
- [ ] **Step 3:** Commit `test: 机型结构新列合同断言`

---

### Task 2: Types + seeds + remove presets

**Files:** `data.d.ts`, `data.js`

- [ ] **Step 1: 类型**

```ts
export interface MachineSectionRow {
  id: number;
  role: string;
  sensorType: string;
  spec: string;
  purpose: string;
  name: string;
  desc: string;
  note: string;
  image?: MachineRowImage | null;
}
```

- [ ] **Step 2: 种子示例（conveyor）**

```js
{
  id: 1,
  role: '进板检测',
  sensorType: '漫反射传感器',
  spec: 'OMRON E3Z-D61',
  purpose: '安装于进板口',
  name: '',
  desc: '',
  note: '板件前缘到位信号',
}
```

`machine-arm` / `machine-platform` / `machine-notes` 同样重写；notes 用 `role`+`name`+`desc`+`note`，结构字段空串。

- [ ] **Step 3: 删除** `machineSectionTypeOptions` 函数及 `CRUD_TYPE_OPTIONS` 的 `machine-conveyor`/`machine-arm`/`machine-platform`/`machine-notes`（确认无其它引用）；删除 `data.d.ts` 对应导出。

- [ ] **Step 4:** Commit `feat: MachineSectionRow 新字段与种子`

---

### Task 3: Domain normalize + save (GREEN)

**Files:** `domain.js`（必要时 `domain.d.ts`）

- [ ] **Step 1: normalize**

```js
const row = {
  id,
  role: storedText(item.role),
  sensorType: storedText(item.sensorType),
  spec: storedText(item.spec),
  purpose: storedText(item.purpose),
  name: storedText(item.name),
  desc: storedText(item.desc),
  note: storedText(item.note),
};
if (allowImage) {
  const image = normalizeMachineRowImage(item.image);
  if (image) row.image = image;
}
// filter:
// allowImage → role && sensorType
// !allowImage → role && name
```

- [ ] **Step 2: saveMachineSectionRow**

```js
const allowImage = sectionAllowsImage(numericId);
const role = storedText(payload.role).trim();
if (allowImage) {
  const sensorType = storedText(payload.sensorType).trim();
  if (!role || !sensorType) return { ok: false, reason: 'validation' };
} else {
  const name = storedText(payload.name).trim();
  if (!role || !name) return { ok: false, reason: 'validation' };
}

const base = {
  id: editId || nextAvailableId(items),
  role,
  sensorType: storedText(payload.sensorType),
  spec: storedText(payload.spec),
  purpose: storedText(payload.purpose),
  name: storedText(payload.name),
  desc: storedText(payload.desc),
  note: storedText(payload.note),
};
// image 处理保持现有逻辑
```

- [ ] **Step 3:** `pnpm run test:selection` → PASS  
- [ ] **Step 4:** Commit `feat: 机型行归一化与按 kind 校验`

---

### Task 4: UI + search index

**Files:** `MachineSectionTable.vue`, `store.ts`

- [ ] **Step 1: labels**

结构：`role=功能作用`、`sensorType=传感器类型`、`spec=规格`、`purpose=作用`、`image`、`note`  
注意事项：`role=注意分类`、`name=事项名称`、`desc=说明`、`note=备注`

- [ ] **Step 2: 表单**  
去掉 `ElSelect` / `typeOptions`；结构必填 role+sensorType；注意事项必填 role+name。

- [ ] **Step 3: 表格列按 labels 渲染；删除确认文案用 `sensorType || name || role`。

- [ ] **Step 4: `store.ts` 搜索 hit：

```ts
title: row.sensorType || row.name || row.role,
sub: [machineName, section.name, row.role].filter(Boolean).join(' · '),
```

合同测试里构建 `machineSectionHits` 的同样逻辑一并改。

- [ ] **Step 5:** `pnpm run test:selection` → PASS  
- [ ] **Step 6:** Commit `feat: 机型结构表格对齐新列`

---

## Spec coverage

| Spec | Task |
|------|------|
| 结构六列 | 2–4 |
| 注意分类自由文本 | 3–4 |
| 删类型预置 | 2 |
| 旧数据不迁 | 2–3 |
| 合同测试 | 1 |
