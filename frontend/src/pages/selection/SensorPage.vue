<script setup lang="ts">
import { message, type TableColumnType } from 'ant-design-vue';
import {
  Columns3,
  Download,
  Eye,
  Pencil,
  Replace,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import {
  findSensorStatusName,
  isSensorStatus,
  sensorStatusRank,
  type SensorFileItem,
  type SensorItem,
} from '@/domain';
import { fieldError } from '@/pages/shared/form';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import { useSyncedQuery } from '@/pages/shared/use-synced-query';
import SensorSopPanel from '@/pages/selection/sensor/SensorSopPanel.vue';
import SensorSopFilePanel from '@/pages/selection/sensor/SensorSopFilePanel.vue';
import Sensor3dPanel from '@/pages/selection/sensor/Sensor3dPanel.vue';
import { downloadSensorExcel } from '@/pages/selection/sensor/sensor-excel';
import {
  cellText,
  PAGE_SIZE_OPTIONS,
  rowClick,
  scrollX,
  sortFromChange,
  sortOrderOf,
  sortRows,
  type TableSortState,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { APdfViewer } from '@/ui';

import '../shared/selection-page.css';

const route = useRoute();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const mainTab = ref(initialTab());
const query = ref(String(route.query.model || ''));
const sensorTypeFilters = ref<Array<string | number>>(
  initialSensorTypeFilters(),
);
const dialogOpen = ref(false);
const replaceOpen = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
const replaceValidationAttempted = ref(false);
const focusSopId = ref<null | number>(initialSopId());
const focusModel3dId = ref<null | number>(initialModel3dId());
const linkedPreview = ref<{
  file: SensorFileItem;
  kind: '3D' | '型录';
} | null>(null);
const replaceSource = ref<SensorItem | null>(null);
const page = ref(1);
const pageSize = ref(20);
const sort = ref<TableSortState | null>(null);

// ── 列可见性 ──────────────────────────────────────────────────────
// 型号表格列数多、内容长，1440px 下仍要横向滚动才能看到「关联型录/3D」。
// 状态/料号/类型/品牌/型号/操作是识别与操作的必需列，不提供隐藏；
// 其余描述性列允许按需隐藏，选择记忆在本地。
const HIDEABLE_COLUMNS: { key: string; label: string }[] = [
  { key: 'relation', label: '替换关系' },
  { key: 'spec', label: '规格参数' },
  { key: 'feature', label: '特性与注意' },
  { key: 'scene', label: '适用场景' },
  { key: 'sop', label: '关联型录' },
  { key: 'model3d', label: '关联 3D' },
];
const COLUMN_VISIBILITY_STORAGE_KEY =
  'selection:sensor-table:hidden-columns:v1';
const hiddenColumnKeys = ref<Set<string>>(restoreHiddenColumns());
const columnMenuOpen = ref(false);

function restoreHiddenColumns(): Set<string> {
  try {
    const stored = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
    if (!stored) return new Set();
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return new Set();
    const allowed = new Set(HIDEABLE_COLUMNS.map((column) => column.key));
    return new Set(
      parsed.filter(
        (key): key is string => typeof key === 'string' && allowed.has(key),
      ),
    );
  } catch {
    return new Set();
  }
}

function persistHiddenColumns() {
  try {
    localStorage.setItem(
      COLUMN_VISIBILITY_STORAGE_KEY,
      JSON.stringify([...hiddenColumnKeys.value]),
    );
  } catch {
    // 本地存储不可用时，本次会话内的选择仍然有效，静默忽略即可。
  }
}

function toggleColumnVisible(key: string, visible: boolean) {
  const next = new Set(hiddenColumnKeys.value);
  if (visible) next.delete(key);
  else next.add(key);
  hiddenColumnKeys.value = next;
  persistHiddenColumns();
}

const hiddenColumnCount = computed(() => hiddenColumnKeys.value.size);
const form = reactive({
  brand: '',
  feature: '',
  model: '',
  partNumber: '',
  scene: '',
  sensorType: '',
  sopId: null as number | null,
  model3dId: null as number | null,
  spec: '',
  status: '',
});
const dirtyGuard = useDirtyGuard(form);
const replaceForm = reactive({
  note: '',
  targetId: null as number | null,
});
const replaceDirtyGuard = useDirtyGuard(replaceForm);

const statusNames = computed(() => {
  const names = store.dictionaryNames('sensor-status');
  return [...names].sort((left, right) => {
    return sensorStatusRank(left) - sensorStatusRank(right);
  });
});
const typeOptions = computed(() =>
  store
    .dictionaryNames('sensor-type')
    .map((name) => ({ label: name, value: name })),
);
// 感应器类型圆点：按类型名稳定地映射到 antd 的预设色
const TYPE_ACCENT_COLORS = [
  'cyan',
  'geekblue',
  'purple',
  'magenta',
  'gold',
] as const;
function typeAccent(label: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return TYPE_ACCENT_COLORS[(hash >>> 0) % TYPE_ACCENT_COLORS.length]!;
}
const statusOptions = computed(() =>
  statusNames.value.map((name) => ({ label: name, value: name })),
);
const statusFilterOptions = computed(() => [
  { label: '全部', value: '全部' },
  ...statusOptions.value,
]);
const sopOptions = computed(() =>
  store.sensorSops.map((item) => ({ label: item.title, value: item.id })),
);
const model3dOptions = computed(() =>
  store.sensor3dFiles.map((item) => ({ label: item.title, value: item.id })),
);
const resourceTabs = ['sop-library', 'sop', '3d'];
const lastStatusTab = ref(
  resourceTabs.includes(mainTab.value)
    ? findSensorStatusName(statusNames.value, 'current') || '全部'
    : mainTab.value,
);
const sectionTab = computed({
  get: () => (resourceTabs.includes(mainTab.value) ? mainTab.value : 'models'),
  set: (value: string) => {
    mainTab.value = value === 'models' ? lastStatusTab.value : value;
  },
});
const sensorById = computed(() => {
  const map = new Map<number, SensorItem>();
  for (const item of store.sensors) map.set(item.id, item);
  return map;
});
// 搜索时每一行都要取型录 / 3D 标题，用 Map 查找，避免每行线性扫描。
const sopTitleById = computed(() => {
  const map = new Map<number, string>();
  for (const item of store.sensorSops) map.set(item.id, item.title);
  return map;
});
const model3dTitleById = computed(() => {
  const map = new Map<number, string>();
  for (const item of store.sensor3dFiles) map.set(item.id, item.title);
  return map;
});
const showDisabledDetails = computed(() =>
  isSensorStatus(mainTab.value, 'disabled'),
);
const statusFilter = computed({
  get: () => (resourceTabs.includes(mainTab.value) ? '全部' : mainTab.value),
  set: (value: string | number | null) => {
    mainTab.value = String(value || '全部');
  },
});
const hasActiveFilters = computed(
  () =>
    mainTab.value !== '全部' ||
    sensorTypeFilters.value.length > 0 ||
    Boolean(query.value.trim()),
);

const items = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  const status = mainTab.value === '全部' ? '全部' : mainTab.value;
  return store.sensors.filter((item) => {
    if (status !== '全部' && item.status !== status) return false;
    if (
      sensorTypeFilters.value.length > 0 &&
      !sensorTypeFilters.value.includes(item.sensorType)
    ) {
      return false;
    }
    const related = relatedSensor(item);
    const haystack = [
      item.status,
      item.partNumber,
      item.sensorType,
      item.brand,
      item.model,
      item.spec,
      item.feature,
      item.scene,
      item.problemNote,
      related?.model,
      related?.brand,
      related?.partNumber,
      sopTitle(item.sopId),
      model3dTitle(item.model3dId),
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN');
    return !value || haystack.includes(value);
  });
});
// 排序必须发生在分页切片之前，否则只会把当前这一页重排。
const sortedItems = computed(() => sortRows(items.value, sort.value));
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedItems.value.slice(start, start + pageSize.value);
});
const columns = computed<TableColumnType[]>(() => {
  const baseColumns: TableColumnType[] = [
    {
      key: 'status',
      dataIndex: 'status',
      title: '状态',
      width: 88,
      fixed: 'left',
      sorter: true,
      sortOrder: sortOrderOf(sort.value, 'status'),
    },
    {
      key: 'partNumber',
      dataIndex: 'partNumber',
      title: '料号',
      width: 120,
      sorter: true,
      sortOrder: sortOrderOf(sort.value, 'partNumber'),
    },
    {
      key: 'sensorType',
      dataIndex: 'sensorType',
      title: '感应器类型',
      width: 136,
      sorter: true,
      sortOrder: sortOrderOf(sort.value, 'sensorType'),
    },
    {
      key: 'brand',
      dataIndex: 'brand',
      title: '品牌',
      width: 88,
      sorter: true,
      sortOrder: sortOrderOf(sort.value, 'brand'),
    },
    {
      key: 'model',
      dataIndex: 'model',
      title: '型号',
      width: 140,
      sorter: true,
      sortOrder: sortOrderOf(sort.value, 'model'),
    },
    ...(showDisabledDetails.value
      ? [
          {
            key: 'replacedAt',
            dataIndex: 'replacedAt',
            title: '停用时间',
            width: 112,
            sorter: true,
            sortOrder: sortOrderOf(sort.value, 'replacedAt'),
          },
          {
            key: 'problemNote',
            dataIndex: 'problemNote',
            title: '停用原因',
            width: 180,
          },
        ]
      : []),
    // 以下三列内容都很短（多数是「—」或一个文件名），固定宽度，别让它们
    // 按比例分走多余空间——那些空间应该留给规格参数/特性与注意。
    { key: 'relation', dataIndex: 'relation', title: '替换关系', width: 180 },
    { key: 'spec', dataIndex: 'spec', title: '规格参数', width: 180 },
    { key: 'feature', dataIndex: 'feature', title: '特性与注意', width: 200 },
    { key: 'scene', dataIndex: 'scene', title: '适用场景', width: 160 },
    { key: 'sop', dataIndex: 'sop', title: '关联型录', width: 140 },
    { key: 'model3d', dataIndex: 'model3d', title: '关联 3D', width: 140 },
  ];
  const cols = baseColumns.filter(
    (column) => !hiddenColumnKeys.value.has(String(column.key)),
  );
  if (writable.value) {
    cols.push({ key: 'actions', title: '操作', width: 96, fixed: 'right' });
  }
  return cols;
});
const replaceCandidates = computed(() => {
  const source = replaceSource.value;
  if (!source) return [];
  const currents = store.sensors.filter(
    (item) => isSensorStatus(item.status, 'current') && item.id !== source.id,
  );
  return currents.map((item) => ({
    value: item.id,
    label: `${item.brand} ${item.model}`,
  }));
});

useSyncedQuery(() => {
  if (mainTab.value === 'sop-library') {
    return { tab: 'sop-library' };
  }
  if (mainTab.value === 'sop') {
    return {
      tab: 'sop',
      sopId: focusSopId.value ? String(focusSopId.value) : undefined,
    };
  }
  if (mainTab.value === '3d') {
    return {
      tab: '3d',
      model3dId: focusModel3dId.value
        ? String(focusModel3dId.value)
        : undefined,
    };
  }
  return {
    tab: isSensorStatus(mainTab.value, 'current') ? undefined : mainTab.value,
    model: query.value.trim() || undefined,
    sensorTypes: sensorTypeFilters.value.length
      ? sensorTypeFilters.value.map(String).join(',')
      : undefined,
  };
});

watch(
  () => String(route.query.model || ''),
  (model) => {
    // 搜索框输入会经 useSyncedQuery 回写 ?model=，那次变化与当前搜索词相同，
    // 不能当成外部深链接把状态页签重置为“全部”。
    if (!model || model === query.value.trim()) return;
    mainTab.value = '全部';
    query.value = model;
  },
);
watch(
  () => String(route.query.sensorTypes || ''),
  (sensorTypes) => {
    const next = parseSensorTypeFilters(sensorTypes);
    if (next.join(',') !== sensorTypeFilters.value.map(String).join(',')) {
      sensorTypeFilters.value = next;
    }
  },
);
watch(
  () => [route.query.tab, route.query.sopId, route.query.model3dId] as const,
  ([tab, sopId, model3dId]) => {
    const nextTab = String(tab || '');
    if (nextTab === 'sop-library') {
      mainTab.value = 'sop-library';
    } else if (nextTab === 'sop') {
      mainTab.value = 'sop';
      const id = Number(sopId);
      focusSopId.value = Number.isSafeInteger(id) && id > 0 ? id : null;
    }
    if (nextTab === '3d') {
      mainTab.value = '3d';
      const id = Number(model3dId);
      focusModel3dId.value = Number.isSafeInteger(id) && id > 0 ? id : null;
    }
  },
);
watch([query, sensorTypeFilters, mainTab, pageSize, sort], () => {
  page.value = 1;
});
watch(mainTab, (tab) => {
  if (!resourceTabs.includes(tab)) lastStatusTab.value = tab;
});
watch(
  () => [items.value.length, pageSize.value] as const,
  () => {
    const maxPage = Math.max(1, Math.ceil(items.value.length / pageSize.value));
    if (page.value > maxPage) page.value = maxPage;
  },
);

function initialTab() {
  if (['sop-library', 'sop', '3d'].includes(String(route.query.tab || ''))) {
    return String(route.query.tab);
  }
  if (route.query.model) return '全部';
  const tab = String(route.query.tab || '');
  return (
    tab ||
    findSensorStatusName(store.dictionaryNames('sensor-status'), 'current') ||
    '全部'
  );
}

function parseSensorTypeFilters(value: string) {
  const allowed = new Set(store.dictionaryNames('sensor-type'));
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].filter((item) => allowed.has(item));
}

function initialSensorTypeFilters() {
  return parseSensorTypeFilters(String(route.query.sensorTypes || ''));
}

function initialSopId() {
  const id = Number(route.query.sopId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function initialModel3dId() {
  const id = Number(route.query.model3dId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sopTitle(sopId: null | number | undefined) {
  if (!sopId) return '';
  return sopTitleById.value.get(sopId) || '';
}

function model3dTitle(model3dId: null | number | undefined) {
  if (!model3dId) return '';
  return model3dTitleById.value.get(model3dId) || '';
}

function relatedSensor(item: SensorItem) {
  const id = item.replacesId || item.replacedById;
  return id ? (sensorById.value.get(id) ?? null) : null;
}

function relationText(item: SensorItem) {
  const related = relatedSensor(item);
  const label = related
    ? [related.brand, related.model].filter(Boolean).join(' ')
    : '';
  if (item.replacesId) {
    const target = label || `型号#${item.replacesId}`;
    return item.problemNote
      ? `替换了 ${target} · ${item.problemNote}`
      : `替换了 ${target}`;
  }
  if (item.replacedById) {
    const target = label || `型号#${item.replacedById}`;
    return item.problemNote
      ? `被 ${target} 替换 · ${item.problemNote}`
      : `被 ${target} 替换`;
  }
  return '';
}

/** 型号状态对应的 a-tag 预设色 */
function statusColor(status: string): string {
  if (isSensorStatus(status, 'current')) return 'green';
  if (isSensorStatus(status, 'alternate')) return 'gold';
  if (isSensorStatus(status, 'disabled')) return 'red';
  return 'default';
}

function resetForm() {
  validationAttempted.value = false;
  editId.value = undefined;
  Object.assign(form, {
    brand: '',
    feature: '',
    model: '',
    partNumber: '',
    scene: '',
    sensorType: typeOptions.value[0]?.value ?? '',
    sopId: null,
    model3dId: null,
    spec: '',
    status: statusNames.value[0] || '现用',
  });
}

function resetFilters() {
  mainTab.value = '全部';
  sensorTypeFilters.value = [];
  query.value = '';
  page.value = 1;
}

function exportCell(item: SensorItem, key: string) {
  const empty = '—';
  switch (key) {
    case 'status':
      return item.status || empty;
    case 'partNumber':
      return item.partNumber || empty;
    case 'sensorType':
      return item.sensorType || empty;
    case 'brand':
      return item.brand || empty;
    case 'model':
      return item.model || empty;
    case 'replacedAt':
      return item.replacedAt || empty;
    case 'problemNote':
      return item.problemNote || empty;
    case 'relation':
      return relationText(item) || empty;
    case 'spec':
      return item.spec || empty;
    case 'feature':
      return item.feature || empty;
    case 'scene':
      return item.scene || empty;
    case 'sop':
      return sopTitle(item.sopId) || '未关联';
    case 'model3d':
      return model3dTitle(item.model3dId) || '未关联';
    default:
      return empty;
  }
}

function exportExcel() {
  // 导出当前筛选条件下的全部型号（不只当前页），顺序与表格排序一致。
  const rows = sortedItems.value;
  if (rows.length === 0) {
    message.error('当前条件下没有可导出的型号');
    return;
  }
  const exportColumns = columns.value.filter(
    (column) => column.key !== 'actions',
  );
  downloadSensorExcel({
    pageName: mainTab.value,
    headers: exportColumns.map((column) => String(column.title)),
    rows: rows.map((item) =>
      exportColumns.map((column) => exportCell(item, String(column.key))),
    ),
  });
  message.success(`已导出 ${rows.length} 条 Sensor 型号`);
}

function addItem() {
  resetForm();
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

function editItem(item: SensorItem) {
  validationAttempted.value = false;
  editId.value = item.id;
  Object.assign(form, {
    brand: item.brand,
    feature: item.feature,
    model: item.model,
    partNumber: item.partNumber,
    scene: item.scene,
    sensorType: item.sensorType,
    sopId: item.sopId,
    model3dId: item.model3dId,
    spec: item.spec,
    status: item.status,
  });
  dirtyGuard.markClean();
  dialogOpen.value = true;
}

async function cancelDialog() {
  if (await dirtyGuard.confirmClose()) {
    dialogOpen.value = false;
  }
}

function saveItem() {
  validationAttempted.value = true;
  const result = store.saveSensor(
    {
      ...form,
      brand: form.brand.trim(),
      feature: form.feature.trim(),
      model: form.model.trim(),
      partNumber: form.partNumber.trim(),
      scene: form.scene.trim(),
      spec: form.spec.trim(),
      sopId: form.sopId,
      model3dId: form.model3dId,
    },
    editId.value,
  );
  if (
    notifyResult(result, editId.value ? '型号已更新' : '型号已新增', {
      duplicate: '该型号已存在，请使用不同的型号名称',
      stale: '该型号已被其他页面删除',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: SensorItem) {
  const ok = await confirmDelete('删除型号', `确认删除“${item.model}”吗？`);
  if (!ok) return;
  notifyResult(store.deleteSensor(item.id), '型号已删除');
}

function openLinkedSop(sopId: null | number) {
  if (!sopId) return;
  const file = store.sensorSops.find((item) => item.id === sopId);
  if (!file) {
    message.error('关联型录不存在或已被删除');
    return;
  }
  linkedPreview.value = { file, kind: '型录' };
}

function openLinkedModel3d(model3dId: null | number) {
  if (!model3dId) return;
  const file = store.sensor3dFiles.find((item) => item.id === model3dId);
  if (!file) {
    message.error('关联 3D 文件不存在或已被删除');
    return;
  }
  linkedPreview.value = { file, kind: '3D' };
}

function openRelatedSensor(item: SensorItem) {
  const related = relatedSensor(item);
  if (!related) return;
  mainTab.value = '全部';
  query.value = related.model;
}

function openReplace(item: SensorItem) {
  replaceValidationAttempted.value = false;
  replaceSource.value = item;
  Object.assign(replaceForm, { note: '', targetId: null });
  replaceDirtyGuard.markClean();
  replaceOpen.value = true;
}

async function cancelReplaceDialog() {
  if (await replaceDirtyGuard.confirmClose()) {
    replaceOpen.value = false;
  }
}

function saveReplace() {
  const source = replaceSource.value;
  if (!source) return;
  replaceValidationAttempted.value = true;
  if (!replaceForm.targetId || !replaceForm.note.trim()) {
    return;
  }
  const result = store.replaceSensorCurrent(
    source.id,
    replaceForm.targetId,
    replaceForm.note,
  );
  if (notifyResult(result, '已替换现用型号，原型号已停用')) {
    replaceOpen.value = false;
    mainTab.value =
      findSensorStatusName(statusNames.value, 'current') || '全部';
  }
}
</script>

<template>
  <section class="selection-page">
    <h1 class="visually-hidden">Sensor型号</h1>
    <a-tabs
      v-model:active-key="sectionTab"
      class="entity-tabs"
      destroy-inactive-tab-pane
    >
      <a-tab-pane key="models" tab="型号">
        <div class="selection-panel">
          <div class="selection-toolbar">
            <a-select
              v-model:value="statusFilter"
              class="selection-toolbar__filter"
              :options="statusFilterOptions"
              aria-label="状态筛选"
            />
            <a-select
              v-model:value="sensorTypeFilters"
              mode="multiple"
              class="selection-toolbar__filter"
              :options="typeOptions"
              placeholder="感应器类型"
              aria-label="感应器类型筛选"
              :max-tag-count="1"
              allow-clear
              option-filter-prop="label"
            />
            <a-input
              v-model:value="query"
              class="selection-toolbar__filter"
              placeholder="搜索类型、品牌、型号、料号、停用或问题点"
              aria-label="搜索 Sensor 型号"
              allow-clear
            >
              <template #prefix><Search :size="14" /></template>
            </a-input>
            <a-button
              type="text"
              :disabled="!hasActiveFilters"
              aria-label="重置筛选"
              @click="resetFilters"
            >
              <template #icon><RotateCcw :size="14" /></template>
              重置
            </a-button>
            <a-popover
              v-model:open="columnMenuOpen"
              trigger="click"
              placement="bottomRight"
              title="显示的列"
            >
              <a-badge :count="hiddenColumnCount" size="small">
                <a-button
                  :aria-label="
                    hiddenColumnCount > 0
                      ? `显示的列（已隐藏 ${hiddenColumnCount} 列）`
                      : '显示的列'
                  "
                >
                  <template #icon><Columns3 :size="14" /></template>
                  列
                </a-button>
              </a-badge>
              <template #content>
                <a-space
                  direction="vertical"
                  role="group"
                  aria-label="显示的列"
                >
                  <a-checkbox
                    v-for="column in HIDEABLE_COLUMNS"
                    :key="column.key"
                    :checked="!hiddenColumnKeys.has(column.key)"
                    @change="
                      toggleColumnVisible(column.key, $event.target.checked)
                    "
                  >
                    {{ column.label }}
                  </a-checkbox>
                </a-space>
              </template>
            </a-popover>
            <a-button aria-label="导出 Excel" @click="exportExcel">
              <Download :size="14" :stroke-width="1.5" aria-hidden="true" />
              导出 Excel
            </a-button>
            <a-button v-if="writable" type="primary" @click="addItem">
              新增型号
            </a-button>
          </div>
          <a-table
            :columns="columns"
            :data-source="tableData"
            row-key="id"
            :pagination="false"
            :scroll="{ x: scrollX(columns) }"
            :locale="{ emptyText: '没有符合当前条件的型号' }"
            :custom-row="writable ? rowClick(editItem) : undefined"
            @change="
              (_p: unknown, _f: unknown, sorter: unknown) =>
                (sort = sortFromChange(sorter))
            "
          >
            <template #bodyCell="{ column, record: row, text: value }">
              <template v-if="column.key === 'status'">
                <a-tag :color="statusColor(row.status)">{{ row.status }}</a-tag>
              </template>
              <template v-else-if="column.key === 'sensorType'">
                <a-badge
                  v-if="row.sensorType"
                  class="sensor-type"
                  :title="row.sensorType"
                  :color="typeAccent(row.sensorType)"
                  :text="row.sensorType"
                />
                <template v-else>—</template>
              </template>
              <template v-else-if="column.key === 'partNumber'">
                <a-typography-text
                  v-if="value"
                  :copyable="{
                    text: String(value),
                    tooltips: ['复制料号', '已复制'],
                  }"
                >
                  {{ value }}
                </a-typography-text>
                <template v-else>—</template>
              </template>
              <template v-else-if="column.key === 'sop'">
                <a-button
                  v-if="row.sopId"
                  class="sensor-file-link"
                  type="link"
                  size="small"
                  :title="`预览型录：${sopTitle(row.sopId)}`"
                  @click="openLinkedSop(row.sopId)"
                >
                  <template #icon><Eye :size="14" /></template>
                  {{ sopTitle(row.sopId) }}
                </a-button>
                <span v-else>未关联</span>
              </template>
              <template v-else-if="column.key === 'model3d'">
                <a-button
                  v-if="row.model3dId"
                  class="sensor-file-link"
                  type="link"
                  size="small"
                  :title="`预览 3D：${model3dTitle(row.model3dId)}`"
                  @click="openLinkedModel3d(row.model3dId)"
                >
                  <template #icon><Eye :size="14" /></template>
                  {{ model3dTitle(row.model3dId) }}
                </a-button>
                <span v-else>未关联</span>
              </template>
              <template v-else-if="column.key === 'replacedAt'">
                {{ value || '—' }}
              </template>
              <template v-else-if="column.key === 'problemNote'">
                {{ value || '—' }}
              </template>
              <template v-else-if="column.key === 'relation'">
                <a-button
                  v-if="relationText(row)"
                  type="link"
                  size="small"
                  @click="openRelatedSensor(row)"
                >
                  {{ relationText(row) }}
                </a-button>
                <template v-else>—</template>
              </template>
              <template v-else-if="column.key === 'actions'">
                <a-space :size="4">
                  <a-tooltip title="编辑">
                    <a-button
                      type="text"
                      size="small"
                      aria-label="编辑"
                      @click="editItem(row)"
                    >
                      <template #icon><Pencil :size="14" /></template>
                    </a-button>
                  </a-tooltip>
                  <a-tooltip
                    v-if="isSensorStatus(row.status, 'alternate')"
                    title="替换现用"
                  >
                    <a-button
                      type="text"
                      size="small"
                      aria-label="替换现用"
                      @click="openReplace(row)"
                    >
                      <template #icon><Replace :size="14" /></template>
                    </a-button>
                  </a-tooltip>
                  <a-tooltip title="删除">
                    <a-button
                      type="text"
                      size="small"
                      danger
                      aria-label="删除"
                      @click="deleteItem(row)"
                    >
                      <template #icon><Trash2 :size="14" /></template>
                    </a-button>
                  </a-tooltip>
                </a-space>
              </template>
              <template v-else>{{ cellText(value) }}</template>
            </template>
          </a-table>
          <a-pagination
            v-model:current="page"
            v-model:page-size="pageSize"
            class="table-pagination"
            :total="items.length"
            :page-size-options="PAGE_SIZE_OPTIONS"
            show-size-changer
            hide-on-single-page
            :show-total="(count: number) => `共 ${count} 条`"
          />
        </div>
      </a-tab-pane>
      <a-tab-pane key="sop-library" tab="SOP">
        <SensorSopFilePanel />
      </a-tab-pane>
      <a-tab-pane key="sop" tab="型录">
        <SensorSopPanel
          :focus-sop-id="focusSopId"
          @previewed="focusSopId = $event"
        />
      </a-tab-pane>
      <a-tab-pane key="3d" tab="3D">
        <Sensor3dPanel
          :focus-model3d-id="focusModel3dId"
          @previewed="focusModel3dId = $event"
        />
      </a-tab-pane>
    </a-tabs>
    <a-modal
      :open="Boolean(linkedPreview)"
      :title="
        linkedPreview
          ? `${linkedPreview.kind} · ${linkedPreview.file.title}`
          : '预览 PDF'
      "
      width="calc(100vw - 48px)"
      wrap-class-name="pdf-preview-modal"
      :footer="null"
      destroy-on-close
      @cancel="linkedPreview = null"
    >
      <APdfViewer
        v-if="linkedPreview"
        class="a-pdf-viewer--large"
        :src="linkedPreview.file.dataUrl"
      />
    </a-modal>
    <a-modal
      :open="dialogOpen"
      :title="editId ? '编辑 Sensor 型号' : '新增 Sensor 型号'"
      :width="680"
      destroy-on-close
      @cancel="cancelDialog"
    >
      <!--
        状态/类型、关联型录/3D 用 2 列；品牌/型号/料号这组识别字段用 3 列，
        让 7 个短字段排满、不留半行空格。列数只允许 2 和 3 两种：再多一种，
        字段左边界会落到更多位置（曾实测 468/688/798/908 四条），看不出栅格。
      -->
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item
              html-for="sensor-status"
              label="状态"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.status
                    ? '请选择状态'
                    : undefined,
                )
              "
            >
              <a-select
                id="sensor-status"
                v-model:value="form.status"
                :options="statusOptions"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item
              html-for="sensor-sensor-type"
              label="感应器类型"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.sensorType
                    ? '请选择感应器类型'
                    : undefined,
                )
              "
            >
              <a-select
                id="sensor-sensor-type"
                v-model:value="form.sensorType"
                :options="typeOptions"
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item html-for="sensor-brand" label="品牌">
              <a-input
                id="sensor-brand"
                v-model:value="form.brand"
                :maxlength="60"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item
              html-for="sensor-model"
              label="型号"
              required
              v-bind="
                fieldError(
                  validationAttempted && !form.model.trim()
                    ? '请输入型号'
                    : undefined,
                )
              "
            >
              <a-input
                id="sensor-model"
                v-model:value="form.model"
                :maxlength="100"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item html-for="sensor-part-number" label="料号">
              <a-input
                id="sensor-part-number"
                v-model:value="form.partNumber"
                :maxlength="80"
                placeholder="可选"
                allow-clear
                show-count
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item html-for="sensor-sop-id" label="关联型录">
              <a-select
                id="sensor-sop-id"
                v-model:value="form.sopId"
                :options="sopOptions"
                placeholder="可选，关联一份 PDF 型录"
                allow-clear
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item html-for="sensor-model3d-id" label="关联 3D">
              <a-select
                id="sensor-model3d-id"
                v-model:value="form.model3dId"
                :options="model3dOptions"
                placeholder="可选，关联一个 3D 文件"
                allow-clear
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item html-for="sensor-spec" label="规格参数">
              <a-textarea
                id="sensor-spec"
                v-model:value="form.spec"
                :rows="2"
                :maxlength="500"
                show-count
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item html-for="sensor-feature" label="特性与注意">
              <a-textarea
                id="sensor-feature"
                v-model:value="form.feature"
                :rows="2"
                :maxlength="500"
                show-count
              />
            </a-form-item>
          </a-col>
          <!-- 和上面两个描述性字段同为多行：同类内容给成一行输入会显得轻重不一 -->
          <a-col :span="24">
            <a-form-item html-for="sensor-scene" label="适用场景">
              <a-textarea
                id="sensor-scene"
                v-model:value="form.scene"
                :rows="2"
                :maxlength="300"
                show-count
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <template #footer>
        <a-button @click="cancelDialog">取消</a-button>
        <a-button type="primary" @click="saveItem">保存</a-button>
      </template>
    </a-modal>
    <a-modal
      :open="replaceOpen"
      title="用备选替换现用型号"
      :width="560"
      destroy-on-close
      @cancel="cancelReplaceDialog"
    >
      <p>
        备选：{{ replaceSource?.sensorType }} · {{ replaceSource?.brand }} ·
        {{ replaceSource?.model }}
      </p>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item
              html-for="sensor-target-id"
              label="要替换的现用型号"
              required
              v-bind="
                fieldError(
                  replaceValidationAttempted && !replaceForm.targetId
                    ? '请选择要替换的现用型号'
                    : undefined,
                )
              "
            >
              <a-select
                id="sensor-target-id"
                v-model:value="replaceForm.targetId"
                :options="replaceCandidates"
                placeholder="请选择现用型号"
              />
            </a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item
              html-for="sensor-note"
              label="问题点"
              required
              v-bind="
                fieldError(
                  replaceValidationAttempted && !replaceForm.note.trim()
                    ? '请填写问题点'
                    : undefined,
                )
              "
            >
              <a-textarea
                id="sensor-note"
                v-model:value="replaceForm.note"
                :rows="3"
                :maxlength="500"
                placeholder="说明因什么问题被替换"
                show-count
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <template #footer>
        <a-button @click="cancelReplaceDialog">取消</a-button>
        <a-button type="primary" @click="saveReplace">替换</a-button>
      </template>
    </a-modal>
  </section>
</template>

<style scoped>
/* 类型名不换行：列宽放不下时省略，完整名称见 title */
.sensor-type {
  display: flex;
  align-items: center;
  max-width: 100%;
  white-space: nowrap;
}

.sensor-type :deep(.ant-badge-status-text) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
