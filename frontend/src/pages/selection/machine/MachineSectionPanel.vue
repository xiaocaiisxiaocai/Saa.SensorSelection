<script setup lang="ts">
import { Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, nextTick, ref, watch } from 'vue';

import type { MachineSectionItem, MachineSectionRow } from '@/domain';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  PAGINATION_PROPS,
  cellText,
  rowClick,
  scrollX,
  sortFromChange,
  sortRows,
  type TableSortState,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import MachineRowDialog from './MachineRowDialog.vue';
import MachineSectionImages from './MachineSectionImages.vue';
import {
  buildMachineTableRows,
  filterSectionRows,
  sectionColumns,
  sensorTypeList,
  type MachineTableRow,
} from './table-rows';

const props = defineProps<{
  focusRowId?: number;
  machineName: string;
  processId: number;
  section: MachineSectionItem;
}>();

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const rowDialog = ref<InstanceType<typeof MachineRowDialog>>();
const query = ref('');
const sensorTypeFilters = ref<Array<string | number>>([]);
const machineModelFilter = ref<string | number | null>(null);
const processStepFilter = ref<string | number | null>(null);
const boardCharacteristicFilter = ref<string | number | null>(null);
const imagesCollapsed = ref(false);
const page = ref(1);
const pageSize = ref(20);
const sort = ref<TableSortState | null>(null);
const selectedTableRow = ref<string | number | null>(null);
const tableHost = ref<HTMLElement | null>(null);
const isStructure = computed(() => props.section.kind === 'structure');

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
const filtered = computed(() =>
  filterSectionRows(
    items.value,
    isStructure.value,
    {
      query: query.value,
      sensorTypes: sensorTypeFilters.value,
      machineModelId: machineModelFilter.value,
      processStepId: processStepFilter.value,
      boardCharacteristicId: boardCharacteristicFilter.value,
    },
    {
      sensorById: sensorById.value,
      processSteps: store.processSteps,
      machineModels: machineModelItems.value,
      boardCharacteristics: boardCharacteristicItems.value,
    },
  ),
);
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
const columns = computed(() =>
  sectionColumns({
    structure: isStructure.value,
    sort: sort.value,
    writable: writable.value,
  }),
);

watch(
  () => [props.section.id, props.machineName, props.processId] as const,
  () => {
    query.value = '';
    sensorTypeFilters.value = [];
    machineModelFilter.value = null;
    processStepFilter.value = null;
    boardCharacteristicFilter.value = null;
    page.value = 1;
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

function editItem(item: MachineSectionRow) {
  rowDialog.value?.open(item);
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

const customRow = computed(() =>
  writable.value
    ? rowClick<MachineTableRow>((row) => editItem(row.source))
    : undefined,
);
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
          @click="rowDialog?.open()"
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
        v-bind="PAGINATION_PROPS"
      />
    </div>
    <MachineSectionImages
      v-if="isStructure"
      v-model:collapsed="imagesCollapsed"
      :section-id="section.id"
      :machine-name="machineName"
      :process-id="processId"
      :has-content="hasTabContent"
    />
  </div>
  <MachineRowDialog
    ref="rowDialog"
    :section-id="section.id"
    :machine-name="machineName"
    :process-id="processId"
    :structure="isStructure"
  />
</template>

<style scoped src="./MachineSectionPanel.css"></style>
