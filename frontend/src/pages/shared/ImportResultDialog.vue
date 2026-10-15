<script setup lang="ts">
import type { TableColumnType } from 'ant-design-vue';
import { ref } from 'vue';

import { useResizableColumns } from '@/pages/shared/column-widths';
import { useTablePagination } from '@/pages/shared/table';

export interface ImportResultCategory {
  created: number;
  deleted: number;
  kept: number;
  skipped: number;
  title: string;
  unchangedReason?: string;
  updated: number;
}

export interface ImportResultSkip {
  location: string;
  reason: string;
}

export interface ImportResultPayload {
  categories: ImportResultCategory[];
  notes: string[];
  skips: ImportResultSkip[];
  summary?: string;
  title: string;
}

const openState = ref(false);
const payload = ref<ImportResultPayload>({
  categories: [],
  notes: [],
  skips: [],
  title: '导入结果',
});
const revision = ref(0);
const { pagination, onChange } = useTablePagination(
  () => payload.value.skips.length,
  [revision],
);

const baseColumns: TableColumnType<ImportResultSkip & { key: number }>[] = [
  { dataIndex: 'location', key: 'location', title: '位置', width: 220 },
  { dataIndex: 'reason', key: 'reason', title: '原因' },
];
const { columns, onResizeColumn } = useResizableColumns(
  'import-result',
  () => baseColumns,
);

function categoryLine(item: ImportResultCategory) {
  const kept =
    item.kept > 0
      ? `保留 ${item.kept}（仍被引用，未删除）`
      : `保留 ${item.kept}`;
  const line = [
    `新增 ${item.created}`,
    `更新 ${item.updated}`,
    `删除 ${item.deleted}`,
    kept,
    `跳过 ${item.skipped}`,
  ].join(' / ');
  return item.unchangedReason ? `${line} · ${item.unchangedReason}` : line;
}

function open(next: ImportResultPayload) {
  payload.value = next;
  revision.value += 1;
  openState.value = true;
}

defineExpose({ open });
</script>

<template>
  <a-modal
    :open="openState"
    :title="payload.title"
    :width="720"
    destroy-on-close
    @cancel="openState = false"
  >
    <div class="import-result">
      <p v-if="payload.summary" class="import-result__summary">
        {{ payload.summary }}
      </p>
      <ul v-if="payload.categories.length" class="import-result__categories">
        <li v-for="item in payload.categories" :key="item.title">
          {{ item.title }}：{{ categoryLine(item) }}
        </li>
      </ul>
      <ul v-if="payload.notes.length" class="import-result__notes">
        <li v-for="(note, index) in payload.notes" :key="`${note}-${index}`">
          {{ note }}
        </li>
      </ul>
      <a-table
        v-if="payload.skips.length"
        :columns="columns"
        :data-source="
          payload.skips.map((item, index) => ({ ...item, key: index }))
        "
        row-key="key"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        @resize-column="onResizeColumn"
        @change="onChange"
      />
    </div>
    <template #footer>
      <a-button type="primary" @click="openState = false">关闭</a-button>
    </template>
  </a-modal>
</template>

<style scoped src="./ImportResultDialog.css"></style>
