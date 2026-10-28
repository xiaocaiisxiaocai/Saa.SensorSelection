<script setup lang="ts">
import { Empty } from 'ant-design-vue';
import { Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-vue-next';
import { computed, nextTick, ref, watch } from 'vue';

import type {
  MachineSectionItem,
  MachineSectionRow,
  SaveResult,
} from '@/domain';
import AdminColumnSettingsMenu from '@/pages/shared/AdminColumnSettingsMenu.vue';
import { useManagedTableColumns } from '@/pages/shared/managed-table-columns';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  PAGINATION_PROPS,
  cellText,
  columnFilter,
  columnFilterValues,
  isColumnFilterChange,
  rowClick,
  scrollX,
  setColumnFilter,
  type ColumnFilterMap,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
import { AHighlightText } from '@/ui';

import MachineRowDialog from './MachineRowDialog.vue';
import MachineRowImageCell from './MachineRowImageCell.vue';
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
  section: MachineSectionItem;
  /** 表格还没建时传入（机型的直属表格按需创建）：显示空表，第一笔记录连同表格一起保存 */
  saveFirstRow?: (
    payload: Partial<MachineSectionRow>,
  ) => SaveResult<MachineSectionRow>;
  /** 没有记录时的说明（如「XX 在 YY 下还没有选型记录」）；传了会在空态里附新增按钮 */
  emptyHint?: string;
}>();
const EMPTY_IMAGE = Empty.PRESENTED_IMAGE_SIMPLE;

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));
const rowDialog = ref<InstanceType<typeof MachineRowDialog>>();
const query = ref('');
const sensorTypeFilters = ref<Array<string | number>>([]);
const boardCharacteristicFilters = ref<Array<string | number>>([]);
const page = ref(1);
const pageSize = ref(20);
const selectedTableRow = ref<string | number | null>(null);
const tableHost = ref<HTMLElement | null>(null);
const isStructure = computed(() => props.section.kind === 'structure');

const typeOptions = computed(() =>
  store
    .dictionaryNames('sensor-type')
    .map((name) => ({ label: name, value: name })),
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
  props.saveFirstRow
    ? []
    : store.machineSectionRows(props.section.id, props.machineName),
);
const hasActiveFilters = computed(
  () =>
    Boolean(query.value.trim()) ||
    sensorTypeFilters.value.length > 0 ||
    boardCharacteristicFilters.value.length > 0,
);
const filtered = computed(() =>
  filterSectionRows(
    items.value,
    isStructure.value,
    {
      query: query.value,
      sensorTypes: sensorTypeFilters.value,
      machineModelIds: [],
      processStepIds: [],
      boardCharacteristicIds: boardCharacteristicFilters.value,
    },
    {
      sensorById: sensorById.value,
      processSteps: store.processSteps,
      machineModels: [],
      boardCharacteristics: boardCharacteristicItems.value,
    },
  ),
);
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return buildMachineTableRows(
    filtered.value.slice(start, start + pageSize.value),
    store.sensors,
    isStructure.value,
    [],
    [],
    boardCharacteristicItems.value,
  );
});
const baseColumns = computed(() => {
  const base = sectionColumns({
    structure: isStructure.value,
    writable: writable.value,
  });
  if (!isStructure.value) return base;
  return base.map((column) => {
    if (column.key === 'sensorType') {
      return {
        ...column,
        ...columnFilter({
          options: typeOptions.value,
          value: sensorTypeFilters.value,
          search: true,
        }),
      };
    }
    if (column.key === 'boardCharacteristicName') {
      return {
        ...column,
        ...columnFilter({
          options: boardCharacteristicOptions.value,
          value: boardCharacteristicFilters.value,
          search: true,
        }),
      };
    }
    return column;
  });
});
const {
  canManage: canManageColumns,
  columns,
  hidden: hiddenColumns,
  onResizeColumn,
  options: columnOptions,
  setVisible: setColumnVisible,
  showAll: showAllColumns,
} = useManagedTableColumns(
  () =>
    isStructure.value ? 'machine-section:structure' : 'machine-section:notes',
  () => baseColumns.value,
);

watch(
  () => [props.section.id, props.machineName] as const,
  () => {
    query.value = '';
    sensorTypeFilters.value = [];
    boardCharacteristicFilters.value = [];
    page.value = 1;
  },
);
watch([query, sensorTypeFilters, boardCharacteristicFilters, pageSize], () => {
  page.value = 1;
});
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
  boardCharacteristicFilters.value = [];
  page.value = 1;
}

function onTableChange(
  _pagination: unknown,
  filters: ColumnFilterMap,
  _order: unknown,
  extra: { action?: string },
) {
  if (!isColumnFilterChange(extra)) return;
  setColumnFilter(sensorTypeFilters, columnFilterValues(filters, 'sensorType'));
  setColumnFilter(
    boardCharacteristicFilters,
    columnFilterValues(filters, 'boardCharacteristicName'),
  );
}

// 已经定位过的目标（分区 + 机型 + 行 id）。依赖 items.length 是为了
// 数据晚到时还能补定位；但同一个目标只定位一次，否则用户在分区里增删行
// 会反复清空筛选、把页码拉回目标行。
let handledFocusKey: null | string = null;

function focusKey(focusRowId: number, sectionId: number, machineName: string) {
  return JSON.stringify([sectionId, machineName, focusRowId]);
}

watch(
  () =>
    [
      props.focusRowId,
      props.section.id,
      props.machineName,
      items.value.length,
    ] as const,
  async ([focusRowId, sectionId, machineName]) => {
    if (!focusRowId) {
      handledFocusKey = null;
      selectedTableRow.value = null;
      return;
    }
    const key = focusKey(focusRowId, sectionId, machineName);
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
    const rowIndex = filtered.value.findIndex((item) => item.id === focusRowId);
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
    store.deleteMachineSectionRow(props.section.id, props.machineName, item.id),
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
  <div class="machine-body">
    <div ref="tableHost" class="selection-panel">
      <div class="selection-toolbar">
        <a-input
          v-model:value="query"
          class="selection-toolbar__filter"
          :aria-label="isStructure ? '搜索结构内容' : '搜索机型注意事项'"
          :placeholder="isStructure ? '搜索选型' : '搜索注意事项'"
          allow-clear
        >
          <template #prefix><Search :size="14" /></template>
        </a-input>
        <a-tooltip
          :title="
            hasActiveFilters ? '清除搜索和表头筛选' : '当前没有可清除的筛选'
          "
        >
          <span class="selection-toolbar__reset">
            <a-button
              type="text"
              :disabled="!hasActiveFilters"
              aria-label="重置筛选"
              @click="resetFilters"
            >
              <template #icon><RotateCcw :size="14" /></template>
              重置
            </a-button>
          </span>
        </a-tooltip>
        <div class="selection-toolbar__actions">
          <AdminColumnSettingsMenu
            :can-manage="canManageColumns"
            :columns="columnOptions"
            :hidden="hiddenColumns"
            :on-set-visible="setColumnVisible"
            :on-show-all="showAllColumns"
          />
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
        @resize-column="onResizeColumn"
        @change="onTableChange"
      >
        <template #emptyText>
          <a-empty
            :image="EMPTY_IMAGE"
            :description="
              hasActiveFilters ? '没有匹配的记录' : emptyHint || '暂无记录'
            "
          >
            <a-button
              v-if="!hasActiveFilters && emptyHint && writable"
              type="primary"
              @click="rowDialog?.open()"
            >
              {{ isStructure ? '新增选型' : '新增事项' }}
            </a-button>
          </a-empty>
        </template>
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
                <AHighlightText :text="type" :query="query" />
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
                  <span class="machine-spec-cell__brand"><AHighlightText :text="row.sensor.brand" :query="query" /></span>
                  <span class="machine-spec-cell__model"><AHighlightText :text="row.sensor.model" :query="query" /></span>
                </div>
                <div v-if="row.sensor.spec" class="machine-spec-cell__spec">
                  <AHighlightText :text="row.sensor.spec" :query="query" />
                </div>
              </template>
              <template v-else>
                <div class="spec-lines">
                  <AHighlightText :text="row.spec || '—'" :query="query" />
                </div>
              </template>
            </div>
          </template>
          <MachineRowImageCell
            v-else-if="column.key === 'image'"
            :rows="row.imageRows"
            :previous-row="row.previousRow"
            :section-id="section.id"
            :machine-name="machineName"
            :writable="writable"
          />
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
          <AHighlightText v-else :text="cellText(text)" :query="query" />
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
  </div>
  <MachineRowDialog
    ref="rowDialog"
    :section-id="section.id"
    :machine-name="machineName"
    :structure="isStructure"
    :save-first-row="saveFirstRow"
  />
</template>

<style scoped src="./MachineSectionPanel.css"></style>
