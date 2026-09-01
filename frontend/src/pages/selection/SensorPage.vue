<script setup lang="ts">
import { Download, Eye, Pencil, Replace, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import {
  findSensorStatusName,
  isSensorStatus,
  sensorStatusRank,
  type SensorFileItem,
  type SensorItem,
} from '@/domain';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useSyncedQuery } from '@/pages/shared/use-synced-query';
import SensorSopPanel from '@/pages/selection/sensor/SensorSopPanel.vue';
import SensorSopFilePanel from '@/pages/selection/sensor/SensorSopFilePanel.vue';
import Sensor3dPanel from '@/pages/selection/sensor/Sensor3dPanel.vue';
import { downloadSensorExcel } from '@/pages/selection/sensor/sensor-excel';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { toast } from '@/ui/toast';
import {
  ABadge,
  AButton,
  AField,
  AFilterResetButton,
  AFormGrid,
  AFormRow,
  AIconButton,
  APagination,
  APdfViewer,
  ASearchField,
  ASegmentedControl,
  ASelect,
  ASheet,
  ATable,
  ATextArea,
  ATokenField,
  type BadgeTone,
  type SegmentOption,
  type SelectOption,
  type TableColumn,
} from '@/ui';

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
const focusSopId = ref<null | number>(initialSopId());
const focusModel3dId = ref<null | number>(initialModel3dId());
const linkedPreview = ref<{
  file: SensorFileItem;
  kind: '3D' | '型录';
} | null>(null);
const replaceSource = ref<SensorItem | null>(null);
const replaceTargetId = ref<number | null>(null);
const replaceNote = ref('');
const page = ref(1);
const pageSize = ref(20);
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

const statusNames = computed(() => {
  const names = store.dictionaryNames('sensor-status');
  return [...names].sort((left, right) => {
    return sensorStatusRank(left) - sensorStatusRank(right);
  });
});
const typeOptions = computed<SelectOption[]>(() =>
  store
    .dictionaryNames('sensor-type')
    .map((name) => ({ label: name, value: name })),
);
const statusOptions = computed<SelectOption[]>(() =>
  statusNames.value.map((name) => ({ label: name, value: name })),
);
const statusFilterOptions = computed<SelectOption[]>(() => [
  { label: '全部', value: '全部' },
  ...statusOptions.value,
]);
const sopOptions = computed<SelectOption[]>(() =>
  store.sensorSops.map((item) => ({ label: item.title, value: item.id })),
);
const model3dOptions = computed<SelectOption[]>(() =>
  store.sensor3dFiles.map((item) => ({ label: item.title, value: item.id })),
);
const tabs = computed<SegmentOption[]>(() => [
  { label: 'SOP', value: 'sop-library' },
  { label: '型录', value: 'sop' },
  { label: '3D', value: '3d' },
  ...statusNames.value.map((name) => ({ label: name, value: name })),
  { label: '全部', value: '全部' },
]);
const sensorById = computed(() => {
  const map = new Map<number, SensorItem>();
  for (const item of store.sensors) map.set(item.id, item);
  return map;
});
const showDisabledDetails = computed(() =>
  isSensorStatus(mainTab.value, 'disabled'),
);
const statusFilter = computed({
  get: () =>
    ['sop-library', 'sop', '3d'].includes(mainTab.value)
      ? '全部'
      : mainTab.value,
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
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return items.value.slice(start, start + pageSize.value);
});
const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'status', label: '状态', width: 88 },
    { key: 'partNumber', label: '料号', width: 120, mono: true },
    { key: 'sensorType', label: '感应器类型', width: 120 },
    { key: 'brand', label: '品牌', width: 88 },
    { key: 'model', label: '型号', width: 140, mono: true, fixed: 'start' },
    ...(showDisabledDetails.value
      ? [
          { key: 'replacedAt', label: '停用时间', width: 112 },
          {
            key: 'problemNote',
            label: '停用原因',
            minWidth: 180,
            ellipsis: true,
          },
        ]
      : []),
    { key: 'relation', label: '替换关系', minWidth: 180 },
    { key: 'spec', label: '规格参数', minWidth: 140, ellipsis: true },
    { key: 'feature', label: '特性与注意', minWidth: 140, ellipsis: true },
    { key: 'scene', label: '适用场景', minWidth: 120, ellipsis: true },
    { key: 'sop', label: '关联型录', minWidth: 140 },
    { key: 'model3d', label: '关联 3D', minWidth: 140 },
  ];
  if (writable.value) {
    cols.push({ key: 'actions', label: '操作', width: 128, fixed: 'end' });
  }
  return cols;
});
const replaceCandidates = computed<SelectOption[]>(() => {
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
    if (!model) return;
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
watch([query, sensorTypeFilters, mainTab, pageSize], () => {
  page.value = 1;
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
  return store.sensorSops.find((item) => item.id === sopId)?.title || '';
}

function model3dTitle(model3dId: null | number | undefined) {
  if (!model3dId) return '';
  return store.sensor3dFiles.find((item) => item.id === model3dId)?.title || '';
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

function statusTone(status: string): BadgeTone {
  if (isSensorStatus(status, 'current')) return 'green';
  if (isSensorStatus(status, 'alternate')) return 'yellow';
  if (isSensorStatus(status, 'disabled')) return 'red';
  return 'neutral';
}

function resetForm() {
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
  if (items.value.length === 0) {
    toast.error('当前条件下没有可导出的型号');
    return;
  }
  const exportColumns = columns.value.filter(
    (column) => column.key !== 'actions',
  );
  downloadSensorExcel({
    pageName: mainTab.value,
    headers: exportColumns.map((column) => column.label),
    rows: items.value.map((item) =>
      exportColumns.map((column) => exportCell(item, column.key)),
    ),
  });
  toast.success(`已导出 ${items.value.length} 条 Sensor 型号`);
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: SensorItem) {
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
  dialogOpen.value = true;
}

function saveItem() {
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
    toastResult(result, editId.value ? '型号已更新' : '型号已新增', {
      duplicate: '该型号已存在，请使用不同的型号名称',
      validation: '请填写型号并选择感应器类型',
      stale: '该型号已被其他页面删除',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: SensorItem) {
  const ok = await confirmDelete('删除型号', `确认删除“${item.model}”吗？`);
  if (!ok) return;
  toastResult(store.deleteSensor(item.id), '型号已删除');
}

function copyWithSelection(value: string) {
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.inset = '0 auto auto -9999px';
  document.body.append(input);
  input.select();

  try {
    return document.execCommand?.('copy') ?? false;
  } finally {
    input.remove();
  }
}

async function copyPartNumber(value: unknown) {
  const partNumber = String(value ?? '').trim();
  if (!partNumber) return;

  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(partNumber);
      } catch {
        if (!copyWithSelection(partNumber))
          throw new Error('clipboard unavailable');
      }
    } else if (!copyWithSelection(partNumber)) {
      throw new Error('clipboard unavailable');
    }

    toast.success(`料号已复制：${partNumber}`);
  } catch {
    toast.error('复制失败，请手动选择料号复制');
  }
}

function openLinkedSop(sopId: null | number) {
  if (!sopId) return;
  const file = store.sensorSops.find((item) => item.id === sopId);
  if (!file) {
    toast.error('关联型录不存在或已被删除');
    return;
  }
  linkedPreview.value = { file, kind: '型录' };
}

function openLinkedModel3d(model3dId: null | number) {
  if (!model3dId) return;
  const file = store.sensor3dFiles.find((item) => item.id === model3dId);
  if (!file) {
    toast.error('关联 3D 文件不存在或已被删除');
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
  replaceSource.value = item;
  replaceTargetId.value = null;
  replaceNote.value = '';
  replaceOpen.value = true;
}

function saveReplace() {
  const source = replaceSource.value;
  if (!source) return;
  if (!replaceTargetId.value) {
    toast.error('请选择要替换的现用型号');
    return;
  }
  if (!replaceNote.value.trim()) {
    toast.error('请填写问题点');
    return;
  }
  const result = store.replaceSensorCurrent(
    source.id,
    replaceTargetId.value,
    replaceNote.value,
  );
  if (
    toastResult(result, '已替换现用型号，原型号已停用', {
      validation: '仅备选可替换现用，且必须填写问题点',
    })
  ) {
    replaceOpen.value = false;
    mainTab.value =
      findSensorStatusName(statusNames.value, 'current') || '全部';
  }
}
</script>

<template>
  <section class="selection-page">
    <ASegmentedControl v-model="mainTab" :segments="tabs" />
    <SensorSopFilePanel v-if="mainTab === 'sop-library'" />
    <SensorSopPanel
      v-else-if="mainTab === 'sop'"
      :focus-sop-id="focusSopId"
      @previewed="focusSopId = $event"
    />
    <Sensor3dPanel
      v-else-if="mainTab === '3d'"
      :focus-model3d-id="focusModel3dId"
      @previewed="focusModel3dId = $event"
    />
    <div v-else class="selection-panel">
      <div class="selection-toolbar">
        <ASelect
          v-model="statusFilter"
          class="selection-toolbar__filter"
          :options="statusFilterOptions"
        />
        <ATokenField
          v-model="sensorTypeFilters"
          class="selection-toolbar__filter"
          :options="typeOptions"
          placeholder="感应器类型"
          :max-visible-tokens="1"
        />
        <ASearchField
          v-model="query"
          class="selection-toolbar__filter"
          placeholder="搜索类型、品牌、型号、料号、停用或问题点"
        />
        <AFilterResetButton :active="hasActiveFilters" @reset="resetFilters" />
        <AButton aria-label="导出 Excel" @click="exportExcel">
          <Download :size="14" :stroke-width="1.75" aria-hidden="true" />
          导出 Excel
        </AButton>
        <AButton v-if="writable" variant="filled" @click="addItem">
          新增型号
        </AButton>
      </div>
      <ATable
        :columns="columns"
        :rows="tableData"
        row-key="id"
        empty-text="没有符合当前条件的型号"
        striped
      >
        <template #cell-status="{ row }">
          <ABadge :label="row.status" :tone="statusTone(row.status)" />
        </template>
        <template #cell-partNumber="{ value }">
          <span
            v-if="value"
            class="sensor-part-number"
            role="button"
            tabindex="0"
            :aria-label="`复制料号 ${value}`"
            title="双击复制料号"
            @dblclick.stop="copyPartNumber(value)"
            @keydown.enter.prevent.stop="copyPartNumber(value)"
          >
            {{ value }}
          </span>
          <span v-else>—</span>
        </template>
        <template #cell-sop="{ row }">
          <button
            v-if="row.sopId"
            class="sensor-file-link"
            type="button"
            :aria-label="`预览型录：${sopTitle(row.sopId)}`"
            :title="`预览型录：${sopTitle(row.sopId)}`"
            @click="openLinkedSop(row.sopId)"
          >
            <Eye :size="14" :stroke-width="1.75" aria-hidden="true" />
            <span class="sensor-file-link__text">{{
              sopTitle(row.sopId)
            }}</span>
          </button>
          <span v-else>未关联</span>
        </template>
        <template #cell-model3d="{ row }">
          <button
            v-if="row.model3dId"
            class="sensor-file-link"
            type="button"
            :aria-label="`预览 3D：${model3dTitle(row.model3dId)}`"
            :title="`预览 3D：${model3dTitle(row.model3dId)}`"
            @click="openLinkedModel3d(row.model3dId)"
          >
            <Eye :size="14" :stroke-width="1.75" aria-hidden="true" />
            <span class="sensor-file-link__text">
              {{ model3dTitle(row.model3dId) }}
            </span>
          </button>
          <span v-else>未关联</span>
        </template>
        <template #cell-replacedAt="{ value }">{{ value || '—' }}</template>
        <template #cell-problemNote="{ value }">{{ value || '—' }}</template>
        <template #cell-relation="{ row }">
          <button
            v-if="relationText(row)"
            class="link-button"
            type="button"
            @click="openRelatedSensor(row)"
          >
            {{ relationText(row) }}
          </button>
          <span v-else>—</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-actions">
            <AIconButton
              :icon="Pencil"
              label="编辑"
              size="small"
              @click="editItem(row)"
            />
            <AIconButton
              v-if="isSensorStatus(row.status, 'alternate')"
              :icon="Replace"
              label="替换现用"
              size="small"
              @click="openReplace(row)"
            />
            <AIconButton
              :icon="Trash2"
              label="删除"
              size="small"
              variant="destructive"
              @click="deleteItem(row)"
            />
          </div>
        </template>
      </ATable>
      <APagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="items.length"
      />
    </div>
    <ASheet
      :open="Boolean(linkedPreview)"
      :title="
        linkedPreview
          ? `${linkedPreview.kind} · ${linkedPreview.file.title}`
          : '预览 PDF'
      "
      viewport
      @update:open="
        (open) => {
          if (!open) linkedPreview = null;
        }
      "
    >
      <APdfViewer
        v-if="linkedPreview"
        class="a-pdf-viewer--large"
        :src="linkedPreview.file.dataUrl"
      />
    </ASheet>
    <ASheet
      v-model:open="dialogOpen"
      :title="editId ? '编辑 Sensor 型号' : '新增 Sensor 型号'"
      :width="680"
    >
      <AFormGrid :columns="3">
        <AFormRow label="状态" required>
          <ASelect v-model="form.status" :options="statusOptions" />
        </AFormRow>
        <AFormRow label="料号">
          <AField
            v-model="form.partNumber"
            :maxlength="80"
            placeholder="可选"
          />
        </AFormRow>
        <AFormRow label="感应器类型" required>
          <ASelect v-model="form.sensorType" :options="typeOptions" />
        </AFormRow>
      </AFormGrid>
      <AFormGrid>
        <AFormRow label="品牌">
          <AField v-model="form.brand" :maxlength="60" />
        </AFormRow>
        <AFormRow label="型号" required>
          <AField v-model="form.model" :maxlength="100" />
        </AFormRow>
      </AFormGrid>
      <AFormGrid>
        <AFormRow label="关联型录">
          <ASelect
            v-model="form.sopId"
            :options="sopOptions"
            placeholder="可选，关联一份 PDF 型录"
            clearable
          />
        </AFormRow>
        <AFormRow label="关联 3D">
          <ASelect
            v-model="form.model3dId"
            :options="model3dOptions"
            placeholder="可选，关联一个 3D 文件"
            clearable
          />
        </AFormRow>
      </AFormGrid>
      <AFormGrid :columns="1">
        <AFormRow label="规格参数">
          <ATextArea v-model="form.spec" :rows="2" :maxlength="500" />
        </AFormRow>
        <AFormRow label="特性与注意">
          <ATextArea v-model="form.feature" :rows="2" :maxlength="500" />
        </AFormRow>
        <AFormRow label="适用场景">
          <AField v-model="form.scene" :maxlength="300" />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="dialogOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveItem">保存</AButton>
      </template>
    </ASheet>
    <ASheet v-model:open="replaceOpen" title="用备选替换现用型号" :width="560">
      <p>
        备选：{{ replaceSource?.sensorType }} · {{ replaceSource?.brand }} ·
        {{ replaceSource?.model }}
      </p>
      <AFormGrid :columns="1">
        <AFormRow label="要替换的现用型号" required>
          <ASelect
            v-model="replaceTargetId"
            :options="replaceCandidates"
            placeholder="请选择现用型号"
          />
        </AFormRow>
        <AFormRow label="问题点" required>
          <ATextArea
            v-model="replaceNote"
            :rows="3"
            :maxlength="500"
            placeholder="说明因什么问题被替换"
          />
        </AFormRow>
      </AFormGrid>
      <template #footer>
        <AButton @click="replaceOpen = false">取消</AButton>
        <AButton variant="filled" @click="saveReplace">替换</AButton>
      </template>
    </ASheet>
  </section>
</template>
