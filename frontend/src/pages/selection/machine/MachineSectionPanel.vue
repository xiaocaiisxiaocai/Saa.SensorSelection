<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import {
  ImagePlus,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
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
  type MachineSectionItem,
  type MachineSectionRow,
  type SensorItem,
} from '@/domain';
import { useDirtyGuard } from '@/pages/shared/dirty-guard';
import { createFilePicker } from '@/pages/shared/file-rules';
import { uploadFile } from '@/pages/shared/files';
import { fieldError } from '@/pages/shared/form';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  PAGE_SIZE_OPTIONS,
  cellText,
  rowClick,
  scrollX,
  sortFromChange,
  sortOrderOf,
  sortRows,
  type TableSortState,
} from '@/pages/shared/table';
import { UPLOADING_TITLE, useUploadLock } from '@/pages/shared/upload-lock';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import { buildMachineTableRows, type MachineTableRow } from './table-rows';

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
const page = ref(1);
const pageSize = ref(20);
const sort = ref<TableSortState | null>(null);
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
const dirtyGuard = useDirtyGuard(form);
const { uploading, runUpload } = useUploadLock();

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
const typeOptions = computed(() =>
  store
    .dictionaryNames('sensor-type')
    .map((name) => ({ label: name, value: name })),
);
const processStepOptions = computed(() =>
  store.processSteps.map((item) => ({
    label: `${item.layer} · ${item.name}`,
    value: item.id,
  })),
);
const machineModelItems = computed(() =>
  store.dictionaryItems('machine-model'),
);
const machineModelOptions = computed(() =>
  machineModelItems.value.map((item) => ({ label: item.name, value: item.id })),
);
const boardCharacteristicItems = computed(() =>
  store.dictionaryItems('board-characteristic'),
);
const boardCharacteristicOptions = computed(() =>
  boardCharacteristicItems.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);
// 筛选/搜索会对每一行反复取关联传感器，用 Map 避免每个 id 都线性扫描。
const sensorById = computed(
  () => new Map(store.sensors.map((sensor) => [sensor.id, sensor])),
);

const sensorOptions = computed(() =>
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
// 排序必须发生在分页切片之前，否则只会把当前这一页重排。结构视图带合并
// 单元格（rowSpan），重排会打乱分组，ATable 会整表忽略排序，这里也排不到。
const sortedItems = computed(() => sortRows(filtered.value, sort.value));
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return buildMachineTableRows(
    sortedItems.value.slice(start, start + pageSize.value),
    store.sensors,
    isStructure.value,
    store.processSteps,
    machineModelItems.value,
    boardCharacteristicItems.value,
  );
});
type Column = TableColumnType<MachineTableRow>;
const columns = computed<Column[]>(() => {
  // 结构视图一条记录按传感器展开成多行，除传感器两列外都合并单元格
  const merged: Pick<Column, 'customCell'> = isStructure.value
    ? { customCell: (row) => ({ rowSpan: row.groupStart ? row.groupSize : 0 }) }
    : {};
  const cols: Column[] = isStructure.value
    ? [
        {
          key: 'role',
          dataIndex: 'role',
          title: '功能作用',
          width: 104,
          fixed: 'left',
          ...merged,
        },
        {
          key: 'machineModelName',
          dataIndex: 'machineModelName',
          title: '机型',
          width: 100,
          ...merged,
        },
        {
          key: 'processStepName',
          dataIndex: 'processStepName',
          title: '工艺制程',
          width: 110,
          ...merged,
        },
        {
          key: 'boardCharacteristicName',
          dataIndex: 'boardCharacteristicName',
          title: '板件特性',
          width: 120,
          ...merged,
        },
        {
          key: 'sensorType',
          dataIndex: 'sensorType',
          title: '传感器类型',
          width: 116,
        },
        { key: 'spec', dataIndex: 'spec', title: '规格', width: 220 },
        {
          key: 'purpose',
          dataIndex: 'purpose',
          title: '作用',
          width: 120,
          ...merged,
        },
        { key: 'note', dataIndex: 'note', title: '备注', width: 96, ...merged },
      ]
    : [
        {
          key: 'role',
          dataIndex: 'role',
          title: '注意分类',
          width: 120,
          fixed: 'left',
          sorter: true,
          sortOrder: sortOrderOf(sort.value, 'role'),
        },
        {
          key: 'name',
          dataIndex: 'name',
          title: '事项名称',
          width: 140,
          sorter: true,
          sortOrder: sortOrderOf(sort.value, 'name'),
        },
        { key: 'desc', dataIndex: 'desc', title: '说明', width: 180 },
        { key: 'note', dataIndex: 'note', title: '备注', width: 120 },
      ];
  if (writable.value) {
    cols.push({
      key: 'actions',
      title: '操作',
      width: 72,
      fixed: 'right',
      ...merged,
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
    sort,
  ],
  () => {
    page.value = 1;
  },
);
// 删掉最后一页唯一一行后总页数变少，APagination 会因只剩一页而隐藏，
// 当前页却还停在越界页上，表格就成了空白；这里把页码收回到最大页。
watch(
  () => [filtered.value.length, pageSize.value] as const,
  () => {
    const maxPage = Math.max(
      1,
      Math.ceil(filtered.value.length / pageSize.value),
    );
    if (page.value > maxPage) page.value = maxPage;
  },
);

function sensorRecords(item: MachineSectionRow): SensorItem[] {
  return (item.sensorIds ?? [])
    .map((id) => sensorById.value.get(id))
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

// 已经定位过的目标（分区 + 机型 + 制程 + 行 id）。依赖 items.length 是为了
// 数据晚到时还能补定位；但同一个目标只定位一次，否则用户在分区里增删行
// 会反复清空筛选、把页码拉回目标行。
let handledFocusKey: null | string = null;

function focusKey(
  focusRowId: number,
  sectionId: number,
  machineName: string,
  processId: number,
) {
  return JSON.stringify([sectionId, machineName, processId, focusRowId]);
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
  async ([focusRowId, sectionId, machineName, processId]) => {
    if (!focusRowId) {
      handledFocusKey = null;
      selectedTableRow.value = null;
      return;
    }
    const key = focusKey(focusRowId, sectionId, machineName, processId);
    if (key === handledFocusKey) return;
    if (!items.value.some((item) => item.id === focusRowId)) {
      selectedTableRow.value = null;
      return;
    }
    handledFocusKey = key;
    resetFilters();
    // 清空筛选会触发上面的筛选 watcher 把页码重置为 1；等它跑完再设页码，
    // 否则目标行在第 2 页以后时会被拉回第 1 页而定位失败。
    await nextTick();
    if (handledFocusKey !== key) return;
    const rowIndex = sortedItems.value.findIndex(
      (item) => item.id === focusRowId,
    );
    if (rowIndex < 0) return;
    page.value = Math.floor(rowIndex / pageSize.value) + 1;
    await nextTick();
    if (handledFocusKey !== key) return;
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
  dirtyGuard.markClean();
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
  if (notifyResult(result, editId.value ? '记录已更新' : '记录已新增')) {
    dialogOpen.value = false;
  }
}

async function deleteItem(item: MachineSectionRow) {
  const label = item.role || item.name;
  const ok = await confirmDelete('删除记录', `确认删除“${label}”吗？`);
  if (!ok) return;
  notifyResult(
    store.deleteMachineSectionRow(
      props.section.id,
      props.machineName,
      item.id,
      props.processId,
    ),
    '记录已删除',
  );
}

// 上传中锁：两次拖放并发时都会基于同一份旧图片列表，后完成的会覆盖先完成的。
function addImages(files: File[]) {
  return runUpload(() => uploadImages(files));
}

const imagePicker = createFilePicker(
  {
    ...MACHINE_ROW_IMAGE_RULES,
    sizeMessage: '图片大小不能超过 2 MB',
    typeMessage: '仅支持 JPG、PNG 或 WebP 图片',
  },
  addImages,
);

const customRow = computed(() =>
  writable.value
    ? rowClick<MachineTableRow>((row) => editItem(row.source))
    : undefined,
);

async function uploadImages(files: File[]) {
  // 上传是异步的，途中可能切换到别的机型/分区；目标分区和基础图片列表必须在
  // 第一次 await 之前记下，否则会把图片写进切换后的分区。
  const sectionId = props.section.id;
  const machineName = props.machineName;
  const processId = props.processId;
  const base = [...images.value];
  const next = [...base];
  for (const file of files) {
    if (next.length >= 2) break;
    const dataUrl = await uploadFile(file);
    if (!dataUrl) continue;
    next.push({
      dataUrl,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    });
  }
  // 全部上传失败时已逐个提示，不再提交一次没有变化的保存。
  if (next.length === base.length) return;
  notifyResult(
    store.saveMachineSectionImages(sectionId, machineName, next, processId),
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
  notifyResult(
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
      <div class="selection-toolbar">
        <a-select
          v-if="isStructure"
          v-model:value="sensorTypeFilters"
          mode="multiple"
          class="selection-toolbar__filter"
          :options="typeOptions"
          placeholder="传感器类型"
          aria-label="传感器类型筛选"
          :max-tag-count="1"
          allow-clear
          option-filter-prop="label"
        />
        <a-select
          v-if="isStructure"
          v-model:value="machineModelFilter"
          class="selection-toolbar__filter"
          :options="machineModelOptions"
          placeholder="机型"
          aria-label="机型筛选"
          show-search
          option-filter-prop="label"
          allow-clear
        />
        <a-select
          v-if="isStructure"
          v-model:value="processStepFilter"
          class="selection-toolbar__filter"
          :options="processStepOptions"
          placeholder="工艺制程"
          aria-label="工艺制程筛选"
          show-search
          option-filter-prop="label"
          allow-clear
        />
        <a-select
          v-if="isStructure"
          v-model:value="boardCharacteristicFilter"
          class="selection-toolbar__filter"
          :options="boardCharacteristicOptions"
          placeholder="板件特性"
          aria-label="板件特性筛选"
          show-search
          option-filter-prop="label"
          allow-clear
        />
        <a-input
          v-model:value="query"
          class="selection-toolbar__filter"
          :aria-label="isStructure ? '搜索结构内容' : '搜索机型注意事项'"
          :placeholder="
            isStructure
              ? '搜索规格、型号或功能'
              : '搜索注意分类、事项名称、说明或备注'
          "
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
        <a-button
          v-if="writable"
          type="primary"
          :aria-label="isStructure ? '新增选型' : '新增事项'"
          @click="addItem"
        >
          <Plus :size="14" :stroke-width="1.5" />
          {{ isStructure ? '新增选型' : '新增事项' }}
        </a-button>
      </div>
      <a-table
        :columns="columns"
        :data-source="tableData"
        row-key="displayId"
        :pagination="false"
        :scroll="{ x: scrollX(columns) }"
        :custom-row="customRow"
        :row-class-name="
          (row: MachineTableRow) =>
            row.displayId === selectedTableRow ? 'ant-table-row-selected' : ''
        "
        :locale="{
          emptyText:
            query.trim() ||
            sensorTypeFilters.length ||
            machineModelFilter !== null ||
            processStepFilter !== null ||
            boardCharacteristicFilter !== null
              ? '没有匹配的记录'
              : '暂无记录',
        }"
        @change="
          (_p: unknown, _f: unknown, sorter: unknown) =>
            (sort = sortFromChange(sorter))
        "
      >
        <template #bodyCell="{ column, record: row, text }">
          <template v-if="isStructure && column.key === 'sensorType'">
            <a-space
              v-if="sensorTypeList(row).length"
              class="machine-sensor-entry"
              :size="[4, 4]"
              wrap
              :class="{
                'machine-sensor-entry--continued': !row.groupEnd,
              }"
            >
              <a-tag
                v-for="type in sensorTypeList(row)"
                :key="type"
                color="blue"
              >
                {{ type }}
              </a-tag>
            </a-space>
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
          <template v-else-if="isStructure && column.key === 'spec'">
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
          <template v-else-if="column.key === 'actions'">
            <a-space :size="4">
              <a-tooltip title="编辑">
                <a-button
                  type="text"
                  size="small"
                  aria-label="编辑"
                  @click="editItem(row.source)"
                >
                  <template #icon><Pencil :size="14" /></template>
                </a-button>
              </a-tooltip>
              <a-tooltip title="删除">
                <a-button
                  type="text"
                  size="small"
                  danger
                  aria-label="删除"
                  @click="deleteItem(row.source)"
                >
                  <template #icon><Trash2 :size="14" /></template>
                </a-button>
              </a-tooltip>
            </a-space>
          </template>
          <template v-else>{{ cellText(text) }}</template>
        </template>
      </a-table>
      <a-pagination
        v-model:current="page"
        v-model:page-size="pageSize"
        class="table-pagination"
        :total="filtered.length"
        :page-size-options="PAGE_SIZE_OPTIONS"
        show-size-changer
        hide-on-single-page
        :show-total="(count: number) => `共 ${count} 条`"
      />
    </div>
    <aside
      v-if="isStructure"
      class="machine-images"
      :class="{ 'machine-images--collapsed': imagesCollapsed }"
    >
      <div class="machine-images__header">
        <h3 v-if="!imagesCollapsed">结构示意图</h3>
        <a-tooltip
          :title="imagesCollapsed ? '展开结构示意图' : '折叠结构示意图'"
        >
          <a-button
            type="text"
            size="small"
            :aria-label="imagesCollapsed ? '展开结构示意图' : '折叠结构示意图'"
            @click="toggleImagesPanel"
          >
            <template #icon>
              <component
                :is="imagesCollapsed ? PanelRightOpen : PanelRightClose"
                :size="14"
              />
            </template>
          </a-button>
        </a-tooltip>
      </div>
      <a-upload-dragger
        v-if="
          !imagesCollapsed && writable && hasTabContent && images.length < 2
        "
        :accept="MACHINE_ROW_IMAGE_RULES.accept"
        :before-upload="imagePicker.beforeUpload"
        :disabled="uploading"
        :show-upload-list="false"
        multiple
        @reject="imagePicker.onReject"
      >
        <p class="ant-upload-drag-icon"><ImagePlus :size="28" /></p>
        <p class="ant-upload-text">
          {{ uploading ? UPLOADING_TITLE : '添加图片' }}
        </p>
      </a-upload-dragger>
      <p
        v-else-if="!imagesCollapsed && writable && !hasTabContent"
        class="machine-images__empty"
      >
        请先新增内容后再添加图片
      </p>
      <a-image-preview-group v-if="!imagesCollapsed">
        <a-card
          v-for="(image, index) in images"
          :key="`${image.fileName}-${index}`"
          class="image-card"
          size="small"
          :body-style="{ padding: 0 }"
        >
          <a-image
            class="image-card__media"
            :src="image.dataUrl"
            :alt="image.fileName"
            width="100%"
          />
          <template #actions>
            <span class="image-card__name" :title="image.fileName">
              {{ image.fileName }}
            </span>
            <a-tooltip v-if="writable" :title="`删除 ${image.fileName}`">
              <a-button
                type="text"
                size="small"
                danger
                :aria-label="`删除 ${image.fileName}`"
                @click="removeImage(index)"
              >
                <template #icon><Trash2 :size="14" /></template>
              </a-button>
            </a-tooltip>
          </template>
        </a-card>
      </a-image-preview-group>
    </aside>
  </div>
  <a-modal
    :open="dialogOpen"
    :title="editId ? '编辑记录' : '新增记录'"
    :width="isStructure ? 640 : 480"
    destroy-on-close
    @cancel="cancelDialog"
  >
    <a-form v-if="isStructure" layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-role"
            label="功能作用"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.role.trim()
                  ? '请输入功能作用'
                  : undefined,
              )
            "
          >
            <a-input
              id="machine-section-role"
              v-model:value="form.role"
              :maxlength="80"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-machine-model-id"
            label="机型"
            extra="可选；来自“数据字典 → 机型”。"
          >
            <a-select
              id="machine-section-machine-model-id"
              v-model:value="form.machineModelId"
              :options="machineModelOptions"
              placeholder="选择机型（可选）"
              show-search
              option-filter-prop="label"
              allow-clear
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-process-step-id"
            label="工艺制程"
            extra="可选；来自“制程管理 → 工艺制程”。"
          >
            <a-select
              id="machine-section-process-step-id"
              v-model:value="form.processStepId"
              :options="processStepOptions"
              placeholder="选择工艺制程（可选）"
              show-search
              option-filter-prop="label"
              allow-clear
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-board-characteristic-id"
            label="板件特性"
            extra="可选；来自“数据字典 → 板件特性”。"
          >
            <a-select
              id="machine-section-board-characteristic-id"
              v-model:value="form.boardCharacteristicId"
              :options="boardCharacteristicOptions"
              placeholder="选择板件特性（可选）"
              show-search
              option-filter-prop="label"
              allow-clear
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-sensor-ids"
            label="关联传感器"
            required
            v-bind="
              fieldError(
                validationAttempted && form.sensorIds.length === 0
                  ? '请选择关联传感器'
                  : undefined,
              )
            "
            extra="规格和型号来自 Sensor型号；目录替换后这里会自动更新。"
          >
            <a-select
              id="machine-section-sensor-ids"
              v-model:value="form.sensorIds"
              mode="multiple"
              :options="sensorOptions"
              placeholder="按类型、品牌或型号搜索"
              :max-tag-count="2"
              allow-clear
              option-filter-prop="label"
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-section-purpose" label="作用">
            <a-textarea
              id="machine-section-purpose"
              v-model:value="form.purpose"
              :rows="3"
              :maxlength="500"
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-section-note" label="备注">
            <a-input
              id="machine-section-note"
              v-model:value="form.note"
              :maxlength="200"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <a-form v-else layout="vertical">
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-role-2"
            label="注意分类"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.role.trim()
                  ? '请输入注意分类'
                  : undefined,
              )
            "
          >
            <a-input
              id="machine-section-role-2"
              v-model:value="form.role"
              :maxlength="80"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item
            html-for="machine-section-name"
            label="事项名称"
            required
            v-bind="
              fieldError(
                validationAttempted && !form.name.trim()
                  ? '请输入事项名称'
                  : undefined,
              )
            "
          >
            <a-input
              id="machine-section-name"
              v-model:value="form.name"
              :maxlength="80"
              allow-clear
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-section-desc" label="说明">
            <a-textarea
              id="machine-section-desc"
              v-model:value="form.desc"
              :rows="3"
              :maxlength="500"
              show-count
            />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item html-for="machine-section-note-2" label="备注">
            <a-input
              id="machine-section-note-2"
              v-model:value="form.note"
              :maxlength="200"
              allow-clear
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
</template>

<style scoped>
.machine-spec-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

/* 一条记录展开成多行传感器时，行内用分隔线区分各传感器 */
.machine-sensor-entry {
  width: 100%;
  padding-block: var(--space-2);
}

.machine-sensor-entry--continued {
  border-bottom: 1px solid var(--color-split);
}

.machine-spec-cell__header {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.machine-spec-cell__brand {
  font-weight: 600;
}

.machine-spec-cell__model {
  font-family: var(--font-family-code);
  color: var(--color-primary);
}

.machine-spec-cell__spec {
  font: var(--font-sm);
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}
</style>
