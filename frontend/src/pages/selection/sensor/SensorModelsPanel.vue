<script setup lang="ts">
import { message } from 'ant-design-vue';
import {
  Download,
  Eye,
  Pencil,
  Replace,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import {
  findSensorStatusName,
  isSensorStatus,
  sensorStatusRank,
  type SensorFileItem,
  type SensorItem,
} from '@/domain';
import { confirmDelete, notifyResult } from '@/pages/shared/save-feedback';
import {
  cellText,
  PAGINATION_PROPS,
  rowClick,
  scrollX,
  sortFromChange,
  sortRows,
  type TableSortState,
} from '@/pages/shared/table';
import { useAccess } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import SensorColumnMenu from './SensorColumnMenu.vue';
import SensorFormDialog from './SensorFormDialog.vue';
import SensorLinkedPreview from './SensorLinkedPreview.vue';
import SensorReplaceDialog from './SensorReplaceDialog.vue';
import { downloadSensorExcel } from './sensor-excel';
import {
  exportCell,
  filterSensors,
  HIDEABLE_COLUMNS,
  relationText,
  sensorColumns,
  statusColor,
  typeAccent,
  type SensorLookup,
} from './sensor-table';
import { useHiddenColumns } from './use-hidden-columns';

/**
 * 「型号」页签：筛选工具栏 + 型号表格 + 分页，以及新增/编辑、替换、预览对话框。
 * 筛选条件由父页面持有（要同步到地址栏），这里通过 v-model 读写。
 */
const status = defineModel<string>('status', { required: true });
const query = defineModel<string>('query', { required: true });
const sensorTypes = defineModel<Array<string | number>>('sensorTypes', {
  required: true,
});

const store = useSelectionStore();
const { canWrite } = useAccess();
const writable = computed(() => canWrite('selection:write'));

const formDialog = ref<InstanceType<typeof SensorFormDialog>>();
const replaceDialog = ref<InstanceType<typeof SensorReplaceDialog>>();
const linkedPreview = ref<{
  file: SensorFileItem;
  kind: '3D' | '型录';
} | null>(null);
const page = ref(1);
const pageSize = ref(20);
const sort = ref<TableSortState | null>(null);

// 型号表格列数多、内容长，1440px 下仍要横向滚动才能看到「关联型录/3D」，
// 描述性列允许按需隐藏，选择记忆在本地。
const columnVisibility = useHiddenColumns(
  'selection:sensor-table:hidden-columns:v1',
  HIDEABLE_COLUMNS,
);
const hiddenColumns = columnVisibility.hidden;

const statusNames = computed(() =>
  [...store.dictionaryNames('sensor-status')].sort(
    (left, right) => sensorStatusRank(left) - sensorStatusRank(right),
  ),
);
const statusFilterOptions = computed(() => [
  { label: '全部', value: '全部' },
  ...statusNames.value.map((name) => ({ label: name, value: name })),
]);
const typeOptions = computed(() =>
  store
    .dictionaryNames('sensor-type')
    .map((name) => ({ label: name, value: name })),
);
const hasActiveFilters = computed(
  () =>
    status.value !== '全部' ||
    sensorTypes.value.length > 0 ||
    Boolean(query.value.trim()),
);

// 搜索时每一行都要取型录 / 3D 标题，用 Map 查找，避免每行线性扫描。
const sensorById = computed(
  () => new Map(store.sensors.map((item) => [item.id, item])),
);
const sopTitleById = computed(
  () => new Map(store.sensorSops.map((item) => [item.id, item.title])),
);
const model3dTitleById = computed(
  () => new Map(store.sensor3dFiles.map((item) => [item.id, item.title])),
);
const lookup: SensorLookup = {
  related(item) {
    const id = item.replacesId || item.replacedById;
    return id ? (sensorById.value.get(id) ?? null) : null;
  },
  sopTitle: (sopId) => (sopId ? sopTitleById.value.get(sopId) || '' : ''),
  model3dTitle: (model3dId) =>
    model3dId ? model3dTitleById.value.get(model3dId) || '' : '',
};
const relation = (item: SensorItem) => relationText(item, lookup.related(item));

const items = computed(() =>
  filterSensors(
    store.sensors,
    {
      status: status.value,
      sensorTypes: sensorTypes.value,
      query: query.value,
    },
    lookup,
  ),
);
// 排序必须发生在分页切片之前，否则只会把当前这一页重排。
const sortedItems = computed(() => sortRows(items.value, sort.value));
const tableData = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedItems.value.slice(start, start + pageSize.value);
});
const columns = computed(() =>
  sensorColumns({
    sort: sort.value,
    showDisabledDetails: isSensorStatus(status.value, 'disabled'),
    hidden: hiddenColumns.value,
    writable: writable.value,
  }),
);

watch([query, sensorTypes, status, pageSize, sort], () => {
  page.value = 1;
});
watch(
  () => [items.value.length, pageSize.value] as const,
  () => {
    const maxPage = Math.max(1, Math.ceil(items.value.length / pageSize.value));
    if (page.value > maxPage) page.value = maxPage;
  },
);

function resetFilters() {
  status.value = '全部';
  sensorTypes.value = [];
  query.value = '';
  page.value = 1;
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
    pageName: status.value,
    headers: exportColumns.map((column) => String(column.title)),
    rows: rows.map((item) =>
      exportColumns.map((column) =>
        exportCell(item, String(column.key), lookup),
      ),
    ),
  });
  message.success(`已导出 ${rows.length} 条 Sensor 型号`);
}

function editItem(item: SensorItem) {
  formDialog.value?.open(item);
}

async function deleteItem(item: SensorItem) {
  const ok = await confirmDelete('删除型号', `确认删除“${item.model}”吗？`);
  if (!ok) return;
  notifyResult(store.deleteSensor(item.id), '型号已删除');
}

function openLinked(kind: '3D' | '型录', id: null | number) {
  if (!id) return;
  const files = kind === '型录' ? store.sensorSops : store.sensor3dFiles;
  const file = files.find((item) => item.id === id);
  if (!file) {
    message.error(
      kind === '型录'
        ? '关联型录不存在或已被删除'
        : '关联 3D 文件不存在或已被删除',
    );
    return;
  }
  linkedPreview.value = { file, kind };
}

function openRelatedSensor(item: SensorItem) {
  const related = lookup.related(item);
  if (!related) return;
  status.value = '全部';
  query.value = related.model;
}

function showCurrent() {
  status.value = findSensorStatusName(statusNames.value, 'current') || '全部';
}
</script>

<template>
  <div class="selection-panel">
    <div class="selection-toolbar">
      <a-select
        v-model:value="status"
        class="selection-toolbar__filter"
        :options="statusFilterOptions"
        aria-label="状态筛选"
      />
      <a-select
        v-model:value="sensorTypes"
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
      <SensorColumnMenu
        :columns="HIDEABLE_COLUMNS"
        :hidden="hiddenColumns"
        @change="columnVisibility.setVisible"
      />
      <a-button aria-label="导出 Excel" @click="exportExcel">
        <Download :size="14" :stroke-width="1.5" aria-hidden="true" />
        导出 Excel
      </a-button>
      <a-button v-if="writable" type="primary" @click="formDialog?.open()">
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
            :title="`预览型录：${lookup.sopTitle(row.sopId)}`"
            @click="openLinked('型录', row.sopId)"
          >
            <template #icon><Eye :size="14" /></template>
            {{ lookup.sopTitle(row.sopId) }}
          </a-button>
          <span v-else>未关联</span>
        </template>
        <template v-else-if="column.key === 'model3d'">
          <a-button
            v-if="row.model3dId"
            class="sensor-file-link"
            type="link"
            size="small"
            :title="`预览 3D：${lookup.model3dTitle(row.model3dId)}`"
            @click="openLinked('3D', row.model3dId)"
          >
            <template #icon><Eye :size="14" /></template>
            {{ lookup.model3dTitle(row.model3dId) }}
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
            v-if="relation(row)"
            type="link"
            size="small"
            @click="openRelatedSensor(row)"
          >
            {{ relation(row) }}
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
                @click="replaceDialog?.open(row)"
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
      v-bind="PAGINATION_PROPS"
    />
    <SensorLinkedPreview v-model="linkedPreview" />
    <SensorFormDialog ref="formDialog" />
    <SensorReplaceDialog ref="replaceDialog" @replaced="showCurrent" />
  </div>
</template>

<style scoped src="./SensorModelsPanel.css"></style>
