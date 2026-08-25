<script setup lang="ts">
import { ExternalLink, Pencil, Replace, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import type { SensorItem } from '@/domain';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useSyncedQuery } from '@/pages/shared/use-synced-query';
import SensorSopPanel from '@/pages/selection/sensor/SensorSopPanel.vue';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { toast } from '@/ui/toast';
import {
  ABadge,
  AButton,
  AField,
  AFormGrid,
  AFormRow,
  AIconButton,
  APagination,
  ASearchField,
  ASegmentedControl,
  ASelect,
  ASheet,
  ATable,
  ATextArea,
  type BadgeTone,
  type SegmentOption,
  type SelectOption,
  type TableColumn,
} from '@/ui';

import '../shared/selection-page.css';

const STATUS_TAB_ORDER = ['现用', '备选', '停用'];

const route = useRoute();
const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const mainTab = ref(initialTab());
const query = ref(String(route.query.model || ''));
const sensorTypeFilter = ref<string | null>(null);
const dialogOpen = ref(false);
const replaceOpen = ref(false);
const editId = ref<number>();
const focusSopId = ref<null | number>(initialSopId());
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
  spec: '',
  status: '',
});

const statusNames = computed(() => {
  const names = store.dictionaryNames('sensor-status');
  return [...names].sort((left, right) => {
    const ia = STATUS_TAB_ORDER.indexOf(left);
    const ib = STATUS_TAB_ORDER.indexOf(right);
    if (ia < 0 && ib < 0) return 0;
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  });
});
const typeOptions = computed<SelectOption[]>(() =>
  store.dictionaryNames('sensor-type').map((name) => ({ label: name, value: name })),
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
const tabs = computed<SegmentOption[]>(() => [
  { label: 'SOP', value: 'sop' },
  ...statusNames.value.map((name) => ({ label: name, value: name })),
  { label: '全部', value: '全部' },
]);
const sensorById = computed(() => {
  const map = new Map<number, SensorItem>();
  for (const item of store.sensors) map.set(item.id, item);
  return map;
});
const showProblemColumn = computed(() => mainTab.value === '停用');
const statusFilter = computed({
  get: () => (mainTab.value === 'sop' ? '全部' : mainTab.value),
  set: (value: string | number | null) => {
    mainTab.value = String(value || '全部');
  },
});

const items = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  const status = mainTab.value === '全部' ? '全部' : mainTab.value;
  return store.sensors.filter((item) => {
    if (status !== '全部' && item.status !== status) return false;
    if (sensorTypeFilter.value && item.sensorType !== sensorTypeFilter.value) {
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
    { key: 'model', label: '型号', width: 140, mono: true },
    { key: 'sop', label: '关联 SOP', minWidth: 140 },
    ...(showProblemColumn.value
      ? [{ key: 'problemNote', label: '问题点', minWidth: 140, ellipsis: true }]
      : []),
    { key: 'relation', label: '替换关系', minWidth: 180 },
    { key: 'spec', label: '规格参数', minWidth: 140, ellipsis: true },
    { key: 'feature', label: '特性与注意', minWidth: 140, ellipsis: true },
    { key: 'scene', label: '适用场景', minWidth: 120, ellipsis: true },
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
    (item) => item.status === '现用' && item.id !== source.id,
  );
  return currents.map((item) => ({
    value: item.id,
    label: `${item.brand} ${item.model}`,
  }));
});

useSyncedQuery(() => {
  if (mainTab.value === 'sop') {
    return {
      tab: 'sop',
      sopId: focusSopId.value ? String(focusSopId.value) : undefined,
    };
  }
  return {
    tab: mainTab.value === '现用' ? undefined : mainTab.value,
    model: query.value.trim() || undefined,
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
  () => [route.query.tab, route.query.sopId] as const,
  ([tab, sopId]) => {
    if (String(tab || '') !== 'sop') return;
    mainTab.value = 'sop';
    const id = Number(sopId);
    focusSopId.value = Number.isSafeInteger(id) && id > 0 ? id : null;
  },
);
watch([query, sensorTypeFilter, mainTab, pageSize], () => {
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
  if (String(route.query.tab || '') === 'sop') return 'sop';
  if (route.query.model) return '全部';
  const tab = String(route.query.tab || '');
  return tab || '现用';
}

function initialSopId() {
  const id = Number(route.query.sopId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sopTitle(sopId: null | number | undefined) {
  if (!sopId) return '';
  return store.sensorSops.find((item) => item.id === sopId)?.title || '';
}

function relatedSensor(item: SensorItem) {
  const id = item.replacesId || item.replacedById;
  return id ? sensorById.value.get(id) ?? null : null;
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
  if (status === '现用') return 'green';
  if (status === '备选') return 'blue';
  return 'orange';
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
    spec: '',
    status: statusNames.value[0] || '现用',
  });
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

function openLinkedSop(sopId: null | number) {
  if (!sopId) return;
  focusSopId.value = sopId;
  mainTab.value = 'sop';
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
    mainTab.value = '现用';
  }
}
</script>

<template>
  <section class="selection-page">
    <ASegmentedControl v-model="mainTab" :segments="tabs" />
    <SensorSopPanel
      v-if="mainTab === 'sop'"
      :focus-sop-id="focusSopId"
      @previewed="focusSopId = $event"
    />
    <div v-else class="selection-panel">
      <div class="selection-toolbar">
        <ASelect
          v-model="statusFilter"
          class="selection-toolbar__filter"
          :options="statusFilterOptions"
        />
        <ASelect
          v-model="sensorTypeFilter"
          class="selection-toolbar__filter"
          :options="typeOptions"
          placeholder="感应器类型"
          clearable
        />
        <ASearchField
          v-model="query"
          class="selection-toolbar__filter"
          placeholder="搜索类型、品牌、型号、料号、停用或问题点"
        />
        <AButton v-if="writable" variant="filled" @click="addItem">新增型号</AButton>
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
        <template #cell-partNumber="{ value }">{{ value || '—' }}</template>
        <template #cell-sop="{ row }">
          <button
            v-if="row.sopId"
            class="link-button"
            type="button"
            @click="openLinkedSop(row.sopId)"
          >
            <ExternalLink :size="14" :stroke-width="1.5" />
            {{ sopTitle(row.sopId) }}
          </button>
          <span v-else>未关联</span>
        </template>
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
            <AIconButton :icon="Pencil" label="编辑" size="small" @click="editItem(row)" />
            <AIconButton
              v-if="row.status === '备选'"
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
      <APagination v-model:page="page" v-model:page-size="pageSize" :total="items.length" />
    </div>
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
          <AField v-model="form.partNumber" :maxlength="80" placeholder="可选" />
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
      <AFormGrid :columns="1">
        <AFormRow label="关联 SOP">
          <ASelect
            v-model="form.sopId"
            :options="sopOptions"
            placeholder="可选，关联一份 SOP PDF"
            clearable
          />
        </AFormRow>
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
