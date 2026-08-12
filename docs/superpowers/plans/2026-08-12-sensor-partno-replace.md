# Sensor 料号 / 替换现用 / 停用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional 料号, 备选→替换现用（必填问题点，旧现用变停用，双向关联），并支持停用 Tab 与搜索。

**Architecture:** Extend `SensorItem` + `normalizeSensorItems`; add `replaceSensorCurrent` in domain repository with snapshot rollback; seed/ensure `停用` in `sensor-status`; wire Pinia + `SensorCatalog.vue` UI; extend contract tests first (TDD).

**Tech Stack:** Vue 3, Pinia, Element Plus, localStorage `symtek_crud_store`, `scripts/vben-migration.contract-test.cjs`

---

## File map

| File | Role |
|------|------|
| `scripts/vben-migration.contract-test.cjs` | Regression: partNumber, replace, search |
| `apps/web-ele/src/modules/selection/data.js` / `data.d.ts` | `SENSOR_STATUS_OPTIONS` + `SensorItem` fields |
| `apps/web-ele/src/modules/selection/domain.js` / `domain.d.ts` | normalize, ensure 停用, `replaceSensorCurrent`, search index, save preserve |
| `apps/web-ele/src/modules/selection/store.ts` | expose `replaceSensorCurrent` |
| `apps/web-ele/src/modules/selection/components/SensorCatalog.vue` | 料号列/表单、替换弹窗、关联展示、搜索 haystack、statusTag |
| `apps/web-ele/src/modules/selection/selection.css` | minor link/note styles if needed |

---

### Task 1: Contract tests (RED)

**Files:** `scripts/vben-migration.contract-test.cjs`

- [x] Add assertions after existing sensor tests:
  - `saveSensor` with `partNumber` persists; empty/missing normalizes to `''`
  - status dict includes `停用` (after getSensors / getDictionaryItems)
  - `replaceSensorCurrent(altId, currentId, note)` → alt=`现用`+`replacesId`, current=`停用`+`replacedById`, both `problemNote`
  - empty note / non-现用 target → `{ ok: false, reason: 'validation' }`
  - `buildSearchIndex` sub/title includes partNumber and 停用 status for replaced item

- [x] Run `pnpm run test:selection` → expect FAIL

### Task 2: Domain data + normalize + replace (GREEN)

**Files:** `data.js`, `data.d.ts`, `domain.js`, `domain.d.ts`

- [x] `SENSOR_STATUS_OPTIONS = ['现用', '备选', '停用']`
- [x] Extend `SensorItem`; normalize new fields (`partNumber` text; ids null|number; `problemNote`/`replacedAt` text)
- [x] `saveSensor`: accept `partNumber`; preserve replacement fields when omitted (like `sopId`)
- [x] `ensureSensorStatus停用` in `getDictionaryItems('sensor-status')` (append + persist once)
- [x] `replaceSensorCurrent(alternateId, currentId, problemNote)`
- [x] `buildSearchIndex`: include `partNumber`, `problemNote` in title/sub
- [x] Run tests → PASS

### Task 3: Store + UI

**Files:** `store.ts`, `SensorCatalog.vue`, `selection.css`

- [x] Store wraps `replaceSensorCurrent`
- [x] 料号 column after 状态; form field; search haystack
- [x] 备选行「替换现用」dialog: current select (same type first) + problemNote
- [x] Show replace relation text; 停用 tab shows 问题点 column
- [x] Fix `statusTagType` so「停用」不误判为 success（勿用 `includes('用')`）
- [x] Widen 操作 column for third button

### Task 4: Verify

- [x] `pnpm run test:selection`
- [x] `pnpm run check:type`
- [x] eslint on touched files

No git commit unless user asks.
