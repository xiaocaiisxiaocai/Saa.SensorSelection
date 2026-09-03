<script setup lang="ts">
import {
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Trash2,
} from 'lucide-vue-next';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import {
  MACHINE_ROW_IMAGE_RULES,
  isSensorStatus,
  sensorStatusRank,
  type MachineRowImage,
  type MachineSectionItem,
  type MachineSectionRow,
  type SensorItem,
} from '@/domain';
import { readDataUrl } from '@/pages/shared/files';
import { confirmDelete, toastResult } from '@/pages/shared/save-feedback';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { buildMachineTableRows, type MachineTableRow } from './table-rows';
import {
  ABadge,
  AButton,
  AField,
  AFileDrop,
  AFilterResetButton,
  AFormGrid,
  AFormRow,
  AIconButton,
  AImageViewer,
  APagination,
  ASearchField,
  ASelect,
  ASheet,
  ATable,
  ATextArea,
  ATokenField,
  type SelectOption,
  type TableColumn,
} from '@/ui';

const props = defineProps<{
  focusRowId?: number;
  machineName: string;
  processId: number;
  section: MachineSectionItem;
}>();

const COMPACT_IMAGES_MEDIA_QUERY = '(min-width: 960px) and (max-width: 1439px)';

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const dialogOpen = ref(false);
const editId = ref<number>();
const validationAttempted = ref(false);
const query = ref('');
const sensorTypeFilters = ref<Array<string | number>>([]);
const machineModelFilter = ref<string | number | null>(null);
const processStepFilter = ref<string | number | null>(null);
const boardCharacteristicFilter = ref<string | number | null>(null);
const imagesCollapsed = ref(false);
const imagesPanelTouched = ref(false);
const preview = ref<MachineRowImage | null>(null);
const imageOpen = computed({
  get: () => Boolean(preview.value),
  set: (open: boolean) => {
    if (!open) preview.value = null;
  },
});
const page = ref(1);
const pageSize = ref(20);
const selectedTableRow = ref<string | number | null>(null);
const tableHost = ref<HTMLElement | null>(null);
let compactImagesMedia: MediaQueryList | null = null;
const form = reactive({
  boardCharacteristicId: null as number | null,
  desc: '',
  machineModelId: null as number | null,
  name: '',
  note: '',
  processStepId: null as number | null,
  purpose: '',
  role: '',
  sensorIds: [] as Array<string | number>,
});

const isStructure = computed(() => props.section.kind === 'structure');

function syncImagesPanel(matches: boolean) {
  if (!imagesPanelTouched.value) imagesCollapsed.value = matches;
}

function onCompactImagesChange(event: MediaQueryListEvent) {
  syncImagesPanel(event.matches);
}

function toggleImagesPanel() {
  imagesPanelTouched.value = true;
  imagesCollapsed.value = !imagesCollapsed.value;
}

onMounted(() => {
  compactImagesMedia = window.matchMedia?.(COMPACT_IMAGES_MEDIA_QUERY) ?? null;
  if (!compactImagesMedia) return;
  syncImagesPanel(compactImagesMedia.matches);
  compactImagesMedia.addEventListener('change', onCompactImagesChange);
});

onBeforeUnmount(() => {
  compactImagesMedia?.removeEventListener('change', onCompactImagesChange);
});
const typeOptions = computed<SelectOption[]>(() =>
  store
    .dictionaryNames('sensor-type')
    .map((name) => ({ label: name, value: name })),
);
const processStepOptions = computed<SelectOption[]>(() =>
  store.processSteps.map((item) => ({
    label: `${item.layer} · ${item.name}`,
    value: item.id,
  })),
);
const machineModelItems = computed(() =>
  store.dictionaryItems('machine-model'),
);
const machineModelOptions = computed<SelectOption[]>(() =>
  machineModelItems.value.map((item) => ({ label: item.name, value: item.id })),
);
const boardCharacteristicItems = computed(() =>
  store.dictionaryItems('board-characteristic'),
);
const boardCharacteristicOptions = computed<SelectOption[]>(() =>
  boardCharacteristicItems.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);
const sensorOptions = computed<SelectOption[]>(() =>
  [...store.sensors]
    .sort((left, right) => {
      if (left.status === right.status) return left.id - right.id;
      return sensorStatusRank(left.status) - sensorStatusRank(right.status);
    })
    .map((item) => ({
      value: item.id,
      label: sensorOptionLabel(item),
    })),
);
const images = computed(() =>
  isStructure.value
    ? store.machineSectionImages(
        props.section.id,
        props.machineName,
        props.processId,
      )
    : [],
);
const items = computed(() =>
  store.machineSectionRows(
    props.section.id,
    props.machineName,
    props.processId,
  ),
);
const hasTabContent = computed(() => items.value.length > 0);
const hasActiveFilters = computed(
  () =>
    Boolean(query.value.trim()) ||
    sensorTypeFilters.value.length > 0 ||
    machineModelFilter.value !== null ||
    processStepFilter.value !== null ||
    boardCharacteristicFilter.value !== null,
);
const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN');
  return items.value.filter((item) => {
    if (
      isStructure.value &&
      sensorTypeFilters.value.length > 0 &&
      !sensorRecords(item).some((sensor) =>
        sensorTypeFilters.value.includes(sensor.sensorType),
      )
    ) {
      return false;
    }
    if (
      isStructure.value &&
      machineModelFilter.value !== null &&
      item.machineModelId !== Number(machineModelFilter.value)
    ) {
      return false;
    }
    if (
      isStructure.value &&
      processStepFilter.value !== null &&
      item.processStepId !== Number(processStepFilter.value)
    ) {
      return false;
    }
    if (
      isStructure.value &&
      boardCharacteristicFilter.value !== null &&
      item.boardCharacteristicId !== Number(boardCharacteristicFilter.value)
    ) {
      return false;
    }
    const haystack = isStructure.value
      ? [
          item.role,
          dictionaryLabel(machineModelItems.value, item.machineModelId),
          processStepLabel(item.processStepId),
          dictionaryLabel(
            boardCharacteristicItems.value,
            item.boardCharacteristicId,
          ),
          sensorTypesLabel(item),
          sensorSpecsLabel(item),
          item.purpose,
          item.note,
        ]
      : [item.role, item.name, item.desc, item.note];
    return (
      !value || haystack.join(' ').toLocaleLowerCase('zh-CN').includes(value)
    );
  });
});
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return buildMachineTableRows(
    filtered.value.slice(start, start + pageSize.value),
    store.sensors,
    isStructure.value,
    store.processSteps,
    machineModelItems.value,
    boardCharacteristicItems.value,
  );
});
const columns = computed<TableColumn<MachineTableRow>[]>(() => {
  const rowSpan = isStructure.value
    ? (row: MachineTableRow) => (row.groupStart ? row.groupSize : 0)
    : undefined;
  const cols: TableColumn<MachineTableRow>[] = isStructure.value
    ? [
        { key: 'role', label: '功能作用', minWidth: 90, rowSpan },
        { key: 'machineModelName', label: '机型', minWidth: 100, rowSpan },
        {
          key: 'processStepName',
          label: '工艺制程',
          minWidth: 110,
          rowSpan,
        },
        {
          key: 'boardCharacteristicName',
          label: '板件特性',
          minWidth: 120,
          rowSpan,
        },
        { key: 'sensorType', label: '传感器类型', minWidth: 100 },
        { key: 'spec', label: '规格', minWidth: 220, ellipsis: true },
        {
          key: 'purpose',
          label: '作用',
          minWidth: 120,
          ellipsis: true,
          rowSpan,
        },
        { key: 'note', label: '备注', minWidth: 96, ellipsis: true, rowSpan },
      ]
    : [
        { key: 'role', label: '注意分类', width: 120 },
        { key: 'name', label: '事项名称', minWidth: 140 },
        { key: 'desc', label: '说明', minWidth: 180, ellipsis: true },
        { key: 'note', label: '备注', minWidth: 120, ellipsis: true },
      ];
  if (writable.value) {
    cols.push({
      key: 'actions',
      label: '操作',
      width: 72,
      fixed: 'end',
      rowSpan,
    });
  }
  return cols;
});

watch(
  () => [props.section.id, props.machineName, props.processId] as const,
  () => {
    query.value = '';
    sensorTypeFilters.value = [];
    machineModelFilter.value = null;
    processStepFilter.value = null;
    boardCharacteristicFilter.value = null;
    page.value = 1;
    dialogOpen.value = false;
    preview.value = null;
  },
);
watch(
  [
    query,
    sensorTypeFilters,
    machineModelFilter,
    processStepFilter,
    boardCharacteristicFilter,
    pageSize,
  ],
  () => {
    page.value = 1;
  },
);

function sensorRecords(item: MachineSectionRow): SensorItem[] {
  return (item.sensorIds ?? [])
    .map((id) => store.sensors.find((sensor) => sensor.id === id))
    .filter((item): item is SensorItem => Boolean(item));
}

function resetFilters() {
  query.value = '';
  sensorTypeFilters.value = [];
  machineModelFilter.value = null;
  processStepFilter.value = null;
  boardCharacteristicFilter.value = null;
  page.value = 1;
}

watch(
  () =>
    [
      props.focusRowId,
      props.section.id,
      props.machineName,
      props.processId,
      items.value.length,
    ] as const,
  async ([focusRowId]) => {
    if (!focusRowId) {
      selectedTableRow.value = null;
      return;
    }
    const rowIndex = items.value.findIndex((item) => item.id === focusRowId);
    if (rowIndex < 0) {
      selectedTableRow.value = null;
      return;
    }
    resetFilters();
    page.value = Math.floor(rowIndex / pageSize.value) + 1;
    await nextTick();
    const tableRow = tableData.value.find(
      (item) => item.source.id === focusRowId,
    );
    if (!tableRow) return;
    selectedTableRow.value = tableRow.displayId;
    await nextTick();
    const row = tableHost.value?.querySelector<HTMLElement>(
      `[data-row-key="${String(tableRow.displayId).replace(/"/g, '')}"]`,
    );
    row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    row?.focus();
  },
  { immediate: true },
);

function processStepLabel(id: number | null) {
  if (id === null) return '';
  const item = store.processSteps.find((candidate) => candidate.id === id);
  return item ? `${item.layer} · ${item.name}` : '';
}

function dictionaryLabel(
  items: Array<{ id: number; name: string }>,
  id: number | null,
) {
  if (id === null) return '';
  return items.find((item) => item.id === id)?.name ?? '';
}

function sensorTypesLabel(item: MachineSectionRow) {
  const types = [
    ...new Set(sensorRecords(item).map((sensor) => sensor.sensorType)),
  ];
  return types.length > 0 ? types.join('、') : item.sensorType || '—';
}

function sensorTypeList(item: MachineTableRow) {
  if (item.sensor) return [item.sensor.sensorType];
  return item.sensorType ? [item.sensorType] : [];
}

function sensorSpecsLabel(item: MachineSectionRow) {
  const records = sensorRecords(item);
  if (records.length === 0) return item.spec || '—';
  return records
    .map(
      (sensor) =>
        `${sensor.brand} ${sensor.model} · ${sensor.spec || '未填写规格'}`,
    )
    .join('\n');
}

function sensorOptionLabel(item: SensorItem) {
  const name = [item.brand, item.model].filter(Boolean).join(' ');
  const title = [item.sensorType, name].filter(Boolean).join(' · ');
  return isSensorStatus(item.status, 'current')
    ? title
    : `${title}（${item.status}）`;
}

function resetForm() {
  validationAttempted.value = false;
  editId.value = undefined;
  Object.assign(form, {
    boardCharacteristicId: null,
    desc: '',
    machineModelId: null,
    name: '',
    note: '',
    processStepId: null,
    purpose: '',
    role: '',
    sensorIds: [],
  });
}

function addItem() {
  resetForm();
  dialogOpen.value = true;
}

function editItem(item: MachineSectionRow) {
  validationAttempted.value = false;
  editId.value = item.id;
  Object.assign(form, {
    boardCharacteristicId: item.boardCharacteristicId,
    desc: item.desc,
    machineModelId: item.machineModelId,
    name: item.name,
    note: item.note,
    processStepId: item.processStepId,
    purpose: item.purpose,
    role: item.role,
    sensorIds: [...item.sensorIds],
  });
  dialogOpen.value = true;
}

function saveItem() {
  validationAttempted.value = true;
  const result = store.saveMachineSectionRow(
    props.section.id,
    props.machineName,
    {
      desc: form.desc.trim(),
      machineModelId: isStructure.value ? form.machineModelId : null,
      name: form.name.trim(),
      note: form.note.trim(),
      processStepId: isStructure.value ? form.processStepId : null,
      boardCharacteristicId: isStructure.value
        ? form.boardCharacteristicId
        : null,
      purpose: form.purpose.trim(),
      role: form.role.trim(),
      sensorIds: form.sensorIds.map(Number),
    },
    editId.value,
    props.processId,
  );
  if (
    toastResult(result, editId.value ? '记录已更新' : '记录已新增', {
      validation: isStructure.value
        ? '请填写功能作用并选择关联传感器'
        : '请填写注意分类和事项名称',
    })
  ) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: MachineSectionRow) {
  const label = item.role || item.name;
  const ok = await confirmDelete('删除记录', `确认删除“${label}”吗？`);
  if (!ok) return;
  toastResult(
    store.deleteMachineSectionRow(
      props.section.id,
      props.machineName,
      item.id,
      props.processId,
    ),
    '记录已删除',
  );
}

async function addImages(files: File[]) {
  const next = [...images.value];
  for (const file of files) {
    if (next.length >= 2) break;
    next.push({
      dataUrl: await readDataUrl(file),
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  }
  toastResult(
    store.saveMachineSectionImages(
      props.section.id,
      props.machineName,
      next,
      props.processId,
    ),
    '示意图已更新',
    {
      size: '图片大小不能超过 2 MB',
      type: '仅支持 JPG、PNG 或 WebP 图片',
    },
  );
}

async function removeImage(index: number) {
  const item = images.value[index];
  if (!item) return;
  const ok = await confirmDelete(
    '删除示意图',
    `确认删除“${item.fileName}”吗？`,
  );
  if (!ok) return;
  const next = images.value.filter((_, current) => current !== index);
  toastResult(
    store.saveMachineSectionImages(
      props.section.id,
      props.machineName,
      next,
      props.processId,
    ),
    '示意图已删除',
  );
}
</script>

<template>
  <div
    class="machine-body"
    :class="{
      'machine-body--with-images': isStructure,
      'machine-body--images-collapsed': isStructure && imagesCollapsed,
    }"
  >
    <div ref="tableHost" class="selection-panel">
      <div
        class="selection-toolbar machine-structure-toolbar"
        :class="{ 'machine-structure-toolbar--notes': !isStructure }"
      >
        <ATokenField
          v-if="isStructure"
          v-model="sensorTypeFilters"
          class="selection-toolbar__filter machine-structure-toolbar__select"
          :options="typeOptions"
          placeholder="传感器类型"
          aria-label="传感器类型筛选"
          :max-visible-tokens="1"
        />
        <ASelect
          v-if="isStructure"
          v-model="machineModelFilter"
          class="selection-toolbar__filter machine-structure-toolbar__select"
          :options="machineModelOptions"
          placeholder="机型"
          aria-label="机型筛选"
          filterable
          clearable
        />
        <ASelect
          v-if="isStructure"
          v-model="processStepFilter"
          class="selection-toolbar__filter machine-structure-toolbar__select"
          :options="processStepOptions"
          placeholder="工艺制程"
          aria-label="工艺制程筛选"
          filterable
          clearable
        />
        <ASelect
          v-if="isStructure"
          v-model="boardCharacteristicFilter"
          class="selection-toolbar__filter machine-structure-toolbar__select"
          :options="boardCharacteristicOptions"
          placeholder="板件特性"
          aria-label="板件特性筛选"
          filterable
          clearable
        />
        <ASearchField
          v-model="query"
          class="selection-toolbar__filter machine-structure-toolbar__search"
          :aria-label="isStructure ? '搜索结构内容' : '搜索机型注意事项'"
          :placeholder="
            isStructure
              ? '搜索规格、型号或功能'
              : '搜索注意分类、事项名称、说明或备注'
          "
        />
        <AFilterResetButton :active="hasActiveFilters" @reset="resetFilters" />
        <AButton v-if="writable" variant="filled" @click="addItem">
          新增
        </AButton>
      </div>
      <ATable
        v-model:selected-key="selectedTableRow"
        :columns="columns"
        :rows="tableData"
        row-key="displayId"
        :empty-text="
          query.trim() ||
            sensorTypeFilters.length ||
            machineModelFilter !== null ||
            processStepFilter !== null ||
            boardCharacteristicFilter !== null
            ? '没有匹配的记录'
            : '暂无记录'
        "
        striped
      >
        <template v-if="isStructure" #cell-sensorType="{ row }">
          <div
            v-if="sensorTypeList(row).length"
            class="badge-wrap machine-sensor-entry"
            :class="{
              'machine-sensor-entry--continued': !row.groupEnd,
            }"
          >
            <ABadge
              v-for="type in sensorTypeList(row)"
              :key="type"
              :label="type"
              tone="blue"
            />
          </div>
          <span
            v-else
            class="machine-sensor-entry"
            :class="{
              'machine-sensor-entry--continued': !row.groupEnd,
            }"
          >
            —
          </span>
        </template>
        <template v-if="isStructure" #cell-spec="{ row }">
          <div
            class="machine-spec-cell machine-sensor-entry"
            :class="{
              'machine-sensor-entry--continued': !row.groupEnd,
            }"
          >
            <template v-if="row.sensor">
              <div class="machine-spec-cell__header">
                <span class="machine-spec-cell__brand">{{
                  row.sensor.brand
                }}</span>
                <span class="machine-spec-cell__model">{{
                  row.sensor.model
                }}</span>
              </div>
              <div v-if="row.sensor.spec" class="machine-spec-cell__spec">
                {{ row.sensor.spec }}
              </div>
            </template>
            <template v-else>
              <div class="spec-lines">{{ row.spec || '—' }}</div>
            </template>
          </div>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-actions">
            <AIconButton
              :icon="Pencil"
              label="编辑"
              size="small"
              @click="editItem(row.source)"
            />
            <AIconButton
              :icon="Trash2"
              label="删除"
              size="small"
              variant="destructive"
              @click="deleteItem(row.source)"
            />
          </div>
        </template>
      </ATable>
      <APagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filtered.length"
      />
    </div>
    <aside
      v-if="isStructure"
      class="machine-images"
      :class="{ 'machine-images--collapsed': imagesCollapsed }"
    >
      <div class="machine-images__header">
        <h3 v-if="!imagesCollapsed">结构示意图</h3>
        <AIconButton
          :icon="imagesCollapsed ? PanelRightOpen : PanelRightClose"
          :label="imagesCollapsed ? '展开结构示意图' : '折叠结构示意图'"
          size="small"
          @click="toggleImagesPanel"
        />
      </div>
      <AFileDrop
        v-if="
          !imagesCollapsed && writable && hasTabContent && images.length < 2
        "
        :accept="MACHINE_ROW_IMAGE_RULES.accept"
        :max-bytes="MACHINE_ROW_IMAGE_RULES.maxBytes"
        :extensions="[...MACHINE_ROW_IMAGE_RULES.extensions]"
        :mime-types="[...MACHINE_ROW_IMAGE_RULES.mimeTypes]"
        title="添加图片"
        hint=""
        size-message="图片大小不能超过 2 MB"
        type-message="仅支持 JPG、PNG 或 WebP 图片"
        @files="addImages"
      />
      <p
        v-else-if="!imagesCollapsed && writable && !hasTabContent"
        class="machine-images__empty"
      >
        请先新增内容后再添加图片
      </p>
      <div
        v-for="(image, index) in images"
        v-show="!imagesCollapsed"
        :key="`${image.fileName}-${index}`"
        class="image-card"
      >
        <button
          class="image-card__preview"
          type="button"
          :aria-label="`预览 ${image.fileName}`"
          @click="preview = image"
        >
          <img :src="image.dataUrl" :alt="image.fileName">
        </button>
        <div class="image-card__footer">
          <span class="image-card__name" :title="image.fileName">
            {{ image.fileName }}
          </span>
          <div class="image-card__actions">
            <AIconButton
              :icon="Maximize2"
              :label="`放大预览 ${image.fileName}`"
              size="small"
              @click="preview = image"
            />
            <AIconButton
              v-if="writable"
              :icon="Trash2"
              :label="`删除 ${image.fileName}`"
              size="small"
              variant="destructive"
              @click="removeImage(index)"
            />
          </div>
        </div>
      </div>
    </aside>
  </div>
  <ASheet
    v-model:open="dialogOpen"
    :title="editId ? '编辑记录' : '新增记录'"
    :width="isStructure ? 640 : 480"
  >
    <AFormGrid v-if="isStructure" :columns="1">
      <AFormRow
        label="功能作用"
        required
        :error="
          validationAttempted && !form.role.trim()
            ? '请输入功能作用'
            : undefined
        "
      >
        <AField v-model="form.role" :maxlength="80" />
      </AFormRow>
      <AFormRow label="机型" hint="可选；来自“数据字典 → 机型”。">
        <ASelect
          v-model="form.machineModelId"
          :options="machineModelOptions"
          placeholder="选择机型（可选）"
          filterable
          clearable
        />
      </AFormRow>
      <AFormRow label="工艺制程" hint="可选；来自“制程管理 → 工艺制程”。">
        <ASelect
          v-model="form.processStepId"
          :options="processStepOptions"
          placeholder="选择工艺制程（可选）"
          filterable
          clearable
        />
      </AFormRow>
      <AFormRow label="板件特性" hint="可选；来自“数据字典 → 板件特性”。">
        <ASelect
          v-model="form.boardCharacteristicId"
          :options="boardCharacteristicOptions"
          placeholder="选择板件特性（可选）"
          filterable
          clearable
        />
      </AFormRow>
      <AFormRow
        label="关联传感器"
        required
        hint="规格和型号来自 Sensor型号；目录替换后这里会自动更新。"
        :error="
          validationAttempted && form.sensorIds.length === 0
            ? '请选择关联传感器'
            : undefined
        "
      >
        <ATokenField
          v-model="form.sensorIds"
          :options="sensorOptions"
          filterable
          :max-visible-tokens="2"
          placeholder="按类型、品牌或型号搜索"
        />
      </AFormRow>
      <AFormRow label="作用">
        <ATextArea v-model="form.purpose" :rows="3" :maxlength="500" />
      </AFormRow>
      <AFormRow label="备注">
        <AField v-model="form.note" :maxlength="200" />
      </AFormRow>
    </AFormGrid>
    <AFormGrid v-else :columns="1">
      <AFormRow
        label="注意分类"
        required
        :error="
          validationAttempted && !form.role.trim()
            ? '请输入注意分类'
            : undefined
        "
      >
        <AField v-model="form.role" :maxlength="80" />
      </AFormRow>
      <AFormRow
        label="事项名称"
        required
        :error="
          validationAttempted && !form.name.trim()
            ? '请输入事项名称'
            : undefined
        "
      >
        <AField v-model="form.name" :maxlength="80" />
      </AFormRow>
      <AFormRow label="说明">
        <ATextArea v-model="form.desc" :rows="3" :maxlength="500" />
      </AFormRow>
      <AFormRow label="备注">
        <AField v-model="form.note" :maxlength="200" />
      </AFormRow>
    </AFormGrid>
    <template #footer>
      <AButton @click="dialogOpen = false">取消</AButton>
      <AButton variant="filled" @click="saveItem">保存</AButton>
    </template>
  </ASheet>
  <AImageViewer
    v-if="preview"
    v-model:open="imageOpen"
    :src="preview.dataUrl"
    :alt="preview.fileName"
  />
</template>

<style scoped>
.machine-structure-toolbar {
  display: grid;
  grid-template-columns:
    minmax(7rem, 1.2fr) repeat(3, minmax(6.25rem, 1fr))
    minmax(7.5rem, 2.6fr) auto auto;
  gap: var(--space-2);
}

.machine-structure-toolbar--notes {
  grid-template-columns: minmax(12rem, 1fr) auto auto;
}

.machine-structure-toolbar .a-select.machine-structure-toolbar__select,
.machine-structure-toolbar .a-token-field.machine-structure-toolbar__select {
  width: 100%;
  min-width: 0;
  max-width: none;
}

.machine-structure-toolbar .a-control.machine-structure-toolbar__search {
  width: 100%;
  min-width: 0;
}

@media (width <= 48rem) {
  .machine-structure-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .machine-structure-toolbar__search {
    grid-column: 1 / -1;
  }
}

.machine-spec-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: 2px 0;
}

.machine-sensor-entry {
  box-sizing: border-box;
  width: 100%;
  min-height: 2.5rem;
  padding-block: var(--space-2);
}

.machine-sensor-entry--continued {
  border-bottom: 1px solid var(--separator);
}

.machine-spec-cell__header {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  font: var(--text-field);
  line-height: 1.3;
}

.machine-spec-cell__brand {
  font-weight: 600;
  color: var(--label);
}

.machine-spec-cell__model {
  font-family: var(--font-mono);
  color: var(--sys-blue);
  font-weight: 500;
}

.machine-spec-cell__spec {
  font: var(--text-caption);
  color: var(--label-2);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
</style>
